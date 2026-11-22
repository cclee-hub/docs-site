---
title: "Cert Alert Every Day? cPanel Keeps Stale Cert Generations"
description: "Shortest expiry in a cert alert isn't always the live cert — cPanel keeps old generations, and file-scan monitors re-report the stale one until you delete it."
date: 2026-11-23
tags: [cPanel, TLS, Monitoring, Ops]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "A certificate expiry alert keeps firing every day — what should I do?"
    a: "Identify the live certificate before acting: check the *-NOT_AFTER marker files under /var/cpanel/ssl/ and probe the actual port certificate with s_client. In this incident the alert's '20 days left' came from a stale generation file, while the live certificate was valid until 2027-02-08. Once the alert target is confirmed as an unreferenced stale file, delete it (crt plus .cache) and the alert clears on the next scan — no certificate replacement needed."
  - q: "How do I tell which certificate is the live one?"
    a: "Cross-check two sources: the *-NOT_AFTER marker files beside each certificate in the directory (epoch timestamps), and a live port probe (s_client reading the actual expiry). For the live certificate the two values agree. Filenames, issue dates, or the shortest remaining-days figure in a monitor are all unreliable — in this case the shortest 20 days belonged precisely to an unreferenced stale generation."
  - q: "Will deleting old certificate generations disrupt live services?"
    a: "Delete only files confirmed to be unreferenced (the crt and its .cache); leave the live certificate untouched. After the deletion, services on ports 2083 and 993 were unaffected and the alert cleared on the next scan. The precondition is evidence first: both the NOT_AFTER marker and the live probe must point to 'not in service' before deleting."
---

A certificate expiry monitor reported the same service certificate at "20 days left" every single day, while a live port probe showed the certificate actually in service was valid until 2027-02-08 — the alert and reality were more than two years apart.

Tracked this down while [running managed hosting for a leading manufacturer's China site](/cases/waterpark-china-hosting-migration) — certificate expiry monitoring is a standing patrol item on that cPanel server.

## TL;DR

The root of the false alarm is "shortest days ≠ live certificate": cPanel's service certificate directory (`/var/cpanel/ssl/system/certs/`) accumulates past generations — multiple generations coexist, nothing prunes them. A monitor that scans PEM files one by one counts the expired-but-unreferenced old generation too, whose negative remaining days stay under the 21-day threshold forever, so the alert repeats daily. The path out: check the `*-NOT_AFTER` markers in the directory plus a live `s_client` probe to identify the live cert, delete the unreferenced stale generation (crt and .cache), and the alert heals on the next scan with services untouched.

## Symptoms: the cert alert fires daily, the live certificate has two years left

The alert reported the minimum remaining days across certificates: some service certificate expiring in 20 days, repeating daily — as if a certificate were simultaneously expired and about to expire, forever.

Checking the alert against reality didn't add up. Live probes across the four service ports (s_client, reading the presented certificate) all pointed to the same current-generation certificate: NOT_AFTER marker 1802123049, which converts to 2027-02-08. The "20 days left" certificate — a Let's Encrypt past generation issued September 11, expiring December 10 — was referenced by no service at all. Long expired, it had disturbed no online service, only the monitor.

## Root cause: generations coexist, file scans don't follow references

cPanel installs service certificates by accumulating them into `system/certs/`: each renewal or reissue adds a new generation, and older generations stay where they are. The directory therefore holds several generations at any time.

The monitor scans by PEM file sniffing: it reads each file and computes remaining days per file, without checking which service actually references which certificate. The hostname filter is substring-based — every generation of the same hostname shares the same CN, so the filter cannot separate live from expired. The oldest expired generation thus sits permanently below the 21-day alert threshold and gets reported every scan. The monitor wasn't lying — it faithfully reported the oldest file in the directory. What lied was the default assumption "shortest-days file = live certificate."

## Fix: NOT_AFTER plus a live probe identify the live cert; delete unreferenced generations

Four steps, evidence first:

```bash
# 1. Each certificate has a NOT_AFTER marker file beside it (epoch); check markers first
ls /var/cpanel/ssl/system/certs/
cat /var/cpanel/ssl/system/certs/*-NOT_AFTER
# live generation marker 1802123049 → date -r 1802123049 → 2027-02-08

# 2. Live port probe: what certificate does the service actually present?
openssl s_client -connect <hostname>:2083 </dev/null 2>/dev/null \
  | openssl x509 -noout -enddate
# output must match the live NOT_AFTER marker
```

```bash
# 3. With markers and probe both saying "not in service" and no references: delete stale generation
rm /var/cpanel/ssl/system/certs/<stale-generation>.crt
rm /var/cpanel/ssl/system/certs/<stale-generation>.cache

# 4. Verify: services intact + alert cleared
openssl s_client -connect <hostname>:2083 </dev/null 2>/dev/null | head -1
openssl s_client -connect <hostname>:993  </dev/null 2>/dev/null | head -1
```

Result of the actual run (2026-11-22): services on 2083 and 993 unaffected after deletion, and the alert stopped repeating from the next scan — the shortest remaining days in the directory became the live certificate's true count, and the monitor's view re-aligned with reality. This "file-scan, conclusion-style alerting" patrol is part of [CCLee Server Sentinel](/docs/server-sentinel)'s certificate monitoring — alerts are merged into conclusions with handling guidance; for the issuance side of certificates (AutoSSL not issuing), see [cPanel AutoSSL Not Issuing? Self-Signed Certificate Fix](/blog/cpanel-autossl-not-issuing).

<InfoBox variant="warning" title="Notes">

- Order of judgment for certificate alerts: check NOT_AFTER markers and live port probes before any action — the shortest remaining days is not necessarily the live certificate.
- Delete only confirmed-unreferenced files; the live certificate and its .cache stay.
- After deletion, verify both ways: port probes intact, alert gone on the next scan — both required.
- Multiple generations of the same hostname share the same CN; substring filters cannot separate them — don't rely on filters, check the markers.

</InfoBox>

## FAQ

### A certificate expiry alert keeps firing every day — what should I do?

Identify the live certificate before acting: check the *-NOT_AFTER marker files under /var/cpanel/ssl/ and probe the actual port certificate with s_client. In this incident the alert's '20 days left' came from a stale generation file, while the live certificate was valid until 2027-02-08. Once the alert target is confirmed as an unreferenced stale file, delete it (crt plus .cache) and the alert clears on the next scan — no certificate replacement needed.

### How do I tell which certificate is the live one?

Cross-check two sources: the *-NOT_AFTER marker files beside each certificate in the directory (epoch timestamps), and a live port probe (s_client reading the actual expiry). For the live certificate the two values agree. Filenames, issue dates, or the shortest remaining-days figure in a monitor are all unreliable — in this case the shortest 20 days belonged precisely to an unreferenced stale generation.

### Will deleting old certificate generations disrupt live services?

Delete only files confirmed to be unreferenced (the crt and its .cache); leave the live certificate untouched. After the deletion, services on ports 2083 and 993 were unaffected and the alert cleared on the next scan. The precondition is evidence first: both the NOT_AFTER marker and the live probe must point to 'not in service' before deleting.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
