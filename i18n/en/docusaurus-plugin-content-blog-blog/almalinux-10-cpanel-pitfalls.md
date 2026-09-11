---
title: "AlmaLinux 10 + cPanel: New-Server Pitfalls from TFA to DNS"
description: "AlmaLinux 10 + cPanel 138: TFA stays password-only until the policy switch is on, upstream 'missing' assets debunked, NS-rejected parked domains fixed."
date: 2026-09-12
tags: [cPanel, AlmaLinux, WHM, Server Security]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is ssh PermitRootLogin no not working?"
    a: "Because sshd takes the first value it parses. On AlmaLinux the Include directive sits at the top of the main sshd_config, so drop-in files under sshd_config.d/ are parsed before the main body — a drop-in overrides the main file, and among drop-ins the lexicographically first filename wins. Always verify with sshd -t followed by sshd -T | grep permitrootlogin to see the effective value before reloading."
  - q: "How does WHM two-factor authentication work?"
    a: "Two layers must both be active: the server-wide policy switch (twofactorauth_enable_policy) and the per-user TOTP secret (twofactorauth_set_tfa_config). With the policy off, WHM keeps validating password only even when a secret exists. When configuring via CLI, the token parameter is tfa_token — not code — and the TOTP must be computed against the server clock; a skew of just 20-odd seconds crosses the window and gets rejected."
  - q: "Why is my Apache ServerAlias not working on cPanel?"
    a: "The userdata include is most likely inert: a wrong directory name leaves the Include line commented out in httpd.conf, and the alias never loads. ServerAlias files belong in /etc/apache2/conf.d/userdata/std/2_4/<user>/<domain>/ and the ssl counterpart, followed by /scripts/rebuildhttpdconf. Verify by checking whether the Include userdata lines in httpd.conf carry a comment prefix, then confirm with httpd -S and the vhost domlogs."
---

cPanel 138 on AlmaLinux 10 installs smoothly and the panel opens — the real traps cluster in the close-out phase: security hardening, panel asset repairs, and domain mounting, each with counter-intuitive behavior waiting.

Encountered this while [hardening a production cPanel server for a client](/cases/waterpark-china-hosting-migration) — all three failure classes showed up during the close-out of the same AlmaLinux 10 machine. This post breaks them down by scenario.

## TL;DR

Three scenarios, three "looks right, does nothing" traps: TFA configured but login never asks for a code — the policy-wide switch is off, so per-user configuration is inert; frontend assets that look "missing" must be verified against the official manifest first — some never existed on that cpanelsync tree, and some are skipped because a polluted digest cache lets upcp fake success; Park domains rejected by the NS ownership check — when DNS lives on a cloud provider, the userdata include injecting a ServerAlias is the supported path.

## Scenario one: "missing" WHM frontend libraries — verify before fixing

While triaging panel oddities, `/usr/local/cpanel/base/libraries` turns out not to exist — do not rush to repair a defect. Upstream cPanel 138 simply has no such path. The real homes of the shared frontend libraries:

- `base/frontend/jupiter/libraries/` — a symlink farm pointing at `../../../../3rdparty/share/<lib>`, distributed by jupiter's own cpanelsync tree (sortablejs, ui-fonts, fontawesome, cldr)
- `base/unprotected/libraries/` — same mechanism, hosting legacy libraries

To decide whether a file is genuinely missing, pull the official manifest instead of trusting one path:

```bash
curl -sO http://httpupdate.cpanel.net/cpanelsync/138/<tree>/.cpanelsync.bz2
bzcat .cpanelsync.bz2 | grep <target-path>
# Entry format: d===./path===755          (directory)
#               l===./link-name===777===target (symlink)
```

Second rule: `base/` is not entirely cpanelsync-distributed. The v138 `cpanel-*` RPMs (bootstrap5, ace-editor, sortablejs and friends) install libraries directly into `/usr/local/cpanel/3rdparty/share/<lib>/<version>`, and cpanelsync only lays the symlinks into the theme trees. **Verify the RPM side with `rpm -V <package>` and the cpanelsync side with the manifest — both.**

If files are confirmed missing but `upcp --sync` reports success without restoring them, suspect the digest caches: `/usr/local/cpanel/.cpanelsync.digest` and the per-theme-tree digests. When an interrupted update pollutes them, --sync skips the missing files and still exits 0. Delete the affected digest and run `upcp --force` for a full reconciliation.

**A successful --sync is not proof of complete files — judge by actual page loading**: drive a headless Chromium to collect console errors and requests at 4xx or above; that is more honest than any exit code.

Two more operational traps on hardened machines:

- For root access, prefer the cloud assistant (`aliyun ecs RunCommand`) — out-of-band, SSH-free, audited by default. Pass the instance via `--InstanceId.1` and feed `CommandContent` the raw script, not base64. Any temporary sudoers grant needs a self-cleaning `/etc/cron.d` entry; after cleanup, `sudo -n whoami` must answer `a password is required` to confirm the revoke took.
- Bulk-probing cpsrvd triggers rate limiting: a shell loop of individual curl calls degrades to all-000 responses after a few dozen requests, which reads like a mass 404. A single curl process fetching multiple URLs over keepalive behaves normally. And `pkill -f` matches your own bash -c command line — use the `[]` character-class trick or a plain PID.

A 200 from a WHM page does not mean an authenticated session — the login page returns 200 too. Assert on the `<title>` or a body fingerprint (the Two-Factor Authentication page's title, for instance).

## Scenario two: the hardening chain of traps

The goal: no root over SSH, TFA on the panel, a minimal sudo whitelist. Every step hides a precondition.

**The TFA policy switch is a precondition.** After `twofactorauth_set_tfa_config` writes a user's secret, the login form may never show the code step — `twofactorauth_policy_status` must report `is_enabled` = 1 (enabled via `twofactorauth_enable_policy`), otherwise WHM validates password only. Verified in a browser: before the policy, the password logs straight in; after, an "Enter the security code" page appears.

Two CLI details for TFA: the token parameter of `twofactorauth_set_tfa_config` is **`tfa_token`**, not `code` (passing code silently fails with "security code is invalid"); and the TOTP must be computed against the **server clock** — a 23-second skew crosses the window and the locally computed code is always rejected. The secret lands in `/var/cpanel/authn/twofactor_auth/tfa_userdata.json`.

**The supported API path without root SSH is session plus cpsess prefix.** After `create_user_session` and a curl cookie-jar login, API calls must carry the cpsess path: `https://host:2087/cpsessNNN/json-api/<function>`; hitting `/json-api/` directly answers "Token denied". The `service` parameter of `create_user_session` is `whostmgrd` (with the d) — `whostmgr` and `cpanel` are rejected; only `cpaneld`, `webmaild`, `whostmgrd` are valid.

**sudoers matches the entire command sequence exactly.** Even the position of `--output=json` and the argument order are locked; any edit to the caller's command silently degrades to password authentication — which, with the opsuser password locked, is an outright refusal. Changing the command means changing the matching sudoers file.

**Three whmapi1 details:** the real path is `/usr/local/cpanel/bin/whmapi1` (prefer it over the symlink); the default output is YAML, so `--output=json` before jq; and `sethostname` takes `hostname`, not `domain` — `domain=` silently passes an empty value and runs to no effect, and cPanel refuses `whm.`/`cpanel.`/`webmail.`-prefixed hostnames. On machines with the DNS role disabled, the trailing dnsadmin socket "Connection refused" is expected and harmless; after a rename, `create_user_session` URLs follow the new hostname automatically, and AutoSSL reissues the cpsrvd certificate within about a minute.

**sshd drop-ins: first value wins.** The `Include sshd_config.d/*.conf` in AlmaLinux's main sshd_config sits at the top, so drop-ins parse before the main body and sshd keeps the first occurrence — that is how a drop-in overrides the main file; among drop-ins, filename sort order decides (`000-` sorts before `00-`). After any change: `sshd -t`, then `sshd -T | grep -E 'permitrootlogin|passwordauthentication|allowusers'` to confirm the effective values before reloading.

**Host Access Control does nothing here.** cPanel 138 + AlmaLinux 10 ships a cpsrvd that does not link libwrap (tcp_wrappers is gone from RHEL-line distributions); rules written to `/etc/hosts.allow` and a cpsrvd restart changed nothing in testing. Layer-3/4 allowlists belong in firewalld rich rules; leaving hosts.allow in place is harmless — it activates automatically if libwrap ever returns.

**Three AlmaLinux 10 verification blind spots:** `last` is always empty — systemd 256 dropped wtmp, login records live only in the journal (`journalctl -u sshd` as root); opsuser cannot execute `/usr/bin/su` (denied at the exec layer), so the root password can only be verified through a WHM form or the console; and `/etc/ssh/sshd_config.d/`, `/etc/cron.d/*` (mode 600), `/var/cpanel/authn/` are unreadable to opsuser — hardening audits must run in WHM Terminal or VNC.

## Scenario three: domain NS lives elsewhere, alias mounting rejected

`uapi Park park domain=test.xxx` is refused: the domain's nameservers (hosted on a cloud DNS) are "not associated with this server" — cPanel validates that the domain's authoritative NS points at the machine, and in common China-hosting setups DNS lives on the provider, so this check can never pass.

The supported path, without touching the domain's NS, is a userdata include injecting a ServerAlias:

```bash
# one for http, one for https
/etc/apache2/conf.d/userdata/std/2_4/<user>/<domain>/alias.conf
/etc/apache2/conf.d/userdata/sssl/2_4/<user>/<domain>/alias.conf
```

(The ssl-side directory name varies by version — `sssl/2_4` here, sometimes written `ssl/2_4`; trust the uncommented include line in httpd.conf.) Contents, one line:

```apache
ServerAlias test.xxx
```

Then `/scripts/rebuildhttpdconf`. **A wrong directory name leaves the include line commented out — silently inert.** Verify by inspecting whether the `Include "...userdata..."` lines in httpd.conf carry a comment prefix.

Confirm routing with `httpd -S` and by watching which vhost's domlog receives the requests.

One linkage note: domains attached via ServerAlias are not managed by AutoSSL, so no certificate is issued for them automatically — see [cPanel AutoSSL Not Issuing? The Exclusion List and vhost Paths](/blog/cpanel-autossl-not-issuing).

<InfoBox variant="warning" title="Warnings">

- Hardening steps have order dependencies: enable the TFA policy switch before configuring user secrets; confirm the sudoers whitelist command works before disabling root SSH — inverted order locks you out.
- Never declare a file missing without diffing the official manifest and checking the RPM side — two distribution channels, both must be cleared.
- Configuration file content is not runtime behavior: after drop-in edits, read the effective values from sshd -T.

</InfoBox>

## Frequently Asked Questions

### Why is ssh PermitRootLogin no not working?

Because sshd takes the first value it parses. On AlmaLinux the Include directive sits at the top of the main sshd_config, so drop-in files under sshd_config.d/ are parsed before the main body — a drop-in overrides the main file, and among drop-ins the lexicographically first filename wins. Always verify with sshd -t followed by sshd -T | grep permitrootlogin to see the effective value before reloading.

### How does WHM two-factor authentication work?

Two layers must both be active: the server-wide policy switch (twofactorauth_enable_policy) and the per-user TOTP secret (twofactorauth_set_tfa_config). With the policy off, WHM keeps validating password only even when a secret exists. When configuring via CLI, the token parameter is tfa_token — not code — and the TOTP must be computed against the server clock; a skew of just 20-odd seconds crosses the window and gets rejected.

### Why is my Apache ServerAlias not working on cPanel?

The userdata include is most likely inert: a wrong directory name leaves the Include line commented out in httpd.conf, and the alias never loads. ServerAlias files belong in `/etc/apache2/conf.d/userdata/std/2_4/<user>/<domain>/` and the ssl counterpart, followed by `/scripts/rebuildhttpdconf`. Verify by checking whether the Include userdata lines in httpd.conf carry a comment prefix, then confirm with httpd -S and the vhost domlogs.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
