---
title: "Node.js ESM 动态 import 报模块找不到？检查文件扩展名"
description: "Node.js ESM 模式下动态 import() 不自动解析 .js 后缀，缺少扩展名会导致 ERR_MODULE_NOT_FOUND，PM2 表现为崩溃循环"
date: 2026-05-18
tags: [Node.js, ESM, PM2, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Node.js ESM 动态 import 报 Cannot find module 但文件存在？"
    a: "ESM 模式下 import() 不自动补全 .js 后缀。import('./foo') 会找不到 ./foo.js，必须写 import('./foo.js')。"
  - q: "为什么 PM2 重启计数不断飙升？"
    a: "如果启动流程中有延迟执行的动态 import（如定时器触发的 import()），应用启动时正常，延迟 import 报错后崩溃，PM2 自动重启——形成循环。"
---

在为客户构建 SaaS 数据分析平台时遇到此问题，记录根因与解法。

## TL;DR

Node.js ESM 模式下，`import('./path/to/module')` 不会自动解析 `./path/to/module.js`。TypeScript 编译的 dist 产物如果遗漏 `.js` 后缀，模块加载时抛出 `ERR_MODULE_NOT_FOUND`。如果这个 import 在延迟逻辑中（如定时器、条件分支），应用启动正常但运行一段时间后崩溃，PM2 表现为重启计数飙升。

**解法**：确保所有 ESM 动态 import 路径包含 `.js` 扩展名，并在 build 流程中自动修复。

## 问题现象

PM2 状态显示应用不断重启：

```
│ name             │ ↺    │ status │ uptime │
│ analytics-api    │ 9    │ online │ 28m    │
```

错误日志每几分钟重复：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/dist/domains/video/cleanup'
  imported from /app/dist/server.js
```

但文件实际存在：

```
$ ls dist/domains/video/
cleanup.js  executor.js  queue.js
```

## 根因

### ESM 不自动解析文件扩展名

Node.js 的 CommonJS (`require()`) 会自动尝试 `.js`、`.json` 等后缀。**ESM (`import`) 不会**。

```javascript
// ❌ ESM 模式下找不到模块
import('./domains/video/cleanup')
// Node.js 查找: ./domains/video/cleanup （精确路径，无扩展名）
// 实际文件:     ./domains/video/cleanup.js

// ✅ 必须带 .js 后缀
import('./domains/video/cleanup.js')
```

### 延迟 import 隐藏了问题

这个 import 在定时器中延迟执行：

```typescript
// server.ts — 启动时不立即执行
import('./domains/video/cleanup.js').then(({ startCleanupScheduler }) => {
  startCleanupScheduler(); // 几秒后才触发
});
```

应用启动成功（DB 连接、端口监听都正常），定时器触发时 import 报错 → 进程崩溃 → PM2 重启 → 再次启动成功 → 定时器再次触发 → 再次崩溃。形成**崩溃循环**。

### 为什么之前没问题？

旧版本的 dist 产物是通过手动 build 生成的，build 脚本包含 `.js` 后缀修复步骤。某次部署时跳过了 build 后的修复步骤，直接用 `tsc` 输出的产物部署，`tsc` 不修改 import 路径。

## 解决方案

### 1. TypeScript 源码中写 `.js` 后缀

TypeScript 官方推荐：即使在 `.ts` 文件中，也写 `.js` 后缀：

```typescript
// ✅ TypeScript 源码中也写 .js
import('./domains/video/cleanup.js').then(({ startCleanupScheduler }) => {
  startCleanupScheduler();
});
```

### 2. Build 后自动修复（推荐）

在 build 流程中添加后缀修复脚本，自动为没有扩展名的 import 补上 `.js`：

```json
{
  "scripts": {
    "build": "tsc && node fix-imports.js"
  }
}
```

`fix-imports.js` 核心逻辑：

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
      // 修复动态 import: from 'xxx' → from 'xxx.js'
      const fixed = content.replace(
        /import\(['"](\.[^'"]+)['"]\)/g,
        (match, path) => path.endsWith('.js') ? match : match.replace(path, path + '.js')
      );
      // 修复静态 import: from 'xxx' → from 'xxx.js'
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

build 流程自动为所有相对路径 import 补全 `.js` 后缀，TypeScript 源码保持无后缀写法，ESM 部署不再出现模块找不到的错误。

<InfoBox variant="warning" title="注意事项">

- 此问题只在 Node.js ESM 模式（`"type": "module"` 或 `.mjs` 文件）下出现，CommonJS 不受影响
- 静态 import（`import ... from './foo'`）同样受此限制，不仅限于动态 `import()`；ESM 的 import 提升还会导致另一个常见问题——[dotenv 在 import 链之后才执行，环境变量读不到](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order)
- 使用 `tsx`、`ts-node` 开发时不报错（它们会自动解析后缀），但 `node dist/server.js` 生产运行时出错
- PM2 崩溃循环的典型特征：重启计数（↺）持续增长，每次 uptime 不超过几分钟

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
