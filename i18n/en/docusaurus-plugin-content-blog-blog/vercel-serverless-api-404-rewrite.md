---
title: "Vercel Serverless Function Multi-Level Route 404? Bypass the Catch-All Trap with Rewrites"
description: "Vercel's api/[[...path]].ts catch-all fails on nested paths. Plus esbuild bundling pitfalls for Hono: ESM/CJS format and native dependency handling. Full debugging walkthrough included."
date: 2026-05-20
tags: [Vercel, Serverless, Hono, esbuild, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does Vercel api/[[...path]].ts not match multi-level paths?"
    a: "Vercel's catch-all pattern only matches single-level paths (/api/foo), not nested paths (/api/foo/bar). Use api/index.ts with a vercel.json rewrite rule to forward all /api/* requests explicitly."
  - q: "How to bundle Hono with esbuild for Vercel Serverless?"
    a: "Bundle with esbuild in CJS format (--format=cjs), exclude native dependencies like @libsql/client with --external, and declare them in root package.json so Vercel installs them."
  - q: "How to fix Better Auth client Invalid base URL error?"
    a: "createAuthClient's baseURL does not accept relative paths. Use window.location.origin to build a full URL that works in both local development and production."
---

Encountered these issues while deploying a Hono backend to Vercel Serverless Functions. Three cascading problems: esbuild bundling format errors, native dependency resolution failures, and the most subtle one — catch-all routes silently failing on nested paths.

## TL;DR

1. **esbuild + Hono**: Use `--format=cjs`, exclude native deps with `--external`
2. **Multi-level route 404**: `api/[[...path]].ts` is unreliable. Use `api/index.ts` + vercel.json rewrite instead
3. **Better Auth client**: `baseURL` requires a full URL, use `window.location.origin` to build it

## Issue 1: Vercel's Built-in TS Compilation Fails

`api/[[...path]].ts` directly imports Hono's `app.ts`. Vercel compiles it with built-in TypeScript 5.9.3 (nodenext mode), which throws:

```
Relative import paths need explicit file extensions
Cannot find name 'process'
Module '"@libsql/client"' declares 'Client' locally, but it is not exported
```

The root cause is Vercel's built-in TS compiler enforcing strict nodenext module resolution, which is incompatible with how Hono and Turso client libraries export their types.

**Solution**: Pre-bundle with esbuild and have Vercel execute the compiled output directly.

```bash
esbuild server/src/app.ts \
  --bundle --platform=node --format=cjs \
  --outfile=dist/_server.cjs \
  --external:@libsql/client
```

`api/[[...path]].ts` becomes a one-liner:

```ts
import app from '../../dist/_server.cjs';
export default app;
```

### Why CJS Instead of ESM?

Bundling with `--format=esm` causes dotenv's internal `require("path")` to throw `Dynamic require is not supported`. This is an ESM spec limitation that CJS doesn't have.

If you've also run into module resolution issues with [Node.js ESM dynamic import](/blog/esm-dynamic-import-missing-extension), the root cause is the same — ESM enforces strict module format rules while CJS is more lenient.

### Native Dependency Handling

`@libsql/client` includes native binaries (`@libsql/linux-x64-gnu`). After esbuild bundling, the runtime can't find the module. Solution:

1. Exclude with `--external:@libsql/client`
2. Declare `@libsql/client` as a dependency in root `package.json` so Vercel installs it to `node_modules`

## Issue 2: Nested Routes Intercepted by Vercel

After fixing esbuild bundling, single-level routes like `/api/health` and `/api/tasks` worked fine. But all nested paths (e.g., `/api/auth/sign-in/email`) returned Vercel-level 404:

```
HTTP/2 404
x-vercel-error: NOT_FOUND
content-type: text/plain; charset=utf-8
```

### Debugging Process

By comparing response headers, the breakpoint was clear:

| Path | Reaches Hono? | Key Indicators |
|------|--------------|----------------|
| `/api/health` | ✅ | `x-vercel-cache: MISS`, CORS headers present |
| `/api/gate` | ✅ | CORS headers present |
| `/api/gate/session` | ❌ | `x-vercel-error: NOT_FOUND`, no CORS |

**Single-level paths reach the function, nested paths get intercepted.** The issue is unrelated to path naming (paths without `auth` also 404) and unrelated to Vercel's internal routing rules. The root cause: `api/[[...path]].ts` catch-all pattern **only matches single-level paths**.

### Solution

Drop the catch-all. Use `api/index.ts` + vercel.json rewrite instead:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

Rename `api/[[...path]].ts` to `api/index.ts` (content unchanged). All `/api/*` requests are forwarded to `/api/index` by the rewrite rule, and Hono handles internal routing.

Post-deploy verification:

```bash
curl -sI https://example.com/api/gate/session
# HTTP/2 404
# access-control-allow-credentials: true  ← Reaches Hono
# x-vercel-cache: MISS                     ← No longer a Vercel-level 404
```

All three paths `/api/gate`, `/api/gate/`, `/api/gate/session` now reach Hono. POST requests also work:

```bash
curl -X POST https://example.com/api/gate/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'
# {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
```

Auth routes are fully functional.

<InfoBox variant="warning" title="Important Notes">

- Rewrite rule order matters — `/api/(.*)` must come before the SPA fallback
- After deployment, browsers may cache old JS files. If the frontend still requests old paths, use Ctrl+Shift+R to force refresh
- If you're also troubleshooting stale deployments, check out [Debugging Frontend Deploy Not Updating](/blog/frontend-deploy-build-outdated)

</InfoBox>

## Issue 3: Better Auth Client baseURL Error

With routes working, the frontend threw:

```
BetterAuthError: Invalid base URL: /api/gate
Caused by: TypeError: Failed to construct 'URL': Invalid URL
```

Better Auth client internally uses `new URL()` to parse baseURL, which fails with relative paths.

**Solution**: Use `window.location.origin` to build a full URL:

```ts
export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/gate`,
})
```

Locally this expands to `http://localhost:5173/api/gate` (Vite proxy forwards it), and in production to `https://your-domain.com/api/gate` — no environment variables needed.

## Complete Configuration Reference

The three key files in their final working state:

**vercel.json**
```json
{
  "buildCommand": "pnpm run check && pnpm exec esbuild server/src/app.ts --bundle --platform=node --format=cjs --outfile=dist/_server.cjs --external:@libsql/client && pnpm -F client run build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

**api/index.ts**
```ts
import app from '../dist/_server.cjs';
export default app;
```

**client/src/lib/auth-client.ts**
```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/gate`,
});
```

## FAQ

### Why does Vercel api/[[...path]].ts not match multi-level paths?

Vercel's catch-all pattern only matches single-level paths (`/api/foo`), not nested paths (`/api/foo/bar`). Use `api/index.ts` with a vercel.json rewrite rule to forward all `/api/*` requests explicitly.

### How to bundle Hono with esbuild for Vercel Serverless?

Bundle with esbuild in CJS format (`--format=cjs`), exclude native dependencies like `@libsql/client` with `--external`, and declare them in root `package.json` so Vercel installs them.

### How to fix Better Auth client Invalid base URL error?

`createAuthClient`'s `baseURL` does not accept relative paths. Use `window.location.origin` to build a full URL that works in both local development and production.

---

Running into similar Vercel deployment issues? [Get in touch](https://ccleeai.com/contact) and let's talk about your tech stack.

<a className="button button--primary button--lg" href="https://ccleeai.com/contact" target="_blank" rel="noopener noreferrer">Get in Touch</a>
