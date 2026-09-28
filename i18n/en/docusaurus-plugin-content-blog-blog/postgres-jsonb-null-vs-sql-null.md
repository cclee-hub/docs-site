---
title: "jsonb IS NOT NULL passes for JSON null? Use jsonb_typeof"
description: "IS NOT NULL passes for JSON null in jsonb — a valid value, not SQL NULL. Use ? for key existence, jsonb_typeof for value type; ->> cannot tell them apart."
date: 2026-09-28
tags: [PostgreSQL, SQL, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What is the difference between JSON null and SQL NULL in Postgres jsonb?"
    a: "JSON null is a valid jsonb value; SQL NULL means the value does not exist. Tested: ('{\"a\":null}'::jsonb -> 'a') IS NOT NULL returns true; jsonb_typeof returns the string 'null' for the former and SQL NULL for a missing key."
  - q: "Why doesn't IS NOT NULL filter out empty jsonb values?"
    a: "->'key' returns a valid jsonb value for JSON null, so IS NOT NULL is trivially true. Assert the type instead — jsonb_typeof(field->'key') = 'array' — or check key existence with the ? operator."
  - q: "How do I tell a JSON null value from a missing key in jsonb?"
    a: "Use the ? operator for key existence — it returns true even when the value is JSON null. jsonb_typeof returns the string 'null' for a JSON null value and SQL NULL for a missing key, which tells the two apart."
---

Filtering a jsonb field's "empty" values with `IS NOT NULL` lets rows whose value is JSON null sail right through — the data is empty, yet the predicate says otherwise.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy. Analysis decision snapshots are stored as jsonb; rows where no rule fired get JSON null written in, which silently corrupted the "has rule output" predicate.

## Symptom: IS NOT NULL doesn't catch the "empty" value

`field->'key' IS NOT NULL` returns true for rows whose value is JSON null — the filter does nothing, and rows that should be excluded leak into the result set. If you searched for "jsonb is not null not working", "jsonb null filter" or "postgres json null check", this is the same issue.

## Root cause: JSON null is a valid jsonb value, not SQL NULL

PostgreSQL has two kinds of "empty" here: **SQL NULL means no value exists; JSON null is a legitimate jsonb value**. The `->` operator retrieves what the key holds — for JSON null, that's a perfectly valid value, and `IS NOT NULL` answers "did I get something back?", not "is it meaningful?". Verified behavior matrix (tested on a PostgreSQL 16 container):

| Expression | Result |
|------------|--------|
| `('{"a":null}'::jsonb -> 'a') IS NOT NULL` | `true` |
| `('{"a":1}'::jsonb -> 'b') IS NULL` | `true` (missing key yields SQL NULL) |
| `jsonb_typeof('{"a":null}'::jsonb -> 'a')` | `'null'` (a string) |
| `jsonb_typeof('{"a":1}'::jsonb -> 'b')` | SQL NULL |
| `'{"a":null}'::jsonb ? 'a'` | `true` |
| `('{"a":null}'::jsonb ->> 'a') IS NULL` | `true` |

Two combinations bite most often:

- **`IS NOT NULL` cannot tell JSON null from a real value** — the first row, exactly where the misjudgment comes from.
- **Extracting text with `->>` and testing `IS NULL` fails the same way** — JSON null and a missing key both become SQL NULL (last row). Reaching for `->>` to dodge the trap lands you right back in it.

## The fix: ? for key existence, jsonb_typeof for value type

Two different intents need two different tools:

```sql
-- "key exists": value irrelevant
SELECT '{"a":null}'::jsonb ? 'a';                          -- true

-- "has a real value": assert the JSON type; 'null', missing keys all excluded
SELECT jsonb_typeof(config->'rule_output') = 'array';      -- arrays only
SELECT jsonb_typeof(config->'rule_output') = 'object';     -- objects only

-- find rows that hold a JSON null (data triage)
SELECT * FROM t WHERE jsonb_typeof(config->'rule_output') = 'null';
```

Our concrete case: the rule engine writes JSON null into decision snapshots when no rule fired, and a downstream count used `->'rule_output' IS NOT NULL` as "has rule output" — the metric was simply wrong. The fix tightened the assertion to `jsonb_typeof(...) = 'array'`, excluding JSON null, missing keys and every other type in one stroke.

## Boundary cases: JSON null is not always wrong

To be clear: JSON null is a legitimate design — "key exists but empty" and "key absent" are different business semantics; an API returning `"extra": null` is not the same as omitting `extra`. The data isn't wrong; the predicate is. Three intents, three spellings:

| Intent | Expression |
|--------|------------|
| Key exists (value irrelevant) | `jsonb ? 'key'` |
| Real value of a given type | `jsonb_typeof(x) = 'array' / 'object' / ...` |
| Value is JSON null | `jsonb_typeof(x) = 'null'` |

A related trap lives on the update side: `jsonb_set(config, '{rule_output}', 'null')` writes a JSON null, while `jsonb_set(config, '{rule_output}', NULL)` deletes the key entirely — JSON vs SQL NULL as the argument flips the meaning. For other "query results don't match expectations" hunts, [cross-query granularity mismatches causing dangling references](/blog/sql-cross-query-granularity-mismatch) are another frequent root cause worth comparing.

<InfoBox variant="warning" title="Watch out">

- **Triage existing data before changing predicates**: run `jsonb_typeof(...) = 'null'` across the table first to size up where JSON null rows come from, then decide whether to fix the query or the writer.
- **Standardize the spelling in your team**: even if a field currently always holds a valid array and `IS NOT NULL` happens to work, use `jsonb_typeof` assertions uniformly — the moment the field's semantics shift, the loose spelling becomes a silent bug.
- **The same applies at the ORM/driver layer**: when application code checks "JSON field is not empty", know what your driver maps JSON null to (most languages map it to a language-level null/None) — don't conflate the two kinds of empty.

</InfoBox>

## FAQ

### What is the difference between JSON null and SQL NULL in Postgres jsonb?

JSON null is a valid jsonb value; SQL NULL means the value does not exist. Tested: `('{"a":null}'::jsonb -> 'a') IS NOT NULL` returns true; `jsonb_typeof` returns the string `'null'` for the former and SQL NULL for a missing key.

### Why doesn't IS NOT NULL filter out empty jsonb values?

`->'key'` returns a valid jsonb value for JSON null, so `IS NOT NULL` is trivially true. Assert the type instead — `jsonb_typeof(field->'key') = 'array'` — or check key existence with the `?` operator.

### How do I tell a JSON null value from a missing key in jsonb?

Use the `?` operator for key existence — it returns true even when the value is JSON null. `jsonb_typeof` returns the string `'null'` for a JSON null value and SQL NULL for a missing key, which tells the two apart.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
