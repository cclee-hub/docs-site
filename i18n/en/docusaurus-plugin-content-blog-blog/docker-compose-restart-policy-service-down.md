---
title: Docker Compose service won't come back after restart? Check the restart policy
description: "After a host reboot or container crash, services don't self-recover and ports stay dark because docker-compose.yml has no restart policy (default no). Production services should set restart: always or unless-stopped."
date: 2026-06-13
tags: [Docker, Docker Compose, devops, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What restart policies does docker compose support?"
    a: "Four: no (default, never restart), always (always restart), unless-stopped (unless you manually stopped it), and on-failure[:N] (restart only on non-zero exit, with optional retry cap). Production services usually use always or unless-stopped."
  - q: "How do I make a docker container restart automatically?"
    a: "Add restart: always (or unless-stopped) to the service in docker-compose.yml; or use --restart always with docker run. The container self-recovers after a crash or host reboot."
  - q: "What is the difference between restart always and unless-stopped?"
    a: "always restarts the container even if you manually docker stopped it and then restarted the Docker daemon; unless-stopped honors a manual stop and won't be brought back up when the daemon restarts."
---

> Debugging a Milvus-dependent service that failed to start in a RAG knowledge base project — full writeup below.

## TL;DR

After a host reboot (or a container crash), a group of services didn't come back: the app port had no listener and `docker ps -a` showed everything `Exited`. The root cause: `docker-compose.yml` had no `restart` policy (default `no`), so once a container died it stayed dead. Fix: set `restart: always` on every production service so the infrastructure self-heals after a crash or reboot.

{/* truncate */}

## Symptom

The entire RAG pipeline went dark at once: the app's port 3003 had no listener, the process was missing from the process manager, and the frontend chat widget, knowledge-base search, and tenant queries all 404'd.

Starting the app by hand reproduced it:

```bash
$ uvicorn app.main:app
pymilvus.exceptions.MilvusException:
Fail connecting to server on localhost:19530, server unavailable
Application startup failed. Exiting.
```

On startup the app connects to its vector DB dependency (port 19530); the connection fails and it exits. Looking at the containers:

```bash
$ docker ps -a
CONTAINER ID   IMAGE                    STATUS
abc...         milvusdb/milvus:v2.4.11  Exited (255) 4 days ago
def...         minio/minio:...          Exited (255) 4 days ago
ghi...         quay.io/coreos/etcd:v3.5 Exited (255) 4 days ago
```

Three dependency containers had been `Exited` **4 days ago** and never restarted. Every app startup failed to connect, exited, and after repeated restart failures the process manager simply dropped it from its list — presenting as a "process mysteriously vanished."

## Root cause

All three services in `docker-compose.yml` **had no `restart`**:

```yaml
# The broken setup: no restart, so the default is no
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    # ❌ no restart
  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    # ❌ no restart
  milvus:
    image: milvusdb/milvus:v2.4.11
    # ❌ no restart
```

Docker's default restart policy is `no` — once a container exits (crash, OOM, host reboot), it is **never brought back automatically**. That default is fine for development, but a ticking bomb in production:

- Host reboot → every container without a `restart` policy stays Exited
- A single container crash (OOM, transient dependency failure) → no self-heal, cascading to every upstream that depends on it
- Dependency cascade: etcd/minio down → milvus can't start → app can't connect → app exits → process manager gives up

The failure stays hidden because it **only surfaces after a reboot/crash event** — builds and deploys look completely normal in the meantime.

## Solution

Add `restart: always` to every production service:

```yaml
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    restart: always          # ✅ self-heals after crash or host reboot
  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    restart: always          # ✅
  milvus:
    image: milvusdb/milvus:v2.4.11
    restart: always          # ✅
    depends_on:
      - etcd
      - minio
```

After a reboot, the dependency containers self-recover and the app comes back:

```bash
$ docker compose up -d        # with restart policies, a host reboot auto-restarts these
$ curl localhost:9091/healthz # health check 200, dependency ready
$ pm2 start ecosystem.config.js --only rag-service  # app up, pipeline restored
```

The four restart policies compared:

| Policy | When it restarts | Use case |
|--------|------------------|----------|
| `no` (default) | Never | Ephemeral containers, one-off tasks |
| `always` | Always (even after manual stop + daemon restart) | Production infra, databases |
| `unless-stopped` | Unless you manually stopped it | Most production services (recommended) |
| `on-failure[:N]` | Only non-zero exit, optional cap | Batch jobs that exit cleanly |

If you're chasing down Docker service anomalies on a low-spec box, check container status and disk/CPU pressure first — [the three-step Docker resource-blackhole troubleshooting guide](/blog/docker-low-server-troubleshoot) covers another class of resource-exhaustion-induced service stalls.

<InfoBox variant="warning" title="Caveats">

- `restart: always` restarts the container **even on a clean exit (exit code 0)**. If your service is a "run once and exit" batch job, use `on-failure` or `unless-stopped`, or it'll loop forever.
- `depends_on` **waits for "started", not "ready"**. Milvus is slow to start, and the app may try to connect before it's ready — add retry logic in the app, or use a healthcheck with `depends_on.condition: service_healthy`.
- Verify the policy took effect: `docker inspect <container> | grep RestartPolicy` — `Name` should read `always`/`unless-stopped`, not `no`.

</InfoBox>

## FAQ

### What restart policies does docker compose support?

Four: `no` (default, never restart), `always` (always restart), `unless-stopped` (unless you manually stopped it), and `on-failure[:N]` (restart only on non-zero exit, with an optional retry cap). Production services usually use `always` or `unless-stopped`.

### How do I make a docker container restart automatically?

Add `restart: always` (or `unless-stopped`) to the service in `docker-compose.yml`; or use `--restart always` with `docker run`. The container self-recovers after a crash or host reboot.

### What is the difference between restart always and unless-stopped?

`always` restarts the container even if you manually `docker stop`ped it and then restarted the Docker daemon; `unless-stopped` honors a manual stop and won't be brought back up when the daemon restarts.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
