---
title: "JWT Signing Silently Fails? Check Your Node.js Environment Variable Loading Order"
description: "dotenv.config() must run before all imports in Node.js, or module-level code reads process.env as undefined — solve it with lazy initialization"
date: 2026-05-18
tags: [Node.js, dotenv, JWT]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is process.env.JWT_SECRET undefined even though it's in my .env file?"
    a: "dotenv.config() runs after the import chain, so module-level code reads env vars before .env is loaded. Use lazy initialization to fix this."
  - q: "Does putting dotenv.config() at the top of the file fix it?"
    a: "Not enough. ES Module imports are hoisted and execute first regardless of position. You need lazy init or call dotenv before all imports in the entry file."
---

Encountered this issue while building a SaaS authentication system for a client. Here's the root cause and solution.

## TL;DR

In Node.js ES Modules, `import` statements execute **before** `dotenv.config()`. If module-level code reads `process.env.JWT_SECRET`, it gets `undefined`, causing JWT signing to use the string `"undefined"` as the secret — no errors thrown, but all token verification fails. The fix: **lazy initialization**.

## The Problem

JWT login returns 200, but all subsequent requests return 401. Investigation reveals:

1. Tokens generated at login can't be verified by `jwtVerify()`
2. Every server restart invalidates all previously issued tokens
3. `console.log(process.env.JWT_SECRET)` outputs `undefined`

```typescript
// jwt.ts — module-level code
import crypto from 'crypto';

// ❌ This line executes BEFORE dotenv.config(), JWT_SECRET is undefined
const SECRET = crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET)
);
```

The worst part: **no error is thrown**. `new TextEncoder().encode(undefined)` encodes the string `"undefined"` into bytes, producing a valid but wrong secret key.

## Root Cause

ES Module `import` statements are **statically hoisted**:

```typescript
// server.ts (entry file)
import { router } from './routes/auth';      // ← runs first
import { authenticateToken } from './middleware/auth'; // ← runs first

dotenv.config(); // ← runs AFTER all imported modules execute
```

Execution order:

1. Node.js scans all `import` statements and builds the dependency graph
2. Executes all imported modules' top-level code **depth-first** (`jwt.ts`'s `const SECRET = ...` runs here)
3. Returns to `server.ts`, runs `dotenv.config()`
4. Now `.env` is loaded into `process.env`

So `jwt.ts` module-level code reads `process.env.JWT_SECRET` as `undefined`.

## Solution

### Option 1: Lazy Initialization (Recommended)

Move secret initialization into a function — env var is read on first call, not at import time:

```typescript
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

// Use getSecret() everywhere the key is needed
export async function generateToken(payload: any): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret()); // ← deferred until runtime
}
```

No dependency on entry file import order — safe regardless of when called.

### Option 2: Call dotenv at the Very Top of Entry File

```typescript
// server.ts — ensure these lines come before ALL imports
import 'dotenv/config'; // or require('dotenv').config()
import express from 'express';
// ...other imports
```

**Limitation**: If another entry point (cron job, worker) forgets this line, the bug resurfaces.

## Caveats

<InfoBox variant="warning" title="Caveats">

- This pitfall affects **all** module-level env var reads, not just JWT — database connections, API keys, etc.; ESM module resolution has another common gotcha — [missing .js extensions in dynamic imports](/blog/esm-dynamic-import-missing-extension) causes module-not-found errors in production
- `require('dotenv').config()` only guarantees order in CommonJS; ES Module `import` always executes before runtime code
- Lazy initialization works well for: secrets, DB connection pools, external API clients, and other one-time resources; if you're using the jose library with Node 24, also watch out for [KeyObject format changes](/blog/nodejs-24-jwt-jose-keyobject)

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
