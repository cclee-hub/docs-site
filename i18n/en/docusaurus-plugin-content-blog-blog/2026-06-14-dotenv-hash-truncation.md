---
title: "dotenv silently truncates values at #? Wrap .env values in double quotes"
description: "dotenv treats # in .env values as inline comments by default. Passwords, API keys, and URLs containing # get silently truncated. Wrap values in double quotes to fix it"
date: 2026-06-14
tags: [dotenv, Node.js, env, DevOps]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does a password with # in .env get shorter?"
    a: "dotenv treats everything after # as an inline comment by default. Unquoted values like KEY=value#hash are loaded as value, with #hash dropped silently. Wrap the value in double quotes — KEY=\"value#hash\" — to preserve it."
  - q: "How do I debug dotenv not working?"
    a: "Three steps: confirm dotenv.config() runs before all imports; verify .env values have no unescaped # or spaces; then print process.env.XXX length and characters at startup and diff against the .env source file."
---

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy.

## TL;DR

dotenv treats `#` in unquoted values as an inline comment. `KEY=value#hash` is actually loaded as `value`, with `#hash` dropped — no warning, no error. **Fix: wrap any `.env` value containing `#`, spaces, or special characters in double quotes** — `KEY="value#hash"`.

## Symptom

Backend calls to an upstream service keep returning `401 Invalid credentials`:

```text
POST /api/v1/dag/trigger → 500
Stack: Airflow JWT auth failed (401): {"detail":"Invalid credentials"}
  at getJwtToken (airflow-client.ts)
```

Investigation shows the password written in `.env` is 24 chars and contains `#` and `&`:

```bash
AIRFLOW_PASSWORD=ooGR0^kThVI&ag#RyCpUmbIr
```

But the value loaded into `process.env.AIRFLOW_PASSWORD` is only 10 chars long — `#RyCpUmbIr` is gone. Calling the upstream auth endpoint with the full password from CLAUDE.md returns `201`; calling it with the truncated value from `.env` returns `401`. **The credentials are fine; the value loaded from .env is truncated.**

## Root Cause

dotenv follows shell convention: anything after `#` in an unquoted value is treated as an inline comment.

```bash
# .env
AIRFLOW_PASSWORD=ooGR0^kThVI&ag#RyCpUmbIr
# dotenv actually parses:
#   AIRFLOW_PASSWORD = "ooGR0^kThVI&ag"
#   #RyCpUmbIr       ← dropped
```

This behavior is documented, but **there is no warning or log**. What the runtime gets is a silently truncated string. Combined with shell-escaping semantics for `&`, spaces, and `$`, the bug is even more hidden:

| Character | Behavior when unquoted |
|-----------|------------------------|
| `#` | Everything after is treated as inline comment, truncated |
| ` ` (space) | Everything after is dropped |
| `$VAR` | Triggers variable expansion (may resolve to empty string) |
| `&` | Shell background operator; dotenv usually preserves it but it bites again when joined into shell commands |

Strong-random strings like `JWT_SECRET`, `API_KEY`, and `DATABASE_URL` frequently contain `#` — high-risk territory.

## Solution

Wrap any value with special characters in double quotes in `.env`:

```bash
# .env
AIRFLOW_PASSWORD="ooGR0^kThVI&ag#RyCpUmbIr"
JWT_SECRET="abc#def$ghi jkl"
DATABASE_URL="postgres://user:p@ss#word@host:5432/db"
```

Restart the service to apply:

```bash
# pm2
pm2 restart analytics-api --update-env

# docker compose
docker compose restart api

# systemd
sudo systemctl restart api
```

**Why it works**: when dotenv sees double quotes, it reads the value literally up to the closing quote. `#`, spaces, and `$` are not special-cased (unless you explicitly enable `expand`). Verify the loaded value immediately after the fix:

```ts
// Validate critical env vars at startup to catch truncation early
const required = ['AIRFLOW_PASSWORD', 'JWT_SECRET', 'DATABASE_URL'] as const;
for (const key of required) {
  const v = process.env[key];
  if (!v || v.length < 16) {
    throw new Error(`${key} not loaded correctly (length ${v?.length ?? 0}); check .env quoting`);
  }
}
```

This turns dotenv's silent failure into a startup failure, exposing the bug immediately the next time.

<InfoBox variant="warning" title="Caveats">

- **Single quotes also work**, but dotenv does not expand `$VAR` inside single quotes — it does inside double quotes. For passwords you usually want literal values: prefer **double quotes + avoid writing `${...}`**.
- **dotenv versions**: v15+ behaves as described; earlier versions (pre-v8) handle `#` slightly differently. Check the CHANGELOG before upgrading.
- **Docker / Kubernetes Secrets**: variables injected via `environment:` don't go through dotenv and aren't affected. Only `.env` files and `dotenv.config()` paths are.
- **CI environments**: GitHub Actions and GitLab CI inject secrets into the `env` context, also bypassing dotenv.

</InfoBox>

## FAQ

### Why does a password with # in .env get shorter?

dotenv treats everything after `#` as an inline comment by default and drops it. Unquoted `KEY=value#hash` is loaded as just `value`, with no error or log. Wrap the value in double quotes — `KEY="value#hash"` — to preserve the full content.

### How do I debug dotenv not working?

Three steps: first confirm `dotenv.config()` runs before all `imports` (ES Module imports are hoisted statically — see [debugging silent JWT signature failures](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order)); then verify `.env` values have no unescaped `#` or spaces; finally print `process.env.XXX` length and characters at startup and diff them char-by-char against the `.env` source file.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
