---
title: "Two WSL2 + Docker Networking Pitfalls: Silently Occupied Ports & Host Mode localhost Unreachable"
description: "Docker Desktop silently occupies ports in WSL2 causing SSH tunnels to connect to the wrong database, and host network mode localhost can't reach containers — diagnosis and solutions for two common issues"
date: 2026-05-09
tags: [WSL, Docker, PostgreSQL]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "SSH tunnel to PostgreSQL shows password authentication failed in WSL2 — how to debug?"
    a: "Check if port 5432 is occupied by Docker first, then use a different local port for the tunnel."
  - q: "Does Docker Desktop automatically use port 5432 in WSL2?"
    a: "Yes. When a container maps 5432, Docker listens on that port in the WSL2 network layer, and SSH tunnels silently connect to the container instance."
  - q: "How to use a different port for PostgreSQL in development?"
    a: "Create .env.local with DATABASE_URL pointing to the new port, and load it with priority over .env."
  - q: "curl localhost fails to reach Docker container in WSL2, but docker ps shows it running?"
    a: "Docker Desktop's host mode shares the Hyper-V utility VM's network stack, not WSL2's. Switch to bridge network with port mapping (-p) instead."
---

## TL;DR

Two common networking pitfalls with WSL2 + Docker Desktop:

1. **Silently occupied port**: When a Docker container maps 5432, SSH tunnel `localhost:5432` connects to the container's PostgreSQL instead of the remote server — the password is correct, but you're hitting the wrong instance
2. **Host mode localhost unreachable**: `network_mode: host` shares the Docker utility VM's network, not WSL2's — `curl localhost:8080` fails


<!-- truncate -->
---

## Scenario 1: Docker Silently Occupies Port, SSH Tunnel Connects to Wrong Database

### Problem

Connecting to remote PostgreSQL via SSH tunnel fails with:

```
PostgresError: password authentication failed for user "postgres"
  severity: 'FATAL'
  code: '28P01'
  file: 'auth.c'
  line: '329'
  routine: 'auth_failed'
```

The tunnel command appears to succeed without errors:

```bash
ssh -L 5432:localhost:5432 -L 3003:localhost:3003 user@server -N &
```

No error from the tunnel itself, but the connection always fails authentication. The password is verified correct — direct login on the remote server works fine.

### Root Cause

In WSL2's network architecture, Docker Desktop creates virtual network interfaces inside WSL2. When a Docker container maps `5432:5432`, Docker listens on port 5432 in the WSL2 network layer.

The SSH tunnel `-L 5432:localhost:5432` forwards local port 5432 to the remote server's port 5432. But local port 5432 is already taken by Docker — the tunnel binding silently fails and the connection gets intercepted by Docker.

The result: `localhost:5432` connects to the PostgreSQL instance inside the Docker container, not the remote server. That container has different user credentials, so it throws `password authentication failed`.

**What makes this deceptive**: the message says "wrong password," not "port occupied" or "tunnel failed." You end up re-checking the password repeatedly while the real problem is connecting to the wrong machine.

### Solution

**Step 1: Identify the conflict**

```bash
# Inside WSL2
ss -tlnp | grep 5432
```

WSL may not show it (Docker ports map from the Windows side). Cross-check from PowerShell:

```powershell
netstat -ano | findstr :5432
```

If you see `docker-proxy` on port 5432, the conflict is confirmed.

**Step 2: Change the tunnel port**

```bash
# Before: local port 5432 (conflicts with Docker)
ssh -L 5432:localhost:5432 user@server -N &

# After: local port 5433 (no conflict)
ssh -L 5433:localhost:5432 user@server -N &
```

The `-L` format is `local_port:remote_host:remote_port`. Only the local port changed — the remote server still uses 5432.

**Step 3: Create .env.local for dev config isolation**

```bash
# server/.env.local (add to .gitignore)
DATABASE_URL=postgresql://postgres:your_password@localhost:5433/your_db
```

**Step 4: Modify dotenv loading to prioritize .env.local**

```typescript
// Before:
import 'dotenv/config';

// After:
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

if (existsSync(resolve(__dirname, '../.env.local'))) {
  dotenv.config({ path: resolve(__dirname, '../.env.local') });
} else {
  dotenv.config();
}
```

Development uses `.env.local` (port 5433), production continues using `.env` (port 5432). Two configs, zero interference.

---

## Scenario 2: Docker Host Network Mode, localhost Can't Reach Container

### Problem

Starting an Airflow container on WSL2 with `network_mode: host`:

```yaml
services:
  airflow-webserver:
    network_mode: host
    environment:
      - AIRFLOW__WEBSERVER__WEB_SERVER_PORT=8080
```

```bash
# Container runs fine
$ docker ps
STATUS          PORTS
Up 5 minutes    # No port mapping (host mode doesn't need it)

# But can't reach it from WSL2 terminal
$ curl localhost:8080
curl: (7) Failed to connect to localhost port 8080: Connection refused

# Inside the container it works fine
$ docker exec airflow-webserver curl localhost:8080
# Returns 200 OK
```

### Root Cause

Docker Desktop for Windows networking architecture:

```
┌─────────────────────────────────────────────┐
│  Windows Host                               │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │  WSL2 VM     │  │  Docker Desktop VM  │  │
│  │  (terminal)  │  │  (utility VM)       │  │
│  │  localhost ──✗──│  host net ──── container │
│  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

`network_mode: host` makes the container share the Docker Desktop **utility VM's** network stack. But WSL2 is a **separate VM** — its `localhost` and the Docker Desktop VM's `localhost` are different network namespaces.

On native Linux Docker, host mode shares the host's network directly, so `localhost` works. Docker Desktop for Windows adds an extra VM layer, breaking this assumption.

### Solution

Use `docker-compose.override.yml` to switch to bridge network:

```yaml
# docker-compose.override.yml
services:
  airflow-webserver:
    # Reset host mode (must be in each service, not in YAML anchor)
    network_mode: !reset null
    networks:
      - containers_default
    ports:
      - "8082:8082"  # Avoid conflict with local pgAdmin on 8080
    environment:
      - AIRFLOW__WEBSERVER__WEB_SERVER_PORT=8082

  airflow-scheduler:
    network_mode: !reset null
    networks:
      - containers_default

networks:
  containers_default:
    external: true  # Reuse existing Docker network
```

Verify:

```bash
docker compose down && docker compose up -d
curl localhost:8082  # Returns 200 OK
```

---

## Caveats

<InfoBox variant="warning" title="Error messages can mislead you">
  `password authentication failed` does not always mean the password is wrong. When connected to a different instance (like Docker's PostgreSQL), that instance may not have the same user or password, producing the same error. If the password is verified correct, prioritize checking whether you're connecting to the right instance. If data writes show all zeros after connecting, the issue might be a [Drizzle sql template parameterization pitfall](/blog/2026/05/18/drizzle-raw-sql-expression-as-parameter) rather than a connection problem.
</InfoBox>

<InfoBox variant="warning" title="Don't hardcode a different port in app code">
  Change the local port at the SSH tunnel level and manage it through `.env.local`. Don't change the default port in application code — that breaks production and container connections. Environment differences should be resolved through environment variables, not hardcoded values.
</InfoBox>

<InfoBox variant="warning" title="WSL port issues: check the Windows side">
  Docker Desktop in WSL2 mode maps container ports directly in the Windows network layer. `ss` and `lsof` inside WSL won't show the PID. When encountering mysterious port conflicts, check Windows side with `netstat -ano`.
</InfoBox>

<InfoBox variant="warning" title="docker-compose !reset cannot be placed in YAML anchors">
  `!reset` must be written in each service definition. Placing it inside a `&common` anchor doesn't work. Production Linux servers work fine with `host` mode — only Docker Desktop + WSL2 environments need the override.
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
