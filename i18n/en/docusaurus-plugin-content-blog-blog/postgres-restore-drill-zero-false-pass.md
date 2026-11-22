---
title: "Postgres Table Count 0=0? Schema Is Not the Database Name"
description: "Restore drill always passes at 0=0 table counts? The query treated the database name as table_schema while psql connected to the maintenance DB. Fix inside."
date: 2026-11-22
tags: [PostgreSQL, Database Backup]
authors: [cclee]
image: "/images/blog/postgres-restore-drill-zero-false-pass-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "How do I count tables in a PostgreSQL database?"
    a: "Connect to that database itself (psql -d dbname), then run SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'. table_schema holds the namespace name (public by default), not the database name. Running the query from another database cannot see the target database's tables."
  - q: "What does table_schema mean in information_schema.tables?"
    a: "In PostgreSQL it is the namespace inside the currently connected database — tables land in public by default. It is never the database name. In MySQL the two coincide, which is why the same SQL means different things across engines."
  - q: "How often should you test your database backups?"
    a: "Run a real restore drill at least monthly: import the dump into a scratch database and verify the result. Comparing table counts is the floor; row counts and sample queries go further. A backup file that merely exists is not a verified backup."
---

While adding a table-count comparison to our restore-drill script, the source and temp databases both reported 0 tables — 0=0, verdict "pass" — while a manual count of the same database showed 25 tables.

Ran into this while building [CCLee Server Sentinel](/docs/server-sentinel) — monitoring and alerting for Linux servers: performance, availability, security and backup. Alerts arrive as conclusions with next steps, and backups are proven restorable by monthly real-restore drills.

## TL;DR

In PostgreSQL, `information_schema.tables`' `table_schema` column holds the namespace inside the current database — tables live in `public` by default — not the database name. Counting a database's tables requires connecting to that database first (`psql -d dbname`) and counting `public`. Our drill script got both wrong at once: it queried the database name as the schema and hardcoded `-d postgres` (the maintenance database), so every count was 0 and two equal zeros always "passed". After the fix, a real drill ran 25=25.

## Symptom: the table-count check is a permanent 0=0 pass

The drill's status file recorded `per_db` as `"app_db:0:0"` — source database 0 tables, temp database 0 tables, counts equal, `status` reported `ok`. That was the script's first real run on 2026-11-22.

The contradiction was already two days old: the manual drill on 2026-11-20 had counted 25 tables in the same imported copy. In other words, the script-side table-count comparison had never touched a real value — even if half the tables had gone missing during import, `0=0` still holds and the check still passes. A count of 0 on both sides is a check with a permanently green light.

## Root cause: table_schema is not the database name, and psql connected to the wrong database

Two bugs stacked — either alone breaks the count; together they make source and temp databases **wrong in the same direction**, which removes the comparison's ability to detect any difference.

**First: the database name was used as the schema.** PostgreSQL's hierarchy is database → schema (namespace) → table, and application tables land in the `public` namespace by default. The `table_schema` column of `information_schema.tables` stores the namespace name. Matching a database name against `table_schema` asks "is there a namespace named app_db" — always an empty set, so `COUNT` returns 0.

**Second: the connection was hardcoded to the maintenance database.** Every PostgreSQL instance ships with a default maintenance database named `postgres`. The old code pinned `-d postgres`, so the query ran against the maintenance database — and `information_schema` only shows the contents of the currently connected database.

The pre-fix `db_count`:

```bash
db_count(){  # $1=engine $2=container $3=user $4=schema → 表数（对正式库只读 COUNT，不改数据）
  local sql="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$4'"
  if [ -n "$2" ]; then
    case "$1" in
      postgres) docker exec "$2" psql -U "$3" -d postgres -t -A -c "$sql" ;;
      mysql)    docker exec "$2" mysql -u "$3" -N -B -e "$sql" ;;
    esac
  else
    mysql -N -B -e "$sql"
  fi
}
```

The call site runs it once per database:

```bash
src=$(db_count "$engine" "$container" "$u" "$db")    # source tables
dst=$(db_count "$engine" "$container" "$u" "$tmp")   # temp drill tables
```

Both calls go through the same function and make the same mistake, so `src=0` and `dst=0`, and `0=0` passes.

## Why MySQL never hits this

In MySQL, schema and database are synonyms: `CREATE DATABASE` and `CREATE SCHEMA` are equivalent, and `information_schema.tables` is visible across the whole instance, so `WHERE table_schema='dbname'` is simply correct. This script supports both engines, and the MySQL semantics were carried into the PostgreSQL branch without a second look — inside one function, `$4` meant two different things.

The fixed version branches by engine:

```bash
db_count(){  # $4 在 postgres 语义是目标库名，在 mysql 语义是 schema（=库名）
  if [ -n "$2" ]; then
    case "$1" in
      postgres) docker exec "$2" psql -U "$3" -d "$4" -t -A -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" ;;
      mysql)    docker exec "$2" mysql -u "$3" -N -B -e \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$4'" ;;
    esac
  else
    mysql -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$4'"
  fi
}
```

The postgres branch changes two things: `-d "$4"` connects to the target database itself, and `table_schema='public'` counts the default namespace. The MySQL branch is untouched.

## Why the regression tests stayed green: the stub mirrored the bug

The script ships with a 22-assertion regression suite, and it was green the whole time — because the test stub was written **to match the implementation's wrong semantics**. The old stub parsed the `table_schema='...'` value out of the SQL and used it as a lookup key: however the implementation queried, the stub answered. Implementation and stub shared the same wrong assumption, so the test had nothing to catch.

```bash
# before: the stub answered by the caller's query semantics — argument used as schema
sch=$(printf '%s' "$sql" | sed -E "s/.*table_schema='([^']*)'.*/\1/")
cat "$ST/count.$sch" 2>/dev/null || echo 0

# after: the stub answers by the -d target database (matching real psql behavior)
cat "$ST/count.$tgt" 2>/dev/null || echo 0
```

The lesson: a stub should simulate the **real contract of the external system** (what `information_schema` returns after `psql -d somedb`), not copy the caller's query code. The moment a stub copies the implementation, the test only proves the implementation agrees with its own shadow.

## Fix: connect to the target database and count public

The fix was two moves: correct `db_count`'s postgres branch (shown above), and correct the stub's lookup in the same commit. All 22 assertions stayed green, then a real drill re-ran on the client machine — this time `per_db` recorded `app_db:25:25` (drill_date=2026-11-21), the first time the comparison touched real values.

Silent failure modes on a backup chain rarely come alone: the backup file itself can come out empty — PostgreSQL's FORCE RLS stops even the owner session's COPY, producing an archive that "looks fine". That pitfall and its fix are in [Postgres pg_dump backs up no data? FORCE RLS blocks the owner too](/blog/postgres-pg-dump-empty-backup-force-rls). For the cleanup side of `information_schema.tables`, see [PostgreSQL left orphan tables after migration? Audit schema residue with information_schema](/blog/postgresql-information-schema-audit-orphan-tables).

<InfoBox variant="warning" title="Watch out">

- `ON_ERROR_STOP=1` only catches import-time errors; "no errors on import" does not mean the content is intact. Table counts are the floor — row counts and sample queries against business tables cover actual data damage.
- The same mistake recurs in disguise: filtering `pg_tables` by database name as `schemaname`, or `pg_class` by database name as namespace, also yields an empty set. The rule is simple — in PostgreSQL these columns mean **namespace**, and the database name only belongs in `-d` (which database to connect to).

</InfoBox>

## FAQ

### How do I count tables in a PostgreSQL database?

Connect to that database itself (`psql -d dbname`), then run `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'`. `table_schema` holds the namespace name (`public` by default), not the database name. Running the query from another database cannot see the target database's tables.

### What does table_schema mean in information_schema.tables?

In PostgreSQL it is the namespace inside the currently connected database — tables land in `public` by default. It is never the database name. In MySQL the two coincide, which is why the same SQL means different things across engines.

### How often should you test your database backups?

Run a real restore drill at least monthly: import the dump into a scratch database and verify the result. Comparing table counts is the floor; row counts and sample queries go further. A backup file that merely exists is not a verified backup.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
