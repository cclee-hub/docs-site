---
title: "DeepSeek/Qwen Structured Calls Succeed but Return Empty? Disable Thinking Before It Burns Your Token Budget"
description: "Thinking-capable DeepSeek/Qwen models share max_tokens between reasoning and content: reasoning fills the budget, content comes back empty, and silent parse-retry loops degrade everything. Disable thinking explicitly for structured-output calls — and check finish_reason first."
date: 2026-08-28
tags: [DeepSeek, LLM, Python, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I disable thinking output in DeepSeek?"
    a: "Pass thinking type disabled via extra_body on the OpenAI-compatible API; Qwen uses enable_thinking False. Structured small-output calls like boolean judgments and JSON extraction don't need a reasoning chain — turn it off by default."
  - q: "Why does my DeepSeek API call succeed but return empty content?"
    a: "Reasoning and content share the same max_tokens budget. When reasoning exhausts it, finish_reason returns length and content is empty, with no exception thrown. Disable thinking or raise max_tokens, and check finish_reason before exception logs."
---

While running batch LLM semantic validation over production data, all 2,449 calls "succeeded" — yet every single result fell back to the default value, and the logs contained almost no failures.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analysis that surfaces market trends, user behavior, and sales insights to drive precise operations strategy. The product title optimization pipeline asks an LLM to semantically validate "keyword × product" pairs: one call per keyword batch, returning a tiny JSON judgment. This should be the simplest kind of LLM call — yet on the first production run, all 2,449 pairs silently fell back, and the validation layer produced zero effective LLM judgments.

## TL;DR

Thinking-capable models like DeepSeek and Qwen share a single `max_tokens` budget between **reasoning text and final content**. If structured small-output calls don't explicitly disable thinking, the reasoning chain eats the entire budget on its own: `finish_reason` becomes `length`, `content` comes back empty — and since the parse-retry loop only logs exceptions, the silent retries exhaust and degrade the whole batch without a single error. Two things to do: **disable thinking explicitly for structured calls**, and **log `finish_reason` on parse failure** instead of only catching exceptions.

## The Symptom

This minimal reproduction shows the whole process (requires `pip install openai` and a thinking-capable model):

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
)

resp = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {
            "role": "user",
            "content": (
                '判断下面的关键词是否适合写入商品标题，'
                '只返回 JSON：{"suitable": true} 或 {"suitable": false}。\n'
                "关键词：summer women dress\n"
                "商品：floral midi dress for women"
            ),
        }
    ],
    max_tokens=2000,  # reasoning and content share this budget
)

print("finish_reason:", resp.choices[0].finish_reason)
print("content:", repr(resp.choices[0].message.content))
```

Typical output with thinking enabled:

```text
finish_reason: length
content: ''
```

Everything looks fine at the HTTP layer: no timeout, no 5xx, no SDK exception. If the outer layer is a "retry on parse failure, fall back after retries exhaust" loop, the logs end up with a single "retries exhausted" warning — which reads exactly like an intermittent network problem.

## Root Cause

**Thinking models don't budget reasoning separately.** In DeepSeek, Qwen and similar models, reasoning content and final content share the same `max_tokens` ceiling — there is no independent "reasoning budget" field.

**Structured small-output calls tend to use small budgets.** A boolean judgment is expected to produce a few dozen tokens, so `max_tokens=2000` looks generous — but the reasoning chain's length is completely uncontrolled. Once it consumes all 2,000 tokens, the model never gets a chance to emit the actual answer: `finish_reason` returns `length`, `content` is an empty string, yet the API returns 200 normally.

**There's also an amplifier on the engineering side.** An empty string is not valid JSON, but many retry loops only catch network and API exceptions, treating parse failure as "no result this round" and retrying silently. This kind of [exception-swallowing silent failure](/blog/python-try-except-swallow-exception-silent-failure) is notoriously hard to diagnose inside retry loops: all N retries fail for the same root cause, yet the log shows only the final fallback warning — easy to misread as network flakiness.

## The Fix

### Step 1: Explicitly disable thinking for structured-output calls

Boolean judgments, JSON extraction, and classification calls don't need multi-step reasoning. Disable thinking per provider:

```python
def thinking_disabled_extra_body(provider: str) -> dict:
    """Structured small-output calls: disable thinking explicitly per provider."""
    if provider == "deepseek":
        return {"thinking": {"type": "disabled"}}
    if provider == "qwen":
        return {"enable_thinking": False}
    return {}


resp = client.chat.completions.create(
    model=model_name,
    messages=messages,
    max_tokens=2000,
    extra_body=thinking_disabled_extra_body("deepseek"),
)
```

With thinking off, the entire 2,000-token budget goes to the JSON judgment itself. After the fix, rerunning the batch returned valid judgments for all 2,449 keyword×product pairs — before the fix, the whole batch silently degraded, leaving just 3 "retries exhausted" warnings in the logs.

### Step 2: Don't let parse failures go silent

Even with thinking disabled, turn "parse failure" into an evidence-bearing log line, so next time an empty output occurs — for any reason — a single log line locates it:

```python
import json
import logging

logger = logging.getLogger(__name__)


def parse_judgment(resp) -> dict | None:
    content = resp.choices[0].message.content
    try:
        return json.loads(content)
    except (TypeError, json.JSONDecodeError):
        # Key: log finish_reason and raw content, not just exceptions
        logger.warning(
            "LLM output parse failed: finish_reason=%s content=%r",
            resp.choices[0].finish_reason,
            content,
        )
        return None
```

When debugging LLM degradation, check `finish_reason` first: `length` means the output budget was exhausted (most likely by reasoning), while `stop` means normal completion. This is far more effective than scrolling exception logs.

If your returned JSON also passes through schema validation and you use Zod in a TypeScript project, watch out for this related pitfall: [Zod schema validation silently dropping LLM output](/blog/zod-strict-llm-output-silent-drop).

<InfoBox variant="warning" title="Heads up">
The parameter to disable thinking is not standardized across providers: DeepSeek uses `{"thinking": {"type": "disabled"}}`, Qwen uses `{"enable_thinking": False}`, and OpenAI's o-series uses `reasoning_effort`-style parameters. Check each provider's docs before integrating — don't assume the parameter is universal.

If a provider's thinking cannot be disabled, you must raise `max_tokens` based on measured reasoning length — otherwise the same silent degradation will happen again.
</InfoBox>

## FAQ

### How do I disable thinking output in DeepSeek?

On the OpenAI-compatible API, pass `{"thinking": {"type": "disabled"}}` via `extra_body`; Qwen uses `{"enable_thinking": False}`. Structured small-output calls like boolean judgments and JSON extraction don't need a reasoning chain — turn it off by default so the entire budget goes to the actual answer.

### Why does my DeepSeek API call succeed but return empty content?

Thinking models share `max_tokens` between reasoning and content. When reasoning exhausts the budget, `finish_reason` returns `length` and `content` is empty — with no exception thrown. Disable thinking or raise `max_tokens` based on measured reasoning length, and check `finish_reason` before digging through exception logs.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
