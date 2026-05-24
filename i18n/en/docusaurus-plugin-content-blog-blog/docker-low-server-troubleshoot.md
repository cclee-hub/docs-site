---
title: "Disk 93%, CPU 160% on a 2-Core Server? Three Docker Resource Black Holes Explained"
description: "Low-spec server resource exhaustion: Milvus 13GB log bloat, 32 idle Airflow workers, and docker compose restart not loading .env"
date: 2026-05-24
tags: [docker, devops, airflow, milvus, troubleshooting]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to limit Docker container log size?"
    a: "Add a logging configuration to your docker-compose service: set driver to json-file, and configure max-size and max-file in options. Recommended: max-size: 100m, max-file: 3."
  - q: "Why is docker compose .env not working after restart?"
    a: "docker compose restart only restarts the container without reloading .env files. Use docker compose up -d to recreate the container and apply new environment variables."
  - q: "How to clean up Docker disk space?"
    a: "Run docker system df to check usage breakdown, then docker system prune -a to remove unused images and cache. More importantly, check du -h /var/lib/docker/containers for container log bloat."
  - q: "How to diagnose Airflow scheduler high CPU?"
    a: "Use docker top to check the number of processes inside the container. LocalExecutor spawns 32 workers by default — on a low-core machine they idle-wait and consume all CPU. Set AIRFLOW__CORE__PARALLELISM to match your core count."
---

While maintaining a 2-core 7GB cloud server for a client, I discovered disk usage at 93% (only 3GB free) and Airflow scheduler consistently consuming 160% CPU. Here's the complete diagnosis and fix.

<!-- truncate -->

## TL;DR

Three independent issues combined to exhaust server resources:
1. **Milvus container log had no size limit**, growing to 13GB
2. **Airflow LocalExecutor spawned 32 workers by default**, idling on a 2-core machine
3. **`docker compose restart` doesn't reload .env**, requiring `up -d` to recreate containers

## Scenario 1: Disk at 93%, Only 3GB Free

### Symptoms

```bash
$ df -h /
/dev/vda3        40G   35G  3.0G  93% /
```

`docker system df` showed 10G+ reclaimable, but `docker system prune -a` only freed 2.4GB.

### Root Cause

Drilling into `/var`:

```bash
$ du -h /var/lib/docker --max-depth=2 | sort -rh | head -5
19G    /var/lib/docker
13G    /var/lib/docker/containers/ee487bb...
```

A single container directory consumed 13GB. Confirming the log file:

```bash
$ ls -lh /var/lib/docker/containers/ee487bb*/ee487bb*-json.log
-rw-r----- 1 root root 13G May 24 22:43 ee487bb...-json.log
```

The Milvus vector database container (`rag-service-milvus-1`) had no size limit on stdout/stderr logs, growing indefinitely until it filled the disk.

### Solution

**Step 1: Truncate the log file**

```bash
truncate -s 0 /var/lib/docker/containers/ee487bb*/ee487bb*-json.log
```

**Step 2: Add log rotation in docker-compose.yml**

```yaml
services:
  milvus:
    # ... other config
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
```

**Step 3: Recreate the container to apply the config**

```bash
docker compose up -d milvus
```

If you're dealing with Docker networking issues as well, check out [Docker Desktop WSL2 Host Network Unreachable Fix](/blog/docker-desktop-wsl2-host-network-unreachable).

Result: disk usage dropped from **93% to 53%**, freeing ~13GB.

<InfoBox variant="warning" title="Important">

`truncate` works on a running container — no stop needed. But the long-term fix is adding `logging` config to **all** Docker services, not just the one that blew up. Docker doesn't rotate container logs by default, a commonly overlooked configuration.

</InfoBox>

## Scenario 2: Airflow Scheduler at 160% CPU

### Symptoms

```bash
$ docker stats --no-stream
CONTAINER ID   NAME                          CPU %
9d4b3d60449e   deploy-airflow-scheduler-1    161.92%
```

No active DAG Runs (0 running, 0 queued), yet CPU stayed at 160%+.

### Root Cause

Checking processes from the host:

```bash
$ docker top deploy-airflow-scheduler-1
CMD
airflow scheduler                    # Main process x1
airflow executor -- LocalExecutor    # Executor x1
airflow worker -- LocalExecutor      # Workers x32
airflow scheduler -- DagFileProcessorManager  # DAG parser x1
gunicorn: worker                     # Built-in service x2
```

**37 processes total**, with LocalExecutor Workers accounting for 32 of them. Airflow's `LocalExecutor` defaults to `parallelism=32`, meaning even with zero tasks running, 32 worker processes continuously poll. On a 2-core machine, process scheduling overhead alone consumed 160% CPU.

### Solution

Set in Airflow's `.env`:

```bash
AIRFLOW__CORE__PARALLELISM=2
```

Match the value to your machine's core count.

## Scenario 3: docker compose restart Doesn't Load .env

### Symptoms

After changing `AIRFLOW__SCHEDULER__SCHEDULER_HEARTBEAT_SEC` in `.env`:

```bash
docker compose restart airflow-scheduler
```

Checking inside the container — the value hadn't changed.

### Root Cause

`docker compose restart` only stops and starts the existing container. It doesn't re-read `.env` files. Environment variables are injected at container creation time; restart doesn't trigger recreation.

Verification:

```bash
# After restart (value unchanged)
$ docker exec airflow-scheduler airflow config get-value scheduler scheduler_heartbeat_sec
5

# After up -d recreation (value updated)
$ docker exec airflow-scheduler airflow config get-value scheduler scheduler_heartbeat_sec
60
```

### Solution

After modifying `.env`, use `up -d` instead of `restart`:

```bash
docker compose up -d airflow-scheduler
```

`up -d` detects configuration changes and recreates the container, applying new environment variables.

<InfoBox variant="warning" title="Important">

This applies to any Docker Compose service using `.env` or `environment` for configuration, not just Airflow. Remember: **`restart` = restart, `up -d` = recreate**. For more Docker volume and mount pitfalls, see [Docker Volume Override vs Bind Mount](/blog/docker-volume-override-bind-mount).

</InfoBox>

## Troubleshooting Command Cheat Sheet

When a low-spec server shows resource anomalies, follow this order:

```bash
# 1. Resource overview
free -h && df -h && nproc
docker stats --no-stream

# 2. Find disk hogs
du -h /var --max-depth=2 | sort -rh | head -20

# 3. Docker disk breakdown
docker system df

# 4. Check container log sizes (replace with your container ID)
ls -lh /var/lib/docker/containers/*/*-json.log

# 5. Count processes inside a container
docker top <container_name>

# 6. Verify environment variables
docker exec <container> env | grep <KEY>
```

## FAQ

### How to limit Docker container log size?

Add a `logging` configuration in your `docker-compose.yml`:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "3"
```

This keeps a maximum of 3 log files per container, each capped at 100MB — no more than 300MB total. You'll need `docker compose up -d` to recreate the container for changes to take effect.

### Why is docker compose .env not working after restart?

`docker compose restart` only restarts the container without reloading `.env` files. Use `docker compose up -d` to recreate the container and apply updated environment variables.

### How to clean up Docker disk space?

Run `docker system df` to check the usage breakdown, then `docker system prune -a` to remove unused images and cache. More importantly, check `du -h /var/lib/docker/containers` for container log bloat — a hidden disk killer many people overlook.

### How to diagnose Airflow scheduler high CPU?

Use `docker top` to inspect the number of processes inside the container. If LocalExecutor has spawned a large number of workers (default is 32), they'll idle-wait and consume all CPU on a low-core machine. Set `AIRFLOW__CORE__PARALLELISM` to match your core count — use 2 for a 2-core machine.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-3">Managing Docker in production?</p>
  <a href="https://ai.ccleeai.com" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">Explore CCLHub AI Analytics Platform</a>
</div>
