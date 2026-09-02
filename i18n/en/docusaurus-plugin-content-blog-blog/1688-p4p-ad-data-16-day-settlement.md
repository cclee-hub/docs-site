---
title: "Is 16 Days Enough for Marketplace Ad Data? We Re-Collected 5 Weeks to Find Out"
description: "We re-collected 5 settled weeks of ad data: edits until day 29, +11 late-keyword rows, detail deleted after ~6–7 weeks."
date: 2026-09-02
tags: [B2B, E-commerce, Analytics]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How long until marketplace ad data is final?"
    a: "The platform states a ~15-day attribution window, but the latest back-fill we observed landed on day 29. Wait 4–5 weeks before irreversible keep-or-stop calls."
  - q: "Can I back-fill ad history I forgot to export?"
    a: "Usually no. Detail reports survive roughly 6–7 weeks: at 40–47 days only 3 of 6 campaigns still returned data; past 54 days, none. After that it is gone."
  - q: "Why do new keyword rows appear after re-collection?"
    a: "The API returns history for your current keyword list. Keywords added late grow historical rows — entity-level back-fill: row counts rise, existing values never change."
---

## TL;DR

"Wait 16 days before judging" is not enough. We re-collected five long-settled weeks of B2B marketplace ad data and diffed every row: **finished weeks keep growing new data as late as day 29** (keywords added late reach back and pull their history in), yet past day 40, even a full re-collection changed **not one existing number**; and the harsher finding is retention — **the platform deletes detail reports after ~6–7 weeks, and past 54 days none of our 6 campaigns could be recovered**. Collect weekly, archive locally — what that buys is twofold: no more mis-calls on irreversible decisions, and ad history that actually belongs to you.

## The trigger: 27 new rows on day 29

During a routine collection on August 10, one industrial-goods B2B storefront (anonymized) wrote 27 new region-detail rows into a week that had ended **29 days earlier** — five campaigns, a +22% row increase. By the folklore timeline, that week had "settled at 16 days" roughly two weeks prior.

Is 16 days platform fact or folklore? The test is ready-made: re-collect older weeks. If long-settled weeks grow new rows or rewrite old values, 16 days is nowhere near the end — and the same re-collection measures how long the platform keeps detail at all. On August 21 we re-pulled five older weeks, which became the experiment below.

The experiment itself came out of a data-semantics check while building [AI Operations](/docs/ai-analytics).

## The design: re-collect five "settled" weeks and diff

The method is plain: **baseline → re-collection → row-level diff.**

1. Pick 5 consecutive weeks (2026-06-08 ~ 07-06), already 40–74 days old — settled under any definition;
2. Export a baseline across 4 detail tables (overview / products / keywords / areas — 1,199 rows);
3. Trigger a full platform re-collection over an explicit date range, export again;
4. Diff row by row: additions, value changes, deletions. Re-checked on 2026-09-02; conclusions unchanged.

The result:

| Table | Baseline rows | After | Added | Value changes | Removed |
|-------|--------------|-------|-------|---------------|---------|
| Campaign overview | 18 | 18 | 0 | 0 | 0 |
| Product detail | 682 | 682 | 0 | 0 | 0 |
| Region detail | 405 | 405 | 0 | 0 | 0 |
| Keyword detail | 94 | 105 | **+11** | 0 | 0 |

The net result of the row-level diff across all 1,199 rows: **not a single historical number was revised** (zero value changes, zero removals). The only difference is 11 new keyword rows — not revised values but newly grown entities, a second back-fill mechanism covered in Finding 2; which campaigns' detail the platform re-returned at all is Finding 3.

![Lifecycle of 1688 P4P data: from routine writes to back-fill events to deletion](/images/blog/1688-p4p-data-timeline-en.png)

## Finding 1: values blow past 16 days — and truly settle by 40

The boundary of the claim: "16 days" is both right and wrong.

- **The platform's stated** attribution window is ~15 days — the folk "settle at 16" comes from there;
- **The trigger event** was exactly that counterexample: +27 region rows on day 29, nearly double the window;
- The experiment supplies the stopping point: re-collection at 40–47 days showed **zero value changes** — back-fill does stop, just much later than day 16.

For operators: 16 days works as a "probably stable" heuristic, not as a definition of final. For irreversible calls like pausing a campaign, wait the full 4–5 weeks so the decision lands past the measured stopping point. The full pre-pause checklist is in [Five checks before you pause a marketplace ad campaign](/blog/1688-campaign-stop-checklist).

## Finding 2: keywords you add later reach back and pull their history in

Plain version first: **how much "history" you can recover depends on which keywords you are running now.**

The test store added keywords to one campaign mid-flight. On re-collection, the platform returned the campaign's **current** keyword list together with **past** weekly performance — one recovered historical week carried 11,179 impressions, ¥342.7 spend, 10 inquiries, and 11 orders. Those numbers sat on the platform's side all along; they only appear when you come collect.

*(Technical note: the mechanism is entity-level back-fill — the API returns history for your **current** keyword list. Row counts rise; existing values never change. So when re-collected data grows, first tell revised values from newly grown rows: the former is a warning, the latter is a gift.)*

But the gift has a precondition: the platform must still retain the detail. For how long? That is Finding 3.

## Finding 3: the real cliff is deletion, not settlement

Slow back-fill costs waiting; retention costs everything. We checked, per campaign, whether the platform could still return detail during re-collection:

- Weeks aged **40–47 days**: from the same batch of six campaigns, only **3** still returned complete detail;
- Weeks aged **54–74 days**: the same six again — **0 of 6**; not stale, deleted from the platform's side, unrecoverable by any means;
- The 3 campaigns already returning nothing at 40 days run a shorter, per-campaign retention — they hit the cliff earlier; one sample so far.

![The retention cliff: 3/6 campaigns retrievable at 40–47 days, 0/6 after 54](/images/blog/1688-p4p-retention-cliff-en.png)

Put bluntly: **any detail not in your own database within ~6 weeks has been deleted on your behalf.** "I'll export it later" is not procrastination — it is deletion.

## What these findings are worth: two ledgers

**The mis-kill ledger.** The biggest cost of the 16-day folklore is reading "the data hasn't arrived" as "the campaign doesn't work". The keyword whose history grew back in Finding 2 carries 10 inquiries and 11 orders in a single week — pause a ramping campaign early, and that is the weekly loss, before counting the extra settlement weeks it needs to prove itself again. Waiting the full 4–5 weeks buys "no wrong irreversible calls".

**The loss ledger.** The platform deletes detail after ~6–7 weeks, so "I'll back-fill later" is a promise with an expiry date. Which regions fed you inquiries last quarter, which keywords' costs were quietly climbing — only people whose data landed in their own database can answer. A weekly collection run buys "history, always queryable".

## Three disciplines for operators

1. **Watch trends anytime; wait 4–5 weeks for irreversible calls.** 16 days is the reference line, 29 the safety line.
2. **Collect or export detail weekly and archive locally.** Platform-side detail is far shorter-lived than assumed; the archive is the asset you own.
3. **Close the "settlement tail" (the data each finished period is still quietly back-filling) before any retro analysis.** Period ROI without its back-fill is systematically understated — and when you cannot tell revised values from newly grown rows, use the experiment's move: diff at row level.

## For data engineers: leave at least 5 weeks of overlap

If your pipeline collects marketplace ad reports weekly (or models attribution for a similar platform): the stated 15-day window actually back-fills as late as **+29 days**. A strict weekly cadence with a 4-week overlap performs its last rewrite at week-end +22 days — which fails to cover the measured day-29 event (ours survived only because a collection gap happened to stretch). Raise the overlap from 4 weeks to 5: ~20–25% more requests each week — every extra overlap week is one more week of paginated detail to pull — in exchange for never losing rows.

<InfoBox variant="warning" title="Two weekly habits">

- **Collect**: land this week's detail in your own database, with a 5+ week overlap — archiving is the only defense against deletion;
- **Wait**: make keep-or-stop calls only on data settled 4–5 weeks — settlement is the only defense against misjudgment.

</InfoBox>

## FAQ

### How long until marketplace ad data is final?

The platform states a ~15-day attribution window, but the latest back-fill we observed landed on day 29. Wait 4–5 weeks before irreversible keep-or-stop calls.

### Can I back-fill ad history I forgot to export?

Usually no. Detail reports survive roughly 6–7 weeks: at 40–47 days only 3 of 6 campaigns still returned data; past 54 days, none. After that it is gone.

### Why do new keyword rows appear after re-collection?

The API returns history for your current keyword list. Keywords added late grow historical rows — entity-level back-fill: row counts rise, existing values never change.

That baseline → re-collection → row-level diff method is built into [AI Operations](/docs/ai-analytics) — LLM-powered analysis that automatically surfaces market trends, user behavior, and sales data to drive strategy. Ad data is the foundation of all of it — and a foundation deserves to be measured.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
