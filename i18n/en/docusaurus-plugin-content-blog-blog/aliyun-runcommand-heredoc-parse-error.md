---
title: "Aliyun RunCommand Corrupts Files? Ship base64, Not heredoc"
description: "Files assembled inside RunCommand via heredoc+sed get corrupted on the instance, yet stay byte-perfect locally. Build locally, ship base64 — encode once."
date: 2026-11-23
tags: [Alibaba Cloud, Cloud Assistant, Shell, Ops]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is the same content fine locally but corrupted through Cloud Assistant?"
    a: "The only difference between the two paths is the on-instance assembly step: the same heredoc+sed pipeline produces byte-perfect files locally, while files assembled inside the RunCommand script get corrupted at the line carrying an exit 1 marker. The trigger is unidentified (! and brace interpolation alone don't reproduce it), but the avoidance rule is settled — don't assemble complex code files inside RunCommand scripts."
  - q: "How should files be delivered through Cloud Assistant?"
    a: "Generate the full file content locally, base64-encode it, embed it in the RunCommand script, and decode once on the instance with base64 -d. After switching, two consecutive dispatches passed clean. Mind the encoding layers: --CommandContent is itself base64-transported, so the script body is encoded exactly once — double encoding fails with command not found (rc=127)."
  - q: "Can heredoc still be used inside RunCommand scripts?"
    a: "At the time, simple eval files without exit 1 in the same script parsed and ran fine; the corruption clustered around assembled PHP code files. But with the mechanism unidentified, the safe boundary can't be drawn — production scripts should avoid assembling code on the instance entirely and ship complex files as locally generated, base64-embedded payloads."
---

Inside an Aliyun Cloud Assistant RunCommand script, PHP files assembled with a quoted heredoc plus sed kept failing to parse on the instance — and every parse error landed on the line where the file says `exit 1`.

Encountered this while [running managed hosting for a leading manufacturer's China site](/cases/waterpark-china-hosting-migration) — RunCommand is the main channel for patrols and automated maintenance on that server.

## TL;DR

Two rules came out of this. First, never assemble complex code files inside the RunCommand script: generate locally, embed as base64, decode once on the instance — after the switch, two consecutive dispatches passed clean. Second, encode exactly once: `--CommandContent` is already base64-transported, and double-encoding the script fails with `command not found` (rc=127). The corruption trigger itself stays unidentified — `exit 1` was the common marker of every failed file, but neither `!` nor brace interpolation reproduces it alone.

## Symptoms: RunCommand-dispatched files fail to parse at the exit 1 line

The script's shape was assemble-on-instance, execute immediately:

```bash
cat > /tmp/check.php <<'EOF'
<?php
// …bail out when a condition fails
exit 1;
EOF
sed -i 's|placeholder|actual|' /tmp/check.php
wp eval-file /tmp/check.php
```

The result was a parse error, not the script's own business check:

```text
PHP Parse error: unexpected integer "1"
# error position = the exit 1 line of each failing file
```

Three observations narrowed things fast: the parse position was exactly the `exit 1` line every time; eval files without `exit 1` in the same script parsed and ran fine; and running the identical heredoc+sed pipeline locally produced byte-perfect files. The damage lived only on the "dispatched via RunCommand, assembled on the instance" path — heredoc syntax itself was not the problem.

## Detour: the trigger narrows, the mechanism never lands

The first suspect was `!` — history expansion and PHP's `!function_exists` both seemed plausible. Re-reading the execution record killed it: the very first failing script contained a heredoc with `!function_exists` that parsed and ran fine, so `!` alone doesn't trigger anything. Interpolation braces went next; rewording `{}` didn't reproduce the corruption either.

After the eliminations, one common trait remained across every failing file: the `exit 1` marker. But a shared trait is not a proven trigger, and going further would mean gambling on a mechanism. The operational call was to stop chasing it and change the path instead: move assembly back to the local machine and route around the unexplained corruption.

## Fix: generate locally, embed base64, decode once

All content generation moves local; the script keeps only decode-and-run:

```bash
# Local: generate the full file, encode it, paste into the script text
base64 -w0 check.php
# → one base64 line, goes into the B64 variable below
```

```bash
# RunCommand script: decode to disk, no on-instance assembly
B64='PGhwCi8v…'
echo "$B64" | base64 -d > /tmp/check.php
wp eval-file /tmp/check.php
```

Verification: after the switch, two follow-up dispatches (test-attachment cleanup and a probe script) both passed clean — no more parse errors.

The second pitfall is about encoding layers. `CreateCommand` receives `--CommandContent` as base64 — the caller encodes the script text once, the service decodes once and runs it. Encoding twice makes the server decode into another base64 string, which then gets executed as a script:

```bash
# Wrong: encoding the script body twice
base64 -w0 script.sh | base64 -w0 > doubled.txt
# CreateCommand --CommandContent "$(cat doubled.txt)"
# → server decodes once, executes base64 text → command not found, rc=127
```

Encode once. The base64 around embedded files is a separate layer (encoding of the file content) and has nothing to do with the script's own transport encoding.

Silent Cloud Assistant behavior doesn't stop here — once the invocation returns, background jobs started with nohup inside the script get cleaned up with the session; the fix is covered in [Aliyun Assistant Kills nohup Jobs? Escape with setsid](/blog/aliyun-cloud-assistant-nohup-setsid).

<InfoBox variant="warning" title="Notes">

- Complex code files: always generate locally and ship base64-embedded; keep on-instance heredoc+sed for simple config snippets only.
- `--CommandContent` is encoded exactly once; double encoding fails with `command not found` (rc=127).
- An unidentified mechanism means no safe boundary: don't treat "my content has no exit 1" as an exemption — avoiding the assembly path is the stable policy.
- A Success result only means the script finished, not that background jobs it started are still alive.

</InfoBox>

## FAQ

### Why is the same content fine locally but corrupted through Cloud Assistant?

The only difference between the two paths is the on-instance assembly step: the same heredoc+sed pipeline produces byte-perfect files locally, while files assembled inside the RunCommand script get corrupted at the line carrying an exit 1 marker. The trigger is unidentified (! and brace interpolation alone don't reproduce it), but the avoidance rule is settled — don't assemble complex code files inside RunCommand scripts.

### How should files be delivered through Cloud Assistant?

Generate the full file content locally, base64-encode it, embed it in the RunCommand script, and decode once on the instance with base64 -d. After switching, two consecutive dispatches passed clean. Mind the encoding layers: --CommandContent is itself base64-transported, so the script body is encoded exactly once — double encoding fails with command not found (rc=127).

### Can heredoc still be used inside RunCommand scripts?

At the time, simple eval files without exit 1 in the same script parsed and ran fine; the corruption clustered around assembled PHP code files. But with the mechanism unidentified, the safe boundary can't be drawn — production scripts should avoid assembling code on the instance entirely and ship complex files as locally generated, base64-embedded payloads.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
