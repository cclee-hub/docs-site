---
title: "PostgreSQL ON CONFLICT: there is no unique constraint? Sync INSERTs after changing the unique key"
description: "PostgreSQL raises there is no unique or exclusion constraint matching the ON CONFLICT specification (SQL state 42P10): the ON CONFLICT column set must exactly match a UNIQUE constraint or unique index. When you change the unique key, every INSERT must be updated, and the migration must ship back-to-back with the write side."
date: 2026-07-04
tags: [PostgreSQL, SQL, Database]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Does PostgreSQL ON CONFLICT require a unique constraint?"
    a: "Only when you specify columns. ON CONFLICT (cols) must match an existing UNIQUE constraint or unique index exactly. With no matching constraint, use ON CONFLICT DO NOTHING without columns — it specifies no arbiter and needs no index."
  - q: "Can PostgreSQL ON CONFLICT target multiple unique constraints?"
    a: "No. A single INSERT can name only one arbiter constraint (one column set or one index name). To handle different unique keys differently, split into multiple writes or query first in the application layer before deciding insert vs update."
  - q: "How to fix there is no unique or exclusion constraint matching the ON CONFLICT specification?"
    a: "This is error 42P10 — the ON CONFLICT column set has no matching unique index. Verify a UNIQUE constraint covers those columns, that column order matches, and that INSERTs were updated after any unique-key change. For a partial unique index, ON CONFLICT must also carry the same WHERE clause."
---

Right after tightening a table's unique key — dropping a column that no longer discriminated between rows — every previously working UPSERT immediately failed in bulk with `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics pipeline that surfaces market trends, user behavior, and sales data for precise operations.

## TL;DR

PostgreSQL's `ON CONFLICT (cols)` requires `cols` to exactly match an existing unique constraint or unique index (same columns, same order — otherwise SQL state 42P10). The moment you `ALTER` the unique key, every `INSERT ... ON CONFLICT` that references it must be updated; and once the migration lands, the write side must deploy immediately, because the in-between window keeps erroring.

## The symptom

As soon as the unique-key change went live, the scheduled import job failed across the board, with only this line in the write log:

```
ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
SQL state: 42P10
```

Zero rows written to the business table, while plain `SELECT`s against the same table worked fine — the failure was isolated to the `ON CONFLICT` write path.

## Root cause

The column set you pass to `ON CONFLICT (cols)` is the **arbiter**. PostgreSQL requires it to exactly match some `UNIQUE` constraint or unique index on the table:

- the set of columns must be the same;
- the order of columns must be the same;
- for a partial unique index (one with a `WHERE`), `ON CONFLICT` must carry the same `WHERE`.

When nothing matches, PostgreSQL has no index to decide what "conflict" means, and raises 42P10.

The classic trigger is **shrinking a unique key**. The original key had 3 columns; you realize one of them (say `audience`) has 4 distinct values whose metric rows are 100% identical — pure redundancy — so you drop it down to 2 columns. That's the right optimization, but the old `INSERT` still says `ON CONFLICT (c1, c2, c3)` while only `(c1, c2)` remains as a unique constraint. The arbiter has no landing spot, and the statement errors out.

```text
old unique key: UNIQUE (store_id, metric_key, audience)
new unique key: UNIQUE (store_id, metric_key)

old INSERT: ON CONFLICT (store_id, metric_key, audience)   ← no match
```

## The fix

Here is a minimal reproduction — create, trigger, and fix in one go, runnable directly in psql:

```sql
-- 1. A table with a 3-column unique key
CREATE TABLE daily_metric (
    store_id   TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    audience   TEXT NOT NULL,
    value      NUMERIC,
    CONSTRAINT daily_metric_unique UNIQUE (store_id, metric_key, audience)
);

-- 2. Old UPSERT: ON CONFLICT includes audience
INSERT INTO daily_metric (store_id, metric_key, audience, value)
VALUES ('s1', 'revenue', 'visitor', 100)
ON CONFLICT (store_id, metric_key, audience)
DO UPDATE SET value = EXCLUDED.value;

-- 3. Shrink the unique key: drop audience
ALTER TABLE daily_metric
    DROP CONSTRAINT daily_metric_unique,
    ADD  CONSTRAINT daily_metric_unique_new UNIQUE (store_id, metric_key);

-- 4. Re-run the INSERT from step 2 — it now errors ↓
-- ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

The fix is to shrink the `INSERT`'s `ON CONFLICT` columns to match the 2-column key. Since `audience` no longer discriminates, pin it to a literal on the write side so incoming parameters can't synthesize extra rows:

```sql
INSERT INTO daily_metric (store_id, metric_key, audience, value)
VALUES ('s1', 'revenue', 'visitor', 100)
ON CONFLICT (store_id, metric_key)         -- ← shrunk to match
DO UPDATE SET value = EXCLUDED.value;
```

The part that actually bites is the **deployment order**, not the SQL itself:

1. Ship the migration first (`DROP` old constraint + `ADD` new constraint);
2. Immediately ship the write-side code (the `INSERT`'s `ON CONFLICT` becomes 2 columns);
3. Leave no gap between the two — old code against the new schema raises 42P10, and new code against the old schema raises 42P10 just the same (no 2-column unique constraint exists yet).

If you use an ORM like Drizzle, an `ON CONFLICT` column list baked into a `sql` template is easy to forget when the schema changes — the cost of schema/write-side drift shows up in [another Drizzle + PostgreSQL pitfall](/blog/2026/05/18/drizzle-raw-sql-expression-as-parameter) too.

## Caveats

<InfoBox variant="warning" title="Caveats">

- **Column order matters**: `ON CONFLICT (a, b)` does not match `UNIQUE (b, a)` — the order must agree.
- **Partial unique indexes need the WHERE**: if the arbiter is `UNIQUE ... WHERE active`, the `INSERT` must read `ON CONFLICT (cols) WHERE active DO ...`, or you get 42P10 all the same.
- **"Just skip on any conflict"**: use `ON CONFLICT DO NOTHING` without columns — it specifies no arbiter and matches no specific index, catching every conflict.
- **During rollout**: old and new write-side versions may briefly coexist. Make sure both can match the current schema, or ship the migration and the code together with no window in between.

</InfoBox>

## FAQ

### Does PostgreSQL ON CONFLICT require a unique constraint?

Only when you name columns. `ON CONFLICT (cols)` must match an existing `UNIQUE` constraint or unique index exactly, or you get 42P10. If you just want "skip on any conflict" without caring which constraint fired, use `ON CONFLICT DO NOTHING` without columns — it needs no specific index.

### Can PostgreSQL ON CONFLICT target multiple unique constraints?

No. A single `INSERT`'s `ON CONFLICT` can name only **one** arbiter constraint (one column set, or one index name). A table may have multiple unique keys, but a single statement picks exactly one for conflict detection. To handle different unique keys differently, either split into multiple writes or query first in the application layer before choosing `INSERT` vs `UPDATE`.

### How to fix there is no unique or exclusion constraint matching the ON CONFLICT specification?

That is error code 42P10: the `ON CONFLICT` column set has no matching unique index on the table. Check in order: a `UNIQUE` constraint covers those columns, the columns and their order match exactly, and any `INSERT` was updated after a recent unique-key change. If the arbiter is a partial unique index with a `WHERE`, add the same `WHERE` clause to `ON CONFLICT`.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
