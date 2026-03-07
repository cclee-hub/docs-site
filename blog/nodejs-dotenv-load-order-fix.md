---
title: 修复 Node.js 环境变量读取为 undefined 的问题
description: dotenv 配置正确但 process.env 读取为 undefined？可能是模块加载顺序问题，用 getter 函数延迟读取解决。
date: 2026-03-07
tags: [Node.js, dotenv, Express, Bug修复]
schema: Article
---

## TL;DR

模块顶层 `const URL = process.env.SERVICE_URL` 在 dotenv 加载前就执行了，导致值为 undefined。改用 getter 函数 `const getUrl = () => process.env.SERVICE_URL` 延迟读取。

<!-- truncate -->

## 问题现象

`.env` 文件配置正确，但运行时代码读取到的环境变量是 `undefined`：

```bash
# .env 文件内容
RAG_SERVICE_URL=http://localhost:3003
INTERNAL_API_KEY=secret123
```

```typescript
// routes/api.ts
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3003';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

console.log(RAG_SERVICE_URL);     // 'http://localhost:3003' (走了默认值)
console.log(INTERNAL_API_KEY);    // undefined (没有默认值暴露问题)
```

**更隐蔽的情况**：默认值掩盖了问题，直到生产环境没有默认值时才暴露。

## 根因

Node.js 模块加载顺序问题：

```
1. import routes/api.ts    → 顶层代码执行，读取 process.env（此时 dotenv 未加载）
2. import server.ts        → import dotenv.config()
3. dotenv.config()         → 太晚了，其他模块已经读取过环境变量
```

模块顶层 `const` 声明在 import 时立即执行，此时 `dotenv` 可能还未加载 `.env` 文件。

## 解决方案

### 方法 1：Getter 函数延迟读取（推荐）

```typescript
// ❌ 错误：模块加载时立即读取
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3003';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// ✅ 正确：请求时才读取
const getRagServiceUrl = () => process.env.RAG_SERVICE_URL || 'http://localhost:3003';
const getInternalApiKey = () => process.env.INTERNAL_API_KEY;

// 使用
router.get('/data', async (_req, res) => {
  const response = await fetch(`${getRagServiceUrl()}/data`, {
    headers: { 'X-API-Key': getInternalApiKey()! },
  });
  // ...
});
```

### 方法 2：确保 dotenv 最先加载

在入口文件最顶部加载：

```typescript
// server.ts - 必须是第一个 import
import 'dotenv/config';
// 或
import dotenv from 'dotenv';
dotenv.config();

// 然后才 import 其他模块
import './routes/api';
```

### 方法 3：统一配置模块

```typescript
// config/env.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  ragServiceUrl: process.env.RAG_SERVICE_URL || 'http://localhost:3003',
  internalApiKey: process.env.INTERNAL_API_KEY!,
};

// 其他模块
import { config } from './config/env';
```

## 最佳实践

结合方法 1 和 3：

```typescript
// config/env.ts
export const getRagServiceUrl = () => process.env.RAG_SERVICE_URL || 'http://localhost:3003';
export const getInternalApiKey = () => process.env.INTERNAL_API_KEY;
export const getJwtSecret = () => process.env.JWT_SECRET!;
```

这样即使 dotenv 加载顺序有问题，getter 也能在调用时读取到正确的值。

## FAQ

### Q: 为什么开发环境正常，生产环境才出问题？

A: 生产环境可能通过系统环境变量注入（如 Docker/K8s），不走 `.env` 文件，默认值掩盖了配置缺失。

### Q: dotenv.config() 放在任意位置都行吗？

A: 不行。必须在所有依赖环境变量的模块 import 之前调用。推荐放在入口文件第一行。

### Q: Vite/Next.js 项目需要 dotenv 吗？

A: 不需要。Vite 和 Next.js 内置环境变量支持，`import.meta.env`（Vite）或 `process.env`（Next.js）在构建时注入。dotenv 主要用于纯 Node.js 后端项目。
