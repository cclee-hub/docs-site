---
id: 1688-ad-optimization-guide
slug: 1688-ad-optimization-guide
title: "1688 P4P Ads Optimization Methodology — AI Operations"
description: "A complete weekly optimization method for 1688 P4P ads: store-level efficiency check, campaign keep-or-stop decisions, product tags, and data discipline."
project: ai-operations
schema: HowTo
steps:
  - name: Store-level check
    text: Set your normal-deviation baseline from six months of history and watch for consecutive dips
  - name: Campaign decisions
    text: Run five checks on underperforming campaigns before stopping any of them
  - name: Product keep-or-stop
    text: Tag money-burning products with six issue labels and act on what they say
  - name: Restart evaluation
    text: Evaluate paused campaigns against four scenarios; never judge before data settles
  - name: Refill the pipeline
    text: Screen organically selling products through three gates before promoting them
rag: true
rag_tags: ["1688", "P4P", "ads optimization", "data analysis"]
---

P4P ads optimization on 1688 is not about any single trick — it is about running a **repeatable weekly routine** across three levels: the whole store, each campaign, and each product. This guide lines them up: what to look at, in what order, and what decision each situation calls for.

## Quick Start

Fix a weekly review slot and walk through in this order:

1. **Store first**: is overall efficiency sliding along its own historical worst band? (Top-down, never the reverse.)
2. **Then campaigns**: underperformers get five checks before any stop decision.
3. **Then products**: money-burning products get six issue tags to decide keep, fix, or remove.
4. **Finally, add**: screen organically selling products as promotion candidates.

One data rule governs everything: **inquiry data is ready early; transaction data must settle.** A re-collection experiment measured transaction recording running as late as day 29 after week end — see [Is 16 Days Enough for Marketplace Ad Data?](/blog/1688-p4p-ad-data-16-day-settlement).

## Walkthrough

### Task 1: Store-level efficiency check

Rank the past ~26 weeks of store-wide ads ROI. The worst band (roughly the bottom fifth) is your "normal deviation" range. Several consecutive weeks dipping into it, with spend-per-revenue also worsening, means a store-level alert: look for the common cause before touching individual campaigns. New accounts with less than half a year of data should accumulate history first.

### Task 2: Campaign keep-or-stop

Before stopping an underperforming campaign, run five checks: enough runtime? enough spend? continuous delivery? learning period granted? and is it truly zero-inquiry? The first four failures all mean "wait"; only accumulated spend with persistent zero inquiries means "stop now". See the full checklist on our blog.

Stop-and-go campaigns do not enter efficiency judgment at all — restore continuous delivery and collect comparable data first.

### Task 3: Product keep-or-stop

Tag unproductive products with six issue labels: consecutive GMV decline, cost up with GMV down, zero add-to-cart, high bounce, bottom-tier impressions within the campaign, and dual-low conversion. One label means observe and fix; two or more stacked means a removal candidate.

Two special cases: **store staples** (top contributors to shop revenue) get downgraded to observation instead of immediate removal — the cost of a false positive is far higher. **Already-paused products** need a restart evaluation against four scenarios; unprofitable before pausing means stay paused.

### Task 4: Refill the pipeline

Screen never-promoted products that already sell organically through three gates: enough distinct buyers, meaningful GMV, and a conversion rate no worse than your store's promoted-product median. All three pass, promote; any miss, wait. For products running in multiple campaigns, compare acquisition cost across campaigns every cycle and shift budget toward the winner.

## Notes

<InfoBox variant="warning" title="Three data disciplines">

① Judge only on settled, complete periods; ② do not refresh baselines or make removal decisions during abnormal periods (promotions, holidays); ③ every "normal level" comes from your own store's history, never industry averages.

</InfoBox>

## FAQ

### How long does the weekly review take?

Under an hour once familiar: a few minutes on the store level, campaigns only where something changed, tags only on new anomalies. Most weeks nothing needs doing — the routine exists so nothing escapes notice.

### How do inquiry data and transaction data divide work?

Traffic capability is judged on inquiries (clicks, inquiries — stable within days). Money capability is judged on settled transactions and ROI. Mixing the two speeds is the main source of misjudgment.

### Can this be automated?

The judgment rules can run automatically — our AI analytics produces weekly reports following exactly this logic — but stop and budget decisions deserve human confirmation. Automated diagnosis, human decisions: the stable division of labor.
