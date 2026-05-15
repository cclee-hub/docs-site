---
title: 修复 FastAPI SSE 客户端断开时的 CancelledError
description: FastAPI StreamingResponse 在客户端断开时会抛出 asyncio.CancelledError，正确处理方式是在生成器中捕获并 re-raise，避免资源泄漏和异常日志。
date: 2026-03-16
tags: [FastAPI, SSE, asyncio, aigent, ai-agent]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "FastAPI SSE 客户端断开后为什么报 CancelledError？"
    a: "这是 Python asyncio 的设计行为。客户端断开时，Starlette 取消生成器任务，触发 CancelledError。正确处理方式是捕获并 re-raise。"
  - q: "捕获 CancelledError 后不 re-raise 会怎样？"
    a: "生成器无法正确终止，可能导致数据库连接、HTTP 客户端等资源泄漏。同时 StreamingResponse 会误认为响应正常完成。"
  - q: "如何区分正常断开和异常断开？"
    a: "CancelledError 本身就是正常断开的信号。如果需要在断开时执行清理逻辑（如更新状态），在 except 块中处理后再 re-raise。"
---

> 在为客户构建 AI 客服自动化系统时遇到此问题，记录根因与解法。

## TL;DR

FastAPI 的 `StreamingResponse` 在客户端断开连接时会取消生成器任务，导致 `asyncio.CancelledError`。正确做法是在生成器中捕获该异常并 **re-raise**，否则会导致异常日志污染和资源泄漏。


<!-- truncate -->
## 问题现象

使用 SSE（Server-Sent Events）实现流式对话时，客户端断开连接后，服务端日志出现大量异常：

```
ERROR:    Exception in ASGI application
  ...
  asyncio.CancelledError
```

代码原本写法：

```python
async def event_stream():
    async for event in engine.execute(body.message):
        yield event

return StreamingResponse(event_stream(), media_type="text/event-stream")
```

## 根因

FastAPI/Starlette 的 `StreamingResponse` 在客户端断开时，会取消正在执行的生成器任务。Python 的 `async for` 循环被取消时会抛出 `asyncio.CancelledError`。

如果不处理这个异常，它会向上传播，被 ASGI 服务器捕获并记录为错误日志。更严重的是，生成器内的资源（如数据库连接、HTTP 客户端）可能无法正确释放。

## 解决方案

在生成器内部捕获 `CancelledError`，记录日志后 **必须 re-raise**：

```python
import asyncio
import logging

logger = logging.getLogger(__name__)

async def event_stream():
    try:
        async for event in engine.execute(body.message):
            yield event
    except asyncio.CancelledError:
        # 客户端断开连接，正常行为
        logger.info("Client disconnected")
        raise  # 必须 re-raise 以正确终止生成器

return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### 为什么必须 re-raise？

`CancelledError` 是 Python 取消协程的标准机制。捕获后如果不 re-raise：
1. 生成器不会正确终止
2. `StreamingResponse` 认为响应正常完成
3. 可能导致资源泄漏

## FAQ

### Q: FastAPI SSE 客户端断开后为什么报 CancelledError？

A: 这是 Python asyncio 的设计行为。客户端断开时，Starlette 取消生成器任务，触发 `CancelledError`。正确处理方式是捕获并 re-raise。

### Q: 捕获 CancelledError 后不 re-raise 会怎样？

A: 生成器无法正确终止，可能导致数据库连接、HTTP 客户端等资源泄漏。同时 `StreamingResponse` 会误认为响应正常完成。

### Q: 如何区分正常断开和异常断开？

A: `CancelledError` 本身就是正常断开的信号。如果需要在断开时执行清理逻辑（如更新状态），在 `except` 块中处理后再 re-raise。
