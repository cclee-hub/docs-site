---
title: "cPanel AutoSSL Not Issuing? Self-Signed Certificate Fix"
description: "cPanel AutoSSL not issuing while browsers warn about self-signed certificates? Clear the domain exclusion list, fix custom vhost SSL paths, force issuance."
date: 2026-09-12
tags: [cPanel, AutoSSL, SSL, Server Administration]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is cPanel AutoSSL not issuing certificates?"
    a: "Check the certificate itself: if the issuer equals the subject and the CN is a cPanel temporary hostname, no real certificate was ever issued. The two most common causes are the per-account AutoSSL domain exclusion list, and a custom vhost pinning SSLCertificateFile to the cPanel self-signed service certificate. Let's Encrypt certificates are valid for 90 days; once issuance succeeds, AutoSSL's daily task renews automatically."
  - q: "What are cPanel AutoSSL user excluded domains?"
    a: "A per-account list of domains that AutoSSL deliberately skips. Beyond manual exclusions, a cpmove restore carries the old server's list over, and newly created subdomains are auto-excluded (including www.test.*) — in our case all 9 domains of one account were on the list. Remove them with whmapi1 remove_autossl_user_excluded_domains, then trigger start_autossl_check_for_one_user instead of waiting for the daily run."
  - q: "Why is cPanel AutoSSL not renewing certificates?"
    a: "\"already optimal\" in the AutoSSL panel only means no renewal is due — it does not confirm coverage. Domains on the exclusion list are skipped silently, so nothing is ever issued or renewed, and Let's Encrypt certificates expire after 90 days. Verify the live SAN with openssl s_client from an external machine, clean the exclusion list, and trigger issuance manually; the daily task takes over renewal afterwards."
---

You open your own website hosted on a cPanel server, and the browser warns "Your connection is not private" — the certificate details show an issuer that is a temporary hostname generated during the cPanel installation, with no relation to your domain.

Encountered this while [migrating two China sites for a global waterpark equipment manufacturer](/cases/waterpark-china-hosting-migration) — a compliance hosting engagement where long-expired certificates and browser security warnings were among the legacy issues we had to clear before sign-off.

## TL;DR

When the browser reports an untrusted self-signed certificate, the CA is usually fine — the real Let's Encrypt certificate was never issued. Check two things in order: first the AutoSSL per-account domain exclusion list (`whmapi1 get_autossl_user_excluded_domains`); once cleared, trigger issuance immediately with `start_autossl_check_for_one_user`. If issuance succeeds but the public still sees a self-signed certificate, look for a custom vhost pinning `SSLCertificateFile`. And note that `already optimal` does not mean full coverage — trust only the SAN of the certificate the public actually receives.

## Symptoms

Run a certificate check against the domain from an external machine:

```bash
$ openssl s_client -connect example.cn:443 -servername example.cn </dev/null 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates
subject=C = US, O = cPanel, L = Houston, ST = TX, OU = SSL Support, CN = 203-0-113-10.cprapid.com
issuer=C = US, O = cPanel, L = Houston, ST = TX, OU = SSL Support, CN = 203-0-113-10.cprapid.com
notBefore=May 21 00:00:00 2026 GMT
notAfter=Aug 19 00:00:00 2026 GMT
```

Three signals stack up: `issuer` identical to `subject` (self-signed), a CN that is the cprapid temporary hostname cPanel generated at install time (unrelated to the site), and validity dates matching the cPanel service certificate. In other words, visitors receive cPanel's self-signed service certificate — the Let's Encrypt certificate never reached the public.

The confusing part: inside WHM, AutoSSL looks perfectly healthy. Provider is Let's Encrypt, the daily task runs on schedule, and no errors appear. The AutoSSL log reveals the real reason:

```
User-excluded domains: 9 (mail.example.cn, webmail.example.cn, ...)
```

All 9 domains of the account are on the exclusion list — AutoSSL treats that as user intent, skips them every run, and wraps up with "already optimal".

## Root causes

**Cause one: the domain exclusion list blocks issuance (primary).** AutoSSL maintains a per-account exclusion list; domains on it never enter issuance. It neither errors nor warns — the daily task simply runs to completion, which is why the panel looks normal. The list gets populated in three common ways:

- Manual exclusions early on: the domain had no DNS or was still in testing, and the exclusion was never cleaned up
- cpmove migrations carry it over: restoring an archive brings the old server's exclusion state and old certificates to the new machine
- Newly created subdomains: cPanel adds a subdomain (together with its www.* form) to the list by default

**Cause two: a custom vhost pins the certificate path.** After clearing the list, the log confirmed a successful issuance — yet the public still received the self-signed certificate. Issued, but not served. This server carried a custom Apache include (a mirror vhost added for public IP routing) whose `SSLCertificateFile` was hardcoded to `/var/cpanel/ssl/cpanel/cpanel.pem`, cPanel's self-signed service certificate. Standard vhosts in cPanel's httpd.conf bind only the main IP, so all public traffic hit the mirror vhost and never saw the AutoSSL result.

The two causes stack: clearing only the list issues a certificate nobody sees; fixing only the vhost points the mirror at a certificate that was never issued. Fix one, then two — both are required.

## Fix

**1. Locate from outside.** Run the certificate check from an external machine (not on the server itself — see the warnings at the end). Once issuer equals subject is confirmed, query the exclusion list on the WHM server:

```bash
whmapi1 get_autossl_user_excluded_domains username=example
```

**2. Clear the exclusion list.** The `domain` parameter is repeatable, so all domains that need certificates can be allowed in one call:

```bash
whmapi1 remove_autossl_user_excluded_domains \
  username=example domain=example.cn domain=www.example.cn
```

Service subdomains such as mail or webmail that have no DNS record or do not need certificates are reasonably kept excluded — removing them only fills the log with DCV errors without producing any certificate.

**3. Trigger issuance immediately.** The daily task waits for the scheduler; a manual run executes now:

```bash
whmapi1 start_autossl_check_for_one_user username=example
```

Two naming details: there is no shorter variant without `_for_one_user`, and the parameter is `username`, not `user`. When unsure about function names, grep the module source:

```bash
grep -i autossl /usr/local/cpanel/Whostmgr/API/1/SSL.pm
```

The CLI equivalent is `/usr/local/cpanel/bin/autossl_check --user=example`. Logs land in `/var/cpanel/logs/autossl/`, one directory per timestamp; they contain binary characters, so filter with `grep -a` or `strings` before reading.

**4. If issuance succeeded but the public still sees the old certificate, inspect custom vhosts.** ACME requests succeeded and the certificate is on disk, yet visitors get the old one — traffic is not flowing through the standard vhost. Search the custom include for a pinned path:

```bash
grep -rn "SSLCertificateFile" /etc/apache2/conf.d/includes/post_virtualhost_global.conf
```

Replace the hardcoded cpanel.pem with the per-domain certificate path:

```apache
SSLCertificateFile /var/cpanel/ssl/apache_tls/example.cn/combined
```

Then restart with `/scripts/restartsrv_httpd`. This include file is custom configuration — cPanel does not overwrite it when rebuilding httpd.conf, so future renewals take effect automatically. One edit is enough.

**5. Final verification.** Re-run the step 1 command from outside: the issuer should now be a Let's Encrypt intermediate (R3/R10/R11 depending on LE rotation) and the SAN should include the site domain. Let's Encrypt certificates last 90 days; AutoSSL's daily task renews them from here on without further action.

## Migration and subdomain variants

- **After a cpmove migration**: the exclusion list and old certificate state arrive intact, and the old LE certificate's SAN usually covers only the apex and www. After a restore, clean the exclusion list and trigger issuance once — do not wait for the daily task.
- **Newly created subdomains**: cPanel auto-excludes them together with www.test.*; remove the exclusion after creation. A www.test.* without DNS resolution is better left excluded to avoid recurring DCV errors.
- **Domains attached via ServerAlias**: aliases injected through userdata includes are not managed by AutoSSL, and hand-editing parked_domains in userdata plus updateuserdomains gets silently dropped. The supported path is the official API:

```bash
uapi --user=example SubDomain addsubdomain domain=test rootdomain=example.cn dir=/home/example/public_html
```

Note the parameter is `rootdomain` — passing `parentdomain` is silently ignored and the API replies "You must specify a main domain".

<InfoBox variant="warning" title="Warnings">

- Do not verify certificates from the server itself using 127.0.0.1 or the main IP — you will hit the default vhost and misread the result. Trust only external `openssl s_client` output.
- whmapi1 outputs YAML by default; add `--output=json` before piping to jq.
- "already optimal" in the panel only means no issuance is due for the account — it does not prove coverage. Check the actual certificate SAN.

</InfoBox>

## Frequently Asked Questions

### Why is cPanel AutoSSL not issuing certificates?

Check the certificate itself: if the issuer equals the subject and the CN is a cPanel temporary hostname, no real certificate was ever issued. The two most common causes are the per-account AutoSSL domain exclusion list, and a custom vhost pinning SSLCertificateFile to the cPanel self-signed service certificate. Let's Encrypt certificates are valid for 90 days; once issuance succeeds, AutoSSL's daily task renews automatically.

### What are cPanel AutoSSL user excluded domains?

A per-account list of domains that AutoSSL deliberately skips. Beyond manual exclusions, a cpmove restore carries the old server's list over, and newly created subdomains are auto-excluded (including www.test.*) — in our case all 9 domains of one account were on the list. Remove them with `whmapi1 remove_autossl_user_excluded_domains`, then trigger `start_autossl_check_for_one_user` instead of waiting for the daily run.

### Why is cPanel AutoSSL not renewing certificates?

"already optimal" in the AutoSSL panel only means no renewal is due — it does not confirm coverage. Domains on the exclusion list are skipped silently, so nothing is ever issued or renewed, and Let's Encrypt certificates expire after 90 days. Verify the live SAN with openssl s_client from an external machine, clean the exclusion list, and trigger issuance manually; the daily task takes over renewal afterwards.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
