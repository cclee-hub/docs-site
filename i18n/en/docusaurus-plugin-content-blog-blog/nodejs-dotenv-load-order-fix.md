---
title: Fix Node.js Environment Variables Reading as undefined
description: dotenv configured correctly but process.env returns undefined? Likely a module load order issue. Use getter functions for lazy evaluation.
date: 2026-03-07
tags: [Node.js, dotenv, Express, Bug Fix]
schema: Article
---

## TL;DR

Module-level `const URL = process.env.SERVICE_URL` executes before dotenv loads, resulting in `undefined`. Use getter functions `const getUrl = () => process.env.SERVICE_URL` for lazy evaluation.

<!-- truncate -->

## The Problem

`.env` file is correct, but runtime code reads environment variables as `undefined`:

```bash
# .env file
RAG_SERVICE_URL=http://localhost:3003
INTERNAL_API_KEY=secret123
```

```typescript
// routes/api.ts
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3003';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

console.log(RAG_SERVICE_URL);     // 'http://localhost:3003' (fallback used)
console.log(INTERNAL_API_KEY);    // undefined (no fallback exposes the issue)
```

**Hidden case**: Default values mask the problem until production where no fallback exists.

## Root Cause

Node.js module load order issue:

```
1. import routes/api.ts    → Top-level code runs, reads process.env (dotenv not loaded yet)
2. import server.ts        → import dotenv.config()
3. dotenv.config()         → Too late, other modules already read env vars
```

Module-level `const` declarations execute immediately on import, before `dotenv` has loaded `.env`.

## Solution

### Method 1: Getter Function for Lazy Evaluation (Recommended)

```typescript
// ❌ Wrong: Reads immediately at module load time
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3003';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// ✅ Correct: Reads at request time
const getRagServiceUrl = () => process.env.RAG_SERVICE_URL || 'http://localhost:3003';
const getInternalApiKey = () => process.env.INTERNAL_API_KEY;

// Usage
router.get('/data', async (_req, res) => {
  const response = await fetch(`${getRagServiceUrl()}/data`, {
    headers: { 'X-API-Key': getInternalApiKey()! },
  });
  // ...
});
```

### Method 2: Ensure dotenv Loads First

Load at the very top of your entry file:

```typescript
// server.ts - Must be the first import
import 'dotenv/config';
// Or
import dotenv from 'dotenv';
dotenv.config();

// Then import other modules
import './routes/api';
```

### Method 3: Centralized Config Module

```typescript
// config/env.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  ragServiceUrl: process.env.RAG_SERVICE_URL || 'http://localhost:3003',
  internalApiKey: process.env.INTERNAL_API_KEY!,
};

// Other modules
import { config } from './config/env';
```

## Best Practice

Combine Method 1 and 3:

```typescript
// config/env.ts
export const getRagServiceUrl = () => process.env.RAG_SERVICE_URL || 'http://localhost:3003';
export const getInternalApiKey = () => process.env.INTERNAL_API_KEY;
export const getJwtSecret = () => process.env.JWT_SECRET!;
```

Even if dotenv load order is wrong, getters will read correct values when called.

## FAQ

### Q: Why does it work in dev but fail in production?

A: Production often injects env vars via system (Docker/K8s), not `.env` file. Default fallbacks mask missing config.

### Q: Can I put dotenv.config() anywhere?

A: No. It must run before any module that depends on env vars is imported. Put it at entry file line 1.

### Q: Do Vite/Next.js projects need dotenv?

A: No. Vite and Next.js have built-in env var support - `import.meta.env` (Vite) or `process.env` (Next.js) are injected at build time. dotenv is mainly for pure Node.js backend projects.
