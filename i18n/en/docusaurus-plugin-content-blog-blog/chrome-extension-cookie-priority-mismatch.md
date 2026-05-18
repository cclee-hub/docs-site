---
title: "Chrome Extension Collecting Empty Data? Same-Site Cookies with Different Formats Break ID Mapping"
description: "A Chrome extension reads user ID from cookies, but last_mid and unb have different formats — iteration order determines which one you get, breaking strict-match lookups"
date: 2026-05-18
tags: [Chrome Extension, JavaScript, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does my Chrome extension sometimes get the wrong user ID from cookies?"
    a: "Multiple cookies on the same domain may contain user IDs in different formats. The iteration order of the cookie array — not your intended priority — determines which one is matched first."
  - q: "How do I ensure the correct cookie is picked by priority?"
    a: "Put the priority list in the outer loop and the cookie array in the inner loop — iterate high-priority keys first, then search all cookies for each."
---

Encountered this issue while building an e-commerce data collection system for a client. Here's the root cause and solution.

## TL;DR

The 1688 platform sets two cookies (`last_mid` and `unb`) both containing user IDs, but in different formats (`b2b-xxx` vs plain digits). The database stores the `b2b-` prefix format. The original code iterated the cookie array in the outer loop, matching `unb` first — the strict equality check failed, and all collected data was written with zero values because it couldn't map to a shop.

**Fix**: Put the cookie key priority list in the outer loop and the cookie array in the inner loop, ensuring high-priority keys are checked first.

## Problem

After collecting daily shop reports from 1688, all dashboard metrics in the database were 0, while inquiry data had values:

```
shop_id | report_date | reveal_cnt | uv | pay_amt | effective_inq_users
       2 | 2026-05-13  |          0 |  0 |    0.00 |                  56
       2 | 2026-05-14  |          0 |  0 |    0.00 |                  41
```

Server log: `No shop found for memberId: 2214126315258`

But the database stored `platform_account_id` as `b2b-2214126315258ad300`.

## Root Cause

### Two cookies with different formats on the same domain

```
unb=2214126315258                          # plain digits
last_mid=b2b-2214126315258ad300            # b2b- prefix + suffix
```

The `shops.platform_account_id` column stores the `b2b-` prefix format. The code used strict equality:

```javascript
const match = mapping.find(m => m.platform_account_id === memberId);
// "2214126315258" !== "b2b-2214126315258ad300" → no match
```

### Iteration order trap

The original code had the cookie array in the outer loop and the key list in the inner loop:

```javascript
// ❌ Wrong: cookie array outer, key priority ineffective
var keys = ['last_mid', '__last_memberid__', 'unb'];
for (var i = 0; i < cookies.length; i++) {     // outer: cookies
    var pair = cookies[i].trim();
    for (var k = 0; k < keys.length; k++) {    // inner: keys
        if (pair.indexOf(keys[k] + '=') === 0) {
            return pair.substring(keys[k].length + 1);
        }
    }
}
```

`document.cookie` order is not guaranteed. If `unb` appears before `last_mid` in the array, it gets matched first — returning the plain-digit format and making `last_mid` priority useless.

## Solution

**Swap loop levels**: key priority list in the outer loop, cookie array in the inner loop:

```javascript
// ✅ Correct: key priority list in outer loop
var keys = ['last_mid', '__last_memberid__', 'unb'];
for (var k = 0; k < keys.length; k++) {         // outer: iterate keys by priority
    for (var i = 0; i < cookies.length; i++) {   // inner: search all cookies
        var pair = cookies[i].trim();
        if (pair.indexOf(keys[k] + '=') === 0) {
            return pair.substring(keys[k].length + 1);
        }
    }
}
```

The key list is iterated by priority in the outer loop, so `last_mid` is always checked first regardless of `document.cookie` order, guaranteeing the user ID format matches the database.

### Verification

```javascript
// Confirm both cookies exist in browser console
document.cookie.split(';')
  .filter(c => /last_mid|unb/.test(c.trim()))
  .map(c => c.trim())
// ['unb=2214126315258', 'last_mid=b2b-2214126315258ad300']
```

<InfoBox variant="warning" title="Note">

This issue doesn't affect `chrome.cookies.get()` in extension pages — it queries by name directly. But when parsing `document.cookie` strings, always pay attention to loop levels. Also, if your extension passes data via `postMessage`, watch out for the [targetOrigin wildcard security risk](/blog/2026/05/18/chrome-extension-postmessage-targetorigin-star); and if [messages are processed twice after hot reload](/blog/wxt-hmr-duplicate-message-listeners), you'll need to manually manage listener lifecycle.

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
