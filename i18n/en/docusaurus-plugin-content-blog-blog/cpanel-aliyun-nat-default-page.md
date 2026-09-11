---
title: "cPanel Restore Shows Default Page? Aliyun ECS NAT IP Fix"
description: "cPanel restore lands every domain on the default page? Aliyun ECS public IPs are edge NAT, so vhosts bound to old addresses never match. Fix three IP stores."
date: 2026-09-12
tags: [cPanel, Alibaba Cloud, NAT, Server Migration]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does my cPanel site show the default page after a migration?"
    a: "Because the vhost address never matches. On Aliyun ECS the NIC only carries a private IP — the public IP lives on an edge NAT gateway. A restore inherits the old server's public IP, Apache matches vhosts by IP:port, no vhost ever matches, and everything falls into the wildcard default vhost. Rewriting three IP stores to the private IP and rebuilding httpd.conf fixes it."
  - q: "How do I check which Apache vhost is serving my requests?"
    a: "Two checks give a verdict: the site's domlog stays completely empty, and a request for a static file that certainly exists returns 404 with an error page styled from the default document root (/var/www/html). Both together mean the default vhost is answering. Then compare httpd -S against hostname -I to see whether the bound address actually exists on the NIC."
  - q: "Which cPanel IP settings need updating on a NAT cloud server?"
    a: "Three places together: ADDR in /etc/wwwacct.conf (global default), IP= in /var/cpanel/users/<user>, and every ip: field under /var/cpanel/userdata/<user>/ — then run /scripts/rebuildhttpdconf and restart httpd. For new accounts the default comes from /etc/mainip; writing the private IP there before migration prevents the problem from recurring."
---

Restoring a cPanel account from a cpmove archive on an Aliyun ECS instance: restorepkg reports success, `httpd -S` shows the namevhosts — and the browser greets every domain with the server's default page.

Encountered this while [migrating two China sites for a global waterpark equipment manufacturer](/cases/waterpark-china-hosting-migration) — a full relocation of both sites into a cPanel environment on Aliyun China, where the very first public verification after the restore ran into this cloud architecture trap.

## TL;DR

On Aliyun ECS the NIC only carries a private IP; the public IP is edge NAT and never lands on the machine. Vhosts migrated from the old server bind that non-existent public address, never match at runtime, and all traffic drops into the wildcard default vhost. Fix all three IP stores (`/etc/wwwacct.conf`, `/var/cpanel/users/`, `/var/cpanel/userdata/`) and rebuild httpd.conf; write the private IP into `/etc/mainip` so new accounts start correct.

## Symptoms

Every migration step looks clean: restorepkg finishes without errors and the namevhosts are right there in the Apache config. But public verification falls flat — every domain lands on the same defaultwebpage redirect, and the site's domlog stays empty forever.

The clincher is a single static-file request: fetch a file that certainly exists and was never touched (say `/some-real-page.html`) and it returns 404 — with the error page styled from `/var/www/html/*.shtml`, the cPanel default site's directory. The real document root never received the request.

```bash
$ httpd -S | grep example.cn
203.0.113.10:80                   example.cn ...
```

The vhost binds `203.0.113.10` — the old server's public IP. This new machine's NIC has no such address.

## Root causes

**The public IP is not on the machine.** `hostname -I` returns only a private address like `172.28.100.10`. Aliyun ECS public IPs are edge NAT: traffic arrives at Alibaba's gateway and is forwarded to the instance's private address — the public IP never appears on the NIC.

**The restore inherited the old IP verbatim.** The old server was a classic VPS with the public IP on the NIC, so its vhosts record exactly that address. cpmove brings the configuration over as-is, and every vhost `Address` now points at an address that does not exist locally.

Apache matches vhosts by IP:port. Requests arrive, match no namevhost, and fall into the `*:80` default vhost (DocumentRoot `/var/www/html`). That single mechanism explains all three symptoms: the default page, the empty domlog, and the mismatched 404 styling.

## Fix

**1. Confirm the NAT setup.** One command:

```bash
hostname -I
# 172.28.100.10   ← private segment only: NAT confirmed
```

**2. Rewrite all three IP stores — all of them, no exceptions.** cPanel keeps IP information in three places serving different flows. Fixing only userdata rebuilds the vhosts correctly, but a stale `wwwacct.conf` writes the wrong address into every future account.

```bash
# 2a. Global default (read by account creation)
sed -i 's/^ADDR=.*/ADDR=172.28.100.10/' /etc/wwwacct.conf

# Default IP for new accounts — set this too
echo 172.28.100.10 > /etc/mainip

# 2b. Per-account record
sed -i 's/^IP=.*/IP=172.28.100.10/' /var/cpanel/users/example

# 2c. Bulk rewrite of userdata — the only input rebuildhttpdconf trusts
cd /var/cpanel/userdata/example
for f in *; do
  [ -f "$f" ] && sed -i 's/^ip: .*/ip: 172.28.100.10/' "$f"
done
```

The `[ -f "$f" ]` guard is not decorative: the userdata directory mixes in socket files like `scope`, and sed errors out on them without the check.

**3. Rebuild and restart.**

```bash
/scripts/rebuildhttpdconf
/scripts/restartsrv_httpd
```

**4. Verify.** `httpd -S` should now show namevhosts on the private IP; from the server, a request with an explicit Host header tells you which vhost answers:

```bash
curl -s -H "Host: example.cn" http://172.28.100.10/some-real-page.html -o /dev/null -w "%{http_code}\n"
# 200 ← no longer the default vhost's 404
```

Finish with an external visit to confirm the pages load and the domlog starts filling.

## Edge cases and variants

- **Fresh installs**: write `/etc/wwwacct.conf` ADDR and `/etc/mainip` before creating any account and the wrong-address problem never happens; this applies beyond restores.
- **Not Aliyun-specific**: AWS Elastic IPs and similar NAT-style public IPs behave the same. Anywhere the public IP is absent from `hostname -I`, cPanel's IP settings must use the private address.
- **Local verification blind spot**: testing from the server against 127.0.0.1 or the public address hits the default vhost and misleads — use the private IP with an explicit Host header.

<InfoBox variant="warning" title="Warnings">

- The three IP stores are caches of each other, not backups: `/etc/wwwacct.conf` governs new accounts, `/var/cpanel/users/` holds account metadata, userdata drives vhost generation — the fix is complete only when all three are rewritten.
- Back up the userdata directory before bulk sed; socket files like `scope` must be skipped.
- Do not convict the default vhost on a 404 alone — pair the empty domlog with the error page's origin before concluding.

</InfoBox>

## Frequently Asked Questions

### Why does my cPanel site show the default page after a migration?

Because the vhost address never matches. On Aliyun ECS the NIC only carries a private IP — the public IP lives on an edge NAT gateway. A restore inherits the old server's public IP, Apache matches vhosts by IP:port, no vhost ever matches, and everything falls into the wildcard default vhost. Rewriting three IP stores to the private IP and rebuilding httpd.conf fixes it.

### How do I check which Apache vhost is serving my requests?

Two checks give a verdict: the site's domlog stays completely empty, and a request for a static file that certainly exists returns 404 with an error page styled from the default document root (`/var/www/html`). Both together mean the default vhost is answering. Then compare `httpd -S` against `hostname -I` to see whether the bound address actually exists on the NIC.

### Which cPanel IP settings need updating on a NAT cloud server?

Three places together: ADDR in `/etc/wwwacct.conf` (global default), IP= in `/var/cpanel/users/` account files, and every `ip:` field under `/var/cpanel/userdata/` — then run `/scripts/rebuildhttpdconf` and restart httpd. For new accounts the default comes from `/etc/mainip`; writing the private IP there before migration prevents the problem from recurring.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
