---
title: "Same Product, 4× the Inquiry Cost: It's the Ad Solution, Not the Product"
description: "The same product costs ¥17–78 per inquiry across ad solutions. The ranking follows the solution, not the product."
date: 2026-09-02
tags: [B2B, E-commerce, Advertising]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "The same product shows very different inquiry costs across ad solutions — is that normal?"
    a: "Yes. Across three key products we measured ¥17 to ¥78 for the same product, and the ordering was dictated by the solution — the merchant growth program was priciest for all three. Each solution buys different traffic."
  - q: "Which inquiry cost should I use to judge a product?"
    a: "The blended one: total spend across all solutions ÷ total inquiries. A single-solution number only says what that channel pays for this traffic — it cannot grade the product."
  - q: "Can I compare costs across different ad solutions directly?"
    a: "Only within overlapping time windows. When old and new solutions don't share dates, the gap mixes solution differences with market seasonality — comparing directly misleads."
---

## TL;DR

The same product, listed in different marketplace ad solutions, can cost 4× more per inquiry. Weekly ad records for three key products in one store show the same product ranging from ¥17 to ¥78 — and **the ordering is dictated by the solution**: the merchant growth program is the most expensive for all three products, and switching solutions moves one product's cost by up to 4×. Three rules fall out: **grade products on the blended number, grade solutions on same-product same-period comparisons, and never compare solution numbers across non-overlapping time windows.**

## The situation: the product you're about to pause was wronged by its channel

Monday review: a product's inquiry cost in your flagship solution looks terrible, and you're considering pausing it. Hold on — the real ledgers of three key products in one industrial-goods store (anonymized) show **the same product ranging from ¥20 to ¥78 depending on the channel it enters through**. Same product, same page, same price. This reconciliation came out of a weekly-ad-ledger audit while building [AI Operations](/docs/ai-analytics).

## Why: for the same product, the solution sets the price

Line up the weekly records of all ad solutions for three key products. Full-history view first (inquiry cost = cumulative spend ÷ cumulative inquiries):

| Ad solution | Delivery window | Product A | Product B | Product C |
|-------------|-----------------|-----------|-----------|-----------|
| Whole-store promotion | 2024-04 ~ 2026-06 (68–116 wks) | ¥30 | ¥37 | ¥26 |
| Site-wide, shop-boosting | 2025-11 ~ 2026-06 (31–33 wks) | ¥25 | ¥25 | ¥17 |
| Merchant growth program | since 2026-06-29 (8 wks) | ¥77 | ¥78 | ¥49 |
| New-customer crowd | same period (8 wks) | ¥50 | ¥20 | ¥29 |
| Cross-border express | same period (7–8 wks) | ¥42 | ¥22 | ¥28 |

Three layers of structure, each more useful than the last:

**1. Full history: priciest vs cheapest is 4×+** — ¥78 against ¥17.

**2. The ordering is dictated by the solution.** The "Merchant growth program" is the most expensive for all three products (¥49–78) — three completely different products, uniformly expensive in this one solution. The dominant factor is the **solution** (what traffic it buys), not the product (what it sells).

**3. Within the same period: 1.8–3.9×.** The last three solutions share one time window (8 weeks from 2026-06-29), so their comparison is clean: 1.8× for Product A, 3.9× for Product B, 1.8× for Product C.

![Same product, three ad solutions: inquiry cost comparison](/images/blog/1688-same-product-two-plans-en.png)

*(Technical note: the first two solutions' data ends on 2026-06-29 and the last three start that very day — the windows don't overlap. So "old ¥25 vs new ¥77" mixes two factors: solution differences and market seasonality; concluding directly misleads. Statistically this is kin to Simpson's paradox — conclusions consistent per layer can flip once merged. Every "n×" claim in this article comes from the same-period window only.)*

One counter-intuitive detail: **the "Merchant growth program" isn't cold-start expensive — it keeps getting more expensive.** Across its 8 weeks, inquiry cost climbed from ¥26 to ¥107. That retires the "give the new solution time" excuse; money dictated by traffic structure does not arrive with waiting.

## What it's worth: two ledgers

**The mis-kill ledger.** Product B runs at ¥20 per inquiry in "New-customer crowd," about a dozen-plus inquiries a month. Pause the product because it shows ¥78 in the growth program, and what you discard is not a bad product — it's a cheap channel still delivering steadily.

**The true-cost ledger.** Which of Product B's five numbers (¥37 / ¥25 / ¥78 / ¥20 / ¥22) is real? All of them, and none. Its actual acquisition cost is the blended one: ¥32,265 total spend ÷ 911 inquiries = **¥35**. A single-solution number can overstate or understate a product; only the blend is the product's real price tag — and the stable anchor for budget allocation.

## Disciplines for operators

1. **Grade products on the blend**: total spend ÷ total inquiries. Per-solution numbers answer "is this channel expensive," never "is this product good."
2. **Grade solutions on same-product, same-period comparisons**: fix a basket of products and a time window; only then does the ordering mean anything.
3. **Never compare across non-overlapping windows**: solution handover periods are the danger zone — an old solution's historical cost is not the new one's ruler.
4. **A persistently worsening solution isn't worth waiting for**: cut budget after 4+ weeks of climbing costs; make keep-or-stop calls with the settlement discipline from [Is 16 Days Enough for Marketplace Ad Data?](/blog/1688-p4p-ad-data-16-day-settlement) and the full pre-pause checklist in [Five checks before you pause](/blog/1688-campaign-stop-checklist).

<InfoBox variant="warning" title="One line to remember">

Products get the blend; solutions get the same period. Before comparing costs across windows, align the time.

</InfoBox>

## FAQ

### The same product shows very different inquiry costs across ad solutions — is that normal?

Yes. Across three key products we measured ¥17 to ¥78 for the same product, and the ranking followed the solution, not the product — each solution buys different traffic.

### Which inquiry cost should I use to judge a product?

The blended one: total spend across all solutions ÷ total inquiries. A single-solution number only says what that channel pays for this traffic — it cannot grade the product.

### Can I compare costs across different ad solutions directly?

Only within overlapping time windows. When old and new solutions don't share dates, the gap mixes solution differences with market seasonality — comparing directly misleads.

That "line up every channel for the same product" reconciliation is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. Every product's real acquisition cost deserves to be computed once, fully.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
