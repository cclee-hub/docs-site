---
title: Python task marked failed but no error? try/except swallowed the exception
description: "After refactoring a shared method's signature, a caller threw TypeError that got swallowed into a failed counter by try/except — no crash, no ERROR log. Fix: log or re-raise in except, grep callers after refactor."
date: 2026-06-13
tags: [Python, FastAPI, Bug修复, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I print the error in a Python try except?"
    a: "Catch the exception object with except Exception as e, then call logging.error(e, exc_info=True) to print the full stack trace. A bare print(e) drops the stack trace, so you can't see the call chain while debugging."
  - q: "What are Python exception handling best practices?"
    a: "Catch specific exception types, not bare except; the except block must log or re-raise, never empty pass; log the Error instance, not err.message, to keep the stack; only catch broadly at the outermost layer."
  - q: "How do I catch multiple exceptions in Python try except?"
    a: "Use a single except (TypeError, ValueError) as e to catch several types, or multiple except branches for different handling. Avoid bare except or except Exception swallowing everything."
---

> Debugging a silent failure where a document sync task marked everything failed in a RAG knowledge base project — full writeup below.

## TL;DR

A shared method was refactored with a new parameter signature, but one caller was missed. The caller passed arguments under the old contract and threw `TypeError` — except the call sat inside a `try/except` that quietly funneled the exception into a `failed` counter. No crash, no ERROR in the logs, just a number ticking up. These "silent failures" are the hardest bugs to track down. Two fixes: `grep` all callers after a signature refactor; and make `except` blocks log or re-raise, never swallow silently.

{/* truncate */}

## Symptom

A document sync task ran to completion and marked every document `failed`:

```json
{
  "summary": {"added": 0, "updated": 0, "deleted": 0, "failed": 48}
}
```

The strange part: zero error signals anywhere.

- Health check green, process never crashed
- Process manager showed `unstable_restarts=0` — no restarts
- Logs had **no ERROR / Exception**, just an info-level `Sync completed`

"Runs fine, produces no valid output, and throws no error" — the classic silent failure.

## Root cause

Two factors stacked together.

**Factor one: shared method signature refactored, caller not updated.** A method that writes to a vector DB was refactored from "accept precomputed vectors" to "call the embedding service itself":

```python
# After refactor: the method embeds itself, signature is now 4 params
async def add_documents(self, collection_name, texts, embedding_service, metadatas=None):
    ...

# A caller still passes precomputed vectors under the old contract (5 params)
await rag_service.add_documents(
    collection, chunks, dense_embeddings, sparse_vectors, metadatas
)
# TypeError: takes 4 positional arguments but 5 were given
```

**Factor two: the call sat inside an exception-swallowing try/except.** What turned this into a "silent failure" was the handler wrapping the call:

```python
async def process_document(doc):
    try:
        await rag_service.add_documents(...)  # ❌ TypeError thrown here
    except Exception:
        summary["failed"] += 1                 # ❌ swallow, just count
        # no log, no re-raise, no stack trace printed
```

`except Exception` catches the `TypeError` too and just increments `failed`. So:

- The exception **never propagates** → no crash, no exit
- The exception **never hits the logs** → no ERROR stack to find
- The only trace is a **counter ticking up** → invisible unless you look at `summary`

Both factors are required: refactor-without-sync alone crashes immediately and surfaces; swallowing alone only hides errors that would otherwise show. Combined, you get the most insidious kind of bug.

## Solution

**Step one: after refactoring a shared method's signature, immediately grep all callers.**

```bash
# After refactoring any widely-called method, check every call site
grep -rn "add_documents(" app/
grep -rn "add_documents(" --include="*.py" .
```

If the new signature is incompatible with the old semantics (e.g. "accept vectors" → "embed yourself"), **don't mutate the original method** — add a new method with a clear name so each path stays separate:

```python
# Original: embeds itself (used by the /index path)
async def add_documents(self, collection_name, texts, embedding_service, metadatas=None):
    ...

# New method: accepts precomputed vectors (used by /sync) — different semantics, kept separate
async def add_precomputed_documents(self, collection_name, chunks, dense, sparse, metadatas):
    ...
```

**Step two: never silently swallow in except blocks.**

```python
# ✅ except must log (with full stack), then decide: count or re-raise
async def process_document(doc):
    try:
        await rag_service.add_documents(...)
    except Exception as e:
        logger.error(f"process failed: {doc['path']}", exc_info=True)  # full stack
        summary["failed"] += 1
```

The key is `exc_info=True` (or `traceback.print_exc()`) — it writes the stack trace into the log. With both fixes in place, that same `TypeError` immediately surfaces as a full call chain in the logs instead of hiding inside a counter pretending nothing happened.

<InfoBox variant="warning" title="Caveats">

- **`except Exception:` is the single biggest source of silent failures.** It swallows programming errors like `TypeError` and `AttributeError` too, masking real bugs. Prefer specific types (`except (ConnectionError, TimeoutError)`).
- **An empty `pass` is as dangerous as a counting-only `except`.** `except: pass` actively discards error information, leaving you nothing to debug from.
- **Counters like `summary["failed"]` are hidden signals.** The moment a path funnels exceptions into a counter, check: is that counter monitored, does a rise trigger an alert? An unmonitored counter is just errors swept under the rug.
- Refactoring a shared method's signature is high-risk — a CI `grep` check or a type checker (mypy/pyright) can catch missed callers before merge.

</InfoBox>

Python exception handling has other traps: the `CancelledError` fired when an async client disconnects is also frequently swallowed, breaking cleanup logic — [FastAPI SSE CancelledError](/blog/fastapi-sse-cancellederror) covers handling it in async scenarios.

## FAQ

### How do I print the error in a Python try except?

Catch the exception object with `except Exception as e`, then call `logging.error(e, exc_info=True)` to print the full stack trace. A bare `print(e)` drops the stack trace, so you can't see the call chain while debugging.

### What are Python exception handling best practices?

Catch specific exception types, not bare `except`; the `except` block must log or re-raise, never empty `pass`; log the Error instance, not `err.message`, to keep the stack; only catch broadly at the outermost layer.

### How do I catch multiple exceptions in Python try except?

Use a single `except (TypeError, ValueError) as e` to catch several types, or multiple `except` branches for different handling. Avoid bare `except` or `except Exception` swallowing everything.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
