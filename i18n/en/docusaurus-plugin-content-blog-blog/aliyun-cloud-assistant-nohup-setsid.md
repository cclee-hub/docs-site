---
title: "Aliyun Assistant Kills nohup Jobs? Escape with setsid"
description: "nohup jobs started in an Aliyun Cloud Assistant call die when it returns — cleanup sweeps by session. setsid escapes it; verify output before reading."
date: 2026-10-22
tags: [Alibaba Cloud, Cloud Assistant, Linux, Bug Fixes]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why did my nohup process disappear anyway?"
    a: "nohup does exactly two things: ignore SIGHUP and redirect output. The process stays in the original session, and Cloud Assistant cleans up the invocation's derived processes by session when the call ends — in one verified case strace, a sampler and a watcher all died while the invocation itself returned success with no error. A new session via setsid is what escapes the cleanup."
  - q: "A nohup job quits after running for a while — what's going on?"
    a: "Three usual causes: the launcher's session being torn down, stdin still attached to a closed terminal, or a vanished redirect target. Check the timing: the sampler in this case stopped after exactly one sample, in sync with the invocation returning — that pinned the cause to invocation cleanup, not a crash."
  - q: "How do I keep a script running in the background of a Cloud Assistant RunCommand?"
    a: "Use the three-piece form: setsid nohup cmd < /dev/null &. The new session is outside the end-of-invocation cleanup, so the job survives across calls. Before reading results, check the output file's line count and mtime — an empty or half-filled file means the job died, not that the command never ran."
---

While using Aliyun Cloud Assistant RunCommand to start an strace sampler, a watch loop and a periodic sampler on a server, the background jobs were silently reaped the moment the call returned — the output was an empty file, or a half file with exactly one sample, and nothing ever logged an error.

Ran into this while providing [managed hosting for a WordPress site in China](/cases/waterpark-china-hosting-migration) — full-site migration, image CDN offload, daily backups and automated patrols.

## TL;DR

When a Cloud Assistant invocation ends, the agent cleans up the background processes derived from it, and nohup does not save them — it only ignores SIGHUP and redirects output, leaving the process in the original session, right inside the cleanup's reach. A new session via setsid is what escapes: `setsid nohup cmd < /dev/null &`. And before reading results back, verify the output file's line count and mtime — do not read an empty file as "the command never ran".

## Symptoms: the call returns, the background jobs vanish

Background jobs started with `nohup cmd &` inside one RunCommand invocation died in three different shapes:

| Job | How it died |
|------|------|
| strace sampler | Output file never created at all |
| Periodic sampler v1 | Wrote exactly one sample, then nothing |
| cpdavd watcher, first version | Reaped; process gone |

All three share two traits: the invocation itself returned `Success`, and the server logged no error anywhere. Searching "nohup process disappeared" mostly points at SIGHUP — but nohup was already in place.

## Root cause: nohup never changes the session, and cleanup sweeps by session

nohup's contract is two lines long: ignore SIGHUP, redirect output to nohup.out. What it does not do is change the session — the process stays inside the session the Cloud Assistant agent created for this invocation. When the invocation finishes, the agent cleans up the processes derived from it, grouped by session, and nohup jobs fall squarely inside.

setsid is the semantics that actually addresses this: it puts the new process into a brand-new session, detached from the invocation's. Detached, the end-of-invocation sweep never reaches it — verified across all three job types, all of which survived once setsid went in.

One honest boundary: whether the agent sweeps by process group or by session was not verified at source level. But "leave the original session and you survive" held as a sufficient condition on every job tested, and that is enough.

## Fix: the setsid three-piece form, plus output verification

Detaching from session, terminal and foreground in one line:

```bash
# Long-running job started from inside a Cloud Assistant script (sampler example)
setsid nohup /usr/local/bin/sampler --interval 60 -o /tmp/samples.csv </dev/null >/tmp/sampler.log 2>&1 &
```

Do not drop `</dev/null` — a background job whose stdin still hangs on the invocation's terminal semantics can survive the cleanup and still stall.

Cloud Assistant is asynchronous in three steps (CreateCommand → InvokeCommand → DescribeInvocationResults); fetch results about 10 seconds after invoking, and let the script exit normally after spawning the background job — no waiting required.

Before reading results back, verify the job actually lived:

```bash
# Line count should match the expected sample count; mtime should keep advancing
wc -l /tmp/samples.csv
stat -c %Y /tmp/samples.csv
```

An empty file or a single sample means the job died — go check the setsid form, not the business command. This "spawn remotely, read back later, verify output first" loop, combined with Cloud Assistant's ActionTrail audit trail, is a complete emergency-diagnostics workflow.

The lesson also explains the architecture behind [CCLee Server Sentinel](/docs/server-sentinel), a Linux server monitoring service: collection runs through a resident agent and local cron on each machine, and backup scripts run locally without depending on a central server — a long-lived job's lifecycle should never be bound to the tail end of a single remote invocation.

<InfoBox variant="warning" title="Note">

The verified form is `setsid nohup cmd < /dev/null &`, and each piece does one job: setsid changes the session, nohup covers SIGHUP and output, stdin redirection cuts terminal semantics. Put output verification before the read-back — the invocation's `Success` only means the script finished, not that the background job is alive. And since a setsid job has left the invocation's session, later invocations cannot manage it directly; leave a PID file or locate it by process name.

</InfoBox>

## FAQ

### Why did my nohup process disappear anyway?

nohup does exactly two things: ignore SIGHUP and redirect output. The process stays in the original session, and Cloud Assistant cleans up the invocation's derived processes by session when the call ends — in one verified case strace, a sampler and a watcher all died while the invocation itself returned success with no error. A new session via setsid is what escapes the cleanup.

### A nohup job quits after running for a while — what's going on?

Three usual causes: the launcher's session being torn down, stdin still attached to a closed terminal, or a vanished redirect target. Check the timing: the sampler in this case stopped after exactly one sample, in sync with the invocation returning — that pinned the cause to invocation cleanup, not a crash.

### How do I keep a script running in the background of a Cloud Assistant RunCommand?

Use the three-piece form: `setsid nohup cmd < /dev/null &`. The new session is outside the end-of-invocation cleanup, so the job survives across calls. Before reading results, check the output file's line count and mtime — an empty or half-filled file means the job died, not that the command never ran.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
