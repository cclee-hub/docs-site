---
title: "FlowTrack Setup: Process Management, Routings & Team Roles"
description: "FlowTrack setup guide: add processes, chain them into a routing with durations, assign team roles — three steps to better process management for your shop."
project: flowtrack
schema: HowTo
steps:
  - name: Add processes
    text: Add each real machining step under Settings → Processes to build your base checklist
  - name: Build a routing
    text: Create a routing, chain processes in order on the canvas, set a duration per step, and save
  - name: Assign roles
    text: Under Members & Permissions, assign pending teammates as Merchandiser or Operator
rag: true
rag_tags: ["FlowTrack", "process management", "production routing", "team roles", "manufacturing"]
---

# FlowTrack Setup Guide

Before production starts, set up three things: **add processes → build a routing → assign team roles**. Everything runs in the browser, on desktop or phone, in about 10 minutes.

The screenshots below show the product's Chinese interface — follow the step text; the layout and icons match.

## Which channels does FlowTrack support?

| Channel | Availability |
|---------|-------------|
| Web browser + email | Available |
| Microsoft Teams, Slack, Lark | Integration supported |
| Google Chat, Telegram | Integration supported |
| WhatsApp, LINE | Notification integration supported |

Deployment region is optional — data is stored in the region where the customer operates. This guide uses the web browser.

## Quick start

1. Open FlowTrack and go to **Me → Settings**
2. Under **Processes**, add each step in your workshop (example: cutting, machining, welding, assembly, inspection — 5 processes)
3. Under **Routings**, create a routing, chain the processes in order, and set a duration for each
4. Under **Members & Permissions**, assign a role to every teammate
5. Back on the home page, create your first work order — pick a product and a routing, and start tracking

Each step with screenshots below.

## How to add processes

1. Go to **Me → Settings**. Setup lives here — numbering rules, terms, processes, routings, members. Before production you only need three items: **Processes**, **Routings**, **Members & Permissions**.

<img src="/images/docs/flowtrack/01-settings-home.webp" width="480" loading="lazy" />

2. Open **Processes**. It starts empty — tap **＋ Add process**.

<img src="/images/docs/flowtrack/02-processes-empty.webp" width="480" loading="lazy" />

3. Type the process name the way your workshop calls it (example: "Machining") and confirm.

<img src="/images/docs/flowtrack/03-process-add-filled.webp" width="480" loading="lazy" />

4. Add the rest one by one. Order in this list doesn't matter — sequencing happens in the routing. The example shop has 5: cutting, machining, welding, assembly, inspection.

<img src="/images/docs/flowtrack/04-processes-list.webp" width="480" loading="lazy" />

## How to build a routing

A routing is the fixed path a product follows from start to finish: which processes, in what order, and how many days each takes. Build it once, and every work order reuses it.

1. **Settings → Routings → New** opens the routing canvas.

<img src="/images/docs/flowtrack/05-routes-empty.webp" width="480" loading="lazy" />

2. Tap **Add first process**.

<img src="/images/docs/flowtrack/06-route-canvas-empty.webp" width="480" loading="lazy" />

3. Pick the opening process from your process list — example: cutting.

<img src="/images/docs/flowtrack/07-route-pick-process.webp" width="480" loading="lazy" />

4. With a node selected, tap **＋** to append the next process and keep chaining. Select each process and set its duration in days on the panel below. The example routing has 5 processes totalling 7 days — FlowTrack adds them up automatically.

<img src="/images/docs/flowtrack/08-route-canvas-built.webp" width="480" loading="lazy" />

5. Name the routing (example: "Standard machining route") and tap save.

<img src="/images/docs/flowtrack/09-routes-list.webp" width="480" loading="lazy" />

## How to assign team roles

Teammates appear under Members & Permissions once they sign in, but until you assign a role they stay marked **Pending** — and pending members see no data at all. That is deliberate permission protection.

1. **Settings → Members & Permissions** shows who can do what at a glance.

<img src="/images/docs/flowtrack/10-members-overview.webp" width="480" loading="lazy" />

2. Tap the **Pending** chip to filter for teammates without a role.

<img src="/images/docs/flowtrack/11-members-pending.webp" width="480" loading="lazy" />

3. Pick a role from the dropdown next to the name: **Merchandiser** creates and follows orders; **Operator** does the work and reports progress. It takes effect immediately — no re-login needed.

<img src="/images/docs/flowtrack/12-members-assigned.webp" width="480" loading="lazy" />

## Next: create your first work order

Setup is done. Back on the home page, tap **＋ New work order** — once a product is selected, your routing is ready to choose and its durations carry over automatically.

<img src="/images/docs/flowtrack/13-new-order-ready.webp" width="480" loading="lazy" />

## Things to know

- A process referenced by any routing **cannot be deleted, only deactivated**. History stays intact; it just disappears from new work orders. Processes with zero references can be deleted outright.
- Before renaming a process, the system tells you how many routings reference it; the routings update automatically after the rename.
- Numbering rules (by year / by year-month, with or without a separator) control the running number of new work orders; changing them only affects future orders.
- Finished and cancelled work orders are read-only for everyone.

## FAQ

### What is production routing?

The fixed path a product follows through your shop: the sequence of processes and the days each takes. Example: cutting (1 day) → machining (2) → welding (1) → assembly (2) → inspection (1) — 5 processes, 7 days total. In FlowTrack you build a routing once and reuse it on every work order. Conclusion: if you make the same product repeatedly, one routing covers it.

### What is routing in production management?

It is the backbone that turns an order into day-by-day work: pick a routing on a work order, and every process and deadline follows from it. Each routing step in FlowTrack carries a duration in days, and the 5-step example route totals 7 days automatically. Conclusion: without a routing, progress tracking has no baseline.

### Why can't my teammates see any data?

New teammates stay **Pending** until you assign a role — FlowTrack has 4 roles (Owner, Merchandiser, Operator, Pending), and Pending deliberately sees nothing. Go to **Settings → Members & Permissions**, tap Pending, and pick a role from the dropdown; it takes effect immediately, no re-login. Conclusion: assigning a role fixes it.

### Can I delete a process?

If no routing references it, yes — delete outright. Once a routing references it, deletion is blocked and the system reports the reference count and offers deactivation instead; deactivated processes keep history intact and only vanish from new picks. Conclusion: referenced means deactivate, unreferenced means delete.
