---
title: "Does rsync -a Preserve Timestamps? Why Fresh Backups Vanish"
description: "rsync -a carries source mtimes to the target, so find -mtime +7 deletes fresh snapshots as '7 days old'. Judge retention by name dates or a marker, not mtime."
date: 2026-11-23
tags: [rsync, Linux, Ops]
authors: [cclee]
image: "/images/blog/rsync-a-resets-mtime-fresh-backup-deleted-en.webp"
schema: FAQPage
faqs:
  - q: "Does rsync -a preserve timestamps?"
    a: "Yes — archive mode equals -rlptgoD: -t preserves mtimes and -r recurses, so directory mtimes are carried over from the source as well. The target's mtime means 'when the source last changed', not 'when this pull happened'. Record the pull time in a marker file instead."
  - q: "How do I delete files older than 7 days with find safely?"
    a: "find /dir -mtime +7 is the usual one-liner, but never key a retention policy on mtimes that rsync controls — a pull with -a rewrites them. Compare zero-padded directory-name dates or a completion marker's timestamp, and verify the hit set with -print before switching to -delete."
  - q: "Why does my cron rsync job produce empty backup directories?"
    a: "In this failure the transfer itself completed every run (strace showed the full tree and jpgs landing), but a trailing find -mtime +7 cleanup deleted the just-pulled snapshot — three consecutive runs showed files = 0. Separate the transfer from the cleanup and log the cleanup decision."
  - q: "What should I use instead of mtime for backup retention?"
    a: "Directory-name dates (ISO format compares lexicographically) or a .pull-complete marker touched after each pull, read back with stat. Neither is rewritten by rsync -a; the same rule applies to row-count style checks — don't rely on fields the transfer tool overwrites."
---

In a cron-driven rsync-plus-find backup pipeline that keeps 7 days of upload snapshots by directory name, the pull script ran fine by hand but, once scheduled, three consecutive snapshot directories showed `files = 0` — the files landed, then vanished.

## TL;DR

The `a` in `rsync -a` (archive) **propagates the source's mtimes to the target, directories included** — the target directory's mtime means "when the source last changed", never "when this pull finished". If the source's top-level directory is frozen (new files only land in deep subdirectories), that value stays in the past, and a trailing `find -mtime +7` cleanup judges the just-pulled snapshot "7 days old" and deletes the whole directory. "Manual runs always work, cron always fails" is a false correlation: manual testing only ever runs the rsync line, never the cleanup. Fix: **judge retention by directory-name dates, and record pull completion in a marker file's mtime.**

## Symptoms: fresh snapshots vanish

The scheduled pipeline's signature is "pulled, then deleted": the snapshot directory exists with no transport errors in the logs, yet `files = 0`; run the same script by hand and every file is there. Three runs in a row.

The usual suspects were eliminated one by one: CRLF line endings, fd handling around flock, disk space, cron-vs-terminal environment differences, execution shape (an inline heredoc one-liner vs the script file) — all negative. Along the way a strong false correlation formed: **"the script always fails, the inline version always works"**, and the investigation chased execution shapes for two loops.

The turn came from strace: in the failing runs the transfer was complete — the directory tree's mkdir calls and the jpg bytes landing were all on record. In other words rsync finished its job and the files disappeared **afterwards**. Moving attention from "the transfer" to "which line runs after the transfer" surfaced the cleanup line at the bottom of the script.

> The database side of this same pipeline has a sibling pitfall: [pg_dump backups with no data? FORCE RLS binds owners too](/blog/postgres-pg-dump-empty-backup-force-rls) — the same "command exits normally, content is empty" shape.

## Root cause: rsync -a resets the target's mtimes

The cleanup didn't delete "files that never arrived" — it deleted "directories judged old", because the retention check read the wrong clock. Three links chained; remove any one and nothing happens:

**Link 1: `-a` preserves the source's timestamps, directories included.** `-a` equals `-rlptgoD`; `-t` preserves mtimes and `-r` recurses. After the sync, the target tree's mtime = the source's directory mtime, and the moment "this pull finished" is recorded nowhere in the synced paths.

**Link 2: the source's top-level directory mtime is frozen.** New attachments all land in deep subdirectories, so `uploads/` itself hasn't changed since Oct 30. Every snapshot inherits that same stale value at its top level.

**Link 3: the retention check `find -mtime +7`.** Today is Nov 23; the snapshot's top-level mtime is Oct 30 — 24 days apart, beyond the 7-day retention. `-mtime +7` matches, and the directory is deleted. Every run: **pulled, then deleted**.

![Root-cause chain: rsync -a carries the source's frozen mtime to the target, and find -mtime +7 judges the fresh snapshot stale](/images/blog/rsync-a-resets-mtime-fresh-backup-deleted-en.webp)

"Inline always works" falls out of the same chain: inline testing only ever runs the transfer lines and never the cleanup, so it cannot fail — the real difference from the script is not execution shape but **whether the find line runs**.

A minimal reproduction shows who decides the mtime:

```bash
mkdir -p /tmp/demo/src/uploads/2026-11-23
echo x > /tmp/demo/src/uploads/2026-11-23/a.jpg
touch -d '2026-10-30' /tmp/demo/src/uploads          # freeze the top level

mkdir -p /tmp/demo/dst
rsync -a /tmp/demo/src/uploads /tmp/demo/dst/snap

stat -c '%y %n' /tmp/demo/dst/snap                   # 2026-10-30 ← inherited
find /tmp/demo/dst -maxdepth 1 -type d -mtime +7 -print
# → /tmp/demo/dst/snap   ← exactly what the cleanup deletes
```

## Fix: judge retention by directory names, mark completion with a file

The fix replaces the clock the retention check reads — not mtime but the date in the directory name; and "when this pull finished" gets its own record in a marker file the sync never touches.

```bash
# Retention: compare directory-name dates (ISO order == lexicographic order)
cutoff=$(date -d '7 days ago' +%Y-%m-%d)
for d in /data/snapshots/20*-*-*; do
  name=$(basename "$d")
  [[ "$name" < "$cutoff" ]] && rm -rf "$d"
done

# Completion time: touch a marker after the pull; later checks read its mtime
rsync -a "$SRC_HOST:uploads/" "$SNAP_DIR/"
touch "$SNAP_DIR/.pull-complete"
# How long since completion: stat -c %Y "$SNAP_DIR/.pull-complete"
```

The two clocks have separate jobs: **directory-name dates** answer "should this snapshot be kept", the **marker's mtime** answers "how long has this pull been running, is it stuck". Both avoid the mtime that rsync writes, because that field means "when the source changed", not "when I pulled".

After the fix landed in those two places, the cron runs stopped showing `files = 0`.

## Scenario 2: root gets Permission denied on /tmp lock files? fs.protected_regular

Even root gets rejected: on the same box, root opening an existing lock file with `open(O_CREAT)` in `/tmp` — a file owned by someone else — fails with `EACCES`. Ubuntu's `fs.protected_regular` applies to sticky directories and root has no exemption. Put lock and swap files in `/run`, not `/tmp`.

## Scenario 3: can't find the rsync read-only restriction? It's on the dedicated transfer user

Nothing shows up on the usual login account because the restriction lives in the `command=` option of `authorized_keys` for a dedicated transfer user (rrsync). When auditing ssh restrictions, first work out which user a key belongs to, then read that user's `authorized_keys`.

## Scenario 4: dangling --link-dest still exits 0? Hard links silently gone

On rsync 3.2.7, a `--link-dest` pointing at a nonexistent path only prints a warning and still exits 0 — not fatal, but the hard-link space saving silently disappears for that run. Check the link-dest target exists before running, or alert on the warning.

## Scenario 5: grep $'\r' always matches over ssh? A false positive from nested quoting

Detecting CRLF remotely with `grep -c $'\r'` fails under nested quoting: by the time it reaches the remote shell, `$'\r'` is treated as a plain pattern and matches everything. Detect CR with `awk '/\r/'` instead.

<InfoBox variant="warning" title="Before you ship">

- For any retention / cleanup / cooldown check, avoid fields the transfer tool rewrites: `-a` resets directory mtimes — judge by directory-name dates or a completion marker.
- Dry-run handwritten cleanups with `-print` for a few rounds before switching to `-delete`.
- The `--link-dest` target must exist; 3.2.7 only warns and exits 0 on a dangling path.
- Put lock and swap files in `/run` to stay clear of `/tmp`'s `fs.protected_regular`.

</InfoBox>

## FAQs

### Does rsync -a preserve timestamps?

Yes. `-a` equals `-rlptgoD`: `-t` preserves mtimes and `-r` recurses, so directory mtimes are carried over from the source as well. The target's mtime means "when the source last changed", not "when this pull happened" — record the pull time in a marker file instead.

### How do I delete files older than 7 days with find safely?

`find /dir -mtime +7` is the usual one-liner, but never key a retention policy on mtimes that rsync controls — a pull with `-a` rewrites them. Compare zero-padded directory-name dates or a completion marker's timestamp, and verify the hit set with `-print` before switching to `-delete`.

### Why does my cron rsync job produce empty backup directories?

In this failure the transfer itself completed every run (strace showed the full tree and jpgs landing), but a trailing `find -mtime +7` cleanup deleted the just-pulled snapshot — three consecutive runs showed `files = 0`. Separate the transfer from the cleanup and log the cleanup decision.

### What should I use instead of mtime for backup retention?

Directory-name dates (ISO format compares lexicographically) or a `.pull-complete` marker touched after each pull, read back with `stat`. Neither is rewritten by `rsync -a`; the same rule applies to row-count style checks — don't rely on fields the transfer tool overwrites.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
