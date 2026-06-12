---
title: "Node.js AsyncLocalStorage Returns undefined in a Callback? EventEmitter Escapes Its Context"
description: "AsyncLocalStorage getStore() returns undefined inside res.on('finish') and other EventEmitter callbacks, losing the traceId. The callback runs outside the async context it was registered in — fix it with a synchronous closure capture or als.run."
date: 2026-06-12
tags: [Node.js, AsyncLocalStorage, EventEmitter, Express]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why can't I read AsyncLocalStorage inside the res.on('finish') callback?"
    a: "EventEmitter callbacks execute outside the async context they were registered in, so AsyncLocalStorage.getStore() can't see the registered store and returns undefined."
  - q: "How do I make an EventEmitter callback see the AsyncLocalStorage context again?"
    a: "Capture the value into a closure variable during the synchronous segment and use the closure in the callback, or rebuild the context inside the callback with als.run(store, fn)."
---

The request-logging middleware reads AsyncLocalStorage's traceId inside the `res.on('finish')` callback, and `getStore()` returns `undefined` — every response log ends up missing its traceId.

Encountered this while building the [ecommerce data collection tool](/docs/browser-plugin) for a client — the server uses ALS to carry each request's traceId through the entire handling chain, but response logs stubbornly refused to correlate. The culprit turned out to be "late callbacks" losing the context.

## TL;DR

EventEmitter callbacks like `res.on('finish')` run **outside** the async context they were registered in, so `als.getStore()` can't find the request's store. The most reliable fix is to **capture the value into a closure variable during the synchronous segment** and use that closure inside the callback; when you need the full store, rebuild the context with `als.run(store, fn)` inside the callback.

## The Problem

An innocent-looking request-logging middleware:

```js
// middleware/requestLog.js
import { als } from '../utils/als.js';

app.use((req, res, next) => {
  res.on('finish', () => {
    const store = als.getStore();
    logger.info({
      traceId: store?.traceId,  // always undefined in the response log
      statusCode: res.statusCode,
    }, 'request');
  });
  next();
});
```

The middleware order is fine, the traceId is readable everywhere else in the request chain (routes, business logic), but not inside `res.on('finish')`. The really confusing part: move `als.getStore()` into the synchronous segment before `next()`, and it has a value.

## Root Cause

`AsyncLocalStorage` relies on Node's `async_hooks` to bind the store to the **currently active async context** and propagate it down the async call chain. The semantics of `als.run(store, fn)` are: during `fn`'s execution (and any async tasks it spawns), `getStore()` returns this store.

The problem is EventEmitter. `res.on('finish', cb)` **registers `cb` as a listener**, to be fired by EventEmitter's dispatch loop after the response is sent. The async context that fires `cb` is the one active where dispatch happens — **not the request's context**. And since the response is usually sent after the request-handling chain, the `als.run` scope for that request may already have exited.

So `als.getStore()` inside `cb` reads the store of "whatever context is active right now," which doesn't belong to this request — the result is `undefined` (or worse, a different request's store).

Any callback with "registered in one context, fired in another" has this trap: `res.on('finish')`, `once`, some `setTimeout`/`setInterval`, `chrome.alarms` listeners, and so on.

## Solution

Two patterns, depending on what you need.

### Pattern A (recommended): synchronous closure capture

If your callback only needs a couple of values from the store (most often just traceId), the simplest and most robust approach is to capture them during the synchronous segment — when the store is guaranteed alive — into a closure, and use that closure in the callback without ever touching ALS:

```js
app.use((req, res, next) => {
  // Synchronous segment: we're inside the als.run scope, getStore() always has a value
  const traceId = als.getStore()?.traceId;
  const start = Date.now();

  res.on('finish', () => {
    // Use the closure's traceId, never touch ALS
    logger.info({
      traceId,                         // reliably present
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    }, 'request');
  });

  next();
});
```

This swaps the uncertainty of "is the async context still alive" for a deterministic closure reference. When the callback fires no longer matters — the value is already captured.

### Pattern B: rebuild the context with `als.run`

When the callback invokes a blob of code that **internally depends on `getStore()`** (a logger mixin, Sentry scope injection), rewriting each call to use a closure is impractical. Instead, rebuild the context at the callback's entry:

```js
res.on('finish', () => {
  const traceId = capturedTraceId;       // value captured in the synchronous segment
  if (traceId) {
    // Re-establish the ALS context inside the callback so record()'s internal getStore() works
    als.run({ traceId }, () => record(res, start));
  } else {
    record(res, start);
  }
});
```

`als.run(store, fn)` creates a **new, independent** async context, binds the store to it, and makes it visible to `fn` and every async task it spawns. It's safer than `als.enterWith` — which mutates the "current shared context" and causes cross-talk under concurrency. That's a separate trap, covered in [AsyncLocalStorage reads the wrong value under concurrency? Replace enterWith with run](/blog/2026/06/12/asynclocalstorage-enterwith-concurrency-crosstalk).

<InfoBox variant="warning" title="Caveats">

- To tell whether a callback will lose context, ask whether registration and firing are separated. `res.on('finish')`, `once`, and cross-tick `setTimeout` are suspect; `await` and `fetch().then()` inherit naturally along the async chain and need no handling.
- Prefer pattern A. It reduces the problem to an ordinary closure — best readability, no implicit "context rebuild" behavior. Only reach for pattern B when the callback wraps a lot of existing code that depends on `getStore()`.
- Don't patch this with `als.enterWith` in the callback — it mutates the shared parent context under concurrency and causes cross-talk, a far harder bug to diagnose than a lost context.

</InfoBox>

## FAQ

### Why can't I read AsyncLocalStorage inside the res.on('finish') callback?

`res.on('finish', cb)` registers `cb` as an EventEmitter listener that only fires after the response is sent. The async context active when it fires is the dispatch context, not the request's, and the request's `als.run` scope may have already exited — so `getStore()` returns undefined.

### How do I make an EventEmitter callback see the AsyncLocalStorage context again?

The simplest way is to capture the value into a closure variable during the synchronous segment and use the closure in the callback. If the callback wraps a lot of code that depends on `getStore()`, rebuild the context at the callback's entry with `als.run(store, fn)`. Prefer the former; reserve the latter for retrofitting existing logic.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
