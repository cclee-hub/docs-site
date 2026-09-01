---
title: "Fast Data vs. Slow Data: When Are B2B Ad Reports Actually Ready?"
description: "Spend and inquiries settle within days; transactions and ROAS keep drifting for weeks. Two data speeds, two uses — mix them and every monthly review is corrupted."
date: 2026-08-31
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "When in the month can I trust last month's B2B ad report?"
    a: "Spend and inquiries settle within the first three to five days — that is enough for bid decisions. Transactions and ROAS keep back-filling for weeks and should be treated as reference until settled."
  - q: "Why did the transaction numbers change after I first read the report?"
    a: "Transactions are attributed retroactively: buyers click today and order weeks later, and platforms keep crediting those orders back during the attribution window. Mid-month readings are interim values."
  - q: "Can the current, unfinished month enter any judgment?"
    a: "No. Partial-month spend against partial-month inquiries produces meaningless costs. Judgment uses completed months only; treat the current month as a progress bar."
---

## TL;DR

Ad data arrives at two speeds. Spend and inquiries happen on the day of the click and are stable within days. Transactions and ROAS are back-filled over weeks. Decide early on the fast lane; audit later on the slow lane — and never let a half-finished month into either.

## The numbers changed after you already decided

On the 4th you read last month's audience report and adjusted bids. On the 18th you reopen it — transactions and ROAS have drifted from what you saw. Now you doubt the decision.

Nothing was wrong. You just trusted one number at two different maturities.

## The fast lane: stable within days

Spend and inquiries are **same-day facts**: a click logs spend, a quote request logs an inquiry, both on the day they happen. Nothing needs to arrive later. Within the first three to five days of a month, last month's fast data is final.

That is why monthly bid reviews can run early. The primary benchmark — inquiry cost (spend ÷ inquiries) — is built entirely from fast data, and it is trustworthy by day three to five. See [B2B Ads: Optimize for Inquiry Cost, Not ROAS](/blog/1688-crowd-premium-roi-vs-inquiry-cost).

## The slow lane: weeks of back-filling

Transactions work differently. A buyer clicks today and orders three weeks later; the platform credits that order back to the ad during a fixed attribution window. The marketplace equivalent of the settlement mechanics is in [Why marketplace ad data needs 16 days before you judge it](/blog/1688-p4p-ad-data-16-day-settlement).

Consequence: **early-month transaction and ROAS figures are interim.** They are not wrong — they are unfinished. Mid-month they will differ; that is the window doing its job, not the data misbehaving.

## The floor: completed months only

One rule sits under both lanes: **the in-progress month never enters judgment.** Judgment compares "last month vs. the month before," both completed. Half a month of spend against half a month of inquiries yields a cost that describes nothing.

If your dashboard shows a current-month column, read it as a progress bar, not a score.

## The monthly rhythm

| When | What |
|------|------|
| Days 3–5 | Last month's fast data final → run bid decisions |
| Mid-month | Slow data (transactions, ROAS) keeps back-filling → recheck early calls |
| Month-end | New month in progress → progress bar only, no judgment |

<InfoBox variant="warning" title="One sentence to remember">

Fast data drives decisions, slow data drives audits: bids go out on days 3–5 using spend and inquiries, transactions get read only after settlement, and the current month is never, ever judged.

</InfoBox>

## FAQ

### When in the month can I trust last month's B2B ad report?

Spend and inquiries settle within the first three to five days — that is enough for bid decisions. Transactions and ROAS keep back-filling for weeks and should be treated as reference until settled.

### Why did the transaction numbers change after I first read the report?

Transactions are attributed retroactively: buyers click today and order weeks later, and platforms keep crediting those orders back during the attribution window. Mid-month readings are interim values.

### Can the current, unfinished month enter any judgment?

No. Partial-month spend against partial-month inquiries produces meaningless costs. Judgment uses completed months only; treat the current month as a progress bar.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
