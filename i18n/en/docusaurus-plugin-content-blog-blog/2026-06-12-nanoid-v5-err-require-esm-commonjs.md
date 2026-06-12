---
title: "Node.js require('nanoid') Throws ERR_REQUIRE_ESM? Alternatives After v5 Went ESM-Only"
description: "In a CommonJS project, require('nanoid') throws ERR_REQUIRE_ESM because nanoid v5 ships ESM-only. Replace it with crypto.randomUUID() — zero-dependency and CJS/ESM compatible."
date: 2026-06-12
tags: [Node.js, nanoid, CommonJS, ESM]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does require('nanoid') throw ERR_REQUIRE_ESM in Node.js?"
    a: "nanoid became an ESM-only package in v5, and CommonJS require() cannot load ESM modules synchronously, so it throws ERR_REQUIRE_ESM. Use dynamic import or a native alternative."
  - q: "Can I still use nanoid v5 in a CommonJS project?"
    a: "Yes, but only via await import('nanoid'), or by pinning to v3.x (still CJS-compatible). If you just need a unique ID, crypto.randomUUID() is the simplest choice."
---

In a CommonJS project, `require('nanoid')` to generate a unique ID throws `ERR_REQUIRE_ESM` the moment the process starts, and it exits immediately.

Encountered this while building the [ecommerce data collection tool](/docs/browser-plugin) for a client — a browser-side scraper that captures product images, SKUs, prices, and reviews in real time, then cleans and exports them as structured files. The server needed a stable traceId per request for cross-service log correlation.

## TL;DR

From v5 onward, `nanoid` is an **ESM-only package**, and CommonJS `require()` cannot load it — it always throws `ERR_REQUIRE_ESM`. If your project is still CJS, the simplest replacement is Node's built-in `crypto.randomUUID()`: zero dependencies, works in both CJS and ESM, and produces a standard UUID.

## The Problem

A perfectly ordinary import in a CJS project:

```js
// server.js (CommonJS)
const { nanoid } = require('nanoid');

const traceId = nanoid();
```

It crashes on startup, the stack pointing at nanoid's entry file:

```bash
node server.js

internal/modules/cjs/loader.js:905
Error [ERR_REQUIRE_ESM]: require() of ES Module
/node_modules/nanoid/index.js from server.js not supported.

Instead change the require of index.js in server.js to a CommonJS module,
or use a dynamic import() call.
```

Note that this isn't an intermittent or environment-specific error — it's a **deterministic crash**. Once you're on v5, the CJS path simply does not work.

## Root Cause

In v5, `nanoid` completed its ESM-only migration: its `package.json` no longer ships a CommonJS entry, only ESM. Node's CommonJS loader, `require()`, is synchronous and **cannot load an ESM module**, so it throws `ERR_REQUIRE_ESM`.

This isn't a nanoid bug — it's the ecosystem's module-format evolution. More and more packages ship ESM-only (`got` v12+, `node-fetch` v3, `uuid` v7+ all do the same). As long as your host project is CommonJS, you'll hit the same wall with every one of them.

If you've also hit "module not found" with dynamic `import()`, that's the same ESM resolution rules at work — see [Node.js ESM dynamic import can't find the module? Check the file extension](/blog/esm-dynamic-import-missing-extension).

## Solution

Three options, ordered by how little they cost to adopt.

### Option 1 (recommended): use `crypto.randomUUID()`

When you're generating unique IDs, nanoid's core value is "short and unique." But as long as the ID doesn't need to fit in a URL or be aggressively shortened, a standard UUID is more than enough — and it's built into Node 14.17+, with zero dependencies:

```js
// Works identically in CommonJS and ESM
const { randomUUID } = require('node:crypto');

const traceId = randomUUID();
// => '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
```

This single change solves three problems at once:

- **Zero dependencies**: no more third-party package, so its module format can never hold you hostage;
- **Format alignment**: UUID is a universal cross-language, cross-service format, handy for log correlation and database primary keys;
- **CJS/ESM agnostic**: `node:crypto` is built into Node and behaves the same under both module systems.

The only tradeoff is length — a UUID is 36 characters versus nanoid's default 21. For traceIds and primary keys that cost is negligible; only if you need it in a short link should you keep reading.

### Option 2: pin nanoid v3

nanoid's v3.x is the last major version that supports CommonJS, and `require` works directly:

```json
// package.json — explicitly pin v3
{
  "dependencies": {
    "nanoid": "^3.3.7"
  }
}
```

```js
const { nanoid } = require('nanoid');
const id = nanoid(); // 21-char short ID
```

Good for when you genuinely want short IDs but can't migrate the project to ESM yet. The cost is staying on an old version and missing v5's later updates.

### Option 3: async dynamic import

If you must use v5, the only way in is ESM's async loader:

```js
// In CommonJS, load the ESM package with dynamic import()
async function makeId() {
  const { nanoid } = await import('nanoid');
  return nanoid();
}

// The call site itself has to be async
const id = await makeId();
```

It works, but nanoid is fundamentally a synchronous ID generator — wrapping it in `async/await` forces async to propagate up the entire call chain, which is rarely worth it.

<InfoBox variant="warning" title="Caveats">

- This trap isn't unique to nanoid: `uuid` v7+, `node-fetch` v3, and `got` v12+ are all ESM-only, and `require`-ing them in a CJS project throws the identical `ERR_REQUIRE_ESM`. The way to tell is to check the target package's `package.json` for `"type": "module"` or an `"import"`-only entry.
- `crypto.randomUUID()` requires **Node 14.17+**; on older runtimes, assemble one yourself with `crypto.randomBytes(16).toString('hex')`.
- Don't `require('nanoid')` in a CJS project while also `import`-ing nanoid in an ESM one — mixing them leaves both old and new copies in the dependency tree, making behavior much harder to predict.

</InfoBox>

## FAQ

### Why does require('nanoid') throw ERR_REQUIRE_ESM in Node.js?

Because nanoid has shipped only ESM artifacts since v5, and Node's CommonJS `require()` loads synchronously and cannot load an ESM module — it throws `ERR_REQUIRE_ESM` the moment it hits nanoid's entry. This is a hard boundary between the CJS and ESM module systems, not a configuration issue.

### Can I still use nanoid v5 in a CommonJS project?

Yes, but either load it asynchronously with `await import('nanoid')` (which forces the whole call chain async) or pin the version to v3.x, which is still CJS-compatible. If you only need a unique ID, Node's built-in `crypto.randomUUID()` is the simplest path — zero dependencies and supported under both module systems.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
