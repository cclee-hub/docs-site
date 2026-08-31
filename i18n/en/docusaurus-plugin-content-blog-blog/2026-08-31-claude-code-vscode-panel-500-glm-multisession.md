---
title: "Claude Code Not Responding in VS Code? The GLM Multi-Session Rejection Pitfall"
description: "Claude Code's VS Code panel hangs and returns 500 overloaded_error 1234 while the terminal works fine — the root cause is that only the first session after extension activation is accepted, with diagnosis and fixes"
date: 2026-08-31
tags: [Claude Code, VS Code, GLM, WSL]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does the Claude Code VS Code extension panel stop responding when I send a message?"
    a: "Only the first backend session after each extension activation is accepted by the gateway; sessions created afterwards get rejected. Reload Window and stick to the first conversation."
  - q: "Terminal works but the VS Code panel returns 500 with GLM — what causes this?"
    a: "It is not a configuration problem. The GLM gateway rejects non-first extension session requests with 500 overloaded_error (code 1234), while terminal requests on the same account are unaffected."
  - q: "Is the 500 [1234] network error a GLM Coding Plan rate limit?"
    a: "No. Normal terminal calls at the same time prove your quota is fine — the gateway rejects multi-session extension requests under its overload code. Wait for an official fix."
---

Sending a message to Claude Code in the VS Code extension panel does nothing for minutes, and finally fails with `API Error: 500 [1234]` — while the `claude` CLI on the same machine, same account, works perfectly at the same moment. This post walks through the full diagnosis and the fix.

<!-- truncate -->

## TL;DR

This is a Claude Code VS Code extension multi-session bug ([anthropics/claude-code#82197](https://github.com/anthropics/claude-code/issues/82197)): **only the first backend session after each extension activation works; sessions created afterwards get rejected by the GLM gateway with `overloaded_error` (code 1234)**.

Immediate fix: `Ctrl+Shift+P` → **Reload Window** → use only the first conversation that gets restored. Two configuration hardenings are also recommended: put the API domain into `no_proxy` for direct connections, and add the `[1m]` suffix to model names as the official docs require.

## Symptoms

- The panel spinner runs for minutes (up to 8 in my case), then fails:

```
API Error: 500 [1234][Network error, error id 202608310410420a8514a2344940e8, please retry later.]
This is a server-side issue, usually temporary — try again in a moment.
```

- Same account, same minute: the `claude` CLI works flawlessly
- Creating a new conversation does not help; new messages just get queued into the stuck session
- Environment: WSL2 + VS Code Remote-WSL + Claude Code extension + GLM Coding Plan (`open.bigmodel.cn/api/anthropic`)

## Diagnosis

Following the "network first, config next, request last" elimination order, with a controlled experiment at every step:

1. **Network**: curl to the gateway from WSL both directly and through the proxy — 0.16s either way. Network, firewall, and proxy all eliminated.
2. **Model names**: curl with `glm-5.3-flash`, `glm-5.1`, and `glm-5-turbo` — all returned 200. Model configuration eliminated.
3. **Engine version**: ran the extension's own bundled 2.1.251 binary in a terminal with `-p` — worked fine. Engine build and workspace context eliminated.
4. **The real error**: the extension host log (`~/.vscode-server/data/logs/<window>/exthost*/Anthropic.claude-code/`) showed 11 consecutive retries, every single one `500 overloaded_error` — requests did reach the gateway and were explicitly rejected, not lost in transit.
5. **Concurrency eliminated**: timeline cross-check showed panel requests still being rejected during periods when nothing else was running.
6. **The fork point**: within the same window, the **first** panel session after activation stayed healthy (130 responses, 0 errors) while the **second** one failed 11 out of 11 — matching [#82197](https://github.com/anthropics/claude-code/issues/82197).

With every local variable eliminated, one conclusion remains: the gateway rejects requests built by non-first extension sessions and wraps the rejection as `overloaded_error`.

## Root Cause

The VS Code extension spawns a separate engine process per session after each activation. Issue [#82197](https://github.com/anthropics/claude-code/issues/82197) describes the bug: **only the first backend session works**. Requests from later sessions get rejected on the gateway side, and the GLM gateway returns these rejections as HTTP 500 + `overloaded_error` (the Anthropic 529 "overloaded" semantics) with a misleading "network error, please retry" message — which invites endless pointless retries.

Why does the terminal work? Every `claude` launch in a terminal is a brand-new single-session process — the equivalent of "first session after activation" — so it always passes. This is also why the problem is easy to misread as rate limiting or a network issue: **the tell is whether the CLI on the same account works at the same time**. If you develop inside WSL2, networking pitfalls don't stop here — see also [WSL2 + Docker: silent port occupation and host-mode localhost issues](/blog/2026/05/09/wsl-docker-postgresql-port-conflict).

## Fix

### Step 1: Recover the panel immediately

```text
Ctrl+Shift+P → Reload Window
→ use only the first restored conversation; do not keep multiple conversations open
```

Repeat whenever the panel breaks again. Until this is fixed upstream, this is the only reliable recovery path.

### Step 2: Harden the configuration

In the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "no_proxy": "localhost,127.0.0.1,::1,.bigmodel.cn",
    "NO_PROXY": "localhost,127.0.0.1,::1,.bigmodel.cn",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.3-flash[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5.3-flash[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.3-flash[1m]",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000"
  }
}
```

What each change does:

1. **Direct API connection**: if you develop behind a proxy (Clash, etc.), adding the API domain to `no_proxy` routes API traffic around the proxy tunnel. Direct connection to this domain is faster and more stable.
2. **Model names per official docs**: the [GLM docs](https://docs.bigmodel.cn/cn/coding-plan/latest-model) require the `[1m]` suffix to enable the 1M context window; plain names are legacy config.

### Step 3: How to diagnose next time

```bash
# Real engine errors (lines starting with "From claude:" are engine stderr)
tail -f ~/.vscode-server/data/logs/*/exthost*/Anthropic.claude-code/Claude\ VSCode.log

# Session history (to see which messages triggered rejections)
ls -lat ~/.claude/projects/<workspace-slug>/*.jsonl
```

Consecutive `API error (attempt N/11): 500 overloaded_error` entries mean you are looking at this exact problem. Collect the error id (request_id) from the messages — it is the key evidence for a support ticket.

<InfoBox variant="warning" title="Gotchas">

- A large `API_TIMEOUT_MS` (e.g. 3000000 = 50 minutes) makes stuck requests spin forever instead of erroring out — easily mistaken for "no response" rather than "rejected"
- A stuck panel session keeps accepting messages but only queues them — **do not keep resending in the same conversation**; Reload Window instead
- If you switch models via scripts, keep the `[1m]` suffix and the `no_proxy` entries intact so they don't get overwritten back to legacy values

</InfoBox>

## FAQ

### Why does the Claude Code VS Code extension panel stop responding when I send a message?

Only the first backend session after each extension activation is accepted by the gateway; sessions created afterwards get rejected. Reload Window and stick to the first conversation.

### Terminal works but the VS Code panel returns 500 with GLM — what causes this?

It is not a configuration problem. The GLM gateway rejects non-first extension session requests with 500 overloaded_error (code 1234), while terminal requests on the same account are unaffected.

### Is the 500 [1234] network error a GLM Coding Plan rate limit?

No. Normal terminal calls at the same time prove your quota is fine — the gateway rejects multi-session extension requests under its overload code. Wait for an official fix.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
