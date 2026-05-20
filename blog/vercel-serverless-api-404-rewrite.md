---
title: "Vercel Serverless Function 多级路由 404？用 rewrite 绕过 catch-all 陷阱"
description: "Vercel 的 api/[[...path]].ts catch-all 路由无法匹配多级路径，esbuild 打包 Hono 部署时还会踩 ESM/CJS 和原生依赖的坑。完整排查过程和解决方案"
date: 2026-05-20
tags: [Vercel, Serverless, Hono, esbuild, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 Vercel api/[[...path]].ts 匹配不到多级路径？"
    a: "Vercel 的 catch-all pattern 只能匹配单级路径（/api/foo），无法匹配多级（/api/foo/bar）。需要改用 api/index.ts + vercel.json rewrite 规则显式转发所有 /api/* 请求。"
  - q: "Vercel Serverless Function 如何打包 Hono + esbuild？"
    a: "用 esbuild 打包为 CJS 格式（--format=cjs），原生依赖如 @libsql/client 用 --external 排除，并在根 package.json 声明为 dependency 让 Vercel 安装。"
  - q: "Better Auth 客户端报 Invalid base URL 怎么办？"
    a: "createAuthClient 的 baseURL 不支持相对路径，必须传完整 URL。用 window.location.origin 拼接可同时兼容本地开发和线上环境。"
---

在将 Hono 后端部署到 Vercel Serverless Function 时，遇到三个层层递进的问题：esbuild 打包格式报错、原生依赖无法打包、以及最隐蔽的 catch-all 路由无法匹配多级路径。记录完整排查过程和最终方案。

## TL;DR

1. **esbuild 打包 Hono**：用 `--format=cjs` 输出，原生依赖 `--external` 排除
2. **多级路由 404**：`api/[[...path]].ts` 不可靠，改用 `api/index.ts` + vercel.json rewrite
3. **Better Auth 客户端**：`baseURL` 必须完整 URL，用 `window.location.origin` 拼接

## 问题一：Vercel 内置 TS 编译失败

`api/[[...path]].ts` 直接 import Hono 的 `app.ts`，Vercel 用内置 TypeScript 5.9.3（nodenext 模式）编译，报出一串错误：

```
Relative import paths need explicit file extensions
Cannot find name 'process'
Module '"@libsql/client"' declares 'Client' locally, but it is not exported
```

根因是 Vercel 的内置 TS 编译器对 nodenext 模块解析要求严格，而 Hono + Turso 客户端库的导出方式不兼容。

**解决方案**：用 esbuild 预打包，让 Vercel 直接执行编译产物。

```bash
esbuild server/src/app.ts \
  --bundle --platform=node --format=cjs \
  --outfile=dist/_server.cjs \
  --external:@libsql/client
```

`api/[[...path]].ts` 只需一行引用打包产物：

```ts
import app from '../../dist/_server.cjs';
export default app;
```

### 为什么用 CJS 而不是 ESM？

`--format=esm` 全量打包时，dotenv 内部 `require("path")` 报 `Dynamic require is not supported`。这是 ESM 规范限制，CJS 没有这个问题。

如果你在 [Node.js ESM 动态 import](/blog/esm-dynamic-import-missing-extension) 中也遇到过模块解析问题，根因是一样的——ESM 对模块格式要求严格，CJS 更宽容。

### 原生依赖处理

`@libsql/client` 包含原生二进制（`@libsql/linux-x64-gnu`），esbuild 打包后运行时找不到模块。解决方案：

1. `--external:@libsql/client` 排除打包
2. 根 `package.json` 声明 `@libsql/client` 为 dependency，让 Vercel 安装到 `node_modules`

## 问题二：多级路由被 Vercel 拦截

esbuild 打包解决后，一级路由 `/api/health`、`/api/tasks` 全部正常。但所有多级路径（如 `/api/auth/sign-in/email`）返回 Vercel 层 404：

```
HTTP/2 404
x-vercel-error: NOT_FOUND
content-type: text/plain; charset=utf-8
```

### 排查过程

通过对比 response headers 定位断裂点：

| 路径 | 到达 Hono? | 关键特征 |
|------|-----------|---------|
| `/api/health` | ✅ | `x-vercel-cache: MISS`、有 CORS header |
| `/api/gate` | ✅ | 有 CORS header |
| `/api/gate/session` | ❌ | `x-vercel-error: NOT_FOUND`、无 CORS |

**一级路径到达函数，二级路径被拦截。** 与路径名无关（不含 `auth` 的路径也 404），与 Vercel 内部路由规则无关。根因是 `api/[[...path]].ts` 的 catch-all pattern **只能匹配单级路径**。

### 解决方案

放弃 catch-all，改用 `api/index.ts` + vercel.json rewrite：

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

`api/[[...path]].ts` 重命名为 `api/index.ts`（内容不变）。所有 `/api/*` 请求由 rewrite 统一转发到 `/api/index` 函数，Hono 内部自行路由。

部署后验证：

```bash
curl -sI https://example.com/api/gate/session
# HTTP/2 404
# access-control-allow-credentials: true  ← 到达 Hono
# x-vercel-cache: MISS                     ← 不再是 Vercel 层 404
```

三条路径 `/api/gate`、`/api/gate/`、`/api/gate/session` 全部到达 Hono。POST 请求也正常：

```bash
curl -X POST https://example.com/api/gate/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'
# {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
```

Auth 路由完全打通。

<InfoBox variant="warning" title="注意事项">

- rewrite 规则顺序很重要，`/api/(.*)` 必须在 SPA fallback 之前
- 部署后浏览器可能缓存旧的 JS 文件，如果前端仍请求旧路径，用 Ctrl+Shift+R 强制刷新
- 如果你也在排查部署后线上未更新的问题，可以参考 [排查前端部署后线上未更新的问题](/blog/frontend-deploy-build-outdated)

</InfoBox>

## 问题三：Better Auth 客户端 baseURL 错误

路由打通后，前端页面报错：

```
BetterAuthError: Invalid base URL: /api/gate
Caused by: TypeError: Failed to construct 'URL': Invalid URL
```

Better Auth 客户端内部用 `new URL()` 解析 baseURL，相对路径无法直接构造 URL。

**解决方案**：用 `window.location.origin` 拼接完整 URL：

```ts
export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/gate`,
})
```

本地开发展开为 `http://localhost:5173/api/gate`（Vite proxy 转发），线上展开为 `https://your-domain.com/api/gate`，无需环境变量。

## 完整配置参考

最终生效的三个关键文件：

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

## 常见问题

### 为什么 Vercel api/[[...path]].ts 匹配不到多级路径？

Vercel 的 catch-all pattern 只能匹配单级路径（`/api/foo`），无法匹配多级（`/api/foo/bar`）。需要改用 `api/index.ts` + vercel.json rewrite 规则显式转发所有 `/api/*` 请求。

### Vercel Serverless Function 如何打包 Hono + esbuild？

用 esbuild 打包为 CJS 格式（`--format=cjs`），原生依赖如 `@libsql/client` 用 `--external` 排除，并在根 `package.json` 声明为 dependency 让 Vercel 安装。

### Better Auth 客户端报 Invalid base URL 怎么办？

`createAuthClient` 的 `baseURL` 不支持相对路径，必须传完整 URL。用 `window.location.origin` 拼接可同时兼容本地开发和线上环境。

---

遇到类似的 Vercel 部署问题？[联系我](https://ccleeai.com/contact)聊聊你的技术栈，看看能不能帮你少踩几个坑。

<a className="button button--primary button--lg" href="https://ccleeai.com/contact" target="_blank" rel="noopener noreferrer">联系合作</a>
