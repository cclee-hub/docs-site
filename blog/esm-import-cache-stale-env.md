---
title: "运行时改了环境变量不生效？ESM import 把旧值缓存成常量"
description: "登录脚本运行时刷新 Token 后，业务模块 import 进来的常量还是旧值。根因：ESM 模块只求值一次，import 是只读绑定。解法：消费侧动态读 process.env，附三种写法对比。"
date: 2026-09-28
tags: [Node.js, ESM, 环境变量, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Node.js 环境变量怎么配置和读取？"
    a: "配置走 .env 文件加 dotenv，或系统级 export；代码里统一从 process.env.XXX 动态读取。关键结论：process.env 是唯一会被运行时更新传导的通道——模块顶层 import 进来的常量在首次加载时就固定了，之后 process.env 怎么变它都不会跟着变。"
  - q: "为什么更新了 process.env，其他模块读到的还是旧值？"
    a: "因为消费模块写的是 import { TOKEN } from './config.js' —— 这行代码在模块首次加载时求值一次，把当时的值复制进了本地常量，之后 config.js 内部和 process.env 的任何变化都传导不过来。改成每次用时读 process.env.TOKEN 即可拿到现值。"
  - q: "dotenv 更新 .env 文件后需要重启进程吗？"
    a: "最稳妥是重启：dotenv.config() 只在调用那一刻读一次文件。如果必须进程内热更新，要重新调用 dotenv.config({ override: true }) 且所有消费方都动态读 process.env——只要有一处 import 成常量，热更新就在那里断掉。"
---

登录脚本运行时成功刷新了凭据，写进了 `process.env`；业务模块里请求照样 401——它 `import` 进来的那个常量，还是进程启动时的旧值。

> 在为客户构建数据采集工具时遇到此问题，记录根因与解法。

## TL;DR

**ESM 模块只求值一次，`import` 进来的是加载那一刻的只读快照**——之后 `process.env` 怎么更新，都传导不到已经 import 的常量里。

```js
// ❌ 加载时缓存，之后永远是旧值
import { AUTH_TOKEN } from './config.js'

// ✅ 每次使用时读现值
function getToken() {
  return process.env.AUTH_TOKEN || ''
}
```

原则一句话：**需要运行时更新的值，消费侧必须动态读 `process.env`，不能 import 成模块级常量。**

## 问题现象

三个文件的分工：`config.js` 集中导出配置常量，`login.js` 负责登录并刷新凭据，`runtime.js` 拿凭据发业务请求：

```js
// config.js —— 集中导出
export const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
```

```js
// login.js —— 登录后刷新凭据
process.env.AUTH_TOKEN = newToken   // 运行时更新
console.log('[login] token refreshed')
```

```js
// runtime.js —— 业务请求
import { AUTH_TOKEN } from './config.js'

fetch(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
// → 401：AUTH_TOKEN 还是进程启动时的旧值（或空串）
```

日志显示 token 刷新成功，请求头里带的却是旧凭据。打印 `AUTH_TOKEN` 的值和 `process.env.AUTH_TOKEN` 的值对比，两者不一致——`process.env` 是新的，import 来的常量是旧的。

## 根因：ESM 模块只求值一次

ESM 规范里，**一个模块的代码从首次被 import 到进程结束只执行一次**，第二次 import 拿到的是同一个模块实例的缓存。

所以 `runtime.js` 里那行 `import { AUTH_TOKEN } from './config.js'` 的实际语义是：加载 `config.js`（求值 `export const AUTH_TOKEN = process.env.AUTH_TOKEN || ''`，此刻把 process.env 的现值固定进常量），把这个**值**绑定给 `runtime.js` 作用域里的 `AUTH_TOKEN`。

这条绑定有两个特征，正是坑的来源：

1. **只读**：`import` 绑定的值在消费方不可重新赋值（ESM 的 import 绑定虽然指向导出的「实时绑定」，但 `config.js` 导出的是 `const` 常量，永远不会有新值）
2. **与 process.env 脱钩**：`login.js` 后来执行的 `process.env.AUTH_TOKEN = newToken` 只是改了 `process.env` 对象上的一个属性——`config.js` 里的求值早就结束了，没有任何机制把这次修改传导回已导出的常量

一句话：`process.env` 是一个可变的运行时对象，而 `export const X = process.env.Y` 是对它某一行的一次性快照。快照不会跟着原件变。

## 解法：消费侧动态读

**改法一（最小改动）：用时取现值。** 把 import 常量改成读 `process.env`：

```js
// runtime.js
// import { AUTH_TOKEN } from './config.js'   ← 删掉

fetch(url, {
  headers: { Authorization: `Bearer ${process.env.AUTH_TOKEN || ''}` },
})
```

**改法二（多处使用）：收敛成一个 getter。** 使用点多时，散落的 `process.env.XXX` 不好维护，集中到动态读取的函数：

```js
// config.js —— 导出函数而不是常量
export const getToken = () => process.env.AUTH_TOKEN || ''
```

```js
// runtime.js —— 调用时求值，永远现值
import { getToken } from './config.js'

fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
```

**改法三（配置项多）：导出对象、按属性取。** 对象属性访问天然是动态的：

```js
// config.js
const env = {
  get token() { return process.env.AUTH_TOKEN || '' },
}
export default env

// runtime.js
import env from './config.js'
env.token   // 每次访问都读 process.env
```

三种写法同一个原则：**把「求值时机」从模块加载推迟到每次使用**。

同一个工具里，`.env` 的存放路径还有一层打包后的坑（userData 目录而非 cwd），两件事都属「配置读取时机与位置」，见 [Electron 打包后 .env 读不到？配置在 userData 目录而非项目根](/blog/electron-packaged-env-userdata)。

<InfoBox variant="warning" title="注意事项">

dotenv 也一样：`dotenv.config()` 只在调用那一刻读一次 `.env` 文件，之后再改文件、再调用普通 config 都不会更新已注入的值（`override: true` 重调才会覆盖，但仅对之后读 `process.env` 的代码生效——import 成常量的照旧是死值）。「改了 .env 不生效」先查是不是进程没重启，再查是不是 import 成了常量。

</InfoBox>

## 常见问题

### Node.js 环境变量怎么配置和读取？

配置走 `.env` 文件加 dotenv，或系统级 export；代码里统一从 `process.env.XXX` 动态读取。关键结论：`process.env` 是唯一会被运行时更新传导的通道——模块顶层 import 进来的常量在首次加载时就固定了，之后 process.env 怎么变它都不会跟着变。

### 为什么更新了 process.env，其他模块读到的还是旧值？

因为消费模块写的是 `import { TOKEN } from './config.js'` —— 这行代码在模块首次加载时求值一次，把当时的值复制进了本地常量，之后 config.js 内部和 process.env 的任何变化都传导不过来。改成每次用时读 `process.env.TOKEN` 即可拿到现值。

### dotenv 更新 .env 文件后需要重启进程吗？

最稳妥是重启：`dotenv.config()` 只在调用那一刻读一次文件。如果必须进程内热更新，要重新调用 `dotenv.config({ override: true })` 且所有消费方都动态读 process.env——只要有一处 import 成常量，热更新就在那里断掉。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
