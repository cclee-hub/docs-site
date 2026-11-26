---
title: "How Dates and Delivery Deadlines Are Calculated in FlowTrack"
description: "FlowTrack date rules explained with screenshots: how a work order deadline is auto-set from the routing, how each process gets its planned dates, what the red/yellow/green status lights mean, how upstream delays shift your dates, why reporting late completion requires a reason, where to fix a late order, and why one slow parallel process doesn't always make the whole order late."
project: flowtrack
schema: Article
date: 2026-11-26
rag: true
rag_tags: ["FlowTrack", "delivery deadline", "lead time", "scheduling", "due date", "delay reason", "estimated completion"]
---

# How Dates and Deadlines Are Calculated

## Three things to know first

1. All dates are **calendar days** — weekends and holidays count toward durations. There is no working-day subtraction.
2. "Today" follows the Asia/Shanghai clock.
3. Nothing is set in stone. Every completion report and every passing day re-estimates the dates downstream. Whatever you see on screen is always "where things land at the current pace".

## Where a new order's deadline comes from

Pick a routing on the new-order form and the deadline fills itself in: **start date + total routing duration = default deadline**. A 7-day routing started on Nov 26 gets a deadline of Dec 3. Change it right on the form if you need to — rush orders can pull the deadline closer, and the system will warn earlier.

<img src="/images/docs/flowtrack/20-01-new-order-due.webp" width="640" loading="lazy" />

Once the order is confirmed, the deadline is fixed. From then on the job is watching the **estimated completion** against it and stepping in when the two drift apart (see below).

## When each process runs: following the routing

Every process row shows dates the system derived from the routing's dependencies:

- **A process starts when its predecessors finish**: start date = predecessor's completion date; start + this process's duration = its planned end. The "ends MM/DD" on each row is that planned end.
- **Parallel processes** branching from the same predecessor **start on the same day**, run side by side, and the next step waits for all of them.

The order below is purely serial: cutting ends 11/27 → machining 11/29 → welding 11/30 → assembly 12/02 → inspection 12/03, one process handing off to the next, with the last one landing exactly on the deadline.

<img src="/images/docs/flowtrack/21-02-serial-detail.webp" width="640" loading="lazy" />

## Reading the status lights

The dot and status text on the left of each row tell you where that process stands:

- **Yellow · "N days left"**: the due date is near (reminders start 3 days ahead by default) and it's not reported done yet.
- **Red · "Not started · N days overdue"**: this process should already be finished but no completion has been reported. It's a nudge for this one process — **it does not mean the order will be late** (that's what estimated completion is for).
- **Green · "Done"**: completion reported.

Each process's **due date** is the "finish by, or you hold up the next step" line: once all predecessors have actually finished, due date = their actual completion + this process's duration. While any predecessor is still open, the system doesn't set a due date for this process at all — there's nothing to hold it accountable for yet.

In the parallel-routing order below: cutting and polishing are done (green); machining's due date was 11/24 and it's still open on 11/26, so it shows red "Not started · 2 days overdue"; assembly is planned for 11/25 and waits quietly (grey) because its predecessors aren't all done. In the flow diagram, machining is outlined red as the current slowest path.

<img src="/images/docs/flowtrack/22-03-parallel-ontime-detail.webp" width="640" loading="lazy" />

One detail worth knowing: **a completed row never shows the overdue red text** — even if it finished past its due date (the reason was captured in the completion report; the account is settled there, not on the row). Rows always display the planned end date; open the process to see when it actually finished.

## When a predecessor is late, your dates shift

If a predecessor finishes late, the unstarted processes after it shift automatically, and the row says so plainly: **"planned MM/DD → due MM/DD (upstream delayed N days)"**. The delay is booked against the late predecessor, not against this process.

Below: assembly was planned to end 11/25, but machining actually finished on 11/26 — 2 days late — so assembly moves to a due date of 11/27, labeled "upstream delayed 2 days".

<img src="/images/docs/flowtrack/24-05-parallel-late-detail.webp" width="640" loading="lazy" />

## Why reporting completion asks for a reason

Tap "Done" and you first pick the completion date (today / yesterday / day before / pick a date). **If that date is past the process's due date, a delay reason is mandatory** — upstream delay, equipment occupied, material missing, rework, supplier delay, or "other" plus a short note. You can't skip it.

<img src="/images/docs/flowtrack/27-08-report-reason.webp" width="640" loading="lazy" />

The point isn't blame — it's the monthly statistics showing where late days actually come from. On-time completions need nothing and go through instantly.

## Will the whole order be late: the estimated completion

The system is always estimating "at this pace, when does everything land":

- finished processes count at their actual completion dates;
- anything in progress counts as finishing no earlier than today;
- unstarted processes are pushed through in routing order.

Compared against the deadline, that becomes the tag on every list card and table row: **"on time" / "N days early" / "estimated N days late"**.

The table below shows three parallel-routing orders in all three situations: 261126-03's machining finished 11/26 (due 11/24), pushing assembly 2 days and marking the order "estimated 2 days late"; 261126-02 and 261126-04 both show red overdue machining, yet both orders are still "on time" — the red light hurries one process, it doesn't condemn the order.

<img src="/images/docs/flowtrack/26-07-table-parallel.webp" width="640" loading="lazy" />

## Estimated late: fix it on the decision page

Open "Handle ›" on a list card (or the delivery warning in your notifications). The page gives you the verdict, the cause and three actions:

<img src="/images/docs/flowtrack/25-06-decision-late.webp" width="640" loading="lazy" />

**Why it's late**: the system names the processes actually dragging the order — who, by how many days, assigned to whom. In the example that's machining, 2 days late. Polishing also finished 2 days late, but it didn't hold up the order, so it isn't listed (why, next section).

The three actions:

1. **Adjust days**: add or remove days on a process. The live preview underneath tells you what that buys — "estimated 11/27 · still estimated 2 days late" means this alone won't save the deadline. Confirm and everything downstream shifts accordingly, with an option to notify the people assigned to the changed processes.
2. **Change deadline**: the customer agreed to a new date — move the deadline and "estimated N days late" disappears.
3. **Not now**: leave it; the card keeps showing "estimated N days late" in the list.

The footer is the operating rule: **see the impact before you confirm; confirming returns you to the list**.

## One process finished late — why the order is still on time

Parallel routings carry slack: two processes start together and the next step waits for the **slowest** one. The faster process can run a few days past its own due date without moving anything, as long as it stays within the slow one's time.

In this order, machining takes 3 days and polishing takes 1; assembly waits for machining. Polishing actually finished on 11/24 — 2 days past its 11/22 due date, reason reported — but machining runs to 11/24 anyway, so assembly still starts 11/24 and the order still lands on 11/25 against a deadline of 11/25: **on time**.

The decision page confirms it: a green "on time", deadline and estimate identical, **no causes section at all** — the system doesn't pin lateness on a process that didn't cause any.

<img src="/images/docs/flowtrack/23-04-decision-ontime.webp" width="640" loading="lazy" />

The flip side: when the late finisher *is* the slowest path, the order slips and its name shows up under "why it's late".

## Quick reference

| What you see | What it means |
| --- | --- |
| Start date + N days (total routing) = default deadline | Where a new order's deadline comes from; editable |
| Ends MM/DD | The process's planned end date |
| N days left (yellow) | Due date approaching, completion not yet reported (3-day heads-up by default) |
| Not started · N days overdue (red) | Due date passed with no completion reported — a nudge for this process, not a verdict on the order |
| Done (green) | Completion reported; the row shows the planned end date — open the process for the actual one |
| Upstream delayed N days | Pushed by a late predecessor; the account is on the predecessor |
| On time / N days early / Estimated N days late | Gap between the order's estimated completion and its deadline |
| Why it's late: process X, N days late | The processes dragging the order (decision page) |

## Related reading

- [Getting Started with FlowTrack](/docs/flowtrack-setup-guide): setting up routings, members and assignments.
- [What Is FlowTrack?](/docs/flowtrack): the product overview.
