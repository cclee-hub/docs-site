---
title: "JWT_SECRET 是 undefined？Node.js import 链执行顺序导致环境变量未加载"
description: "Node.js import 链先于 dotenv.config() 执行，导致 jwt.ts 模块级 SECRET 用 undefined 加密。延迟初始化修复"
date: 2026-05-24
tags: [nodejs, jwt, dotenv, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 Node.js 中 process.env.JWT_SECRET 是 undefined？"
    a: "ES Module 的 import 是静态分析并在代码执行前完成的。如果 jwt.ts 在模块顶层读取 process.env.JWT_SECRET，而 dotenv.config() 在 server.ts 中调用，由于 import 链会先加载 jwt.ts，此时 .env 还没被解析，SECRET 自然是 undefined。"
  - q: "Node.js dotenv.config() 和 import 的执行顺序是什么？"
    a: "所有 import 语句先按依赖拓扑排序依次加载并执行模块顶层代码，然后再执行当前文件的剩余代码。所以 dotenv.config() 必须在所有依赖它的 import 之前，或者用延迟初始化避免模块级读取。"
  - q: "如何修复 JWT secret 在模块加载时为 undefined 的问题？"
    a: "将 SECRET 从模块级常量改为延迟初始化函数：第一次调用时才读取 process.env 并创建 KeyObject。这样 dotenv.config() 可以在任意位置调用，只要在实际使用 JWT 之前即可。"
---

在为客户构建 Node.js 后端时，登录接口返回 401，排查发现 JWT token 全部验证失败。日志显示 `JWT_SECRET` 的值是字符串 `"undefined"` 而非真正的密钥。记录根因与解法。

<!-- truncate -->

## TL;DR

`jwt.ts` 在模块顶层用 `const SECRET = crypto.createSecretKey(process.env.JWT_SECRET)` 初始化密钥。由于 `import` 链（`server.ts` → `routes` → `middleware/auth` → `jwt`）的加载顺序，`jwt.ts` 的模块级代码在 `server.ts` 中的 `dotenv.config()` 之前执行，`process.env.JWT_SECRET` 此时还是 `undefined`。

## 问题现象

```typescript
// server.ts
import dotenv from 'dotenv';
import { router } from './routes';  // import 链最终会加载 jwt.ts

dotenv.config();  // 加载 .env → 但 jwt.ts 已经执行完了

// jwt.ts — 模块顶层
const SECRET = crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET)
);
// SECRET = createSecretKey("undefined") ← 此刻 .env 还没加载！
```

所有通过这个 SECRET 签发的 token 都用了 `"undefined"` 字符串作为密钥。服务器重启后如果 .env 加载顺序变了，之前签发的 token 全部失效。

## 根因

Node.js ES Module 的执行顺序：

1. **import 是静态的**：引擎在执行任何代码之前，先解析所有 `import` 语句，按依赖拓扑排序构建模块图
2. **模块级代码立即执行**：每个模块被加载时，顶层的 `const`、`let`、函数声明等立即执行
3. **再执行当前文件**：所有依赖模块加载完毕后，才执行当前文件（`server.ts`）的剩余代码

实际执行顺序：

```
server.ts 的 import 解析开始
  → 加载 routes/index.ts
    → 加载 middleware/auth.ts
      → 加载 domains/auth/jwt.ts
        → 执行 const SECRET = createSecretKey(process.env.JWT_SECRET)
        → 此时 .env 未加载，JWT_SECRET = undefined
      → 返回 auth middleware
    → 返回 routes
  → 所有 import 完成
→ 执行 dotenv.config()  ← 太晚了
→ 执行 app.listen(...)
```

如果你也遇到过 Node.js 中环境变量加载顺序的问题，可以参考 [Node.js dotenv 加载顺序导致环境变量 undefined 的修复](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order)。

## 解决方案

**延迟初始化**——将 SECRET 从模块级常量改为懒加载函数：

```typescript
// jwt.ts — 修复后
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

// 使用时调用 getSecret()，而非直接用 SECRET
export async function generateToken(payload: object): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret());  // 第一次调用时才读取 env
}
```

**为什么有效**：`getSecret()` 在函数调用时才读取 `process.env`，此时 `dotenv.config()` 已经执行完毕，环境变量已正确加载。

<InfoBox variant="warning" title="注意事项">

这个问题不仅限于 JWT，任何在模块顶层读取 `process.env` 的代码都有同样的风险，包括数据库连接字符串、API Key、第三方 SDK 初始化等。原则是：**模块级代码不要依赖环境变量，要么延迟初始化，要么确保 dotenv.config() 在所有 import 之前**。

方案一（延迟初始化）更稳妥，因为你无法控制未来新增的 import 是否间接依赖环境变量。方案二（提前 dotenv）需要把 `dotenv.config()` 放在文件最顶部且不被任何 import 打断。

</InfoBox>

## 常见问题

### 为什么 Node.js 中 process.env.JWT_SECRET 是 undefined？

ES Module 的 import 是静态分析并在代码执行前完成的。如果 `jwt.ts` 在模块顶层读取 `process.env.JWT_SECRET`，而 `dotenv.config()` 在 `server.ts` 中调用，由于 import 链会先加载 `jwt.ts`，此时 .env 还没被解析，SECRET 自然是 undefined。

### Node.js dotenv.config() 和 import 的执行顺序是什么？

所有 import 语句先按依赖拓扑排序依次加载并执行模块顶层代码，然后再执行当前文件的剩余代码。所以 `dotenv.config()` 必须在所有依赖它的 import 之前，或者用延迟初始化避免模块级读取。

### 如何修复 JWT secret 在模块加载时为 undefined 的问题？

将 SECRET 从模块级常量改为延迟初始化函数：第一次调用时才读取 `process.env` 并创建 KeyObject。这样 `dotenv.config()` 可以在任意位置调用，只要在实际使用 JWT 之前即可。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-3">在构建 Node.js 后端服务？</p>
  <a href="https://ai.ccleeai.com" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">了解 CCLHub AI 数据分析平台</a>
</div>
