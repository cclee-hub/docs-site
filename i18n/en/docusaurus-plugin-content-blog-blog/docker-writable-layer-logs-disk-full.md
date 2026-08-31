---
title: "Container Logs Filling Your Server Disk? docker system df 'Reclaimable' Lies"
description: "Disk at 81% but business data looks small? docker system df shows images 100% reclaimable — yet all 7 are running. Locate the real space hogs with du -xh: task logs in container writable layers, npm/pnpm caches, and never-pruned backup clones."
date: 2026-08-28
tags: [Docker, DevOps, Airflow, Ops]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "docker system df shows 100% RECLAIMABLE — can I just delete?"
    a: "No. RECLAIMABLE estimates space with no container reference, and running (active) images can still be flagged 100% reclaimable — all 7 of ours were. Base cleanup decisions on du + docker ps -as measurements, not this number."
  - q: "What's the difference between docker ps SIZE and docker system df SIZE?"
    a: "docker ps -as SIZE is that container's writable layer; docker system df aggregates images/containers/volumes/cache. Logs accumulating inside a container only ever show up in the writable layer, never in any image size."
  - q: "How do I clean up a Docker server running out of disk?"
    a: "Three categories: delete package-manager caches directly (npm cache clean, pnpm store prune); reclaim writable layers with compose force-recreate (restarts the service); add TTL pruning to backup/log directories. Always run du -xh -d1 first to find the hogs."
---

The alert email: production server root partition at 81% (30G/40G, past the 80% red line). First instinct: check `docker system df` — and there it is, images at `RECLAIMABLE 100% (7)`, apparently a quick win. Except all 7 images are running; following the hint with `docker image prune -a` would be a production incident.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics platform that surfaces market trends, user behavior, and sales data; the disk in question belongs to the Docker server running its Airflow data pipeline.

## TL;DR

Past a disk red line, **don't trust `docker system df` RECLAIMABLE** — it's an estimate of "space with no container reference", and active images get flagged 100% anyway. The right move: `sudo du -xh -d1 /` layer by layer. This incident's three invisible hogs were none of them business data: **task logs accumulating in container writable layers** (no log volume in the Dockerfile), **package-manager caches** (npm + pnpm, ~4G combined), and **a backup script that never pruned** (full clones every run). Fixes: delete caches, reclaim writable layers with `force-recreate`, add TTL pruning to the backup script — 81% back down to 64%.

## Symptoms

```text
$ df -h /
Filesystem      Size  Used Use% Mounted on
/dev/vda1        40G   30G  81% /

$ docker system df
TYPE        TOTAL   ACTIVE   SIZE     RECLAIMABLE
Images      7       7        4.2GB    100% (7)    ← all running
Containers  5       5        810MB    0%
```

Acting on `docker system df` (clean images) is a dead end — RECLAIMABLE says 100% but ACTIVE says 7/7. Where the space actually went, `docker system df` never shows:

```text
sudo du -xh -d1 / | sort -rh | head
# selected output:
# 2.7G    /root/.npm              ← npm cache
# 1.1G    /root/.local/share/pnpm ← pnpm store
# 857M    /root/backups-git       ← backup clones, never pruned
# (hidden in overlay2: airflow scheduler writable layer 468M + dag-processor 257M)
```

## Root Cause

Three kinds of consumption, all invisible from the "business data" perspective.

**Writable layers eating logs.** Airflow task logs are written inside the containers with no external volume — scheduler writable layer 468M, dag-processor 257M, ~780M accumulated in two weeks, monotonically growing. Image layers never change; the writable layer does. `docker system df` buries it in the Containers SIZE total (810M), where it has no presence.

**Package-manager caches only grow.** On a server with frequent deploys/builds, `~/.npm` (2.7G) and the pnpm store (1.1G) pile up indefinitely; nobody ever cleans them.

**A backup script that never prunes.** The backup script clones the repo worktree in full and pushes to GitHub every run — old clone directories are never removed, so 857M is mostly historical duplicates. Sneakier: orphan clones whose branch never pushed successfully can't just be deleted; verify first.

And `docker system df` RECLAIMABLE is a statistical estimate of "space not referenced by a running container" — active images can display 100% reclaimable (all 7 of ours did). It's a false-positive generator, not a cleanup guide.

## Solution

### Step 1: Locate with du, layer by layer — look before deleting

```bash
sudo du -xh -d1 / | sort -rh | head        # root partition, level by level
sudo du -xh -d1 /var/lib/docker | sort -rh | head   # drill into Docker's dir
docker ps -as --format "table {{.Names}}\t{{.Size}}"  # per-container writable layer
```

`du -x` stays on one filesystem, avoiding /proc, /sys noise and overlay confusion; `docker ps -as` SIZE exposes each container's writable layer — the key command for the "logs written inside the container" family.

### Step 2: Delete caches outright

```bash
npm cache clean --force        # or simply rm -rf ~/.npm/_cacache
pnpm store prune               # removes only unreferenced packages
```

~5.1G reclaimed, zero risk — caches re-download on demand.

### Step 3: Reclaim writable layers with force-recreate

```bash
docker compose up -d --force-recreate   # writable layer goes away with the old container
```

~780M reclaimed here. Two preconditions: pick a low-traffic window (services restart), and **rescue anything valuable first** — e.g. `docker cp` the task logs out, or they vanish with the container.

### Step 4: TTL for backups, prevent recurrence

```bash
# keep backup dirs for 7 days, prune older ones
find /root/backups-git -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

Add the pruning to the tail of the backup script (deployed in our github-backup-push.sh); before deleting, check for orphan clones whose branch never pushed (`git ls-remote` to compare) and confirm no unique commits — our 325M of orphans were removed only after verification.

After cleanup: 81% → 64%, with caches + pruning + writable layers together reclaiming ~6.7G.

<InfoBox variant="warning" title="Notes">

- `docker system df` RECLAIMABLE ≠ deletable: active images can be flagged 100% (all 7 of ours were). Decide from `du` + `docker ps -as` measurements.
- `force-recreate` restarts services and destroys writable layers — `docker cp` out any logs you need first. The real fix is an external log volume with retention rotation; writable-layer recycling is this incident's stopgap.
- Always check for orphan backups before deleting: branches that never pushed successfully — verify with `git ls-remote` first.
- Pair disk red-line alerts with the locating command: the first action on alert should be `du -xh -d1 /`, not guessing.
- For the earlier incident on the same server (disk 93% + CPU 160%), see [Debugging a 2-core/7G Docker Server Resource Black Hole](/blog/docker-low-server-troubleshoot).

</InfoBox>

## FAQ

### docker system df shows 100% RECLAIMABLE — can I just delete?

No. RECLAIMABLE estimates "space with no container reference", and running active images can still be flagged 100% reclaimable — all 7 of ours were. It answers "how much is theoretically unreferenced", not "what can be deleted". Measure first with `du -xh -d1` and `docker ps -as`.

### What's the difference between docker ps SIZE and docker system df SIZE?

`docker ps -as` SIZE is the per-container writable layer; `docker system df` is the category-level aggregation over images/containers/volumes/cache. Logs accumulating inside a container only ever appear in the writable layer (visible via `docker ps -as`), never in any image size — which is exactly why "images look small but disk keeps growing".

### How do I clean up a Docker server running out of disk?

Three categories: package-manager caches deleted outright (`npm cache clean --force`, `pnpm store prune`), zero risk; container writable layers reclaimed via `docker compose up -d --force-recreate` (service restart; rescue logs first); backups, logs, and clone directories put on TTL pruning to prevent recurrence. Before any deletion, confirm the hogs with `du -xh -d1 /`.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
