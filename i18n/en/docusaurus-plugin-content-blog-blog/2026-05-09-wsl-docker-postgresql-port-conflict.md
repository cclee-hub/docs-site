---
title: "PostgreSQL Authentication Failed in WSL? Docker Is Silently Using Your Port"
description: "Docker Desktop silently occupies port 5432 in WSL2, causing SSH tunnels to connect to the wrong PostgreSQL instance."
date: 2026-05-09
tags: [WSL, Docker, PostgreSQL]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does SSH tunnel to PostgreSQL show password authentication failed in WSL2?"
    a: "Docker Desktop may be occupying port 5432, so the tunnel connects to the container, not the remote server."
  - q: "Does Docker Desktop automatically use port 5432 in WSL2?"
    a: "Yes. If any container maps 5432, Docker listens on that port in the WSL2 network layer."
  - q: "How to use a different port for PostgreSQL in development?"
    a: "Create .env.local with DATABASE_URL pointing to the new port, and load it with priority over .env."
---

## TL;DR

Docker Desktop silently occupies port 5432 in WSL2. An SSH tunnel to `localhost:5432` actually connects to Docker's PostgreSQL instead of the remote server. The `password authentication failed` error is misleading — the password is correct, but you're talking to the wrong instance. Fix: change the tunnel to local port 5433 and isolate the dev config with `.env.local`.

---

## Problem

Connecting to remote PostgreSQL via SSH tunnel fails with:

```
PostgresError: password authentication failed for user "postgres"
  severity: 'FATAL'
  code: '28P01'
  file: 'auth.c'
  routine: 'auth_failed'
```

The tunnel command appears to succeed without errors:

```bash
ssh -L 5432:localhost:5432 -L 3003:localhost:3003 user@server -N &
```

No error from the tunnel itself, but the connection always fails authentication. The password is verified correct — direct login on the remote server works fine.

---

## Root Cause

In WSL2's network architecture, Docker Desktop creates virtual network interfaces inside WSL2. When a Docker container maps `5432:5432`, Docker listens on port 5432 in the WSL2 network layer.

The SSH tunnel `-L 5432:localhost:5432` forwards local port 5432 to the remote server's port 5432. But local port 5432 is already taken by Docker — the tunnel binding silently fails and the connection gets intercepted by Docker.

The result: `localhost:5432` connects to the PostgreSQL instance inside the Docker container, not the remote server. That container has different user credentials, so it throws `password authentication failed`.

**What makes this deceptive**: the message says "wrong password," not "port occupied" or "tunnel failed." You end up re-checking the password repeatedly while the real problem is connecting to the wrong machine.

---

## Solution

### Step 1: Identify the conflict

```bash
# Inside WSL2
ss -tlnp | grep 5432
```

WSL may not show it (Docker ports map from the Windows side). Cross-check from PowerShell:

```powershell
netstat -ano | findstr :5432
```

If you see `docker-proxy` on port 5432, the conflict is confirmed.

### Step 2: Change the tunnel port

```bash
# Before: local port 5432 (conflicts with Docker)
ssh -L 5432:localhost:5432 user@server -N &

# After: local port 5433 (no conflict)
ssh -L 5433:localhost:5432 user@server -N &
```

The `-L` format is `local_port:remote_host:remote_port`. Only the local port changed — the remote server still uses 5432.

### Step 3: Create .env.local for dev config

```bash
# server/.env.local (add to .gitignore)
DATABASE_URL=postgresql://postgres:your_password@localhost:5433/your_db
```

### Step 4: Modify dotenv loading to prioritize .env.local

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

## Important Notes

<InfoBox variant="warning" title="Error messages can mislead you">
  `password authentication failed` does not always mean the password is wrong. When connected to a different instance (like Docker's PostgreSQL), that instance may not have the same user or password, producing the same error. If the password is verified correct, prioritize checking whether you're connecting to the right instance.
</InfoBox>

<InfoBox variant="warning" title="Don't hardcode a different port in app code">
  Change the local port at the SSH tunnel level and manage it through `.env.local`. Don't change the default port in application code — that breaks production and container connections. Environment differences should be resolved through environment variables, not hardcoded values.
</InfoBox>

<InfoBox variant="warning" title="WSL port issues: check the Windows side">
  Docker Desktop in WSL2 mode maps container ports directly in the Windows network layer. `ss` and `lsof` inside WSL won't show the PID. When encountering mysterious port conflicts, check Windows side with `netstat -ano`.
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
