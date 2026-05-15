---
title: Build a Custom MCP Toolkit with Python FastMCP to Connect Any AI Model
description: Build a custom MCP Server with Python FastMCP to flexibly connect Doubao, DeepSeek, Qwen, and other models based on cost and scenario for image analysis, text generation, TTS, and more.
date: 2026-03-28
tags: [MCP, Python, AI-Agent, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What's the difference between an MCP Server and calling an API directly?"
    a: "An MCP Server wraps API calls into standard tools that AI clients (Claude Code, Cursor, etc.) automatically discover and invoke, without manual prompt templates or integration code."
  - q: "Why build my own instead of using existing MCP Servers?"
    a: "Custom servers let you choose models by cost (cheap models for simple tasks), combine capabilities by scenario, avoid provider lock-in, and wrap internal APIs as AI-callable tools."
  - q: "How does FastMCP differ from the raw MCP SDK?"
    a: "FastMCP is a high-level wrapper around the official MCP Python SDK. It uses decorators to define tools, auto-handles JSON-RPC protocol, reducing code by 60%+."
---

While building AI Agent systems for clients, we found that different tasks require vastly different model capabilities and costs: vision models for image analysis, lightweight models for text completion, and local models for internal data queries. MCP (Model Context Protocol) turns each capability into an independent tool that AI clients invoke on demand.

## TL;DR

Build a custom MCP Server in 30 minutes with Python FastMCP, connecting any OpenAI-compatible API based on scenario and cost. This article demonstrates the full workflow using the Doubao vision model, with extension templates for text generation, image generation, TTS, and more.


<!-- truncate -->
## What Problem Does MCP Solve?

MCP (Model Context Protocol) is an open protocol proposed by Anthropic that standardizes communication between AI applications and external tools. Think of it as USB-C: regardless of the device, plug it in and it works.

Traditionally, integrating each AI capability requires writing custom integration code. MCP standardizes this process:

```
AI Client (Claude Code / Cursor / Cherry Studio)
    ↓ MCP Protocol (stdio / SSE)
MCP Server (your toolkit)
    ↓ HTTP API
Various AI Models / Internal APIs
```

**One MCP Server can expose multiple tools**, each backed by a different model or API.

## Why Python over Node.js?

The MCP official SDK supports both Python and TypeScript. Both are functionally equivalent, so the choice depends on your context:

| Dimension | Python (FastMCP) | Node.js (@modelcontextprotocol/sdk) |
|-----------|-------------------|-------------------------------------|
| AI Ecosystem | httpx/OpenAI SDK native support | Additional dependencies needed |
| Code Volume | One-line decorator to define a tool | Manual schema registration required |
| Binary Handling | base64/PIL is concise | Buffer API slightly more verbose |
| Data Science | pandas/numpy readily available | Needs separate toolchain |
| Deployment | venv isolation, no Node version issues | Node version compatibility is a common pain point |

**Bottom line**: MCP Server's job is "call APIs + process data." Python is more concise and intuitive for HTTP calls, image/file handling, and data transformations, with fewer dependencies. Node.js is a better fit for teams already invested in TypeScript.

## 30-Minute Build: Image Analysis Tool

### Setup

```bash
mkdir -p ~/.claude/mcp-servers/doubao-vision
cd ~/.claude/mcp-servers/doubao-vision
python3 -m venv venv
source venv/bin/activate
pip install mcp httpx
```

### Server Code

```python
"""Doubao Vision MCP Server - OpenAI-compatible image analysis via Volcengine Ark."""

import base64
import os
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

# Config - inject via environment variables, never hardcode
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

Key design decisions:
- **`_build_image_content`**: Unified handling for remote URLs and local files (auto base64 encoding)
- **`@mcp.tool()` decorator**: Function signatures and docstrings auto-generate MCP tool descriptions; AI clients discover parameters automatically
- **Environment variable config**: API keys are never hardcoded; injected via `.mcp.json` `env` field

### Register with Client

Add to `~/.claude/.mcp.json` (global) or project-level `.mcp.json`:

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

## Extend on Demand: Multi-Scenario Toolkit

One MCP Server can register multiple tools, each using a different model. Here are templates for various scenarios:

### Text Generation / Completion

```python
@mcp.tool()
def generate_text(prompt: str, model: str = "deepseek-chat") -> str:
    """Generate text using specified model. Supports deepseek-chat, qwen-turbo, etc."""
    providers = {
        "deepseek-chat": {"base": "https://api.deepseek.com/v1", "key": os.getenv("DEEPSEEK_API_KEY")},
        "qwen-turbo": {"base": "https://dashscope.aliyuncs.com/compatible-mode/v1", "key": os.getenv("QWEN_API_KEY")},
    }
    cfg = providers.get(model)
    if not cfg:
        return f"Unknown model: {model}"
    # Call OpenAI-compatible endpoint...
```

### Image Generation

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
    img_bytes = base64.b64decode(data["images"][0])
    path = f"/tmp/mcp-gen-{hash(prompt)}.png"
    Path(path).write_bytes(img_bytes)
    return f"Image saved to: {path}"
```

### Text-to-Speech (TTS)

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

### Internal API Wrapper

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

## Cost Optimization: Multi-Model Routing

Using different cost-level models for different tasks is the core value of a custom toolkit:

| Task Type | Recommended Model | Cost Level |
|-----------|-------------------|------------|
| Simple classification/extraction | Qwen-Turbo / Ollama local | Very low |
| Copywriting/translation | DeepSeek-Chat | Low |
| Image analysis | Doubao Vision Pro | Medium |
| Complex reasoning | Claude / GPT-4 | High |

Implement routing in your MCP Server:

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
    # Unified OpenAI-compatible call...
```

## Best Practices

1. **API Key Security**: Inject via environment variables; never hardcode in source or commit to git
2. **Timeout Control**: Set 120s+ for slow tasks (image generation), 10-30s for simple text tasks
3. **Error Handling**: Return clear error messages; AI clients display them to users
4. **Sandbox Limits**: Restrict scope when wrapping internal APIs (e.g., SQL SELECT only)
5. **Concurrency**: Synchronous httpx calls are fine; MCP protocol itself is serial

## Extensibility: Not Just Tools, but AI Infrastructure

The examples above cover a single MCP Server. In production, extensibility goes much further:

### Multi-Server Composition

Split different capabilities into independent servers, load on demand:

```json
{
  "mcpServers": {
    "doubao-vision": { "command": "python", "args": ["vision.py"] },
    "deepseek-text": { "command": "python", "args": ["text.py"] },
    "internal-api":  { "command": "python", "args": ["api.py"] }
  }
}
```

Benefit: one server crashing doesn't affect others; different team members maintain different servers.

### Shared Configuration

Multiple servers reuse the same provider config via a shared Python module:

```python
# providers.py - centralized API config management
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

### MCP Resources and Prompts

MCP isn't just about Tools. It also supports Resources (static data) and Prompts (preset templates):

```python
# Resources: let AI read your internal docs
@mcp.resource("docs://api-spec")
def get_api_spec() -> str:
    return Path("openapi.yaml").read_text()

# Prompts: preset common analysis templates
@mcp.prompt()
def code_review_prompt(code: str) -> str:
    return f"Review this code for security issues and performance:\n\n{code}"
```

### From Local to Remote Deployment

stdio transport works for local development. For production, switch to SSE transport and deploy as an HTTP service:

```python
# Local development
mcp.run(transport="stdio")

# Production deployment (remote AI clients access via HTTP)
mcp.run(transport="sse", host="0.0.0.0", port=8080)
```

### Advanced Directions

| Direction | Description |
|-----------|-------------|
| **Caching Layer** | Cache identical requests to reduce API costs |
| **Rate Limiting** | Limit call frequency per user or tool |
| **Audit Logging** | Log every tool call's input/output for debugging and compliance |
| **Streaming** | Use SSE streaming for long text generation to reduce wait time |
| **Tool Pipelines** | Chain one tool's output as another's input |

---

**Interested in similar solutions? [Get in touch](/about)**
