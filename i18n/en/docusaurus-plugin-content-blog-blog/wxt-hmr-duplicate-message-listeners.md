---
title: "Chrome Extension Processing Messages Twice After Hot Reload? WXT HMR Stacks Listeners"
description: "WXT hot reload re-executes content scripts but doesn't remove old window.addEventListener listeners, causing each postMessage to be processed by multiple instances"
date: 2026-05-18
tags: [Chrome Extension, WXT, Vite, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why are postMessages processed twice after Chrome extension hot reload?"
    a: "WXT HMR re-executes the content script but doesn't destroy the old window.addEventListener. Each reload adds another listener — messages trigger all of them."
  - q: "Why doesn't removeEventListener work?"
    a: "You must pass the exact same function reference. Store the listener on window, retrieve the old reference on reload, then remove it before registering the new one."
---

Encountered this issue while building an e-commerce data collection Chrome extension for a client. Here's the root cause and solution.

## TL;DR

WXT framework's HMR re-executes content scripts on file changes but doesn't clean up old `window.addEventListener('message', ...)` handlers. Each hot reload adds another listener — every `postMessage` fires all instances.

**Fix**: Before registering a new listener, retrieve the old one from a `window` variable and call `removeEventListener`.

## Problem

Browser console showed each message caught by two different instances:

```
content.js:114 [CCL] CCL_SHOP_REPORT_DAILY daily caught - instance: nxctn6
content.js:2   [CCL] CCL_SHOP_REPORT_DAILY daily caught - instance: t6jce7
```

Every `postMessage` processed twice, causing duplicate requests to the backend.

## Root Cause

WXT (a Vite-based Chrome extension framework) in dev mode triggers HMR on content script changes:

1. The new content script module loads and executes
2. A new `window.addEventListener('message', messageListener)` is registered
3. **The old listener function remains in memory** — HMR doesn't clean up DOM event listeners

Result: multiple independent message listeners on `window`, each `postMessage` triggering all of them.

## Solution

At the content script entry point, remove the old listener before registering the new one:

```typescript
const instanceId = Math.random().toString(36).slice(2, 8);

// Retrieve old listener reference
const prevListener = (window as any).__cclMessageListener;
if (prevListener) {
  window.removeEventListener('message', prevListener);
}

// Define new listener
const messageListener = (event: MessageEvent) => {
  // ... handling logic
};

// Store current reference (for next HMR cycle)
(window as any).__cclMessageListener = messageListener;

// Register
window.addEventListener('message', messageListener);
```

**Key insight**: `removeEventListener` requires the exact same function reference as `addEventListener`. By storing the function on `window`, the next HMR cycle can retrieve and remove the old one correctly. This ensures only one active message listener exists at any time, regardless of how many hot reloads occur.

If you're also seeing [postMessage data leaking to third-party iframes](/blog/2026/05/18/chrome-extension-postmessage-targetorigin-star) or [empty collected data due to cookie format mismatch](/blog/chrome-extension-cookie-priority-mismatch), check those issues too.

<InfoBox variant="warning" title="Note">

- This issue isn't limited to WXT — any framework that hot-reloads content scripts (Plasmo, CRXJS, etc.) can encounter it
- `window` variables persist until page refresh; HMR only replaces script modules, not `window` properties
- Production builds don't have this issue (content script loads once), but it causes hard-to-debug duplicate requests during development

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
