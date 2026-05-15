---
title: Fix WSL2 Cannot Access Windows Host Proxy — Three Invisible Pitfalls
description: WSL2 cannot access host proxy due to firewall blocking, dynamic IP changes, and stale config cached keys. Complete troubleshooting steps and solutions.
date: 2026-04-02
tags: [WSL2, Windows Firewall, Proxy, Dev Environment, VSCode, Claude-Code, Roo]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WSL2 can curl external sites directly, but gets connection refused through proxy, why?"
    a: "Three possible causes: (1) firewall blocking vEthernet(WSL) interface, (2) stale proxy environment variables after WSL restart, (3) cached API keys in config files."
  - q: "Why doesn't adding a firewall inbound port rule fix the?"
    a: "Inbound rules bind to Network Profiles (Domain/Private/Public). vEthernet(WSL) belongs to none, so rules are simply skipped — not denied, just ignored."
  - q: "My proxy works in WSL2 but breaks after Windows restart. How to fix?"
    a: "vEthernet(WSL) IP is dynamically assigned on each launch. Use dynamic IP detection in .bashrc instead of hardcoded IP."
  - q: "Does the one-command fix create security risks?"
    a: "Set-NetFirewallProfile -DisabledInterfaceAliases 'vEthernet (WSL)' only disables the firewall on the WSL virtual NIC. Physical adapters are unaffected. The setting persists across reboots."
  - q: "How to fix Claude Code/GLM auth conflict error?"
    a: "Check environment variables with `echo $ANTHROPIC_API_KEY $ANTHROPIC_AUTH_TOKEN`, clear cached keys in `~/.claude.json`, and remove hardcoded values from `~/.claude/settings.json`."
---

Encountered this issue while using AI coding tools (Claude Code, Roo) in WSL2 that need to access APIs through the Windows host proxy. After fixing the firewall, encountered two more hidden pitfalls. Documenting all root causes and solutions.

## TL;DR

WSL2's `vEthernet (WSL)` virtual NIC is created on every launch. Windows Firewall cannot assign a Network Profile to it, so **all inbound rules are ineffective** (`EnforcementStatus: NotApplicable`). Don't add rules — disable the firewall on that interface directly:

```powershell
# Run in Windows PowerShell (Administrator)
Set-NetFirewallProfile -DisabledInterfaceAliases "vEthernet (WSL)"
```

Additionally, after fixing the firewall, you may encounter **two more pitfalls**:
1. **Dynamic IP Issue**: Host IP changes after WSL/Windows restart
2. **Config Cache Issue**: Stale API keys in `~/.claude.json` and `~/.claude/settings.json` cause auth conflicts


<!-- truncate -->
## Problem

Environment: Windows 10 21H2 + WSL2 2.5.10.0 (NAT mode), Clash Verge on host (port 7897, Allow LAN enabled).

Symptoms:

```bash
# Ping host from WSL — no response
ping 172.22.80.1

# Test proxy port — no response
nc -zv 172.22.80.1 7897

# Claude Code / Roo error
# API Error: ConnectionRefused

# But direct external access works fine
curl https://example.com  # OK
```

On the Windows side, Clash is healthy: `netstat` shows `0.0.0.0:7897` listening, and `Test-NetConnection localhost 7897` succeeds.

## Root Cause 1: Firewall Blocking

**`vEthernet (WSL)` is a virtual NIC dynamically created by WSL2 on every launch.** Windows Firewall's Network Profiles (Domain / Private / Public) cannot be associated with this interface.

This means:

1. Firewall inbound rules bind to Profiles
2. vEthernet(WSL) belongs to no Profile
3. All inbound rules show `EnforcementStatus: NotApplicable` for this interface
4. **Rules are simply skipped** — not denied, not evaluated at all

No amount of port rules or InterfaceAlias bindings will work, because the rules never execute against this interface.

## Solution 1: Fix Firewall with One Command

### Step 1: Confirm the Root Cause

In Windows PowerShell (Administrator):

```powershell
# Check the virtual NIC
Get-NetAdapter | Where-Object { $_.Name -like "*WSL*" }

# Check rule enforcement status
Get-NetFirewallRule -DisplayName "*7897*" |
  Get-NetFirewallInterfaceFilter |
  Get-NetFirewallPortFilter |
  Format-Table -Property * -AutoSize
```

If rules exist but WSL still can't connect, Profile enforcement is the issue.

### Step 2: Fix with One Command

```powershell
# Disable firewall on the WSL virtual NIC only
Set-NetFirewallProfile -DisabledInterfaceAliases "vEthernet (WSL)"
```

Effects:
- Only applies to the `vEthernet (WSL)` virtual NIC
- Physical adapters (Wi-Fi, Ethernet) remain fully protected
- Setting persists across reboots

### Step 3: Verify

```bash
# Test connectivity from WSL
nc -zv 172.22.80.1 7897
# Output: Connection to 172.22.80.1 7897 port [tcp/*] succeeded!

# Test proxy
curl -x http://172.22.80.1:7897 https://api.anthropic.com
```

## Root Cause 2: Dynamic IP Changes

After fixing the firewall, proxy may still fail. Why? `vEthernet (WSL)` IP changes on every launch.

If you hardcoded the IP in `.bashrc` like:
```bash
export http_proxy=http://172.22.80.1:7897  # This IP may change!
```

**Fix**: Dynamically detect host IP in `.bashrc`:

```bash
# Auto-detect host IP from DNS server
export WINDOWS_IP=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}')
export http_proxy="http://${WINDOWS_IP}:7897"
export https_proxy="http://${WINDOWS_IP}:7897"
```

## Root Cause 3: Config File Cached Keys
After fixing firewall and dynamic IP, Claude Code/GLM may still report auth conflicts. Why? Stale keys cached in:

1. `~/.bashrc` global export of `ANTHROPIC_API_KEY`
2. `~/.claude.json` stores previously approved keys in `customApiKeyResponses.approved`
3. `~/.claude/settings.json` may have hardcoded environment variables

When switching to GLM mode, `unset ANTHROPIC_API_KEY` works temporarily, but bashrc reload re-exports it. Claude Code reads all three sources and reports conflict.

### Solution 3: Clear Cached Keys

```bash
# 1. Check for conflicts
echo $ANTHROPIC_API_KEY $ANTHROPIC_AUTH_TOKEN

# 2. Clear ~/.claude.json cache
cat ~/.claude.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('customApiKeyResponses', {}))"

# 3. Check ~/.claude/settings.json
cat ~/.claude/settings.json | grep -A2 '"env"'
```

**Fix**: Remove hardcoded values from `settings.json`:

```bash
python3 -c "
import json
with open('/home/aptop/.claude/settings.json') as f:
    d = json.load(f)
d['env'].pop('ANTHROPIC_API_KEY', None)
d['env'].pop('HTTPS_PROXY', None)
d['env'].pop('HTTP_PROXY', None)
with open('/home/aptop/.claude/settings.json', 'w') as f:
    json.dump(d, f, indent=2)
"
```

For `~/.claude.json`, manually edit the file to remove stale entries from `customApiKeyResponses.approved`.

<InfoBox variant="warning" title="Important Notes">

- **Firewall Fix**
  - If your Clash port is not 7897, replace it with your actual port — the key is fixing the firewall interface, not the port
  - WSL updates or major Windows updates may reset the virtual NIC config; re-run the same command if the issue recurs
  - Windows 10 does not support WSL2's `mirrored` networking mode (only Windows 11 23H2+), do not try this direction

- **Dynamic IP**
  - Always use dynamic IP detection in `.bashrc` — never hardcode the host IP
  - The DNS server IP in `/etc/resolv.conf` is stable across WSL restarts

- **Config Cache**
  - After clearing cached keys, restart Claude Code to apply changes
  - If auth still fails, check all three sources: environment variables, `~/.claude.json`, and `~/.claude/settings.json`

</InfoBox>

## Troubleshooting Checklist (For Future Reference)

1. `echo $ANTHROPIC_API_KEY $ANTHROPIC_AUTH_TOKEN` — confirm if both exist (conflict)
2. `cat ~/.claude.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('customApiKeyResponses', {}))"` — check cached keys
3. `cat ~/.claude/settings.json | grep -A2 '"env"'` — check for hardcoded env vars
4. `curl https://open.bigmodel.cn` — confirm GLM API is accessible

## Dead Ends: 5 Directions Ruled Out

For anyone currently troubleshooting, here are the paths already confirmed as dead ends:

| # | Direction | Result | Reason |
|---|-----------|--------|--------|
| 1 | Proxy environment variables | Ruled out | `.bashrc` unset/export pattern is by design for model switching |
| 2 | Clash Allow LAN not enabled | Ruled out | Allow LAN is on, listening on `0.0.0.0:7897`, localhost works |
| 3 | Firewall port rule | Ruled out | Added port 7897 inbound rule, still blocked — NotApplicable |
| 4 | Bind rule to InterfaceAlias | Ruled out | `Set-NetFirewallRule -InterfaceAlias "vEthernet (WSL)"` had no effect |
| 5 | Mirrored networking mode | Ruled out | Windows 10 does not support it |

The key insight: **We kept trying to add rules, but the problem wasn't missing rules — it was that rules don't apply to this interface at all.**

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Contact Us</a>
</div>
