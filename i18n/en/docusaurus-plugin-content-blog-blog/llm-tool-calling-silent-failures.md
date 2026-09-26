---
title: "LLM Tool Calls Fail Silently? Enum Drift and Prompt Bloat"
description: "LLM function calling failures: enum drift rejects schema-legal values; prompt bloat doubles bad-JSON rates (6% → 28%). Fix: shared enums, per-item checks."
date: 2026-09-26
tags: [LLM, Function Calling, Zod, Debugging]
authors: [cclee]
image: "/images/blog/llm-tool-calling-silent-failures-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "How does LLM tool calling work?"
    a: "The model never runs anything: it returns a tool name plus a JSON payload that must match the tool's JSON Schema, and your server does the validation and execution. The definition you send and the validator you run are two separate pieces of code — both failure modes in this post (enum drift voiding a whole candidate card, bad-JSON rate jumping from ~6% to 12-28%) live in that mismatch."
  - q: "Why is my function calling JSON rejected even though it looks valid?"
    a: "Because the enum in your tool definition and the enum in your server-side validator are separate hand-written copies. When they drift, the model emits a definition-legal value and your array-level check (a min(2) on the candidates array, in our case) rejects the entire call — one invalid element fails the whole array under zod-style validation. Fix it with a single shared constant plus per-item filtering."
  - q: "How do I make LLM tool calling more reliable?"
    a: "Three rules from our production A/B tests: single-source every paired enum; validate arrays per item so one bad candidate doesn't void the whole card; keep prompt teaching at the routing level instead of forcing full argument payloads. Our measured bad-JSON rate jumped from ~6% to 12-28% when we forced complete arguments, and fell back to the baseline after reverting."
---

While sending a batch backfill request to our bookkeeping assistant in production, the model returned a tool call with valid JSON — and nothing happened. The user just saw a generic "didn't catch that" line.

I hit this while building [Life, an AI bookkeeping assistant](/life) — you talk naturally, and the AI extracts amounts, categories, and accounts. The debugging session turned up two structural problems that both fail silently, so I'm writing them up as two scenarios.

## TL;DR

- **Scenario 1**: the enum in our tool definition and the enum in our server-side validator were two hand-written copies that had drifted. The model emitted a value that was legal per the definition and the validator rejected it; because the count check lived at the array level, one invalid candidate voided the whole card. Fix: single-source the enum, then validate per item.
- **Scenario 2**: to reduce dead-end candidates, we taught the model "every candidate must carry complete arguments." The teaching made outputs longer, and the small model's bad-JSON rate rose from ~6% to 12-28%. Fix: revert the teaching, relax the validation, and let a downstream deterministic guard catch missing arguments.
- Two rules: **paired enums must reference one shared constant**; **teach routing, not argument extraction**.

## Two sides: the model sees the definition, your code runs the validator

In function calling, the tool definition and the parameter validation are two separate pieces of code, and the model only ever sees the first one — every silent failure in this post lives in the mismatch between them.

The model never executes anything. Each call, your server sends tool definitions (JSON Schema format) to the model; the model returns a tool name plus an arguments JSON; your code validates it before executing. This means any "set of legal values" exists in at least two places: in the definition sent to the model, and in your validation code.

"Silent failure" here means: no API error, a tool call comes back, the arguments look like valid JSON — but the feature doesn't run. In other words, the tool call never takes effect, or the feature fails intermittently. The user sees a generic fallback message; the details sit in server logs. Without log instrumentation, this kind of failure can live in production for a long time.

![Before/after flow of two silent LLM tool-calling failures](/images/blog/llm-tool-calling-silent-failures-architecture-en.webp)

## Scenario 1: the model emitted a schema-legal enum value — why did the whole card get rejected?

When the enum in the tool definition and the server-side validation enum aren't the same constant, a "legal" value emitted from the definition side is guaranteed to be rejected by the validation side — and an array-level count check amplifies one invalid item into a fully voided card.

### The symptom: a failure chain visible only in logs

Our routing model has a family of disambiguation tools: when the user's input is ambiguous, the model doesn't execute directly — it calls a meta-tool that outputs 2-4 candidate intents, which we render as tappable cards. Each candidate carries a `tool` field whose value must be a real action tool name.

One day, production logs showed a routing failure: the user said "please backfill the missing dates in batch", the model did call the disambiguation tool, and `arguments` was valid JSON — but the whole candidate card was judged invalid, and the user got the fallback line. The confusing part was the contrast: by round six of rephrasing, the same request routed fine. That ruled out "the model is hallucinating" and pointed at a deterministic failure triggered by one specific value.

### Root cause: two hand-written enums, plus a count check at the array level

Digging in found two compounding causes.

**Cause one: enum drift.** In the tool definition, the candidates' `tool` enum used the full set of tool names. The server-side validation enum, however, was the full set minus one batch-split tool reserved for an image-only pipeline — that tool must never be nominated by the text path, because nominating it would bypass the image pipeline's dedicated contract. The two sets were written in two places, maintained separately:

```ts
// Definition side: JSON Schema sent to the model (before the fix)
tool: { type: 'string', enum: [...ALL_TOOLS] }  // full set

// Validation side: server-side zod (before the fix, a separate hand-written copy)
const ALLOWED = ALL_TOOLS.filter((t) => t !== 'batch_split')  // subset
tool: z.enum(ALLOWED)
```

The spec the model saw said `batch_split` was legal, so it dutifully used it; the validator disagreed. **The model followed your schema and got rejected by your own validation** — this isn't a model error, it's the two sides telling different stories.

**Cause two: array-level validation voids the whole card.** The candidate count constraint sat on the array:

```ts
options: z.array(OptionSchema).min(2).max(4)
```

Zod validates every element of the array, and any single failure fails the entire array. So one invalid candidate (that `batch_split`) dragged down the whole card — three perfectly valid candidates buried with it. The upper layer only had a fallback line; the truth stayed in the logs.

### The fix: single-source the enum, then tolerate per item

Step one, make both sides reference the same constant (a one-line fix):

```ts
const DISAMBIGUABLE_TOOLS = ALL_TOOLS.filter((t) => t !== 'batch_split')

// Definition side
tool: { type: 'string', enum: [...DISAMBIGUABLE_TOOLS] }
// Validation side
tool: z.enum(DISAMBIGUABLE_TOOLS)
```

Step two, turn "one bad element voids the array" into "a bad element only drops itself": run a per-item check inside a preprocess, drop invalid items with a log line, and apply the count floor after filtering:

```ts
import { z } from 'zod'

const OptionSchema = z.object({
  tool: z.enum(DISAMBIGUABLE_TOOLS),
  label: z.string().min(1).max(30),
  args: z.record(z.unknown()).optional(),
})

// Per-item tolerance: invalid candidates are dropped, not propagated; every drop is logged
function filterOptions(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw
  return raw.filter((item) => OptionSchema.safeParse(item).success)
}

const ArgsSchema = z.object({
  // min becomes a "post-filter" floor: only an emptied array rejects the whole card
  options: z.preprocess(filterOptions, z.array(OptionSchema).min(1).max(4)),
})
```

One boundary to be explicit about: per-item tolerance silently discards invalid candidates, so every drop must emit a warn log — otherwise bad candidates vanish without a trace and your observability goes blind. Also note `min` now means "post-filter floor": the card is only rejected when every candidate was dropped, and at that point there's genuinely nothing to render, so falling back is correct.

This "one extra field/value sinks the whole output" problem is a sibling of [Zod .strict() silently failing on LLM output](/blog/zod-strict-llm-output-silent-drop): strict validation is right for fully-controlled client input; for model output, tolerance has to go down to the item level.

## Scenario 2: after adding "arguments required" teaching, bad-JSON rate went from 6% to 12-28%

For payload-length-sensitive meta-tools, teaching that forces complete arguments makes outputs longer and directly inflates the small model's bad-JSON rate — an A/B test on the same cases measured ~6% rising to 12-28%.

### A reasonable-looking teaching

After scenario one was fixed, we found a follow-up annoyance: some candidates reached the card, and only after tapping did the user discover required arguments were missing, costing another round trip. So we naturally added a teaching — "every candidate's args must carry all required arguments for that tool; never nominate a candidate you can't pre-fill completely" — injected in three places at once: a rule in the system prompt, the argument description in the tool definition, and the note on a few-shot example.

```ts
// Few-shot example (the teaching we later reverted)
{
  input: 'delete it',
  tool: 'suggest_options',
  note: 'ambiguous reference → disambiguate; every candidate\'s args must carry all required
         arguments for that tool (e.g. delete_record needs domain); never nominate a candidate
         you cannot pre-fill completely',
}
```

### The symptom: the eval gate went red three runs in a row

We run an eval gate: a fixed set of routing cases, re-run in batch after every change; failure rate over threshold means red. After the teaching shipped, the gate failed three consecutive runs, and the failure shape was highly consistent — every failure was a **JSON format error** on the disambiguation tool call (truncation, extra closing brackets), not a validation rejection; frequency climbed from 2 to 5 per run.

### Attribution: an old-build A/B pinned the variable down

The first suspicion was "the teaching text itself misleads the model." But to actually conclude that, we ran a controlled experiment: old build vs new build, the same 4 cases, 16 runs each, counting the malformed-JSON rate.

| Build | Bad-JSON rate |
|-------|---------------|
| Old build (no args-required teaching) | ~6% (1 of 16; the full gate also flaked 1 case) |
| New build (teaching in three places) | 12-28% |

That single 6% case deserves a note: the old build also flaked occasionally on the full gate — that's the small model's baseline noise, not something the change introduced. The real signal is the jump from 6% to 12-28%: **the teaching made every candidate carry full arguments, the disambiguation tool's outputs got significantly longer, and the small model's JSON format error rate amplifies with longer outputs**. You cannot see this relationship from a single red/green run.

### The fix: revert the teaching, relax validation, guard downstream

The ruling had three parts:

1. **Strip the args-required teaching from all three places**; the few-shot examples teach routing direction only (which inputs go to disambiguation, which candidates to converge on), not argument extraction.
2. **Relax validation to "only validate candidates that carry args"**: if a candidate includes args, pre-validate them with that tool's own schema — invalid values still get dropped; missing args are tolerated on the card.
3. **Let a downstream deterministic exit catch missing arguments**: when the user taps a candidate with missing args, the server returns 422 with guiding text, the original card stays, and the user supplies the missing piece in one message.

```ts
// Same-ruler validation only for candidates that carry args: invalid values still dropped, missing tolerated
if (option.args !== undefined && !parseToolCall(option.tool, JSON.stringify(option.args))) {
  dropped.push(option.tool)  // drop + warn log
  continue
}
```

Why is it safe to let missing args onto the card? Because the downstream guard is deterministic — it doesn't rely on the model's good behavior, it's a fixed branch in server code. Once code catches the problem the teaching tried to prevent, the teaching is all cost (longer outputs, higher bad-JSON rate). This is the same family as thinking-mode consuming the output budget and returning empty content: small models' structured output is sensitive to payload length. For another silent failure of that kind, see [DeepSeek/Qwen structured calls returning empty](/blog/deepseek-thinking-empty-output-silent-fallback).

## Two rules to keep

LLM tool-calling reliability comes down to two rules: paired enums must reference a single shared constant, and prompt teaching should cover routing direction only — never argument extraction.

**Rule one: paired enums must reference a single shared constant.** Anywhere a set of legal values appears both in "the definition sent to the model" and in "server-side validation", writing the two copies by hand is forbidden — expand both from one constant. The same holds for any paired constraint (field lists, count limits), not just enums.

**Rule two: teach routing, not extraction; decide teaching with old-build A/Bs.** Every line of teaching adds output length, and small models' format-error rate climbs with length. Routing direction (which input goes to which tool) is cheap guidance worth teaching; argument completeness, catchable by deterministic validation, belongs in code — not in the prompt. And when judging whether a teaching should stay, don't conclude from a single red/green run — run old and new builds against the same cases a dozen-plus times each and look for the jump in bad-JSON rate.

<InfoBox variant="warning" title="Watch out">

Per-item tolerance isn't free: every drop must be logged (we emit a warn carrying the dropped tool name), otherwise invalid candidates disappear silently and observability goes blind. Likewise, document the "post-filter floor" semantics of min in a code comment — if a future maintainer restores the min value as a raw count constraint, the whole-card validation regresses and scenario one's symptom returns as-is.

</InfoBox>

## FAQ

### How does LLM tool calling work?

The model never runs anything: it returns a tool name plus a JSON payload that must match the tool's JSON Schema, and your server does the validation and execution. The definition you send and the validator you run are two separate pieces of code — both failure modes in this post (enum drift voiding a whole candidate card, bad-JSON rate jumping from ~6% to 12-28%) live in that mismatch.

### Why is my function calling JSON rejected even though it looks valid?

Because the enum in your tool definition and the enum in your server-side validator are separate hand-written copies. When they drift, the model emits a definition-legal value and your array-level check (a min(2) on the candidates array, in our case) rejects the entire call — one invalid element fails the whole array under zod-style validation. Fix it with a single shared constant plus per-item filtering.

### How do I make LLM tool calling more reliable?

Three rules from our production A/B tests: single-source every paired enum; validate arrays per item so one bad candidate doesn't void the whole card; keep prompt teaching at the routing level instead of forcing full argument payloads. Our measured bad-JSON rate jumped from ~6% to 12-28% when we forced complete arguments, and fell back to the baseline after reverting.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
