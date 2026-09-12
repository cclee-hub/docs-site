---
title: "Cannot access before initialization in ESM? Implicit globals"
description: "A vendored classic script's implicit global throws in ESM strict mode, so dynamic imports hit the TDZ. Fix: add a var declaration to the vendor file head."
date: 2026-09-13
tags: [Chrome Extension, ESM, JavaScript, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does 'Cannot access before initialization' only appear at runtime when typecheck and build are green?"
    a: "Static checks and bundlers never execute module code, while the ReferenceError from an implicit global assignment fires only when the module actually initializes. If the offending module sits on a dynamic import chain, the error defers to the moment of interaction — in this case, clicking the extension button, with 0 errors at build time. Importing the module directly in Vitest (jsdom) reproduces it locally with real line numbers."
  - q: "What does 'Cannot access xxx before initialization' have to do with the temporal dead zone (TDZ)?"
    a: "The namespace object returned by a dynamic import stays in the temporal dead zone once its dependency module's initialization broke, so touching any export throws. The giveaway is the identifier name: a 2-letter minified name like Hc instead of a business symbol means the break happened during module graph evaluation, not in your code."
  - q: "How do I fix implicit globals in a vendored classic script?"
    a: "Declare each implicit global at the top of the vendor file with var (2 in this case: ReaderArticleFinder and CandidateElement) so the assignment targets a declared binding. One line removes the whole module-graph initialization break; run a strict-mode smoke test before any new vendor file lands."
---

Clicking the "Extract this page" button in the browser extension throws `Cannot access 'Hc' before initialization` — while typecheck, build, and the regular test suite all pass, and the error never reproduces in local development.

I hit this while building an [e-commerce automated data collection tool](/cases/ecommerce-data-collection-tool) for a client — bulk-scraping product images, SKUs, prices, and reviews, cleaned and exported as structured data for inventory management and competitor analysis. "Extract this page" is the collection entry of that toolchain, and the content script module was what broke.

## TL;DR

A third-party classic script (vendored) contains an implicit global assignment (`CandidateElement = function(...)`, assigned without declaration). Legal in a classic script — it silently creates a global — the line becomes a ReferenceError once the file is inlined into an ESM module graph that runs in strict mode. Module initialization aborts on the spot, and the namespace the downstream code receives through dynamic import sits in the temporal dead zone (TDZ). Fix: add one line `var CandidateElement;` at the top of the vendor file.

## The symptom: green build, instant crash on click

The error fires when the user clicks, not at page load:

```text
TypeError: Cannot access 'Hc' before initialization
```

Three counterintuitive facts:

1. **typecheck passes** — nothing wrong at the type level;
2. **build passes** — the bundler does static analysis only, it never executes module code;
3. **regular tests pass** — no test imports the module graph completely.

The failing identifier is `Hc`, a 2-letter minified name, not any business symbol. Hold that thought; it matters for identification later.

## Root cause: how an implicit global breaks the ESM module graph

The offending line comes from a third-party library, at `reader-finder.js:878`:

```js
// classic script semantics: assign without declaring = create a global, legal
CandidateElement = function(e, t) { ... }
```

The failure chain has 4 steps, each enabling the next:

**Step 1: legal under classic script semantics.** The file originally loaded via a `<script>` tag; in sloppy mode, assigning without declaring silently creates a global variable — the original author relied on exactly that.

**Step 2: a minefield once inlined into ESM.** The file got inlined into the extension's ESM module graph, and ESM code always runs in strict mode — the implicit global assignment now throws a ReferenceError, and module evaluation of that vendor module aborts immediately.

**Step 3: the break spreads along the module graph.** The content script `content.js` evaluates its inline module graph and stalls at the vendor module: earlier modules got their message listeners registered, but later module facades never executed — the graph is left half-initialized.

**Step 4: the dynamic import lands in the TDZ.** When the user clicks the button, code loads the namespace facade through dynamic import. Because of the step-3 break, that namespace is in the temporal dead zone, and touching it throws `Cannot access 'Hc' before initialization` — `Hc` being the renamed internal binding of the module that never finished initializing.

This explains every observation: static checks stay green because they never execute module code; the error appears on click because the dynamic import lives inside the click handler; and the identifier is minified because the broken binding was renamed by the bundler.

For the other high-frequency dynamic import pitfall (module not found), see: [Node.js ESM dynamic import says module not found? Check the file extension](/blog/esm-dynamic-import-missing-extension).

## The fix: one var declaration at the vendor file head

No third-party logic changes — just turn the implicit global into an explicit declaration by adding at the top of the vendor file:

```js
var ReaderArticleFinder;
var CandidateElement;
```

The assignment changes from "create a global" to "assign to a declared variable", which is legal in strict mode. Module initialization completes, and the facade downstream code imports dynamically works as expected.

`ReaderArticleFinder` in the same file was already handled this way — the same library planted the same trap twice; the first got fixed, the second (`CandidateElement`) slipped through.

### Verification: reproduce it locally with Vitest

Before fixing, make it reproduce on demand — otherwise every check means a production deploy. Regular tests never reach this path, but importing the module directly in Vitest (jsdom environment) does:

```ts
import { describe, it, expect } from 'vitest';

describe('vendor reader-finder strict-mode', () => {
  it('initializes the full module graph without a ReferenceError', async () => {
    const mod = await import('./lib/vendor/reader-finder');
    expect(mod).toBeDefined();
  });
});
```

This test reproduced the error before the fix and produced a stack with real file line numbers (`reader-finder.js:878`) — far more actionable than a minified `Hc` from production. It turned green after the fix.

The complete verification runs the extraction chain end to end: the module graph initializes fully and extraction actually works — both must pass to call it closed.

### Regression guard

The reproduction case became a permanent smoke test (`extractor.test.ts`), plus a rule for the repo: any new classic script vendored into the project must pass this test, or an equivalent strict-mode check, before landing.

<InfoBox variant="warning" title="Watch out">

- Keep vendor files close to the original for upstream diffs; when adding a `var` declaration, leave a comment at the file head explaining why, so the next vendor update does not wash it away as a conflict.
- Implicit globals rarely come alone: search the whole file for assign-without-declare patterns before declaring — the same file had 2 in this case.
- Bundler choice is irrelevant — esbuild, rollup, same outcome — because strict-mode semantics are a language-level fact.

</InfoBox>

## Quick identification for this kind of TDZ error

Next time `Cannot access 'xxx' before initialization` shows up, two traits tell you whether it is the same species:

| Trait | This problem | Other TDZ problems |
|---|---|---|
| Failing identifier | minified short name (`Hc`, `Wt`) | business symbol (`myConfig`) |
| Timing | on interaction (dynamic import) | at module/page load |
| Static checks | all green | often caught (let/const redeclaration class) |

Left column on both rows: suspect an implicit global in a vendored classic script — search for assign-without-declare and reproduce with a direct Vitest import. The other classic ESM migration error (CJS require ESM) is covered here: [Node.js require nanoid throws ERR_REQUIRE_ESM? Alternatives after v5 went ESM-only](/blog/2026/06/12/nanoid-v5-err-require-esm-commonjs).

## FAQ

### Why does 'Cannot access before initialization' only appear at runtime when typecheck and build are green?

Static checks and bundlers never execute module code, while the ReferenceError from an implicit global assignment fires only when the module actually initializes. If the offending module sits on a dynamic import chain, the error defers to the moment of interaction — in this case, clicking the extension button, with 0 errors at build time. Importing the module directly in Vitest (jsdom) reproduces it locally with real line numbers.

### What does 'Cannot access xxx before initialization' have to do with the temporal dead zone (TDZ)?

The namespace object returned by a dynamic import stays in the temporal dead zone once its dependency module's initialization broke, so touching any export throws. The giveaway is the identifier name: a 2-letter minified name like Hc instead of a business symbol means the break happened during module graph evaluation, not in your code.

### How do I fix implicit globals in a vendored classic script?

Declare each implicit global at the top of the vendor file with var (2 in this case: ReaderArticleFinder and CandidateElement) so the assignment targets a declared binding. One line removes the whole module-graph initialization break; run a strict-mode smoke test before any new vendor file lands.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
