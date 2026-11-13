---
title: "coscli has no upload? v1 uses cp, sync, rm; LHCOS quirks"
description: "coscli v1 has no upload/delete: use cp, sync, rm with -r. LHCOS buckets never show in GET Service — HEAD the bucket name to check existence."
date: 2026-11-13
tags: [Tencent COS, CLI, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "coscmd supports upload — why doesn't coscli?"
    a: "They are two different tools: coscmd is the older Python CLI, while coscli v1 (e.g. 1.0.9) uses object verbs — cp for uploads (add -r for directories), sync for folder sync, rm for deletes. Same transfer, different verb table; check which CLI a tutorial targets before copying its commands."
  - q: "How do I check whether an LHCOS bucket exists?"
    a: "Don't trust the bucket list: GET Service returns 0 buckets for the LHCOS namespace. Send a HEAD request for the exact bucket name (or check the console) — that's the existence test. File APIs work normally; only bucket creation and deletion are console-only."
  - q: "How do I run coscli non-interactively in scripts?"
    a: "Combine --init-skip=true (skips the setup wizard), -i/-k for the keys, and -e cos.<region>.myqcloud.com for the endpoint. In cron jobs, source credentials from a 0600-permission file instead of inline values, and scope the sub-account to read-write on the target bucket only."
---

While wiring up off-site uploads for a PostgreSQL backup, the first line of the script was the intuitive `coscli upload backup.sql.gz cos://…` — which failed immediately: no such subcommand.

Ran into this in a PostgreSQL off-site backup pipeline (shell scripts + Tencent Cloud coscli, v1.0.9).

<!-- TODO backfill source note once the product page exists: Ran into this while building [product](link) — {business value} -->

## TL;DR

v1 has no upload/delete verbs: use `cp` for uploads/downloads, `sync` for folder sync, `rm` for deletes, always adding `-r` for recursion; pass the region via `-e` if you skip the config file. LHCOS buckets (the object storage bundled with Lighthouse instances) add a quirk: they never appear in the account's global COS bucket list — GET Service returns 0 buckets, and a HEAD against the exact bucket name is the existence test. Bucket creation and deletion are console-only; file APIs work normally.

## Symptoms: no such command, wrong arg count, empty bucket list

Three symptoms that look unrelated — a missing command (if you searched "coscli command not found" or "COS CLI upload fails"), `-r` reporting accepts 2 args, and GET Service returning an empty list — are two rule sets stacked: v1's verb table, and LHCOS bucket visibility.

First trap: the intuitive verb doesn't exist. `upload` and `delete` both fail as unknown subcommands — they simply aren't in v1's help.

Second trap: the recursion flag treated as a command. With `-r` misplaced or arguments missing, the tool reports `accepts 2 args` — `-r` is not a standalone command, just cp/sync's recursion flag, and the positional arguments follow cp's signature.

Third trap, the most misleading: running the list-buckets call (GET Service) to confirm the bucket exists returns 0 buckets. Meanwhile the backup job has been writing and reading that bucket all along — the bucket is fine, just absent from that list.

## Root cause: coscli v1's verb table, plus LHCOS staying out of the global list

**v1's semantics are object operations, not resource management.** The v1 verb set is three words: cp (upload/download), sync (folder sync), rm (delete). The upload/delete verbs in many tutorials belong to other tools or newer CLI versions; recursion is the `-r` flag rather than a command, so "command + -r + source + target" with one positional argument missing reports accepts 2 args. Tencent also ships an older Python tool, coscmd, with yet another verb table — check which tool a tutorial is about before copying.

**LHCOS buckets are a separate namespace, not merged into the account's COS list.** GET Service only returns buckets from the COS product line; LHCOS buckets never appear in it, so an empty list does not mean the bucket is missing. The existence test is a HEAD against the exact bucket name. File-level APIs (upload/download/delete) address the bucket directly and work normally; only bucket creation and deletion are console-only operations.

## Fix: a fixed invocation shape for scripts, HEAD for existence

1. **The non-interactive shape.** `--init-skip=true` skips the first-run setup wizard, `-i/-k` pass the keys, `-e` names the region endpoint — together they make the command usable from cron and scripts:

```bash
# upload a single file; add -r for directories
coscli --init-skip=true cp backup.sql.gz cos://examplebucket-1250000000/backup/ \
  -e cos.ap-guangzhou.myqcloud.com -i "$SECRET_ID" -k "$SECRET_KEY"

# folder sync
coscli --init-skip=true sync ./dump/ cos://examplebucket-1250000000/backup/ \
  -e cos.ap-guangzhou.myqcloud.com -i "$SECRET_ID" -k "$SECRET_KEY"

# delete (add -r for recursion)
coscli --init-skip=true rm -r cos://examplebucket-1250000000/backup/old/ \
  -e cos.ap-guangzhou.myqcloud.com -i "$SECRET_ID" -k "$SECRET_KEY"
```

Bucket names carry the APPID suffix (1250000000 in the example); the Guangzhou region endpoint looks like `cos.ap-guangzhou.myqcloud.com`.

2. **Existence checks bypass the bucket list.** When debugging "does this bucket exist", HEAD the exact bucket name or check the console — an empty GET Service result proves nothing.

3. **One-off operations go to the console.** Bucket creation, deletion, and permission changes are console actions; scripts don't touch them.

| Intent | v1 invocation |
|--------|---------------|
| Upload one file | `cp <local> cos://bucket/path/` |
| Upload a directory | `cp -r <dir> cos://bucket/path/` |
| Sync a folder | `sync <dir> cos://bucket/path/` |
| Delete | `rm [-r] cos://bucket/path/` |

<InfoBox variant="warning" title="Watch out">

- **Inline `-i/-k` values linger in shell history and process lists.** For cron jobs, source credentials from a 0600-permission file instead; scope the sub-account to read-write on the target bucket only.
- **LHCOS and COS are separate product lines** with separate billing and capacity — don't audit LHCOS through the COS bucket list.
- **Check the verb table first on errors**: coscli v1, v2, and coscmd share no verb table — run `--version` to see which one you installed before matching tutorials.

</InfoBox>

## FAQ

### coscmd supports upload — why doesn't coscli?

They are two different tools: coscmd is the older Python CLI, while coscli v1 (e.g. 1.0.9) uses object verbs — cp for uploads (add -r for directories), sync for folder sync, rm for deletes. Same transfer, different verb table; check which CLI a tutorial targets before copying its commands.

### How do I check whether an LHCOS bucket exists?

Don't trust the bucket list: GET Service returns 0 buckets for the LHCOS namespace. Send a HEAD request for the exact bucket name (or check the console) — that's the existence test. File APIs work normally; only bucket creation and deletion are console-only.

### How do I run coscli non-interactively in scripts?

Combine `--init-skip=true` (skips the setup wizard), `-i/-k` for the keys, and `-e cos.<region>.myqcloud.com` for the endpoint. In cron jobs, source credentials from a 0600-permission file instead of inline values, and scope the sub-account to read-write on the target bucket only.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
