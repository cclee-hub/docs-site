---
title: Fix the Hidden Pitfall of httpx async with client.post()
description: Correct usage of httpx async client to avoid connection issues from using async with on post() directly.
date: 2026-03-15
tags: [Python, httpx, AsyncIO, saas-development, HTTP Client]
schema: Article
---

> Encountered this issue while building a multi-service SaaS system. Documenting the root cause and solution.

## TL;DR

Don't use `async with client.post()` pattern with `httpx.AsyncClient`. Create the client first, then call methods: `response = await client.post()`.


<!-- truncate -->
## Problem Symptoms

```python
import httpx

async def call_api():
    async with httpx.AsyncClient() as client:
        async with client.post(url, json=data) as response:  # Problem code
            return response.json()
```

This code sometimes works, sometimes errors:

```bash
httpx.RemoteProtocolError: cannot write to closing transport
RuntimeError: Session is closed
```

## Root Cause

### The async with client.post() Trap

`client.post()` returns a `Response` object, not a context manager. Wrapping it with `async with` causes:

1. **Premature connection closure**: The connection closes immediately when the `async with` block ends, but the response may still be reading
2. **Resource contention**: With concurrent requests, connection pool state becomes chaotic

### Understanding httpx Context Managers Correctly

```python
# ✅ Correct: client is the context manager
async with httpx.AsyncClient() as client:
    response = await client.post(url, json=data)
    return response.json()

# ❌ Wrong: treating response as context manager
async with client.post(url) as response:
    ...
```

## Solution

### Option 1: Single Request (Simple Scenarios)

```python
async def call_api(url: str, data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=data)
        response.raise_for_status()
        return response.json()
```

### Option 2: Reuse Client (High-Frequency Requests)

```python
# Global or dependency injection
_client = httpx.AsyncClient(timeout=30.0)

async def call_api(url: str, data: dict) -> dict:
    response = await _client.post(url, json=data)
    response.raise_for_status()
    return response.json()

# On app shutdown
async def shutdown():
    await _client.aclose()
```

### Option 3: FastAPI Dependency Injection

```python
from fastapi import Depends
from httpx import AsyncClient

async def get_http_client() -> AsyncClient:
    async with AsyncClient(timeout=30.0) as client:
        yield client

@router.post("/proxy")
async def proxy(
    data: dict,
    client: AsyncClient = Depends(get_http_client)
):
    response = await client.post("https://external.api/endpoint", json=data)
    return response.json()
```

## FAQ

### Q: How should httpx async with be used correctly?

A: `async with` is only for managing `AsyncClient` lifecycle, not wrapping individual requests. Correct pattern: `async with AsyncClient() as client: response = await client.post(...)`.

### Q: Why does async with client.post() sometimes work?

A: It may work by chance in single-threaded, low-concurrency scenarios, but will fail under high concurrency or network latency. This is a hidden bug—don't rely on it.

### Q: How to configure httpx timeout?

A: `AsyncClient(timeout=30.0)` or `AsyncClient(timeout=httpx.Timeout(connect=5.0, read=30.0))`.
