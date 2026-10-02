---
title: "CCLee Server Sentinel Changelog: Monitoring Release Notes"
sidebar_label: Changelog
description: "CCLee Server Sentinel changelog, newest first: event-based alerting with conclusions, self-learning login sources, certificate coverage, and safer backups."
project: server-sentinel
schema: Article
date: 2026-10-02
rag: true
rag_tags: ["Server Sentinel", "CCLee", "server monitoring", "changelog", "alerts", "backup"]
---

CCLee Server Sentinel keeps evolving. This page lists the new features and improvements in every version, newest first. The latest release is **2.2.0**. For the product itself, see [CCLee Server Sentinel](/docs/server-sentinel).

## Version Upgrades and Where to See Yours

Updates are rolled out centrally, so there is nothing for you to do on either the fully-managed or the self-serve model. Every alert notification carries the current client version in its footer (monitor-cli vX.X.X).

## 2.2.0: Event Notifications Name Exactly What Changed (2026-10-02, current version)

### New

- **Change notifications now itemize the details**: when cron jobs, system services or system accounts are added, removed or modified, the notification lists each specific entry (up to 10 items plus a total count). Whether a change was made by your own team is clear from the notification itself, so there is no need to log into the server and check item by item

## Backup Enhancement: a Second Copy on the Server Itself (2026-09-27)

### New

- **Database backups keep a local copy**: backups still upload to cloud object storage as usual, and the server now also keeps the last 24 hours of copies locally. If a cloud upload fails one night, that day's backup is still available on the server
- **Local copies are date-stamped**: today's copy never overwrites yesterday's, so they can be retrieved day by day
- Together with the live data, every database now exists in three places across two locations

## 2.1.1: Certificate Expiry Monitoring Covers Every Storage Layout (2026-09-26)

### New

- **Certificates identified by content, not by file extension**: cPanel combined certificates, Let's Encrypt files and extensionless files are all discovered automatically and brought into expiry monitoring. Every certificate on the server is watched, and you hear about expiry well in advance
- **Duplicate storage alerts once**: the same certificate appearing in multiple places counts as one, so no repeated pings
- **Scan paths are configurable per host**: servers that keep certificates in non-standard locations can be covered too

## 2.1.0: Self-Learning Unfamiliar-IP Detection, Dynamic IPs Included (2026-09-18)

### New

- **Unfamiliar-IP login detection now learns on its own**: the system remembers the login sources this server normally uses and keeps that knowledge current (sources unseen for 90 days fade out). Even with changing IPs, it can tell regulars from genuinely unfamiliar sources, and there is no manual IP whitelist to maintain
- **Finer alert grading for unfamiliar-IP logins**: an unfamiliar-source login on its own raises a "needs handling · security" tier alert; when a surge of failed logins (password guessing in progress) happens in the same period, it escalates directly to the critical tier
- **Slow-site monitoring**: websites or APIs that stay persistently slow raise their own alerts; the weekly check report gains a per-site average response section, so response times can be reviewed over a period

## 2.0.0: Alerts Consolidated into Events, Conclusions Not Data Dumps (2026-09-17)

### New

- **Event conclusions**: same-period signals from multiple sources are consolidated into a single event and graded by urgency (critical / needs handling / record-only), each with handling guidance: what the problem is, how urgent it is, what to do next. Recovery notices go out only after every related signal is back to normal
- **Security and intrusion-signs coverage expanded**: the typical moves after an intrusion, such as mining processes, modified website core files, unknown accounts and new cron jobs, are all continuously watched; SSH login failures, successful logins from unfamiliar IPs, firewall bans and critical application errors are covered too. The earlier an intrusion is found, the easier it is to deal with, and these signals surface anomalies before symptoms appear
- **Richer reports**: the weekly check report gains a "record-only" section; the monthly report gains a "this month's events" section, an availability summary and a check ledger. Minor events stop arriving as individual emails and are summarized weekly and monthly instead
- **Public probes stay quiet when all is well**: routine external-probe verifications notify only on anomalies

## 1.0.0: Service Launch (2026-09-13)

First release:

- **Four monitoring types**: performance (CPU, memory, disk, load, a round every 5 minutes), availability (local self-probe plus independent public probe, both directions must pass), security (firewall status, brute-force attempts, login records, certificate expiry, security updates), backup (daily backup status cross-checked against the cloud, one real restore drill per month with measured results)
- **Reporting system**: immediate anomaly notifications, weekly check reports, monthly reports
- **New servers spend their first 48 hours in observe-only mode**: the machine's normal temperament is learned before formal alerting begins
- **The monitoring system itself is watched**: two independent mechanisms keep an eye on each other, so "monitoring died and nobody noticed" can't happen
