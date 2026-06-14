---
title: "Airflow PostgresHook Multi-Statement SQL Silently Drops Results? Split by Semicolon and Execute One by One"
description: "PostgresHook.get_pandas_df treats a multi-statement SQL string as a single execution, psycopg2 only returns the last result set, prior queries are silently dropped — split by top-level semicolons into a list and execute sequentially to fix"
date: 2026-06-14
tags: [Airflow, PostgreSQL, pandas, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I execute multiple SQL statements in Airflow PostgresHook?"
    a: "Pass list[str] instead of a single string. DbApiHook.get_pandas_df / run accept sql as a list and execute sequentially; a single string with semicolon-separated statements causes psycopg2 to return only the last result set."
  - q: "Why does get_pandas_df only return the last result for multi-statement SQL?"
    a: "pandas.io.sql.read_sql calls psycopg2 cursor.execute with the full string; the DBAPI protocol only exposes the cursor of the last result set for multi-statement execution, and prior SELECT results are silently dropped without any error."
  - q: "How do I split SQL by semicolon safely with comments and quotes?"
    a: "Scan character by character and split only at top-level semicolons outside single-quoted strings and -- line comments. Single-quote literals use the SQL-standard '' escape; do not use str.split(';'), it will mis-cut semicolons inside comments and strings."
---

When an Airflow DAG reads a `.sql` template file as a single string and passes it to `PostgresHook.get_pandas_df()`, prior SELECT results are silently dropped — the DAG reports "SQL query returned no results", but copying the same SQL into psql returns data normally.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics pipeline where an Airflow DAG reads multi-query report templates from `.sql` files and executes them.

## TL;DR

`PostgresHook.get_pandas_df(sql)` internally calls `pandas.read_sql(sql, conn)` → `psycopg2 cursor.execute(sql)`. When `sql` is a **single string** with multiple `;`-separated SELECTs, the DBAPI only exposes the cursor of the **last result set** — prior query results are silently dropped with no error. Fix: split by top-level semicolons into a `list[str]` and call `get_pandas_df` per statement, or pass the list directly so DbApiHook runs them sequentially.

## Symptom

The DAG task executing `shop_monthly_overview.sql` reports "SQL query returned no results":

```
sql_count = 1   ← template clearly contains 4 queries
result = "❌ SQL query returned no results"
```

But the same SQL pasted into psql against the same database with the same parameters returns data for all 4 SELECTs.

### Reproduction

Verify `get_pandas_df` behavior with multi-statement SQL directly inside the Airflow container:

```python
from airflow.providers.postgres.hooks.postgres import PostgresHook

hook = PostgresHook(postgres_conn_id="postgres_default")

# Three SELECTs concatenated into one string
sql = "SELECT 1 AS a; SELECT 2 AS b; SELECT 99 AS c WHERE 1=0;"

df = hook.get_pandas_df(sql)
print(df.columns.tolist())  # ['c']  ← only got the last statement's columns
print(df)                    # Empty  ← the last statement itself returns 0 rows
```

Expected three result sets, got only the last one (`SELECT 99 ... WHERE 1=0`, 0 rows). The first two **completely disappear** with no error or warning.

## Root Cause

The call chain is `PostgresHook.get_pandas_df` → `DbApiHook.get_pandas_df` → `pandas.io.sql.read_sql` → `psycopg2 cursor.execute(sql)`.

The DBAPI protocol (PEP 249) allows `execute` to accept a string with multiple `;`-separated statements. PostgreSQL executes all of them, but the **cursor only exposes the last result set** — this is inherent PostgreSQL wire protocol behavior, not an Airflow or pandas bug.

```
┌────────────────────────────────────────────────────┐
│ SELECT 1;  ← executed, result set 1 dropped at once │
│ SELECT 2;  ← executed, result set 2 dropped at once │
│ SELECT 99 WHERE 1=0;  ← executed, result set 3 exposed │
└────────────────────────────────────────────────────┘
                       ↓
            pandas.read_sql only fetches result set 3
```

The root cause in our code is `task_execute_sql` reading the entire `.sql` file as a single string and passing it to `get_pandas_df`:

```python
# ❌ Problematic code
sql_text = open(sql_path).read()  # full text with 4 SELECTs
df = pg_hook.get_pandas_df(sql_text)  # only gets the last result
```

Why does psql return data? Because the psql frontend actively iterates through all result sets and prints them one by one, while a DBAPI cursor does not.

## Solution

### Option A (Recommended): Split by top-level semicolon, execute one by one

Suitable for `.sql` template files — they contain comments, quotes, and multiple queries that need robust splitting.

```python
def split_sql_statements(sql: str) -> list:
    """
    Split SQL by top-level semicolons, correctly handling:
    - Semicolons inside single-quoted strings ('a;b' is not split)
    - SQL-standard '' escape ('it''s' is not split)
    - Semicolons inside -- line comments (-- note; not split is not split)
    """
    statements = []
    buf = []
    i, n = 0, len(sql)
    in_quote = False

    while i < n:
        ch = sql[i]

        # Inside a single-quoted string
        if in_quote:
            buf.append(ch)
            if ch == "'":
                # '' = literal single quote, does not end the string
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append(sql[i + 1])
                    i += 2
                    continue
                in_quote = False
            i += 1
            continue

        # Top level
        if ch == "'":
            in_quote = True
            buf.append(ch)
        elif ch == '-' and i + 1 < n and sql[i + 1] == '-':
            # Line comment, swallow to end of line (; inside is not a split point)
            while i < n and sql[i] != '\n':
                buf.append(sql[i])
                i += 1
            continue
        elif ch == ';':
            stmt = ''.join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        else:
            buf.append(ch)
        i += 1

    # Trailing block without a final semicolon
    stmt = ''.join(buf).strip()
    if stmt:
        statements.append(stmt)

    return statements


# Caller
sql_text = open(sql_path).read()
statements = split_sql_statements(sql_text)

# Execute one by one, collect all results
all_results = []
for idx, stmt in enumerate(statements, start=1):
    df = pg_hook.get_pandas_df(stmt)
    if not df.empty:
        all_results.append({
            "sql_index": idx,
            "sql": stmt,
            "data": df.to_dict("records"),
            "columns": df.columns.tolist(),
            "row_count": len(df),
        })
```

### Option B: Pass a list directly to DbApiHook

Airflow's `DbApiHook.run` and `get_records` accept `list[str]` and execute sequentially — but `get_pandas_df` return behavior in list mode is inconsistent across providers. For production, Option A gives you full control.

### Why not `sqlparse.split`?

Community answers often recommend `sqlparse.split(sqlparse.format(sql, strip_comments=True))`, but `strip_comments=True` **discards comments**. If your downstream processor depends on metadata in comments (e.g. `-- dimension: shop`), you lose context. A hand-rolled splitter preserves the original comment text and gives you control.

## Caveats

<InfoBox variant="warning" title="Caveats">

- Do not use `sql.split(';')` — it will mis-cut semicolons inside quoted strings like `WHERE name = 'a;b'`, and inside `-- comment;` line comments
- `split_sql_statements` only handles single-quoted strings and `--` line comments; if your SQL uses `/* block comments */` or dollar-quoted strings (`$$...$$`), extend the splitter
- After the fix, the semantics of `sql_index` for downstream processors change (1-based sequential index); audit all `df.iloc[sql_index]` style usages
- If your SQL is program-generated rather than file-read, the safer pattern is to **build a list at generation time** rather than split later
- A related trap: if you've also hit issues with SQL expressions being silently parameterized in Drizzle ORM, see [Drizzle sql template mixing parameterized values with SQL expressions](/blog/2026/05/18/drizzle-raw-sql-expression-as-parameter) — same family of "the framework did a transformation you didn't expect" bugs

</InfoBox>

## FAQ

### How do I execute multiple SQL statements in Airflow PostgresHook?

Pass `list[str]` instead of a single string. `DbApiHook.get_pandas_df` and `run` accept `sql` as a list and execute sequentially; a single string with semicolon-separated statements causes psycopg2 to return only the last result set. For production, split yourself and call per-statement so you control result aggregation and `sql_index`.

### Why does get_pandas_df only return the last result for multi-statement SQL?

`pandas.io.sql.read_sql` calls `psycopg2 cursor.execute` with the full string; the DBAPI protocol only exposes the cursor of the last result set for multi-statement execution, and prior SELECT results are dropped by the server immediately, with no error or warning. psql returns data because its frontend actively iterates all result sets, while a DBAPI cursor does not.

### How do I split SQL by semicolon safely with comments and quotes?

Scan character by character and split only at top-level semicolons outside single-quoted strings and `--` line comments. Single-quote literals use the SQL-standard `''` escape; do not use `str.split(';')`, it will mis-cut semicolons inside comments and strings. If you use `sqlparse.split`, note that `strip_comments=True` discards the original comment text.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
