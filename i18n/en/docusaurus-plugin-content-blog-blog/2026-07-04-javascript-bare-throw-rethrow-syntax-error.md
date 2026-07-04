---
title: "JavaScript throw; is a SyntaxError? JS has no bare rethrow — you must throw e"
description: "Writing throw; (a bare rethrow) in a JavaScript/TypeScript catch block is a SyntaxError in Node, TS1109 Expression expected in tsc, and Unexpected ';' in esbuild. JS has no bare rethrow like C#/Java/Python — you must throw e."
date: 2026-07-04
tags: [JavaScript, TypeScript, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do you rethrow a caught exception in JavaScript?"
    a: "Use throw e, with catch taking a binding: catch (e) { ...; throw e; }. JS has no bare rethrow — a standalone throw; is a SyntaxError that Node, tsc, and esbuild all reject at compile time."
  - q: "Does rethrowing an exception in JavaScript preserve the original stack?"
    a: "Yes. throw e reuses the same error object, whose .stack was captured when it was constructed with new Error; rethrow does not overwrite it. Only throw new Error(...) generates a fresh stack from the current point."
  - q: "How do you correctly rethrow inside a JavaScript try/catch?"
    a: "catch must receive the error and throw it back: try { ... } catch (e) { log(e); throw e; }. With ES2019 catch {} (no parameter) there is nothing to rethrow — you can only throw new Error(...)."
---

Wanting to "just pass the exception up unchanged" from a catch block, I reflexively wrote `throw;` — the bare rethrow I was used to in C# — and tsx/esbuild immediately failed to transform it: `Unexpected ";"`.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics pipeline that surfaces market trends, user behavior, and sales data for precise operations.

## TL;DR

JavaScript **has no bare rethrow syntax**. `throw;` (a bare throw) is a compile-time SyntaxError in all three toolchains: Node, tsc, and esbuild. To rethrow a caught exception you must `throw e` (the catch block needs a binding); to throw a new one, `throw new Error(...)`.

## The symptom

The same `throw;` produces differently-worded errors across toolchains, but all of them are syntax errors (not runtime errors):

```js
try {
  something();
} catch {
  throw;   // ← bare rethrow
}
```

| Toolchain | Error |
|-----------|-------|
| tsx / esbuild | `ERROR: Unexpected ";"` (transform fails) |
| Node.js native (.js / .mjs) | `SyntaxError: Unexpected token ';'` |
| TypeScript compiler (tsc) | `error TS1109: Expression expected.` |

The misleading one is esbuild's `Unexpected ";"` — it's tempting to read as "esbuild/tsx doesn't support some newer syntax." But run the same snippet through native Node and you get the identical SyntaxError. **This isn't a tool limitation; the language itself has no such form.**

## Root cause

The ECMAScript `throw` statement **mandates an expression**:

```text
ThrowStatement : throw Expression ;
```

That is, `throw` must be followed by a value (`throw err`, `throw new Error()`, `throw "fail"`) — the slot before the semicolon cannot be empty. **JavaScript has no "bare throw = rethrow the current exception" semantics**, which is the key difference from C# / Java / Python:

| Language | Rethrow current exception | Needs caught variable |
|----------|---------------------------|-----------------------|
| C# | `throw;` | no |
| Java | `throw e;` | yes |
| Python | `raise` | no |
| **JavaScript** | **`throw e;`** | **yes** |

One common confusion: ES2019 added optional catch binding (`catch {}` may omit the parameter), but that is orthogonal to bare throw. **Even with a binding present, `throw;` still errors** —

```js
try { f(); } catch (e) { throw; }   // still a SyntaxError; e is NOT auto-fed to throw
```

Confirmed in tsx as `Unexpected ";"`. The expression after `throw` cannot be omitted; there are no exceptions.

## The fix

Pick the form that matches your intent:

```js
// 1. Rethrow the original exception — the most common need
try {
  doWork();
} catch (e) {
  log(e);
  throw e;            // ✅ include e
}

// 2. Wrap in a new exception
try {
  doWork();
} catch (e) {
  throw new Error(`failed: ${e.message}`);   // ✅ throw + expression
}

// 3. With ES2019 catch {} (no parameter), there is nothing to rethrow — throw new
try {
  doWork();
} catch {
  throw new Error("doWork failed");   // ✅ throw; here would be wrong
}
```

A minimal runnable repro and fix — run it directly with tsx:

```ts
function risky(): void {
  throw new Error("origin");
}

function rethrowOptional(): void {
  try {
    risky();
  } catch (e) {          // ← must receive e
    console.log("caught, rethrowing");
    throw e;             // ← not throw;
  }
}

try {
  rethrowOptional();
} catch (e) {
  console.log("recovered:", (e as Error).message);   // origin
}
```

On the call stack: `throw e` reuses the same error object, whose `.stack` was captured at `new Error` time; rethrow does not overwrite it. Only `throw new Error(...)` generates a fresh stack from the current throw site. So "does rethrow lose the stack?" — no, as long as you don't construct a new error.

Another common exception-handling pitfall is a catch block that swallows the error entirely, surfacing as a silent failure — see [Python task marked failed but no error? try/except swallowed it](/blog/python-try-except-swallow-exception-silent-failure). Worth watching across every language.

## Caveats

<InfoBox variant="warning" title="Caveats">

- **Optional catch binding is not the culprit**: `catch {}` (ES2019) is legal on its own; the only problem is `throw;`. Don't add a parameter to catch just to "fix throw" unless you actually use the variable.
- **Same rule in async/await**: `try { await f() } catch (e) { throw; }` is a SyntaxError inside async functions too — the rule doesn't distinguish sync from async.
- **Stack preservation**: `throw e` keeps the original stack; `throw new Error(...)` refreshes it. Use the former when debugging and you need the earliest throw site.
- **Aligning cross-language habits**: coming from C#/Python to JS, porting `throw;` / `raise` directly will always bite you; flag this pattern in code review.

</InfoBox>

## FAQ

### How do you rethrow a caught exception in JavaScript?

Use `throw e`, and catch must take a binding: `catch (e) { ...; throw e; }`. JavaScript has no bare rethrow — a standalone `throw;` is a SyntaxError that Node, tsc, and esbuild all reject at compile time. It is not a limitation of any single tool.

### Does rethrowing an exception in JavaScript preserve the original stack?

Yes. `throw e` reuses the same error object, whose `.stack` was captured when the error was constructed with `new Error`; rethrow neither overwrites nor resets it. Only `throw new Error(...)` generates a fresh stack from the current throw site — so if you want the earliest origin during debugging, use `throw e`.

### How do you correctly rethrow inside a JavaScript try/catch?

catch must receive the error and throw it back: `try { ... } catch (e) { log(e); throw e; }`. With ES2019's `catch {}` (parameter omitted) there is no variable to throw, so you can only `throw new Error(...)`. Either way, `throw` must be followed by an expression — `throw;` is always illegal.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
