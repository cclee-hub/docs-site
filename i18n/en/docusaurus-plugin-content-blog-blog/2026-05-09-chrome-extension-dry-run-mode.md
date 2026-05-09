---
title: Chrome Extension Writing Test Data to Production? Add a DRY-RUN Switch
description: Prevent Chrome extensions from writing test data to production during development with a 3-layer DRY-RUN mode: env variable, HTTP header, and server-side interception.
date: 2026-05-09
tags: [Chrome Extension, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to prevent Chrome extension test data from going to production database?"
    a: "Use an env-controlled DRY-RUN mode: client sends X-Dry-Run header, server intercepts and returns preview data without writing."
  - q: "How to add custom HTTP headers conditionally in a Vite-based Chrome extension?"
    a: "Read import.meta.env in the background script, then conditionally add headers to fetch requests."
---

## TL;DR

Chrome extensions submitting collected data via API write directly to the production database — even during development and testing. A 3-layer DRY-RUN switch solves this: set an env variable in `.env.development` → client reads it and adds an `X-Dry-Run` header → server intercepts the header and returns a data preview without writing. Production never sets the variable, so it's completely unaffected.

---

## Problem

A Chrome extension collects e-commerce data and submits it via API. During development, every test run writes a record to the production database. After a few rounds of testing, the database is full of dirty data that corrupts production analytics.

There's no "preview only" switch — either comment out the submission code (easy to forget reverting) or accept dirty data in production.

---

## Root Cause

The Chrome extension shares the same API endpoint for both development and production. The `fetch` request has no marker to distinguish "this is a test submission" from "this is a real one." The backend processes all requests identically — write to the database.

What's needed: a "preview mode" that shows what data would be submitted without actually writing it.

---

## Solution

Three layers: environment variable → HTTP header → server-side interception.

### Step 1: Declare the env variable type

```typescript
// client/src/env.d.ts
interface ImportMetaEnv {
  // ... other variables
  readonly VITE_INQUIRY_DRY_RUN?: string;
}
```

### Step 2: Development environment config

```env
# client/.env.development (development only)
VITE_INQUIRY_DRY_RUN=true
```

```env
# client/.env.production (do NOT set this variable)
# Production always uses real writes
```

### Step 3: Client reads env, conditionally adds header

In the Service Worker (background script):

```typescript
// background.ts
chrome.storage.local.get('sessionToken', (result) => {
  const sessionToken = result.sessionToken;
  if (!sessionToken) return;

  // Read DRY-RUN switch
  const dryRun = import.meta.env.VITE_INQUIRY_DRY_RUN === 'true';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`,
  };

  // Add marker header in DRY-RUN mode
  if (dryRun) {
    headers['X-Dry-Run'] = 'true';
  }

  fetch(`${baseURL}/inquiry/collect`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ memberId, rows }),
  });
});
```

WXT/Vite inlines `import.meta.env.VITE_INQUIRY_DRY_RUN` at build time. Dev build (`.env.development`) gets `"true"`, production build gets `undefined`, so `=== 'true'` naturally evaluates to `false`.

### Step 4: Server intercepts DRY-RUN requests

```typescript
// server/src/functions/analytics/inquiry.ts
router.post('/collect', async (req, res) => {
  // ... auth, memberId mapping, etc.

  const dryRun = req.headers['x-dry-run'] === 'true';

  if (dryRun) {
    // Skip database write, return preview
    return res.json({
      code: 200,
      message: 'dry-run ok',
      data: {
        dryRun: true,
        shop_id: match.shop_id,
        platform_id: match.platform_id,
        memberId,
        rowCount: rows.length,
        sampleRows: rows.slice(0, 3),
      },
      timestamp: Date.now(),
    });
  }

  // Normal flow: write to database
  const result = await analyticsClient.post('/internal/data/import/inquiry', payload);
  res.json({ code: 200, data: result });
});
```

In DRY-RUN mode, the server still runs auth and validation (ensuring data format is correct) — it only skips the final database write. This lets you verify both data format and permissions without producing dirty data.

---

## Important Notes

<InfoBox variant="warning" title="Never set DRY-RUN in production .env">
  `.env.production` should NOT set `VITE_INQUIRY_DRY_RUN`. In production builds, the variable is `undefined` and the condition naturally evaluates to `false`. Never enable this switch in production config.
</InfoBox>

<InfoBox variant="warning" title="Client must check the dryRun flag">
  DRY-RUN mode returns HTTP `200` with `{ dryRun: true, data: {...} }`. Client code that only checks `code === 200` will mistakenly treat it as a successful write. Always check `response.data.dryRun` to distinguish preview from actual submission.
</InfoBox>

<InfoBox variant="warning" title="DRY-RUN should still run auth and validation">
  Don't intercept DRY-RUN requests before authentication. Keep the full request chain (auth → validate → intercept) so you can verify request format and permissions — just skip the final write step.
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
