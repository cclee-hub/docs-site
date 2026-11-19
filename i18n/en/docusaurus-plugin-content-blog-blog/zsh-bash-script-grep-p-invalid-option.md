---
title: "grep -P fails in scripts, works in your shell? PATHs differ"
description: "grep -P works in your terminal but fails in scripts: zsh and bash resolve different PATHs, and macOS grep is BSD. Portable fixes: sed -nE and shasum."
date: 2026-11-19
tags: [Shell, macOS, Bash]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does grep -P fail with \"invalid option\" on macOS?"
    a: "macOS ships /usr/bin/grep as BSD grep (FreeBSD lineage), which has never implemented the Perl-regex -P flag — that's a GNU grep extension. If your interactive shell PATH includes a brew-installed GNU grep, manual tests pass; a bash script that resolves to the system BSD grep reports \"grep: invalid option -- P\". Rewriting the pattern with grep -E or sed -nE makes it work in both environments."
  - q: "Why does my shell script behave differently on macOS than on Linux?"
    a: "Because the two machines resolve command names to different binaries. Linux ships GNU coreutils and GNU grep; macOS ships BSD tools, and any GNU replacements live under the Homebrew prefix — a path that interactive shell config adds to PATH but scripts may not inherit. Anything relying on GNU-only flags (-P, sha256sum, readlink -f) breaks at the first unsupported flag. Run command -v <tool> in both contexts and diff the outputs."
  - q: "How do I check which grep binary my script is using?"
    a: "Add a command -v grep line (and print its output) inside the script, or run it once with bash -x to watch the expanded command paths. Compare against which -a grep in your interactive shell: if the two contexts resolve to different paths (say /opt/homebrew/bin/grep versus /usr/bin/grep), you've confirmed the mismatch."
---

A release script that had run unattended on WSL for months died on its first `grep` call the day it was moved to a Mac: `grep: invalid option -- P`. What made it worse was the diagnostic itself — typing the very same `grep -oP '…'` into the terminal **passed**. Same command, same machine: works in the terminal, fails in the script.

## TL;DR

1. The error has nothing to do with a typo: your interactive zsh and the bash script resolve **two different PATHs**. Interactively, `grep` hits a brew-installed GNU grep (which supports `-P`); in the script it hits `/usr/bin/grep` (BSD grep, no `-P`).
2. The same family of failures extends beyond grep: `sha256sum` and other GNU coreutils tools exist only in the interactive PATH too, and fail with `command not found` one step later.
3. Three portable fixes: rewrite every `grep -oP` as an equivalent `sed -nE` extraction; fall back to `shasum -a 256` when `sha256sum` is missing; replace hardcoded paths with runtime self-detection. The script then runs on any machine, any shell.

<!-- truncate -->

The script belongs to the release pipeline of [CCLEE OSS](/docs/cclee-oss) — a WordPress plugin that syncs the media library to your own Alibaba Cloud OSS bucket. It reads the plugin header's `Version:`, computes the zip's sha256, and writes the release manifest. On WSL it never misbehaved; the Mac migration broke it on day one.

## Symptoms: passes manually, fails in the script

One command, two contexts, opposite outcomes — and the failing side is the environment the script actually runs in:

| Context | Command | Result |
|---------|---------|--------|
| Interactive terminal (zsh) | `grep -oP '(?<=Version: ).+' file` | Normal output |
| Same call inside `bash script.sh` | Identical | `grep: invalid option -- P` |

Verified anchors on this machine (macOS, Apple Silicon): `/bin/bash --version` reports GNU bash 3.2.57; `/usr/bin/grep --version` reports `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`; running the same grep through `/bin/bash -c` reproduces `grep: invalid option -- P` exactly.

## Root cause: one command name, two different binaries

**Fact one: macOS ships BSD grep, which has no `-P`.** The Perl-regex flag is a GNU grep extension; BSD grep has never implemented it. The system grep always lives at `/usr/bin/grep`, and that's where any script environment eventually lands.

**Fact two: the interactive zsh PATH contains a GNU grep.** The brew-installed GNU grep sits at `/opt/homebrew/bin/grep`, and manual testing works only because your interactive shell's PATH includes the Homebrew prefix. **That PATH is not the PATH the script inherits** — non-interactive bash resolves along its own rules, misses the brew prefix, and falls through to `/usr/bin/grep`.

**Fact three: sha256sum is the same trap, one step later.** GNU coreutils' `sha256sum` has no system-level implementation on macOS (the system provides `shasum`), so it likewise lives only in the interactive PATH. Fix grep and the script fails again at the next line with `command not found`.

<InfoBox variant="warning" title="Detour: the passing manual test sent debugging the wrong way">
The first instinct was "the script must be wrong" — after all, the identical command typed by hand on the same machine worked. A round of environment variables and quote-escaping later, the plainest check settled it: run `command -v grep` in the interactive shell and inside the script. One printed `/opt/homebrew/bin/grep`, the other `/usr/bin/grep`. Lesson: **"the command works in my terminal" tests the interactive shell, not the script environment**; the first cross-context debugging step is diffing `command -v` on both sides.
</InfoBox>

## Fix: make the script environment-independent

The goal is not "align the PATHs" — that just relocates the trap to the next machine. This script must run on both WSL and Mac, so it must assume nothing about either machine's toolchain:

```bash
# ① Rewrite every grep -P as an equivalent sed -nE extraction (both BSD and GNU sed support -E)
# Was: grep -oP '(?<=Version: ).+' file | head -n1
VER=$(sed -nE 's/.*Version:[[:space:]]*([^[:space:]]+).*/\1/p' "$F" | head -n1)

# ② Fall back to shasum -a 256 when sha256sum is missing (macOS ships shasum)
SHA=$( (sha256sum "$ZIP" 2>/dev/null || shasum -a 256 "$ZIP") | awk '{print $1}')

# ③ Self-detect paths instead of hardcoding "fix once per machine"
[ -d "$PLUGIN_SRC" ] || PLUGIN_SRC="$HOME/workspace/wordpress/wp/plugins/cclee-oss"
```

The `sed -nE` rewrite trick: a `grep -oP` lookbehind like `(?<=Version: )` becomes "greedy-match the whole line + capture group + `p`-print on match" (`s/.*prefix(capture).*/\1/p`) — semantically equivalent and portable across both sed implementations.

Verification: `bash -n` for syntax, then one real release run — Version extraction, sha256 write, manifest update all green. The 0.6.1 zip shipped through this exact code path.

## Caveats

<InfoBox variant="warning" title="This is a family of problems, not one command">
Any tool that is "present interactively, absent in scripts" behaves the same way: GNU grep -P, coreutils' sha256sum and readlink -f, some GNU sed flags, jq version differences. Cross-machine scripts have two survival strategies: **converge the environment** (inject PATH explicitly at the top of the script, pin the shebang to a known bash) or **stay environment-agnostic** (this post: use only flags both implementations share, plus fallback chains). The former is cheaper to maintain but every machine needs setup first; the latter is a one-time fix at the cost of avoiding platform extensions. Single-toolchain repos should pick the former; scripts that must run on both WSL and Mac should pick the latter.
</InfoBox>

## FAQ

### Why does grep -P fail with "invalid option" on macOS?

macOS ships `/usr/bin/grep` as BSD grep (FreeBSD lineage), which has never implemented the Perl-regex `-P` flag — that's a GNU grep extension. If your interactive shell PATH includes a brew-installed GNU grep, manual tests pass; a bash script that resolves to the system BSD grep reports `grep: invalid option -- P`. Rewriting the pattern with `grep -E` or `sed -nE` makes it work in both environments.

### Why does my shell script behave differently on macOS than on Linux?

Because the two machines resolve command names to different binaries. Linux ships GNU coreutils and GNU grep; macOS ships BSD tools, and any GNU replacements live under the Homebrew prefix — a path that interactive shell config adds to PATH but scripts may not inherit. Anything relying on GNU-only flags (`-P`, `sha256sum`, `readlink -f`) breaks at the first unsupported flag. Run `command -v <tool>` in both contexts and diff the outputs.

### How do I check which grep binary my script is using?

Add a `command -v grep` line (and print its output) inside the script, or run it once with `bash -x` to watch the expanded command paths. Compare against `which -a grep` in your interactive shell: if the two contexts resolve to different paths (say `/opt/homebrew/bin/grep` versus `/usr/bin/grep`), you've confirmed the mismatch.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
