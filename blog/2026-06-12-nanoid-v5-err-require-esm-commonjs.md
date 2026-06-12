---
title: "Node.js require nanoid 报 ERR_REQUIRE_ESM？v5 改纯 ESM 的替代方案"
description: "Node.js CommonJS 项目 require('nanoid') 抛 ERR_REQUIRE_ESM，因 nanoid v5 仅支持 ESM。用 crypto.randomUUID() 等原生方案替代，零依赖兼容 CJS。"
date: 2026-06-12
tags: [Node.js, nanoid, CommonJS, ESM, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 Node.js 中 require('nanoid') 报 ERR_REQUIRE_ESM？"
    a: "nanoid 从 v5 起改为纯 ESM 包，CommonJS 的 require 无法加载 ESM 模块，直接抛 ERR_REQUIRE_ESM。需改用动态 import 或换原生方案。"
  - q: "nanoid v5 还能在 CommonJS 项目里使用吗？"
    a: "可以，但必须用 await import('nanoid') 异步加载，或锁定 v3.x（仍兼容 CJS）。若只需唯一 ID，直接用 crypto.randomUUID() 更省事。"
---

在 CommonJS 项目里 `require('nanoid')` 生成唯一 ID，进程一启动就抛 `ERR_REQUIRE_ESM` 直接退出。

在为客户开发 [电商数据采集工具](/docs/browser-plugin) 时遇到此问题——浏览器端实时抓取商品图片、SKU、价格与评价数据，清洗后导出结构化文件，服务端需要为每条请求生成稳定的 traceId 做跨服务日志关联。

## TL;DR

`nanoid` 从 v5 起改为**纯 ESM 包**，CommonJS 的 `require()` 无法加载它，必然抛 `ERR_REQUIRE_ESM`。如果你的项目还是 CJS，最省事的替代是 Node 内置的 `crypto.randomUUID()`——零依赖、CJS/ESM 通吃、生成的就是标准 UUID。

## 问题现象

CJS 项目里一行最普通的引入：

```js
// server.js（CommonJS）
const { nanoid } = require('nanoid');

const traceId = nanoid();
```

启动即崩，堆栈指向 nanoid 的入口文件：

```bash
node server.js

internal/modules/cjs/loader.js:905
Error [ERR_REQUIRE_ESM]: require() of ES Module
/node_modules/nanoid/index.js from server.js not supported.

Instead change the require of index.js in server.js to a CommonJS module,
or use a dynamic import() call.
```

注意它不是「偶尔报错」或「某些环境下报错」，而是**确定性崩溃**——只要进了 v5，CJS 这条路就走不通。

## 根因

`nanoid` 在 v5 完成了 ESM-only 迁移：包的 `package.json` 不再带 CommonJS 入口，只导出 ESM。Node 的 CommonJS 加载器 `require()` 是同步的，**无法同步加载一个 ESM 模块**，于是直接抛 `ERR_REQUIRE_ESM`。

这不是 nanoid 的 bug，而是整个生态的模块格式演进：越来越多的包选择只发 ESM（`got` v12+、`node-fetch` v3、`uuid` v7+ 等都一样）。只要你的宿主项目是 CommonJS，遇到这类包就会撞同一堵墙。

如果你还撞过动态 `import()` 找不到模块，本质也是 ESM 解析规则的问题，可以看 [Node.js ESM 动态 import 报模块找不到？检查文件扩展名](/blog/esm-dynamic-import-missing-extension)。

## 解决方案

按「改造代价从低到高」给三个方案，按需选。

### 方案 1（推荐）：用 `crypto.randomUUID()`

生成唯一 ID 的场景下，`nanoid` 的核心价值就是「短且唯一」。但只要这个 ID 不需要拼进 URL、不需要极致缩短，标准 UUID 完全够用，而且 Node 14.17+ 内置、零依赖：

```js
// CommonJS 与 ESM 都能直接用
const { randomUUID } = require('node:crypto');

const traceId = randomUUID();
// => '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
```

这一步同时解决了三个问题：

- **依赖归零**：不再引入第三方包，也就不再被它的模块格式绑架；
- **格式对齐**：UUID 是跨语言、跨服务的通用格式，做日志关联、数据库主键都顺手；
- **CJS/ESM 通吃**：`node:crypto` 是 Node 内置模块，两种模块系统下行为一致。

唯一要权衡的是长度——UUID 36 字符，比 `nanoid()` 默认的 21 字符长。对 traceId、主键这类场景，长度几乎不构成成本；如果是要拼进短链，才需要继续往下看。

### 方案 2：锁定 nanoid v3

`nanoid` 的 v3.x 是最后一个兼容 CommonJS 的大版本，`require` 直接可用：

```json
// package.json —— 显式钉死 v3
{
  "dependencies": {
    "nanoid": "^3.3.7"
  }
}
```

```js
const { nanoid } = require('nanoid');
const id = nanoid(); // 21 字符短 ID
```

适合「就是想要短 ID、又暂时无法把项目迁到 ESM」的情况。代价是停留在旧版，拿不到 v5 的后续更新。

### 方案 3：异步动态 import

如果你必须用 v5，只能走 ESM 的异步加载：

```js
// CommonJS 里用动态 import() 加载 ESM 包
async function makeId() {
  const { nanoid } = await import('nanoid');
  return nanoid();
}

// 调用处本身得是 async
const id = await makeId();
```

能用，但 `nanoid` 是同步生成 ID 的工具，被迫包一层 `async/await` 会把调用链一路传染成异步，通常不值得。

<InfoBox variant="warning" title="注意事项">

- 同一个坑不只 nanoid 一个：`uuid` v7+、`node-fetch` v3、`got` v12+ 都是 ESM-only，CJS 项目里 `require` 它们会报一模一样的 `ERR_REQUIRE_ESM`。判断方法是看目标包的 `package.json` 有没有 `"type": "module"` 或是否只导出 `"import"` 入口。
- `crypto.randomUUID()` 需要 **Node 14.17+**；如果你的运行时更老，可以用 `crypto.randomBytes(16).toString('hex')` 自行拼装。
- 别用 `require('nanoid')` 的同时又在 ESM 项目里 `import nanoid`——混用会让依赖树里同时存在新旧两份，行为更难预测。

</InfoBox>

## 常见问题

### 为什么 Node.js 中 require('nanoid') 报 ERR_REQUIRE_ESM？

因为 `nanoid` 从 v5 起只发布 ESM 产物，而 Node 的 CommonJS `require()` 是同步加载，无法加载 ESM 模块，加载到 nanoid 入口时直接抛 `ERR_REQUIRE_ESM`。这是 CJS/ESM 模块系统的硬性边界，不是配置问题。

### nanoid v5 还能在 CommonJS 项目里使用吗？

可以，但要么用 `await import('nanoid')` 异步加载（注意整条调用链会变 async），要么把版本锁定在仍兼容 CJS 的 v3.x。如果只是要一个唯一 ID，直接用 Node 内置的 `crypto.randomUUID()` 最省事，零依赖且两种模块系统都支持。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
