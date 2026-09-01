---
title: "Why Marketplace Ad Data Needs 16 Days Before You Judge It"
description: "B2B marketplace ad transactions back-fill for up to 16 days — Monday's report is half a ledger. The settlement-window discipline that stops you pausing campaigns on incomplete data."
date: 2026-08-31
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does marketplace ad data need 16 days before judgment?"
    a: "Buyers click ads and order days or weeks later; the platform credits those orders back to the ad during an attribution window of up to 16 days. Data inside the window is still moving."
  - q: "A paused campaign keeps getting transactions — is that normal?"
    a: "Yes. Buyers who clicked before the pause still convert inside the attribution window. That is delayed attribution, not a resurrection — include it when judging the pause decision."
  - q: "When can I read in-flight campaign data?"
    a: "Trends anytime; conclusions only after settlement. Clicks and inquiries are same-day facts stable within days — transactions and ROI wait the full 16 days."
---

## TL;DR

Marketplace ad transactions take up to 16 days to finish posting. The Monday-morning report is half a ledger, and stopping campaigns on it is how good campaigns die. Inquiries read early, transactions read late — keep the two lanes separate.

## You paused it on Monday; the orders arrived by Friday

Monday: last week's campaign report shows real spend, almost no attributed orders. You kill it.

Two weeks later the ledger looks very different — orders kept posting to that campaign, day after day, until it looked healthy. You start wondering whether you paused a winner.

You did neither. The ledger simply wasn't finished when you read it.

## How the ledger actually fills

A buyer who clicks your ad does not buy the same afternoon — B2B buyers especially: they shortlist, request quotes, route approvals, and order ten-plus days later.

Marketplaces handle this by retroactive attribution: when an order lands, the platform looks back inside a fixed window — on the order of **16 days** — and credits the order to the ad touches inside it.

Consequence: every delivery period drags a **settlement tail**. The week that just ended has recorded only part of its orders; the rest posts over the following days. Only at day 16 does the period's account close and the numbers stop moving.

## The three timing disciplines

| When | State of the data | What you may do |
|------|------------------|-----------------|
| Period just ended (Monday) | Fraction of orders posted | Read spend and clicks; conclude nothing |
| Campaign in flight | Unsettled, still moving | Watch the trend; no stop decisions |
| 16 days elapsed | Account closed, numbers final | Make keep-or-stop calls on this |

One line: **urgent decisions wait; closed ledgers decide.**

## The exception: inquiries are same-day facts

Not everything waits 16 days. Clicks and inquiries — buyers actively asking for quotes — are recorded on the day they happen, no retroactive crediting, stable within days.

So read data at two speeds:

- **Traffic capability** (are people clicking, are they asking): days-old data is enough
- **Money capability** (orders, ROI): wait for the closed account

Most misjudgment is the two speeds colliding: half-finished transaction data condemning a campaign whose inquiry curve is perfectly healthy. Which benchmark should lead for B2B, and why, is in [B2B Ads: Optimize for Inquiry Cost, Not ROAS](/blog/1688-crowd-premium-roi-vs-inquiry-cost).

## The "ghost orders" after pausing

Stop a campaign and orders still post to it for a week or two. Not a resurrection — the settlement tail: buyers who clicked before the pause converted inside the window.

Two mistakes this prevents:

- Judging the pause decision the day after — meaningless; wait for the tail to finish
- Auditing a period's overall ROI without its tails — systematically understated, period after period

<InfoBox variant="warning" title="Remember the number 16">

Every delivery period's transactions finish posting up to 16 days later. Trends in flight, inquiries early, but any keep-or-stop decision waits for the closed account.

</InfoBox>

## FAQ

### Why does marketplace ad data need 16 days before judgment?

Buyers click ads and order days or weeks later; the platform credits those orders back to the ad during an attribution window of up to 16 days. Data inside the window is still moving.

### A paused campaign keeps getting transactions — is that normal?

Yes. Buyers who clicked before the pause still convert inside the attribution window. That is delayed attribution, not a resurrection — include it when judging the pause decision.

### When can I read in-flight campaign data?

Trends anytime; conclusions only after settlement. Clicks and inquiries are same-day facts stable within days — transactions and ROI wait the full 16 days.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
