---
title: "Airflow dagRun Trigger Fails Silently? The logical_date Unique Constraint"
description: "POSTing to the Airflow dagRuns API with the same logical_date fails silently (no dag_run_id in the response). Airflow enforces a unique constraint on (dag_id, logical_date), so each trigger needs a distinct logical_date."
date: 2026-08-05
tags: [Apache Airflow, Airflow, REST API]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do you trigger a DAG with the Airflow REST API?"
    a: "POST /api/v2/dags/{dag_id}/dagRuns with a body containing dag_run_id and logical_date (plus an optional conf). Both fields must be unique within the same DAG, or Airflow returns 4xx."
  - q: "Why does triggering the same DAG repeatedly fail in Airflow?"
    a: "Airflow enforces a unique constraint on logical_date per DAG (and dag_run_id is a primary key). Duplicate values are rejected with 4xx. Use a different logical_date or dag_run_id for every trigger."
---

While triggering the same DAG repeatedly via the Airflow REST API for a staged rollout check, the request came back 4xx with no `dag_run_id` in the body — the DAG never actually ran — yet the script treated it as success.

Encountered this while building [AI Analytics](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operations strategy. The staged rollout of the ad-decision pipeline needed to trigger the same analysis repeatedly on Airflow for comparison, and some triggers were failing silently.

## TL;DR

Airflow enforces a **unique constraint on each DAG's `logical_date`** (`dag_run_id` must also be unique). POSTing `/dags/{dag_id}/dagRuns` with a `logical_date` that already exists gets rejected with a 4xx, and the response body **contains no `dag_run_id`**. If you only check the HTTP status code and don't inspect the returned `dag_run_id`, you'll mistake the rejection for success. Fix: use a distinct `logical_date` (and `dag_run_id`) on every trigger.

## Symptoms

To run a comparison test, the same DAG was triggered repeatedly with a fixed date `2026-01-01`:

```bash
$ curl -s -X POST "$AIRFLOW/api/v2/dags/my_dag/dagRuns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "dag_run_id": "manual-run-1",
      "logical_date": "2026-01-01T00:00:00Z"
    }'
# First time: returns a normal dag_run object with dag_run_id ✅

$ curl -s -X POST "$AIRFLOW/api/v2/dags/my_dag/dagRuns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "dag_run_id": "manual-run-2",
      "logical_date": "2026-01-01T00:00:00Z"   # ⚠️ same logical_date
    }'
# Second time: returns an error object, no dag_run_id ❌
{
  "detail": "...",
  "status": 400,
  "title": "Bad Request",
  "type": "https://airflow.apache.org/docs/apache-airflow/2/stable-rest-api-ref.html#/default/Error"
}
```

If the caller only checks "is it 2xx" and stops there, or parses the JSON without verifying that `dag_run_id` exists, the second failure is silently swallowed — no error in the logs, no run in the Airflow UI.

## Root Cause

Airflow uses `dag_run_id` as the primary key for each run and maintains uniqueness on `(dag_id, logical_date)` in the metadata DB's `dag_run` table. `logical_date` is the "logical time" of a run — the scheduler uses it to decide whether a given schedule slot has already executed. Once a run with some `logical_date` exists for a DAG, triggering again with the same value is rejected to prevent duplicate execution.

The catch is that this failure is a **4xx with an error JSON**, not a connection error or a 5xx. Many scripts only do a coarse `response.status_code == 200` check, or grab the JSON and read fields without verifying `dag_run_id` is present — so "creation rejected" reads as "creation succeeded".

## Solution

**Core idea: use a distinct `logical_date` (and `dag_run_id`) on every trigger.** For replay / rollout-comparison scenarios, just append a counter to the date:

```bash
# Each iteration uses a different logical_date (2026-01-01 / 02 / 03 …)
for i in 1 2 3; do
  curl -s -X POST "$AIRFLOW/api/v2/dags/my_dag/dagRuns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"dag_run_id\": \"manual-run-$i\",
      \"logical_date\": \"2026-01-0${i}T00:00:00Z\"
    }"
done
```

Even better, use an incrementing timestamp so `logical_date` and `dag_run_id` never collide. **More importantly: always verify the `dag_run_id` field in the response** — treat it as the only proof the trigger actually succeeded:

```python
import requests

def trigger_dag(dag_id: str, logical_date: str, conf: dict | None = None) -> str:
    resp = requests.post(
        f"{AIRFLOW}/api/v2/dags/{dag_id}/dagRuns",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json={"dag_run_id": f"manual-{logical_date}", "logical_date": logical_date, "conf": conf or {}},
    )
    # ❌ Not enough: status-only check lets 4xx slip through as success
    # resp.raise_for_status()
    data = resp.json()
    # ✅ Correct: only count it as created if dag_run_id is present
    if "dag_run_id" not in data:
        raise RuntimeError(f"Trigger failed: {resp.status_code} {data}")
    return data["dag_run_id"]

# A distinct logical_date each time makes repeated triggers safe
for i in range(1, 4):
    trigger_dag("my_dag", f"2026-01-0{i}T00:00:00Z")
```

Keep `dag_run_id` unique too — it's the primary key, and duplicates are rejected outright. A "prefix + logical_date" convention is common: unique, and easy to spot in the UI.

## FAQ

### How do you trigger a DAG with the Airflow REST API?

`POST /api/v2/dags/{dag_id}/dagRuns` with a body containing at least `dag_run_id` and `logical_date` (plus an optional `conf` for parameters). Both must be unique within the same DAG, or Airflow returns 4xx. In code, prefer the `TriggerDagRunOperator`, which also generates a unique run id internally.

### Why does triggering the same DAG repeatedly fail in Airflow?

Because Airflow maintains a unique constraint on `(dag_id, logical_date)` in the `dag_run` table, and `dag_run_id` itself is a primary key. Duplicate `logical_date` or `dag_run_id` values are rejected with 4xx. For replays or staged comparisons, give each trigger a fresh `logical_date` (or incrementing timestamp).

<InfoBox variant="warning" title="Caveats">

- **Verify `dag_run_id`, not just the status code**: a 4xx with an error JSON is Airflow's normal way of saying "creation rejected" — a status-only check easily misreads failure as success.
- **Use a past `logical_date`**: a future date is treated as a scheduled run and won't execute immediately; use a past date to run it now.
- **API version differences**: Airflow 2.x uses `/api/v2/dags/{dag_id}/dagRuns`; 3.x adjusts paths and fields — always check the REST API reference for your version when upgrading.
- **Prefer the CLI's `--logical-date` for replays**: `airflow dags trigger` accepts a date, but the `logical_date` uniqueness constraint still applies — a repeated date fails the same way.

</InfoBox>

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
