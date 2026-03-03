---
title: Integrate Umami Analytics in Docusaurus
description: Step-by-step guide to integrate Umami privacy-friendly analytics in your Docusaurus site, including script configuration and CSP security policy setup.
date: 2026-03-03
tags: [Docusaurus, Umami, Analytics]
schema: Article
---

## TL;DR

Add the Umami script to the `scripts` array in `docusaurus.config.ts`, then update CSP `script-src` and `connect-src` to allow the Umami domain.

## The Problem

Google Analytics too heavy? Want to use Umami, a lightweight and privacy-friendly analytics tool, but not sure how to configure it in Docusaurus—especially when CSP (Content Security Policy) blocks the script.

## Root Cause

Docusaurus has a strict CSP by default that blocks external scripts. Umami needs to:
1. Load script from external domain
2. Send tracking data to external domain

Both operations are blocked by default CSP.

## Solution

### Step 1: Add Umami Script

Add `scripts` configuration in `docusaurus.config.ts`:

```typescript
const config: Config = {
  // ...other config

  scripts: [
    {
      src: 'https://umami.example.com/script.js',
      async: true,
      'data-website-id': 'your-website-id',
    },
  ],

  // ...
};
```

**Key points**:
- `async: true` for non-blocking load
- `data-website-id` from your Umami dashboard

### Step 2: Update CSP Policy

Update Content-Security-Policy in `themeConfig.metadata`:

```typescript
themeConfig: {
  metadata: [
    {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'self'; script-src 'self' 'unsafe-inline' https://umami.example.com; connect-src 'self' https://umami.example.com; ...",
    },
  ],
},
```

**Required additions**:
- `script-src` add Umami domain (allow script loading)
- `connect-src` add Umami domain (allow data sending)

### Step 3: Verify Integration

Open browser DevTools and check:
1. Network tab for `script.js` request
2. Console for CSP errors
3. Umami dashboard for incoming data

## FAQ

### Q: Umami script loads but no data?

A: Check if `connect-src` includes Umami domain. Umami uses `fetch` or `sendBeacon` which requires `connect-src` permission.

### Q: Why Umami over Google Analytics?

A: Umami is open-source, self-hosted, GDPR compliant, and only 2KB. GA4 script is over 50KB with data stored on Google servers.

### Q: Can I use environment variable for website-id?

A: Yes, use `process.env`. Note that `docusaurus.config.ts` runs at build time, not runtime:

```typescript
'data-website-id': process.env.UMAMI_WEBSITE_ID || 'default-id',
```
