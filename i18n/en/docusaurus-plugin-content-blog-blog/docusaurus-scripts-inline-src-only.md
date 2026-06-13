---
title: "Docusaurus scripts Build Fails with inline Script? Only src Is Accepted, Not content"
description: "Docusaurus's scripts config does not support inline content; you must reference a static file via src. This article explains the error, the static-file workaround, and the CSP update you need."
date: 2026-06-13
tags: [Docusaurus, Web Analytics, Frontend Engineering]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I configure custom scripts in Docusaurus?"
    a: "Add entries to the top-level scripts array in docusaurus.config.ts. Each entry is either a string (treated as src) or an object with a src property. Inline content cannot go in a content field—put the script under static/js/ and reference it via src."
  - q: "Why does Docusaurus scripts not support inline content?"
    a: "Docusaurus's scripts config only emits <script src=\"...\"> tags and has no field for inline scripts. The validator (validateScripts in configValidation.ts) checks each entry and throws 'A script must be a plain string, or an object with at least a src property' whenever src is missing."
  - q: "How do I inject inline JavaScript (like Baidu Tongji) in Docusaurus?"
    a: "Save the script to static/js/xxx.js and reference it from scripts with { src: '/js/xxx.js', async: true }; the script itself then dynamically creates a <script> tag to load the external JS. Remember to allow the target domain in your CSP script-src."
---

Dropping a `{ content: '...' }` entry into the `scripts` array of `docusaurus.config.ts` to inject an inline script (Baidu Tongji's IIFE, for example) fails `npm run build` immediately.

Encountered this while building [CCLEE Docusaurus Theme](/docs/cclee-docusaurus-theme) — an advanced docs theme built on Docusaurus 3.x, with a purple theme, dark mode, and Tailwind typography enhancements, a production-ready docs site template out of the box.

## TL;DR

Docusaurus's `scripts` config **only accepts `src`**, not inline `content`. Move the inline script into `static/js/` and reference it via `{ src: '/js/xxx.js', async: true }`. If the script loads an external domain, also update your CSP.

## Symptom

Following Baidu Tongji's official snippet, the instinct is to inline it straight into `scripts`:

```ts
// docusaurus.config.ts
const config: Config = {
  scripts: [
    {
      content: `var _hmt=_hmt||[];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?XXXX";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s);})();`,
    },
  ],
};
```

The build fails right away:

```
[ERROR] Error: "scripts[1]" is invalid.
A script must be a plain string (the src), or an object with at least a "src" property.
    at validateConfig (.../configValidation.js:397:15)
```

## Root Cause

The `scripts` config is validated at build time by [`validateScripts`](https://github.com/facebook/docusaurus/blob/main/packages/docusaurus/src/server/configValidation.ts), entry by entry. Only two shapes are allowed:

1. **A plain string**: treated as `src`
2. **An object**: must contain a `src` property; `async`, `defer`, `data-*` are optional

By design, `scripts` only emits tags of the form `<script src="..." />` and **reserves no `content` / `innerHTML` field for inline scripts**. So no matter how short your inline content is, validation throws as soon as `src` is missing. Local builds and Vercel remote builds fail identically.

> To inject an inline script that depends on build-time variables, use the top-level [`headTags`](https://docusaurus.io/docs/api/docusaurus-config#headTags) config (`tagName: 'script'` + `innerHTML`) instead of `scripts`.

## Solution

### 1. Put the inline script under `static/js/`

```js
// static/js/baidu-tongji.js
var _hmt = _hmt || [];
(function () {
  var hm = document.createElement('script');
  hm.src = 'https://hm.baidu.com/hm.js?XXXX';
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(hm, s);
})();
```

Files under `static/` are copied as-is to the site root, so the final URL is `/js/baidu-tongji.js`.

### 2. Reference it from `scripts` via `src`

```ts
// docusaurus.config.ts
scripts: [
  // Existing Umami setup (see /blog/docusaurus-umami-analytics)
  {
    src: 'https://tj.ccleeai.com/script.js',
    async: true,
    'data-website-id': 'xxxx',
  },
  // Baidu Tongji: via static file
  {
    src: '/js/baidu-tongji.js',
    async: true,
  },
],
```

### 3. Update CSP accordingly

If your site sets Content-Security-Policy (recommended — see our earlier [Umami integration and CSP walkthrough](/blog/docusaurus-umami-analytics)), every newly added external domain must be allowlisted or the script will be blocked by the browser:

```ts
themeConfig: {
  metadata: [
    {
      'http-equiv': 'Content-Security-Policy',
      // Add https://hm.baidu.com to script-src
      // Also allow it in connect-src and img-src (hm.js sends image pixels and fetch reports)
      content: "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://tj.ccleeai.com https://hm.baidu.com; " +
        "connect-src 'self' https://tj.ccleeai.com https://hm.baidu.com; " +
        "img-src 'self' data: https://hm.baidu.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "object-src 'none'; base-uri 'self'",
    },
  ],
},
```

Baidu Tongji's IIFE internally calls `document.createElement('script')` to inject `<script src="hm.baidu.com/...">`, so `'unsafe-inline'` alone is not enough — `hm.baidu.com` must be in `script-src`.

<InfoBox variant="warning" title="Notes">

- A plain string and `src` are equivalent in the `scripts` array: `'https://x/a.js'` and `{ src: 'https://x/a.js' }` behave the same
- A path starting with `/` is relative to the site root (the copy output of `static/`), not the filesystem root
- If the script depends on runtime variables and must be inline, use the top-level `headTags`, not `scripts`; `headTags` supports `innerHTML`
- Multiple analytics setups (Umami + Baidu + GA) can coexist, but each external domain must be added to the CSP individually or its reports will be silently blocked

</InfoBox>

## FAQ

### How do I configure custom scripts in Docusaurus?

Add entries to the top-level `scripts` array in `docusaurus.config.ts`. Each entry is either a string (treated as `src`) or an object with a `src` property. Inline content cannot go in a `content` field — put the script under `static/js/` and reference it via `src: '/js/xxx.js'`. If you also need `async`, `defer`, or custom `data-*` attributes, place them in the same object as `src`.

### Why does Docusaurus scripts not support inline content?

The `scripts` config emits `<script src="...">` tags at build time and has no field reserved for inline scripts. The validator (`validateScripts` in `configValidation.ts`) walks each entry and throws `A script must be a plain string, or an object with at least a "src" property` whenever `src` is missing, no matter how complete your `content` is. This is a deliberate API boundary — inline injection is delegated to `headTags`.

### How do I inject inline JavaScript (like Baidu Tongji) in Docusaurus?

The most robust approach is "static file + internal dynamic injection": save the official IIFE snippet to `static/js/baidu-tongji.js`, reference it from `scripts` via `{ src: '/js/baidu-tongji.js', async: true }`, and let the script itself `document.createElement('script')` to load `hm.baidu.com/hm.js`. Finally, add `https://hm.baidu.com` to `script-src`, `connect-src`, and `img-src` of your CSP, or reports will be blocked by the browser.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
