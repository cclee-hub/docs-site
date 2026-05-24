---
title: "JWT_SECRET is undefined? Node.js Import Chain Execution Order vs dotenv"
description: "jwt.ts reads process.env before dotenv.config() due to import chain order. Fix with lazy initialization"
date: 2026-05-24
tags: [nodejs, jwt, dotenv, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is process.env.JWT_SECRET undefined in Node.js?"
    a: "ES Module imports are statically analyzed and resolved before code execution. If jwt.ts reads process.env.JWT_SECRET at module top-level, and dotenv.config() is called in server.ts, jwt.ts loads first via the import chain — before .env is parsed."
  - q: "What is the execution order of dotenv.config() and import in Node.js?"
    a: "All import statements are loaded and their top-level code executed first (in dependency topology order), then the current file's remaining code runs. So dotenv.config() must come before any import that depends on it, or use lazy initialization to avoid module-level env reads."
  - q: "How to fix JWT secret being undefined at module load time?"
    a: "Change SECRET from a module-level constant to a lazy initialization function: read process.env only on first call, then cache the result. This way dotenv.config() can be called anywhere, as long as it runs before the first actual JWT operation."
---

While building a Node.js backend for a client, login endpoints started returning 401. Investigation revealed all JWT token verifications were failing — the log showed `JWT_SECRET` was the literal string `"undefined"` instead of the actual secret. Here's the root cause and solution.

<!-- truncate -->

## TL;DR

`jwt.ts` initialized the secret at module top-level with `const SECRET = crypto.createSecretKey(process.env.JWT_SECRET)`. Due to the import chain (`server.ts` → `routes` → `middleware/auth` → `jwt`), `jwt.ts` executed before `dotenv.config()` in `server.ts`, so `process.env.JWT_SECRET` was `undefined`.

## Symptoms

```typescript
// server.ts
import dotenv from 'dotenv';
import { router } from './routes';  // import chain eventually loads jwt.ts

dotenv.config();  // loads .env → but jwt.ts already executed

// jwt.ts — module top-level
const SECRET = crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET)
);
// SECRET = createSecretKey("undefined") ← .env hasn't loaded yet!
```

All tokens signed with this SECRET used the string `"undefined"` as the key. If the server restarted and the .env loaded in a different order, all previously issued tokens would become invalid.

## Root Cause

Node.js ES Module execution order:

1. **Imports are static**: The engine resolves all `import` statements before executing any code, building a module graph in dependency topology order
2. **Module-level code executes immediately**: When each module loads, top-level `const`, `let`, and function declarations execute right away
3. **Then the current file runs**: Only after all dependency modules have loaded does the current file's remaining code execute

Actual execution order:

```
server.ts import resolution begins
  → loads routes/index.ts
    → loads middleware/auth.ts
      → loads domains/auth/jwt.ts
        → executes const SECRET = createSecretKey(process.env.JWT_SECRET)
        → .env not loaded yet, JWT_SECRET = undefined
      → returns auth middleware
    → returns routes
  → all imports complete
→ executes dotenv.config()  ← too late
→ executes app.listen(...)
```

If you've encountered similar Node.js env loading issues, check out [Node.js dotenv Load Order Fix](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order).

## Solution

**Lazy initialization** — change SECRET from a module-level constant to a getter function:

```typescript
// jwt.ts — fixed
import crypto from 'crypto';

let _secret: crypto.KeyObject | null = null;

function getSecret(): crypto.KeyObject {
  if (!_secret) {
    const secretValue = process.env.JWT_SECRET;
    if (!secretValue) {
      throw new Error('JWT_SECRET environment variable not set');
    }
    _secret = crypto.createSecretKey(
      new TextEncoder().encode(secretValue)
    );
  }
  return _secret;
}

// Call getSecret() instead of using SECRET directly
export async function generateToken(payload: object): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret());  // reads env only on first call
}
```

**Why it works**: `getSecret()` reads `process.env` at function call time, after `dotenv.config()` has already executed and environment variables are correctly loaded.

<InfoBox variant="warning" title="Important">

This issue isn't limited to JWT. Any code reading `process.env` at module top-level has the same risk — database connection strings, API keys, third-party SDK initialization, etc. The rule: **don't depend on environment variables in module-level code. Either use lazy initialization, or ensure dotenv.config() runs before all imports**.

Option 1 (lazy init) is safer because you can't control whether future imports will indirectly depend on env vars. Option 2 (early dotenv) requires placing `dotenv.config()` at the very top of the file with no imports breaking the order.

</InfoBox>

## FAQ

### Why is process.env.JWT_SECRET undefined in Node.js?

ES Module imports are statically analyzed and resolved before code execution. If `jwt.ts` reads `process.env.JWT_SECRET` at module top-level, and `dotenv.config()` is called in `server.ts`, the import chain loads `jwt.ts` first — before .env is parsed, so SECRET is undefined.

### What is the execution order of dotenv.config() and import in Node.js?

All import statements are loaded and their top-level code executed first (in dependency topology order), then the current file's remaining code runs. So `dotenv.config()` must come before any import that depends on it, or use lazy initialization to avoid module-level env reads.

### How to fix JWT secret being undefined at module load time?

Change SECRET from a module-level constant to a lazy initialization function: read `process.env` only on first call, then cache the result. This way `dotenv.config()` can be called anywhere, as long as it runs before the first actual JWT operation.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-3">Building a Node.js backend?</p>
  <a href="https://ai.ccleeai.com" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">Explore CCLHub AI Analytics Platform</a>
</div>
