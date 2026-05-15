---
title: Vite Path Alias Configuration - Why You Need Two Configs
description: Vite + TypeScript path alias (@) requires configuration in both vite.config.ts and tsconfig.json. One won't work without the other.
date: 2026-03-15
tags: [Vite, TypeScript, Frontend, aigent]
schema: Article
---

## TL;DR

Vite path aliases require **simultaneous configuration** in both `vite.config.ts` and `tsconfig.json`—neither works alone. Vite handles bundler resolution, TypeScript handles type checking and IDE intellisense.


<!-- truncate -->
## Problem Symptoms

### Only Configured vite.config.ts

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

Build runs fine, but IDE shows errors:

```bash
Cannot find module '@/components/Button' or its corresponding type declarations.
```

### Only Configured tsconfig.json

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

IDE is happy, but Vite build fails:

```bash
[vite] Internal server error: Failed to resolve import "@/services/api"
```

## Root Cause

### Two Configs, Two Responsibilities

| Config File | Owner | Purpose |
|-------------|-------|---------|
| `vite.config.ts` | Vite/esbuild | Path resolution during build |
| `tsconfig.json` | TypeScript | Type checking, IDE intellisense |

Configuring only one:
- Vite can build, but IDE shows red lines everywhere, no go-to-definition
- IDE works, but `vite dev` / `vite build` can't find modules

## Solution

### Complete Configuration (Both Required)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

### Verify Configuration Works

```typescript
// src/services/api.ts
export const api = { ... }

// src/App.tsx - Should have go-to-definition, intellisense, and build correctly
import { api } from '@/services/api'
```

### Multiple Aliases Example

```typescript
// vite.config.ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@components': path.resolve(__dirname, './src/components'),
    '@hooks': path.resolve(__dirname, './src/hooks'),
  }
}

// tsconfig.json
"paths": {
  "@/*": ["src/*"],
  "@components/*": ["src/components/*"],
  "@hooks/*": ["src/hooks/*"]
}
```

## FAQ

### Q: Why does Vite path alias need two configurations?

A: Vite (based on esbuild/rollup) and TypeScript are independent tools. Vite handles module resolution during bundling, TypeScript handles compile-time type checking and IDE support. They don't share configuration.

### Q: Still getting errors after configuration?

A: Restart IDE and Vite dev server. VSCode: `Cmd+Shift+P` → "TypeScript: Restart TS Server", Terminal: `Ctrl+C` to restart `npm run dev`.

### Q: path.resolve __dirname error?

A: Make sure to import for ES Module: `import path from 'path'`, or add `"type": "module"` in package.json. Or use `import.meta.url` instead of `__dirname`.
