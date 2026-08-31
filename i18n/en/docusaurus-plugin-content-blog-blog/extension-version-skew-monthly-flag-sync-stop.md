---
title: "Old Browser Extension Stops Syncing Mid-Month? Version Skew from a Re-purposed Sync Flag"
description: "A server-side boolean flag gained new semantics in the new release; un-upgraded old clients read it with the old meaning, their idempotency check short-circuits, and collection stops mid-month until it self-heals next month. Classic version skew."
date: 2026-08-28
tags: [Chrome Extension, JavaScript, Versioning, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What are the best practices for feature flags?"
    a: "One flag, one meaning. When semantics change, add a new field instead of re-using the old flag; bind flags to explicit time windows or versions; and before changing meaning, enumerate every reader (especially un-upgraded old clients) and confirm how they interpret the value."
  - q: "How do I keep server-side fields backward compatible?"
    a: "Add, never mutate: existing fields keep their meaning and behavior; new semantics get new fields; old clients should safely ignore fields they don't recognize. Keeping the name while changing the meaning is a breaking change to every existing reader."
  - q: "What should old clients do when they read data with new semantics?"
    a: "Bound the impact to a self-healing window (like a calendar-month flip); prompt upgrades at release time to shorten the overlap; keep server writes idempotent (upsert) so mixed-version writes blend safely — no rollback, no cleanup."
---

After the "crowd asset" collection feature of our browser extension shipped, support started hearing the same story: some users open crowd assets mid-month and see "already up to date" — while their data stops at the 1st. The un-upgraded old extension had stopped collecting, and would only resume on the first day of the next month.

Encountered this while building [e-commerce data collection tooling](/docs/browser-plugin) — a one-stop e-commerce operations solution from data collection to smart analytics; the collection flag is served by the backend, and old and new extension versions share the same server-side table.

## TL;DR

The new release gave the existing boolean flag `is_current_month` a new meaning ("this month's collection window is covered"); un-upgraded clients read it with the old meaning ("data is current"), their idempotency check short-circuited, and collection stopped mid-month. This is not a bug to fix — it's **version skew**: one field, two interpretations. The impact has a natural self-healing boundary (the flag flips false next month); the response is upgrade prompts + idempotent upsert (no rollback), and the prevention is: semantic changes must come with a new field.

## Symptoms

```
New extension collects: writes the current-month row, is_current_month = true

Old extension syncs:    reads that row → hits the "up-to-date" check → stops collecting
User's view:            mid-month, "crowd assets" says already current; data frozen at month start
Next month, day 1:      is_current_month flips false → old version resumes (self-heals)
```

The eerie part: server data is perfectly correct, the new extension works, the old extension's code never changed — the only failure mode is "old version reading rows written by the new version".

## Root Cause

Textbook **version skew**. The flag's name stayed, its meaning moved: to the new release it means "current-month window covered"; the old release, following its own historical semantics, reads the same row as "data is current" — and its perfectly-correct idempotency check ("already current → skip re-collection") short-circuits the whole collection. Both sides' logic is right; the wrong part is **letting two semantics share one field**.

Client (and every client-side) version distribution is outside the server's control: after a release, old and new versions coexist for weeks as the norm. Any change to a server-side field's meaning is read by every historical version — the same lesson as the classic feature-flag mistake: **re-purpose an old flag to carry a new meaning, and readers act on the old meaning**.

## Solution

### Immediate response: prompt upgrades + idempotent writes

When releasing the version with the new collection logic, explicitly ask users to upgrade — the old version will not recover on its own within the month. Server and data need **no rollback**: collection writes are idempotent upserts, so interleaved old/new writes produce no dirty data, and everything realigns when the flag flips next month.

### Long-term prevention: new semantics, new field

Move the "window semantics" off the boolean onto a new field with an explicit window; old clients that don't know the field can't misread it:

```json
// anti-pattern: old flag re-purposed for new semantics
{ "is_current_month": true }

// correct: new semantics in a new field, explicit and comparable
{ "collected_window": "2026-08", "source_version": "2.3.0" }
```

The idempotency key decouples from business semantics: old versions judge by the old field, new versions by the new one, no cross-contamination.

### Design principle: give every flag a self-healing boundary

Prefer binding flags to natural time boundaries (month, day) rather than absolute semantics like "current". The month boundary here capped the worst case at one month; without such a boundary, skew is permanent and only a release can fix it.

<InfoBox variant="warning" title="Notes">

- You don't control the client version distribution. Treat any semantic change to a server-side field as a **compatibility change**: enumerate all readers and verify each interpretation path.
- A self-healing boundary is a safety net, not a plan — "it'll be fine next month" is not an acceptable long-term state; make the business call explicitly.
- Idempotent writes (upsert) are the precondition for a safe overlap period; collection pipelines without idempotency will produce duplicates or conflicts the moment versions coexist.
- When debugging collection pipelines, isolate production data first — see [adding a DRY-RUN mode to your Chrome extension collector](/blog/2026/05/09/chrome-extension-dry-run-mode).

</InfoBox>

## FAQ

### What are the best practices for feature flags?

One flag, one meaning. New semantics get a new field, not a re-purposed old flag. Bind flags to explicit time windows or versions. Before changing any meaning, enumerate every reader — especially un-upgraded clients — and confirm they won't interpret new values with old semantics. The mid-month collection stop here is the direct consequence of re-using an old flag.

### How do I keep server-side fields backward compatible?

Add, never mutate: existing fields keep their meaning, type, and behavior; new semantics go into new fields; old clients ignore what they don't recognize. Keeping a field's name while changing its meaning is a breaking change to every existing reader.

### What should old clients do when they read data with new semantics?

Three steps: bound the impact to a self-healing window (a calendar-month flip restores collection automatically); prompt upgrades at release to shorten the overlap window; keep server writes idempotent (upsert) so interleaved old/new writes blend safely — no rollback, no data cleanup.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
