---
title: "Node.js AsyncLocalStorage Reads the Wrong Value Under Concurrency? Replace enterWith with run"
description: "With BullMQ worker concurrency above 1, als.enterWith mutates the shared parent context, so concurrent jobs read the wrong traceId after an await interleaves (cross-talk). Wrap each processor in als.run to isolate the context per invocation."
date: 2026-06-12
tags: [Node.js, AsyncLocalStorage, BullMQ, Concurrency]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What's the difference between als.enterWith and als.run?"
    a: "enterWith mutates the currently active shared parent context, so concurrent tasks overwrite each other; run creates a fresh, independent context for the callback and restores the previous one on exit, so each call is isolated."
  - q: "Why do concurrent tasks read the wrong traceId and cross into another request?"
    a: "When concurrent jobs interleave at an await, the value written by enterWith is overwritten by the last call, so every interleaved task reads the same wrong traceId. Node officially recommends run over enterWith."
---

A BullMQ worker with `concurrency: 3` goes live, and the logs and Sentry reports of concurrent jobs are all crossed — job A's error stack lands under job B's traceId, and you spend ages staring at the wrong trace.

Encountered this while building the [AI Analytics](/docs/ai-analytics) platform — intelligent analysis of market trends, user behavior, and sales data for ecommerce operations. The backend runs analysis jobs concurrently on BullMQ, each stamping a traceId via AsyncLocalStorage for log correlation, and the moment concurrency ramped up the traceIds started crossing.

## TL;DR

`als.enterWith(store)` mutates the **currently active shared parent context**, so concurrent tasks overwrite each other when they interleave at an `await` — the last write wins, and every interleaved task reads the same wrong value. The fix is to switch to `als.run(store, fn)` and wrap the entire processor in it: it creates a fresh, independent context per call and restores the previous one on exit, so no amount of concurrency causes cross-talk.

## The Problem

Each job stamps its own traceId into ALS on entry, and the processor (which contains `await`s) reads that traceId for logging and Sentry reporting:

```js
// worker.js — cross-talk version
new Worker('analytics', (job) => {
  als.enterWith({ traceId: job.data.executionId }); // stamp on entry
  return processJob(job); // internally: multiple awaits + logger.info({ traceId: als.getStore().traceId })
}, { concurrency: 3 });
```

It works in isolation, but turn on `concurrency: 3` and the weirdness begins:

```bash
# job A (executionId: aaa) and job B (executionId: bbb) enter almost simultaneously
[worker] job A start   traceId=aaa
[worker] job B start   traceId=bbb
# A hits an await and yields; B calls enterWith({bbb}); when A resumes:
[worker] job A step2    traceId=bbb   ← crossed into B
[worker] job A error    traceId=bbb   ← reported under B's trace in Sentry
```

Not intermittent — it reproduces deterministically whenever there's concurrency, and the traceId always equals "the value of the most recent enterWith."

## Root Cause

The key is that `enterWith` doesn't write to a "this-call-only" context — it writes to the **currently active shared parent context**.

AsyncLocalStorage contexts form a tree: one async context can be shared by multiple child tasks. The semantics of `als.enterWith(store)` are "write this store onto the context I'm currently in." When the worker runs with `concurrency: 3`, the three job processors share the same parent context (the worker loop's context), so:

- job A calls `enterWith({aaa})` → the shared context is written to `aaa`;
- job A `await`s and yields;
- job B calls `enterWith({bbb})` → the same shared context is overwritten to `bbb`;
- job A resumes and reads `getStore()` → it gets `bbb`.

That's classic last-write-wins cross-talk. The more `await` points and the higher the concurrency, the more frequent the overwrites and the worse the corruption. Under `concurrency: 1` it looks fine simply because there's no interleaving — which is exactly what makes it so dangerous: single-threaded debugging during development never surfaces it.

The Node docs are explicit about this: `enterWith()` can have unintended side effects, and **recommends `run()` instead**.

## Solution

Swap `enterWith` for `run`, and wrap the **entire processor** (not just one segment) with it:

```js
// worker.js — isolated version
new Worker('analytics', (job) => {
  return als.run(
    { traceId: job.data.executionId },
    () => processJob(job), // the whole processor runs in its own context
  );
}, { concurrency: 3 });
```

The semantics of `als.run(store, fn)`: **create a brand-new, independent async context**, bind the store to it, and make it visible to `fn` and every async task it spawns; when `fn` returns, the context restores to what it was before the call.

Because each `run` call establishes a **fresh context scoped to that invocation**, concurrent tasks are isolated by construction — job A's context always holds `aaa`, job B's always holds `bbb`, no matter how they interleave at `await` points.

The payoff is direct:

- **Per-call snapshot**: the traceId is bound on job entry, and the entire handling chain (every `await`, sub-function, Sentry scope) reads this job's own value;
- **Auto-restore on exit**: when the job ends the context resets, with no leakage into the next job or the worker's main loop;
- **Concurrency-safe**: crank `concurrency` as high as you like — behavior stays identical to single-threaded.

If the processor is an extracted function (say `processWorkflowJob`, `processAtomicJob`), wrap it once at the Worker construction site — no need to touch the processor internals:

```js
new Worker(queue, (job) => als.run({ traceId: job.data.id }, () => processWorkflowJob(job)), { concurrency });
```

<InfoBox variant="warning" title="Caveats">

- Whenever there's concurrency (worker concurrency > 1, concurrent HTTP requests, `Promise.all` batching), don't use `enterWith`. It's designed for "set once, single-threaded, sequential" use and will always cross-talk under concurrency.
- `run` must wrap the entire processor, not just the synchronous entry — otherwise the code after an `await` inside the processor falls back to the shared context and you've fixed nothing.
- `concurrency: 1` hides this bug. Always load-test with the target concurrency during development, or it only surfaces in production.
- The other frequent AsyncLocalStorage trap is reading undefined inside a callback (a lost context) — see [Node.js AsyncLocalStorage returns undefined in a callback? EventEmitter escapes its context](/blog/2026/06/12/asynclocalstorage-context-lost-eventemitter-callback).

</InfoBox>

## FAQ

### What's the difference between als.enterWith and als.run?

`enterWith` writes the store onto the currently active shared parent context, so concurrent async tasks overwrite each other; `run` creates a fresh, independent context for the callback, binds the store to it, and restores the previous context on exit, so each call is isolated. Node officially recommends `run` over `enterWith`.

### Why do concurrent tasks read the wrong traceId and cross into another request?

When concurrent tasks interleave at an `await`, the value written by `enterWith` is overwritten by the most recent call, so every interleaved task reads the same wrong traceId. Switching to `als.run` gives each call its own isolated context, so no amount of concurrency causes cross-talk.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
