---
title: "cPanel Domain Log 0 Bytes After Rotation? Reload Apache"
description: "cPanel never reloads Apache after log rotation: writes go to the old inode, the new file stays 0 bytes. Fix with a post-rotation graceful reload cron."
date: 2026-09-28
tags: [cPanel, Apache, Log Rotation, Troubleshooting]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is my cPanel domlog 0 bytes after daily rotation?"
    a: "Because cPanel's domlog rotation never reloads Apache. The server keeps its file descriptor on the old inode — new writes follow the rotated file into the archive — and nobody opens the freshly created log. Run apachectl graceful to restore writing immediately, then add a nightly post-rotation graceful cron as the permanent fix."
  - q: "Where does the log content go after Apache log rotation?"
    a: "Old content lands in the rotation archive. The 'empty new file' effect comes from the descriptor semantics: Apache holds one open file handle and keeps writing to the old inode no matter what happens to the filename. A graceful reload makes Apache reopen its log files — switching to the new inode — which is exactly why rotation must be followed by a reload."
  - q: "How do I troubleshoot a crontab job that never runs?"
    a: "Three steps: crontab -l to confirm the entry exists; run the command by hand to see the real error (in this case fail2ban-client reload -q instantly failed with ERROR No section: '-q' — -q is a global option that must precede the subcommand); then check cron logs for trigger records. A syntactically broken command fails silently under cron — manual execution is the only reliable verification."
---

Every day around 20:08 the cPanel server rotates its domain logs (domlogs) — and the freshly created log file stays at 0 bytes for hours: the access-log evidence surface goes blind, and every fail2ban / traffic-analysis rule starves — while the panel shows everything as normal.

> Encountered this while running a fully-managed cPanel/WHM hosting environment for a manufacturing-industry client on Alibaba Cloud China — recording the two-layer root cause and the permanent fix. Read the full engagement story in the [managed-hosting case study](/cases/waterpark-china-hosting-migration).

## TL;DR

**Two root causes stacked: cPanel's domlog rotation never reloads Apache, and the anti-blackout cron itself was written wrong — failing silently every night.**

- Immediate recovery: `apachectl graceful` — domlog writing resumes within seconds
- Permanent fix: a two-line post-rotation cron — `apachectl graceful` (restore writing) + `fail2ban-client -q reload` (rebind jails to the new log file)
- Detection: `ls -la /etc/apache2/logs/domlogs/<domain>-ssl_log` — still 0 bytes one hour after rotation means you are hit

## Symptoms

After each daily rotation (~20:08 on this host), the site log (`domlogs/<domain>-ssl_log`) stays at 0 bytes for hours:

- First confirmed 09-27: new file at 0 bytes after rotation, until manual intervention
- Recurred 09-28: rotation at 20:07, still 0 bytes at 21:08 — **the safety-net cron deployed for exactly this had no effect**

The danger is the silence: no errors, no panel alerts — but fail2ban, traffic analysis, and intrusion detection all lose their data source. For a managed environment, that is a quiet collapse of the evidence surface.

## Diagnosis: The Rotation-Window journalctl Is the Watershed

**Step 1: check what Apache did during the rotation window.**

```bash
journalctl -u httpd --since "20:00" --until "21:30"
```

**Zero activity** — no reload, no restart around the rotation. That pins the mechanism: the rotation moved the old file and created a new one, but Apache was never told to reopen its log files.

**Step 2: find out why the safety-net cron did not catch it.** The anti-blackout cron fires nightly at 21:00. Running its command by hand exposed everything on the spot:

```
$ fail2ban-client reload -q
ERROR  No section: '-q'
```

Two mistakes surfaced at once:

1. **Syntax**: `-q` is a global option of `fail2ban-client` and must come **before** the subcommand (`fail2ban-client -q reload`); placed after `reload`, it is parsed as a jail name and the command errors out
2. **Wrong target**: even with correct syntax, `fail2ban-client reload` reloads fail2ban itself — it does **not** restore Apache's log writing. The breakage lives in Apache; what it needs is `apachectl graceful`

In other words: since the day it was deployed, this cron ran a command that was guaranteed to fail, never worked once, and raised no alert — the 09-28 blackout recurring as usual was its direct consequence.

## Root Cause: Rotation Doesn't Reload, and the Net Was Tied Wrong

The two layers, separated:

**Root cause 1: cPanel domlog rotation does not reload Apache.** The rotation = move the old file + create a new one, nothing more. Apache opens each log file once and keeps writing through its held file descriptor — which points at the old file's inode. After rotation, writes follow the old inode into the archive, and the new file sits unwritten from birth. This is not a malfunction; it is descriptor semantics — which is why something external must tell Apache to reopen its files (a reload) after every rotation.

**Root cause 2: the safety-net cron got the command wrong twice over.** The intent was right (reload after rotation), but the command was `fail2ban-client reload -q`: the misplacement of `-q` broke the syntax, and even fixed syntax would have reloaded the wrong daemon (fail2ban manages jails, not Apache's log handles). The combined effect: a safety net that silently did nothing — cron failures notify no one, the second silent point in this story.

## The Fix: A Two-Line Cron, One Job Each

Rewrite the safety-net cron (a custom file under `/etc/cron.d/`), split into two lines with separate responsibilities:

```cron
# Nightly 21:00 — restore domlog writing (after the ~20:08 rotation)
0 21 * * * root /usr/sbin/apachectl graceful
# Nightly 21:05 — rebind fail2ban jails to the new log files (-q is a global option; it precedes the subcommand)
5 21 * * * root /usr/bin/fail2ban-client -q reload
```

Design notes:

- **21:00 graceful**: after the rotation (~20:08) and before the log-consumption peak, restores Apache's writes to the new file
- **21:05 fail2ban reload**: deliberately 5 minutes apart — fail2ban's watched paths point at the rotated file, and a reload rebinds the jails; the offset avoids colliding with the Apache reload
- Manual verification (same night): after graceful, domlog resumed writing (922 bytes and climbing); `fail2ban-client -q reload` returned clean

The other failure classes from this machine's provisioning phase (TFA, resource 404s, domain mounting) are covered in [AlmaLinux 10 cPanel: TFA Ineffective, Resource 404s, Domain Mount Refused](/blog/almalinux-10-cpanel-pitfalls) — together the two posts form a full provisioning-troubleshooting picture.

<InfoBox variant="warning" title="Watch out">

Cron failures are silent: a broken command errors out and nobody hears about it. Any "anti-blackout" or "auto-recovery" cron must be verified by **running the command manually once** right after deployment — in this case a single manual run would have caught the syntax error on day one instead of three days later. Also note that global options like `fail2ban-client`'s `-q`, when misplaced, get parsed as a jail name — the error (`No section: '-q'`) does not hint that position is the problem.

</InfoBox>

## FAQ

### Why is my cPanel domlog 0 bytes after daily rotation?

Because cPanel's domlog rotation never reloads Apache. The server keeps its file descriptor on the old inode — new writes follow the rotated file into the archive — and nobody opens the freshly created log. Run `apachectl graceful` to restore writing immediately, then add a nightly post-rotation graceful cron as the permanent fix.

### Where does the log content go after Apache log rotation?

Old content lands in the rotation archive. The "empty new file" effect comes from the descriptor semantics: Apache holds one open file handle and keeps writing to the old inode no matter what happens to the filename. A graceful reload makes Apache reopen its log files — switching to the new inode — which is exactly why rotation must be followed by a reload.

### How do I troubleshoot a crontab job that never runs?

Three steps: `crontab -l` to confirm the entry exists; run the command by hand to see the real error (in this case `fail2ban-client reload -q` instantly failed with `ERROR No section: '-q'` — `-q` is a global option that must precede the subcommand); then check cron logs for trigger records. A syntactically broken command fails silently under cron — manual execution is the only reliable verification.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
