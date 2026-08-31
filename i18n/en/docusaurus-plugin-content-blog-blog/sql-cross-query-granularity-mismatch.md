---
title: "Row Exists in the Detail Query but Not the Summary? Cross-Query Predicate Granularity Mismatch"
description: "A data warehouse detail query flags an entity as anomalous while the summary query has no such row — two SQL statements define the same business predicate at different aggregation granularity. Fix: verbatim-shared predicate CTEs, unified granularity, and row-set containment checks."
date: 2026-08-28
tags: [SQL, PostgreSQL, Data Warehouse, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why do two SQL queries return different results on the same data?"
    a: "Check three differences first: aggregation granularity (different GROUP BY dimensions), filter conditions (different WHERE/HAVING logic), and point in time. This post's case is granularity: judging per campaign×entity vs per entity can produce opposite verdicts."
  - q: "When do I use HAVING vs WHERE for aggregate conditions in SQL?"
    a: "WHERE filters rows, HAVING filters groups. But choose the granularity first: with the wrong grouping dimension, a correct HAVING still contradicts another query written at a different level."
  - q: "How do I keep data definitions consistent across reports?"
    a: "Define each business predicate in exactly one place, share predicate CTEs verbatim across queries, run containment checks (A ⊆ B) before cross-referencing row sets, and version + replay any definition change against historical data."
---

While triaging a dashboard lead in an ad-data pipeline: an offer was flagged "suspected paused" in the diagnostic detail, complete with a reinvestment suggestion — yet the "suggested actions" list had no row for it. The detail page pointed at a table that didn't contain it.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics platform that surfaces market trends, user behavior, and sales data; the diagnostic detail and the suggestion list come from two adjacent queries in the pipeline.

## TL;DR

Two queries defined the same business predicate ("suspected paused") at **different aggregation granularity**: the detail query judged at campaign×offer level — any single campaign with no spend in the last week flags it; the candidate list judged at whole-offer level — **all** campaigns must be spend-free to qualify. One offer still had spend (3.09) in one campaign, so the detail flagged it while the summary skipped it, leaving a dangling reference in the UI. Three fixes: unify the definition at the coarser granularity, make the predicate CTEs **verbatim-identical**, and verify **row-set containment** before cross-referencing.

## Symptoms

Two queries, each with its own definition of "suspected paused":

```sql
-- Query 4, diagnostic detail: pair granularity (campaign × offer)
WITH consumption_paused_q4 AS (
  SELECT offer_id, campaign_id
  FROM spend_weekly
  GROUP BY offer_id, campaign_id        -- each campaign judged alone
  HAVING SUM(spend) FILTER (WHERE is_last_week) = 0
)

-- Query 5, suggestion candidates: offer granularity (summed across campaigns)
WITH suspected_paused_q5 AS (
  SELECT offer_id
  FROM spend_weekly
  GROUP BY offer_id                     -- the whole offer judged together
  HAVING SUM(spend) FILTER (WHERE is_last_week) = 0
)
```

The problematic offer hung under multiple campaigns, one of which still had spend (3.09) in its last week:

```
Query 4 (pair level):   campaign A last-week spend = 0    → flagged ✓, suggestion attached
Query 5 (offer level):  summed last-week spend = 3.09     → excluded ✗
UI: detail says "see the suggestion table"; the suggestion table has no such row
```

No errors, plausible totals — the dangling reference only surfaces when someone follows a specific detail row.

## Root Cause

The "same source" contract had a coverage gap. The pipeline spec requires the feature-column CTEs of adjacent queries to be **verbatim identical** — that rule was followed to the letter. But it only covers feature columns; **the predicate set (the business judgment before WHERE) was out of scope**. "Suspected paused" was implemented twice, at different granularities: pair-level judgment is sensitive to "one campaign has no spend", offer-level judgment to "all campaigns have no spend". For any offer spanning both situations, the two queries must disagree — the overlap zone is mathematically guaranteed.

Cross-query referencing amplified the fork into a dangling reference: the UI treats query 4's rows as details and query 5's table as the entry point, with nobody ever checking "rows(q4) ⊆ rows(q5)". Aggregation-level inconsistency is the classic data-warehouse consistency trap — our earlier post on [SUM over ratio columns inflating aggregated metrics](/blog/sql-aggregation-sum-ratio-columns-inflated) is the same disease in another organ: aggregation happening at the wrong level.

## Solution

### Step 1: Decide the canonical definition before touching SQL

The business question has one answer: "should we keep funding this offer" is an offer-level decision, so the predicate must tighten to **whole-offer granularity** — every attached campaign spend-free in the last week AND no operation annotation rows. Bump the rule version so the change is traceable.

### Step 2: Share the predicate CTE verbatim

Extract the predicate CTE into one text block referenced by both queries; upgrade the contract at the same time: **verbatim sharing covers the predicate set (including granularity), not just feature columns**. One definition, one place to change.

### Step 3: Before cross-referencing, check row-set containment

Make "marker set ⊆ target row set" a standing check (promote it to a test):

```sql
-- Dangling detection: flagged by q4 but absent from q5
SELECT q4.offer_id
FROM consumption_paused_q4 q4
LEFT JOIN suspected_paused_q5 q5 USING (offer_id)
WHERE q5.offer_id IS NULL;
```

Only when this returns 0 rows does the UI earn the right to render both outputs on one page.

### Step 4: Replay against history before shipping

Replay the new definition over historical snapshots: verify every verdict flip (flagged ↔ normal) is correct, with zero collateral flips and zero dangling references, then re-run production validation.

<InfoBox variant="warning" title="Notes">

- "Same source" contracts must cover **predicate granularity**, not just feature columns; feature-column sharing cannot save you from a predicate defined twice.
- Each business predicate (paused, hot, churning...) gets exactly one definition in the pipeline; a second implementation is an incident in waiting.
- Before adding any cross-query reference (A's output rows pointing at B's output table), run the containment check — don't wait for a user to click a dangling link.
- Version every definition change and replay it over historical data; "it works on new data" hides the risk of existing conclusions silently reversing.

</InfoBox>

## FAQ

### Why do two SQL queries return different results on the same data?

Three usual differences: aggregation granularity (different GROUP BY dimensions — campaign×entity vs whole entity in this case), filter logic (different WHERE/HAVING conditions), and point in time. Granularity is the sneakiest: both queries are individually correct, yet their verdicts can contradict.

### When do I use HAVING vs WHERE for aggregate conditions in SQL?

WHERE filters rows before grouping; HAVING filters groups after. But before picking the keyword, pick the granularity — "what counts as one group" determines sensitivity: finer granularity flags more easily (any group qualifies), coarser granularity is conservative (all groups must qualify). Different granularity, opposite verdicts.

### How do I keep data definitions consistent across reports?

One definition per business predicate, predicate CTEs shared verbatim across queries, containment checks (A ⊆ B) before cross-query references, and versioned definition changes replayed over history. Consistency doesn't come from convention — it comes from contracts plus checks.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
