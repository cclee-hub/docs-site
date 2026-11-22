---
title: "pg_dump backup empty? FORCE RLS blocks the table owner too"
description: "pg_dump backup restores to zero rows? FORCE RLS filters the owner's COPY too — which role runs backups and data actions, plus checks that catch empty dumps"
date: 2026-11-20
tags: [PostgreSQL, pg_dump, Database]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does pg_dump produce only schema without data?"
    a: "With FORCE ROW LEVEL SECURITY on the tables, even the table owner's dump session must pass the RLS policies. Maintenance sessions carry no tenant context, so the policy evaluates to false for every row and COPY returns an empty set. pg_dump prints 'query would be affected by row-level security policy' warnings yet still writes a structure-only file — a healthy-looking backup with zero data."
  - q: "Does row level security affect the table owner?"
    a: "Only ENABLE ROW LEVEL SECURITY leaves the owner exempt — policies constrain other roles. Adding FORCE ROW LEVEL SECURITY removes that exemption, so every row-access statement from the owner goes through policy evaluation too. Policies built on current_setting('app.tenant_id', true) return NULL in sessions without tenant context, and NULL compares false against everything: silently zero rows."
  - q: "How do I verify a backup actually contains data?"
    a: "Restore it and compare per-table row counts against production. On a same-instant snapshot the counts must match exactly; for a hot export allow a tolerance you can state and explain. Zero rows in a core business table fails under any tolerance — treat it as a hard stop, not a gray zone."
---

Ran into this during a disaster-recovery drill on a Node.js + PostgreSQL multi-tenant system: ran pg_dump with the business owner role, the command printed a few errors but still produced a backup file — and the database restored from that file had complete structure and zero rows of data.

## TL;DR

`FORCE ROW LEVEL SECURITY` puts the table owner under policy evaluation, and pg_dump's COPY is just a SELECT — an owner session without tenant context gets every row filtered out. pg_dump reports `query would be affected by row-level security policy` but does not stop: it hands you a plausible-looking, data-free dump. Data-touching actions (backfills, backups, full scans) run as superuser or per-tenant with context injected, and restore drills need row-count checks that can tell "structure complete" from "data complete".

## Symptoms: a "successful" backup, an empty restore

Exporting with the owner role: the command printed a few errors, the backup file was still produced, and the restored database had complete structure with zero rows of data. The raw drill output:

```text
$ pg_dump -U app_owner -Fc appdb -f drill.dump
pg_dump: warning: query would be affected by row-level security
         policy for table "attachments"
... (one line per table)
$ echo $?
1
```

Those lines look like warnings. The file exists and is not empty. The problem surfaced only after restoring this dump into the drill database and counting rows: every business table had complete structure — indexes, sequences, constraints — and **0 rows**.

A few weeks earlier, the same root cause had shown up on the migration side. A data-action migration (nulling out a legacy column) ran through the owner channel; deployment bookkeeping stayed green. A later superuser check found 2 rows the `UPDATE` had missed — it had silently modified 0 rows. Stranger still, running `SELECT count(*)` on one of those tables from the owner session returned **0**, while the superuser saw **6**. The owner could not read rows from a table it owned.

Two incidents, weeks apart, in different parts of the pipeline — one root cause. The migration side has another silent failure family unrelated to RLS: [UPDATE FROM laterals can't reference the target table, and drizzle-kit swallows the error](/blog/postgres-update-from-lateral-invalid-reference) — the fix is to rewrite correlated reads as a CTE.

## Root cause: why FORCE RLS stops the owner and pg_dump too

Once policies apply to the owner, owner data access goes through the same evaluation as any other role — and pg_dump's COPY is an ordinary SELECT. Three layers stack into the silence:

**Layer 1: FORCE removes the owner's exemption.** With only `ENABLE ROW LEVEL SECURITY`, the table owner bypasses policies. Multi-tenant tables usually add `FORCE ROW LEVEL SECURITY`, which pulls the owner into evaluation as well — a deliberate tightening, not a misconfiguration.

**Layer 2: maintenance sessions carry no tenant context.** The typical tenant-isolation policy:

```sql
CREATE POLICY tenant_isolation ON tasks
  USING (tenant_id = current_setting('app.tenant_id', true));
```

The second argument of `current_setting('app.tenant_id', true)` is missing_ok: unset variable → NULL instead of an error. NULL in a comparison is never true — the policy rejects every row. Without missing_ok, the owner session would fail loudly with `unrecognized configuration parameter` and the problem would surface immediately; missing_ok turns "no context" into "silently zero rows".

**Layer 3: pg_dump's failure signal is weak.** A COPY blocked by RLS logs a warning, but pg_dump continues exporting whatever it can — nonzero exit code, file still on disk. Any pipeline that only checks "did the file get created" will treat an empty backup as a good one. DDL never touches policy evaluation, which is why structural changes in the same batch all succeed while data actions silently do nothing.

## Fix: pick the channel by action type, then design the checks

**One-line rule: data-touching actions never run through a bare owner session.**

| Action | Channel |
|---|---|
| DDL migrations (create/alter/index) | owner channel as usual |
| Data-action migrations (UPDATE / backfill / cleanup) | superuser, or per-tenant `SET app.tenant_id` |
| Backups (pg_dump), full-table scans | superuser |
| Application connections | business role + tenant context injected per connection (RLS works as designed) |

Per-tenant injection, for tenant-by-tenant repairs:

```sql
SET app.tenant_id = 'tenant-a';
UPDATE ...;   -- the policy passes rows for this tenant as intended
```

One-shot full backfills are simpler as superuser.

**The backup fix is one character deep**: `pg_dump -U postgres`. After switching, the re-run drill reconciled cleanly — migration records present, five key tables' row counts identical to production, RLS policy count matching, zero ownership anomalies.

**Restore-drill checks must distinguish "structure complete" from "data complete".** This drill nearly passed on its own criteria: the checklist said "row counts ≤ production + tenant table equal", which zero rows satisfies. Two corrections:

1. Same-instant snapshot (export inside a write-freeze window) → row counts must be **exactly equal**.
2. Hot export from a live database → tolerance allowed, but stated explicitly with its cause (normal writes during export). Zero rows is never inside any tolerance.

Add one foolproof line: row count 0 on a core table fails outright, no tolerance discussion.

<InfoBox variant="warning" title="Watch out">

- A nonzero pg_dump exit code is not "just a warning" under FORCE RLS — it means data did not make it into the file. A file existing is not a backup existing.
- Do not reach for `BYPASSRLS` on the owner to make this go away: isolation matters precisely for roles that hold migration rights — that is why FORCE was chosen. Pick channels by action type instead of loosening roles.
- One-command self-check across your pipeline: run `SELECT count(*)` on a core table as each operational role and compare against the superuser's count. Any mismatch means this trap is live.

</InfoBox>

The full backfill-side walkthrough of the same FORCE RLS chain — the layer-by-layer anatomy of a silent `INSERT 0 0` — is in the companion post: [Postgres RLS migration all green, backfill 0 rows? FORCE RLS stops the table owner too](/blog/postgres-force-rls-owner-backfill-zero-rows). Between the two: that one covers the backfill side, this one the backup and drill-check side.

## FAQ

### Why does pg_dump produce only schema without data?

With FORCE ROW LEVEL SECURITY on the tables, even the table owner's dump session must pass the RLS policies. Maintenance sessions carry no tenant context, so the policy evaluates to false for every row and COPY returns an empty set. pg_dump prints 'query would be affected by row-level security policy' warnings yet still writes a structure-only file — a healthy-looking backup with zero data.

### Does row level security affect the table owner?

Only ENABLE ROW LEVEL SECURITY leaves the owner exempt — policies constrain other roles. Adding FORCE ROW LEVEL SECURITY removes that exemption, so every row-access statement from the owner goes through policy evaluation too. Policies built on current_setting('app.tenant_id', true) return NULL in sessions without tenant context, and NULL compares false against everything: silently zero rows.

### How do I verify a backup actually contains data?

Restore it and compare per-table row counts against production. On a same-instant snapshot the counts must match exactly; for a hot export allow a tolerance you can state and explain. Zero rows in a core business table fails under any tolerance — treat it as a hard stop, not a gray zone.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
