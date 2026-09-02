---
title: "A Real Store-Wide Efficiency Alert, From a 40-Week Ledger"
description: "Inquiry cost held at ¥25–31 for 29 weeks, then 7 weeks above the band. How to set the band, and a full post-mortem."
date: 2026-09-02
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What signals a store-wide ads efficiency decline?"
    a: "Weekly inquiry cost above your own historical band for 3+ consecutive weeks while spend holds — each campaign can look passable alone while the sum is sinking."
  - q: "How do I set the 'normal band'?"
    a: "Take your own half-year of weekly inquiry costs, exclude abnormal weeks (holidays, delivery gaps), and use the median ±10% as the band. Stores with thin history should accumulate first."
  - q: "What is the first move after an alert?"
    a: "Hunt for an account-level cause before touching campaigns: solution switches, gap-and-restart episodes — store-wide breaches are usually account-level events."
---

## TL;DR

A real ledger from one store: across 29 historical weeks, store-wide inquiry cost held a stable band of **¥25–31**. After new ad solutions launched on June 29, it ran at **¥34–49 for 7 consecutive weeks — then hit ¥69 in week eight**. Store-wide decay never announces itself as an incident; it shows up as "every campaign looks fine." So you need a ruler for the sum: **a band set by your own history, and an alert on 3 consecutive weeks above it.** Had the alarm fired in week three, roughly **¥7,400** of the overspend in the following five weeks would have been avoided.

## The situation: every campaign "fine," the sum deteriorating

Per-campaign reviews read as usual: this campaign's numbers match last month's, that one is stable, the new one is still ramping. All passable.

At the store level: every July week sat above ¥40 per inquiry — in the previous 29 weeks, that line had been crossed exactly once (the Spring Festival week). This post-mortem came out of a store-ledger audit while building [AI Operations](/docs/ai-analytics).

![Store-wide inquiry cost across 40 weeks: historical band and the breach](/images/blog/1688-store-efficiency-alert-en.png)

## The method: set the band from your own history

The baseline is not the industry and not a target — it is **your own past**:

1. Take weekly store-wide inquiry cost (weekly spend ÷ weekly inquiries) for the past six months
2. **Exclude abnormal weeks**: here, two kinds — the Spring Festival week (¥121, spend collapse masquerading as expensiveness) and a 3-week delivery gap in early June (weekly spend ¥90–281, near-dark)
3. The remaining 26 weeks land between ¥20–41, concentrated in **¥25–31** — that band is "normal"
4. Alert condition: **3+ consecutive weeks above the band's top, with spend not shrinking** (cost rising because spend is collapsing is a different problem)

*(Technical note: why "consecutive 3 weeks" rather than any single week — in the 29 historical weeks, single-week breaches happened 4 times, all noise; consecutive breaches happened zero times. The baseline tells you how strict the threshold should be.)*

## The full post-mortem

- **June 8–22: a 3-week gap.** Weekly spend fell from ~¥1,900 to ¥90–281 — near-dark
- **June 29: new ad solutions launched** (the solution-switch details and data are in [Same Product, 4× the Inquiry Cost](/blog/1688-same-product-two-plans))
- **From June 29: 7 consecutive weeks above the band** — ¥46 / 43 / 40 / 43 / 40 / 49 / 34, every one above the historical top of ¥31
- **Week of August 17: ¥69**, as spend spiked to ¥5,210 without inquiries following

A gap-and-restart is not a return to the old normal: the environment changed and the solutions changed — the old cost level no longer applies. That is exactly the kind of account-level shift single-campaign views cannot see, and only the store line exposes.

## What it's worth: the overspend ledger

The 7 breached weeks (Jun 29 – Aug 10) spent ¥24,699 for 592 inquiries — ¥41.7 each. At the historical level (¥28), the same inquiries would have cost ¥16,576: **about ¥8,100 of overspend in 7 weeks.** Had the alarm fired in week three and intervention started in week four, roughly **¥7,400** of the last five weeks' overspend was avoidable. That is the price of the ruler: set it once, watch one number.

## Disciplines for operators

1. **The band must come from your own history**: at least six months of weekly data, abnormal weeks excluded. A three-week average as a ruler is worse than no ruler.
2. **3 consecutive weeks above the top, with spend holding, = alert**: single weeks are noise; consecutive weeks are structure.
3. **After an alert, hunt the common cause first**: solution switches, gap-and-restarts, category-wide competition shifts are account-level events — fixing campaigns one by one treats symptoms.
4. **The cost numbers themselves must settle first**: weekly data carries a settlement tail; the discipline is in [Is 16 Days Enough for Marketplace Ad Data? We Re-Collected 5 Weeks to Find Out](/blog/1688-p4p-ad-data-16-day-settlement).

<InfoBox variant="warning" title="One line to remember">

Set the band from history (six months, abnormal weeks out); 3 consecutive weeks above it = alert. Alerts trigger a hunt for account-level causes; actions stay at campaign level.

</InfoBox>

## FAQ

### What signals a store-wide ads efficiency decline?

Weekly inquiry cost above your own historical band for 3+ consecutive weeks while spend holds — each campaign can look passable alone while the sum is sinking.

### How do I set the 'normal band'?

Take your own half-year of weekly inquiry costs, exclude abnormal weeks (holidays, delivery gaps), and use the median ±10% as the band. Stores with thin history should accumulate first.

### What is the first move after an alert?

Hunt for an account-level cause before touching campaigns: solution switches, gap-and-restart episodes — store-wide breaches are usually account-level events.

That "band from history, watch the store" alerting logic is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. Efficiency decay should not wait for a quarterly review to be discovered.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
