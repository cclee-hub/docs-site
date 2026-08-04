---
title: "Airflow XCom Throws 'Out of range float values are not JSON compliant'? Blame pandas NaN"
description: "Airflow task crashes at ti.xcom_push with ValueError: Out of range float values are not JSON compliant: nan. Root cause: pandas NaN from SQL NULL is rejected by XCom's json.dumps(allow_nan=False) — JSON has no NaN. Fix: recursively convert NaN/±Inf to None before push."
date: 2026-08-05
tags: [Airflow, pandas, JSON, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to fix Airflow 'Out of range float values are not JSON compliant'?"
    a: "XCom serializes with JSON, and json.dumps(allow_nan=False) rejects NaN/Infinity. Recursively convert NaN/±Inf to None (JSON null) before xcom_push."
  - q: "Why does my Airflow task fail but my custom logs table has no error?"
    a: "If the exception happens during XCom serialization and outside the task's try/except, it only lands in the Airflow task log (inside the container at /opt/airflow/logs/), not your app's logs table. Check the Airflow task log traceback directly."
  - q: "Can Airflow XCom store pandas NaN directly?"
    a: "No. XCom uses JSON serialization by default, and the JSON spec has no NaN/Infinity. Convert NaN to None before push, or switch to binary object serialization (not recommended — breaks readability, cross-process compat, and has deserialization risk)."
---

When an Airflow task calls `ti.xcom_push()` to pass pandas-processed results downstream, the task crashes outright — `ValueError: Out of range float values are not JSON compliant: nan` — and the app's custom logs table shows no error at all.

Encountered this while building [AI Ops](/docs/ai-analytics) — an LLM-powered analytics pipeline where Airflow DAGs pull SQL data, process it with pandas, and pass results between tasks via XCom.

## TL;DR

XCom serializes with JSON under the hood, and Airflow calls `json.dumps(..., allow_nan=False)` to follow the JSON spec strictly — which has no `NaN` / `Infinity` whatsoever. The moment a float `NaN` (converted from SQL `NULL` by pandas) enters the data passed to `xcom_push`, serialization throws `ValueError`. Fix: recursively walk the data before push and convert `NaN` / `±Inf` to `None` (JSON `null`).

## Symptoms

A quarterly report DAG failed, but the symptom was baffling — in the app's custom `logs` table, steps 1–4 for that trace were all fine, "analysis done" even logged twice (a retry), then it cut off: **step 5 missing, with no error row at all**:

```text
trace=91c126c3
├─ step 1  SQL fetch            ✅
├─ step 2  pandas process       ✅
├─ step 3  rule judge           ✅
├─ step 4  LLM analysis done    ✅  ← retried after this
└─ step 5  XCom push result     ❌  ← missing, no error record
```

The real traceback was only in the Airflow task log:

```text
# inside container /opt/airflow/logs/dag_id=ai_analysis_v2/run_id=.../task_id=analyze_results/attempt=N.log
ValueError: Out of range float values are not JSON compliant: nan
  File ".../ai_analysis_tasks.py", line 142, in analyze_results
    ti.xcom_push(key='sql_metadata', value=result)
```

The crash landed exactly on `ti.xcom_push` — the instant the task pushed results into XCom.

## Root Cause

Three layers stack up, all required:

**1. The JSON spec has no `NaN` / `Infinity`.** RFC 8259 only allows finite numeric literals. Python's `json.dumps` will happily emit bare `NaN` and `Infinity` by default, but those are Python-specific extensions, **not valid JSON** — any strict parser (Airflow included) rejects them.

**2. Airflow XCom serializes with `allow_nan=False`.** XCom's default JSON serializer explicitly disables NaN tolerance, so encountering `NaN` throws `ValueError: Out of range float values are not JSON compliant` instead of silently emitting invalid JSON.

**3. pandas reads SQL `NULL` as `NaN`.** `pandas.read_sql` returns `float('nan')` for SQL `NULL` columns. Once such a column flows through computation and `to_dict('records')` into the result object, `NaN` hitches a ride into `xcom_push`:

```python
import pandas as pd

# A SQL NULL cell → pandas reads it as NaN
df = pd.DataFrame({"ad_roi": [1.2, None, 0.8]})
records = df.to_dict("records")
# [{'ad_roi': 1.2}, {'ad_roi': nan}, {'ad_roi': 0.8}]   ← nan slipped in

# downstream task crashes on push
ti.xcom_push(key="result", value=records)
# ValueError: Out of range float values are not JSON compliant: nan
```

This stayed latent for a long time because the data usually had values in those columns; it only surfaced when a client had zero ad spend for an entire quarter and `ad_roi` came back `NULL` across the board — the first time `NaN` entered the XCom path at scale.

**Why no error in the logs table?** Because the crash happens during XCom serialization, **outside** the task function's `try/except` — the exception bubbles straight up to the Airflow scheduler and only lands in Airflow's own task log. The app's custom `logs` table catch never gets a chance to record it. That's what makes this failure so confusing: it looks "silent."

## Solution

Scrub all `NaN` / `±Inf` from the data before it enters XCom.

### 1. Write a pure recursive cleaner

```python
import math

def json_safe_value(obj):
    """
    Recursively convert NaN / +Inf / -Inf to None so the data is
    strictly JSON-serializable. Handles dict / list / tuple / scalar;
    unknown types pass through unchanged.
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: json_safe_value(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe_value(v) for v in obj]
    return obj
```

Why not `df.fillna(None)`? Because `fillna(None)` on numeric columns is unstable across pandas versions and dtypes — sometimes it coerces the dtype instead of nulling values. It also only handles DataFrames, not floats already nested inside dicts/lists after `to_dict`. Recursive cleaning at the "data is now native Python structures" layer is the most robust fallback.

### 2. Centralize the guard before push

The worry-free approach is to hang the cleanup on the single chokepoint all `xcom_push` calls go through, rather than remembering to call it at every push site:

```python
def push_safe(ti, key, value):
    """Clean NaN/Inf before XCom push to prevent serialization crashes."""
    ti.xcom_push(key=key, value=json_safe_value(value))

# inside the task
push_safe(ti, "sql_metadata", result)
push_safe(ti, "processor_output", processor_result)
```

### 3. Fix the "silent failure" observability gap

Fixing serialization alone isn't enough — the gap where exceptions outside `try/except` never reach the app's logs table must be closed too. Attach a failure decorator that logs the top-level exception to your table before re-raising:

```python
import functools
import logging

logger = logging.getLogger(__name__)

def log_task_failure(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            logger.error("task %s failed", fn.__name__, exc_info=True)
            # write the traceback into the app's custom logs table here
            raise
    return wrapper

@log_task_failure
def analyze_results(**context):
    ...
```

Now if another exception slips outside a catch, the app's logs table still gets an error row — no more "silent failure."

After the fix, rerunning the same conf: DAG all green, DB write success, and the formerly-`NaN` `ad_roi` lands as `null` in the database; downstream is happy.

On the same Airflow analytics pipeline, this isn't the only way data silently misbehaves — [PostgresHook silently dropping multi-statement SQL results](/blog/2026/06/14/airflow-postgreshook-multistatement-sql-truncated) is another classic.

## Notes

<InfoBox variant="warning" title="Notes">

- **`json.dumps` defaults to `allow_nan=True`, which is a footgun**: it silently emits bare `NaN` / `Infinity` as invalid JSON, and the crash only shows up when a strict parser downstream (Airflow XCom, JS `JSON.parse`) reads it. Always pass `allow_nan=False` explicitly when serializing data that crosses a process boundary, to surface the problem early.
- **`±Infinity` bites too**: `float('inf')` / `float('-inf')` are excluded from the JSON spec just like `NaN`; `json_safe_value` must handle them together.
- **XCom has more than one serializer**: Airflow also supports binary object serialization, which can store arbitrary Python objects, but such XCom values are unreadable, not version-portable, and carry deserialization security risk. In production, stick with JSON and clean the data.
- **Triage heuristic**: when a logs-table trace cuts off with no error row, go straight to the Airflow task log (inside the container at `/opt/airflow/logs/dag_id=.../task_id=.../`) for the traceback — "no app log" does not mean "no error."

</InfoBox>

## FAQ

### How to fix Airflow "Out of range float values are not JSON compliant"?

XCom serializes with `json.dumps(allow_nan=False)` and ran into `NaN` / `Infinity`, which the JSON spec does not allow. The usual root cause is pandas reading a SQL `NULL` into `float('nan')` that then flows into `xcom_push`. Fix it by recursively converting `NaN` / `±Inf` to `None` (JSON `null`) before push, centralized in a pure `json_safe_value` helper.

### Why does my Airflow task fail but my custom logs table has no error?

If the exception happens during XCom serialization, outside the task function's `try/except`, it only bubbles up to the Airflow scheduler and lands in the Airflow task log (inside the container at `/opt/airflow/logs/`). The app's custom logs table catch never sees it, so it looks like a "silent failure." To triage, read the Airflow task log traceback directly instead of only checking app logs.

### Can Airflow XCom store pandas NaN directly?

No. XCom defaults to JSON serialization, and the JSON spec only has finite numbers — no `NaN` / `Infinity`. The right fix is to convert `NaN` to `None` (JSON `null`) before push. Switching to binary object serialization sidesteps the type limit but produces unreadable, non-portable values with deserialization security risk; not recommended for production.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
