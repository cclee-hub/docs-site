---
title: Save 70% of Your AI Coding Plan Quota by Replacing ZhiPu Search with Tavily MCP
description: ZhiPu GLM coding plan's built-in web-search and web-reader MCP tools consume your coding conversation quota. Switch to Tavily MCP for free 1000 searches/month with zero impact on your coding budget.
date: 2026-03-31
tags: [MCP, Claude-Code, AI-Agent, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Do ZhiPu GLM coding plan's MCP search tools consume conversation quota?"
    a: "Yes. web-search-prime and web-reader are built-in MCP services that consume coding plan quota. Heavy search usage directly reduces your available coding conversation allowance."
  - q: "How to configure Tavily MCP in Claude Code?"
    a: "Run `claude mcp add tavily-search -s user -- npx -y tavily-mcp@latest`, then set the TAVILY_API_KEY environment variable. Free tier includes 1000 calls/month."
  - q: "Can I still search and read web pages after switching?"
    a: "Yes. Tavily provides both search and web page extraction, fully covering the functionality of ZhiPu's web-search + web-reader combo."
---

When using [ZhiPu GLM Coding Plan](https://www.bigmodel.cn/glm-coding?ic=BCT362LRE2) with Claude Code, I noticed my monthly quota draining faster than expected. The culprit? Built-in MCP tools — `web-search-prime` and `web-reader` — were consuming coding conversation quota for every web search and page fetch.

## TL;DR

Replace ZhiPu's built-in `web-search-prime` and `web-reader` MCP services with Tavily MCP. Result: **free 1000 searches/month** with zero impact on coding quota.


<!-- truncate -->
## The Problem: Every Search Costs Quota

ZhiPu GLM Coding Plan includes several built-in MCP services:

```
web-search-prime   → web search (consumes quota)
web-reader         → web page reading (consumes quota)
zread              → GitHub repo reading (consumes quota)
```

In my case, searching WooCommerce documentation, reading API pages, and checking marketplace standards during theme development consumed roughly **30% of my monthly MCP quota** in just a few days.

![MCP usage over one week showing search and reader consuming most calls](/images/blog/tavily-replace-zhipu-mcp-usage.png)

The 16% / 30% usage shown above was reached in less than a week, with web search being the primary consumer.

## Solution: Tavily MCP

Tavily provides a free tier with **1000 API calls/month**, completely independent of your coding plan quota.

### Step 1: Get Tavily API Key

Register at [tavily.com](https://tavily.com), free tier includes 1000 calls/month.

### Step 2: Add Tavily MCP to Claude Code

```bash
claude mcp add tavily-search -s user -- npx -y tavily-mcp@latest
```

### Step 3: Configure API Key

Edit `~/.claude.json`, find the `tavily-search` entry and add the environment variable:

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

### Step 4: Remove ZhiPu's search services

```bash
claude mcp remove web-search-prime -s user
claude mcp remove web-reader -s user
```

Also clean up `settings.json` permissions — remove `mcp__web-search-prime__*` and `mcp__web-reader__*` from the `allow` list, add `mcp__tavily-search__*` instead.

### Step 5: Verify

```bash
claude mcp list
# Should show: tavily-search: npx -y tavily-mcp@latest - Connected
# Should NOT show: web-search-prime, web-reader
```

## Comparison

| Feature | ZhiPu Built-in | Tavily MCP |
|---------|---------------|------------|
| Cost | Consumes coding plan quota | Free 1000 calls/month |
| Search quality | Optimized for Chinese | Balanced for EN/CN |
| Page extraction | Separate tool | Built-in extract |
| Configuration | Platform-injected, can't disable | One `claude mcp add` command |
| After free tier | Squeezes coding conversation budget | Pay-as-you-go continues |

## Notes

<InfoBox variant="warning" title="Important Notes">

1. **ZhiPu services are platform-injected** — they may reappear after restart even after removal. Add them to `settings.json` deny list to block permanently.
2. **Keep `zread`** (GitHub repo reading) — low consumption and unique functionality.
3. **Keep `doubao-vision`** (image analysis) — Tavily doesn't cover this scenario.

</InfoBox>

## Recommendation

<div className="my-8 p-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-center">
  <div className="text-lg font-semibold mb-3">Also using ZhiPu GLM Coding Plan?</div>
  <a href="https://www.bigmodel.cn/glm-coding?ic=BCT362LRE2"
     className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">
    Learn More About ZhiPu GLM Coding Plan
  </a>
</div>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Contact Us</a>
</div>
