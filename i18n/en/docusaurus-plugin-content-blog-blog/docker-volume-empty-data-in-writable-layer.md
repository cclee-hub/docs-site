---
title: "Docker Volume Mounted but Empty? etcd Data Lived in the Writable Layer, Lost on Recreate"
description: "docker ps -as shows 385MB in the etcd container's writable layer while its data volume holds 8K — declaring volumes: is not the same as the app using them. etcd without a data-dir writes to the container layer; any recreate destroys it. Migrate losslessly with online snapshot."
date: 2026-08-28
tags: [Docker, etcd, Milvus, Ops]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is my Docker volume mount empty?"
    a: "Two usual causes: an empty volume shadows whatever the image had at that path; or the application's own data-directory setting never pointed at the mount, so data went into the writable layer. Compare the volume size with the container's writable layer via du."
  - q: "How do I safely migrate etcd to a new data-dir?"
    a: "Take a consistent online snapshot with etcdctl snapshot save, run etcdctl snapshot restore --data-dir to build the target directory, stop the container, place the data, start with the new data-dir, and verify with endpoint health."
  - q: "I declared a volume in compose — why isn't it used?"
    a: "The volumes: key only mounts the volume at a path inside the container; where the app writes is decided by its own config (etcd's data-dir, postgres's PGDATA, redis's dir). If they disagree, the volume is decoration."
---

During a disk-cleanup pass, `docker ps -as` showed the etcd container's writable layer at 385MB — while its mounted data volume held just 8K. We didn't dare touch it during cleanup: one recreate, and every piece of Milvus metadata would evaporate with the writable layer.

Encountered this while building [AI Customer Service](/docs/customer-service) — a 24/7 AI support agent answering product questions; its knowledge-base retrieval runs on Milvus, and all of Milvus's metadata lives in this etcd.

## TL;DR

compose's `volumes:` only guarantees "the volume is mounted at this path" — **where the app writes is decided by its own parameters**. etcd without a `data-dir` defaults to `default.etcd` under its working directory: it never used the `/etcd` mount, and all 385MB sat in the writable layer, one `docker compose up -d` rebuild away from oblivion. The fix follows etcd's native migration path: **online snapshot → restore → swap data during a brief stop → add `ETCD_DATA_DIR` → recreate with the volume**. Zero data loss, under two minutes of downtime.

## Symptoms

The etcd service in compose looks "correct" — the volume is declared:

```yaml
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_LISTEN_CLIENT_URLS=http://0.0.0.0:2379
      # ... nothing about data-dir
    volumes:
      - etcd_data:/etcd
```

But two numbers disagree:

```text
$ docker ps -as --format "{{.Names}}\t{{.Size}}" | grep etcd
rag-service-etcd-1   385MB (virtual 199MB)     ← writable layer: 385MB

$ docker exec rag-service-etcd-1 du -sh /etcd
8K    /etcd                                     ← the mounted volume: empty

$ docker exec rag-service-etcd-1 ls -la / | grep etcd
drwx------  3 root root 4096 default.etcd         ← the data is here: container root
```

## Root Cause

**Mounted ≠ used.** `volumes: etcd_data:/etcd` only mounts the volume at the path `/etcd`; where etcd writes is decided by its `--data-dir` parameter. etcd's default data-dir is **`default.etcd` under the working directory** — this compose set neither the `ETCD_DATA_DIR` env var nor a `--data-dir` flag, so etcd created `default.etcd` at the container root and wrote everything into the writable layer. The `/etcd` mount point had been empty since day one.

The nastiest property of a "decorative volume" is that it's **completely symptom-free**: the service runs, reads and writes work, dashboards stay green. It only bites at the moment you run `docker compose up -d --force-recreate` (config change, writable-layer recycling, host migration) — the layer is discarded wholesale and the data vanishes, precisely when you're doing urgent ops work and can least afford a second incident.

## Solution

Use etcd's native snapshot migration: the online snapshot guarantees consistency, and downtime only happens at the final data swap.

### Step 1: Consistent online snapshot

```bash
docker exec rag-service-etcd-1 sh -c \
  'ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 snapshot save /tmp/etcd-snap.db'
docker cp rag-service-etcd-1:/tmp/etcd-snap.db /root/etcd-snap.db
```

`snapshot save` is safe against a running etcd (it goes through the Raft backend, not file copying) — no stop, no write lock.

### Step 2: Restore into the target data-dir structure

```bash
docker run --rm -v /root:/host quay.io/coreos/etcd:v3.5.5 \
  etcdctl snapshot restore /host/etcd-snap.db --data-dir /host/etcd-restored
```

Restore produces a full `member/` data directory (a raw snapshot file cannot be used as a data-dir directly).

### Step 3: Brief stop, move data into the volume

```bash
docker stop rag-service-etcd-1
rm -rf /var/lib/docker/volumes/etcd_data/_data/*      # volume is empty; clear mount residue
cp -a /root/etcd-restored/. /var/lib/docker/volumes/etcd_data/_data/
```

### Step 4: Add the missing config, recreate with the volume

```yaml
  etcd:
    environment:
      - ETCD_DATA_DIR=/etcd        # ← the missing line
      # ...
    volumes:
      - etcd_data:/etcd
```

```bash
docker compose up -d etcd    # config change triggers recreate; new container uses the volume
```

### Step 5: Verify

```bash
docker exec rag-service-etcd-1 etcdctl --endpoints=http://127.0.0.1:2379 endpoint health
du -sh /var/lib/docker/volumes/etcd_data/_data    # data should be in the volume
docker ps -as | grep etcd                          # writable layer should drop to KB scale
```

After this fix: writable layer 385MB → 8KB, 123MB of data living on the volume, Milvus reconnected automatically with metadata reads and writes healthy.

<InfoBox variant="warning" title="Notes">

- When auditing stateful containers (etcd/postgres/redis/minio), make "writable layer size vs volume size" a standing check: an inflated SIZE in `docker ps -as` with an empty volume almost always means data isn't on the volume.
- To find where data actually lives, trace the **path the process really reads and writes** (`docker top` for args, look for data dirs inside the container) — never trust the mere presence of a `volumes:` line; declared is not used.
- Single-node etcd snapshot restore regenerates member metadata and is only valid for single-node setups; multi-node cluster migrations go through member change procedures instead.
- The same inspection method appears in [Container Logs Filling Your Server Disk? docker system df 'Reclaimable' Lies](/blog/docker-writable-layer-logs-disk-full) — `docker ps -as` writable-layer watching is the same knife; and for the other flavor of mount surprise, see [Docker Volume Override Bind Mount](/blog/docker-volume-override-bind-mount).

</InfoBox>

## FAQ

### Why is my Docker volume mount empty?

Two usual causes: an empty volume shadows whatever the image had at that path (documented Docker behavior); or the application's data-directory setting never pointed at the mount, so data went to the container's writable layer — the etcd case in this post. `du` on the volume vs the writable layer tells them apart instantly.

### How do I safely migrate etcd to a new data-dir?

`etcdctl snapshot save` for a consistent online snapshot (no downtime), `etcdctl snapshot restore --data-dir` to build a directory with proper member structure, stop the container, place the data, start with the new data-dir, then verify with `endpoint health` plus upstream reconnection. Downtime is only the swap itself.

### I declared a volume in compose — why isn't it used?

`volumes:` mounts the volume at a container path; the application decides where to write from its own config — etcd's `data-dir`, postgres's `PGDATA`, redis's `dir`. When the mount point and the app config disagree, the volume is an empty directory and all data sits in the writable layer, lost on recreate.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
