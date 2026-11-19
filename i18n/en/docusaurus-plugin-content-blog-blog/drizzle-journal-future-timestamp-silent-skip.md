---
title: "drizzle migration skipped silently? Check the journal first"
description: "migrate reports success yet nothing ran: the ledger's max(created_at) is the watermark — future timestamps pin migrations, SQL outside the journal never runs"
date: 2026-11-20
tags: [Drizzle, PostgreSQL, Node.js]
authors: [cclee]
image: "/images/blog/drizzle-journal-watermark-silent-skip-en.webp"
schema: FAQPage
faqs:
  - q: "Why is drizzle-kit migrate not applying my migrations?"
    a: "Two ledgers, two failure modes. Count drizzle.__drizzle_migrations against the number of SQL files in drizzle/ — a mismatch means an unregistered file that will never apply. If the counts match, check drizzle/meta/_journal.json: any entry whose when is below the ledger's max(created_at) is pinned below the watermark and silently skipped forever."
  - q: "Can I edit drizzle's journal manually?"
    a: "Leave the when fields in _journal.json and the created_at values in the ledger alone. migrate uses the ledger's max(created_at) as the watermark and only applies entries with when greater than it — a future timestamp inflates the watermark permanently, and later migrations stay skipped even after you normalize the journal."
  - q: "How do I add a hand-written migration to drizzle properly?"
    a: "Never drop a SQL file straight into drizzle/ — without a journal entry it is invisible to the pending list and will never execute. Generate the file with drizzle-kit generate --custom --name=xxx (which registers the journal and snapshot) and put the SQL into the generated file."
---

On a Node.js + PostgreSQL multi-tenant system, a deploy printed "no pending migrations", everything stayed green — and about 18 minutes later production hit "relation does not exist". The batch shipped a create-table migration that had never executed, and the application container logs held not a single error.

## TL;DR

drizzle decides "which migrations are applied" from two ledgers: `drizzle.__drizzle_migrations` in the database (execution ledger) and `drizzle/meta/_journal.json` (registration manifest). Either can break silently. Hand-edited future timestamps inflate the execution ledger's `max(created_at)` — the watermark migrate uses — pinning every later migration below it; a raw SQL file dropped into `drizzle/` without journal registration never enters the pending list. Fix: register hand-written migrations via `generate --custom`, never hand-edit the ledgers, and put a "journal count = file count" gate in the deploy pipeline.

## Symptoms: two incidents, two broken ledgers

**Incident one: migrate reports success, the next step fails on a missing table.** `pnpm db:migrate` (drizzle-kit migrate) finished with normal output; the following step, applying RLS policies, failed with `relation "task_assignees" does not exist` — the create-table migration it depends on (0032) had not run, yet migrate's output and exit code showed nothing wrong.

Hand-fixing the ledger and re-running migrate produced a second problem: the tool **re-applied** 0028 and 0029, two migrations long since applied. `__drizzle_migrations` accumulated duplicate and orphan rows — 34 rows for 32 migration files.

**Incident two: the deploy says "no pending migrations", production lacks the table.** Another release carried a hand-written create-table SQL (0037). The deploy's migration check reported no pending work; nobody noticed, and the application container started normally. The missing table surfaced only when the WeCom-side department sync failed. Roughly 18 minutes ran with production missing the table and zero errors in the logs.

Post-incident reconciliation: journal 36 entries, production ledger 36 rows — both sides "consistent", each one entry short. The 0037 SQL file sat in `drizzle/` with no journal registration.

## Root cause: how drizzle decides "which migrations are applied"

The decision reads only the ledgers, and each pit corrupts one of them.

**The watermark: the ledger's max(created_at) is the only waterline.** drizzle-orm's migrate uses the largest `created_at` in the ledger as the watermark and applies only journal entries whose `when` is **greater**. The setup for incident one came earlier: to force a re-apply, someone had hand-edited `when` values in `_journal.json` to future timestamps (like `1794716400000`). After the journal was normalized back to real chronology, the future `created_at` rows were still in the ledger — the watermark stayed high, and 0032, whose `when` sat below it, could never satisfy "when > watermark". Skipped forever, no output.

**Hashes are computed at execution time, so re-runs insert new rows.** The hash migrate uses for bookkeeping is computed from the SQL file's content when it executes, not read from the ledger. That explains the second half of incident one: the old migrations re-running were not considered "already applied", and each inserted a fresh ledger row — hence the duplicates and orphans (34 > 32).

**A raw file outside the journal is invisible to the pending list.** The pending list is effectively the journal entries minus the ledger rows. 0037 had no journal entry: journal 36 = ledger 36, the difference was empty, so "no pending migrations". Tests did not catch it either: the catalog/integration tests run against a test database cloned from dev, and dev had already received 0037 by direct psql, with a bookkeeping row to match — structure complete, everything green. Of the three ledgers (journal, dev, test), exactly one was wrong and the other two agreed.

## Fix: register through the proper channel, gate the deploy

**Hand-written migrations must go through `generate --custom`:**

```bash
# Back up first! The command overwrites an existing file of the same name
cp drizzle/0037_departments.sql /tmp/0037_backup.sql
pnpm exec drizzle-kit generate --custom --name=departments
# Put the SQL into the generated stub; journal and snapshot register automatically
```

**Never hand-edit journal `when` or ledger `created_at` — normalize what was edited:** restore `when` to real chronology; delete duplicate/orphan ledger rows and align `created_at` with the journal; then verify three things — ledger rows = file count, `max(created_at)` matches the last migration, and a re-run of migrate is a no-op. Incident one cleared up in that order, and later migrations resumed applying.

**Two hard rules for the deploy pipeline:**

1. Journal count ≠ `drizzle/*.sql` file count → halt the deploy and print the mismatched filenames. This is the only reliable signal of an unregistered raw file — the database-side ledger can look "normal" because dev was hand-applied.
2. The output says "no pending migrations" while the batch ships migration files → contradiction. Stop and inspect the journal.

![The ledger decision behind migrate, and where the two pits sit](/images/blog/drizzle-journal-watermark-silent-skip-en.webp)

The gate has caught a real case: after registering 0037, the journal held 37 entries, the deploy re-identified 1 pending migration, and the owner channel — per-file `psql ON_ERROR_STOP`, server-side sha256 bookkeeping, ownership and policy checks — completed with the ledger reconciled at 37/37. Why that owner channel replaced drizzle-kit migrate on the deploy path in the first place (a different pit: the ledger diverging from the actual tables) is in the companion post [drizzle-kit migrate: exit 0 but no tables? Audit the journal](/blog/drizzle-kit-migrate-silent-skip) — together the two posts map the whole ledger: that one covers ledger-vs-database, this one covers the ledger corrupting itself.

<InfoBox variant="warning" title="Watch out">

- `drizzle-kit generate --custom` **overwrites an existing file of the same name** — back up the hand-written SQL before generating, then fill the stub. Do not let the tool silently eat your file.
- Run the count check twice over: journal vs file count (registration completeness), ledger vs journal (execution completeness). Incident two's 36 = 36 shows why one comparison is not enough.
- When hand-inserting ledger rows, match the existing row shape (hash = sha256 of the full SQL file, `created_at` as a bigint epoch in seconds); mixed formats break later reconciliation — details in the companion post.

</InfoBox>

## FAQ

### Why is drizzle-kit migrate not applying my migrations?

Two ledgers, two failure modes. Count drizzle.__drizzle_migrations against the number of SQL files in drizzle/ — a mismatch means an unregistered file that will never apply. If the counts match, check drizzle/meta/_journal.json: any entry whose when is below the ledger's max(created_at) is pinned below the watermark and silently skipped forever.

### Can I edit drizzle's journal manually?

Leave the when fields in _journal.json and the created_at values in the ledger alone. migrate uses the ledger's max(created_at) as the watermark and only applies entries with when greater than it — a future timestamp inflates the watermark permanently, and later migrations stay skipped even after you normalize the journal.

### How do I add a hand-written migration to drizzle properly?

Never drop a SQL file straight into drizzle/ — without a journal entry it is invisible to the pending list and will never execute. Generate the file with drizzle-kit generate --custom --name=xxx (which registers the journal and snapshot) and put the SQL into the generated file.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
