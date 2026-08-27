---
title: "Monitor Missed 38 Log Lines? Python's WARNING Is Not the Contract's warn"
description: "38 rows in the logs table carry level='warning' while the monitor filters on the contract name warn — every one invisible. Python stdlib's WARNING/CRITICAL never matches cross-language contract names warn/fatal; normalize at the write boundary, and never let the contract doc copy the implementation."
date: 2026-08-28
tags: [Python, Logging, DevOps, Monitoring]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why can't Python's WARNING be written straight into the logs table?"
    a: "stdlib level names are WARNING/CRITICAL, while cross-language contracts define warn/fatal. Writing them raw or lowercased yields warning/critical — unknown to the contract, so every consumer filtering by contract names silently drops those rows."
  - q: "Are WARNING and WARN the same level?"
    a: "Same semantics, different literals. Python has no WARN level (WARN is a deprecated alias; logging always emits WARNING) and no FATAL (that's CRITICAL). Lowercasing doesn't fix it — map explicitly at the write boundary: WARNING→warn, CRITICAL→fatal."
  - q: "How do I detect that a logging contract and its implementation have drifted?"
    a: "Run a reconciliation query grouping rows by level; any spelling outside the contract is drift. And write the contract doc as the intended implementation, never a copy of the current one — copying gives the bug a contract's endorsement."
---

Chasing a monitoring gap: server-monitor filters alert-grade logs by the level name `warn`, but 38 rows in the shared `logs` table carried `level='warning'`. The filter didn't match by one character — and in the monitor's eyes, those 38 rows did not exist.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics platform that surfaces market trends, user behavior, and sales data; server-monitor is its alerting module, consuming one logs table written by four services.

## TL;DR

The cross-language logging contract defines lowercase `warn/fatal`; Python's stdlib `record.levelname` produces `WARNING/CRITICAL` — written raw or with a bare `.lower()` you get `warning/critical`, which contract-name filters never match. Two principles fix it: **normalize at a single point in the write boundary** (`WARNING→warn`, `CRITICAL/FATAL→fatal`) so no consumer ever has to juggle spellings; and **write the contract doc as the intended implementation, not a snapshot of the current one** — this drift survived so long precisely because the contract's Python column documented the buggy code.

## Symptoms

Four services write one `logs` table; the contract specifies `level` values: `debug / info / warn / error / fatal`. A reconciliation query:

```sql
SELECT service, level, count(*)
FROM logs
GROUP BY service, level ORDER BY 1, 2;
```

turns up spellings that don't exist in the contract:

```text
 service    | level    | count
------------+----------+-------
 ai-dag     | warning  |    21   ← not in the contract
 rag-service| warning  |    17   ← not in the contract
 ...        | warn     |   ...   ← the actual contract name
```

The monitor filters `level = 'warn'`; these 38 alert-grade rows silently vanish.

## Root Cause

Layer one is **literal mismatch**: Python's stdlib levels are `DEBUG / INFO / WARNING / ERROR / CRITICAL` — there is no `WARN` (a deprecated alias) and no `FATAL`. Both services pushed `record.levelname` into the table: one raw (uppercase `WARNING`), one lowercased (`warning`). Neither matches the contract's `warn`.

Layer two is the one worth losing sleep over: **the contract document itself specified the wrong implementation**. In the cross-service contract's field table, the Python services' `level` column literally read "`record.levelname`" and "`record.levelname.lower()`". The doc was describing reality instead of prescribing it — so the buggy implementations carried the contract's endorsement, and nobody questioned them. This is the same harm shape as [try/except swallowing exceptions into silent failures](/blog/python-try-except-swallow-exception-silent-failure): nothing crashes, things just quietly go missing — by the time anyone looks, dozens of alert rows were never seen.

## Solution

### Step 1: Single-point mapping at the write boundary

Each service defines one normalization function; every write path (formatter and DB sink) goes through it:

```python
_LEVEL_NAME_MAP = {"WARNING": "warn", "CRITICAL": "fatal", "FATAL": "fatal"}

def normalize_level(levelname: str) -> str:
    """WARNING→warn, CRITICAL/FATAL→fatal, everything else lowercased."""
    return _LEVEL_NAME_MAP.get(levelname.upper(), levelname.lower())
```

```python
payload = {"level": normalize_level(record.levelname)}   # always emits a contract name
```

The keyword is "single point": the JSON formatter and the DB handler share one function, so the mapping changes in exactly one place and no second implementation can appear.

### Step 2: Rewrite the contract doc as the intended implementation

The field table's Python columns now read `normalize_level(record.levelname)`, and a new "level name mapping" section documents the rules, the anti-patterns (no raw writes, no bare lowercasing), and each service's function entry point. A contract is a spec — not a snapshot of whatever happens to be deployed.

### Step 3: Add a reconciliation query so drift is discoverable

```sql
SELECT level, count(*) FROM logs
WHERE service IN ('ai-dag', 'rag-service')
GROUP BY level ORDER BY 2 DESC;
```

Any spelling besides `warn` is drift. This query belongs in routine inspection, turning "contract vs implementation" from a verbal promise into an assertable check.

### Step 4: Clean up存量 (optional)

New writes no longer produce off-contract names; handle the existing 38 rows as needed:

```sql
UPDATE logs SET level = 'warn' WHERE level = 'warning';
```

Small volumes can be left to age out; large ones, or anything feeding historical statistics, deserves the UPDATE.

<InfoBox variant="warning" title="Notes">

- Normalize at the **write boundary**; don't expect consumers to handle multiple spellings — the consumer list only grows (monitoring, alerting, BI, debug scripts), and every new consumer multiplies the compatibility burden.
- Cover the non-standard levels in the map: `CRITICAL→fatal`, `FATAL→fatal`. Miss that and fatal-grade alerts leak past the monitor as `critical`.
- Every "implementation" column in a contract doc is part of the spec: before writing one, ask whether it's how it *should* work or merely how it works *today*.
- Keep cross-service logging contracts (level names, traceId, service names) in one maintained place that all services reference — not re-stated per service.

</InfoBox>

## FAQ

### Why can't Python's WARNING be written straight into the logs table?

The stdlib literals are `WARNING/CRITICAL`, while cross-language contracts define `warn/fatal`. Raw or lowercased values (`warning/critical`) are unknown levels in contract-land — every consumer filtering by contract names silently drops them. The Python side must map at the write boundary.

### Are WARNING and WARN the same level?

Same semantics, different literals. Python logging has no `WARN` level (deprecated alias; the emitted name is always `WARNING`) and no `FATAL` (it's `CRITICAL`). That's why lowercasing doesn't help — you need an explicit mapping: `WARNING→warn`, `CRITICAL→fatal`.

### How do I detect that a logging contract and its implementation have drifted?

Periodically reconcile by contract level names (`GROUP BY level`); any off-contract spelling is drift. More importantly, the contract doc should specify the intended implementation and name the mapping function — when the doc copies the current implementation, the bug gets an endorsement, which is exactly why this drift survived so long.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
