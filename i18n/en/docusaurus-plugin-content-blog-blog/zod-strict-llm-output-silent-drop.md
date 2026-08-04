---
title: "Zod Validation of LLM Output Failing Silently? Drop the .strict()"
description: "When you validate LLM tool_call / function call output with Zod, an extra field the model emits kills the whole call — the action is silently dropped and the user just gets 'not recognized'. Root cause: .strict() errors on unknown keys, but LLM output is uncontrollable. Fix: drop .strict(), use default strip for tolerance, pair with safeParse."
date: 2026-08-05
tags: [Zod, LLM, TypeScript, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does Zod .strict() make LLM output validation fail?"
    a: ".strict() requires an object to have no unknown keys — one extra key throws. LLM function call output is model-generated and routinely includes fields it thinks should be there, triggering an unknown key error that fails the entire validation."
  - q: "Should I use strict when validating LLM function calling output with Zod?"
    a: "Not recommended. strict suits validating clients you fully control; LLM output is uncontrollable. Drop .strict() and use the default strip (silently removes unknown keys) for better tolerance, or use .passthrough() to keep unknown keys."
  - q: "Does Zod strip or throw on unknown fields by default?"
    a: "Default is strip — silently removes unknown keys without error. .strict() makes it throw; .passthrough() keeps them. For uncontrollable LLM output, prefer default strip or passthrough over strict."
---

When you validate LLM `tool_call` / function call output with Zod, the model occasionally emits an extra field — say you only defined `amount` / `category`, and it also fills in `note` — and the whole validation fails, the action is **silently dropped**, and the user just gets "not recognized." In reality an entire `tool_call` was whole-rejected.

Encountered this while building [Life](https://life.ccleeai.com) — a natural-language bookkeeping and wellness assistant where you just talk to record entries and the AI extracts amount, category, and account. When a user said "delete that coffee from yesterday," the model slipped an extra `note: "coffee"` into the delete locator, trying to locate by remark.

## TL;DR

Zod's `.strict()` means "this object must not contain any unknown keys — one extra throws." That constraint fits validating **clients you fully control**, but LLM function call output is model-generated and inherently uncontrollable — it fills in fields it "thinks should be there," especially when multiple tools share similar schemas. One irrelevant field kills the whole `tool_call`, validation returns null, and the action is silently lost. Fix: **drop `.strict()` and use Zod's default strip (silently removes unknown keys) for tolerance**, paired with `safeParse` as a fallback.

## Symptoms

The locator schema for delete/update defines a few known fields, tightened with `.strict()`:

```typescript
import { z } from "zod";

// ❌ dangerous: with .strict()
const LocatorSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  noteContains: z.string().optional(),
}).strict();   // ← any unknown key throws

// parse the LLM's tool_call arguments
function parseToolCall(raw: unknown) {
  const parsed = LocatorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;   // ← the whole tool_call is dropped
  }
  return parsed.data;
}
```

The user says "delete that coffee from yesterday," and the model produces a reasonable but extra-fielded output:

```json
{
  "date": "yesterday",
  "noteContains": "coffee",
  "note": "coffee"
}
```

The model filled both `noteContains` (in schema) and `note` (out of schema, which it thought should exist). `.strict()` rejects the unknown key `note` outright, `parseToolCall` returns `null`, and the delete action is **silently dropped** — the user gets "not recognized" when it was actually a whole-reject.

## Root Cause

**`.strict()` changes Zod's policy on unknown keys, and LLM output naturally carries unknown keys.**

Zod `z.object()` has three policies for unknown keys:

| Form | Unknown key behavior | Suited for |
|------|---------------------|------------|
| default (strip) | silently removed | LLM output, loose external input |
| `.strict()` | **throws** (unknown key) | client APIs you fully control |
| `.passthrough()` | kept as-is | when downstream needs unknown keys |

`.strict()` is designed for "contract strictness" — the server defines which fields exist, the client should supply only those, and anything extra is a breach. That logic holds for traditional APIs because the client is developer-written and can be held to the contract.

But LLM function calling flips the premise:

1. **The output comes from model generation, not a developer-written client.** The model guesses what to fill based on the schema's description and examples; schemas reused across domains (e.g. a locator shared by budget / mood / todo) confuse it further, so it fills in fields it "thinks should be there."
2. **Wrong fields are the norm, not an exception.** The model occasionally emitting an extra `note` or omitting an optional field is expected behavior in LLM apps and shouldn't be punished by failing the whole call.
3. **The failure is silently swallowed.** After `safeParse` fails and returns null, the upstream can only vaguely say "not recognized," while the real cause (an unknown key) sits unseen in `parsed.error`.

```text
LLM output { date, noteContains, note }
                        │
                        ▼
         .strict() hits unknown key "note"
                        │
                        ▼
           safeParse → { success: false }
                        │
                        ▼
          parseToolCall returns null (action dropped)
                        │
                        ▼
       user gets "not recognized" (actually a whole-reject)
```

## Solution

### 1. Drop `.strict()`, use default strip for tolerance

```typescript
// ✅ recommended: no .strict(), Zod defaults to stripping unknown keys
const LocatorSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  noteContains: z.string().optional(),
});
// the extra "note" is silently removed; known fields parse normally
```

After dropping `.strict()`, "delete that coffee from yesterday" parses cleanly into `{ date, noteContains }`; the extra `note` is stripped and the delete action runs correctly.

### 2. If unknown keys are useful, keep them with `.passthrough()`

When the extra field actually carries semantics you want to use (e.g. the model filled `note` to express "locate by remark"), don't drop it — keep it and decide how to consume it:

```typescript
const LocatorSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  noteContains: z.string().optional(),
}).passthrough();   // keep unknown keys; parsed.data.note is still readable
```

Even better, promote it to a known field — if the model keeps filling some unknown key, the schema is missing a capability slot, so add it (here `noteContains` was added after absorbing the "locate by remark" need).

### 3. Make failures observable — don't silently return null

Regardless of policy, when `safeParse` fails, log the specific `error` instead of swallowing it into null:

```typescript
function parseToolCall(raw: unknown) {
  const parsed = LocatorSchema.safeParse(raw);
  if (!parsed.success) {
    // log Zod's concrete error (which key, what problem) for triage
    logger.warn(
      { raw, issues: parsed.error.issues },
      "locator parse failed"
    );
    return null;
  }
  return parsed.data;
}
```

Now when something goes wrong, the log has the full `issues` (including the unknown-key path), instead of an unactionable "not recognized."

After the fix, "delete that coffee from yesterday" → `delete_record { locator: { noteContains: "coffee" } }` parses correctly with no silent drop.

## Notes

<InfoBox variant="warning" title="Notes">

- **`.strict()` fits validating "clients you control," not "model-generated output."** Rule of thumb: if the data source is your own code, strict is fine; if it's model-generated, use default strip or passthrough.
- **strip loses unknown fields.** If a field carries the model's intent (like `note` in the example), use `.passthrough()` to keep it, or promote it to a known field — don't let the intent be silently deleted.
- **Always use `safeParse`, not `parse`.** `parse` throws on failure and can break the entire tool dispatch chain; `safeParse` returns a result object so failure is controllable.
- **Design LLM tool schemas with tolerance in mind.** Make fields `.optional()`, write clear descriptions, and provide few-shot examples; anticipate that the model will "over-fill / under-fill," and let the schema absorb it.

</InfoBox>

## FAQ

### Why does Zod .strict() make LLM output validation fail?

`.strict()` requires an object to have no unknown keys — one extra throws. LLM function call output is model-generated, guessing from the schema description, and routinely includes fields it thinks should be there (especially with cross-domain schemas). The moment an unknown key appears, `.strict()` fails the entire validation and drops the whole tool_call.

### Should I use strict when validating LLM function calling output with Zod?

Not recommended. `.strict()` suits validating clients you fully control (developer-written code can be held to a contract), but LLM output is uncontrollable and over/under-filling is the norm. Drop `.strict()` and use Zod's default strip (silently removes unknown keys) for better tolerance; if unknown keys carry semantics you want, use `.passthrough()` to keep them, or promote them to known fields.

### Does Zod strip or throw on unknown fields by default?

Default is strip — it silently removes unknown keys without error. `.strict()` makes it throw on unknown keys; `.passthrough()` keeps them as-is. For uncontrollable output like LLM generations, prefer default strip or passthrough over `.strict()`, which kills the whole payload over a single irrelevant field.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
