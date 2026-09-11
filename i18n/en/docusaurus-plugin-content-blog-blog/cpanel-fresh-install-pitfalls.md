---
title: "cPanel Install Says Complete but MariaDB Is Missing"
description: "cPanel reports success but MariaDB never installs, accounts fail on missing keys, China downloads crawl at 50 KB/s. Three fixes and an acceptance checklist."
date: 2026-09-12
tags: [cPanel, WHM, MariaDB, Server Provisioning]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I install MariaDB on a cPanel server?"
    a: "Install the full RPM set — MariaDB-server, MariaDB-client, MariaDB-devel, MariaDB-shared and MariaDB-common; a partial set passes rpm checks but breaks later steps. Then create /root/.my.cnf with a client-section password and run SET PASSWORD for root@localhost, otherwise restore tools fail with Missing: admin_mysql_password. Verify with rpm -qa | grep -i maria, systemctl is-active mysql, and mysql -N -e \"select version()\"."
  - q: "Why does a cPanel install or update fail without an error?"
    a: "Because the installer does not roll back. When one background stage fails (SQL Databases and dependent apps, error number 127 in our case), the remaining stages still run and the installer still reports success — the only trace is a (FATAL) line at the tail of the install log. Always grep the log tail for FATAL and run the three-component acceptance checks before trusting the completion message."
  - q: "How can I speed up cPanel downloads in China?"
    a: "Direct throughput from a China cloud server to httpupdate.cpanel.net measures around 50 KB/s across all mirror IPs, while the same source reaches 1.8-6 MB/s over a residential line elsewhere. The workable pattern is a reverse dynamic SOCKS tunnel from a faster network plus proxychains on the installer — measured 14x faster at about 708 KB/s. Treat it as temporary: uninstall the proxy tooling when the install finishes."
---

You provision a fresh server with cPanel, the installer reports "complete" — and then account creation, database setup, or the sites themselves fail one after another. These failures share a trait: the place that errors is not the place that broke.

Encountered this while [building a compliance hosting environment on Aliyun China for a client](/cases/waterpark-china-hosting-migration) — all three failure classes showed up on the same machine during provisioning, and each had to be cleared before the site migration could start.

## TL;DR

Fresh cPanel installs fail in three recurring ways, all wearing a mask of success: the installer reports complete while MariaDB never installed (a failed stage does not roll back); account creation is blocked by a chain of missing keys when /etc/wwwacct.conf is empty; and from China, httpupdate.cpanel.net crawls at roughly 50 KB/s — slow enough to cause the first failure in the first place. Accept a provisioning only after three checks: MariaDB RPMs present, mysql service active, client connects.

## Scenario one: install reports complete, MariaDB is missing

WordPress throws a Database Error, the `mysql` binary does not exist on the server, and `systemctl is-active mysql` returns inactive — while the cPanel installer reported success and the panel opens fine.

The install log's tail hides the real event:

```
(FATAL): The background process "SQL Databases and dependent apps" failed ... error number 127
```

The MariaDB RPM transaction in the SQL stage failed on download, but every later stage ran and finished anyway, and the final screen still said complete. **Installation "success" does not mean the components are present** — the installer neither rolls back nor blocks on a stage failure.

Fix order:

1. Confirm the gap: `rpm -q MariaDB-server` — most likely not installed
2. Install the full RPM set: MariaDB-server, MariaDB-client, MariaDB-devel, MariaDB-shared, MariaDB-common — every one of them
3. RPMs alone are not enough — `/usr/local/cpanel/scripts/securemysql` does not make restore tools connect; restorepkg fails with `Missing: admin_mysql_password`. Create `/root/.my.cnf` with a client-section password and run `SET PASSWORD` for root@localhost

Never trust the installer's exit status for acceptance. Run three checks:

```bash
rpm -qa | grep -i maria
systemctl is-active mysql
mysql -N -e "select version()"
```

All three green, the SQL stage is genuinely done.

## Scenario two: first account creation hits a chain of missing keys

restorepkg or manual account creation gets blocked once per run, in this order: `Please setup a nameserver` → `Missing HOMEDIR` → `Missing DEFMOD` → `Missing LOGSTYLE` → `Missing SCRIPTALIAS`.

The cause is direct: on a fresh WHM that never ran the Basic Setup wizard, `/etc/wwwacct.conf` is an empty file, and account creation validates it hard. The trap is the error mechanism — **each run reports exactly one missing key**, so patching one at a time costs five or more rounds.

Write the full standard key set in one shot:

```bash
cat > /etc/wwwacct.conf <<'EOF'
ADDR 172.28.100.10
CLUSTERED_DNS disabled
DEFMOD default
ETHDEV eth0
FTPHOMEDIR 0
HOMEDIR /home
HOMEMATCH home
LANG english
LOGSTYLE semicolon
MINUID 500
NS ns1.example-ns.com
NS2 ns2.example-ns.com
SCRIPT x3
SCRIPT x3parked
SCRIPT x3addon
SCRIPTALIAS y
EOF
```

Three details:

- `ADDR` takes the private IP, not the public one — on NAT architectures the public IP never lands on the NIC, and the consequences of binding it are covered in [cPanel Sites Hit the Default Page? The Aliyun NAT vhost Trap](/blog/cpanel-aliyun-nat-default-page)
- `whmapi1 set_nameserver` takes the **singular** parameter `nameserver` (values: bind/powerdns/disabled), unlike the plural fields from `get_nameserver_config`; and the NS validation reads NS/NS2 from wwwacct.conf, not ns1/ns2 from cpanel.config
- When real DNS lives on cloud DNS, the NS values are nominal placeholders — pair with `CLUSTERED_DNS disabled`

For failed transfers, the details live in the JSON of `/var/cpanel/transfer_sessions/<session>/master.log` (search `failure`); note that `view_transfer` itself tails and blocks — do not get stuck in it during triage.

## Scenario three: cpanel.net downloads at 50 KB/s from China

Scenario one's RPM download failure usually traces back here: from an Aliyun Shanghai ECS, every mirror IP of httpupdate.cpanel.net measured about 50 KB/s (the international-site route in the same region was just as slow, ruling out any proxy transit benefit); the same source over a residential connection measured 1.8-6 MB/s.

The acceleration pattern lets the server borrow a faster line: a reverse dynamic SOCKS tunnel from a local machine, with proxychains-ng wrapping the installer on the server:

```bash
# Local machine: open a remote dynamic SOCKS port
ssh -N -R 1080 root@<server-ip>

# Server: with proxychains-ng installed, run the installer through the tunnel
proxychains4 -q sh latest
```

Measured lift: from 50 KB/s to 708 KB/s, about 14x. Three traps to avoid:

- **The proxychains config must exempt localnet ranges** (10/8, 172.16/12, 100.64/10, etc.) and **drop proxy_dns** — otherwise Aliyun internal mirror domains (mirrors.cloud.aliyuncs.com) get pushed into the tunnel and fail outright
- **tinyproxy is incompatible with httpupdate.cpanel.net** — it returns 404 reliably; do not use it as the tunnel exit
- **Never clean up the installer with `pkill -f "sh latest"`** — the pattern matches your own ssh session's command line and kills your connection (the source of exit code 255); kill by PID instead

Tear it down when done: the tunnel lives exactly as long as the local ssh process, and the server keeps no proxy configuration — uninstall proxychains-ng and delete its config after the install. If an interrupted install already left RPMs missing, cPanel's self-repair is `/usr/local/cpanel/scripts/sysup` — in our case a missing splitlogs binary had left httpd unable to start, fixed by sysup plus a manual RPM install.

<InfoBox variant="warning" title="Warnings">

- The three failure classes chain together: slow downloads break RPM transactions, the installer skips rollback and reports success, and the missing components explode later at account creation or site setup. Debug from the network layer up — do not stop at the layer that surfaced the error.
- wwwacct.conf reports one missing key per run; writing half the file and retesting only burns rounds. Write it complete.
- Tunnel acceleration is a temporary tool — no resident proxy configuration stays on the server; after the RPMs land, run sysup once for a full reconciliation.

</InfoBox>

## Frequently Asked Questions

### How do I install MariaDB on a cPanel server?

Install the full RPM set — MariaDB-server, MariaDB-client, MariaDB-devel, MariaDB-shared and MariaDB-common; a partial set passes rpm checks but breaks later steps. Then create `/root/.my.cnf` with a client-section password and run SET PASSWORD for root@localhost, otherwise restore tools fail with Missing: admin_mysql_password. Verify with `rpm -qa | grep -i maria`, `systemctl is-active mysql`, and `mysql -N -e "select version()"`.

### Why does a cPanel install or update fail without an error?

Because the installer does not roll back. When one background stage fails (SQL Databases and dependent apps, error number 127 in our case), the remaining stages still run and the installer still reports success — the only trace is a (FATAL) line at the tail of the install log. Always grep the log tail for FATAL and run the three-component acceptance checks before trusting the completion message.

### How can I speed up cPanel downloads in China?

Direct throughput from a China cloud server to httpupdate.cpanel.net measures around 50 KB/s across all mirror IPs, while the same source reaches 1.8-6 MB/s over a residential line elsewhere. The workable pattern is a reverse dynamic SOCKS tunnel from a faster network plus proxychains on the installer — measured 14x faster at about 708 KB/s. Treat it as temporary: uninstall the proxy tooling when the install finishes.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
