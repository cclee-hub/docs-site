---
title: "Metrics Inflated 20x After SQL Aggregation? Never SUM Ratio Columns"
description: "SUMming ratio/average columns like CTR, PPC, ROI during weekly aggregation yields a 7-day sum instead of a mean — values inflate by the number of days. Skip ratio columns when aggregating, recompute ratios from totals afterward, and use weighted averages when denominators differ."
date: 2026-08-28
tags: [SQL, PostgreSQL, 数据聚合, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Can you sum percentages?"
    a: "No. Percentages and ratios are relative values with different denominators — SUMming them yields a sum of N relative values, inflated N-fold with no business meaning. Either recompute the ratio from aggregated totals, or take a weighted average using the denominator as weight."
  - q: "Can you add percentages together to get an average?"
    a: "Only when the denominators are identical. Averaging percentages with different denominators is an unweighted average that skews toward small-denominator items. The correct approach is to sum numerators and denominators separately, then divide — mathematically a weighted average."
---

While aggregating daily ad data into weekly reports, the ratio metrics — PPC, CPM, ROI — jumped by tens of times: PPC went from 4.70 in the daily detail to 111.39 in the weekly report.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analysis that surfaces market trends, user behavior, and sales insights to drive precise operations strategy. The ad data API returns daily detail rows, which must be aggregated to week granularity before feeding reports. The first check after launch: PPC 111.39 (daily actual 4.70), CPM 1585.9 (daily actual 68.6), ROI 169.98 (daily actual 1.82) — all 13 ratio/average columns distorted.

## TL;DR

Applying `SUM` directly to **ratio/average columns** like CTR, PPC, ROI in an aggregation query yields "the sum of daily ratios," not a mean — values inflate proportionally to the number of days aggregated. Two rules: **aggregate only additive columns** (impressions, clicks, cost — the totals), skipping every ratio column; **recompute ratios from the totals after aggregating** (cost ÷ clicks, clicks ÷ impressions). If you only have ratios without the underlying totals, take a weighted average using the denominator as weight — never a plain average.

## The Symptom

The aggregation code SUMmed "every numeric column," silently sweeping ratio columns along:

```sql
-- Wrong: SUM every column
SELECT
  campaign_id,
  date_trunc('week', day) AS week,
  SUM(clicks)      AS clicks,
  SUM(impressions) AS impressions,
  SUM(ppc)         AS ppc,   -- sum of 7 daily PPC values!
  SUM(ctr)         AS ctr,   -- sum of 7 daily CTR values!
  SUM(roi)         AS roi    -- sum of 7 daily ROI values!
FROM daily_ad_report
GROUP BY campaign_id, date_trunc('week', day);
```

Measured comparison (one campaign, one week):

| Metric | Daily actual | SUM weekly | Inflation |
|--------|-------------|------------|-----------|
| ppc    | 4.70        | 111.39     | ~24×      |
| cpm    | 68.6        | 1585.9     | ~23×      |
| roi    | 1.82        | 169.98     | ~93×      |

No errors anywhere: data ingested normally, reports rendered normally — only by comparing the weekly report against daily details side by side could you see values off by one to two orders of magnitude.

## Root Cause

**Ratios and averages are non-additive derived quantities.** Each day's `ppc = cost / clicks` has a different denominator; adding 7 daily PPC values mathematically yields "a sum of 7 relative values," which has no business meaning. CTR and ROI are the same.

**"Sum all numeric columns" is a silent trap.** Aggregation code usually loops over columns uniformly, and ratio columns slip in without error or warning — results just quietly distort. The more columns you have, the harder it is to spot by eye.

**An ROI inflated 93× is actually more deceptive.** It reads as "outstanding ad performance." If downstream consumers read the weekly report directly to make budget decisions, the wrong number propagates all the way into operational actions. In this incident, several read-only consumers queried the weekly table directly — until the table was corrected, every consumer was reading wrong data.

## The Fix

### Step 1: Keep only additive columns in the aggregation

```sql
CREATE VIEW weekly_ad_totals AS
SELECT
  campaign_id,
  date_trunc('week', day) AS week,
  SUM(impressions) AS impressions,
  SUM(clicks)      AS clicks,
  SUM(cost)        AS cost,
  SUM(gmv)         AS gmv
FROM daily_ad_report
GROUP BY campaign_id, date_trunc('week', day);
```

Additive columns are counts/totals (impressions, clicks, cost, orders) — summing them across time intervals still means something.

### Step 2: Recompute all ratios from totals after aggregating

```sql
SELECT
  campaign_id,
  week,
  impressions,
  clicks,
  cost,
  CASE WHEN clicks > 0
       THEN cost / NULLIF(clicks, 0)::numeric
       ELSE 0 END AS ppc,
  CASE WHEN impressions > 0
       THEN clicks::numeric / NULLIF(impressions, 0)
       ELSE 0 END AS ctr,
  CASE WHEN cost > 0
       THEN (gmv - cost)::numeric / NULLIF(cost, 0)
       ELSE 0 END AS roi
FROM weekly_ad_totals;
```

Two details: PostgreSQL integer division truncates, so cast with `::numeric` before dividing; return 0 when the denominator is 0, keeping the same convention as the daily layer.

### Step 3: When you only have ratios, use a weighted average

```sql
-- Aggregate daily CTR weighted by impressions (expanded form: SUM(ctr × impressions) / SUM(impressions))
SELECT
  date_trunc('week', day) AS week,
  SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) AS ctr_weighted
FROM daily_ad_report
GROUP BY date_trunc('week', day);
```

A weighted average is essentially "reconstruct numerator and denominator, then divide" — as long as you can still access the weight column, always prefer it over a plain average.

After the fix, all 13 ratio columns in the weekly report matched the measured daily values. Historical dirty data was backfilled with the same formulas, and read-only downstream consumers became correct automatically — without changing a single line of code.

<InfoBox variant="warning" title="Heads up">
Generic aggregation code that "sums every numeric column" is the source of this class of incident: maintain an **allowlist of additive columns**, explicitly excluding ratio/average columns. When adding a new metric column, first answer: "does summing this across days still mean something?"

When multiple granularities (weekly, monthly) derive from the same daily table, converge "recompute ratios from totals" into one function or view instead of copying the formula into each report SQL — metric-definition drift usually starts with copy-paste.

After fixing the aggregation logic, remember to backfill historical data: aggregation errors usually persist for many cycles, and fixing code without backfilling leaves old wrong values in the reports.
</InfoBox>

## FAQ

### Can you sum percentages?

No. Percentages and ratios are relative values with different denominators per row — SUMming them yields a sum of N relative values, inflated by the number of periods aggregated, with no business meaning. The correct approach is to skip ratio columns during aggregation and recompute from totals afterward (clicks ÷ impressions, cost ÷ clicks); when you only have ratios without totals, take a weighted average using the denominator as weight.

### Can you add percentages together to get an average?

Only when the denominators are identical. Averaging percentages with different denominators is an unweighted average that skews toward small-denominator items (extreme ratios from low-traffic days get amplified). The correct approach is to sum numerators and denominators separately, then divide — mathematically equivalent to a weighted average by denominator.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
