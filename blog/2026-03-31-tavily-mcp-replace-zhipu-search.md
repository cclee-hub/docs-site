---
title: 用 Tavily MCP 替代智谱搜索，节省 70% 编码套餐额度
description: 智谱 GLM 编码套餐的 web-search 和 web-reader MCP 工具消耗对话额度，用 Tavily MCP 替代后每月省下上千次搜索额度，零成本完成联网搜索和网页读取。
date: 2026-03-31
tags: [MCP, Claude-Code, AI-Agent, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "智谱 GLM 编码套餐的 MCP 搜索消耗对话额度吗？"
    a: "是的。web-search-prime 和 web-reader 是智谱内置 MCP 服务，每次调用消耗编码套餐额度，搜索多了会挤占正常编码对话的用量。"
  - q: "Tavily MCP 怎么配置到 Claude Code？"
    a: "运行 `claude mcp add tavily-search -s user -- npx -y tavily-mcp@latest`，再配置 TAVILY_API_KEY 环境变量即可。免费 1000 次/月。"
  - q: "替换后联网搜索和网页读取还能用吗？"
    a: "能。Tavily 同时提供搜索和网页提取功能，覆盖智谱 web-search + web-reader 的全部场景。"
---

在使用 [智谱 GLM 编码套餐](https://www.bigmodel.cn/glm-coding?ic=BCT362LRE2) 进行日常开发时，发现一个容易被忽视的额度消耗问题：**智谱内置的 MCP 联网搜索和网页读取工具，每次调用都消耗编码套餐额度**。本文记录排查过程和用 Tavily MCP 替代的方案。

## TL;DR

智谱 GLM 编码套餐内置 `web-search-prime` 和 `web-reader` 两个 MCP 服务，每次搜索/读取消耗对话额度。替换为 Tavily MCP 后，联网搜索使用独立免费额度（1000 次/月），不再挤占编码对话用量。


<!-- truncate -->
## 问题现象

在一次 WooCommerce 主题上架开发中，频繁使用联网搜索查文档、读网页。开发完成后查看额度：

![智谱编码套餐额度使用情况](/images/blog/tavily-replace-zhipu-quota.png)

5 小时周期内已用 16%，主要消耗来自 MCP 工具调用而非编码对话本身。

查看 MCP 调用统计更直观：

![MCP 工具调用量统计](/images/blog/tavily-replace-zhipu-mcp-usage.png)

网页搜索和网页读取占了 MCP 调用的大部分。这些调用完全可以不消耗编码套餐额度。

## 根因

智谱 GLM 编码套餐通过 `open.bigmodel.cn` 的 MCP 端点提供联网能力：

```
web-search-prime: https://open.bigmodel.cn/api/mcp/web_search_prime/mcp
web-reader:       https://open.bigmodel.cn/api/mcp/web_reader/mcp
zread:            https://open.bigmodel.cn/api/mcp/zread/mcp
```

这些是 HTTP 类型的 MCP 服务，每次调用经过智谱 API 网关，**按编码套餐额度计费**。而联网搜索本质上是通用能力，不应该消耗 AI 编码额度。

## 解决方案：用 Tavily MCP 替代

Tavily 提供独立的免费额度（1000 次/月），搜索和网页提取能力完整覆盖智谱的两个工具。

### Step 1：移除智谱搜索/读取服务

```bash
claude mcp remove web-reader -s user
claude mcp remove web-search-prime -s user
```

### Step 2：添加 Tavily MCP

```bash
claude mcp add tavily-search -s user -- npx -y tavily-mcp@latest
```

### Step 3：配置 API Key

在 `~/.claude.json` 中补充环境变量：

```json
{
  "mcpServers": {
    "tavily-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "tvly-your-key-here"
      }
    }
  }
}
```

Tavily API Key 在 [tavily.com](https://tavily.com) 注册即可获取，免费额度 1000 次/月。

### Step 4：清理残留配置

移除服务后，`settings.json` 中的权限引用也要清理：

```json
// 删除 deny 中的智谱搜索引用
"deny": ["mcp__web-search-prime__web_search_prime"]  // 删掉

// 删除 allow 中的 web-reader 引用
"mcp__web-reader__webReader"  // 删掉
```

## 替换前后对比

| 维度 | 智谱 web-search + web-reader | Tavily |
|------|------------------------------|--------|
| 计费方式 | 消耗编码套餐额度 | 独立免费额度 1000 次/月 |
| 搜索质量 | 中文优化 | 中英文均衡 |
| 网页提取 | 独立工具 | 内置 extract 功能 |
| 配置方式 | 平台内置，无法关闭 | `claude mcp add` 一行命令 |
| 超出后 | 挤占编码对话额度 | 付费继续使用 |

## 注意事项

<InfoBox variant="warning" title="注意事项">

1. **智谱服务是平台内置的**，即使移除本地配置，重启后可能自动恢复。需要在 `settings.json` 的 `deny` 列表中明确屏蔽
2. **保留 `zread`**（GitHub 仓库阅读），这个工具消耗较少且功能独特
3. **保留 `doubao-vision`**（图像分析），Tavily 不覆盖这个场景

</InfoBox>

## 推荐

<div className="my-8 p-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-center">
  <div className="text-lg font-semibold mb-3">也在用智谱 GLM 编码套餐？</div>
  <a href="https://www.bigmodel.cn/glm-coding?ic=BCT362LRE2"
     className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">
    了解智谱 GLM 编码套餐
  </a>
</div>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
