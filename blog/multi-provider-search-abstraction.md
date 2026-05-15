---
title: 用抽象类统一多搜索 API，错误返回而非抛异常
description: 适配 Tavily、Serper、Brave、Bing 四种搜索 API，用抽象类统一接口，错误时返回结果对象而非抛异常，确保 AI Agent 对话不中断。
date: 2026-03-19
tags: [FastAPI, Python, httpx, ai-agent]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "如何让 AI Agent 的搜索功能支持多个 API 提供商？"
    a: "定义抽象基类统一接口，每个提供商实现具体逻辑，调用方只需依赖抽象。"
  - q: "为什么 API 调用错误时不应该抛异常？"
    a: "AI Agent 对话是流式流程，异常会中断整个对话。返回错误信息让 Agent 决定如何处理。"
  - q: "不同搜索 API 的响应结构不同怎么办？"
    a: "用 Pydantic 模型定义统一输出格式，每个提供商在实现中做字段映射。"
---

在为客户构建 AI Agent 平台时遇到此问题：需要支持多个搜索提供商（Tavily、Serper、Brave、Bing），同时确保工具调用失败时不会中断 Agent 对话流程。

## TL;DR

1. 定义 `SearchProvider` 抽象基类 + `SearchResult` 数据模型，统一接口和输出格式
2. 每个提供商继承基类，实现 `search()` 方法，内部做响应字段映射
3. **关键设计**：错误时返回包含错误信息的 `SearchResult` 对象，而非抛异常


<!-- truncate -->
## 问题现象

直接调用不同搜索 API 的问题：

```python
# Tavily: POST 请求，results[].url
response = await client.post("https://api.tavily.com/search", ...)

# Serper: POST 请求，organic[].link
response = await client.post("https://google.serper.dev/search", ...)

# Brave: GET 请求，web.results[].description
response = await client.get("https://api.search.brave.com/res/v1/web/search", ...)

# Bing: GET 请求，webPages.value[].snippet
response = await client.get("https://api.bing.microsoft.com/v7.0/search", ...)
```

**问题**：
1. 请求方式、认证头、响应结构各不相同
2. 切换提供商需要改调用方代码
3. `raise Exception` 会中断 AI Agent 的流式对话

## 根因

1. **缺少抽象层**：调用方直接依赖具体实现，违反依赖倒置原则
2. **错误处理策略不统一**：异常会沿调用栈向上传播，在流式场景下导致整个对话中断

对于 AI Agent 工具调用场景，Agent 需要根据错误信息决定是否重试、换用其他工具、或向用户说明情况——而不是直接崩溃。

## 解决方案

### 1. 定义抽象基类和数据模型

```python
# base.py
from abc import ABC, abstractmethod
from typing import List
from pydantic import BaseModel


class SearchResult(BaseModel):
    """Unified search result."""
    title: str
    link: str
    snippet: str


class SearchProvider(ABC):
    """Base class for search providers."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    @abstractmethod
    async def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """Execute search and return results."""
        pass
```

### 2. 实现具体提供商

**Tavily**（AI 优化搜索，支持 rate limit / quota 错误码）：

```python
# tavily.py
import httpx
import logging
from typing import List
from .base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)


class TavilySearch(SearchProvider):
    """Tavily Search API implementation."""

    async def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "query": query,
                        "max_results": max_results,
                        "search_depth": "basic"
                    }
                )

                # 错误时返回 SearchResult，而非 raise
                if response.status_code == 429:
                    return [SearchResult(
                        title="Rate Limited",
                        link="",
                        snippet="Search quota exceeded. Please try again later."
                    )]

                if response.status_code == 401:
                    return [SearchResult(
                        title="Auth Error",
                        link="",
                        snippet="Search API key is invalid."
                    )]

                if response.status_code == 402:
                    return [SearchResult(
                        title="Quota Exceeded",
                        link="",
                        snippet="Monthly search quota depleted."
                    )]

                response.raise_for_status()
                data = response.json()

            # 字段映射：Tavily 的 url -> 统一的 link
            results = []
            for item in data.get("results", [])[:max_results]:
                results.append(SearchResult(
                    title=item.get("title", ""),
                    link=item.get("url", ""),
                    snippet=item.get("content", "")
                ))
            return results

        except httpx.TimeoutException:
            logger.warning(f"Tavily API timeout: {query[:50]}")
            return [SearchResult(title="Timeout", link="", snippet="Search timed out.")]
        except Exception as e:
            logger.error(f"Tavily search error: {e}")
            return [SearchResult(title="Error", link="", snippet=f"Search failed: {str(e)}")]
```

**Serper**（Google Search API）：

```python
# serper.py
class SerperSearch(SearchProvider):
    """Serper (Google Search) API implementation."""

    async def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": self.api_key, "Content-Type": "application/json"},
                    json={"q": query, "num": max_results}
                )

                if response.status_code == 401:
                    return [SearchResult(title="Auth Error", link="", snippet="Serper API key is invalid.")]

                response.raise_for_status()
                data = response.json()

            # 字段映射：Serper 的 organic[].link -> 统一的 link
            results = []
            for item in data.get("organic", [])[:max_results]:
                results.append(SearchResult(
                    title=item.get("title", ""),
                    link=item.get("link", ""),
                    snippet=item.get("snippet", "")
                ))
            return results

        except httpx.TimeoutException:
            return [SearchResult(title="Timeout", link="", snippet="Search timed out.")]
        except Exception as e:
            return [SearchResult(title="Error", link="", snippet=f"Search failed: {str(e)}")]
```

**Brave** 和 **Bing** 实现类似，区别在于请求方式和响应字段映射。

### 3. 调用方使用

```python
# 使用时只需依赖抽象
async def execute_search(provider: SearchProvider, query: str) -> List[SearchResult]:
    results = await provider.search(query)

    # 检查是否有错误（通过 title 或 snippet 判断）
    if results and not results[0].link:
        error_msg = results[0].snippet
        # Agent 可以根据错误信息决定下一步操作
        return f"Search failed: {error_msg}"

    return results


# 切换提供商只需换实例
provider = TavilySearch(api_key="xxx")
# provider = SerperSearch(api_key="xxx")
results = await execute_search(provider, "Python async best practices")
```

### 关键设计决策

| 决策 | 原因 |
|------|------|
| 错误返回 `SearchResult` 而非 `raise` | AI Agent 对话是流式流程，异常会中断整个对话 |
| 用 Pydantic `BaseModel` 定义输出 | 自动校验 + IDE 提示 + JSON 序列化 |
| 抽象类用 `ABC` 而非 `Protocol` | 需要共享 `__init__` 逻辑（api_key 存储）|
| 超时统一 15 秒 | 搜索是用户体验关键路径，不能太慢 |

---
**对类似需求感兴趣？[联系合作](/about)**
