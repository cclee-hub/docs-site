---
title: "Node.js fetch ignores proxy env vars? undici doesn't read http_proxy"
description: "Node.js 22+ built-in fetch is powered by undici, which ignores http_proxy/https_proxy environment variables. Troubleshooting walkthrough and node-fetch workaround."
date: 2026-05-26
tags: [Node.js, WSL2, proxy, undici, node-fetch, networking]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why doesn't Node.js fetch read the http_proxy environment variable?"
    a: "Node.js 22+ built-in fetch is powered by undici, which by design does not read http_proxy/https_proxy environment variables. Use node-fetch or undici's ProxyAgent to configure proxy manually."
  - q: "How to make Node.js fetch work through a proxy?"
    a: "Install node-fetch@3 and https-proxy-agent, then create a fetch instance with proxy support. When no proxy is configured in production, it falls back to direct connection, independent of Node version."
---

In a WSL2 environment with `https_proxy` properly set, Node.js `fetch()` still times out when accessing external URLs.

Encountered this issue while building an AI-powered e-commerce tool for a client. Here's the root cause and solution.

## TL;DR

Node.js 22+ built-in `fetch()` is powered by undici, which **by design does not read `http_proxy`/`https_proxy` environment variables**. Solution: install `node-fetch@3` + `https-proxy-agent`, create a proxy-aware fetch instance. Falls back to direct connection when no proxy is configured in production.

## Problem

WSL2 environment with `https_proxy` correctly set. `curl` works fine:

```bash
echo $https_proxy
# http://172.30.224.1:7897

curl -I https://httpbin.org/ip
# HTTP/1.1 200 OK
```

But Node.js `fetch()` times out:

```js
await fetch('https://httpbin.org/ip');
// FetchError: fetch failed
// cause: TimeoutError: Headers Timeout Error
```

If you're also seeing [WSL2 proxy completely unreachable](/blog/wsl2-proxy-firewall-block) (even `curl` fails), check your firewall settings first.

## Root Cause

Node.js v22+ global `fetch()` is provided by the built-in undici 7.x. undici **intentionally does not read** `http_proxy`/`https_proxy` environment variables — this is by design, not a bug.

Proxy behavior across different HTTP clients:

| Client | Reads env vars | Uses proxy |
|--------|:---:|:---:|
| `curl` | Auto-reads `https_proxy` | ✅ |
| Node.js `http`/`https` modules | Does not read | ❌ |
| `axios` / `node-fetch@3` | Reads `https_proxy` | ✅ |
| Node.js built-in `fetch()` (undici) | Does not read | ❌ |

This causes `fetch()` to time out in environments that require a proxy to access external networks (WSL2, corporate networks).

## Solution

Install `node-fetch@3` and `https-proxy-agent`:

```bash
npm install node-fetch@3 https-proxy-agent
```

Create a proxy-aware fetch instance:

```js
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

export async function fetchWithProxy(url, options = {}) {
  return fetch(url, { ...options, agent });
}
```

Usage is almost identical to the native `fetch()`:

```js
// Before
const res = await fetch('https://httpbin.org/ip');

// After
const res = await fetchWithProxy('https://httpbin.org/ip');
```

### Why node-fetch instead of undici's ProxyAgent?

Node.js v24 ships with undici 7.x, but the npm `undici@8.x` `ProxyAgent` is incompatible with the built-in version:

```js
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// Node v24 error: UND_ERR_INVALID_ARG
// npm undici@8 ProxyAgent is incompatible with built-in undici@7 setGlobalDispatcher
setGlobalDispatcher(new ProxyAgent(proxyUrl));
```

`node-fetch@3` + `https-proxy-agent` is version-agnostic with no compatibility issues. In production without a proxy, `agent` is `undefined` and it connects directly.

<InfoBox variant="warning" title="Caveats">

- Don't try to override global fetch with `setGlobalDispatcher` — changes don't propagate to worker modules under `tsx watch` hot reload
- npm `undici@8.x` `FormData` types are incompatible with the global `FormData`, mixing them causes TypeScript compilation errors
- `node-fetch@3` is ESM-only, use `import` — no `require()` support

</InfoBox>

## FAQ

### Why doesn't Node.js fetch read the http_proxy environment variable?

Node.js 22+ built-in fetch is powered by undici, which by design does not read http_proxy/https_proxy environment variables. Use node-fetch or undici's ProxyAgent to configure proxy manually.

### How to make Node.js fetch work through a proxy?

Install node-fetch@3 and https-proxy-agent, then create a fetch instance with proxy support. When no proxy is configured in production, it falls back to direct connection, independent of Node version.

WSL2 has other networking pitfalls — [Docker Desktop's host mode also makes container ports unreachable from WSL2](/blog/docker-desktop-wsl2-host-network-unreachable). The debugging approach is similar: verify `curl` connectivity first, then check application-level configuration.

Node version upgrades can introduce other issues too — for example, [JWT key format changes in Node 24](/blog/nodejs-24-jwt-jose-keyobject). Worth checking when upgrading.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-3">Need help with Node.js networking issues?</p>
  <a href="https://aidevhub.ai" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">Get in touch</a>
</div>
