---
title: "dotenv truncates .env values at #? Quote and force-refresh"
description: "dotenv silently drops everything after any # in unquoted .env values. Tested on 16.6.1 and 18.0.4: double quotes fix it, PM2 restarts need --update-env."
date: 2026-06-14
tags: [dotenv, Node.js, env, DevOps]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does a password with # in .env get shorter?"
    a: "dotenv treats any # in unquoted values as an inline comment and drops everything after it — KEY=value#hash loads as value, with no warning (verified on dotenv 16.6.1 and 18.0.4). Wrap the whole value in double quotes to preserve it."
  - q: "How do I debug dotenv not working?"
    a: "Three steps: confirm dotenv.config() runs before all imports; check .env values for unquoted #; then print process.env.XXX and diff its length against the .env source — a mismatch means truncation, not a missing load."
  - q: "Does docker compose treat # the same way in env files?"
    a: "No — the rules differ. compose-spec requires inline comments in unquoted values to be preceded by a space, so VAR=B#C is kept as-is; dotenv truncates it to B regardless of position. Double quotes are the only form consistent across tools."
---

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy.

## TL;DR

dotenv treats any `#` in unquoted values as an inline comment. `KEY=value#hash` is actually loaded as `value`, with `#hash` dropped — no warning, no error. **The fix has two steps: wrap any `.env` value containing `#` in double quotes, then run `pm2 restart <app> --update-env` to force-refresh the process environment** — without the refresh the edit changes nothing, because PM2 re-injects its cached snapshot into the new process.

## Symptom

Backend calls to an upstream service keep returning `401 Invalid credentials`:

```text
POST /api/v1/dag/trigger → 500
Stack: Airflow JWT auth failed (401): {"detail":"Invalid credentials"}
  at getJwtToken (airflow-client.ts)
```

My first assumption was a wrong password or a disabled account. Investigation shows the password written in `.env` is 24 chars and contains `#` and `&`:

```bash
AIRFLOW_PASSWORD=Aq7#mZx&V3nKp9RtWu2yBc4d
```

But the value loaded into `process.env.AIRFLOW_PASSWORD` is only 3 chars long — the 21 characters after `#` are gone. Calling the upstream auth endpoint with the full password via curl returns `201`; calling it with the truncated value parsed from `.env` returns `401`. **The credential is fine; the value loaded from .env is truncated.** If you searched for ".env not loading", "environment variable value wrong" or "password is correct but auth fails", it's all the same root cause.

## Root cause: dotenv treats any # in unquoted values as an inline comment

When dotenv parses a .env file, an unquoted value ends at the first `#` — everything from `#` onward is discarded as an inline comment, with no warning at all. This behavior is documented, but the **silence** is what makes it nasty — no error, no warning; newer versions print a one-line injected-env summary at startup (verified on 18.0.4), but it only shows how many keys were loaded.

I ran the same parse matrix against dotenv 16.6.1 (the version pinned in the project) and 18.0.4 (current latest at the time); the results were identical:

| .env syntax | Loaded value |
|-------------|--------------|
| `A=val#hash` | `val` |
| `B=val #hash` | `val` |
| `C="val#hash"` | `val#hash` |
| `H='val#hash'` | `val#hash` |
| `D=val&more` | `val&more` |
| `E=val with space` | `val with space` |
| `I="val" # comment` | `val` |

Three things stand out:

- **No space needed.** In a shell, `#` only starts a comment when preceded by whitespace. dotenv doesn't care — `val#hash` with the `#` glued to the value is truncated all the same. Strong-random strings like `JWT_SECRET`, `API_KEY`, and `DATABASE_URL` frequently contain `#` in arbitrary positions — high-risk territory.
- **Quotes are the literal switch.** Inside single or double quotes, `#` is kept as a plain character; a `#` after the closing quote still starts a comment.
- **`&` and spaces are safe in dotenv.** Neither triggers truncation in the tests, and core dotenv does not expand `$VAR` (that's the dotenv-expand plugin's job).

## The fix: quote the value, force-refresh the process environment

First, wrap any value containing `#` in double quotes:

```bash
# truncated: the process actually gets Aq7
AIRFLOW_PASSWORD=Aq7#mZx&V3nKp9RtWu2yBc4d

# correct: preserved verbatim
AIRFLOW_PASSWORD="Aq7#mZx&V3nKp9RtWu2yBc4d"
```

Second, restart with `--update-env`:

```bash
pm2 restart analytics-api --update-env
```

That flag is not optional, because two "don't overwrite" defaults stack up:

1. PM2 snapshots the environment when a process is first started and injects that stale snapshot back into every restart;
2. dotenv does not overwrite keys that already exist in `process.env` (verified: set `process.env.X='oldvalue'`, run `dotenv.config()`, and X is still `oldvalue`).

Editing the file without refreshing the process environment changes nothing — the process keeps reading PM2's cached snapshot. The same applies to docker compose and systemd: the service must actually rebuild its environment (`docker compose up -d --force-recreate`, `systemctl restart`).

After restarting, verify what the process actually loaded instead of guessing:

```bash
# print the length and compare it against the value in .env
node -e "console.log(process.env.AIRFLOW_PASSWORD.length)"
```

To go one step further, validate critical variable lengths at startup so a silent failure becomes a startup failure:

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

## Boundary cases: docker compose plays by different rules

Truncation at `#` is not a universal env-parser convention — docker compose follows the opposite rule, and the same file can load differently across tools. The compose-spec states plainly: "Inline comments for unquoted values must be preceded with a space", and its official example shows `VAR=VAL# not a comment` loading as `VAL# not a comment`, kept verbatim.

| Same line `API_PASSWORD=Kx9#mPw` | dotenv (tested) | docker compose (spec) |
|----------------------------------|-----------------|------------------------|
| Loaded value | `Kx9` | `Kx9#mPw` |

For dotenv alone, only `#` is dangerous; but one .env file often serves several tools — local shell, docker compose, PM2, CI — each with its own parser. Rather than memorizing every parser's quirks, our team settled on one hard rule: any value containing `#`, `&` or spaces gets double quotes. Two extra characters buy cross-tool predictability.

<InfoBox variant="warning" title="Watch out">

- **Double quotes + no `${...}`**: for passwords you usually want the literal value — write it plainly inside double quotes.
- **Don't generalize dotenv's rules**: compose requires a space before inline comments (see table above). When one file serves multiple tools, rely on quotes only.
- **Container injection is not affected**: variables injected via `environment:` in Docker/Kubernetes don't go through dotenv; CI secrets (GitHub Actions, GitLab CI) injected into the env context bypass dotenv too. Only the `.env` file + `dotenv.config()` path is affected.

</InfoBox>

## FAQ

### Why does a password with # in .env get shorter?

dotenv treats any `#` in unquoted values as an inline comment and drops everything after it — `KEY=value#hash` loads as `value`, with no warning (verified on dotenv 16.6.1 and 18.0.4). Wrap the whole value in double quotes to preserve it.

### How do I debug dotenv not working?

Three steps: first confirm `dotenv.config()` runs before all `imports` (ES Module imports are hoisted statically — see [debugging silent JWT signature failures](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order)); then check `.env` values for unquoted `#`; finally print `process.env.XXX` and diff its length against the `.env` source file — a mismatch means truncation, not a missing load.

### Does docker compose treat # the same way in env files?

No — the rules differ. compose-spec requires inline comments in unquoted values to be preceded by a space, so `VAL=B#C` is kept as-is; dotenv truncates it to `B` regardless of position. Double quotes are the only form consistent across tools.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
