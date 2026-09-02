---
title: "Five Checks Before You Kill an Underperforming B2B Ad Campaign"
description: "Five checks, five real cases — short windows, a ¥0 campaign, gap-restart, learning period, true zero inquiries."
date: 2026-09-02
tags: [B2B, E-commerce, Advertising]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How long should a B2B ad campaign run before judging it?"
    a: "At least one full settlement cycle, and the data must settle first (measured back-fill runs to day 29). One real solution read ¥36 in week two and ¥107 in week eight — concluding at either point is wrong."
  - q: "Which failure justifies stopping a campaign immediately?"
    a: "Accumulated spend clearly above a reasonable cost-per-inquiry with still zero inquiries. It applies at keyword level too — 78% of measured keyword-weeks produced nothing; that is the main battlefield."
  - q: "How do I judge a campaign after a delivery gap?"
    a: "The environment may have moved on: one measured 3-week gap was followed by store-wide inquiry cost jumping from ¥33 to ¥46. Restore continuity first, then reset the baseline to the new environment."
---

## TL;DR

Stopping campaigns is where marketplace ad budgets leak fastest: underperformers do deserve stopping, but "looks bad" and "is bad" are different things. Five checks — **runtime, spend, continuity, learning period, true zero-inquiry** — the first four all say "wait," only the last says "stop now." Each check here is grounded in a real case from one store's weekly ad ledger.

## The situation: half the "bad campaigns" on Monday's report were wronged

Monday review: a campaign spent real money last week with zero inquiries. Stop! Two weeks later a competitor's identical product takes off on a similar setup — and your own campaign, it turns out, ran barely a week with a delivery gap in the middle. It wasn't weak; it was never given the chance to prove anything. A wrong stop costs twice: the killed campaign's future inquiries, and a cold restart from zero. The cases below come from a campaign-verdict audit while building [AI Operations](/docs/ai-analytics).

### Check 1: Has it run long enough?

Below one full cycle, no conclusion is valid — and short windows cut **both ways**. One measured new solution read ¥36 per inquiry in week two (looks decent) and ¥107 in week eight (disaster): the "decent" verdict in week two and the "hopeless" verdict in week three share the same root cause — **the window was too short**. And the data itself needs another layer of patience: transaction attribution measurably back-fills as late as day 29 — see [Is 16 Days Enough for Marketplace Ad Data?](/blog/1688-p4p-ad-data-16-day-settlement).

### Check 2: Has it spent enough?

One campaign sat configured for six weeks with **¥0 accumulated spend** — a nameplate campaign that never earned the right to be evaluated. Thin-spend campaigns fail the same way: a few yuan a day cannot complete even one effective test within a week. If a thin campaign performs badly, the finding is usually "it spent too little," not "it performs badly." Fund it to testing volume first; judge after.

### Check 3: Is delivery continuous?

One measured 3-week gap (weekly spend ¥281 → ¥90 → ¥281) was followed by store-wide inquiry cost jumping from ¥33 to ¥46 on restart — **a restart is not a return to the old normal**; the environment and the competitive position may have moved. For discontinuous underperformers the first move is restoring continuity, not stopping; the full store-level post-mortem of that episode is in [A Real Store-Wide Efficiency Alert, From a 40-Week Ledger](/blog/1688-store-efficiency-alert).

### Check 4: Was the learning period honored — with limits?

Learning-period protection has a boundary. One new solution got a full 8-week window: inquiry cost went ¥26 → 36 → 65 → … → 107 — **not ramping, deteriorating**. The learning period protects campaigns that haven't had the chance to prove themselves, not ones steadily proving they don't work: honor the window, but 4+ consecutive weeks of worsening cost moves the campaign into stop-review. Waiting does not rebuild a traffic structure.

### Check 5: Is it *truly* zero-inquiry?

Past the first four, this is the one unambiguous stop: accumulated spend clearly above a reasonable cost per inquiry, still zero inquiries. And the main battlefield for this check is one level down — of 1,641 measured keyword-week records, 78% produced no inquiries while consuming 27% of spend; the identification and stop-loss method is in [78% of Keywords Never Produced an Inquiry](/blog/1688-inquiry-cost-weighted).

<InfoBox variant="warning" title="How to run the five checks">

Runtime short → wait; spend thin → fund and observe; discontinuous → restore continuity first; learning period → honor it, but 4 weeks of worsening enters stop-review; truly zero inquiries → stop now. Four say "wait," one says "stop."

</InfoBox>

## FAQ

### How long should a B2B ad campaign run before judging it?

At least one full settlement cycle, and the data must settle first (measured back-fill runs to day 29). One real solution read ¥36 in week two and ¥107 in week eight — concluding at either point is wrong.

### Which failure justifies stopping a campaign immediately?

Accumulated spend clearly above a reasonable cost-per-inquiry with still zero inquiries. It applies at keyword level too — 78% of measured keyword-weeks produced nothing; that is the main battlefield.

### How do I judge a campaign that runs on and off?

The environment may have moved on: one measured 3-week gap was followed by store-wide inquiry cost jumping from ¥33 to ¥46. Restore continuity first, then reset the baseline to the new environment.

The full weekly optimization flow (store health check, campaign verdicts, product keep-or-kill, new-candidate screening) lives in [The 1688 P4P Optimization Method](/docs/1688-ad-optimization-guide); the campaign-verdict logic is also built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
