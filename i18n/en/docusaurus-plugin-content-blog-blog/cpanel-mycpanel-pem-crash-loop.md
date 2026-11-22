---
title: "cPanel Crash Loop? mycpanel.pem Needs Cert + Key in One File"
description: "cpsrvd exits status=25, port 2083 dead? mycpanel.pem must hold cert + key in one PEM, chain in cabundle. restartsrv rc=0 ≠ alive — probe the port."
date: 2026-11-23
tags: [cPanel, WHM, Linux, TLS]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What goes in mycpanel.pem vs mycpanel.cabundle?"
    a: "mycpanel.pem is one PEM holding the leaf certificate followed by the private key, owned cpanel:cpanel with 660 permissions; the intermediate chain goes separately into mycpanel.cabundle. Writing a fullchain into mycpanel.pem produces exactly this crash — no private key in the file, cpsrvd fails SSL loading, and systemd reports status=25 in a loop."
  - q: "Can the dovecot/exim certificate files be reused for cpsrvd?"
    a: "Not directly. cpsrvd expects a combined PEM (the same shape as the pure-ftpd bundle), while dovecot/exim use separate crt/key files — the formats are not interchangeable across the services. The same certificate must be written out in each service's own format."
  - q: "restartsrv returned 0 and systemctl says active — is cpsrvd really alive?"
    a: "Neither signal is a liveness proof: SSL setup failed 1-6 seconds after systemd started the unit, long after restartsrv printed its exit 0, and is-active still showed active in that window. Probe port 2083 instead (curl -sv or openssl s_client); a completed TLS handshake is the only evidence that counts."
---

After a deploy script replaced the cPanel service certificate, cpanel.service fell into a crash loop: nothing listening on 2083/2087, and both WHM and cPanel were unreachable.

Encountered this while [running managed hosting for a leading manufacturer's China site](/cases/waterpark-china-hosting-migration) — an ongoing engagement covering monitoring, backups, and certificate deployment on a production cPanel/WHM server.

## TL;DR

One cause: `/var/cpanel/ssl/cpanel/mycpanel.pem` must be a single PEM combining the leaf certificate and the private key (the same shape as the pure-ftpd bundle), with the chain in `mycpanel.cabundle`; the split crt/key formats used by dovecot/exim are not interchangeable, and writing a fullchain into the pem is exactly the crashing form. A second trap sits in verification: `restartsrv_cpsrvd` exit 0 and an `active` unit mean nothing — SSL setup fails 1-6 seconds after start, so recovery is proven on port 2083.

## Symptoms: panel down, service crash loop

Right after writing the new certificate and restarting, the panel hostname stopped responding and both 2083/2087 had no listener. The journal and error_log show two faces of the same failure:

```text
cpanel.service: Main process exited, status=25
cpsrvd: Failed to load SSL libraries or certificate from
        /var/cpanel/ssl/cpanel/ at cpsrvd.pl line 724
```

The standard recovery path came first: `restartsrv_cpsrvd` returned 0 and `systemctl is-active cpanel` reported active — it looked recovered. Seconds later 2083 was still silent and the panel still unreachable, crash loop intact. Those two green lights that aren't green are the second topic of this post.

## Root cause: mycpanel.pem is cert + key combined, not the chain

cPanel's format requirement for cpsrvd (the panel service) differs from most services: `mycpanel.pem` holds the **leaf certificate and private key combined**, while the chain lives separately in `mycpanel.cabundle`. That matches the pure-ftpd bundle shape; dovecot/exim use split crt/key files — the three formats are not interchangeable:

| Service | Certificate file shape |
|---|---|
| cpsrvd (cPanel/WHM panel) | `mycpanel.pem` combined (leaf+key) + `mycpanel.cabundle` (chain) |
| pure-ftpd | combined bundle (same shape as cpsrvd) |
| dovecot / exim | split crt/key |

The failing script wrote a fullchain — chain only, no private key — into `mycpanel.pem`. At startup cpsrvd loads SSL, finds no private key, and fails at `cpsrvd.pl line 724`; systemd starts the unit, the process exits immediately, status 25, and the cycle repeats. The certificate itself was fine; only the file shape was wrong.

One distinction worth making: this is the cPanel service certificate (hostname-level, serving the panel ports). Site domain certificates go through AutoSSL — a separate track; when issuance stalls there, check the exclusion list first, see [cPanel AutoSSL Not Issuing? Self-Signed Certificate Fix](/blog/cpanel-autossl-not-issuing).

## The false-success detour: restartsrv exit 0 ≠ cpsrvd alive

Timing is what makes this misleading. SSL setup fails 1-6 seconds after systemd starts the unit, while `restartsrv_cpsrvd` returned its 0 at start-up time and `is-active` sampled the pre-crash window — both signals landed before the crash, so both were green.

That pair of green lights is exactly what the triage trusted first: recovery declared on restartsrv 0 + active, then the panel still down, and only a direct `curl` against 2083 exposed the SSL load failure. Since then, liveness for cpsrvd on this server is judged only by port probes: `curl -sv https://hostname:2083` or `openssl s_client -connect hostname:2083`, requiring a completed handshake with certificate details.

"State signal disconnected from actual usability" is not an one-off — the reverse variant, systemctl showing inactive while the process runs, is covered in [systemctl Shows inactive But the Process Is Running? Bare-Process Health Check False Negative](/blog/redis-systemctl-inactive-but-running). The shared conclusion: probe the service through its own port/protocol, not through the process manager's word.

## Fix: write per-service formats, verify on the port

The repair is three steps: combined PEM in place, chain separated, acceptance on the port.

```bash
# leaf.pem = server certificate (leaf), privkey.pem = private key, cabundle.pem = chain
cat leaf.pem privkey.pem > /var/cpanel/ssl/cpanel/mycpanel.pem
cp cabundle.pem /var/cpanel/ssl/cpanel/mycpanel.cabundle
chown cpanel:cpanel /var/cpanel/ssl/cpanel/mycpanel*
chmod 660 /var/cpanel/ssl/cpanel/mycpanel*
systemctl restart cpanel
```

Acceptance ignores status signals and reads the port only:

```bash
curl -sv https://<hostname>:2083 -o /dev/null 2>&1 | grep -E 'subject|expire'
curl -sv https://<hostname>:2087 -o /dev/null 2>&1 | grep -E 'subject|expire'
```

Both commands must print the certificate subject and expiry before the panel ports count as recovered. After this incident the deploy script fixed the combined format in place and gained an end-to-end check: the hook prints DEPLOY-OK with all four service ports green.

For the other services, match the table above: dovecot/exim get split crt/key, pure-ftpd and cpsrvd get combined bundles. One certificate, three file shapes, none interchangeable.

<InfoBox variant="warning" title="Notes">

- Content order in `mycpanel.pem`: leaf certificate first, private key after; the chain goes into `mycpanel.cabundle`, never into the pem.
- Permissions `cpanel:cpanel` 660 — too wide or too narrow, cpsrvd may refuse to load.
- Acceptance is port probes only; restartsrv's exit code and is-active are not liveness evidence.
- More AlmaLinux 10 + cPanel close-out pitfalls (TFA, missing resources, domain mounting): [AlmaLinux 10 + cPanel: New-Server Pitfalls from TFA to DNS](/blog/almalinux-10-cpanel-pitfalls).

</InfoBox>

## FAQ

### What goes in mycpanel.pem vs mycpanel.cabundle?

mycpanel.pem is one PEM holding the leaf certificate followed by the private key, owned cpanel:cpanel with 660 permissions; the intermediate chain goes separately into mycpanel.cabundle. Writing a fullchain into mycpanel.pem produces exactly this crash — no private key in the file, cpsrvd fails SSL loading, and systemd reports status=25 in a loop.

### Can the dovecot/exim certificate files be reused for cpsrvd?

Not directly. cpsrvd expects a combined PEM (the same shape as the pure-ftpd bundle), while dovecot/exim use separate crt/key files — the formats are not interchangeable across the services. The same certificate must be written out in each service's own format.

### restartsrv returned 0 and systemctl says active — is cpsrvd really alive?

Neither signal is a liveness proof: SSL setup failed 1-6 seconds after systemd started the unit, long after restartsrv printed its exit 0, and is-active still showed active in that window. Probe port 2083 instead (curl -sv or openssl s_client); a completed TLS handshake is the only evidence that counts.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
