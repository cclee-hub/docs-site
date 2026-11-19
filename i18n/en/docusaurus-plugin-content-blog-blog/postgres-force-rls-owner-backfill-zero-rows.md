---
title: "Postgres RLS Backfill Lands 0 Rows? FORCE RLS Binds Owners"
description: "Postgres FORCE RLS makes owner-session backfills silently insert 0 rows: the tenant policy empties the SELECT source. Three workarounds and a row-count check."
date: 2026-11-15
tags: [PostgreSQL, SQL, Database]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does Postgres row level security not seem to apply to the table owner?"
    a: "Because ENABLE ROW LEVEL SECURITY alone never constrains the table owner — policies only bind other roles. Add ALTER TABLE … FORCE ROW LEVEL SECURITY and every row-access statement from the owner session goes through policy evaluation too."
  - q: "What does INSERT 0 0 mean in PostgreSQL?"
    a: "The two numbers are OID and row count: the statement succeeded but inserted 0 rows. Under FORCE RLS, a policy can filter the SELECT source of an INSERT…SELECT down to an empty set, so nothing violates any policy and no error is raised at all."
  - q: "How do I bypass row level security in PostgreSQL for a data migration?"
    a: "Three options: run the migration as a superuser such as the postgres role, which bypasses RLS by definition; create a dedicated role with the BYPASSRLS attribute; or SET app.tenant_id per tenant inside the session. For one-off backfills the superuser route is the simplest, followed by a row-count check against the pre-migration baseline."
  - q: "Does FORCE ROW LEVEL SECURITY affect DDL statements?"
    a: "No. RLS evaluates row access only — visibility of SELECT and legality of writes. CREATE TABLE, ALTER TABLE, and index builds never touch policies, which is why the same migration run shows all-green DDL next to a silently empty DML backfill."
---

<!-- Source-note placeholder: backfill this paragraph once the product row exists in products.tsx (low-sensitivity template: product name + link + value in one sentence) -->

While running a one-off data backfill against a multi-tenant table, the command finished normally and returned `INSERT 0 0` — the baseline had 23 rows to migrate, and not one of them landed. In the same deployment, every CREATE TABLE and ADD COLUMN migration had succeeded.

## TL;DR

`ENABLE ROW LEVEL SECURITY` does not constrain the table owner; `FORCE ROW LEVEL SECURITY` removes that exemption. An owner's ops session has no `app.tenant_id` context, so a tenant-scoped policy evaluates to false on every row, and the SELECT source of an `INSERT…SELECT` is filtered to an empty set — the statement succeeds, inserts nothing, and raises no error. DDL never passes through RLS, which is why migrations stay green on the same channel. Run data backfills as a superuser (or per-tenant with `SET app.tenant_id`), and always verify "baseline row count vs landed row count".

## The symptom

On a FORCE-RLS multi-tenant table, an owner-session backfill silently inserts 0 rows — the statement succeeds with no error and no warning, and the command output alone reads as success. Here is how it happened for real.

The setting: a multi-tenant SaaS deployment. A batch of migrations (create table, add column) goes through the owner database channel and all succeed. Right after, an idempotent backfill moves data from legacy single-select columns into a new child table:

```sql
INSERT INTO task_assignees (tenant_id, task_id, assignee_user_id, assignee_vendor_id)
SELECT tenant_id, id, assignee_user_id, assignee_vendor_id
FROM tasks
WHERE assignee_user_id IS NOT NULL OR assignee_vendor_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

Run as the project's owner role (`app_owner` for short):

```
INSERT 0 0
```

The statement exits successfully, `ON_ERROR_STOP` never fires, and the deployment pipeline moves on. But a superuser count shows 23 tasks with non-null legacy columns — the backfill effectively never ran. Judged by exit status alone, this step slips through silently.

The confusing part is the contrast within the same channel: in one and the same psql pipeline, `CREATE TABLE` and `ALTER TABLE … ADD COLUMN` work fine, and only this `INSERT…SELECT` lands 0 rows.

## Root cause: FORCE RLS binds the owner too

FORCE RLS extends policy enforcement to the owner, while the owner's ops session carries no tenant context — the policy evaluates false on every row and the SELECT is silently filtered to empty; DDL never passes through RLS, so migrations stay green on the same channel. Three layers stack into the silent chain, and each one looks reasonable on its own.

**Layer 1: ENABLE and FORCE are different switches.** PostgreSQL has shipped RLS since 9.5. `ENABLE ROW LEVEL SECURITY` turns policies on, but the table owner is exempt by default — policies only bind other roles. Multi-tenant tables usually add `FORCE ROW LEVEL SECURITY` to cancel that exemption:

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;   -- the owner is no longer exempt
```

Security-wise this is right: if the owner account ever leaks into an application connection, tenant isolation still holds. The cost is that the owner's ops channel is governed by policies too — a detail that deployment docs tend to omit.

**Layer 2: current_setting with missing_ok silently returns NULL.** The policy is the standard tenant-header filter:

```sql
CREATE POLICY tasks_tenant ON tasks
  USING (tid = current_setting('app.tenant_id', true)::uuid);
```

The second argument, `missing_ok = true`, means "return NULL instead of raising an error when the setting is absent" — a lenient read designed for application connections. Nobody runs `SET app.tenant_id` in an ops session, so the policy expression becomes `tid = NULL`, which evaluates to NULL (not true, not false), and the row is filtered out. The session raises nothing; the query raises nothing; you simply see no rows.

**Layer 3: DDL never passes through RLS.** RLS evaluates row access only (SELECT visibility, write legality). `CREATE TABLE`, `ALTER TABLE`, and index builds never touch policy evaluation. So the same owner channel splits in two:

| Operation | Owner-channel result |
|------|--------------|
| Create table / add column / build index (DDL) | Runs normally |
| `INSERT…SELECT` (DML, source governed by FORCE RLS) | SELECT source filtered to empty, `INSERT 0 0` |
| Bare `INSERT` with VALUES into the governed table | Error: "violates row-level security" (visible) |

The second row is the dangerous one: `INSERT…SELECT` fails in the shape of an **emptied source**, not a rejected target. No row ever attempts to enter, so no violation is ever raised — a silent 0 is far harder to notice than an error.

## The fix

The way out is to make the backfill session bypass — or satisfy — the tenant policy: a superuser (first choice for one-off migrations), a dedicated BYPASSRLS role (regular corrections), or per-tenant SET (keeping isolation semantics). A minimal reproduction first, then each option in turn.

### Minimal reproduction

```sql
-- A FORCE-RLS multi-tenant table
CREATE TABLE tasks (
    id      INT GENERATED ALWAYS AS IDENTITY,
    tid     UUID NOT NULL,
    title   TEXT,
    done    BOOLEAN DEFAULT false
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant ON tasks
  USING (tid = current_setting('app.tenant_id', true)::uuid);

-- An unguarded archive table (the backfill target)
CREATE TABLE tasks_archived (
    id      INT,
    tid     UUID,
    title   TEXT,
    done    BOOLEAN
);

-- Seed two rows as superuser
INSERT INTO tasks (tid, title) VALUES ('11111111-1111-1111-1111-111111111111', 'a'),
                                      ('22222222-2222-2222-2222-222222222222', 'b');

-- Switch to an owner-role session (no tenant context):
SELECT count(*) FROM tasks;   -- 0
INSERT INTO tasks_archived SELECT * FROM tasks;   -- INSERT 0 0
```

`count(*)` returning 0 is the diagnostic pivot: the SQL is not wrong, the session simply cannot see the rows.

### Option 1: run as superuser (recommended for one-off migrations)

A superuser is not subject to RLS. Hand the backfill to the `postgres` role:

```bash
psql -U postgres -d mydb -v ON_ERROR_STOP=1 -f backfill.sql
```

The same statement flips from `INSERT 0 0` to `INSERT 0 23`. The trade-off: maximum privilege, so reserve it for controlled one-off ops and never put it into application connection strings.

### Option 2: a dedicated BYPASSRLS role

If the ops channel runs data corrections regularly, create a dedicated role:

```sql
CREATE ROLE migrator WITH LOGIN BYPASSRLS;
```

A `BYPASSRLS` role skips every policy without acquiring the rest of the superuser privilege set — a narrower surface. It still needs explicit GRANTs per table, and the role's credentials must be treated as sensitive secrets.

### Option 3: set tenant context per tenant

To keep RLS semantics intact (the migration logic itself passes through isolation rules), run tenant by tenant inside a session:

```sql
SET app.tenant_id = '11111111-1111-1111-1111-111111111111';
-- backfill statements for that tenant
```

Fits backfills whose logic differs per tenant; for a straight full copy, a per-tenant loop is more ceremony than bypassing outright.

### Always verify row counts afterwards

Whichever channel you pick, the acceptance criterion for a backfill is not "command succeeded" — it is row reconciliation:

```sql
-- Baseline: affected rows (counted before the backfill)
SELECT count(*) FROM tasks
WHERE assignee_user_id IS NOT NULL OR assignee_vendor_id IS NOT NULL;

-- Landed: after the backfill
SELECT count(*) FROM task_assignees;                          -- total = baseline
SELECT count(DISTINCT task_id) FROM task_assignees;           -- distinct tasks = baseline (single-select case)
```

In this incident, it was exactly the "baseline 23 = landed 23" check failing to add up that exposed the problem — the owner channel had printed `INSERT 0 0`, and without reconciliation the deployment would have shipped an empty child table. For belt-and-suspenders, join old and new rows on the primary key and compare migrated column values: zero diffs closes the loop.

Pitfalls on database write paths are rarely syntax errors — they are deployment-order and constraint-semantics mismatches. [ON CONFLICT unique-constraint matching](/blog/2026/07/04/postgresql-on-conflict-unique-constraint) is the same family: the SQL is right, and a mismatched migration/deploy ordering still breaks everything.

The same FORCE RLS chain has a backup-side shape too: running `pg_dump` as the owner produces a structure-only backup with zero rows. Which channel each data action should take, and how to design restore-drill checks that catch it, is in the companion post [pg_dump backup empty? FORCE RLS blocks the table owner too](/blog/postgres-pg-dump-empty-backup-force-rls).

## Gotchas

On FORCE-RLS tables, the acceptance criterion for ops actions shifts from "command succeeded" to "row counts reconcile". All four points come straight from this incident:

<InfoBox variant="warning" title="Gotchas">

- **A silent 0 is riskier than an error**: when RLS empties the source of an `INSERT…SELECT`, nothing is raised. Backfill-type operations need a "baseline vs landed" row-count check, not just an exit code.
- **Never infer the data path from migration success**: DDL bypasses RLS, so green DDL on the same channel proves nothing about DML. Probe the channel with a real DML statement.
- **missing_ok=true is part of the silent chain**: `current_setting('app.tenant_id', true)` returns NULL when the setting is absent (policy always false, whole table filtered); with `missing_ok=false` a missing setting raises immediately, which surfaces the problem sooner. The lenient read is fine for app connections — just know what it does in ops sessions.
- **Keep superuser credentials in their own lane**: the `postgres` role is for one-off ops only; it should never appear in connection strings, app config, or CI.

</InfoBox>

## FAQ

### Why does Postgres row level security not seem to apply to the table owner?

Because `ENABLE ROW LEVEL SECURITY` alone never constrains the table owner — policies only bind other roles by default. Add `ALTER TABLE … FORCE ROW LEVEL SECURITY` and every row-access statement from the owner session goes through policy evaluation too.

### What does INSERT 0 0 mean in PostgreSQL?

The two numbers are OID and row count: the statement succeeded but inserted 0 rows. Under FORCE RLS, a policy can filter the SELECT source of an `INSERT…SELECT` down to an empty set — nothing violates any policy, so nothing is raised. To pinpoint it, run `SELECT count(*)` in the same session first; a 0 confirms visibility filtering rather than a broken statement.

### How do I bypass row level security in PostgreSQL for a data migration?

Three options: run as a superuser such as the `postgres` role (bypasses RLS by definition — best for one-off backfills); create a dedicated role with `BYPASSRLS`; or `SET app.tenant_id` per tenant to keep RLS semantics. Whichever you choose, follow up with a row-count check against the baseline.

### Does FORCE ROW LEVEL SECURITY affect DDL statements?

No. RLS evaluates row access only — SELECT visibility and write legality. `CREATE TABLE`, `ALTER TABLE`, and index builds never touch policy evaluation, which is why the same migration run shows all-green DDL next to a silently empty DML backfill.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
