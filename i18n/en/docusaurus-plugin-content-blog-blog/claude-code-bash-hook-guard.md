---
title: "Claude Code Hooks Overblocking? Gate on Real SQL Writes"
description: "Keyword-matching Claude Code hooks block pm2 and grep too. Gate on execution semantics — ssh prefix + psql + write keyword — 17-line script, 22 test cases."
date: 2026-09-28
tags: [Claude Code, Hooks, Database Security, DevOps]
authors: [cclee]
image: "/images/blog/claude-code-bash-hook-guard-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "How do I add a Claude Code hook to block Bash commands?"
    a: "Register a PreToolUse command hook with matcher \"Bash\" in settings.json, pointing to your script with timeout 5. The script reads tool_name and tool_input.command from stdin; exit 2 blocks the call and feeds stderr back to the model, exit 0 allows it. The 17-line script in this post is ready to copy."
  - q: "What are best practices for writing Claude Code hooks?"
    a: "Anchor the guard on execution semantics, not text presence: this guard fires only when three conditions hold together — an ssh prefix to the prod host, psql in the command, and word-boundary write keywords. Keep a regression table (22 cases here) so every criteria change is verified, and document the residual risks you accept."
  - q: "How do Claude Code PreToolUse hooks work?"
    a: "Before a Bash call executes, the hook receives the full command as JSON and answers with an exit code: exit 2 blocks the call and sends stderr back to the model as the reason; exit 0 allows it. A bare exit 0 with no output passes silently."
  - q: "Why is my Claude Code hook blocking harmless commands?"
    a: "Because keyword matching hits text, not semantics: sys.path.insert, --update-env and grep 'UPDATE' all contain whole-word keywords, and word boundaries cannot help since punctuation in code is itself a boundary. v1 blocked 8 classes of legitimate commands this way; adding the psql condition cleared all of them."
---

While configuring a Claude Code Bash hook to stop the AI from writing to a production database, `pm2 restart`, `grep`, and Python debug commands got blocked one after another — every dangerous SQL was caught, but half of the legitimate ops commands were caught too. This is commonly discussed as hook overblocking or false positives. This post walks through the full narrowing from "keyword matching" to "execution semantics".

Encountered this while operating the production servers behind [CCLee Server Sentinel](/docs/server-sentinel) — managed Linux server monitoring across performance, availability, security and backups, with alerts merged into conclusions plus remediation guidance.

## TL;DR

Using "command text contains a write keyword" as the hook criteria is guaranteed to overblock: `sys.path.insert`, `pm2 --update-env`, and `grep 'UPDATE …'` all contain whole-word keywords, and `\b` boundaries save none of them. Narrow the criteria to three conditions — **ssh prefix to the prod host + psql in the command + word-boundary keyword** — and 8 classes of false positives drop to zero. Meanwhile, define the legit write path as file piping (keywords never enter the command line), which by construction never triggers the guard. Finally, turn the criteria table into 22 regression cases: change criteria by changing tests first.

## Symptom: pm2 restart blocked, ops commands caught in the net

On day one, the v1 blocking hook caught `pm2 restart`, remote `grep`, and Python debug commands — none of the blocked commands actually wrote a database.

Some context: our workflow lets Claude Code connect to the production database for **read-only** troubleshooting — locate the trace in the `logs` table first, form a hypothesis, then read code. That path depends on one premise: INSERT / UPDATE / DROP **writes** must never be issued directly by the AI. The rule went into CLAUDE.md first, but rules are advisory; models forget under long-session pressure. So we added a mechanical layer: a PreToolUse hook that blocks (exit code 2) any `ssh`-to-production command whose text contains a write keyword.

The false positives piled up fast. All of these were blocked; none of them writes a database:

```bash
# Python path tweak inside a container (sys.path.insert contains "insert")
ssh prod "docker exec app python3 -c 'import sys; sys.path.insert(0, \"/app/lib\")'"

# pm2 rolling env reload (--update-env contains "update")
ssh prod "pm2 restart api --update-env"

# Service restart (pm2 delete contains "delete")
ssh prod "cd /app && pm2 delete api 2>/dev/null; pm2 start ecosystem.config.js && pm2 save"

# Searching code remotely (grep's argument contains "UPDATE")
ssh prod "grep -rn 'UPDATE api_keys' /app/server/"

# Counting errors in logs
ssh prod "tail -5 error.log | grep -c UPDATE"

# pandas inside a container (df.update contains "update")
ssh prod "docker exec airflow python3 -c 'df.update(other)'"
```

Every blocked command meant Claude had to stop and reroute, breaking the troubleshooting chain. The false-positive list grew to 8 classes (the regression suite keeps 6 representative samples) — v1 criteria declared failed.

## Root cause: keyword matching hits text, not execution semantics

Word boundaries cannot fix shell-command false positives — v1's regex **already had** `\b`, and the false positives happened anyway:

```bash
grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'
```

Word boundaries cannot fix shell-command false positives, and the reason is counter-intuitive: **punctuation in code syntax is itself a word boundary**. The `.` in `sys.path.insert`, the `-` in `--update-env`, the `.` and `()` in `df.update()` are all non-word characters to the regex engine, so `insert` and `update` count as "whole words" in every one of them. v1's boundaries prevented zero false positives.

One level deeper, the criteria was anchored on the wrong thing: a keyword appearing in the command text does **not** mean the command executes that keyword's semantics. `grep 'UPDATE api_keys'` means "search", not "update"; `pm2 --update-env` means "restart", not "modify data". No text-level trick (boundaries, casing, context windows) can tell them apart, because the discriminating information is not in the text — it is in the **executor**. What is actually dangerous is "psql receives a write statement", not "the word UPDATE appears somewhere".

So the fix is not finer matching but a different anchor: **execution semantics**. A command poses a database-write risk only if three things hold at once: it is an ssh to the production host, it actually invokes psql, and the text psql will execute contains a write keyword.

## The Claude Code hook decision flow: three conditions, all required

The flow below shows the gate: three conditions in series, every "no" branch allows, only three "yes" results block.

![bash-guard decision flow: ssh prod prefix, psql presence, and word-boundary write keyword must all hold before blocking; SQL via file piping passes by construction](/images/blog/claude-code-bash-hook-guard-architecture-en.webp)

The entire v1-to-v2 diff is one line — a psql condition added before the keyword check:

```bash
# v1: keyword only (deprecated)
if echo "$CMD" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'; then

# v2: psql presence + keyword, checked together
if echo "$CMD" | grep -qi 'psql' && echo "$CMD" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'; then
```

The full hook (17 lines; replace `prod` with your production host's ssh alias):

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ "$TOOL" != "Bash" ] && exit 0

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qi '^ssh prod'; then
    if echo "$CMD" | grep -qi 'psql' && echo "$CMD" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'; then
        echo "Blocked: psql inline write keyword detected: $CMD" >&2
        exit 2
    fi
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"read-only ssh command"}}'
    exit 0
fi

exit 0
```

Register it in `settings.json`, matcher limited to the Bash tool, timeout 5 seconds so a hung script cannot stall the session:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/path/to/bash-guard.sh", "timeout": 5 }
        ]
      }
    ]
  }
}
```

Precise blocking is half the job — writes still need a path. Schema changes and data fixes are real work, and they should not die because a hook exists. Our **legit path** is file piping: SQL goes to disk, stdin feeds psql, and write keywords never enter the command line:

```bash
cat x.sql | ssh prod "docker exec -i db psql -U app -d appdb"
# or
ssh prod "docker exec -i db psql -U app -d appdb" < x.sql
```

A pleasant side effect: the legit path **never** triggers the hook, no whitelist or exemptions needed. Neither side of the pipe (`cat`, or `ssh … psql` without `-c`) contains a keyword — criteria and legit path are structurally disjoint rather than exception-enumerated. The rule worth writing down is: what is forbidden is not "writing the database" but "inlining keywords into the command line" — team convention and hook criteria now say the same sentence.

## The criteria table is the test: 22 regression cases lock the contract

A hook encodes criteria; criteria need regression tests. We wrote the criteria table directly as a test table — one case per row: command, expected outcome (2 = block, 0 = allow). Running it only verifies; it does not negotiate:

```bash
run_case 2 'inline INSERT'   $'ssh prod "docker exec -i db psql -c \'INSERT INTO customers ...\'"'
run_case 0 'pm2 restart --update-env' $'ssh prod "pm2 restart api --update-env"'
run_case 0 'remote grep keyword' $'ssh prod "grep -rn \'UPDATE api_keys\' /app/server/"'
run_case 0 'file pipe cat|' $'cat /tmp/x.sql | ssh prod "docker exec -i db psql"'
run_case 0 'cd && prefix bypass (permission layer backstop)' $'cd /x && ssh prod "psql -c \'DROP TABLE t\'"'
run_case 2 'read-only query with literal keyword (residual)' $'ssh prod "psql -c \'SELECT body FROM logs WHERE body LIKE \\'%UPDATE%\\'\'"'
```

The 22 cases split into four groups: 7 true blocks, 6 v1 false-positive fixes, 6 read-only and legit-path, 3 known residuals. A comment at the top of the test file reads: "the expectation column is the confirmed contract — execution only verifies, never negotiates". Criteria changes must edit the expectation column first, then pass the suite.

The suite repaid itself quickly. The heredoc policy was once recorded as "blocked as well", then reverted the same day — and the revert rationale is now unrecoverable. Documentation-based memory forgets; the criteria now has an arbiter: a local heredoc to disk (`cat > x.sql <<'EOF'`, starts with `cat`, never enters the ssh prefix gate) is **allowed**; a remote heredoc (`ssh prod "… psql …" <<'EOF'`, full SQL in the command line) is **blocked**. Both cases sit in the test table — run it and the answer is there.

## Residual risks: what this line of defense does not catch

<InfoBox variant="warning" title="Note">

Hook blocking is **one layer** of defense in depth, not absolute safety. These residuals are known and accepted; evaluate them against your own scenario:

</InfoBox>

- **`cd x && ssh prod "…"` prefix bypass**: the criteria anchors on the `^ssh` prefix, so a command starting with `cd` slips through. The backstop for this is not the hook — Claude Code still asks for permission confirmation on commands outside the allowlist, keeping a human in the loop.
- **Read-only queries with literal keywords still blocked**: `SELECT body FROM logs WHERE body LIKE '%UPDATE%'` gets blocked. The rate is negligible and the failure direction is safe (prefer blocking), so we accept it.
- **psql substring false positives**: a path containing "psql" plus a keyword trips the guard, e.g. `grep UPDATE /tmp/psql-dump.log`.
- **pg_restore not in the enumeration**: restores go through a tool, not SQL keywords, so `ssh prod "pg_restore -d appdb snap.sql"` passes. The enumeration covers SQL write keywords; tool-level dangerous commands need separate coverage.

Why a hook instead of just a CLAUDE.md rule? They are not substitutes: rules are the advisory layer — models forget; hooks are the mechanical layer — they block even when the model forgets; permission prompts are the human layer — they backstop what the hook misses. Each layer covers a different failure mode; no single layer is enough. If you remember one sentence about the criteria: **block execution semantics, not text presence**.

This is our second Claude Code engineering post; the first was [VS Code panel 500s and GLM multi-session rejection](/blog/claude-code-vscode-panel-500-glm-multisession) — both looked like random failures, and in both the root cause lived in the mechanics, not the model.

## FAQ

### How do I add a Claude Code hook to block Bash commands?

Register a PreToolUse command hook with matcher `Bash` in settings.json, pointing to your script with `timeout: 5`. The script reads `tool_name` and `tool_input.command` from stdin; exit 2 blocks the call and feeds stderr back to the model, exit 0 allows it.

### What are best practices for writing Claude Code hooks?

Anchor the guard on execution semantics, not text presence: this guard fires only when three conditions hold together — an ssh prefix to the prod host, psql in the command, and word-boundary write keywords. Keep a regression table (22 cases here) so every criteria change is verified, and document the residual risks you accept.

### How do Claude Code PreToolUse hooks work?

Before a Bash call executes, the hook receives the full command as JSON and answers with an exit code: exit 2 blocks the call and sends stderr back to the model as the reason; exit 0 allows it. A bare exit 0 with no output passes silently.

### Why is my Claude Code hook blocking harmless commands?

Because keyword matching hits text, not semantics: `sys.path.insert`, `--update-env` and `grep 'UPDATE'` all contain whole-word keywords, and word boundaries cannot help since punctuation in code is itself a boundary. v1 blocked 8 classes of legitimate commands this way; adding the psql condition cleared all of them.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
