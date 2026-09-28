---
title: ".env Edits Do Nothing? DB Config Overrides Env Variables"
description: "Apps with an admin config UI let the database override .env by design. Watch a real detour: /proc/pid/environ can't show dotenv's runtime injection."
date: 2026-09-28
tags: [Configuration, dotenv, Environment Variables, Python, Troubleshooting]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What is the config precedence between database and environment variables?"
    a: "In apps with an admin config UI, from lowest to highest: system-level env vars → process startup env → dotenv-injected values → the app's runtime config store (a DB or config file). The DB layer wins — UI edits must take effect immediately, which is impossible if .env outranks it. When troubleshooting, check the app's config store before the env files and you skip most of the detour."
  - q: "Do environment variable changes require a restart?"
    a: "By layer: system-level variables need a shell or service restart; dotenv reads .env once at process start, so file edits need a process restart too; apps with a DB config layer pick up backend edits instantly — the loader reads the DB on every client build. Mixing the three timing models is how you end up concluding 'changes do nothing'."
  - q: "Why can't I see dotenv variables in /proc/pid/environ?"
    a: "Because /proc/pid/environ is a snapshot from the instant the process started, while dotenv injects into os.environ after the process is already running. To verify dotenv's values, print them inside the process or read the .env file directly — and remember that a value being in the file still doesn't mean it's in effect; a higher-precedence layer may be overriding it."
---

An AI model config in `.env` was changed — provider, key, and model name all swapped. Service restarted. The application's behavior did not move by an inch: still the old provider, the old model. The new config sits right there in the file, looking ready to apply at any moment. It never does.

> Encountered this while maintaining a client-delivered AI content-processing application — recording the detour and the final diagnosis.

## TL;DR

**When an app supports editing config through an admin UI, the database fully overrides `.env` — same-named entries in `.env` are a fallback at best, dead config at worst.**

One sentence for the triage order: **check the app's runtime config store (the DB config table) before checking `.env`**. This investigation wasted two steps on `.env` and the process environment snapshot before the DB config table revealed the truth: it held a complete set of values from a different provider, shadowing `.env` in full.

## Symptoms

The server's `.env`:

```bash
# /path/to/backend/.env — looks "in use"
AI_API_KEY=sk-xxxx...xxxx
AI_BASE_URL=https://old-provider-compatible-endpoint
AI_MODEL=old-model-name
```

Actual behavior: model calls go to **a different provider entirely** (a real OpenAI-protocol endpoint, different key, different model). Edit `.env`, restart, no effect. Edit again, restart again, still no effect.

## The Detour: Two Checks That Paid Nothing

The investigation itself is worth recording — two checks that looked professional and accomplished nothing.

**Detour 1: staring at the `.env` file.** The config was complete, well-formatted, in the right directory (the systemd unit genuinely points there). Everything about it says "in use". But **a config being in a file and a config being in effect are different things** — the app's loader has a precedence chain, and `.env` is only one candidate source.

**Detour 2: checking `/proc/<pid>/environ`.** The standard move to see what environment a process actually received:

```bash
cat /proc/<pid>/environ | tr '\0' '\n' | grep AI_
```

Empty. And the check itself was flawed: **dotenv injects into `os.environ` at runtime, after the process started — `/proc/<pid>/environ` is a snapshot from launch time and can never show dotenv-injected values.** Absence here proves nothing about the process, and presence here proves nothing about effectiveness. For a dotenv app, this snapshot supports no conclusion in either direction.

**The third step finally landed: querying the DB config table.** The app supports editing AI config through an admin UI, and its loader is "DB first, env as fallback" — the DB config table held a full set of the other provider's values, outranking `.env`. Case closed.

## Root Cause: A Config UI Requires DB > env

Why must this class of app rank DB above env? Reverse-engineer from the feature requirement:

The app promises "admin edits AI config in the backend; it applies on save". If `.env` outranked the DB, every UI edit would be crushed by `.env` and the feature would be dead on arrival. So any app with this feature has a loader shaped like:

```python
def _ensure_client():
    cfg = load_db_config()          # 1. DB config table first
    if cfg is None:                 # 2. fall back to env only when DB is empty
        cfg = from_env()
    return build_client(cfg)
```

DB wins whenever it has values — and the moment anyone saves a config in the backend once, the DB has values forever. **From that day on, `.env` is dead config**: nothing written there gets read, unless the DB config is cleared.

The trap is its **invisibility**: `.env` sits right there on the server, complete and tidy, and the natural operator reflex is "edit this". Nothing ever warns "your edit was overridden by the DB" — the config system silently follows its precedence chain, and only someone who knows the chain can predict the outcome.

## The Fix: Check the DB First, Then Clean Up

**Step 1: confirm the real source of effective config.** Query the app's config table (an `app_config`-style key-value table in this case):

```sql
SELECT key, value FROM app_config;
```

Match the DB values against observed behavior (e.g., which endpoint requests actually hit). Once they line up, the conclusion is nailed: DB fully overrides; the same-named `.env` block is leftover dead config.

**Step 2: before deleting dead config, verify the DB really covers everything.** Compare DB entries against `.env` item by item: if DB covers all critical fields, removing the `.env` leftovers should be harmless in theory — but **restart and verify before deleting**, in case some field in the loader still falls back to env. Verify, then delete: that is the safe order for dead-config cleanup.

**Step 3: write the precedence chain into the ops doc.** The two wasted steps trace back to one gap: nobody knew this app had config precedence at all. One line in the handover doc saves the next person two hours: "config lives in the admin UI (DB); `.env` is fallback only — check the DB before touching `.env`."

<InfoBox variant="warning" title="Watch out">

"A config file exists and looks correct" never equals "this config is in effect" — effectiveness depends on the loading logic and its precedence chain. Likewise, `/proc/<pid>/environ` proves neither presence nor effectiveness for a dotenv app. The right starting point for any config investigation is **the app's config-loading code** — read the precedence chain out of the code, then walk it.

</InfoBox>

## FAQ

### What is the config precedence between database and environment variables?

In apps with an admin config UI, from lowest to highest: system-level env vars → process startup env → dotenv-injected values → the app's runtime config store (a DB or config file). The DB layer wins — UI edits must take effect immediately, which is impossible if .env outranks it. When troubleshooting, check the app's config store before the env files and you skip most of the detour.

### Do environment variable changes require a restart?

By layer: system-level variables need a shell or service restart; dotenv reads `.env` once at process start, so file edits need a process restart too; apps with a DB config layer pick up backend edits instantly — the loader reads the DB on every client build. Mixing the three timing models is how you end up concluding "changes do nothing".

### Why can't I see dotenv variables in /proc/pid/environ?

Because `/proc/pid/environ` is a snapshot from the instant the process started, while dotenv injects into os.environ after the process is already running. To verify dotenv's values, print them inside the process or read the `.env` file directly — and remember that a value being in the file still doesn't mean it's in effect; a higher-precedence layer may be overriding it.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
