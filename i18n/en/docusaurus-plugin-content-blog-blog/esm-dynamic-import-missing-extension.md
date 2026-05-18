---
title: "Node.js ESM Dynamic Import Can't Find Module? Check the File Extension"
description: "Node.js ESM mode doesn't auto-resolve .js extensions in import(). Missing extensions cause ERR_MODULE_NOT_FOUND, appearing as PM2 crash loops for deferred imports"
date: 2026-05-18
tags: [Node.js, ESM, PM2, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Node.js ESM dynamic import says Cannot find module but the file exists?"
    a: "ESM mode doesn't auto-resolve .js extensions. import('./foo') won't find ./foo.js — you must write import('./foo.js')."
  - q: "Why does my PM2 restart count keep climbing?"
    a: "If a deferred dynamic import (e.g., inside a timer) fails after startup, the app crashes and PM2 restarts it — creating a loop. The app appears healthy briefly, then crashes again."
---

Encountered this issue while building a SaaS analytics platform for a client. Here's the root cause and solution.

## TL;DR

In Node.js ESM mode, `import('./path/to/module')` doesn't auto-resolve `./path/to/module.js`. If the TypeScript build output is missing `.js` extensions, the module throws `ERR_MODULE_NOT_FOUND`. When this import is inside deferred logic (timers, conditionals), the app starts fine but crashes later — PM2 shows a climbing restart count.

**Fix**: Ensure all ESM dynamic imports include `.js` extensions, and automate this in the build pipeline.

## Problem

PM2 showed the app restarting continuously:

```
│ name             │ ↺    │ status │ uptime │
│ analytics-api    │ 9    │ online │ 28m    │
```

Error log repeated every few minutes:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/dist/domains/video/cleanup'
  imported from /app/dist/server.js
```

But the file clearly exists:

```
$ ls dist/domains/video/
cleanup.js  executor.js  queue.js
```

## Root Cause

### ESM doesn't auto-resolve file extensions

Node.js CommonJS (`require()`) automatically tries `.js`, `.json`, and other extensions. **ESM (`import`) does not**.

```javascript
// ❌ ESM can't find the module
import('./domains/video/cleanup')
// Node.js looks for: ./domains/video/cleanup (exact path, no extension)
// Actual file:       ./domains/video/cleanup.js

// ✅ Must include .js extension
import('./domains/video/cleanup.js')
```

### Deferred imports hide the problem

The import was inside a deferred execution:

```typescript
// server.ts — doesn't execute immediately on startup
import('./domains/video/cleanup.js').then(({ startCleanupScheduler }) => {
  startCleanupScheduler(); // triggers seconds later
});
```

The app starts successfully (DB connection, port binding all fine). When the timer fires, the import fails → process crashes → PM2 restarts → starts fine again → timer fires again → crashes again. This creates a **crash loop**.

### Why did it work before?

Previous deployment used a build script that included a post-build step to fix import paths. One deployment skipped this step and deployed raw `tsc` output — `tsc` doesn't modify import paths in output files.

## Solution

### 1. Write `.js` extensions in TypeScript source

TypeScript officially recommends writing `.js` extensions even in `.ts` files:

```typescript
// ✅ Write .js even in .ts source files
import('./domains/video/cleanup.js').then(({ startCleanupScheduler }) => {
  startCleanupScheduler();
});
```

### 2. Automated post-build fix (recommended)

Add an import-fixing script to the build pipeline:

```json
{
  "scripts": {
    "build": "tsc && node fix-imports.js"
  }
}
```

Core logic of `fix-imports.js`:

```javascript
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

function fixImports(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, file.name);
    if (file.isDirectory()) {
      fixImports(fullPath);
    } else if (file.name.endsWith('.js')) {
      let content = readFileSync(fullPath, 'utf8');
      // Fix dynamic imports
      const fixed = content.replace(
        /import\(['"](\.[^'"]+)['"]\)/g,
        (match, path) => path.endsWith('.js') ? match : match.replace(path, path + '.js')
      );
      // Fix static imports
      const fixed2 = fixed.replace(
        /from\s+['"](\.[^'"]+)['"]/g,
        (match, path) => path.endsWith('.js') ? match : match.replace(path, path + '.js')
      );
      if (fixed2 !== content) {
        writeFileSync(fullPath, fixed2);
      }
    }
  }
}
```

The build pipeline automatically appends `.js` to all relative import paths, keeping TypeScript source extension-free while preventing module-not-found errors in ESM deployments.

<InfoBox variant="warning" title="Note">

- This only affects Node.js ESM mode (`"type": "module"` or `.mjs` files). CommonJS is unaffected.
- Static imports (`import ... from './foo'`) have the same limitation, not just dynamic `import()`; import hoisting also causes another common issue — [dotenv runs after the import chain, leaving env vars undefined](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order)
- Using `tsx` or `ts-node` in development won't show this error (they auto-resolve extensions), but `node dist/server.js` in production will fail.
- PM2 crash loop signature: restart count (↺) keeps growing, uptime never exceeds a few minutes.

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
