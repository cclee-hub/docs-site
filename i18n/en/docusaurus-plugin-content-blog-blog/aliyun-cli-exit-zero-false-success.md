---
title: "Aliyun CLI Exit 0 but Failed? jq Default Values Hide Errors"
description: "Aliyun CLI errors land on stderr with exit 0; a jq fallback default masks the failure as a valid empty result. Capture with 2>&1 and read the raw response."
date: 2026-11-23
tags: [Alibaba Cloud, CLI, Shell, Ops]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What should I watch out for when parsing aliyun CLI output with jq?"
    a: "The biggest trap is fallback defaults: jq -r '.TotalCount // 0' prints 0 on an error response instead of failing — error JSON goes to stderr with exit code 0, and when TotalCount is missing, the default washes the failure into a legitimate-looking empty result. Capture the raw response with 2>&1 and read it before applying jq, and never use a // default as a failure probe."
  - q: "Why does the aliyun CLI return success even when the API call failed?"
    a: "The CLI prints API-level error JSON to stderr while the process exit code stays 0 — set -e and || exit never see it. Failure detection must be based on response content (error code / message fields), never on the exit code."
  - q: "Why can't DescribeInvocationResults read my results?"
    a: "Two common causes. Wrong nesting: the result is an object inside an object, and the correct path is .Invocation.InvocationResults.InvocationResult[0] — the array-style .InvocationResults[0] throws Cannot index object with number even though the data is right there. Mixed IDs: DescribeInvocationResults only accepts a CommandId (c- prefix); if all you have is an InvokeId (t- prefix), exchange it first via DescribeInvocations --InvokeId."
---

An automation script probed whether a Cloud Assistant command still existed using `DescribeCommands` with a `jq -r '.TotalCount // 0'` fallback — the API returned an error, the script read TotalCount=0, concluded "command doesn't exist," and dutifully created a duplicate.

Encountered this while [running managed hosting for a leading manufacturer's China site](/cases/waterpark-china-hosting-migration) — Cloud Assistant automation is the dispatch channel for patrols and maintenance on that server.

## TL;DR

Two layers stack into one illusion. Layer one: the aliyun CLI prints API error JSON to **stderr** with **exit code 0**, so set -e gets no signal. Layer two: the `jq -r '.TotalCount // 0'` fallback turns an error response — which has no `TotalCount` field — into `0`, disguising "query failed" as "query succeeded, zero hits." The house rule: capture with `2>&1`, read the raw response first, and never use a jq default as a failure probe. Two more landmines nearby: `DescribeCommands` takes the singular `--CommandId` (the array-style `--CommandId.1` belongs to `InvokeCommand` habits and is an error here), and `DescribeInvocationResults` only accepts a `CommandId` with object-in-object nesting.

## Symptoms: the command exists, the script says it doesn't

The flow is the classic three-step Cloud Assistant pattern: `CreateCommand` for a `CommandId`, `InvokeCommand` to dispatch, `DescribeInvocationResults` to read back. Before invoking, the script checks the command object:

```bash
# existence probe (buggy)
resp=$(aliyun ecs DescribeCommands --CommandId.1 "c-xxx" 2>&1)
count=$(echo "$resp" | jq -r '.TotalCount // 0')
[ "$count" -eq 0 ] && aliyun ecs CreateCommand ...   # judged missing → recreate
```

In practice this walked into the recreate branch on every run: the command was created in the previous round, yet judged missing in this one. Worse, invoking the freshly recreated `CommandId` could still hit `InvalidCmdId.NotFound` — the new object isn't ready yet, so both the probe and the recreate were wasted work. Left unfixed, the loop kept burning quota.

## Root cause: errors exit 0, and jq washes them into defaults

Two independent facts compose the trap. On the CLI side, API-level errors are printed to **stderr** while the process exit code stays **0** — exit-code-based defenses like set -e never fire. On the jq side, `2>&1` does carry the error JSON into the pipe, but the object has no `TotalCount` field, so the `// 0` fallback helpfully outputs `0`. "API call failed" has been laundered into "call succeeded, zero commands found."

`--CommandId.1` is a third, smaller fact: the array-style suffix is the parameter habit of `InvokeCommand --InstanceId.1`, while `DescribeCommands` wants the singular `--CommandId`. The wrong form produces yet another error response, silently swallowed by the same fallback.

## Fix: raw response first, jq without fallback probes

The principle in one line: establish what the response is before asking what a field equals. In code, treat a missing `TotalCount` as failure instead of as zero:

```bash
resp=$(aliyun ecs DescribeCommands --CommandId "c-xxx" 2>&1)  # singular flag, capture stderr

# no TotalCount field = API-level failure: print raw and abort, no defaults
echo "$resp" | jq -e '.TotalCount' >/dev/null 2>&1 \
  || { echo "API call failed: $resp"; exit 1; }

count=$(echo "$resp" | jq -r '.TotalCount')
[ "$count" -eq 0 ] && aliyun ecs CreateCommand ...   # only now is "missing" trustworthy
```

`jq -e '.TotalCount'` exits non-zero when the field is absent — it replaces `// 0` by escalating "field not found" into an explicit failure. The raw response `$resp` prints alongside the error, so a human can tell a parameter mistake from a server-side error at a glance.

One boundary worth adding: a `CommandId` returned by `CreateCommand` doesn't guarantee the object is usable — invoke may still report `InvalidCmdId.NotFound` while `DescribeCommands` already counts TotalCount=1. So after recreating, verify existence before invoking; on NotFound, recreate — with the raw-response reading above, never with another fallback.

## Reading results: nesting and the two IDs

The read-back side has its own silent failures. `DescribeInvocationResults` nests objects inside objects; the correct path is:

```bash
jq -r '.Invocation.InvocationResults.InvocationResult[0].Output' \
  <<< "$resp" | base64 -d
```

Writing it with array intuition as `.InvocationResults[0]` throws `Cannot index object with number` — the failure is in the accessor, and the data is already in the response. The other confusion source is the ID system: `InvokeCommand` returns an `InvokeId` (`t-` prefix), while `DescribeInvocationResults` only accepts a `CommandId` (`c-` prefix); if only the InvokeId is at hand, exchange it via `DescribeInvocations --InvokeId` first. When polling, terminal states are exactly `Success` and `Failed`, and results deserve a ~10-second wait after dispatch.

Cloud Assistant pitfalls travel in sets: dispatched content can get corrupted (heredoc assembly) and background jobs get killed (nohup) — see [Aliyun RunCommand Corrupts Files? Ship base64, Not heredoc](/blog/aliyun-runcommand-heredoc-parse-error) and [Aliyun Assistant Kills nohup Jobs? Escape with setsid](/blog/aliyun-cloud-assistant-nohup-setsid).

<InfoBox variant="warning" title="Notes">

- Always capture aliyun CLI calls with `2>&1` and judge the response text; the exit code is untrustworthy (errors also exit 0).
- Never use jq `// default` as a failure probe — a missing field should fail loudly, not default to zero.
- `DescribeCommands` takes singular `--CommandId`; the array-style `.1` suffix belongs to `InvokeCommand`.
- `DescribeInvocationResults` only accepts a `CommandId`; the path is `.Invocation.InvocationResults.InvocationResult[0]`.

</InfoBox>

## FAQ

### What should I watch out for when parsing aliyun CLI output with jq?

The biggest trap is fallback defaults: jq -r '.TotalCount // 0' prints 0 on an error response instead of failing — error JSON goes to stderr with exit code 0, and when TotalCount is missing, the default washes the failure into a legitimate-looking empty result. Capture the raw response with 2>&1 and read it before applying jq, and never use a // default as a failure probe.

### Why does the aliyun CLI return success even when the API call failed?

The CLI prints API-level error JSON to stderr while the process exit code stays 0 — set -e and || exit never see it. Failure detection must be based on response content (error code / message fields), never on the exit code.

### Why can't DescribeInvocationResults read my results?

Two common causes. Wrong nesting: the result is an object inside an object, and the correct path is .Invocation.InvocationResults.InvocationResult[0] — the array-style .InvocationResults[0] throws Cannot index object with number even though the data is right there. Mixed IDs: DescribeInvocationResults only accepts a CommandId (c- prefix); if all you have is an InvokeId (t- prefix), exchange it first via DescribeInvocations --InvokeId.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
