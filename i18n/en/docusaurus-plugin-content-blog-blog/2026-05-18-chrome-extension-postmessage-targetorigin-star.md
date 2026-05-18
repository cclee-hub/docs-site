---
title: "Chrome Extension Messages Leaking? postMessage targetOrigin Wildcard Exposes Data to Third-Party Iframes"
description: "Using '*' as postMessage targetOrigin broadcasts data to all frames including third-party iframes — switch to window.location.origin to restrict the recipient"
date: 2026-05-18
tags: [Chrome Extension, postMessage, Security]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Is it safe to use postMessage in Chrome extensions for data transfer?"
    a: "Depends on targetOrigin. Using '*' is unsafe — any embedded iframe can listen. Use window.location.origin to restrict to same-origin frames only."
  - q: "What happens if I omit the second argument to postMessage?"
    a: "It defaults to '*', broadcasting the message to all frames including third-party iframes — a potential data leak."
---

Encountered this issue while developing a Chrome extension data collection tool for a client. Here's the root cause and solution.

## TL;DR

`window.postMessage(data, '*')` broadcasts the message to **all frames** in the page, including third-party iframes. If your Chrome extension passes user data (like memberId, business reports) via `postMessage`, any embedded iframe can intercept it. Change `'*'` to `window.location.origin` to restrict the recipient precisely.

## The Problem

A Chrome extension's injected script passes e-commerce data to its content script via `postMessage`:

```javascript
// ❌ Unsafe: message broadcasts to ALL frames
window.postMessage({
  type: 'CCL_SHOP_REPORT_DAILY',
  memberId: 'b2b-2214126315258ad300',  // user ID
  rows: [{ uv: 403, payAmt: 19478.47 }]  // business data
});
// Equivalent to window.postMessage(data, '*')
```

If the page embeds third-party iframes (ads, analytics, social widgets), their `message` event listeners **will also receive this message**.

## Root Cause

The second argument to `postMessage`, `targetOrigin`, determines the message's delivery scope:

| targetOrigin | Behavior |
|-------------|----------|
| `'*'` or omitted | Broadcasts to **all** frames, no origin check |
| `'https://example.com'` | Only delivers to frames with origin `https://example.com` |
| `window.location.origin` | Only delivers to frames **same-origin** as the current page |

When omitted, the browser defaults to `'*'`. This is especially dangerous in Chrome extension scenarios — injected scripts run on e-commerce platform pages that may contain multiple third-party iframes.

## Solution

### Wrap postMessage in a Safe Helper

```javascript
// safePostMessage: enforce window.location.origin
function safePostMessage(data) {
  window.postMessage(data, window.location.origin);
}

// Usage
safePostMessage({
  type: 'CCL_SHOP_REPORT_DAILY',
  subType: 'daily',
  memberId: memberId,
  rows: [row]
});
```

### Validate Origin on the Receiving End Too

```javascript
// Content script message listener
window.addEventListener('message', (event) => {
  // ✅ Verify origin
  if (event.origin !== window.location.origin) return;

  // ✅ Validate message structure
  if (!event.data || typeof event.data.type !== 'string') return;

  switch (event.data.type) {
    case 'CCL_SHOP_REPORT_DAILY':
      handleDailyReport(event.data);
      break;
    case 'CCL_ITEM_WEEKLY_REPORT':
      handleWeeklyReport(event.data);
      break;
  }
});
```

### When is '*' Acceptable?

Only when the message contains zero sensitive information and the recipient's origin is unpredictable — e.g., a pure UI state notification like "panel opened". Even then, `window.location.origin` is safer.

## Caveats

<InfoBox variant="warning" title="Caveats">

- Chrome extension MAIN world scripts and content scripts run in separate JavaScript isolation contexts — `postMessage` is their standard communication channel. Protect it carefully (if you encounter [duplicate message processing after hot reload](/blog/wxt-hmr-duplicate-message-listeners), you'll also need to manually clean up old listeners).
- Receiver-side `event.origin` validation and sender-side `targetOrigin` restriction are **both required**. One-sided protection is incomplete.
- If messages need to cross origins (e.g., from page to extension background), use `chrome.runtime.sendMessage` (see [Service Worker Token Sync](/blog/2026/05/09/chrome-extension-token-sync-service-worker)) instead of `postMessage`.

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
