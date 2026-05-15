---
title: Unify Multiple Search APIs with Abstract Class, Return Errors Instead of Raising
description: Adapt Tavily, Serper, Brave, Bing search APIs with a unified abstract class interface. Return error results instead of raising exceptions to keep AI Agent conversations flowing.
date: 2026-03-19
tags: [FastAPI, Python, httpx, ai-agent]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to support multiple search API providers in an AI Agent?"
    a: "Define an abstract base class for the interface, implement provider-specific logic in subclasses, and depend on the abstraction in calling code."
  - q: "Why shouldn't API calls raise exceptions on errors?"
    a: "AI Agent conversations are streaming flows. Exceptions interrupt the entire conversation. Return error info and let the Agent decide how to handle it."
  - q: "How to handle different response structures from search APIs?"
    a: "Define a unified output format with Pydantic models, and map fields in each provider's implementation."
---

Encountered this issue while building an AI Agent platform for a client: needed to support multiple search providers (Tavily, Serper, Brave, Bing) while ensuring tool call failures don't interrupt the Agent's conversation flow.

## TL;DR

1. Define `SearchProvider` abstract base class + `SearchResult` data model for unified interface and output
2. Each provider inherits the base class, implements `search()` method with field mapping
3. **Key design**: Return `SearchResult` with error info on failure, never raise exceptions


<!-- truncate -->
## The Problem

Direct calls to different search APIs look like this:

```python
# Tavily: POST request, results[].url
response = await client.post("https://api.tavily.com/search", ...)

# Serper: POST request, organic[].link
response = await client.post("https://google.serper.dev/search", ...)

# Brave: GET request, web.results[].description
response = await client.get("https://api.search.brave.com/res/v1/web/search", ...)

# Bing: GET request, webPages.value[].snippet
response = await client.get("https://api.bing.microsoft.com/v7.0/search", ...)
```

**Issues**:
1. Request methods, auth headers, and response structures vary
2. Switching providers requires changing caller code
3. `raise Exception` interrupts AI Agent's streaming conversation

## Root Cause

1. **Missing abstraction layer**: Caller directly depends on concrete implementations, violating dependency inversion
2. **Inconsistent error handling**: Exceptions propagate up the call stack, crashing the entire streaming flow

For AI Agent tool calls, the Agent needs to decide whether to retry, use another tool, or explain to the user—not just crash.

## Solution

### 1. Define Abstract Base Class and Data Model

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

### 2. Implement Concrete Providers

**Tavily** (AI-optimized search, supports rate limit / quota error codes):

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

                # Return SearchResult on error, never raise
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

            # Field mapping: Tavily's url -> unified link
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

**Serper** (Google Search API):

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

            # Field mapping: Serper's organic[].link -> unified link
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

**Brave** and **Bing** implementations are similar, differing in request method and response field mapping.

### 3. Caller Usage

```python
# Depend on abstraction only
async def execute_search(provider: SearchProvider, query: str) -> List[SearchResult]:
    results = await provider.search(query)

    # Check for errors (via title or snippet)
    if results and not results[0].link:
        error_msg = results[0].snippet
        # Agent can decide next action based on error info
        return f"Search failed: {error_msg}"

    return results


# Switch providers by changing instance only
provider = TavilySearch(api_key="xxx")
# provider = SerperSearch(api_key="xxx")
results = await execute_search(provider, "Python async best practices")
```

### Key Design Decisions

| Decision | Reason |
|----------|--------|
| Return `SearchResult` on error instead of `raise` | AI Agent conversations are streaming flows; exceptions interrupt everything |
| Use Pydantic `BaseModel` for output | Auto-validation + IDE hints + JSON serialization |
| Use `ABC` instead of `Protocol` | Need shared `__init__` logic (api_key storage)|
| Unified 15-second timeout | Search is UX-critical; can't be too slow |

---
**Interested in similar solutions? [Get in touch](/about)**
