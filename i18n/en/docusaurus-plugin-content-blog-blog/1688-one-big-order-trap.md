---
title: "One Week at ROI 61.6, Eight Weeks Under 2: How a Lucky Order Ruins Ad Judgment"
description: "9 weeks of ledger: 8 weeks at ROI 0–2.1, one week at 61.6 (6 orders, ¥15,143). Budget on inquiries, not on luck."
date: 2026-09-02
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I tell if ROI is propped up by a big order?"
    a: "Split the window and look: attribution clustered in one week, falling back after, with inquiry volume unchanged — the acquisition ability never changed; that week's luck did."
  - q: "Why can't I budget on a big-order week's ROI?"
    a: "It doesn't repeat. Measured case: one week at ROI 61.6, the other eight between 0 and 2.1 — scale budgets on 61.6 and the next cycle arrives before the luck does."
  - q: "What if attributed orders suddenly drop to zero?"
    a: "Check inquiries first: unchanged inquiries mean the luck receded — decide on normal efficiency; shrinking inquiries mean real decay — entirely different treatment."
---

## TL;DR

Nine weeks of real ledger for one product in one campaign: **8 weeks at ROI between 0 and 2.1, and one week at 61.6** — 6 orders carrying ¥15,143. If you happened to open the report that week and scaled budget, the next month walked it straight back down. **A big order is a surprise, not a baseline: budgets follow the normal pace of inquiries, not the luck of orders.**

## The situation: the weekly report that looked too good to question

The weekly report pulls up: one product at ROI 61.6 on ¥246 of spend, ¥15,143 in orders. Every operator's pulse quickens — a ten-x signal, worth budgeting, worth replicating.

Lay out nine weeks before touching anything. This drill-down came out of a product-ledger audit while building [AI Operations](/docs/ai-analytics).

## The data: one needle in nine weeks

Same product, same campaign (whole-store promotion), nine consecutive weekly rows:

| Week | Spend | Orders | Order value | ROI |
|------|-------|--------|-------------|-----|
| 1 | ¥198 | 3 | ¥24 | 0.1 |
| 2 | ¥249 | 4 | ¥213 | 0.9 |
| 3 | ¥196 | 0 | ¥0 | 0.0 |
| **4** | **¥246** | **6** | **¥15,143** | **61.6** |
| 5 | ¥233 | 8 | ¥490 | 2.1 |
| 6 | ¥156 | 3 | ¥228 | 1.5 |
| 7 | ¥180 | 2 | ¥208 | 1.2 |
| 8 | ¥180 | 3 | ¥52 | 0.3 |
| 9 | ¥234 | 0 | ¥0 | 0.0 |

Spend held steady at ¥156–249 all nine weeks. The only variable that moved in week four was order value. The running norm is ROI around 1; the 61.6 fell out of the sky.

## Why it deceives

*(Technical note: weekly granularity cannot see inside the orders. Week four's ¥15,143 across 6 orders averages ¥2,524 per order — dozens of times the neighboring weeks' per-order value. Whether that was one large order or several mid-size ones is only answerable at daily or order level; the weekly report can't say — but it says enough that "something unusual happened; conclude nothing yet.")*

The big-order week creates three illusions at once: it inflates perceived acquisition ability (inquiry volume never moved), it promises repeatability (big orders are low-probability draws), and it aims your budget at the wrong place (the norm was ROI ≈ 1 — scaling a norm-negative setup scales the loss).

## What it's worth: the misallocation ledger

Budgeting on week four's 61.6 treats the setup as a ten-x machine. Two calculations, two worlds: the 9-week blended ROI is ¥16,358 ÷ ¥1,872 = **8.7**; excluding the big-order week, the 8-week norm is ¥1,215 ÷ ¥1,626 = **0.7**. **The average lies on the big order's behalf** — one number, two lives. A norm of 0.7 means seventy cents back per yuan spent: this setup's ~¥200 weekly burn was already a net loss, and scaling it only scales the loss.

## Disciplines for operators

1. **Read windows in segments, never as one average**: cut the observation period into 4-week chunks — the average blends "once was good" and "now is not" into a fictitious "okay."
2. **Inquiries are the thermometer**: flat inquiries across the spike mean acquisition ability never changed, only luck did; inquiries shrinking alongside means real decay — entirely different treatment.
3. **Book big orders as surprises**: budget decisions run on the no-big-order norm; for setups propped by one, extend observation and look at a cycle without the luck.
4. **Extreme weeks trigger drill-downs, not decisions**: seeing 61.6 or 0.0, step one is always the daily-level distribution — never the budget slider.

<InfoBox variant="warning" title="One line to remember">

Attribution clustered in one week, falling back after, inquiries unchanged = big-order illusion. Budget on the norm of inquiries, not the luck of orders; extreme weeks trigger drill-downs, not decisions.

</InfoBox>

## FAQ

### How do I tell if ROI is propped up by a big order?

Split the window and look: attribution clustered in one week, falling back after, with inquiry volume unchanged — the acquisition ability never changed; that week's luck did.

### Why can't I budget on a big-order week's ROI?

It doesn't repeat. Measured case: one week at ROI 61.6, the other eight between 0 and 2.1 — scale budgets on 61.6 and the next cycle arrives before the luck does.

### What if attributed orders suddenly drop to zero?

Check inquiries first: unchanged inquiries mean the luck receded — decide on normal efficiency; shrinking inquiries mean real decay — entirely different treatment.

That "segmented windows + inquiry thermometer + daily drill-down" method is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. Extremely beautiful numbers deserve verification before belief.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
