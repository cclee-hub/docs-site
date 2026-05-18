---
title: "UPSERT Writes All Zeros? Drizzle sql Template Pitfall with Parameterized Values vs SQL Expressions"
description: "Drizzle ORM's sql template parameterizes all values including SQL expressions like date_trunc(), causing PostgreSQL invalid input syntax errors and silent zero-value writes"
date: 2026-05-18
tags: [Drizzle, PostgreSQL, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I correctly use SQL functions like date_trunc() in Drizzle's sql template?"
    a: "SQL expressions must use sql.raw() or be written directly in the sql`` template — never passed through sql.join(map(v => sql`${v}`)) as parameterized values."
  - q: "Why does Drizzle parameterizing date_trunc() cause an invalid input syntax error?"
    a: "Drizzle passes it as a plain string parameter. PostgreSQL tries to parse it as a date literal and fails."
---

Encountered this issue while building an e-commerce analytics platform for a client. Here's the root cause and solution.

## TL;DR

In Drizzle ORM's `sql` template tag, `sql.join(values.map(v => sql(v)))` **parameterizes all values**. If the values array contains SQL expressions (like `date_trunc('week', '2026-05-17'::date)::date`), PostgreSQL treats them as plain strings and throws `invalid input syntax for type date`. **SQL expressions must use `sql.raw()` or be written separately in the template**.

## The Problem

Data collection pipeline: Chrome extension → CCLHub server → Analytics API → PostgreSQL. Symptoms:

1. CCLHub logs show correct collected data (`uv: 403, payAmt: 19478.47`)
2. Analytics API returns 200 success
3. But database query shows **all zeros**: `uv: 0, pay_amt: 0.00`

```sql
-- Actual database data
 report_date | uv  | pay_amt  | reveal_cnt
-------------+-----+----------+------------
 2026-05-12  | 392 |  7333.67 |      11879  -- old data fine
 2026-05-13  |   0 |     0.00 |          0  -- new data all zeros!
```

Analytics error log reveals:

```
PostgresError: invalid input syntax for type date:
  "date_trunc('week', '2026-05-17'::date)::date"
```

## Root Cause

The original code mixed parameterized values with SQL expressions:

```typescript
// ❌ Problem code
const insertVals: (string | number | null)[] = [
  String(shop_id),
  String(platform_id),
  reportDate,
  tenant_id,
  `date_trunc('week', '${reportDate}'::date)::date`, // ← SQL expression
];

// sql.join parameterizes ALL values, including the date_trunc expression
await db.execute(sql`
  INSERT INTO table (..., week_start_date)
  VALUES (${sql.join(insertVals.map(v => sql`${v}`), sql`,`)})
  ...
`);
```

Generated SQL:

```sql
-- PostgreSQL receives $5 as a literal string value
INSERT INTO table (..., week_start_date)
VALUES ($1, $2, $3, $4, $5, ...)
-- $5 = "date_trunc('week', '2026-05-17'::date)::date"  ← treated as string!
```

PostgreSQL tries to parse `"date_trunc('week', '2026-05-17'::date)::date"` as a date type → error.

**Why zeros instead of an error?** Because the same table has a separate inquiry INSERT (PARTIAL UPSERT) that succeeded, creating rows with dashboard columns defaulting to 0. The daily report UPSERT failed but didn't roll back the existing rows.

## Solution

Separate SQL expressions from parameterized values using `sql.raw()` or direct template embedding:

```typescript
// ✅ Fix: separate parameterized values from SQL expressions
const insertCols = ['shop_id', 'platform_id', 'report_date', 'tenant_id'];
const insertVals: (string | number | null)[] = [
  String(shop_id), String(platform_id), reportDate, tenant_id,
];

// 19 data columns parameterized normally
for (const [apiKey, dbCol] of Object.entries(DAILY_COLUMNS)) {
  insertCols.push(dbCol);
  insertVals.push(row[apiKey] != null ? String(row[apiKey]) : '0');
}

// week_start_date uses SQL expression, NOT in parameterized array
await db.execute(sql`
  INSERT INTO table (${sql.raw(insertCols.join(', '))}, week_start_date)
  VALUES (
    ${sql.join(insertVals.map(v => sql`${v}`), sql`,`)},
    date_trunc('week', ${reportDate}::date)::date  -- ← directly in template
  )
  ...
`);
```

Key distinction:

| Approach | How Drizzle handles it | What PostgreSQL receives |
|----------|----------------------|------------------------|
| `sql` template interpolation | Parameterized (`$N`) | String literal |
| `sql.raw(expression)` | Inlined into SQL | SQL expression |
| Direct in `sql` template | Part of template | SQL expression |

## Caveats

<InfoBox variant="warning" title="Caveats">

- `sql.raw()` has SQL injection risk — **never** use it for user input. In this example, `reportDate` comes from an internal API with controlled format
- Drizzle's `sql` template tag auto-parameterizes all interpolations — this is a safety feature, but SQL function calls shouldn't be parameterized
- If the entire SQL is dynamically constructed, consider using Drizzle's query builder API instead of raw SQL
- Database connection config has its own pitfalls — if you're [connecting to the wrong PostgreSQL instance](/blog/2026/05/09/wsl-docker-postgresql-port-conflict), Docker might be silently occupying the port
- Environment variable loading order is another common trap — [JWT signing silently failing](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order) is a classic example of dotenv running after the import chain

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
