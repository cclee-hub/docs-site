---
title: "PostgreSQL migration left orphan empty tables behind? Audit schema leftovers with information_schema"
description: "After a data-source switch or refactor, tables that were only CREATEd in an early migration and have zero runtime references become orphan empty-table leftovers (stale fields, unnormalized columns). Use information_schema.tables to list all tables in a schema, compare against code references, then write a DROP migration to clean them up."
date: 2026-08-08
tags: [PostgreSQL, SQL, DevOps]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I list all tables in a PostgreSQL database?"
    a: "Query information_schema.tables, filtering by table_schema and table_type='BASE TABLE' to list all base tables in a schema. It's more scriptable than psql's \\dt and is the SQL standard, so the same query is portable across databases."
  - q: "How do I find unused or orphan tables in PostgreSQL?"
    a: "List all tables with information_schema.tables, then compare against references in your codebase or query logs. Tables with zero runtime references and no writes are orphan candidates; confirm row count with SELECT count(*) before dropping."
  - q: "What's the difference between information_schema and pg_catalog?"
    a: "information_schema is the SQL-standard catalog — cross-database portable and field-stable. pg_catalog is PostgreSQL-specific and more detailed, but can change between versions. For portable schema audits, prefer information_schema."
---

After switching an ads data source from daily tables to weekly tables, I found an empty table still sitting in the schema — one that was only ever `CREATE`d in the earliest migration, held zero rows, and was never referenced by runtime code. It even carried stale field names and unnormalized columns.

Encountered this while building [AI Ops](/docs/ai-analytics) — AI-powered analytics that surfaces market trends, user behavior, and sales data to drive precise operational strategy. After this data-source switch, the write path had long since moved to the new weekly tables and a cleanup migration had already dropped the old daily table. The one thing missed was a monthly table that existed only in the baseline `CREATE` — it had no new writes, no corresponding `DROP`, and just sat dormant in the schema with its deprecated field definitions.

## TL;DR

The signature of an orphan table: **only `CREATE`d in an early/baseline migration, zero references in current code, often with stale or unnormalized column names**. Batch migrations don't touch these automatically. You have to actively list every table in the schema with `information_schema.tables`, compare against code references, identify the orphans, and write a `DROP` migration to clean them up — not just `psql` your way to a one-off delete.

## The symptom

A typical orphan table looks like this:

- **Zero rows** — the business stopped writing to it long ago;
- **Zero runtime references** — no `SELECT`/`INSERT` anywhere in code, only the `CREATE` in a migration file;
- **Stale fields** — column names from a previous naming convention (e.g. `ad_plan_id`/`product_id`), out of step with current standards;
- **Unnormalized columns** — possibly even Chinese column names that were never cleaned up.

It doesn't crash and doesn't affect production, so from a "nothing's broken online" perspective it's invisible. But the harm is implicit: it misleads newcomers into thinking it's still in use, pollutes the schema namespace, adds noise to cross-table audits, and could be read as dirty data by some mistaken `SELECT *`.

## Root cause

Database migrations follow a pervasive pattern: **migrations are "additive".**

A data-source switch typically evolves like this:

1. An early baseline migration `CREATE`s a batch of tables (daily, monthly);
2. Once the business runs, the write path starts depending on them;
3. Requirements change, new tables (weekly) are introduced, and writes migrate over;
4. The old daily table's writes stop, and a migration `DROP`s it;
5. **But the monthly table (or any table that was only ever `CREATE`d in the baseline and never directly used by the write path) gets no corresponding `DROP`.**

The problem is step 5: migration attention focuses on "tables in use right now" — which ones are being written, which ones queries hit. A table that "once existed but never entered the main path" is in neither the write path nor the query path, so it never triggers a `DROP` and becomes an orphan. This is the same family as [Airflow DAG metadata lingering after deletion](/blog/airflow-delete-dag-metadata-residual): "removed the entry, forgot to clean the structure" — a high-frequency failure mode in migration work.

## The fix

Core flow: **list all tables → compare references → confirm empty → write a DROP migration → verify**.

### Step 1: list all base tables in the schema with information_schema

```sql
-- List all base tables in a schema (exclude views)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'your_schema'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

`information_schema.tables` is a SQL-standard catalog view, portable across PostgreSQL/MySQL/SQL Server with stable fields — ideal for baking into an audit script.

### Step 2: grep the codebase to confirm runtime references

For each candidate table, search for references in the codebase, **excluding migration files themselves**:

```bash
# Search runtime code references, excluding the migrations directory
grep -rn "ad_product_monthly_stats" src/ --include="*.py" \
  | grep -v "migrations/"
# 0 lines of output → no runtime reference, it's a candidate
```

Zero references is the key evidence for an orphan. Make sure to exclude the migration directory — the `CREATE` in the baseline doesn't count as a "reference".

### Step 3: confirm it's empty

```sql
SELECT count(*) FROM your_schema.ad_product_monthly_stats;
-- 0 → confirmed no data, safe to clean up
```

Be extra careful with tables that have data: first confirm they're truly abandoned (not just recently unwritten), and back up logically if in doubt.

### Step 4: write a DROP migration (not a manual delete)

```sql
-- db-migrations/{project}/027_drop_ad_product_monthly_stats.sql
DROP TABLE IF EXISTS your_schema.ad_product_monthly_stats;
```

**Always go through a migration file**: it's version-controlled, replayed consistently across environments (dev/staging/prod), and leaves an audit trail. A one-off `psql` delete only works on the current machine — on another box, the table grows back.

### Step 5: verify the drop

```sql
SELECT to_regclass('your_schema.ad_product_monthly_stats');
-- Returns NULL → the table no longer exists
```

`to_regclass()` is the standard way to check whether a relation exists; `NULL` confirms the drop succeeded.

### Batch audit: sweep same-prefix siblings at once

After dropping one table, list all same-prefix siblings and walk through each — avoid "dropped one, missed its siblings":

```sql
-- List all tables under a prefix, run steps 2-5 on each
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'your_schema'
  AND table_name LIKE 'ad_%'
ORDER BY table_name;
```

<InfoBox variant="warning" title="Caveats">

- **Back up / snapshot before DROP**: dropping a production table is irreversible. For any table with data, confirm it's abandoned and export a logical backup first (e.g. `CREATE TABLE ... AS SELECT` into an archive schema).
- **Check foreign-key dependencies**: if another table has a FK pointing at it, `DROP TABLE` fails. Confirm dependencies are resolved, or deliberately use `CASCADE` — but `CASCADE` cascades the deletion to dependent objects, so use it carefully in production.
- **Use a migration, not manual psql**: a manual delete only affects the current environment; a migration file guarantees multi-environment consistency and leaves a record.
- **Audit by prefix**: one switch usually involves a group of same-prefix tables (e.g. `ad_*`). After cleaning one, sweep the siblings with `LIKE 'ad_%'` to proactively catch the same class of leftovers.

</InfoBox>

## FAQ

### How do I list all tables in a PostgreSQL database?

Query `information_schema.tables`, filtering by `table_schema` and `table_type = 'BASE TABLE'` to list all base tables in a schema. It's more scriptable than psql's `\dt`, and because it's the SQL standard, the same query is portable across databases.

### How do I find unused or orphan tables in PostgreSQL?

List all tables with `information_schema.tables`, then compare against references in your codebase or query logs. Tables with zero runtime references and no writes are orphan candidates; confirm the row count with `SELECT count(*)`, and once you've verified no data and no foreign-key dependencies, write a `DROP` migration to clean them up.

### What's the difference between information_schema and pg_catalog?

`information_schema` is the SQL-standard catalog view — portable across PostgreSQL/MySQL/SQL Server with stable fields, ideal for portable audit scripts. `pg_catalog` is the PostgreSQL-specific catalog, richer and more detailed (e.g. precise row-count estimates, storage details) but subject to change between versions. For portable schema audits, prefer `information_schema`.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
