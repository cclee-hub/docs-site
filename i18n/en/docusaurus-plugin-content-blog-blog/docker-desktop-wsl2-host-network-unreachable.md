---
title: "Container Port Unreachable from WSL2? The Docker Desktop network_mode:host Trap"
description: "Docker Desktop WSL2 containers with network_mode:host have ports inaccessible from the host. The host mode shares the utility VM's network, not WSL2's. Fix: use bridge mode + external network + port mapping."
date: 2026-05-09
tags: [Docker, WSL2, Docker Compose]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why can't I curl a network_mode:host container port from WSL2?"
    a: "Docker Desktop's host mode shares the internal utility VM's network namespace, not WSL2's. The container listens inside the VM, but WSL2's ss won't show it."
  - q: "How to remove network_mode:host in a docker-compose override?"
    a: "Use network_mode: !reset (requires Compose v2.24+). Important: !reset must be in each service definition, not inside a YAML anchor."
---

Encountered this issue while building an AI data analytics platform (Airflow + PostgreSQL) for a client. Here's the root cause and solution.

## TL;DR

On Docker Desktop for Windows (WSL2 backend), `network_mode: host` container ports are unreachable from the WSL2 host. The container shows the port listening, but `curl localhost:PORT` returns connection refused. The fix: use `network_mode: !reset` in your override file to remove host mode, then switch to bridge + external network + port mapping.


<!-- truncate -->
## Problem

A project uses `docker-compose.yml` with host networking for Airflow:

```yaml
x-airflow-common:
  &airflow-common
  image: airflow-ai-dag:latest
  network_mode: host  # Works on servers, breaks on WSL2
  volumes:
    - ..:/opt/airflow/project

services:
  airflow-webserver:
    <<: *airflow-common
    command: webserver
    environment:
      - AIRFLOW__WEBSERVER__WEB_SERVER_PORT=8082
```

Container starts normally, logs confirm port binding:

```
[INFO] Listening at: http://0.0.0.0:8082
```

But unreachable from the host:

```bash
$ ss -tlnp | grep 8082
# Empty, nothing listening

$ curl localhost:8082/health
curl: (7) Failed to connect to localhost port 8082
```

Meanwhile, a pgAdmin container with `-p 8080:80` works fine at `localhost:8080`.

## Root Cause

**Docker Desktop for Windows has a different network architecture than native Linux Docker:**

```
Windows Browser
    ↕
WSL2 Host (your terminal)
    ↕ Docker Desktop pipeline
Docker Desktop Utility VM  ← network_mode: host points HERE
    ↕
Containers
```

On a Linux server, `network_mode: host` shares the host's network directly — container ports = host ports. But on Docker Desktop WSL2:

- **"host" in host mode** = the Docker Desktop utility VM, not WSL2
- Container's `/proc/net/tcp` shows the port listening
- WSL2 host's `/proc/net/tcp` has no matching entry
- Containers with `-p` port mapping are unaffected (Docker Desktop auto-forwards them)

**Verification:** Compare network namespaces:

```bash
# Inside container: 8082 (hex 1F92) is listening
$ docker exec webserver grep '1F92' /proc/net/tcp
4: 00000000:1F92 00000000:0000 0A ...

# On WSL2 host: 8082 doesn't exist
$ grep '1F92' /proc/net/tcp
# No output
```

## Solution

### Step 1: Create docker-compose.override.yml

Use `!reset` to remove the base's `network_mode: host` (requires Compose v2.24+):

```yaml
# docker-compose.override.yml
services:
  airflow-webserver:
    network_mode: !reset        # Remove base's host mode
    networks:
      - app_network             # Join external network
    ports:
      - "8082:8082"             # Port mapping
    environment:
      - DB_HOST=postgres-db     # Use container name for DB

  airflow-scheduler:
    network_mode: !reset
    networks:
      - app_network
    environment:
      - DB_HOST=postgres-db

networks:
  app_network:
    external: true              # Reference existing external network
```

### Step 2: Ensure DB container is on the same network

```bash
# Check which network the DB container uses
$ docker inspect postgres-db --format '{{json .NetworkSettings.Networks}}'
# {"app_network": {...}}

# Create the network if it doesn't exist
$ docker network create app_network   # Skip if already exists
```

### Step 3: Restart and verify

```bash
$ docker compose down
$ docker compose up -d
```

Verify:

```bash
$ ss -tlnp | grep 8082
LISTEN 0 4096 *:8082 *:*

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:8082/health
200
```

### Key Point: `!reset` Must Be in Service Definitions

This does **NOT** work:

```yaml
# ❌ Wrong: inside an anchor
x-airflow-local:
  &airflow-local
  network_mode: !reset    # Doesn't work!
  networks:
    - app_network

services:
  airflow-webserver:
    <<: *airflow-local    # Base's network_mode:host still present after merge
```

Correct:

```yaml
# ✅ Correct: in each service definition
services:
  airflow-webserver:
    network_mode: !reset  # Must be here
    networks:
      - app_network
```

<InfoBox variant="warning" title="Caveats">

- `network_mode: !reset` requires Docker Compose v2.24+. Check with `docker compose version`
- `!reset` only works on scalar fields (like `network_mode`), not lists or dictionaries
- If the base uses YAML anchors (`<<: *anchor`), `!reset` must be at the service definition level, not inside another anchor
- After switching to bridge mode, containers can't reach each other via `localhost` — use container names or a shared Docker network
- `network_mode` and `networks` are mutually exclusive; having both causes a `mutually exclusive` error

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
