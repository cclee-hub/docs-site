---
title: 用 Python FastMCP 搭建自定义 MCP 工具库，按需接入任意 AI 模型
description: 通过 Python FastMCP 构建自定义 MCP Server，按成本和场景灵活接入豆包、DeepSeek、Qwen 等模型，实现图像分析、文本生成、语音合成等能力。
date: 2026-03-28
tags: [MCP, Python, AI-Agent, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "MCP Server 和直接调 API 有什么区别？"
    a: "MCP Server 把 API 调用封装成标准工具，AI 客户端（Claude Code、Cursor 等）自动发现并调用，无需手写 prompt 模板或集成代码。"
  - q: "为什么要自建而不是用现成的 MCP Server？"
    a: "自建可以按成本选模型（简单任务用便宜模型）、按场景组合能力、避免 provider 锁定，还能包装内部 API 为 AI 可调用的工具。"
  - q: "FastMCP 和原生 MCP SDK 有什么区别？"
    a: "FastMCP 是 MCP 官方 Python SDK 的高层封装，用装饰器定义工具，自动处理 JSON-RPC 协议，代码量减少 60% 以上。"
---

在为客户构建 AI Agent 系统时，我们发现不同任务对模型能力和成本的需求差异很大：图像分析用视觉模型、文本补全用轻量模型、内部数据查询用本地模型。MCP（Model Context Protocol）让每个能力变成独立的工具，AI 客户端按需调用。

## TL;DR

用 Python FastMCP 30 分钟搭建自定义 MCP Server，按场景和成本接入任意 OpenAI 兼容 API。本文以豆包视觉模型为例演示完整流程，并提供文本生成、图像生成、语音合成等场景的扩展模板。


<!-- truncate -->
## MCP 解决什么问题

MCP（Model Context Protocol）是 Anthropic 提出的开放协议，标准化了 AI 应用与外部工具的通信方式。类比 USB-C：不管什么设备，插上就能用。

传统方式下，每接入一个 AI 能力就要写一套集成代码。MCP 把这个过程标准化：

```
AI 客户端 (Claude Code / Cursor / Cherry Studio)
    ↓ MCP 协议 (stdio / SSE)
MCP Server (你的工具库)
    ↓ HTTP API
各类 AI 模型 / 内部 API
```

**一个 MCP Server 可以暴露多个工具**，每个工具背后可以是不同的模型或 API。

## 为什么选 Python 而非 Node.js

MCP 官方同时提供 Python 和 TypeScript SDK。两者功能等价，选择依据：

| 维度 | Python (FastMCP) | Node.js (@modelcontextprotocol/sdk) |
|------|-------------------|-------------------------------------|
| AI 生态 | httpx/OpenAI SDK 原生支持 | 需要额外依赖 |
| 代码量 | 装饰器一行定义工具 | 需手动注册 schema |
| 二进制处理 | base64/PIL 原生简洁 | Buffer API 稍繁琐 |
| 数据科学 | pandas/numpy 随手可用 | 需额外工具链 |
| 部署环境 | venv 隔离，无 Node 版本问题 | Node 版本兼容性常见坑 |

**核心原因**：MCP Server 的本质是「调 API + 处理数据」。Python 在 HTTP 调用、图像/文件处理、数据转换上的代码更简洁直观，依赖更少。Node.js 更适合已有 TypeScript 项目的团队。

## 30 分钟搭建：图像分析工具

### 环境准备

```bash
mkdir -p ~/.claude/mcp-servers/doubao-vision
cd ~/.claude/mcp-servers/doubao-vision
python3 -m venv venv
source venv/bin/activate
pip install mcp httpx
```

### Server 代码

```python
"""Doubao Vision MCP Server - OpenAI-compatible image analysis via Volcengine Ark."""

import base64
import os
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

# Config - 通过环境变量注入，不硬编码
BASE_URL = os.getenv("DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
API_KEY = os.getenv("DOUBAO_API_KEY", "")
MODEL = os.getenv("DOUBAO_MODEL", "doubao-1-5-vision-pro-32k-250115")

mcp = FastMCP("doubao-vision")


def _build_image_content(image_source: str) -> dict:
    """Build image content part from URL or local file path."""
    if image_source.startswith(("http://", "https://")):
        return {"type": "image_url", "image_url": {"url": image_source}}
    # Local file: encode to base64 data URI
    path = Path(image_source)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_source}")
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif",
        ".webp": "image/webp",
    }
    mime = mime_map.get(path.suffix.lower(), "image/png")
    data = base64.b64encode(path.read_bytes()).decode()
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{data}"},
    }


@mcp.tool()
def analyze_image(image_source: str, prompt: str) -> str:
    """Analyze an image using Doubao Vision Pro model.

    Supports remote URLs and local file paths.

    Args:
        image_source: URL or local file path to the image.
        prompt: What to analyze or describe about the image.
    """
    try:
        image_content = _build_image_content(image_source)
    except FileNotFoundError as e:
        return f"Error: {e}"

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                image_content,
            ],
        }
    ]

    resp = httpx.post(
        f"{BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": messages,
            "max_tokens": 4096,
        },
        timeout=60,
    )

    if resp.status_code != 200:
        return f"API error {resp.status_code}: {resp.text}"

    data = resp.json()
    return data["choices"][0]["message"]["content"]


if __name__ == "__main__":
    mcp.run(transport="stdio")
```

核心设计：
- **`_build_image_content`**：统一处理远程 URL 和本地文件（自动 base64 编码）
- **`@mcp.tool()` 装饰器**：函数签名和 docstring 自动生成 MCP 工具描述，AI 客户端自动发现参数
- **环境变量配置**：API Key 不硬编码，通过 `.mcp.json` 的 `env` 注入

### 注册到客户端

在 `~/.claude/.mcp.json`（全局）或项目 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "doubao-vision": {
      "command": "/path/to/venv/bin/python",
      "args": ["/path/to/server.py"],
      "env": {
        "DOUBAO_API_KEY": "your-api-key",
        "DOUBAO_MODEL": "doubao-1-5-vision-pro-32k-250115",
        "DOUBAO_BASE_URL": "https://ark.cn-beijing.volces.com/api/v3"
      }
    }
  }
}
```

## 按需扩展：多场景工具库

一个 MCP Server 可以注册多个工具，每个工具用不同模型。以下是各场景模板：

### 文本生成 / 补全

```python
@mcp.tool()
def generate_text(prompt: str, model: str = "deepseek-chat") -> str:
    """Generate text using specified model. Supports deepseek-chat, qwen-turbo, etc."""
    # 复用同一个 OpenAI 兼容接口，切换 base_url 和 model
    providers = {
        "deepseek-chat": {"base": "https://api.deepseek.com/v1", "key": os.getenv("DEEPSEEK_API_KEY")},
        "qwen-turbo": {"base": "https://dashscope.aliyuncs.com/compatible-mode/v1", "key": os.getenv("QWEN_API_KEY")},
    }
    cfg = providers.get(model)
    if not cfg:
        return f"Unknown model: {model}"
    # 调用 OpenAI 兼容接口...
```

### 图像生成

```python
@mcp.tool()
def generate_image(prompt: str, size: str = "1024x1024") -> str:
    """Generate image from text prompt using Stable Diffusion WebUI API."""
    resp = httpx.post(
        "http://localhost:7860/sdapi/v1/txt2img",
        json={"prompt": prompt, "width": 1024, "height": 1024},
        timeout=120,
    )
    data = resp.json()
    # 保存 base64 图片到文件并返回路径
    img_bytes = base64.b64decode(data["images"][0])
    path = f"/tmp/mcp-gen-{hash(prompt)}.png"
    Path(path).write_bytes(img_bytes)
    return f"Image saved to: {path}"
```

### 语音合成 (TTS)

```python
@mcp.tool()
def text_to_speech(text: str, voice: str = "default") -> str:
    """Convert text to speech audio file."""
    resp = httpx.post(
        "https://openspeech.bytedance.com/api/v1/tts",
        headers={"Authorization": f"Bearer;{os.getenv('TTS_API_KEY')}"},
        json={"text": text, "voice": voice, "format": "mp3"},
        timeout=30,
    )
    path = f"/tmp/mcp-tts-{hash(text)}.mp3"
    Path(path).write_bytes(resp.content)
    return f"Audio saved to: {path}"
```

### 内部 API 包装

```python
@mcp.tool()
def query_database(sql: str) -> str:
    """Execute read-only SQL query on internal database. SELECT only."""
    if not sql.strip().upper().startswith("SELECT"):
        return "Error: Only SELECT queries are allowed."
    resp = httpx.post(
        "http://internal-api.company.com/query",
        json={"sql": sql},
        headers={"Authorization": f"Bearer {os.getenv('INTERNAL_API_KEY')}"},
        timeout=10,
    )
    return resp.json()["result"]
```

## 成本优化：多模型路由

不同任务用不同成本的模型，是自建工具库的核心价值：

| 任务类型 | 推荐模型 | 成本级别 |
|----------|----------|---------|
| 简单分类/提取 | Qwen-Turbo / Ollama 本地 | 极低 |
| 文案/翻译 | DeepSeek-Chat | 低 |
| 图像分析 | 豆包 Vision Pro | 中 |
| 复杂推理 | Claude / GPT-4 | 高 |

在 MCP Server 中实现路由：

```python
@mcp.tool()
def smart_query(task: str, content: str) -> str:
    """Route task to optimal model based on complexity."""
    route = {
        "classify": ("qwen-turbo", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        "analyze_image": ("doubao-1-5-vision-pro-32k-250115", "https://ark.cn-beijing.volces.com/api/v3"),
        "deep_reason": ("deepseek-reasoner", "https://api.deepseek.com/v1"),
    }
    model, base = route.get(task, route["classify"])
    # 统一调用 OpenAI 兼容接口...
```

## 注意事项

1. **API Key 安全**：通过环境变量注入，禁止硬编码在代码中，更不要提交到 git
2. **超时控制**：图像生成等慢任务设 120s+，简单文本任务 10-30s
3. **错误处理**：返回清晰的错误信息，AI 客户端会将其展示给用户
4. **沙箱限制**：包装内部 API 时，限制操作范围（如 SQL 只允许 SELECT）
5. **并发考虑**：httpx 同步调用即可，MCP 协议本身是串行的

## 扩展性：不只是工具，是 AI 基础设施

上述示例只覆盖了单个 MCP Server 的场景。实际生产中，扩展性远不止于此：

### 多 Server 组合

不同能力拆成独立 Server，按需加载：

```json
{
  "mcpServers": {
    "doubao-vision": { "command": "python", "args": ["vision.py"] },
    "deepseek-text": { "command": "python", "args": ["text.py"] },
    "internal-api":  { "command": "python", "args": ["api.py"] }
  }
}
```

好处：一个 Server 挂了不影响其他；不同团队成员维护不同 Server。

### 共享配置抽取

多个 Server 复用同一套 provider 配置，用 Python module 共享：

```python
# providers.py - 统一管理所有 API 配置
PROVIDERS = {
    "doubao": {
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "api_key_env": "DOUBAO_API_KEY",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key_env": "DEEPSEEK_API_KEY",
    },
}
```

### 支持 MCP Resources 和 Prompts

MCP 不只有 Tools，还有 Resources（静态数据）和 Prompts（预设提示词）：

```python
# Resources: 让 AI 读取你的内部文档
@mcp.resource("docs://api-spec")
def get_api_spec() -> str:
    return Path("openapi.yaml").read_text()

# Prompts: 预设常用分析模板
@mcp.prompt()
def code_review_prompt(code: str) -> str:
    return f"Review this code for security issues and performance:\n\n{code}"
```

### 从本地到远程部署

stdio 传输适合本地开发。生产环境可切换到 SSE 传输，部署为 HTTP 服务：

```python
# 本地开发
mcp.run(transport="stdio")

# 生产部署（远程 AI 客户端通过 HTTP 访问）
mcp.run(transport="sse", host="0.0.0.0", port=8080)
```

### 进阶方向

| 方向 | 说明 |
|------|------|
| **缓存层** | 相同请求缓存结果，降低 API 调用成本 |
| **限流/配额** | 按用户或工具限制调用频率 |
| **审计日志** | 记录每次工具调用的输入输出，用于调试和合规 |
| **流式响应** | 对长文本生成使用 SSE streaming，减少用户等待 |
| **工具组合** | 一个工具的输出作为另一个的输入，构建 pipeline |

---

**对类似需求感兴趣？[联系合作](/about)**
