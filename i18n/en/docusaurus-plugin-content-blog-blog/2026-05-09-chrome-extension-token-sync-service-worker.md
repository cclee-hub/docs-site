---
title: Chrome Extension Service Worker Can't Read Login Token? Cross-Context Token Sync
description: Chrome extension sidepanel stores JWT in localStorage, but Service Worker has no localStorage. Sync tokens across contexts via chrome.runtime.sendMessage and chrome.storage.local.
date: 2026-05-09
tags: [Chrome Extension, Authentication]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does localStorage throw ReferenceError in Chrome extension Service Worker?"
    a: "Service Workers have no window or localStorage. Use chrome.storage API and messaging instead."
  - q: "How to share login token between sidepanel and background script in Chrome extension?"
    a: "After login, send token via chrome.runtime.sendMessage to the Service Worker, which stores it in chrome.storage.local."
  - q: "Can I use chrome.storage directly in the sidepanel?"
    a: "chrome.storage may be undefined in DevTools context. Use localStorage + message forwarding for reliability."
---

## TL;DR

Chrome extension uses a sidepanel as the UI. User logs in, token goes to `localStorage`. But the Service Worker (background script) has no `localStorage` — calling it throws `ReferenceError`. Fix: after login, send the token to the Service Worker via `chrome.runtime.sendMessage`, which writes it to `chrome.storage.local`. Sidepanel reads `localStorage`, Service Worker reads `chrome.storage.local`.

---

## Problem

User logs in successfully in the sidepanel. `localStorage` has `sessionToken`. But when the Service Worker (background script) tries to read the token for API requests:

```
ReferenceError: localStorage is not defined
    at getAuthToken (background.js:42)
    at submitCollectedData (background.js:87)
```

Login works fine in the sidepanel, but all authenticated requests from the Service Worker fail.

---

## Root Cause

Chrome extensions have multiple execution contexts, each with different APIs available:

| Context | window | localStorage | chrome.storage | chrome.runtime |
|---------|--------|-------------|---------------|----------------|
| Sidepanel / Popup | Yes | Yes | Maybe undefined | Yes |
| Content Script | Yes | Yes (isolated) | Yes | Yes |
| Service Worker | No | No | Yes | Yes |

Key constraints:
- **Service Worker** has no `window`, `document`, or `localStorage` — only `chrome.storage` API
- **Sidepanel** in DevTools context may have `chrome.storage` as `undefined`

Login stores the token in `localStorage` (sidepanel context). Service Worker tries to read from `localStorage` → `ReferenceError`.

---

## Solution

### Architecture

```
Sidepanel (login)
  ├→ localStorage.setItem(token)           ← sidepanel reads
  └→ chrome.runtime.sendMessage(syncToken)
       └→ Service Worker
            └→ chrome.storage.local.set(token)  ← Service Worker reads
```

Token lives in two places: `localStorage` (sidepanel reads) and `chrome.storage.local` (Service Worker reads). Login and logout keep both in sync via messaging.

### Step 1: Login function — dual write

After successful login, write to `localStorage` (sidepanel context), then sync to Service Worker:

```typescript
// auth.ts — after successful login
localStorage.setItem('sessionToken', token);
localStorage.setItem('userInfo', JSON.stringify(user));
localStorage.setItem('subscriptionInfo', JSON.stringify(subscription));

// Sync to chrome.storage.local (via Service Worker)
try {
  chrome.runtime.sendMessage({
    action: 'syncToken',
    token,
    user,
    subscription,
  });
} catch (e) {
  // Non-extension context (unit tests, regular web), ignore
}
```

The `try/catch` is necessary — `chrome.runtime.sendMessage` throws in non-extension contexts.

### Step 2: Service Worker — message handlers

In the background script, listen for messages and write token to `chrome.storage.local`:

```typescript
// background.ts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Sync token: sidepanel → chrome.storage.local
  if (request.action === 'syncToken') {
    const { token, user, subscription } = request;
    const data: Record<string, string> = {};
    if (token) data.sessionToken = token;
    if (user) data.userInfo = typeof user === 'string' ? user : JSON.stringify(user);
    if (subscription)
      data.subscriptionInfo =
        typeof subscription === 'string' ? subscription : JSON.stringify(subscription);

    chrome.storage.local.set(data, () => {
      console.log('[syncToken] token synced to chrome.storage.local');
      sendResponse({ success: true });
    });
    return true; // Required for async sendResponse
  }

  // Clear token on logout
  if (request.action === 'clearToken') {
    chrome.storage.local.remove(
      ['sessionToken', 'userInfo', 'subscriptionInfo'],
      () => {
        console.log('[clearToken] token cleared from chrome.storage.local');
        sendResponse({ success: true });
      }
    );
    return true;
  }
});
```

### Step 3: Service Worker reads token from chrome.storage.local

```typescript
// Before (throws in Service Worker):
const sessionToken = localStorage.getItem('sessionToken');

// After (correct approach):
chrome.storage.local.get('sessionToken', (result) => {
  const sessionToken = result.sessionToken;
  if (!sessionToken) {
    console.warn('No session token found');
    return;
  }
  // Make authenticated API request
  fetch('https://api.example.com/data', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
});
```

### Step 4: Logout clears both

```typescript
// auth.ts
function clearAuthData(): void {
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('subscriptionInfo');
  try {
    chrome.runtime.sendMessage({ action: 'clearToken' });
  } catch (e) {
    // Non-extension context, ignore
  }
}
```

---

## Important Notes

<InfoBox variant="warning" title="Both stores must stay in sync">
  Token lives in two places: `localStorage` (sidepanel reads) + `chrome.storage.local` (Service Worker reads). Login and logout must update both — otherwise states diverge.
</InfoBox>

<InfoBox variant="warning" title="return true in onMessage is mandatory for async">
  When using async `sendResponse` (e.g., inside `chrome.storage.local.set` callback), the `onMessage` listener must `return true`. Without it, the message channel closes immediately and `sendResponse` becomes a no-op.
</InfoBox>

<InfoBox variant="warning" title="Don't use chrome.storage directly in sidepanel">
  In DevTools context, `chrome.storage` may be `undefined`. Use `localStorage` + message forwarding as the reliable approach.
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
