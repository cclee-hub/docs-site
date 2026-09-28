---
title: "Vite Proxy Works in Dev but 404 in Production? Add Nginx"
description: "server.proxy lives only in the dev server. Built Vite apps are static files — route /api through an Nginx location with proxy_pass instead."
date: 2026-09-28
tags: [Vite, Nginx, Reverse Proxy, Deployment]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Does Vite proxy work in production?"
    a: "No. server.proxy is a runtime middleware of the dev server — when you run npm run dev. A production build produces plain static files served by Nginx (or any web server), with no Vite process and no proxy layer. The production equivalent is an Nginx location block with proxy_pass, which typically adds 2 proxy_set_header lines and a reload."
  - q: "Why is the Vite proxy not working after build?"
    a: "Because the proxy config never ships with the build. After deploying, /api requests hit Nginx directly; with no /api location rule they either 404 or get caught by the SPA fallback (try_files ... /index.html), returning HTML with a 200 status that breaks JSON parsing on the frontend. Add an /api proxy location and reload Nginx."
  - q: "How do I route API requests through Nginx for a Vite app?"
    a: "Inside the server block add: location /api { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; } — then nginx -t and nginx -s reload. Verify with curl -i https://example.com/api/health: a JSON content type means the proxy is live, text/html means the SPA fallback is still catching it."
---

A Vite project works perfectly in local development. After `npm run build` and deploying to the server, pages load fine, but every `/api` request returns 404 — or something sneakier: the response is `index.html`, and the frontend crashes parsing HTML as JSON.

> Encountered this while building an AI Agent SaaS platform for a client with a separated frontend/backend deployment — recording the root cause and the fix.

## TL;DR

**`server.proxy` in `vite.config.ts` belongs to the dev server only.** `npm run build` produces plain static files with no proxy layer at all; in production, Nginx must take over `/api`:

```nginx
location /api {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Placed outside the reach of the SPA fallback (`try_files ... /index.html`), validated with `nginx -t`, applied with `nginx -s reload`.

## Symptoms

Two presentations, one root cause:

**Presentation 1: plain 404**

```
GET https://example.com/api/agents  → 404 Not Found
```

**Presentation 2: index.html comes back (sneakier)**

```
GET /api/agents  → 200 OK, but the body is <!DOCTYPE html>...
Frontend fails with: Unexpected token '<' in JSON
```

The second one is the SPA fallback catching the request: Nginx finds no static file at `/api/agents`, and `try_files $uri /index.html` bounces it to the frontend entry page. The status code is even a green 200 — it only blows up when the frontend parses the body, which makes it look like "the request succeeded".

## Root Cause: proxy Is a Dev-Server Runtime Feature

This block in `vite.config.ts`:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
})
```

works in exactly one context: **the dev server started by `npm run dev`**. That dev server is a Node process, and `server.proxy` is forwarding middleware inside it — the browser requests `localhost:5173/api/agents`, the dev server passes it to `127.0.0.1:3000`, and brings the response back.

After `npm run build`, the output is a pile of static files in `dist/`, and the browser fetches them straight from Nginx — **there is no Vite process anywhere in that chain, and the `server.proxy` config stays behind in vite.config.ts; it never ships with the build**.

So in production the request path is: browser → Nginx → ?. Nginx matches locations; with no `/api` rule, no static file exists at `/api/agents`, so it either 404s or falls through to `index.html` via the SPA fallback — the two presentations, explained.

## The Fix: Let Nginx Own the Production Proxy

**Step 1: add a proxying location to the server block.**

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/app/dist;

    # API proxy: prefix match, wins over the SPA fallback
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback: everything else goes to the frontend entry
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Two points:

- `proxy_pass` points at the real backend address and port (swap the example's 3000 for yours); `/api`-prefixed requests are forwarded as-is, so backend routes must carry the `/api` prefix
- Nginx prefix locations match by longest prefix, so `/api` naturally beats `/` — no ordering tricks needed; just make sure your longest API common prefix is covered

**Step 2: verify, then serve traffic.**

```bash
nginx -t          # syntax check
nginx -s reload   # graceful reload

# Smoke test: should return backend data, not HTML
curl -i https://example.com/api/health
```

JSON with `Content-Type: application/json` means the proxy is live; `text/html` means the fallback is still catching requests.

A side benefit: once both apps share a domain through the reverse proxy, **the CORS problem you dodged in dev with Vite proxy disappears in production too** — no CORS headers to configure.

This post and [Frontend Deploy Looks Outdated? Nginx Cache and Build Output Checks](/blog/frontend-deploy-build-outdated) are companion reads: that one covers "the deployed code is stale", this one covers "the API has no proxy layer in production". Check both and deployment-related 404s are pretty much exhausted.

<InfoBox variant="warning" title="Watch out">

The location path must match the backend route prefix exactly. If backend routes live at `/api/agents` but Nginx proxies `/apis`, or `proxy_pass` ends with a stray `/` (which triggers path rewriting — `/api/agents` arrives at the backend as `/agents`), you get a fresh new 404. After any change, `curl -i` one real endpoint and check the response headers before sending traffic.

</InfoBox>

## FAQ

### Does Vite proxy work in production?

No. `server.proxy` is a runtime middleware of the dev server — it exists when you run `npm run dev`. A production build produces plain static files served by Nginx (or any web server), with no Vite process and no proxy layer. The production equivalent is an Nginx location block with `proxy_pass`, which typically adds 2 proxy_set_header lines and a reload.

### Why is the Vite proxy not working after build?

Because the proxy config never ships with the build. After deploying, `/api` requests hit Nginx directly; with no `/api` location rule they either 404 or get caught by the SPA fallback (`try_files ... /index.html`), returning HTML with a 200 status that breaks JSON parsing on the frontend. Add an `/api` proxy location and reload Nginx.

### How do I route API requests through Nginx for a Vite app?

Inside the server block add: `location /api { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }` — then `nginx -t` and `nginx -s reload`. Verify with `curl -i https://example.com/api/health`: a JSON content type means the proxy is live, `text/html` means the SPA fallback is still catching it.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
