---
title: "Vite 环境变量读不到？变量必须加 VITE_ 前缀才暴露给前端"
description: "Vite 前端 import.meta.env 读出来是 undefined？Vite 只把 VITE_ 前缀变量暴露给客户端，防密钥泄漏。解法：.env 加前缀、env.d.ts 补类型，改完重启 dev server。"
date: 2026-09-28
tags: [Vite, 环境变量, TypeScript, 前端工程化]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Vite 环境变量配置在哪个文件里？"
    a: "项目根目录的 .env 系列：.env 两种场景都加载，.env.development 只在 dev server 生效，.env.production 只在构建时生效。改完任何 .env 文件都必须重启 dev server——Vite 只在启动时加载一次环境变量，热更新不覆盖它们。"
  - q: "为什么 VITE_ 前缀的变量会泄露？不能放密钥吗？"
    a: "不能放密钥。VITE_ 变量在构建时被静态内联进客户端 bundle，任何访问页面的人打开源码就能看到明文。前缀机制的设计目的就是把「允许公开的配置」（接口地址、功能开关）和「必须留在服务端的密钥」分开，密钥走后端环境变量。"
  - q: "import.meta.env 和 process.env 在 Vite 里有什么区别？"
    a: "浏览器端代码只能用 import.meta.env——Vite 会把 VITE_ 前缀变量静态替换进去；process.env 是 Node.js 的 API，只在 Vite 配置文件（vite.config.ts）和 SSR 场景可用，前端代码里写 process.env.XXX 打包后就是 undefined。"
---

在 Vite 项目的 `.env` 里写好了 `API_URL=http://localhost:3005`，前端代码里 `import.meta.env.API_URL` 打印出来却是 undefined，接口请求全部落到错误地址。

> 在为客户构建 AI Agent SaaS 平台时遇到此问题，记录根因与解法。

## TL;DR

**Vite 只把 `VITE_` 前缀的环境变量暴露给客户端代码**，这是防止服务端密钥被打进浏览器 bundle 的安全设计。

```bash
# ❌ 不会暴露给前端
API_URL=http://localhost:3005

# ✅ 暴露给前端
VITE_API_URL=http://localhost:3005
```

代码里对应改为 `import.meta.env.VITE_API_URL`。TypeScript 项目再加一步 `env.d.ts` 类型声明，补全智能提示。

## 问题现象

两个典型表现：

**表现一：变量是 undefined**

```ts
// .env: API_URL=http://localhost:3005
console.log(import.meta.env.API_URL)   // undefined
console.log(import.meta.env)           // 里面有 BASE_URL、MODE、PROD...，就是没有 API_URL
```

`.env` 文件确实被加载了（`MODE`、`PROD` 这些内置变量都在），唯独自己写的变量不见——说明不是加载失败，是**暴露规则**把它拦下了。

**表现二：加了前缀但拼错访问名**

```ts
// .env: VITE_API_URL=...
const url = import.meta.env.VITE_APIURL   // undefined —— 大小写必须完全一致
```

服务端 Node.js 项目里「环境变量读出来是 undefined」另有常见根因（dotenv 加载顺序），前端和后端这两类 undefined 根因不同，别混着排查。

## 根因：Vite 的暴露规则是一道安全边界

Vite 的设计：`.env` 里可能同时存在两类值——前端要用的公开配置（接口地址）和绝不能进浏览器的密钥（数据库连接串、第三方 API key）。如果全部暴露，一次疏忽就把密钥打进了公开的静态产物。

所以 Vite 定了硬规则：**只有 `VITE_` 前缀的变量会出现在 `import.meta.env` 里**，其余变量只在 `vite.config.ts`（Node 侧）通过 `loadEnv` 可见。

暴露的实现方式也值得知道：**构建时静态替换**。Vite 打包时直接把 `import.meta.env.VITE_API_URL` 替换成字符串字面量，运行时根本没有「读环境变量」这个动作。两个推论：

1. 值会明文出现在产物 JS 里——`VITE_` 变量天然是公开的
2. 运行时改环境（改容器 env、改系统变量）不影响已构建的产物——换环境必须重新构建，或把配置改成运行时注入（如 `window.__CONFIG__`）

## 解法：加前缀 + 类型声明

**第一步：`.env` 里的变量加 `VITE_` 前缀。** 命名保持语义，前缀只是暴露标记：

```bash
# .env
VITE_API_URL=http://localhost:3005
```

**第二步：代码统一走 `import.meta.env.VITE_XXX`。** 建议收敛到一个配置模块，别在组件里散着读：

```ts
// src/config.ts
export const API_URL = import.meta.env.VITE_API_URL
```

**第三步（TypeScript 项目）：`src/env.d.ts` 补类型声明**，拿到完整智能提示：

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

开发、生产两套地址用模式文件分开，Vite 按场景自动选：

```bash
.env.development    # dev server 用
.env.production     # npm run build 用
.env                # 两者都加载，放公共配置
```

改完任何 `.env` 文件**必须重启 dev server**——环境变量只在启动时加载一次，热更新不覆盖它们，这是「明明改了却没生效」的第二大来源。

<InfoBox variant="warning" title="注意事项">

`VITE_` 变量等于公开信息：值会被明文内联进客户端 bundle，任何人可见。接口地址、功能开关可以放；数据库连接串、第三方密钥绝不放，密钥只走服务端环境变量。前端需要受保护的配置时，由后端接口下发，而不是塞进 `.env`。

</InfoBox>

## 常见问题

### Vite 环境变量配置在哪个文件里？

项目根目录的 `.env` 系列：`.env` 两种场景都加载，`.env.development` 只在 dev server 生效，`.env.production` 只在构建时生效。改完任何 `.env` 文件都必须重启 dev server——Vite 只在启动时加载一次环境变量，热更新不覆盖它们。

### 为什么 VITE_ 前缀的变量会泄露？不能放密钥吗？

不能放密钥。`VITE_` 变量在构建时被静态内联进客户端 bundle，任何访问页面的人打开源码就能看到明文。前缀机制的设计目的就是把「允许公开的配置」（接口地址、功能开关）和「必须留在服务端的密钥」分开，密钥走后端环境变量。

### import.meta.env 和 process.env 在 Vite 里有什么区别？

浏览器端代码只能用 `import.meta.env`——Vite 会把 `VITE_` 前缀变量静态替换进去；`process.env` 是 Node.js 的 API，只在 Vite 配置文件（vite.config.ts）和 SSR 场景可用，前端代码里写 `process.env.XXX` 打包后就是 undefined。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
