---
title: "drizzle-kit migrate: exit 0 but no tables? Audit the journal"
description: "drizzle-kit migrate exits 0 but tables are missing? The journal and the schema are two ledgers. Reconcile, re-apply with psql ON_ERROR_STOP, fix owners."
date: 2026-11-13
tags: [Drizzle, PostgreSQL, Node.js]
authors: [cclee]
image: "/images/blog/drizzle-kit-migrate-silent-skip-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "Why does drizzle-kit migrate exit 0 without creating tables?"
    a: "The journal and the schema have diverged. Reconcile two counts: SELECT count(*) FROM drizzle.__drizzle_migrations; must equal the number of migration files, and information_schema.tables must contain the tables. Re-apply the missing SQL with psql -v ON_ERROR_STOP=1 and insert the journal row manually (hash = sha256 of the SQL file)."
  - q: "drizzle-kit migrate vs push — which one for production?"
    a: "migrate applies versioned SQL files tracked in a journal — one journal row per file; push diffs the schema directly with no history. Versioned files plus a verification step fit production better — but don't trust the exit code alone: reconcile the journal against the actual tables after every run."
  - q: "How do I verify drizzle migrations were actually applied?"
    a: "Two counts plus one ownership check: the journal count equals the migration file count, the new tables exist in information_schema.tables, and SELECT tablename FROM pg_tables WHERE tableowner <> 'owner_role'; returns 0 rows — otherwise policy application fails with 'must be owner of table'."
---

While shipping a batch of new tables for a multi-tenant system, drizzle-kit migrate on the deploy host printed "applying migrations" and exited quietly with code 0 — the application then started and its very first query failed on a missing table.

Ran into this in the deploy pipeline of a Node.js + PostgreSQL multi-tenant system (Drizzle ORM for migrations, row-level security isolating tenants, drizzle-orm 0.45.4 / drizzle-kit 0.31.11).

<!-- TODO backfill source note once the product page exists: Ran into this while building [product](link) — {business value} -->

## TL;DR

Exit code 0 does not mean the migration applied. drizzle-kit's journal (the `drizzle.__drizzle_migrations` ledger) and the actual tables in the database are two different books: when the journal says "applied" but the table is missing, every later migration is skipped silently. Three steps: reconcile (journal count = migration file count, key tables present in information_schema) → re-apply missing files with `psql -v ON_ERROR_STOP=1` and insert the journal row by hand → fix table ownership with OWNER TO. On the deploy path we retired drizzle-kit migrate entirely in favor of an owner pipeline: per-file apply + server-side journaling + verify-or-stop.

## Symptoms: three errors, all exit code 0

There are three layers to this, the first two in the migration command and the third right after it — none of them produce a failure signal on the command level. If you searched "drizzle migrate not working", "migrations applied but no tables", or "must be owner of table", read on.

**Symptom one: the migration prints "applying", exits 0, tables missing.**

```text
$ drizzle-kit migrate
...
applying migrations...
$ echo $?
0
```

The local dev database hit the "journaled but not created" shape first — an interrupted migration left a half state behind, and every later migrate run treated that batch as applied and skipped it. Production hit the same problem in the opposite shape: migration 0019 exited 0 with neither the SQL applied nor the journal row written.

**Symptom two: adding a foreign key fails with an unrelated error.**

```text
ERROR:  unrecognized configuration parameter "app.tenant_id"
```

**Symptom three: with the key in place, the policy script stalls.**

```text
ERROR:  must be owner of table conflict_events
```

All three errors are segments of the same deploy pipeline.

## Root cause: the journal and the schema are two different books

**The journal records "booked", not "the table exists".** drizzle-kit migrate reads the SQL files in the migrations folder and decides what to skip by comparing hashes in `drizzle.__drizzle_migrations` — the journal is its only input. Once a "journaled row, missing table" intermediate state exists (most often left by an interrupted migration), every later migrate run believes that batch is done and skips it: no error, exit code 0. Production's 0019 was the inverse — neither applied nor journaled — but it surfaced the same way: caught by the ledger reconciliation, with no signal from the command itself.

Plainly put: this is a design where status is judged from the ledger alone, and when the ledger is polluted or never written, drizzle-kit offers no clue about it. Why it skips silently on the normal path, the command does not explain — our response was to stop trusting its judgment on the deploy path (the trade-off is explained in the fix).

## Foreign keys meet RLS: the RI check runs without tenant context

**The referential-integrity trigger reading the referenced table does not carry your application's tenant injection.** Multi-tenant tables usually have row-level security (RLS) policies that read a session variable via `current_setting('app.tenant_id')`. But the referential integrity (RI) check is an internal trigger scan: it runs on a bare connection that never SET `app.tenant_id`, so current_setting throws unrecognized configuration parameter — the foreign key isn't wrong, the policy blows up on that bare connection first.

The fix is one parameter:

```sql
current_setting('app.tenant_id', true)  -- returns NULL when unset
```

NULL matches no rows inside the policy (equivalent to deny), so the isolation semantics are unchanged while the RI check's bare connection stops erroring. For an RLS database the order becomes fixed: fix the policies first, then add the foreign keys.

## Ownership drift: superuser-owned tables block policy application

**Policies can only be changed by the owner, and historical tables may be owned by someone else.** The three tables apply-policies choked on (conflict_events, equipments, vendors) had been created manually by a superuser much earlier — owned by postgres, not by the owner role migrations run as. CREATE POLICY requires the table owner; with the wrong owner, applying all 15 policy files stalls.

Reclaim ownership:

```sql
ALTER TABLE conflict_events OWNER TO app_owner;
```

And audit the whole database — this query must return 0 rows:

```sql
SELECT tablename FROM pg_tables WHERE tableowner <> 'app_owner';
```

## Fix: reconcile → re-apply → reclaim → harden the deploy path

For 0019 the order of events was: fix the policy, add the foreign key, get blocked again by table ownership — after reclaiming the three tables, all 15 policy files applied, and only then did the journal check reveal that 0019 had never been applied or recorded. Later, 0020 skipped silently on the same pipeline, and this time the deploy entry's ledger check stopped it before the half-applied state went live. After those two recurrences, the deploy-path migration became a fixed shape:

1. **Reconcile** (a fixed step after every migration):

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;
-- must equal the number of files in the migrations folder

SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- key tables must actually exist
```

2. **Re-apply**: for missing journal rows, pipe the SQL in as the owner role, then add the journal row:

```bash
psql -v ON_ERROR_STOP=1 -U app_owner -d appdb < drizzle/0019_missing.sql
# journal row: hash = sha256 of the full SQL file; created_at = epoch seconds (bigint), matching existing rows
```

3. **Reclaim**: check owners, `ALTER TABLE … OWNER TO app_owner` (previous section), re-run policy application.

4. **Harden the deploy**: replace "run drizzle-kit migrate once" with a per-file loop — apply each file with ON_ERROR_STOP and stop on the first failure, compute the journal hash server-side, and reconcile the count at the end:

```bash
for tag in $pending; do
  psql -v ON_ERROR_STOP=1 -U app_owner -d appdb < "drizzle/$tag.sql"
  hash=$(sha256sum "drizzle/$tag.sql" | cut -d' ' -f1)
  psql -d appdb -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                    VALUES ('$hash', extract(epoch from now())::bigint)"
done
# final check: journal count = local migration file count, otherwise abort the deploy
```

![Deploy-time migration: the owner pipeline](/images/blog/drizzle-kit-migrate-silent-skip-architecture-en.webp)

The trade-off: why not keep drizzle-kit migrate? What a deploy needs is not "let the tool decide" but "the applied result is verifiable, and any failure stops the run". Per-file application turns every action into an assertable atomic step, and the ledger reconciliation turns "silently skipped" into an explicit failure. Local development keeps using the package.json `db:migrate` script (drizzle-kit migrate plus policy application) — what retired is the deploy usage, not the tool.

The same family of "the migration looked done" exists on the SQLAlchemy side: [three Alembic migration pitfalls](/blog/alembic-migration-three-pitfalls) (async engine misuse, broken revision chains, model changes without migrations). To systematize existence and ownership checks, see [auditing orphan tables with information_schema](/blog/postgresql-information-schema-audit-orphan-tables).

<InfoBox variant="warning" title="Watch out">

- **Run both checks after every migration**: journal count = migration file count, and the key tables exist in information_schema. Both passing is what "migration complete" means; the exit code alone is not evidence.
- **Manual journal rows must match the existing format**: hash is the sha256 of the full SQL file, created_at is epoch seconds as bigint — keep the same types drizzle-kit writes, or later reconciliations drift.
- **Run migrations as the owner role, always**: tables created by a superuser are owned by the superuser, and the next policy application stalls for sure. The owner check belongs in the post-migration checklist.

</InfoBox>

## FAQ

### Why does drizzle-kit migrate exit 0 without creating tables?

The journal and the schema have diverged. Reconcile two counts: `SELECT count(*) FROM drizzle.__drizzle_migrations;` must equal the number of migration files, and information_schema.tables must contain the tables. Re-apply the missing SQL with `psql -v ON_ERROR_STOP=1` and insert the journal row manually (hash = sha256 of the SQL file).

### drizzle-kit migrate vs push — which one for production?

migrate applies versioned SQL files tracked in a journal — one journal row per file; push diffs the schema directly with no history. Versioned files plus a verification step fit production better — but don't trust the exit code alone: reconcile the journal against the actual tables after every run.

### How do I verify drizzle migrations were actually applied?

Two counts plus one ownership check: the journal count equals the migration file count, the new tables exist in information_schema.tables, and `SELECT tablename FROM pg_tables WHERE tableowner <> 'owner_role';` returns 0 rows — otherwise policy application fails with "must be owner of table".

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
