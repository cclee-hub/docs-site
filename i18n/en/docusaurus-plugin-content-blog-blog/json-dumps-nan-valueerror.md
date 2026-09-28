---
title: "json.dumps fails on NaN? The error escapes your try/except"
description: "json.dumps(allow_nan=False) throws on NaN — inside framework code, beyond your try/except. Sanitize before the boundary: NaN and ±Inf become None."
date: 2026-09-28
tags: [Python, JSON, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does json.dumps raise ValueError on NaN?"
    a: "The JSON spec has no NaN/Infinity; with allow_nan=False (strict mode) they raise ValueError: Out of range float values are not JSON compliant. The default allow_nan=True emits an invalid NaN literal, handing the problem downstream."
  - q: "How do I convert NaN to null before JSON serialization in pandas?"
    a: "Walk the data structure recursively and replace float NaN and ±Inf with None before dumps; in pandas itself use df.where(df.notna(), None) or to_json (NaN→null built in). Sanitize at the serialization boundary — json won't do it for you."
  - q: "Why doesn't JSON support NaN and Infinity?"
    a: "RFC 8259's number grammar covers finite numbers only. Python's json module with default settings writes a NaN literal — a permissive extension producing invalid JSON that strict downstream parsers reject."
---

A pipeline task dies halfway: the log trace stops mid-step, no error line anywhere — the process seems to vanish into thin air.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy. Analysis tasks start from pandas data and end as JSON in storage; NaN is the most common landmine on that road.

## Symptom: a trace that just stops, no error record

The task is marked failed, but the business log has no exception anywhere — the trace reaches a step and ends. The exception did happen; it just **exploded outside your try's coverage**: the throw came from JSON serialization inside `ti.xcom_push`, a line sitting outside the business try block (and even wrapped, framework-internal serialization points would still be deeper than your catch radius).

The actual error:

```text
ValueError: Out of range float values are not JSON compliant: nan
```

If you searched for "json.dumps NaN ValueError", "Out of range float values are not JSON compliant" or "task log stops without error" — same family.

## Root cause: NaN is a legal Python float that JSON refuses to know

Two rulebooks disagree here. Verified behavior matrix:

```python
import json, math

# NaN sails through the Python world
isinstance(float('nan'), float)   # True — a legal float
float('nan') == float('nan')      # False — even equality can't see it

# The JSON world: permissive by default, strict mode throws
json.dumps(float('nan'))                      # 'NaN' (an invalid JSON literal!)
json.dumps(float('nan'), allow_nan=False)     # ValueError: Out of range float values...
json.dumps(math.inf, allow_nan=False)         # ValueError (±Inf equally guilty)
```

Three points:

- **RFC 8259's number grammar has no NaN/Infinity**. Python's json defaults to `allow_nan=True` and emits a `NaN` literal — a permissive extension producing strings strict parsers downstream will reject. The trap has two layers: blow up now (strict mode), or plant it for later (permissive mode).
- **NaN defeats ordinary guard clauses**. It's not None, not 0, and `==` against itself is False — `if not value` checks all pass, and the data walks all the way to the serializer before exploding.
- **The blast site is framework code**. You hand a dict to `xcom_push`, a logging SDK, an HTTP client — serialization happens inside those frameworks, deeper than your try/catch. That's exactly why the trace stops with no error line: the exception never touched your logging hooks, it simply flattened the task.

## The fix: sanitize at the boundary, backstop with a task-level hook

Two lines of defense. First, the data — recursively clean before any JSON boundary, mapping NaN and ±Inf to None:

```python
import math

def json_safe(value):
    """Recursively turn NaN/±Inf into None; pass everything else through."""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    return value

import json
payload = json_safe(result_dict)
json.dumps(payload, allow_nan=False)   # can no longer throw
```

After sanitizing, keep `allow_nan=False` — it changes from landmine to tripwire: anything that slipped through now raises inside your own code instead of leaking downstream.

Second, the framework — attach a failure hook to the task (an Airflow task failure callback, or a decorator wrapping the whole task callable) so catch-external exceptions also land in the log system. That turns "trace stops, no error" into "trace ends with an error". When triaging existing failures, go straight to the Airflow task logs for the traceback (`logs/dag_id=.../task_id=.../attempt=N.log` inside the container) rather than the business logs.

## Boundary cases

- **pandas' own `to_json` maps NaN to null at output time** — if the whole chain uses it, no sanitizing needed; but the moment data becomes a dict and switches to json.dumps, you own the cleaning. The trap springs exactly when you swap serializers.
- **`NaN == NaN` is False** — dedup, assertions and test comparisons all get fooled; only `math.isnan` detects it.
- **numpy arrays blow up json.dumps too** (ndarray isn't JSON-serializable) — `.tolist()` first; the NaNs survive tolist, so cleaning is still required.
- Semantically, NaN→null is lossy ("measurement failed" becomes "no value") — if downstream depends on that distinction, add an explicit marker field instead of hard-converting.

<InfoBox variant="warning" title="Watch out">

- **Only `math.isnan` detects NaN** — anything based on `==` or `if not x` is unreliable.
- **Sanitize once, at the serialization boundary** — per-callsite cleaning guarantees one call site eventually gets skipped, and that one reproduces the bug.
- **Use strict mode as a tripwire**: after sanitizing, an allow_nan=False error means leaked data — a good signal.
- **Framework failure hooks are not optional**: they catch the exceptions you can't think of today but will certainly meet tomorrow.

</InfoBox>

## FAQ

### Why does json.dumps raise ValueError on NaN?

The JSON spec has no NaN/Infinity; with `allow_nan=False` (strict mode) they raise `ValueError: Out of range float values are not JSON compliant`. The default `allow_nan=True` emits an invalid NaN literal, handing the problem downstream.

### How do I convert NaN to null before JSON serialization in pandas?

Walk the data structure recursively and replace float NaN and ±Inf with None before dumps; in pandas itself use `df.where(df.notna(), None)` or `to_json` (NaN→null built in). Sanitize at the serialization boundary — json won't do it for you.

### Why doesn't JSON support NaN and Infinity?

RFC 8259's number grammar covers finite numbers only. Python's json module with default settings writes a NaN literal — a permissive extension producing invalid JSON that strict downstream parsers reject.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
