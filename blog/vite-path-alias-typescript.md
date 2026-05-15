---
title: Vite 路径别名配置：改了两处才生效
description: Vite + TypeScript 项目配置 @ 路径别名，只配 vite.config.ts 或 tsconfig.json 都不生效，必须双重配置。
date: 2026-03-15
tags: [Vite, TypeScript, 前端工程化, aigent, frontend]
authors: [cclee]
schema: Article
---

## TL;DR

Vite 路径别名需要**同时配置** `vite.config.ts` 和 `tsconfig.json`，缺一不可：Vite 负责打包时解析，TypeScript 负责类型检查和 IDE 提示。


<!-- truncate -->
## 问题现象

### 只配了 vite.config.ts

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

打包运行正常，但 IDE 报错：

```bash
Cannot find module '@/components/Button' or its corresponding type declarations.
```

### 只配了 tsconfig.json

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

IDE 不报错了，但 Vite 构建时报错：

```bash
[vite] Internal server error: Failed to resolve import "@/services/api"
```

## 根因

### 两套配置，两个职责

| 配置文件 | 负责方 | 作用 |
|---------|--------|------|
| `vite.config.ts` | Vite/esbuild | 构建时解析路径 |
| `tsconfig.json` | TypeScript | 类型检查、IDE 智能提示 |

只配置一处：
- Vite 能打包，但 IDE 满屏红线，无法跳转
- IDE 正常，但 `vite dev` / `vite build` 找不到模块

## 解决方案

### 完整配置（两处都要）

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

### 验证配置生效

```typescript
// src/services/api.ts
export const api = { ... }

// src/App.tsx - 应该能跳转、有提示、构建正常
import { api } from '@/services/api'
```

### 多个别名示例

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

### Q: 为什么 Vite 路径别名要配两次？

A: Vite（基于 esbuild/rollup）和 TypeScript 是独立工具。Vite 负责打包时的模块解析，TypeScript 负责编译时类型检查和 IDE 支持。两者不共享配置。

### Q: 配置后还是报错怎么办？

A: 重启 IDE 和 Vite dev server。VSCode 按 `Cmd+Shift+P` → "TypeScript: Restart TS Server"，终端 `Ctrl+C` 重启 `npm run dev`。

### Q: path.resolve 的 __dirname 报错？

A: 确保是 ES Module 时导入：`import path from 'path'`，或在 package.json 加 `"type": "module"`。或用 `import.meta.url` 替代 `__dirname`。
