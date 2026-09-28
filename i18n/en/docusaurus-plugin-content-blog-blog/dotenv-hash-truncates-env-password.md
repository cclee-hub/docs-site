---
title: ".env password with # fails auth? dotenv truncates at #"
description: "dotenv truncates .env values at any # — auth returns 401 although the credential is valid. Fix: wrap values in double quotes, then pm2 restart --update-env."
date: 2026-09-28
tags: [dotenv, Node.js, DevOps, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I escape the # character in a .env file?"
    a: "You don't backslash-escape it — you quote the value: API_PASSWORD=\"Kx9#mPw\". Tested on dotenv 16.6.1 and 18.0.4: in unquoted values everything after # is dropped (val#hash loads as val), while inside quotes it is preserved verbatim."
  - q: "Why does my .env password with special characters not work?"
    a: "In unquoted values dotenv treats # as the start of an inline comment: val#hash loads as val, with no warning (verified on dotenv 16.6.1 and 18.0.4). Quote values containing #, then restart with pm2 restart <app> --update-env so the new value actually reaches the process."
  - q: "Does docker compose treat # the same way in env files?"
    a: "No — the rules differ. compose-spec requires inline comments in unquoted values to be preceded by a space, so VAR=B#C is kept as-is; dotenv truncates it to B regardless of position. The same file can load differently across tools — double quotes are the only consistent form."
---

After configuring .env on the server and restarting the Node.js service, every call to the upstream API fails JWT auth with 401 — while the same credentials sent directly to the upstream auth endpoint via curl return 201.

Encountered this while building an [e-commerce data collection tool](/cases/ecommerce-data-collection-tool) for a client — it batch-scrapes product images, SKUs, prices and reviews from the browser, cleans the data with Python and exports structured files for inventory management and competitor analysis. A multi-script pipeline like that leans heavily on environment variables, and one silently rewritten value stops the whole chain at the auth step.

## The symptom: JWT 401, but the credential itself is fine

The upstream API returns 401 Invalid credentials, yet the same credentials sent straight to the upstream auth endpoint return 201 — the credential is valid; what's wrong is the password value the process actually loaded. The service log shows:

```text
POST /api/v1/dag/trigger 500
upstream JWT auth failed (401): {"detail":"Invalid credentials"}
```

My first assumption was a wrong password or a disabled account. Sending the exact same credentials to the upstream auth endpoint with curl returned 201 — the account was fine. Next suspect: the deployment. Maybe the process on the server never picked up the latest .env. SSH-ing in and printing that password variable from `process.env` showed it was clearly shorter than what the .env file contained. The file held the full value; the process held a truncated one. The loss happened during dotenv parsing.

Another common cause of JWT 401s is the secret missing entirely — for example [JWT_SECRET undefined due to import order](/blog/nodejs-jwt-secret-undefined-import-order). There the value is absent altogether and the error is usually a signing error. This time the value was quietly shortened: the upstream saw half a password and reported exactly what it reports for a mistyped password. That's what makes this bug hard to find. If you searched for ".env not loading", "environment variable value wrong" or "password is correct but auth fails", it's all the same root cause.

## Root cause: dotenv treats # in unquoted values as an inline comment

When dotenv parses a .env file, an unquoted value ends at the first `#` — everything from `#` onward is discarded as an inline comment, with no warning at all. I ran the same matrix against dotenv 16.6.1 (the version pinned in the project) and 18.0.4 (current latest at the time); the results were identical:

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

- **No space needed.** In a shell, `#` only starts a comment when preceded by whitespace. dotenv doesn't care — `val#hash` with the `#` glued to the value is truncated all the same. Strong passwords from generators put `#` in arbitrary positions, which lands right on this trap.
- **Quotes are the literal switch.** Inside single or double quotes, `#` is kept as a plain character; a `#` after the closing quote still starts a comment.
- **`&` and spaces are safe.** Neither triggers truncation in dotenv — the only character that bites is `#`.

The silence is the worst part: dotenv raises no error and no warning; newer versions print a one-line injected-env summary at startup (verified on 18.0.4), but it only shows how many keys were loaded — nothing about truncation. The process runs on half a password until the upstream answers 401.

## The fix: quote the value, force-refresh the process environment

The fix is two moves: wrap values containing `#` in double quotes, then force-refresh the process environment with `--update-env`. First, the .env file:

```bash
# truncated: the process actually gets Kx9mPw
API_PASSWORD=Kx9mPw#vL2nQ7

# correct: preserved verbatim
API_PASSWORD="Kx9mPw#vL2nQ7"
```

Second, restart with `--update-env`:

```bash
pm2 restart <app> --update-env
```

That flag is not optional, because two "don't overwrite" defaults stack up:

1. PM2 snapshots the environment when a process is first started and injects that stale snapshot back into every restart;
2. dotenv does not overwrite keys that already exist in `process.env` (verified: set `process.env.X='oldvalue'`, run `dotenv.config()`, and X is still `oldvalue`).

Editing the file without refreshing the process environment changes nothing — the process keeps reading PM2's cached snapshot.

After restarting, verify what the process actually loaded instead of guessing:

```bash
# print the length and compare it against the value in .env
node -e "console.log(process.env.API_PASSWORD.length)"
```

This is exactly how the original incident was pinpointed: on the server, the password in `process.env` was shorter than what the .env file contained, and the length mismatch led straight to dotenv's parsing rules.

## Boundary cases: docker compose plays by different rules

Truncation at `#` is not a universal env-parser convention — docker compose follows the opposite rule, and the same file can load differently across tools. The compose-spec states plainly: "Inline comments for unquoted values must be preceded with a space", and its official example shows `VAR=VAL# not a comment` loading as `VAL# not a comment`, kept verbatim.

| Same line `API_PASSWORD=Kx9#mPw` | dotenv (tested) | docker compose (spec) |
|----------------------------------|-----------------|------------------------|
| Loaded value | `Kx9` | `Kx9#mPw` |

For dotenv alone, only `#` is dangerous; but one .env file often serves several tools — local shell, docker compose, PM2, CI — each with its own parser. Rather than memorizing every parser's quirks, our team settled on one hard rule: any value containing `#`, `&` or spaces gets double quotes. Two extra characters buy cross-tool predictability. Misleading error locations are a recurring theme in deployment debugging, by the way — our [npm audit warnings attributed to the wrong directory](/blog/npm-audit-multi-package-deploy-attribution) incident followed the same script: the error points at A, the cause lives in B.

<InfoBox variant="warning" title="Watch out">

- **Either avoid `#` when generating passwords, or always quote .env values** — pick one as a team and stick to it; don't mix the two.
- **Always refresh the process environment after editing .env** (`pm2 restart <app> --update-env`) and verify the loaded value's length to confirm the new value actually landed.
- **Don't generalize dotenv's rules**: env parsers differ on comment semantics (the compose counter-example above is backed by both a live test and the spec). When one file serves multiple tools, rely on quotes only.

</InfoBox>

## FAQ

### How do I escape the # character in a .env file?

You don't backslash-escape it — you quote the value: `API_PASSWORD="Kx9#mPw"`. Tested on dotenv 16.6.1 and 18.0.4: in unquoted values everything after `#` is dropped (`val#hash` loads as `val`), while inside quotes it is preserved verbatim.

### Why does my .env password with special characters not work?

In unquoted values dotenv treats `#` as the start of an inline comment: `val#hash` loads as `val`, with no warning (verified on dotenv 16.6.1 and 18.0.4). Quote values containing `#`, then restart with `pm2 restart <app> --update-env` so the new value actually reaches the process.

### Does docker compose treat # the same way in env files?

No — the rules differ. compose-spec requires inline comments in unquoted values to be preceded by a space, so `VAL=B#C` is kept as-is; dotenv truncates it to `B` regardless of position. The same file can load differently across tools — double quotes are the only consistent form.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
