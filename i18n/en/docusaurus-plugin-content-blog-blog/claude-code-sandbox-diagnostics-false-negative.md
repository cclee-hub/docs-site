---
title: "Claude Code Sandbox Diagnostics Lie? Rerun Outside It"
description: "Claude Code sandbox on macOS fakes negative results — curl connects to nothing, lsof shows nothing, binaries hang. Rerun with dangerouslyDisableSandbox."
date: 2026-10-15
tags: [Claude Code, macOS, Sandbox, DevOps]
authors: [cclee]
image: "/images/blog/claude-code-sandbox-diagnostics-false-negative-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "curl to 127.0.0.1 inside the Claude Code sandbox shows no error but never connects — is my service down?"
    a: "Probably not — the sandbox disguises blocking as clean empty results. On macOS, curl inside the sandbox fails to connect without an error, lsof returns nothing while the port is actually listening, and binaries with the quarantine attribute can hang forever (0 CPU, no message). Bottom line: never trust negative results inside the sandbox; rerun the same commands with dangerouslyDisableSandbox before concluding anything."
  - q: "What does Claude Code sandbox mode silently block on macOS?"
    a: "Three things observed in practice: network probes (curl to localhost fails silently), process enumeration (lsof -iTCP can't see other processes' sockets), and binary execution (a binary with the com.apple.quarantine attribute, like the Syncthing core, hangs at 0 CPU with no error). You can't strip the quarantine attribute either — since macOS 27, xattr -dr returns EPERM for installed apps. These binaries only run outside the sandbox."
  - q: "How do I safely bypass the Claude Code sandbox for local diagnostics?"
    a: "Rerun the same diagnostic commands with dangerouslyDisableSandbox. In my run everything came back real: syncthing --version returned in seconds, and ports, processes and the unified log were all visible. Bottom line: bypass for read-only diagnostics, keep everyday builds and execution inside the sandbox."
---

While debugging a workspace-mcp local service inside Claude Code, `curl` and `lsof` both came back looking perfectly "normal" — yet the service stayed unreachable. The later discovery was worse: binaries carrying the quarantine attribute hang forever inside the sandbox, which means every conclusion I'd drawn from sandboxed checks was untrustworthy.

## TL;DR

- On macOS, the Claude Code sandbox doesn't fail loudly — it **silently returns plausible-looking empty results**: `curl` connects to nothing without an error, `lsof` misses real listeners, and binaries with the quarantine attribute hang forever (0 CPU, no output).
- When diagnosing local services, **negative results inside the sandbox (no listener, no process, hung command) are worthless**. Rerun the same batch of commands with `dangerouslyDisableSandbox` to get conclusions you can trust.

## Symptoms: a "clean" debug session, all wrong

The contradiction: every check "returned normally" yet the service stayed down — the failure had two layers.

Layer one: regular diagnostics went quietly wrong. The workspace-mcp service was unreachable, so I ran the standard checks inside the session: `curl 127.0.0.1:8000` showed no error, `lsof -iTCP` showed nothing unusual. By experience, none of the loud signals — connection refused, no listener — appeared. Every command "returned normally." But the service stayed down. I retried inside the sandbox several times; same result every time.

Layer two surfaced later and cut deeper: while looking into Syncthing, its core binary (carrying the `com.apple.quarantine` attribute) hung **forever** when executed inside the sandbox — the process existed, sat at 0 CPU, and printed nothing at all.

Both layers point at the same essence: **diagnostic commands inside the sandbox lie**. Errors make you alert; plausible negative results make you comfortable — and that's the dangerous form.

## Why are Claude Code sandbox diagnostics unreliable on macOS?

Root cause: the sandbox disguises blocking as normal. It distorts commands in three ways, in increasing order of severity.

**Network probes go blind.** `curl 127.0.0.1:8000` inside the sandbox can't reach the port, but it doesn't throw a connection error either — it "returns normally." What you see is not `connection refused` but a clean empty result, and the wrong conclusion ("nothing is listening") gets written into your notes without a trace. The same applies to the phrasings "connection refused" or "localhost unreachable" — inside the sandbox, those symptoms get swallowed.

**Process enumeration goes blind.** `lsof -iTCP` inside the sandbox cannot see other processes' sockets on the host, so it prints nothing. The port is listening; you just can't see it. "No listener found" does not mean "nothing is listening," and any "the service isn't running" verdict built on it is wrong.

**Binary execution hangs.** The subtlest one. When you execute a binary carrying the `com.apple.quarantine` attribute (the Syncthing core), the sandbox policy stacks with the Gatekeeper check and the process stops dead at 0 CPU — no return, no crash, no clue.

The obvious escape hatch is welded shut, too. I tried `xattr -dr com.apple.quarantine` to strip the attribute; on every app under /Applications it returned **EPERM** — starting with macOS 27, the system locks the quarantine attribute on installed apps. That routine self-help path no longer exists on current macOS.

## Fix: rerun the same commands outside the sandbox

Conclusion first: **on macOS, always verify local-service diagnostics (port listeners, processes, Gatekeeper, unified log, quarantined binaries) outside the sandbox.**

![Sandbox vs. bypassed diagnostics on macOS: three silent failure modes inside, real results after bypassing](/images/blog/claude-code-sandbox-diagnostics-false-negative-architecture-en.webp)

The fix is mechanical — rerun the same batch of commands with `dangerouslyDisableSandbox`. Side-by-side:

| Command | Inside the sandbox | Outside the sandbox |
|------|--------|---------|
| `syncthing --version` | hangs forever, 0 CPU | returns in seconds, normal version output |
| Port check | empty result | real listener state |
| Process check | empty result | real process list |
| Unified log | not found | fully queryable |

Once outside, the earlier "everything looks fine" illusion collapsed — ports, processes and the unified log all came back with real data, and nearly every "negative" check from the first round got overturned.

The rule I now keep: **negative results inside the sandbox don't count**. This is not "sandbox output is garbage" — positive findings (a listener you did see, a process you did find) remain valid. What's broken is the empty results: they cannot distinguish "genuinely absent" from "the sandbox won't let you see." And sandbox-style guardrails distorting commands is a pattern, not a one-off — Claude Code's Hook interception [falsely blocks normal commands](/blog/claude-code-bash-hook-guard) the same way; your criteria need to anchor on execution semantics, not surface output.

## Boundaries and caveats

<InfoBox variant="warning" title="Caveats">

- **Bypass for read-only diagnostics**: ports, processes, logs and version checks are low-risk; keep everyday builds and execution inside the sandbox — don't bypass globally out of convenience.
- **Untrusted code is the opposite case**: the sandbox's isolation value exists precisely for running code you don't trust; that path must not be bypassed.
- **Don't try `xattr` on macOS 27**: it returns EPERM for installed apps, period. Executing outside the sandbox is the faster path.
- **Audit past conclusions**: if you previously concluded "service is down" or "port not listening" from sandboxed checks, re-verify them with the sandbox bypassed.

</InfoBox>

If you're building your own tooling around local MCP services like workspace-mcp, the approach in [building a custom MCP toolkit with FastMCP](/blog/build-your-own-mcp-toolkit) pairs well with this — and when you wrap diagnostic commands as MCP tools, keep the sandbox layer in mind.

## FAQ

### curl to 127.0.0.1 inside the Claude Code sandbox shows no error but never connects — is my service down?

Probably not — the sandbox disguises blocking as clean empty results. On macOS, curl inside the sandbox fails to connect without an error, lsof returns nothing while the port is actually listening, and binaries with the quarantine attribute can hang forever (0 CPU, no message). Bottom line: never trust negative results inside the sandbox; rerun the same commands with dangerouslyDisableSandbox before concluding anything.

### What does Claude Code sandbox mode silently block on macOS?

Three things observed in practice: network probes (curl to localhost fails silently), process enumeration (lsof -iTCP can't see other processes' sockets), and binary execution (a binary with the com.apple.quarantine attribute, like the Syncthing core, hangs at 0 CPU with no error). You can't strip the quarantine attribute either — since macOS 27, xattr -dr returns EPERM for installed apps. These binaries only run outside the sandbox.

### How do I safely bypass the Claude Code sandbox for local diagnostics?

Rerun the same diagnostic commands with dangerouslyDisableSandbox. In my run everything came back real: syncthing --version returned in seconds, and ports, processes and the unified log were all visible. Bottom line: bypass for read-only diagnostics, keep everyday builds and execution inside the sandbox.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
