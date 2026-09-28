---
title: "Airflow trigger no dag_run_id? duplicate logical_date 409"
description: "Re-triggering with the same logical_date gets a 409 from Airflow — the DAG never runs and the response has no dag_run_id. Use a fresh logical_date per trigger and assert dag_run_id in the response."
date: 2026-09-28
tags: [Airflow, API, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What happens if I trigger the same Airflow DAG run twice via the API?"
    a: "It gets rejected by a unique constraint: re-triggering with an existing logical_date returned HTTP 409 (Unique constraint violation) with no dag_run_id in the body, and the DAG never ran. Callers that only log the request miss the failure entirely."
  - q: "Why was my Airflow dagRun triggered but nothing ran?"
    a: "The most common cause is a duplicate logical_date — Airflow enforces (dag_id, logical_date) uniqueness and answers 409, which an unchecked caller never notices. Rule: a trigger only succeeded if the response body contains a dag_run_id."
  - q: "Can logical_date repeat in Airflow?"
    a: "Not within the same DAG — (dag_id, logical_date) carries a unique constraint and dag_run_id is a primary key. The rejection is by design and doubles as an idempotency guard for business-date-based triggers."
---

Calling the Airflow trigger API, the request goes out cleanly and your logs say "triggered" — and later you discover the DAG never ran; the task list is empty.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy. The platform's backfill script triggers an analysis DAG day by day; one repeated date parameter and the downstream silently misses an entire batch.

## Symptom: the API "succeeded", the DAG never ran

The trigger request completes without raising, the caller's log line says triggered — but Airflow shows no corresponding run and nothing executes. What makes this nasty: **it never surfaces in the triggerer's errors, only in the downstream question "why is this day missing?"**. If you searched for "Airflow API trigger no effect", "dagRun not created" or "trigger dag silently fails", same problem.

## Root cause: Airflow enforces (dag_id, logical_date) uniqueness on triggers

Within one DAG, `logical_date` cannot repeat (`dag_run_id` is a unique primary key too). Triggering again with an existing logical_date is rejected outright — verified on Airflow 3:

```text
POST /api/v2/dags/{dag_id}/dagRuns
HTTP 409
{"detail": {"reason": "Unique constraint violation", ...}}
```

The response is a 4xx — the status code and body both say "not triggered". The failure lives in how the caller consumes that response. The three most common misses:

- **No status-code check**: no network exception means "success", and the 4xx body gets discarded;
- **"Got a response" treated as success**: `resp.json()` parsed fine, therefore triggered — nobody looks for `dag_run_id`;
- **Error text lost in log noise**: the 409 detail is a constraint-violation blob that no grep keyword matches, so nobody reads it twice.

## The fix: a fresh logical_date per trigger, assert dag_run_id in the response

Two things, both mandatory. On the trigger side, backfills use a distinct logical_date per day (naturally increasing):

```python
from datetime import date, timedelta

for i in range(days):
    ld = (date(2026, 1, 1) + timedelta(days=i)).isoformat()
    trigger(dag_id, logical_date=ld)
```

On the caller side, make "response body contains `dag_run_id`" the only success criterion, with status codes as a secondary signal:

```python
import requests

def trigger(dag_id: str, logical_date: str) -> str:
    resp = requests.post(
        f"{BASE}/api/v2/dags/{dag_id}/dagRuns",
        headers=auth_headers(),
        json={"logical_date": logical_date},
    )
    body = resp.json()
    run_id = body.get("dag_run_id")
    if not run_id:
        # 409 = a run already exists for this logical_date; other 4xx/5xx are failures too
        raise TriggerFailed(f"{resp.status_code}: {body}")
    return run_id
```

The beauty of this criterion is that it's status-code agnostic: whatever the server answers, a body without `dag_run_id` means the trigger did not happen — one check covers every failure shape.

## Boundary cases: the rejection is sometimes exactly what you want

Worth stating the other side: **if your logical_date is the business date, the unique constraint is your idempotency guard**. Backfilling the same day twice — the second trigger gets a 409 and no duplicate run is created. In that scenario the move is not "make the trigger succeed" but "clear and rerun the existing run". Don't mix the two:

| Scenario | Correct move |
|----------|--------------|
| Backfill: one run per day | Fresh logical_date per trigger |
| Rerun the same business day | Don't re-trigger; clear + rerun the existing run |
| Deciding whether a trigger happened | Only trust `dag_run_id` in the body; status code secondary |

Also: manual triggers without a logical_date get a `manual__<timestamp>` run_id and corresponding logical_date from Airflow — inherently collision-free. The ones who hit this are callers constructing their own logical_date values.

<InfoBox variant="warning" title="Watch out">

- **Put the dag_run_id check inside your trigger wrapper** — scattered call sites guarantee one of them skips it, and that one silently drops a batch.
- **Alert on status-code classes, not message keywords** — the 409 detail is constraint-error text that no grep pattern reliably matches.
- **Business-date logical_dates are good practice**: clear semantics plus a free idempotency guard.

</InfoBox>

## FAQ

### What happens if I trigger the same Airflow DAG run twice via the API?

It gets rejected by a unique constraint: re-triggering with an existing logical_date returned HTTP 409 (Unique constraint violation) with no dag_run_id in the body, and the DAG never ran. Callers that only log the request miss the failure entirely.

### Why was my Airflow dagRun triggered but nothing ran?

The most common cause is a duplicate logical_date — Airflow enforces (dag_id, logical_date) uniqueness and answers 409, which an unchecked caller never notices. Rule: a trigger only succeeded if the response body contains a `dag_run_id`.

### Can logical_date repeat in Airflow?

Not within the same DAG — (dag_id, logical_date) carries a unique constraint and dag_run_id is a primary key. The rejection is by design and doubles as an idempotency guard for business-date-based triggers.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
