---
title: "Postgres Lateral Can't See the UPDATE Target? Use a CTE"
description: "A lateral in UPDATE FROM can't see the target table at any depth — rewrite as a CTE; drizzle-kit swallows this error, so verify with psql first."
date: 2026-11-23
tags: [PostgreSQL, SQL, Drizzle]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What does 'invalid reference to FROM-clause entry for table' mean in Postgres?"
    a: "A FROM entry exists but can't be referenced from where you used it. The classic trigger: a lateral subquery in UPDATE/DELETE FROM referencing the target table — Postgres rejects every position, top level included (verified on PG 16); the HINT says 'cannot be referenced from this part of the query'."
  - q: "Can a lateral subquery reference the UPDATE target table in Postgres?"
    a: "No — not at any position. Unlike SELECT, where a lateral sees earlier FROM items, UPDATE and DELETE give the lateral zero visibility into the target table at any nesting depth (PG 16 verified, top level included). Move the correlated reads into a CTE and join by key."
  - q: "Why does drizzle-kit migrate fail with no error output?"
    a: "The postgres-js driver swallows the error: exit 1 with nothing but two unrelated NOTICEs on stderr. It once left a dev database stuck three migrations behind with no alert. Run complex SQL through psql -v ON_ERROR_STOP=1 first."
  - q: "What is the correct rewrite for UPDATE FROM lateral?"
    a: "A CTE joined by key: WITH src AS (SELECT id, settings->>'k' AS v FROM target) UPDATE target t SET ... FROM src WHERE t.id = src.id. The CTE is a plain SELECT with no reference restrictions; verified on PG 16 with UPDATE 1, and idempotent as UPDATE 3 then UPDATE 0 on a real migration."
---

In a migration pipeline for a Node.js + PostgreSQL service, a data-migration SQL using `UPDATE ... FROM lateral` was rejected by psql with a clear error; the same file handed to drizzle-kit migrate failed silently — exit 1, with nothing but two unrelated NOTICEs in the output.

## TL;DR

The UPDATE/DELETE target table has **zero visibility inside a lateral**: top-level references fail, nested ones fail too — the SELECT intuition that "a lateral sees earlier FROM items" simply does not apply here. psql states the error plainly, while drizzle-kit (postgres-js driver) swallows it into a silent exit, which left a dev database's migration ledger three versions behind. Fix: **rewrite every correlated reference to the target table as a CTE with correlated subqueries**, and verify complex migrations with `psql -v ON_ERROR_STOP=1` before they reach the toolchain.

## Symptoms: psql speaks up, drizzle-kit says nothing

The same migration file, two execution paths, opposite behavior: psql shows the error, drizzle-kit fails quietly.

The psql-side error, verbatim:

```sql
ERROR:  invalid reference to FROM-clause entry for table "t"
LINE 1: ... UPDATE tenants AS t SET settings = t.settings FROM lateral (SELECT t.settings ...
                                                              ^
HINT:  There is an entry for table "t", but it cannot be referenced from this part of the query.
```

The first instinct was "the reference is written wrong": move the target-table reference into the lateral's select list — still rejected; wrap it one level deeper in a scalar subquery — the same error again. Two edits died on the same sentence, which is what forced a change of direction: this is not about where you place the reference. Search phrasing for the same problem varies — "postgres update from lateral", "lateral reference to the outer update table" — all pointing at the same semantic gap.

The drizzle-kit side was worse: `pnpm db:migrate` exited 1 on the same file, stderr holding only two unrelated NOTICEs, no error message at all. The dev database's migration ledger stayed at 0027, three later migrations never applied, and tenant settings were missing the new keys — no alert anywhere in the process.

> For why migration ledgers fall behind silently and how to reconcile them at deploy time, see [drizzle-kit migrate: table missing? Journal silently skipped](/blog/drizzle-kit-migrate-silent-skip) — same lesson: never trust a green tool alone.

## Root cause: the lateral has zero visibility into the UPDATE target

The conclusion, stated hard: the UPDATE/DELETE target table **cannot be referenced from a lateral at any position** — not "only at the top level", but nowhere.

In SELECT, a lateral sees the FROM items before it; carried over to UPDATE ... FROM, that intuition breaks: Postgres removes the target table from the lateral's visible set entirely in UPDATE/DELETE context. The HINT says it all — the entry exists, but it cannot be referenced from this part of the query, and both the top level and nested levels count as "this part". That is exactly why moving the reference into the select list still failed: no legal position exists.

A minimal reproduction on PG 16 (temp tables suffice; both variants fail with the identical message):

```sql
BEGIN;
CREATE TEMP TABLE t0 (id int PRIMARY KEY, settings jsonb);
INSERT INTO t0 VALUES (1, '{"a":"1","b":"2"}');

-- Variant A: lateral top level references target t → rejected
UPDATE t0 AS t
SET settings = t.settings
FROM lateral (SELECT t.settings->>'a' AS va) x
WHERE t.id = 1;
-- ERROR: invalid reference to FROM-clause entry for table "t"

-- Variant B: one nested scalar subquery to "relay" the value → same error
UPDATE t0 AS t
SET settings = t.settings
FROM lateral (SELECT (SELECT t.settings->>'b') AS vb) x
WHERE t.id = 1;
ROLLBACK;
```

Of the two failure sources, the drizzle-kit half is the more dangerous: swallowed error → no logs → dev state lags indefinitely with no alert. The psql half at least says something every time.

## Fix: move correlated reads into a CTE

Put the reads of the target table into a plain CTE and let UPDATE ... FROM do a key join only — semantically equivalent to the original lateral intent, with no reference-position restrictions. This is the final shape of that 0029 migration:

```sql
WITH src AS (
  SELECT id,
         settings->>'daily_remind'    AS v1,
         settings->>'daily_remind_at' AS v2
  FROM tenants
  WHERE settings ? 'daily_remind'
)
UPDATE tenants AS t
SET settings = t.settings || jsonb_build_object('remind_time', src.v2)
FROM src
WHERE t.id = src.id;
```

The CTE is an ordinary SELECT — no restrictions on referencing the target table; UPDATE ... FROM src does an equality join only.

The matching minimal check (PG 16, fully self-contained — the previous block's temp table was rolled back, this one rebuilds it):

```sql
BEGIN;
CREATE TEMP TABLE t0 (id int PRIMARY KEY, settings jsonb);
INSERT INTO t0 VALUES (1, '{"a":"1","b":"2"}');

WITH src AS (
  SELECT id, settings->>'a' AS va
  FROM t0
  WHERE settings->>'a' IS NOT NULL
)
UPDATE t0 AS t
SET settings = t.settings || jsonb_build_object('a_cte', src.va)
FROM src
WHERE t.id = src.id;
-- UPDATE 1
ROLLBACK;
```

Three verification passes after the rewrite: the same file verified through both the pg 8.16 node driver and psql; applied twice to the dev database — UPDATE 3 the first run, UPDATE 0 the second — idempotent; ledger reconciled after backfilling, `__drizzle_migrations` count equal to the migration file count.

<InfoBox variant="warning" title="Before you ship">

- The SELECT lateral intuition does not carry to UPDATE/DELETE FROM: rewrite correlated references to the target as CTE + correlated subqueries, never lateral.
- Verify complex data migrations with dev `psql -v ON_ERROR_STOP=1` before they reach the drizzle-kit toolchain — never trust a green tool alone.
- After drizzle-kit migrations, reconcile the ledger count against the file count routinely; a "done" with no output counts as a failure.

</InfoBox>

## FAQs

### What does 'invalid reference to FROM-clause entry for table' mean in Postgres?

A FROM entry exists but can't be referenced from where you used it. The classic trigger: a lateral subquery in UPDATE/DELETE FROM referencing the target table — Postgres rejects every position, top level included (verified on PG 16); the HINT says `cannot be referenced from this part of the query`. Other common causes are join order or alias scope mistakes.

### Can a lateral subquery reference the UPDATE target table in Postgres?

No — not at any position. Unlike SELECT, where a lateral sees earlier FROM items, UPDATE and DELETE give the lateral zero visibility into the target table at any nesting depth (PG 16 verified, top level included). Move the correlated reads into a CTE and join by key.

### Why does drizzle-kit migrate fail with no error output?

The postgres-js driver swallows the error: exit 1 with nothing but two unrelated NOTICEs on stderr. It once left a dev database stuck three migrations behind with no alert. Run complex SQL through `psql -v ON_ERROR_STOP=1` first.

### What is the correct rewrite for UPDATE FROM lateral?

A CTE joined by key: `WITH src AS (SELECT id, settings->>'k' AS v FROM target) UPDATE target t SET ... FROM src WHERE t.id = src.id`. The CTE is a plain SELECT with no reference restrictions; verified on PG 16 with UPDATE 1, and idempotent as UPDATE 3 then UPDATE 0 on a real migration.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
