---
title: "78% of Keywords Never Produced an Inquiry: Your Cost per Inquiry Is Understated 28%"
description: "78% of 1,641 keyword-weeks produced zero inquiries yet consumed 27% of spend. Naive average ¥32; true blended cost ¥41."
date: 2026-09-02
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What is the right way to calculate B2B ad inquiry cost?"
    a: "Total spend ÷ total inquiries — no exceptions. Leave zero-inquiry spend out of the denominator and the cost reads two to three tenths too low."
  - q: "Should zero-inquiry keywords be paused?"
    a: "Check accumulated spend and observation window first: spend clearly above a reasonable cost with still zero inquiries means stop; freshly added keywords deserve a full settlement cycle."
  - q: "Is quality-weighting inquiries still worth doing?"
    a: "Yes — as a second layer. Fix the base formula first (zero-inquiry spend must not vanish from the denominator), then grade purchase-ready vs casual inquiries."
---

## TL;DR

One store's keyword ledger: of **1,641 keyword-week records, 1,277 (78%) produced zero inquiries while consuming ¥8,962 — 27% of total spend**. The average over "keywords that did produce" comes to ¥32; the blended cost that counts every yuan of spend is **¥41 — a 28% understatement**. The only correct formula is **total spend ÷ total inquiries**: not one yuan of zero-inquiry spend may vanish from the denominator.

## The situation: the cost you see is the survivors' cost

Keyword reports are organized per keyword, so your eyes land on keywords that produced inquiries — those have a cost to show. Zero-inquiry keywords display no cost, and so they quietly exit your field of view.

Their spend, however, left the account in full. This audit came out of a keyword-level check while building [AI Operations](/docs/ai-analytics).

## The data: the missing 27%

| Metric | Value |
|--------|-------|
| Keyword-week records | 1,641 |
| …with zero inquiries | **1,277 (78%)** |
| Spend on zero-inquiry records | **¥8,962 (27% of total)** |
| Total spend / total inquiries | ¥33,417 / 824 |
| Naive average over inquiring keywords | ¥32 |
| **Blended cost (total ÷ total)** | **¥41** |

The naive average only bills the survivors — *(technical note: this is textbook survivorship bias in ad data. Counting only producing samples donates the non-producing samples' spend for free; with 27% of the money missing from the denominator, the cost "improves" by two to three tenths.)*

## What it's worth: what 28% understatement does

The understatement is not cosmetic — it cascades:

- **Acquisition budget**: budget set at ¥32 while reality is ¥41 leaves a ¥9-per-inquiry hole — across 824 inquiries, about **¥7,400**
- **Product go/no-go**: a product line judged against an understated keyword cost reads "still viable" while truly underwater
- **Pricing and margin**: acquisition cost is the hidden floor of B2B quotes; a floor 28% too low cannot carry real deal prices

## Disciplines for operators

1. **One base formula**: cost = total spend ÷ total inquiries. Any "average" that excludes zero-inquiry samples is void on sight.
2. **Keep a separate zero-inquiry watchlist**, sorted by accumulated spend — this is the main battlefield of "check five: truly zero inquiries"; words that burn past a reasonable cost with nothing to show get stopped without ceremony.
3. **Quality weighting is layer two**: once the base is right, weight purchase-ready inquiries (pricing asks, sample requests, volume) above casual ones. No universal weights exist — derive them from your own deal path and **freeze them**, so months stay comparable.
4. **The target line comes from your own history**: normal months (holidays excluded) define the band — the method is in [A Real Store-Wide Efficiency Alert, From a 40-Week Ledger](/blog/1688-store-efficiency-alert).

<InfoBox variant="warning" title="One line to remember">

Cost = total spend ÷ total inquiries. Zero-inquiry spend never disappears from the denominator; quality weighting is always layer two.

</InfoBox>

## FAQ

### What is the right way to calculate B2B ad inquiry cost?

Total spend ÷ total inquiries — no exceptions. Leave zero-inquiry spend out of the denominator and the cost reads two to three tenths too low.

### Should zero-inquiry keywords be paused?

Check accumulated spend and observation window first: spend clearly above a reasonable cost with still zero inquiries means stop; freshly added keywords deserve a full settlement cycle.

### Is quality-weighting inquiries still worth doing?

Yes — as a second layer. Fix the base formula first (zero-inquiry spend must not vanish from the denominator), then grade purchase-ready vs casual inquiries.

That base-formula discipline is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. One notch wrong on the cost formula, and everything downstream is wrong.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
