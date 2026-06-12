---
title: "Chrome Extension chrome.alarms Fires at the Wrong Interval? MV3 Enforces a ~1 Minute Minimum"
description: "Setting periodInMinutes below 1 in Manifest V3 gets silently clamped to about 1 minute in production, breaking your schedule. setInterval is unreliable because the service worker sleeps — fix it with a 1-minute floor plus an immediate buffer-full trigger."
date: 2026-06-12
tags: [Chrome Extension, Manifest V3, Service Worker, chrome.alarms]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why doesn't my chrome.alarms period take effect and gets stretched to 1 minute?"
    a: "Chrome enforces a roughly 1-minute minimum on alarms, so periodInMinutes below 1 is clamped to 1. Dev mode (unpacked) may allow shorter periods, but production builds from the store are forced back to 1 minute."
  - q: "Can I use setInterval for scheduled tasks in an MV3 service worker?"
    a: "Not reliably. MV3 service workers are suspended by Chrome when idle, so setInterval stops with them. For persistent scheduling you must use chrome.alarms, or persist state to chrome.storage and catch up when the worker wakes."
---

An MV3 extension uses `chrome.alarms` with a 10-second period to flush logs, but in production it turns out to fire only once a minute — the schedule is silently wrong.

Encountered this while building the [ecommerce data collection tool](/docs/browser-plugin) for a client — the extension's background service worker needs to periodically batch-upload accumulated client logs to the server. A 10-second cadence was meant to keep things near-real-time, but in production the worst case was a full minute of latency.

## TL;DR

The MV3 service worker sleeps, so scheduled tasks **must use `chrome.alarms`** (`setInterval` is unreliable); and Chrome enforces a minimum period of about **1 minute** on `chrome.alarms` in production, silently clamping `periodInMinutes < 1` up to 1. The fix is to treat 1 minute as your floor and add a "flush immediately when the buffer fills" trigger to cover high-throughput periods.

## The Problem

The log relay is written to flush every 10 seconds:

```js
// background.js (MV3 service worker)
chrome.alarms.create('log-flush', { periodInMinutes: 0.16 }); // aiming for ~10s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'log-flush') {
    flushLogs();
  }
});
```

It seems fine locally (unpacked), but after packaging and publishing to the store, the listener **fires only once a minute** — `periodInMinutes: 0.16` is ignored by Chrome. No error, just a stretched schedule.

## Root Cause

Two constraints stack.

**First: `setInterval` doesn't work under MV3.** The Manifest V3 background is a service worker, which Chrome suspends after roughly 30 seconds of idleness to save power. When it suspends, `setInterval` stops, and on wake-up it doesn't run the missed ticks. So any task that must run "even when the page or extension is idle" **has to use `chrome.alarms`** — Chrome's native scheduler that can wake the service worker.

**Second: `chrome.alarms` has a minimum period.** For performance and battery, Chrome has long enforced a ~1-minute minimum on alarms: `periodInMinutes < 1` is clamped to 1. Dev mode (unpacked / Dev channel) is more permissive and runs shorter periods, so local tests pass; but once packaged into a release build, Chrome snaps it back to 1 minute. That's the root of "works locally, stretches in production."

Together: you **must** use `chrome.alarms`, and you **can't** rely on it firing faster than 1 minute.

## Solution

Since 1 minute is a hard floor, treat it as the worst-case backstop and add an event-driven immediate trigger for real-time needs — belt and suspenders:

```js
// 1. Backstop timer: once a minute, guarantees a flush even if the worker was suspended
const FLUSH_THRESHOLD = 50;
chrome.alarms.create('log-flush', { periodInMinutes: 1 }); // stop fighting < 1

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'log-flush') {
    flushLogs().catch(() => {});
  }
});

// 2. Immediate trigger: check on every log entering the buffer; flush when the threshold is reached
messageBus.on('log', (entry) => {
  pushBuffer([entry]);
  if (memBuffer.length >= FLUSH_THRESHOLD) {
    flushLogs().catch(() => {}); // high-throughput periods flush within seconds
  }
});
```

This combination absorbs both constraints:

- **The 1-minute floor** answers "does the timer still run after the worker suspends" — `chrome.alarms` wakes the worker on schedule, so worst-case latency is capped at 1 minute and logs never pile up indefinitely while the extension is idle;
- **The buffer-full trigger** answers "do we have to wait a full minute during bursts" — once the threshold accumulates within a short window, it flushes right away, bypassing the alarm. Low throughput leans on the alarm, high throughput leans on events, neither end stalls.

The migration cost is tiny: wherever you expected "every 10 seconds," switch to "buffer hits 50 entries OR 1 minute, whichever comes first." Batch-friendly workloads like logs are essentially free; for latency-sensitive single-item tasks, you should redesign them to be event-driven rather than polled.

<InfoBox variant="warning" title="Caveats">

- Don't use `setInterval` for critical MV3 service-worker scheduling — it stops when the worker suspends and doesn't catch up on wake, the sneakiest source of "intermittent missed tasks" in production. `chrome.alarms` is the only reliable persistent scheduler under MV3.
- Treat `periodInMinutes` as 1 minute in production. Dev mode's shorter periods will fool you — **always re-test the cadence with the packaged build in a real environment**, don't trust dev mode alone.
- If your feature genuinely needs "exactly every N seconds" precision (a precise countdown), alarms can't deliver — they're coarse-grained "no sooner than 1 minute" scheduling that Chrome may delay further. In that case, run the timer with `setInterval` inside an active page, and let the worker only backstop it.
- Another frequent service-worker trap is losing the logged-in state — see [Chrome Extension Service Worker can't read the login state? A cross-context token sync solution](/blog/2026/05/09/chrome-extension-token-sync-service-worker).

</InfoBox>

## FAQ

### Why doesn't my chrome.alarms period take effect and gets stretched to 1 minute?

For performance and battery, Chrome enforces a roughly 1-minute minimum on alarms, so a `periodInMinutes` below 1 is clamped to 1. Dev mode (unpacked) usually allows shorter periods, but the production build published to the store is snapped back to 1 minute — which is why it works locally but stretches online.

### Can I use setInterval for scheduled tasks in an MV3 service worker?

Not reliably. An MV3 service worker is suspended by Chrome after about 30 seconds of idleness, and `setInterval` stops with it, without running the missed ticks on wake. For persistent scheduling you must use `chrome.alarms` (which can wake the worker), or persist state to `chrome.storage` and catch up based on elapsed time when the worker wakes.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
