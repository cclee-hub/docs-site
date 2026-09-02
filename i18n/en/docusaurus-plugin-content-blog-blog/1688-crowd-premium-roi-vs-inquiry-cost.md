---
title: "Inquiry Costs 10% Apart, ROI 4× Apart: Crowd Reports Need Two Rulers"
description: "Costs of ¥38.9 vs ¥43.0 — 10% apart — carried ROI 5.30 vs 1.25. CPI prices traffic; ROI grades it. You need both."
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

The comfortable way to read a crowd report is to sort it: by inquiry cost, cut the priciest; by ROI, cut the worst. In July's real data, those two sorts disagree completely. This reconciliation came out of a crowd-report audit while building [AI Operations](/docs/ai-analytics).

![Similar inquiry costs, ROI 4× apart, within one month](/images/blog/1688-crowd-premium-roi-vs-inquiry-cost-zh.png)

## The data: one ruler prices traffic, the other grades it

**Across crowds (one month, 18 packages)**: inquiry costs spread ¥32–44, yet near-identical costs carried ROI from 1.25 to 5.30 — "store new-buyers" at ¥43.0 cost only 10% more than "cross-border buyers" at ¥38.9, and returned a quarter of the ROI. Inquiry cost measures what it takes to pull in one interested buyer; what those buyers then purchase, and at what value, is invisible to it.

**Across months (the same store, seven months)**: January–June crowd inquiry costs held at ¥16–21 with ROI 8.4–18.5; **in July, spend tripled (×3.1), cost doubled to ¥39, and ROI collapsed to 4.0**. All 18 packages breached together — July was an **environment month** (platform competition, market-wide moves), not one crowd suddenly failing.

*(Technical note: the report's ROI uses 15-day-attributed GMV — while measured attribution back-fill runs as late as day 29 after week end, see [Is 16 Days Enough for Marketplace Ad Data?](/blog/1688-p4p-ad-data-16-day-settlement). That ROI only counts what landed inside 15 days: systematically low for long-cycle B2B buyers, and still drifting between months as the ledger finishes posting.)*

## What it's worth: the mis-pruning ledger

Repricing by a single ruler in an environment month is wrong in both directions: June's good environment (ROI 18.5) inflates every crowd and hides the ones that genuinely need fixing; July's bad environment (ROI 4.0) condemns them all — including crowds that were merely dragged down by the month. Separating "environment" from "crowd" is what makes pruning precise: **what deserves cutting deserves it in good months too; nothing gets cut for the weather.**

## Disciplines for operators

1. **Read both rulers together**: inquiry cost prices the traffic; ROI grades it. Similar costs with multiples-apart ROI is an audience-selection problem — repricing cannot fix it.
2. **No rankings in environment months**: when store-wide crowd spend and costs move together (as in July), cross-audience comparisons are void that month.
3. **Discount the ROI**: 15-day-attributed ROI runs systematically low for B2B and drifts before settlement — it has not earned the "sole benchmark" chair.
4. **Reprice on consecutive trends**: single months are noise; three months in one direction with real magnitude is a trend. The full monthly procedure lives in [The 1688 Crowd Premium Monthly Method](/docs/1688-crowd-premium-guide).

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
