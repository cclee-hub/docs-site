---
title: 修复 httpx async with client.post() 的隐藏坑
description: httpx 异步客户端的正确用法，避免 async with 直接调用 post 导致的连接问题。
date: 2026-03-15
tags: [Python, httpx, AsyncIO, saas-development, HTTP客户端]
authors: [cclee]
schema: Article
---

> 在构建多服务协作的 SaaS 系统时遇到此问题，记录根因与解法。

## TL;DR

`httpx.AsyncClient` 不要用 `async with client.post()` 模式，应该先创建 client 再调用方法：`response = await client.post()`。


<!-- truncate -->
## 问题现象

```python
import httpx

async def call_api():
    async with httpx.AsyncClient() as client:
        async with client.post(url, json=data) as response:  # 问题代码
            return response.json()
```

这段代码有时正常，有时报错：

```bash
httpx.RemoteProtocolError: cannot write to closing transport
RuntimeError: Session is closed
```

## 根因

### async with client.post() 的陷阱

`client.post()` 返回的是 `Response` 对象，不是上下文管理器。用 `async with` 包装会导致：

1. **连接过早关闭**：`async with` 块结束时立即关闭连接，但响应可能还在读取
2. **资源竞争**：多个并发请求时，连接池状态混乱

### 正确理解 httpx 上下文管理器

```python
# ✅ 正确：client 是上下文管理器
async with httpx.AsyncClient() as client:
    response = await client.post(url, json=data)
    return response.json()

# ❌ 错误：把 response 当上下文管理器
async with client.post(url) as response:
    ...
```

## 解决方案

### 方案 1：单次请求（推荐简单场景）

```python
async def call_api(url: str, data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=data)
        response.raise_for_status()
        return response.json()
```

### 方案 2：复用 client（推荐高频请求）

```python
# 全局或依赖注入
_client = httpx.AsyncClient(timeout=30.0)

async def call_api(url: str, data: dict) -> dict:
    response = await _client.post(url, json=data)
    response.raise_for_status()
    return response.json()

# 应用关闭时
async def shutdown():
    await _client.aclose()
```

### 方案 3：FastAPI 依赖注入

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

### Q: httpx async with 怎么用才对？

A: `async with` 只用于管理 `AsyncClient` 生命周期，不是包装单个请求。正确模式：`async with AsyncClient() as client: response = await client.post(...)`。

### Q: 为什么有时 async with client.post() 也能跑？

A: 单线程、低并发时可能碰巧正常，但高并发或网络延迟时会暴露问题。这是隐藏 bug，不要侥幸。

### Q: httpx 超时怎么配置？

A: `AsyncClient(timeout=30.0)` 或 `AsyncClient(timeout=httpx.Timeout(connect=5.0, read=30.0))`。
