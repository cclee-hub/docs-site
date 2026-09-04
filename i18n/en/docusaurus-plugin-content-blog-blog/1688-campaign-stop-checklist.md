---
title: "When Should You Stop a 1688 Ad Campaign? Run Five Checks First"
description: "Five checks from production code before you stop a B2B ad campaign — four say wait, one says stop."
date: 2026-09-04
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How long should a B2B ad campaign run before judging it?"
    a: "Judgment only reads settled weeks: +16 days after a calendar week ends, and measured back-fill has arrived as late as day 29. The first settled week is judgeable, but sample-poor weeks are protected, not judged."
  - q: "Which failure justifies stopping a campaign immediately?"
    a: "Accumulated spend past 3x the target cost-per-acquisition with zero total inquiries — the hard-stop tier in the judging code. A closed-but-unsettled week spending several times above its normal level with zero inquiries stops without waiting for settlement either."
  - q: "How do I judge a campaign after a delivery gap?"
    a: "The code gives interrupted campaigns two paths only: stop if cost runs over 25% above benchmark (the model keeps re-learning), or restore continuity first. One measured 3-week gap pushed store-wide inquiry cost from ¥33 to ¥46."
---

## TL;DR

Stopping campaigns is where marketplace ad budgets leak fastest: waiting one extra week on a keeper costs little, while keeping a real underperformer one week costs real money. Five checks — **runtime, spend, continuity, learning period, true zero-inquiry** — are not folklore. They are five rules that actually run inside a production judging codebase, each with an explicit numeric threshold. Four say "wait," one says "stop now." Every case below comes from one store's 40-week ad ledger.

## The situation: half the "bad campaigns" on Monday's report were wronged

Monday review: a campaign spent real money last week with zero inquiries, and your hand is already on the pause button. Hold it — in one industrial-supplies store's 40-week ledger (anonymized), most campaigns that "looked bad" were simply not done proving themselves: some hadn't run a full cycle, some had spent nothing at all, some had a delivery gap in the middle. A wrong stop costs twice: the killed campaign's future inquiries, and the money a real underperformer keeps burning while you hesitate. The cases below come from a campaign-verdict audit while building [AI Operations](/docs/ai-analytics).

## Why: four checks say wait, one says stop

### Check 1: Has it run long enough? — only settled data counts

Rule first: the judgment consumes settled weeks only — a calendar week clears the settlement line 16 days after it ends, and nothing unsettled enters a verdict. And measurement shows 16 days is a floor, not the tail: one collection run wrote 27 new region rows into a week that had ended 29 days earlier — see [Is 16 Days Enough for Marketplace Ad Data?](/blog/1688-p4p-ad-data-16-day-settlement).

In plain terms: take the new program below — across its 8 weeks, weekly cost per inquiry swung from ¥46 to ¥99, nearly 2.2x. Judge it on unsettled data, or on any single week, and the verdict is wrong either way.

*(Technical note: inquiry attribution back-fills over time; the settlement line exists precisely to fence off "draft" data. A day-29 back-fill means the fence needs a watching period behind it, not just the line.)*

### Check 2: Has it spent enough? — thin spend is not judged

Rule first: the rules turn "hasn't spent enough" into a hard gate — campaigns whose weekly average spend sits below the level of a meaningful test are filed as "test" and receive no performance verdict; a first settled week with too thin a sample of inquiries and leads is protected, not judged.

In plain terms: one "precision targeting" campaign appeared in the ledger twice — April and July — for 6 weekly rows and a lifetime spend of **¥0**. It held a name on the report without spending a cent, never earning the right to be judged. Another veteran campaign fell to ¥90 a week in June — under a tenth of its peak. At that scale the rules file it under "test" too; the word "stop" never comes up. When thin spend looks bad, the finding is "spent too little," not "performs badly."

*(Technical note: a ¥0 weekly row means the campaign never passed the platform's delivery checks or is budget-throttled; a thin-spend sample is all noise, and noise drowns every ratio computed on it — the gate exists to block exactly that false signal.)*

### Check 3: Is delivery continuous? — interrupted campaigns get two paths

Rule first: an interrupted campaign gets two paths only — if effective cost-per-acquisition runs more than 25% above benchmark, stop, with the reason stated as "the bidding model keeps re-learning"; below the threshold, the file is marked "optimize" and the only action is: restore continuity.

In plain terms: one measured 3-week gap dropped store-wide weekly spend from the ¥1,900 range to ¥281 → ¥90 → ¥281, with inquiries hitting zero in the middle. Once continuous delivery resumed, store-wide cost per inquiry jumped from ¥33 before the gap to ¥46 in the restart week — **restarting after a gap is not starting from where you left off**, which is exactly why the rule restores continuity before judging.

*(Technical note: the traffic mix before and after a gap can differ, so grading the restart against the pre-gap baseline runs systematically optimistic; "keeps re-learning" refers to the bidding model falling back to cold start after every interruption.)*

### Check 4: Was the learning period honored? — protection lasts one extra week at most

Rule first: the learning-period protection here is **not a fixed number of weeks**. It fires only when the first settled week is sample-poor, and it grants at most one more week; from the second settled week on, there is no protection at all. From there, every week is measured by the same ruler: effective CPA above benchmark by more than 25%, combined with a low inquiry share — or no improvement over a stretch of weeks — means the stop tier; larger gaps with seriously excessive cost are judged even faster.

In plain terms: the same store's new program — the "Merchant growth" plan — got a full 8-week window from its human operators: weekly cost per inquiry ran ¥46–99, **not one week back inside the store's own normal band of ¥25–31**, and the last week was the most expensive (¥99). Over the same 8 weeks, two other new programs in the same store, aimed at the same products, bought inquiries at ¥30 and ¥35 — so neither "the market got expensive" nor "it hadn't started yet" holds. The 8 weeks of patience came from people, not from the rules: under the judging logic, from the second settled week on, this program had no protection and should have been measured every single week.

![Eight weeks of learning period, not one week back in the band](/images/blog/1688-campaign-stop-checklist-en.png)

*(Technical note: effective CPA = spend ÷ (quality inquiries + plain inquiries + a heavily discounted count of raw leads) — raw leads are worth little, they cannot prop up the denominator, and piles of junk leads cannot buy a cheap cost. Cumulatively the program read ¥17,541 ÷ 280 inquiries = ¥62.6, 2.2x the store's historical median of ¥28.)*

### Check 5: Is it truly zero-inquiry? — the only stop-now tier

Rule first: accumulated spend above 3× the target cost-per-acquisition with zero total inquiries is a hard stop; when no target is configured, the threshold degrades to a multiple of the campaign's own weekly average spend. One tier fires even earlier: a closed-but-unsettled calendar week spending several times above its normal level with zero inquiries is an early hard stop — it does not wait for settlement. And the target cost is never hand-set — it is the median across a rolling window of computable recent weeks, updated automatically.

In plain terms: this is the one check you never hesitate on. Its real battlefield is the keyword layer: across 46 weeks, 78% of the same store's 1,641 keyword-week records produced no inquiry while absorbing 27% of keyword spend — see [78% of Keywords Never Brought an Inquiry](/blog/1688-inquiry-cost-weighted).

*(Technical note: the early stop dares to skip settlement because spend is real-time billing — fixed once written, zero drift measured on settled weeks — while inquiries are a conversion field that back-fills from zero; the pair of conditions, a high bar and a closed week, is what bounds the false-kill risk.)*

## The experiment and the data

- **Sample**: one industrial B2B store (anonymized), campaign-by-week ad ledger from Nov 2025 to Aug 2026 — 40 weeks; the keyword layer covers 46 weeks and 1,641 keyword-week records of the same store.
- **Calibers**: inquiry cost = weekly spend ÷ weekly inquiries (store level uses the same form; cumulative uses total spend ÷ total inquiries). The "normal band" is the store's own pre-program median weekly cost — ¥28 across 28 normal weeks (spring-festival week excluded) ±10%, i.e. ¥25–31.
- **Judging code**: every rule and threshold cited here was verified against the production judge (covering the thin-spend gate, the interrupted-delivery branch, the learning-period sample gate, and the two-tier stop plus hard stop); file- and function-level provenance is an internal record and stays out of the article.
- **Settlement tail**: all weekly figures cited here are past the settlement window; the back-fill evidence is the day-29 event in Check 1.
- **Anonymization**: no store or campaign IDs appear; campaigns are referred to by their public platform program names.

## What it's worth: two accounts

**The account of stopping late.** Those same 8 weeks of the "Merchant growth" program: ¥17,541 spent for 280 inquiries. At the store's own median of ¥28 across 28 normal weeks, the same 280 inquiries should have cost about ¥7,900 — **8 weeks of overpaying, roughly ¥9,600**. Under the rules, protection lapsed at the second settled week and the program should have been measured weekly — every extra week of human patience was real money.

**The account of not stopping.** The 78% zero-inquiry keyword records carried **¥8,962** of real spend — 27% of the store's ¥33,417 keyword budget — without producing a single inquiry. Cutting them touches no campaign structure, and the money returns the same week.

## For operators

1. **Runtime**: judge on settled weeks only (+16 days after week end); when single weeks swing hard, only cumulative numbers count.
2. **Spend**: below the level of a meaningful weekly test, fund it before judging it; a ¥0 weekly row is a delivery question, not a performance question.
3. **Continuity**: restore continuous delivery before judging; after a gap, reset the baseline — never grade the restart against gap weeks.
4. **Learning period**: protection belongs to sample-poor weeks, one extra week at most; "give the new program time" stops being an argument at the second settled week.
5. **True zero-inquiry**: accumulated spend past 3x your target cost-per-acquisition with still zero inquiries — stop now, at campaign level and keyword level alike.

## For developers

1. **Persist both granularities**: campaign-by-week and keyword-by-week are separate tables — the keyword layer is where the stoppage money lives, and campaign-level views never see it.
2. **Keep collection audit fields**: re-collection rewrites historical weeks (measured: new rows arrived on day 29), so your pipeline must distinguish "what was visible then" from "settled data."
3. **Keep thresholds in one place**: gather every gate into a single configuration and keep the judging logic free of scattered magic numbers — tune thresholds without touching logic, and version every logic change.

<InfoBox variant="warning" title="How to use the five checks">

Data unsettled → wait; spend too thin → fund it first; delivery interrupted → restore it first; sample-poor week → one extra week at most; spend past 3x target cost with zero inquiries → stop now. Four "waits," one "stop."

</InfoBox>

## FAQ

### How long should a B2B ad campaign run before judging it?

Judgment only reads settled weeks: +16 days after a calendar week ends, and measured back-fill has arrived as late as day 29. The first settled week is judgeable, but sample-poor weeks are protected, not judged.

### Which failure justifies stopping a campaign immediately?

Accumulated spend past 3x the target cost-per-acquisition with zero total inquiries — the hard-stop tier in the judging code. A closed-but-unsettled week spending several times above its normal level with zero inquiries stops without waiting for settlement either.

### How do I judge a campaign after a delivery gap?

The code gives interrupted campaigns two paths only: stop if cost runs over 25% above benchmark (the model keeps re-learning), or restore continuity first. One measured 3-week gap pushed store-wide inquiry cost from ¥33 to ¥46.

All five checks are built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that reads market trends, buyer behavior, and sales data to ground your operating decisions in numbers. It waits when waiting is right, and flags the stop a week early.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
