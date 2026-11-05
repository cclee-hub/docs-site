---
title: "Rank Crowds by Cost or ROI? Same Cost, 4× Apart in ROI"
description: "Two crowds at ¥38.9 vs ¥43.0, costs 10% apart, returned ROI 5.30 vs 1.25 across 18 audience packages. Cost prices traffic; ROI grades it — use both."
date: 2026-09-02
tags: [B2B, E-commerce, Advertising]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Should audience performance be judged on ROI or inquiry cost?"
    a: "Both, always: inquiry cost is the price of the traffic, ROI is its quality. Either one alone gets bent out of shape by environment months or single big orders."
  - q: "Why can similar-cost audiences differ 4× in ROI?"
    a: "Inquiry cost only says whether the traffic was expensive, not whether the buyers convert. Audiences with different order sizes and paths turn the same inquiry price into very different GMV."
  - q: "What to do in a month when all crowd costs jumped together?"
    a: "Call it an environment month — when store-wide crowd spend and costs double together, no cross-audience repricing; return to each crowd's own trend after the environment recovers."
---

## TL;DR

July data from 18 audience packages in one store: two crowds with inquiry costs just 10% apart (¥38.9 vs ¥43.0) ran **4× apart in ROI** (5.30 vs 1.25). Inquiry cost and ROI answer different questions — **cost per inquiry says whether the traffic was bought expensively; ROI says whether the buyers were worth it** — and either ruler alone, used in an environment month, will mislead you.

## The situation: ranking by one metric produces fiction

The comfortable way to read a crowd report is to sort it: by inquiry cost, cut the priciest; by ROI, cut the worst. In July's real data, those two sorts disagree completely. This reconciliation came out of a crowd-report audit while building AI Operations.

![Similar inquiry costs, ROI 4× apart, within one month](/images/blog/1688-crowd-premium-roi-vs-inquiry-cost-zh.webp)

## The data: one ruler prices traffic, the other grades it

**Across crowds (one month, 18 packages)**: inquiry costs spread ¥32–44, yet near-identical costs carried ROI from 1.25 to 5.30 — "store new-buyers" at ¥43.0 cost only 10% more than "cross-border buyers" at ¥38.9, and returned a quarter of the ROI. Inquiry cost measures what it takes to pull in one interested buyer; what those buyers then purchase, and at what value, is invisible to it.

**Across months (the same store, seven months)**: January–June crowd inquiry costs held at ¥16–21 with ROI 8.4–18.5; **in July, spend tripled (×3.1), cost doubled to ¥39, and ROI collapsed to 4.0**. All 18 packages breached together — July was an **environment month** (platform competition, market-wide moves), not one crowd suddenly failing.

| View | Subject | Inquiry cost | ROI | Note |
|------|---------|--------------|-----|------|
| Across crowds (July) | Cross-border buyers | ¥38.9 | 5.30 | Highest ROI among the 18 packages |
| Across crowds (July) | Store new-buyers | ¥43.0 | 1.25 | 10% pricier, a quarter of the ROI |
| Across crowds (July) | All 18 packages | ¥32–44 | 1.25–5.30 | Costs bunch in a narrow band; ROI fans out 4× |
| Across months (Jan–Jun) | Store-wide crowds | ¥16–21 | 8.4–18.5 | The normal-environment watermark |
| Across months (July) | Store-wide crowds | ¥39 (about doubled) | 4.0 | Spend ×3.1; all packages breached together |

*(Technical note: the report's ROI uses 15-day-attributed GMV — while measured attribution back-fill runs as late as day 29 after week end, see [Is 16 Days Enough for Marketplace Ad Data?](/blog/1688-p4p-ad-data-16-day-settlement). That ROI only counts what landed inside 15 days: systematically low for long-cycle B2B buyers, and still drifting between months as the ledger finishes posting.)*

## What it's worth: the mis-pruning ledger

Repricing by a single ruler in an environment month is wrong in both directions: June's good environment (ROI 18.5) inflates every crowd and hides the ones that genuinely need fixing; July's bad environment (ROI 4.0) condemns them all — including crowds that were merely dragged down by the month. Separating "environment" from "crowd" is what makes pruning precise: **what deserves cutting deserves it in good months too; nothing gets cut for the weather.**

## Disciplines for operators

1. **Read both rulers together**: inquiry cost prices the traffic; ROI grades it. Similar costs with multiples-apart ROI is an audience-selection problem — repricing cannot fix it.
2. **No rankings in environment months**: when store-wide crowd spend and costs move together (as in July), cross-audience comparisons are void that month.
3. **Discount the ROI**: 15-day-attributed ROI runs systematically low for B2B and drifts until settlement closes (when the platform locks the period's numbers and stops back-filling) — it has not earned the "sole benchmark" chair.
4. **Reprice on consecutive trends**: single months are noise; three months in one direction with real magnitude is a trend. The full monthly procedure lives in [The 1688 Crowd Premium Monthly Method](/docs/1688-crowd-premium-guide).

## The judgment order for developers

The discipline above ships as an automated pipeline in the crowd report. A comparable month = a finalized month (16 days after month-end, the attribution cutoff) with spend in that month; for cost-trend math, months with zero inquiries are filtered out as well. Checks run in dependency order, later checks overriding earlier conclusions:

| Order | Check | Trigger | Outcome | Override relation |
|-------|-------|---------|---------|-------------------|
| 1 | Finalized-month filter | Only finalized months are judged (16 days after month-end) | Months still in progress are excluded whole | Runs before everything |
| 2 | Whitelist split | Crowd not on the operable whitelist (crowds that can actually be repriced) | No data, no judgment | Domain gate |
| 3 | Low-spend grouping | Finalized final-month spend below 0.10 × the median spend of operable crowds | Grouped separately, no advice | Before trend; untouched by freeze |
| 4 | Trend check | Two consecutive comparable months with spend but zero inquiries → cut candidate; the 2 moves across the latest 3 cost-comparable months point the same way with cumulative change ≥ 0.20 → raise/cut; fewer than 3 months → insufficient | Three-way directional call | Zero-inquiry outranks magnitude |
| 5 | Market-freeze overlay | Store-wide inquiry cost moves more than 0.40 month-over-month | Every directional call above flips to frozen | Overrides all directional calls, zero-inquiry cuts included |
| 6 | Execution-state filter | Marked stopped → stopped; premium already 0 → no cut advice | Re-judged by execution facts | Runs last, overrides directional calls |

*(Technical note: the environment check sits after the trend check, not before — each crowd gets its own direction first, then the store-wide overlay flips directional calls to frozen; an environment month freezes the advice without swallowing state groups like low-spend or insufficient data. The freeze trigger is the inquiry-cost ratio, not spend: if spend doubles and inquiries double with it, cost hasn't moved and month-over-month self-comparison still works — freezing only when the efficiency baseline itself shifts. The 0.40 threshold comes from the measured split — normal months move 0.5%–27.6%, structure months 98%–116% — and 0.40 sits mid-band. And the 15-day ROI is display-only in this pipeline; it never enters the judgment.)*

<InfoBox variant="warning" title="One line to remember">

Inquiry cost prices the traffic; ROI grades it. No rankings in environment months; reprice on consecutive trends.

</InfoBox>

## FAQ

### Should audience performance be judged on ROI or inquiry cost?

Both, always: inquiry cost is the price of the traffic, ROI is its quality. Either one alone gets bent out of shape by environment months or single big orders.

### Why can similar-cost audiences differ 4× in ROI?

Inquiry cost only says whether the traffic was expensive, not whether the buyers convert. Audiences with different order sizes and paths turn the same inquiry price into very different GMV.

### What to do in a month when all crowd costs jumped together?

Call it an environment month — when store-wide crowd spend and costs double together, no cross-audience repricing; return to each crowd's own trend after the environment recovers.

That "two rulers + environment detection" method for crowd reports is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. A crowd report deserves more than one sort button.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
