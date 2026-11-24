---
title: "What Is FlowTrack? Process Management for Small Factories"
description: "FlowTrack overview: routings, work orders and delivery warnings in one place. See each order's current process and days left, then fix lateness on the spot."
project: flowtrack
schema: Article
date: 2026-11-24
rag: true
rag_tags: ["FlowTrack", "process management", "production routing", "delivery tracking", "work order"]
---

# What Is FlowTrack?

## What is FlowTrack?

FlowTrack is a delivery-date keeper for make-to-order factories. It answers the three questions a shop asks every day: which process is this order on, how many days are left, and will it be late — the warning comes early enough to act, and the plan gets fixed on the spot.

The name is the job description: **flow** — your processes chained into a routing, each step with its own duration — and **track** — every work order followed through them step by step. Define the flow once; every job after that explains itself.

## What problem does FlowTrack solve?

In most small factories the progress ledger lives in three places: a spreadsheet for scheduling, a group chat asking "where is it?", and paper travelers on the shop floor. Once orders pile up, three things get hard: which process each order is on, how many days remain, and whether it will be late — and by the time lateness becomes visible, the room to fix it is mostly gone.

FlowTrack turns those three questions into things you can see and act on from the home screen:

- Work-order cards are grouped by whether they need you: delivery warnings / due today / on hold / on track — urgent ones first
- A warning card opens a decision page: why it's late, adjust the days with a live recalculation, change the promise date, or snooze
- Every order's current process is visible in real time, and operators report progress in two steps — no chasing updates in chat

## Who is FlowTrack for?

Shops that build to order and live by on-time delivery — custom or standard products both fit, and it works best when orders run through several processes. Four roles (Owner, Merchandiser, Operator, custom) split 7 permission points; new teammates see no data until a role is assigned — that is deliberate protection, not a bug.

The boundary is stated plainly: FlowTrack does not do inventory, costing, payroll or approvals, and it does not track piece counts. If the question is "will this order be late", it fits; if it is warehouse or payroll, it is not the tool.

## What does FlowTrack do?

<div className="grid md:grid-cols-2 gap-4 not-prose">
<FeatureCard title="Work-order board">
Search by order number, quick filters for all / expected late / delivery warning / due this week, grouped by what needs you first.
</FeatureCard>
<FeatureCard title="Delivery warning decision page">
Conclusion → why it's late → adjust days (live finish-date preview) → change promise date → snooze, one pass end to end.
</FeatureCard>
<FeatureCard title="Routing canvas">
Add, insert, run in parallel, remove processes; cycles are rejected on the spot. Set a duration per step and the routing totals itself.
</FeatureCard>
<FeatureCard title="Two-step reporting + scan">
Operators finish a report in two steps from My Tasks; scanning the traveler card lands on the exact process.
</FeatureCard>
<FeatureCard title="Per-order adjustments">
Every work order can edit its own process copy — the routing template stays untouched, and the finish date recalculates live.
</FeatureCard>
<FeatureCard title="Stats & daily digest">
Week / month / quarter / year overview cards; the daily digest matches the page word for word, entries link to their orders.
</FeatureCard>
<FeatureCard title="Custom configuration">
Business terms, order numbering rules (prefix / date granularity / separator / running digits), delay reasons and defect reasons all follow your shop's vocabulary.
</FeatureCard>
<FeatureCard title="Extras">
Printable traveler cards, order duplication, save as routing, equipment conflict alerts (optional), quality records (pass / fail + defect reason).
</FeatureCard>
</div>

The routing is the backbone of the whole system: build it once, and every work order after that picks it up with durations carried over.

<img src="/images/docs/flowtrack/08-route-canvas-built.webp" width="560" loading="lazy" />

Creating a work order: pick the product, then the routing — the promise date comes out of start day plus total routing duration.

<img src="/images/docs/flowtrack/13-new-order-ready.webp" width="560" loading="lazy" />

The screenshots show the product's Chinese interface — the layout and icons match.

## Which platforms does FlowTrack support?

One business interface everywhere; only platform capabilities differ:

| Channel | Availability |
|---------|-------------|
| Web browser + email | Available |
| Microsoft Teams, Slack, Lark | Integration supported |
| Google Chat, Telegram | Integration supported |
| WhatsApp, LINE | Notification integration supported |

Deployment region is optional — data is stored in the region where the customer operates.

## Next: set up in three steps

About 10 minutes: **add processes → build a routing → assign team roles**, each step with screenshots to follow.

<a className="button button--primary button--lg" href="/docs/flowtrack-setup-guide">FlowTrack Setup Guide</a>
