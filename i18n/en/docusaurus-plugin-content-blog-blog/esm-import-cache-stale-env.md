---
title: "process.env Not Propagating? It's the ESM Import Cache"
description: "ESM imports bind once at module load, so later process.env writes never reach them. Read values dynamically at the call site; dotenv behaves the same way."
date: 2026-09-28
tags: [Node.js, ESM, Environment Variables, Bug Fixes]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How should Node.js environment variables be configured and read?"
    a: "Configure via a .env file with dotenv or system-level exports; read them dynamically as process.env.XXX everywhere in code. The key takeaway: process.env is the only channel that runtime updates propagate through — a constant imported at module top level is fixed at first load and never follows later changes."
  - q: "Why do other modules still see the old value after process.env is updated?"
    a: "Because the consuming module says import { TOKEN } from './config.js' — that line evaluates once at first module load, copying the value of that moment into a local constant. Nothing afterwards, inside config.js or on process.env, propagates back into it. Read process.env.TOKEN at the call site instead to always get the current value."
  - q: "Do I need to restart the process after updating the .env file?"
    a: "Restarting is the reliable answer: dotenv.config() reads the file exactly once, at call time. For in-process hot reloads you must call dotenv.config({ override: true }) again AND have every consumer read process.env dynamically — a single import-as-constant anywhere breaks the propagation chain."
---

A login script successfully refreshed the credential at runtime and wrote it into `process.env`. Business requests still return 401 — the constant they `import`ed is still the stale value from process startup.

> Encountered this while building a data-collection tool for a client — recording the root cause and the fix.

## TL;DR

**An ESM module evaluates exactly once; what you `import` is a read-only snapshot from load time** — no later write to `process.env` ever reaches an already-imported constant.

```js
// ❌ cached at load time, stale forever after
import { AUTH_TOKEN } from './config.js'

// ✅ read the current value on every use
function getToken() {
  return process.env.AUTH_TOKEN || ''
}
```

One-sentence rule: **a value that updates at runtime must be read dynamically from `process.env` at the call site — never imported as a module-level constant.**

## Symptoms

Three files, three jobs: `config.js` exports config constants, `login.js` logs in and refreshes the credential, `runtime.js` sends business requests with it:

```js
// config.js — central export
export const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
```

```js
// login.js — refresh after login
process.env.AUTH_TOKEN = newToken   // runtime update
console.log('[login] token refreshed')
```

```js
// runtime.js — business requests
import { AUTH_TOKEN } from './config.js'

fetch(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
// → 401: AUTH_TOKEN is still the startup-time value (or an empty string)
```

Logs say the token was refreshed; the request header carries the old credential. Print `AUTH_TOKEN` and `process.env.AUTH_TOKEN` side by side and they differ — `process.env` is current, the imported constant is not.

## Root Cause: An ESM Module Evaluates Only Once

Per the ESM specification, **a module's code executes exactly once** — from its first import until the process exits; every subsequent import receives the same cached module instance.

So `import { AUTH_TOKEN } from './config.js'` in `runtime.js` actually means: load `config.js` (evaluating `export const AUTH_TOKEN = process.env.AUTH_TOKEN || ''`, which freezes the then-current process.env value into the constant) and bind that **value** into `runtime.js`'s scope.

Two properties of that binding create the trap:

1. **Read-only**: the imported binding in the consumer cannot be reassigned (ESM import bindings do point at the export's live binding — but `config.js` exports a `const`, which will never hold a new value)
2. **Decoupled from process.env**: `process.env.AUTH_TOKEN = newToken` executed later by `login.js` merely sets a property on the `process.env` object — the evaluation in `config.js` finished long ago, and no mechanism propagates that write back into the exported constant

In one sentence: `process.env` is a mutable runtime object, and `export const X = process.env.Y` is a one-time snapshot of one of its rows. The snapshot does not track the original.

## The Fix: Read Dynamically at the Call Site

**Option 1 (smallest change): read the current value on use.** Replace the imported constant with a `process.env` read:

```js
// runtime.js
// import { AUTH_TOKEN } from './config.js'   ← remove

fetch(url, {
  headers: { Authorization: `Bearer ${process.env.AUTH_TOKEN || ''}` },
})
```

**Option 2 (many call sites): centralize in a getter.** When usage is scattered, consolidate into a function that evaluates on call:

```js
// config.js — export a function, not a constant
export const getToken = () => process.env.AUTH_TOKEN || ''
```

```js
// runtime.js — evaluated at call time, always current
import { getToken } from './config.js'

fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
```

**Option 3 (many config keys): export an object, read by property.** Property access is dynamic by nature:

```js
// config.js
const env = {
  get token() { return process.env.AUTH_TOKEN || '' },
}
export default env

// runtime.js
import env from './config.js'
env.token   // reads process.env on every access
```

All three share one principle: **defer evaluation from module load to every use.**

The same tool hits a second env-file trap after packaging (userData directory, not cwd) — a sibling problem about when and where config is read, covered in [Packaged Electron App Can't Read .env? It Lives in userData](/blog/electron-packaged-env-userdata).

<InfoBox variant="warning" title="Watch out">

dotenv behaves identically: `dotenv.config()` reads the `.env` file exactly once, at call time. Editing the file afterwards, or calling plain config again, does not update already-injected values (`override: true` does overwrite, but only for code that reads `process.env` afterwards — anything imported as a constant stays dead). For "I changed .env but nothing happened": first check whether the process restarted, then whether the value was imported as a constant.

</InfoBox>

## FAQ

### How should Node.js environment variables be configured and read?

Configure via a `.env` file with dotenv or system-level exports; read them dynamically as `process.env.XXX` everywhere in code. The key takeaway: `process.env` is the only channel that runtime updates propagate through — a constant imported at module top level is fixed at first load and never follows later changes.

### Why do other modules still see the old value after process.env is updated?

Because the consuming module says `import { TOKEN } from './config.js'` — that line evaluates once at first module load, copying the value of that moment into a local constant. Nothing afterwards, inside config.js or on process.env, propagates back into it. Read `process.env.TOKEN` at the call site instead to always get the current value.

### Do I need to restart the process after updating the .env file?

Restarting is the reliable answer: `dotenv.config()` reads the file exactly once, at call time. For in-process hot reloads you must call `dotenv.config({ override: true })` again AND have every consumer read process.env dynamically — a single import-as-constant anywhere breaks the propagation chain.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
