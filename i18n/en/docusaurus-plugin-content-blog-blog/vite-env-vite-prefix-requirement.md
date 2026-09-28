---
title: "Vite Env Variable Undefined? It Needs the VITE_ Prefix"
description: "Vite exposes only VITE_-prefixed variables to the browser — a guard against bundling server secrets. Add the prefix, type env.d.ts, restart dev server."
date: 2026-09-28
tags: [Vite, Environment Variables, TypeScript, Frontend]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Where do Vite environment variables live?"
    a: "In the .env family at the project root: .env loads in both modes, .env.development only for the dev server, .env.production only during builds. After editing any of them you must restart the dev server — Vite loads env files once at startup, and hot reload does not refresh them."
  - q: "Can I put secrets behind the VITE_ prefix?"
    a: "No. VITE_ variables are statically inlined into the client bundle at build time — anyone can read them in the page source. The prefix exists to separate publishable config (API base URLs, feature flags) from server-only secrets. Secrets belong in server-side environment variables only."
  - q: "What is the difference between process.env and import.meta.env in Vite?"
    a: "import.meta.env is the browser-side API — Vite statically replaces VITE_-prefixed keys into it. process.env is a Node.js API, available only inside vite.config.ts and SSR contexts. Writing process.env.XXX in frontend code is always undefined after build."
---

You set `API_URL=http://localhost:3005` in a Vite project's `.env`, but `import.meta.env.API_URL` logs undefined in the browser, and every API request goes to the wrong address.

> Encountered this while building an AI Agent SaaS platform for a client — recording the root cause and the fix.

## TL;DR

**Vite exposes only `VITE_`-prefixed environment variables to client code** — a security design that keeps server secrets out of the browser bundle.

```bash
# ❌ never exposed to the frontend
API_URL=http://localhost:3005

# ✅ exposed to the frontend
VITE_API_URL=http://localhost:3005
```

Access it as `import.meta.env.VITE_API_URL`. TypeScript projects should add one more step: an `env.d.ts` declaration for proper autocomplete.

## Symptoms

Two typical presentations:

**Symptom 1: the variable is undefined**

```ts
// .env: API_URL=http://localhost:3005
console.log(import.meta.env.API_URL)   // undefined
console.log(import.meta.env)           // BASE_URL, MODE, PROD... are all there — just not yours
```

The `.env` file clearly loaded (`MODE`, `PROD` and the other built-ins are present), so this is not a loading failure — the **exposure rule** filtered your variable out.

**Symptom 2: prefix added, access name mistyped**

```ts
// .env: VITE_API_URL=...
const url = import.meta.env.VITE_APIURL   // undefined — case must match exactly
```

A separate note: "environment variable reads undefined" on the Node.js server side has a different common cause (dotenv load order) — see [Node.js env loaded undefined: dotenv import order](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order). Don't mix the two investigations.

## Root Cause: The Prefix Rule Is a Security Boundary

Vite's design problem: `.env` files typically hold two kinds of values — public config the frontend needs (an API base URL) and values that must never reach a browser (database URLs, third-party API keys). Exposing everything means one oversight puts a secret into a publicly served static bundle.

So Vite draws a hard line: **only `VITE_`-prefixed variables appear in `import.meta.env`**. Everything else is visible only in `vite.config.ts` (the Node side) via `loadEnv`.

The exposure mechanism matters too: **static replacement at build time**. Vite inlines `import.meta.env.VITE_API_URL` as a string literal during the build; at runtime there is no "read the environment" step. Two consequences:

1. The value appears in plain text inside the shipped JS — a `VITE_` variable is public by nature
2. Changing environment at runtime (container env, system variables) never affects an already-built bundle — switching environments requires a rebuild, or a runtime-injected config (e.g. `window.__CONFIG__`)

## The Fix: Prefix + Type Declaration

**Step 1: add the `VITE_` prefix in `.env`.** Keep the name semantic; the prefix is only an exposure marker:

```bash
# .env
VITE_API_URL=http://localhost:3005
```

**Step 2: read it through one config module**, not scattered `import.meta.env` calls in components:

```ts
// src/config.ts
export const API_URL = import.meta.env.VITE_API_URL
```

**Step 3 (TypeScript projects): declare the types in `src/env.d.ts`** for full autocomplete:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

Separate dev and production values with mode files — Vite picks the right one automatically:

```bash
.env.development    # dev server
.env.production     # npm run build
.env                # loaded in both — shared config goes here
```

After editing any `.env` file, **restart the dev server** — env files load once at startup, and hot reload does not refresh them. This is the second most common "I changed it but nothing happened" cause.

<InfoBox variant="warning" title="Watch out">

A `VITE_` variable is public information: its value is inlined into the client bundle in plain text. API base URLs and feature flags are fine; database connection strings and third-party secrets are not — those stay in server-side environment variables. When the frontend needs protected config, serve it from an API endpoint instead of `.env`.

</InfoBox>

## FAQ

### Where do Vite environment variables live?

In the `.env` family at the project root: `.env` loads in both modes, `.env.development` only for the dev server, `.env.production` only during builds. After editing any of them you must restart the dev server — Vite loads env files once at startup, and hot reload does not refresh them.

### Can I put secrets behind the VITE_ prefix?

No. `VITE_` variables are statically inlined into the client bundle at build time — anyone can read them in the page source. The prefix exists to separate publishable config (API base URLs, feature flags) from server-only secrets. Secrets belong in server-side environment variables only.

### What is the difference between process.env and import.meta.env in Vite?

`import.meta.env` is the browser-side API — Vite statically replaces `VITE_`-prefixed keys into it. `process.env` is a Node.js API, available only inside `vite.config.ts` and SSR contexts. Writing `process.env.XXX` in frontend code is always undefined after build.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
