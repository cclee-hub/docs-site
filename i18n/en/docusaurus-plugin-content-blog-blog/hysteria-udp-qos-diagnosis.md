---
title: "Hysteria Authenticates but Times Out? UDP Path QoS Diagnosis"
description: "Auth succeeds, the flow dies with timeouts, server checks all pass. Rule out the host, pin it on QoS of long-lived UDP flows, and reconnect to recover."
date: 2026-09-28
tags: [hysteria, UDP, Network Diagnostics, VPS Ops]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Hysteria authenticates but there is no traffic — how do I triage by layer?"
    a: "Cut the path into three layers. First, the server log: a client connected line means authentication and the port are fine. Second, in-flow errors: timeout: no recent network activity means the flow itself is dead. Third, full server health checks (outbound TCP, NIC drops, conntrack, certs, memory, disk) — all green rules out the host and points at the path, most commonly carrier QoS on cross-border UDP."
  - q: "What does 'timeout: no recent network activity' mean in Hysteria?"
    a: "It is the server's per-flow liveness probe: a flow with no valid packets for a while is declared dead and closed. When authentication succeeds but flows starve right after, the typical cause is an intermediate device (carrier QoS) having flagged that UDP 5-tuple and silently dropping its packets — the client still thinks it is connected, but the tunnel is half-dead."
  - q: "How do I check if my UDP traffic is being throttled?"
    a: "Correlate three signals: server-side health is clean (ruling out the host), the flow dies after minutes of sustained transfer rather than instantly (a traffic-shaping signature, not an outage), and reconnecting — which changes the source port — immediately restores service. Together they indicate per-flow rate shaping rather than a connectivity failure."
---

Clash shows connected, yet no page loads. The server log shows `client connected`, followed by `timeout: no recent network activity` inside the flow — each flow dying within 52 seconds to a few minutes. Every server health check passes.

> Encountered this while maintaining a self-hosted overseas VPS — a cross-border path failure with a perfectly healthy host; recording the full layered diagnosis.

## TL;DR

**Authentication passes, flows time out, host health checks are all green — the problem is not the host but the path: the international link applies QoS to long-lived UDP 5-tuples, leaving flows half-dead.**

- Immediate recovery: reconnect Clash — the client re-handshakes with a new source port, sidestepping the flagged 5-tuple; works in roughly 9 out of 10 cases
- Confirm the diagnosis: `journalctl -u hysteria-server` should show a repeating `client connected` → `timeout: no recent network activity` cycle
- Long-term mitigation (concept only): server-side port rotation, or lowering bandwidth declarations so the traffic profile stops triggering suppression — evaluate if recurrence gets frequent; not covered here

## Symptoms

Client and server symptoms combine into a complete picture:

**Client**: Clash reports connected (UDP authentication OK) but no site loads and speed tests show zero throughput.

**Server** (`journalctl -u hysteria-server`):

```
client connected               ← auth OK
... (52s ~ a few minutes later)
timeout: no recent network activity   ← flow-level death
client disconnected
client connected               ← auto-reconnect, cycle repeats
```

**Severity data**: during the worst window, reconnect storms hit 94 / 50 / 20 per day; one representative case was triggered by a 9-hour-old session going half-dead.

## The Diagnosis Chain: Rule Out the Host First, Then Pin the Path

The value of this chain is the **order of elimination** — blaming the carrier before clearing the host leaves the conclusion standing on nothing.

**Layer 1: authentication and port.** `client connected` in the log means UDP packets reach the server, the port is open, and auth config is correct. The first half of the path (client → server) works.

**Layer 2: flow-level timeouts.** `timeout: no recent network activity` is the server's flow liveness probe: a flow with no valid packets is declared dead. Auth passes but flows starve immediately — the return leg (server → client) is likely being dropped.

**Layer 3: host health checks (clearing the host).** All pass; the host is clean:

| Check | Result |
|--------|------|
| Outbound TCP (large-file curl) | Normal, full bandwidth |
| NIC drop / error counters | 0 |
| conntrack table | No abnormal buildup |
| TLS certificate expiry | Normal |
| Memory / disk | Normal |

**Layer 4: pinning the cause.** Three layers of evidence point to one conclusion: the host sends and receives fine, the auth direction works, and only sustained-traffic flows lose their return packets — the signature of **carrier-side QoS on long-lived, high-throughput UDP 5-tuples at the international gateway**: a single UDP flow (same 5-tuple) running hard gets flagged by traffic classification, after which its packets are de-prioritized or dropped, leaving the flow half-dead — not disconnected, but unable to move. Reconnecting gives the client a new source port — a fresh, unflagged 5-tuple — and service returns instantly.

The affected client side was a Guangdong Mobile egress (163.179.x). Different carriers and regions will differ in thresholds and presentation, but the pattern "long-lived UDP 5-tuple → half-dead → new port recovers" generalizes.

## Handling: Reconnect to Recover + Watch Criteria

**Day-to-day (works ~90%)**: reconnect or restart Clash. The essence is a new source port dodging the flagged 5-tuple; recovery is instant.

**When that fails**: go back to the server log to re-confirm the pattern — if `journalctl -u hysteria-server` still cycles `connected → timeout` and port changes don't help, suspect something further upstream (datacenter egress, carrier policy changes) and only then dig into the server side again.

**Long-term mitigation (optional, on recurrence)**: two directions — server-side listening port rotation (no single 5-tuple lives long enough to be flagged), or lowering bandwidth-related declarations so the traffic profile looks less "heavy". Each carries trade-offs; evaluate only if recurrence becomes frequent.

Related: if this happens inside WSL2, first clear the local proxy chain of its own traps (firewall blocking the proxy port) — see [WSL2 Proxy Keeps Dropping? Windows Firewall Is Blocking the Port](/blog/wsl2-proxy-firewall-block). Clear local factors before pinning anything on the path.

<InfoBox variant="warning" title="Watch out">

"Server health checks all pass" does not mean "the network is fine" — health checks cover the host and its adjacent link, while QoS happens in the middle of a cross-border path, invisible to any host-side tool. When the two conclusions conflict (host fully green, user offline), suspect the path first. That is the core diagnostic lesson of this case.

</InfoBox>

## FAQ

### Hysteria authenticates but there is no traffic — how do I triage by layer?

Cut the path into three layers. First, the server log: a `client connected` line means authentication and the port are fine. Second, in-flow errors: `timeout: no recent network activity` means the flow itself is dead. Third, full server health checks (outbound TCP, NIC drops, conntrack, certs, memory, disk) — all green rules out the host and points at the path, most commonly carrier QoS on cross-border UDP.

### What does 'timeout: no recent network activity' mean in Hysteria?

It is the server's per-flow liveness probe: a flow with no valid packets for a while is declared dead and closed. When authentication succeeds but flows starve right after, the typical cause is an intermediate device (carrier QoS) having flagged that UDP 5-tuple and silently dropping its packets — the client still thinks it is connected, but the tunnel is half-dead.

### How do I check if my UDP traffic is being throttled?

Correlate three signals: server-side health is clean (ruling out the host), the flow dies after minutes of sustained transfer rather than instantly (a traffic-shaping signature, not an outage), and reconnecting — which changes the source port — immediately restores service. Together they indicate per-flow rate shaping rather than a connectivity failure.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
