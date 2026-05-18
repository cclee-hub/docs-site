---
title: "JWT 签名静默失败？检查 Node.js 环境变量的加载顺序"
description: "Node.js 中 dotenv.config() 必须在所有 import 之前执行，否则模块级代码读到的 process.env 值是 undefined——用延迟初始化模式彻底解决"
date: 2026-05-18
tags: [Node.js, dotenv, JWT]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 process.env.JWT_SECRET 是 undefined，.env 文件里明明写了？"
    a: "dotenv.config() 在 import 链之后才执行，模块级代码读环境变量时 .env 还没加载。用延迟初始化（lazy init）解决。"
  - q: "把 dotenv.config() 放到文件最顶部就能解决吗？"
    a: "不够。ES Module 的 import 是静态提升的，即使写在后面也会先执行。必须用 lazy init 或在入口文件最顶部（所有 import 之前）调用 dotenv。"
---

在为客户构建 SaaS 认证系统时遇到此问题，记录根因与解法。

## TL;DR

Node.js ES Module 中，`import` 语句在 `dotenv.config()` **之前**执行。如果模块级代码读取 `process.env.JWT_SECRET`，拿到的是 `undefined`，导致 JWT 签名用 `"undefined"` 字符串作为密钥——不报错，但所有 token 校验都失败。解决方案：**延迟初始化**（lazy init）。

## 问题现象

JWT 登录接口返回 200，但后续请求全部 401。排查发现：

1. 登录生成的 token 无法被 `jwtVerify()` 验证
2. 每次重启服务，之前签发的 token 全部失效
3. 打印 `process.env.JWT_SECRET`，结果是 `undefined`

```typescript
// jwt.ts — 模块级代码
import crypto from 'crypto';

// ❌ 这行在 dotenv.config() 之前执行，JWT_SECRET 是 undefined
const SECRET = crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET)
);
```

最坑的是：**不报错**。`new TextEncoder().encode(undefined)` 会把字符串 `"undefined"` 编码成字节，生成一个合法但错误的密钥。

## 根因

ES Module 的 `import` 是**静态提升**的：

```typescript
// server.ts（入口文件）
import { router } from './routes/auth';      // ← 先执行
import { authenticateToken } from './middleware/auth'; // ← 先执行

dotenv.config(); // ← 后执行，但 import 链已经跑完了
```

执行顺序：

1. Node.js 扫描所有 `import`，构建依赖图
2. **深度优先**执行所有被导入模块的顶层代码（`jwt.ts` 的 `const SECRET = ...` 在这里执行）
3. 回到 `server.ts`，执行 `dotenv.config()`
4. 此时 `.env` 才加载到 `process.env`

所以 `jwt.ts` 模块级代码读到的 `process.env.JWT_SECRET` 是 `undefined`。

## 解决方案

### 方案一：延迟初始化（推荐）

把密钥初始化从模块级移到函数内部，首次调用时才读取环境变量：

```typescript
import crypto from 'crypto';

let _secret: crypto.KeyObject | null = null;

function getSecret(): crypto.KeyObject {
  if (!_secret) {
    const secretValue = process.env.JWT_SECRET;
    if (!secretValue) {
      throw new Error('JWT_SECRET 环境变量未设置');
    }
    _secret = crypto.createSecretKey(
      new TextEncoder().encode(secretValue)
    );
  }
  return _secret;
}

// 所有需要密钥的地方改用 getSecret()
export async function generateToken(payload: any): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret()); // ← 延迟到运行时读取
}
```

**优势**：不依赖入口文件的 import 顺序，任何调用时机都安全。

### 方案二：入口文件顶部调用 dotenv

```typescript
// server.ts — 确保这两行在所有 import 之前
import 'dotenv/config'; // 或 require('dotenv').config()
import express from 'express';
// ...其他 import
```

**局限**：如果有其他入口文件（如 cron job、worker）忘记加这行，问题复现。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- 这个坑不只影响 JWT，**所有模块级代码读取环境变量**都有同样风险（数据库连接、API Key 等）；ESM 模块解析还有另一个常见坑——[动态 import 缺少 .js 扩展名](/blog/esm-dynamic-import-missing-extension)会导致生产环境模块找不到
- `require('dotenv').config()` 只在 CommonJS 中能保证顺序；ES Module 中 `import` 始终先于运行时代码
- 延迟初始化模式适用于：密钥、数据库连接池、外部 API 客户端等一次性资源；如果你的 JWT 使用 jose 库且升级了 Node 24，也要注意 [jose KeyObject 格式变化](/blog/nodejs-24-jwt-jose-keyobject)

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
