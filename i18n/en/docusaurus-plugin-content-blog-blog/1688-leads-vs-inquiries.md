---
title: "4,111 Leads vs 824 Inquiries: Two Acquisition Costs in One B2B Ad Ledger"
description: "One ledger, two costs: leads ¥8, inquiries ¥41 — 5× apart. Leads count all interactions; budgets run on inquiries only."
date: 2026-09-02
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What is the difference between leads and inquiries in marketplace reports?"
    a: "An inquiry is a buyer-initiated quote request — one action, one record. Leads bundle favorites, add-to-carts, coupons, and contact clicks, counted per action. Same account measured: 4,111 leads vs 824 inquiries — 5× apart."
  - q: "Which cost should reports and budgets use?"
    a: "Lead cost (¥8) is fine for external wins; budget decisions run on inquiry cost (¥41). Planning on ¥8 builds a 5× hole into the quarter."
  - q: "What does 'leads but no inquiries' mean?"
    a: "269 measured keyword-weeks had leads with zero inquiries — engagement that never reached the quote request. Fine for reading buzz; not a result."
---

## TL;DR

One and the same ad ledger, two "acquisition costs": **lead cost ¥8, inquiry cost ¥41 — 5× apart**. One store's keyword-week records measured **4,111 leads against 824 inquiries**. Leads are the wide net (favorites, add-to-carts, coupons, contact clicks — all counted per action); inquiries are one thing only: buyer-initiated quote requests. **Read the buzz from leads, build budgets from inquiries** — plan on ¥8 and the shortfall exists from day one.

## The situation: ¥8 per customer, uplifting enough to scale on

The monthly report's "lead cost" line is beautiful: ¥8 per interested customer. Configuring next quarter's acquisition budget on that number feels like clean logic.

Until "inquiry cost" sits down next to it: ¥41. Same account, same spend, same month — two numbers, 5× apart. This metric audit came out of a definitions check while building [AI Operations](/docs/ai-analytics).

## The data: a 5× gap, and a one-way containment

| Metric | Value |
|--------|-------|
| Total leads | **4,111** |
| Total inquiries | **824** |
| Ratio | **5.0×** |
| Lead cost (¥33,417 ÷ 4,111) | ¥8.1 |
| Inquiry cost (¥33,417 ÷ 824) | ¥40.6 |
| Keyword-weeks with leads, zero inquiries | **269** |
| Keyword-weeks with inquiries, zero leads | **0** |

The last two rows carry the argument: **inquiries always bring leads; leads almost never guarantee an inquiry.** Leads are a superset — *(technical note: the lead definition counts favorites, add-to-carts, coupons, contact clicks and similar interactions, accumulated per action; one buyer clicking "contact" three times logs three leads. An inquiry is exactly one thing: a buyer-initiated quote request. These are not "two metrics" — they are "all interactions" versus "the most valuable kind.")* — and those 269 lead-without-inquiry records are the distance between buzz and business: engagement happened, the quote request never did.

## What it's worth: a 5× budget hole

Set the budget floor on a ¥8 lead cost and the market spend gets configured as if ¥8 buys a customer; the real denominator is ¥41, so **the gap is 5× from the first day**. That is not optimism — it is systematic misallocation: every downstream decision (quotes, margins, scaling pace) sits on an inflated denominator. The lead metric still has a job, and only one: telling you whether content and campaigns moved the buzz.

## Disciplines for operators

1. **Book the two metrics separately, names included**: "lead cost ¥8," "inquiry cost ¥41" — any report that says just "acquisition cost" for both is an accident waiting.
2. **Budgets, repricing, product P&L run on inquiries only**: quote requests cannot be inflated, sit closest to orders, and are the only denominator that counts.
3. **Leads are the buzz thermometer**: a lead spike sends you to check creative and campaigns; it was never a scorecard.
4. **Same rule for audience repricing**: audiences are graded on inquiry cost — the full logic is in [Inquiry Costs 10% Apart, ROI 4× Apart](/blog/1688-crowd-premium-roi-vs-inquiry-cost).

<InfoBox variant="warning" title="One line to remember">

Leads count per action, wide net, for buzz; inquiries one per request, close to orders, for budgets. ¥8 tells the win; ¥41 is the truth.

</InfoBox>

## FAQ

### What is the difference between leads and inquiries in marketplace reports?

An inquiry is a buyer-initiated quote request — one action, one record. Leads bundle favorites, add-to-carts, coupons, and contact clicks, counted per action. Same account measured: 4,111 leads vs 824 inquiries — 5× apart.

### Which cost should reports and budgets use?

Lead cost (¥8) is fine for external wins; budget decisions run on inquiry cost (¥41). Planning on ¥8 builds a 5× hole into the quarter.

### What does 'leads but no inquiries' mean?

269 measured keyword-weeks had leads with zero inquiries — engagement that never reached the quote request. Fine for reading buzz; not a result.

That "metrics booked by definition" practice is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. Two metrics 5× apart should never share a name.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
