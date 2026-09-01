---
title: "Fixing CancelledError When FastAPI SSE Clients Disconnect"
description: "FastAPI StreamingResponse raises asyncio.CancelledError when clients disconnect. The correct handling is to catch it inside the generator and re-raise, avoiding resource leaks and error-log noise."
date: 2026-03-16
tags: [FastAPI, SSE, asyncio, ai-agent]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does FastAPI SSE raise CancelledError after a client disconnects?"
    a: "That is asyncio working as designed. On disconnect, Starlette cancels the generator task, triggering CancelledError. The correct handling is to catch it and re-raise."
  - q: "What happens if I catch CancelledError without re-raising?"
    a: "The generator cannot terminate properly, leaking resources such as database connections and HTTP clients. StreamingResponse also mistakes the response for a normal completion."
  - q: "How do I distinguish a normal disconnect from an abnormal one?"
    a: "CancelledError itself is the normal-disconnect signal. If you need cleanup on disconnect (e.g. updating state), handle it in the except block, then re-raise."
---

> Encountered this while building an AI customer-service automation system for a client — recording the root cause and fix.

## TL;DR

FastAPI's `StreamingResponse` cancels the generator task when the client disconnects, raising `asyncio.CancelledError`. The correct fix is to catch the exception inside the generator and **re-raise** — otherwise you get error-log noise and resource leaks.


<!-- truncate -->
## The symptom

When streaming a conversation over SSE (Server-Sent Events), the server log fills with exceptions after the client disconnects:

```
ERROR:    Exception in ASGI application
  ...
  asyncio.CancelledError
```

The original code:

```python
async def event_stream():
    async for event in engine.execute(body.message):
        yield event

return StreamingResponse(event_stream(), media_type="text/event-stream")
```

## Root cause

FastAPI/Starlette's `StreamingResponse` cancels the running generator task when the client disconnects. A cancelled `async for` loop raises `asyncio.CancelledError`.

Unhandled, the exception propagates up and the ASGI server logs it as an error. Worse, resources held inside the generator (database connections, HTTP clients) may never be released properly.

## The fix

Catch `CancelledError` inside the generator, log it, and **always re-raise**:

```python
import asyncio
import logging

logger = logging.getLogger(__name__)

async def event_stream():
    try:
        async for event in engine.execute(body.message):
            yield event
    except asyncio.CancelledError:
        # Client disconnected — expected behavior
        logger.info("Client disconnected")
        raise  # must re-raise to terminate the generator correctly

return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### Why re-raise is mandatory

`CancelledError` is Python's standard mechanism for cancelling coroutines. Catching it without re-raising:
1. leaves the generator unterminated,
2. makes `StreamingResponse` believe the response completed normally, and
3. can leak resources.

## FAQ

### Why does FastAPI SSE raise CancelledError after a client disconnects?

That is asyncio working as designed. On disconnect, Starlette cancels the generator task, triggering `CancelledError`. The correct handling is to catch it and re-raise.

### What happens if I catch CancelledError without re-raising?

The generator cannot terminate properly, leaking resources such as database connections and HTTP clients. StreamingResponse also mistakes the response for a normal completion.

### How do I distinguish a normal disconnect from an abnormal one?

`CancelledError` itself is the normal-disconnect signal. If you need cleanup on disconnect (e.g. updating state), handle it in the `except` block, then re-raise.
