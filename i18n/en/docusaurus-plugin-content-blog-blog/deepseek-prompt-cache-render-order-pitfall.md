---
title: "DeepSeek prompt cache misses? Audit your system segment"
description: "DeepSeek prompt cache stuck at 28%: render order system→tools→messages; a per-request change in system cuts the cache behind it. Reordering jittered behavior."
date: 2026-11-03
tags: [DeepSeek, LLM, Prompt Caching, Cost Optimization]
authors: [cclee]
image: "/images/blog/deepseek-prompt-cache-render-order-pitfall-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "What is DeepSeek prompt caching?"
    a: "It is the portion of your input billed at the cached rate, reported as prompt_cache_hit_tokens over prompt_tokens in the usage object. Hits cost roughly 1/50 of the miss price. At 40.8k input tokens per request with a 28% hit rate, over 70% of our input was billed at full price."
  - q: "Why is my DeepSeek cache hit rate so low?"
    a: "Most often the system segment contains per-request content. The measured render order is system→tools→messages and prefix matching is sequential, so one changing token in system cuts the ~23.7k tokens of tool definitions behind it. Move dynamic content into messages — and treat the reorder as a behavior change, because ours raised regression dirty cases from 0 to 2.25 per round."
  - q: "How long does the DeepSeek prompt cache live?"
    a: "Cache entries have a retention window and expire once a prefix goes unused, so low-traffic services see naturally lower hit rates. Confirm your traffic pattern before optimizing; beyond that, sequential prefix matching over system→tools→messages decides the outcome."
---

In a Node.js + TypeScript backend calling DeepSeek through an OpenAI-compatible endpoint for structured extraction, input costs stayed high — a single request carried 40.8k input tokens with only 28% cache hits, while cached tokens are billed at roughly 1/50 of the miss price. More than 70% of our input was paying full price.

The conventional way to build such a service is to stuff system instructions, recalled reference content, and user context into the system segment. That is exactly where the problem lives — and the problem is not DeepSeek-specific: prefix caching is standard across LLM APIs, same mechanism with vendor-specific parameters. This piece is measured on DeepSeek; a cross-provider translation table closes the article.

## TL;DR

- Measured with real requests, the render order is **system → tools → messages**, and cache matching walks that order as a sequential prefix. A single per-request-changing byte in the system segment invalidates the roughly 23.7k tokens of tool definitions behind it. The law is provider-independent — changing content goes last; only the render order differs (translation table at the end).
- Moving dynamic content into messages and putting static content first recovers the hit rate. But prompt layout is also a **behavior surface**: our purely "cache-motivated" reorder pushed output regression dirty cases from 0 to 2.25 per round; a directed A/B confirmed causality and we rolled everything back.
- Bottom line: segment order and instruction placement are not pure performance knobs. Freeze a behavioral baseline before you touch them.

## Symptoms: the bill won't drop and the hit rate is stuck at 28%

The usage object carries the cache-hit field — that is where the investigation starts, and it confirms the endpoint supports caching:

```json
{
  "usage": {
    "prompt_tokens": 40800,
    "prompt_cache_hit_tokens": 11424
  }
}
```

`prompt_cache_hit_tokens` divided by `prompt_tokens` is the hit rate. Our extraction calls carried 40.8k input tokens with the rate hovering around 28% — no sampling tweak changed it, and the cache-miss share simply refused to fall. With DeepSeek billing hits at roughly 1/50 of the miss price, raising the hit rate was the most obvious money on the table.

## Root cause: per-request content lives in the system segment

The measured render order is system → tools → messages, and cache matching walks that order as a sequential prefix — whatever sits behind the changing content loses its cache. Armed with that hypothesis, two easy suspects came first:

1. **Tool definitions too large?** They are static and byte-identical across requests, so in theory they should share a prefix — on their own they introduce no change.
2. **Endpoint lacks caching?** The usage object has `prompt_cache_hit_tokens`, and consecutive requests in the same conversation saw hits rise — the mechanism works; the prefix just keeps getting "polluted".

That left the parts of the request that actually change. Six real requests, varying one segment at a time and watching where the hit boundary landed, gave the render order:

```text
Request render order:  system  →  tools  →  messages
                                 ↑
   Prefix matching proceeds segment by segment; the break lands at the
   end of the first segment that changes. One token of change in system
   and everything behind it — tools (~23.7k tokens) and messages — is
   billed as a miss.
```

Our system segment mixed three kinds of per-request content: injected recall blocks, user context, and session state. Each one refreshed the prefix and dragged the 23.7k tokens of tool definitions down with it.

<img src="/images/blog/deepseek-prompt-cache-render-order-pitfall-architecture-en.webp" width="560" loading="lazy" />

Structured calls on DeepSeek hide another trap — [the call succeeds but returns empty](/blog/deepseek-thinking-empty-output-silent-fallback) when thinking mode consumes the output budget; worth checking while you are in there.

## The reorder experiment: cache recovered, behavior jittered

The reorder recovered the hit rate, and the behavioral regression judge rejected the whole approach. The fix itself is standard — rebuild a shared prefix:

```text
New assembly order:
  system   = static instructions + few-shot examples   ← byte-identical, shared
  tools    = tool definitions, placed first            ← prefix continues
  messages = recall blocks / user context / session state  ← all dynamic content here
```

The cache side improved as expected. Then we ran the behavioral regression — a fixed replay sample set, executed before and after the change, comparing whether outputs stayed within expected shapes:

- **Baseline before the change**: 3 replay rounds, 315 calls, 0 dirty cases;
- **After the reorder**: the same judge produced 2.25 dirty cases per round on average — fixed-format boundary sentences in the output started wobbling, sometimes present, sometimes not, for the same kind of input;
- **Suspecting test flakiness**: we ran a two-environment comparison with the old commit checked out via git worktree; the pre-change side stayed at 0, so the difference was real and caused by the change;
- **Directed A/B**: 6 boundary-sentence cases replayed on both sides flipped 0/6 → 2/6, pinning causality on the reorder;
- **Compromise variant**: keeping only the mode directive in its original position still accumulated 6 dirty cases over 3 rounds — there is no safe partial reorder.

We rolled back everything and the regression went green again. The rollback is not the end of the story: the hit-rate problem remains, and our troubleshooting notes now record what evidence a retry requires — an extract-only variant passing the full judge, plus a full probe re-run. Neither, no restart.

The arithmetic: a 1/50 hit-to-miss price ratio is tempting, but the savings have to be weighed against the debugging cost of an output-quality regression and the wobble users actually see. Before the behavioral gates are in place, that trade is not worth it.

This "every prompt-surface change must pass the behavioral gates first" process now runs continuously in production for [Life](/life), an AI money-and-mood journal — talk naturally to record expenses, with end-to-end encryption protecting privacy.

<InfoBox variant="warning" title="Caveats">

- **"Layout only, no semantic change" is an illusion.** Moving instructions is enough to change a model's output discipline; treat cache optimization as a behavior change and run it through the same regression gate.
- **Freeze the baseline first.** A fixed replay sample set with judges, executed identically before and after — without a baseline you cannot separate flakiness from regression.
- **Verify cache and behavior separately.** Cache first (same request repeatedly, watch hits rise), then behavior in its own run — never mix them in one round.
- **Cache entries have a retention window** and expire once a prefix goes unused. Low-traffic services see naturally lower hit rates; confirm your traffic pattern before optimizing.

</InfoBox>

LLM output is uncontrollable at the best of times; our notes on [silent Function Calling failures](/blog/llm-tool-calling-silent-failures) cover the same family of problems — enum drift and prompt bloat that never crash, just quietly degrade.

## Boundary: does this hold beyond DeepSeek?

The mechanism and the discipline transfer; the parameter table does not — "per-request-changing content goes last" is the only rule that survives untouched.

| | DeepSeek (measured here) | OpenAI | Anthropic | Gemini |
|---|---|---|---|---|
| Activation | automatic | automatic, ≥1024 tokens | explicit `cache_control` breakpoints, ≤4 | automatic (2.5 series+), ≥2048 tokens |
| Usage field | `prompt_cache_hit_tokens` | `prompt_tokens_details.cached_tokens` | `cache_read_input_tokens` | `usage.total_cached_tokens` |
| Hit discount | ≈1/50 (measured) | up to 90%, ≈1/10 | 1/10 | automatic savings on hits |

Three spots where blind copying bites:

- **Render order is per-provider.** The system→tools→messages order here is only measured on DeepSeek: Anthropic's docs state the cached prefix is assembled tools → system → messages, and OpenAI's structured outputs schema also renders ahead of the system message. Whichever segment renders first is the one that must stay byte-static — per-request content in the leading segment breaks everything behind it on every provider, but which segment leads differs.
- **Activation gates and breakpoints.** DeepSeek, OpenAI, and Gemini cache automatically; Anthropic requires manual breakpoints, with dynamic content placed after the last one — without a breakpoint there is nothing to hit.
- **Caching doesn't change output; reordering does.** OpenAI's and Anthropic's docs both state that output stays identical on a cache hit. No conflict with this article: what changes behavior is the reorder made to earn hits — the token sequence itself moves, and the model follows. Charge the bill to the reorder, not the cache.

## FAQ

### What is DeepSeek prompt caching?

It is the portion of your input billed at the cached rate, reported as prompt_cache_hit_tokens over prompt_tokens in the usage object. Hits cost roughly 1/50 of the miss price. At 40.8k input tokens per request with a 28% hit rate, over 70% of our input was billed at full price.

### Why is my DeepSeek cache hit rate so low?

Most often the system segment contains per-request content. The measured render order is system→tools→messages and prefix matching is sequential, so one changing token in system cuts the ~23.7k tokens of tool definitions behind it. Move dynamic content into messages — and treat the reorder as a behavior change, because ours raised regression dirty cases from 0 to 2.25 per round.

### How long does the DeepSeek prompt cache live?

Cache entries have a retention window and expire once a prefix goes unused, so low-traffic services see naturally lower hit rates. Confirm your traffic pattern before optimizing; beyond that, sequential prefix matching over system→tools→messages decides the outcome.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
