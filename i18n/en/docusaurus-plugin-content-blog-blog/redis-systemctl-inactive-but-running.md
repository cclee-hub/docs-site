---
title: "systemctl Shows inactive But the Process Is Running? Bare-Process Health Check False Negative"
description: "systemctl is-active returns inactive (exit 3) while the process is actually running, because the service isn't managed by systemd. Use a pgrep/ss fallback chain for reliable probing."
date: 2026-08-05
tags: [Linux, systemd, Redis, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does systemctl is-active show inactive when the process is actually running?"
    a: "systemctl only queries services that systemd manages via unit files. If the process was started directly or with nohup as a bare process with no unit, systemd doesn't track it and is-active simply returns inactive."
  - q: "How do you reliably check whether a process is running?"
    a: "Don't rely on systemctl alone. Use pgrep <name> to find the PID, or ss -lntp | grep <port> to confirm a listening port; for critical services add an application-level probe like redis-cli ping on top."
---

While building a server health-check endpoint, `systemctl is-active redis-server` returned `inactive` — yet Redis was happily serving requests.

Encountered this while building [AI Analytics](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operations strategy. The monitoring dashboard needs to reflect the real status of every infrastructure component, and Redis was reporting a false negative from the start.

## TL;DR

`systemctl is-active` only works for **services that systemd manages through unit files**. If Redis (or any service) runs as a bare process with no `.service` unit, `systemctl` can never see its true state and returns `inactive` (exit code 3). Reliable probing has to bypass systemctl and ask the process (`pgrep`) or the port (`ss`) directly.

## Symptoms

The probe called `systemctl is-active` for both Nginx and Redis:

```bash
$ systemctl is-active nginx
active            # ✅ fine

$ systemctl is-active redis-server
inactive          # ❌ looks like Redis is down
$ echo $?
3                 # exit code 3 = inactive
```

But every business endpoint was reading and writing Redis fine — only `/api/v1/server-monitor/status` reported Redis as down.

## Root Cause

systemd is a process manager, and **it only knows about units it started and owns**. When you run `systemctl start redis-server` (or let systemd read `redis-server.service`), systemd records that unit's state and `is-active` can return `active`.

On this server, Redis was started **as a bare process** — a direct `redis-server` invocation, or launched via nohup / a custom script, never registered as a systemd service. So:

- There is no `redis-server.service` in systemd's unit list at all;
- `systemctl is-active redis-server` can't find the unit, treats it as inactive, and returns exit 3;
- Nginx, by contrast, is a standard systemd service, so `is-active` correctly reports `active`.

In one line: **`is-active` reflects systemd's view, not the system process view.** "The process is running" and "systemd knows it's running" are two different things.

## Solution

Switch the probe to a "systemctl first → process/port fallback" chain. If systemctl hits, use it; otherwise confirm the process is actually alive with `pgrep` or `ss`. Use `execFileSync` (no shell, args passed as an array) to avoid command injection:

```ts
import { execFileSync } from "node:child_process";

/** Run a single command safely (no shell); unify non-zero exit to null */
function sh(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
  } catch {
    return null; // inactive / process missing / timeout all land here
  }
}

/**
 * Probe whether a service is up: systemctl first, bare-process fallback.
 * @param unit   systemd unit name (e.g. "nginx")
 * @param proc   process name (e.g. "redis") for the pgrep fallback
 * @param port   listening port (e.g. 6379) for the ss fallback
 */
function isServiceUp(unit: string, proc?: string, port?: number): boolean {
  // 1. Try systemctl first (standard systemd services)
  const st = sh("systemctl", ["is-active", unit]);
  if (st && st !== "inactive" && st !== "unknown") {
    return true; // active, or activating/reloading etc.
  }

  // 2. Fallback A: find a PID by process name
  if (proc && sh("pgrep", ["-f", proc])) return true;

  // 3. Fallback B: confirm a listening port
  if (port) {
    const listening = sh("ss", ["-lnt"]);
    if (listening && listening.includes(`:${port} `)) return true;
  }

  return false;
}

// Nginx: standard systemd service, systemctl hits directly
const nginxUp = isServiceUp("nginx");

// Redis: may be a bare process — pass process name + port as fallback
const redisUp = isServiceUp("redis-server", "redis", 6379);
```

The most robust final check at the application layer is to **let the service answer for itself** — Redis's `PING`, PostgreSQL's `SELECT 1`, an HTTP health endpoint. A listening port only proves "the process started", not "the service is ready", so on critical paths add one more application-level probe:

```bash
$ redis-cli ping
PONG    # process alive + responsive = truly up
```

## FAQ

### Why does systemctl is-active show inactive when the process is actually running?

`systemctl` only queries services that systemd manages through unit files. If the process was started directly or with `nohup` as a bare process with no `.service` unit, systemd neither knows about it nor tracks it, so `is-active` can only return `inactive` (exit 3). That's a blind spot in systemd's view, not the process being down.

### How do you reliably check whether a process is running?

Don't rely on systemctl alone. Use `pgrep <name>` to find the PID, or `ss -lntp | grep <port>` to confirm a listening port — these inspect the system process table / network stack, independent of systemd management. For critical services, add an application-level probe (e.g. `redis-cli ping`) to verify both that the process exists and that it responds.

<InfoBox variant="warning" title="Caveats">

- **Unit name ≠ process name**: the `redis-server` in `systemctl is-active redis-server` is the unit name, which may differ from the actual process name (`redis-server` or `redis`). Don't conflate them.
- **Set a timeout in production**: probe commands should have a short timeout (2s in the example above) and catch errors, so one stuck command doesn't drag down the whole monitoring endpoint.
- **Containerized services differ**: services running in Docker aren't visible to the host's `systemctl` — use `docker inspect` or the container healthcheck API instead of the pgrep fallback here.
- **The real fix**: migrate the bare process into a systemd unit (with `Type=`, `Restart=always`). Then `is-active` becomes accurate and you get systemd's auto-restart for free.

</InfoBox>

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
