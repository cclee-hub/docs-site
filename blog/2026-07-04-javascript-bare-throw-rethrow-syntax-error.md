---
title: "JavaScript throw; 报 SyntaxError？JS 没有 bare rethrow，重新抛出必须 throw e"
description: "JavaScript/TypeScript 在 catch 块里写 throw;（裸重抛）会报 SyntaxError（Node）/ TS1109 Expression expected（tsc）/ Unexpected ';'（esbuild）——JS 没有 C#/Java/Python 那样的 bare rethrow，重新抛出必须 throw e。"
date: 2026-07-04
tags: [JavaScript, TypeScript, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "JavaScript 怎么重新抛出（rethrow）捕获到的异常？"
    a: "用 throw e，catch 必须带绑定参数：catch (e) { ...; throw e; }。JS 没有 bare rethrow，单独写 throw; 是 SyntaxError，三工具链（Node/tsc/esbuild）都会拒绝。"
  - q: "JavaScript 重新抛出异常会保留原始调用栈吗？"
    a: "会。throw e 复用同一个 error 对象，其 .stack 在 new Error 时就已捕获，rethrow 不覆盖它。只有 throw new Error(...) 才会从当前位置刷新调用栈。"
  - q: "JavaScript try/catch 里怎么正确 rethrow？"
    a: "catch 必须接收参数再把它抛回：try { ... } catch (e) { log(e); throw e; }。若用 ES2019 的 catch {}（省略参数）则无法 rethrow，只能 throw new Error(...) 抛新异常。"
---

在 catch 块里想"把异常原样往上抛"，顺手写了 `throw;`——习惯了 C# 的 bare rethrow 写法——结果 tsx/esbuild 直接转换失败：`Unexpected ";"`。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。

## TL;DR

JavaScript **没有 bare rethrow 语法**。`throw;`（裸 throw）在 Node、tsc、esbuild 三个工具链里都是编译期 SyntaxError。要重新抛出捕获到的异常，必须 `throw e`（catch 块得带绑定参数）；想换成新异常就 `throw new Error(...)`。

## 问题现象

同一个 `throw;`，在不同工具链里的报错措辞不同，但全是语法错误（不是运行时错误）：

```js
try {
  something();
} catch {
  throw;   // ← 裸重抛
}
```

| 工具链 | 报错 |
|--------|------|
| tsx / esbuild | `ERROR: Unexpected ";"`（转换失败） |
| Node.js 原生（.js / .mjs） | `SyntaxError: Unexpected token ';'` |
| TypeScript 编译器（tsc） | `error TS1109: Expression expected.` |

最迷惑的是 esbuild 那条 `Unexpected ";"`——很容易让人以为是 "esbuild/tsx 不支持某种新语法"。但把同一段代码丢进 Node 原生跑，报的是一模一样的 SyntaxError。**这不是工具的局限，是语言本身就没有这种写法。**

## 根因

ECMAScript 的 `throw` 语句语法**强制要求一个表达式**：

```text
ThrowStatement : throw Expression ;
```

也就是说 `throw` 后面必须跟一个值（`throw err`、`throw new Error()`、`throw "fail"`），分号前不能为空。**JavaScript 没有"裸 throw = 重新抛出当前异常"的语义**——这是它和 C# / Java / Python 的关键区别：

| 语言 | 重新抛出当前异常 | 是否需要捕获变量 |
|------|-----------------|----------------|
| C# | `throw;` | 不需要 |
| Java | `throw e;` | 需要 |
| Python | `raise` | 不需要 |
| **JavaScript** | **`throw e;`** | **需要** |

一个常见的混淆点：ES2019 引入了 optional catch binding（`catch {}` 可以省略参数），但这和 bare throw 是两回事。**即使 catch 带了绑定，写 `throw;` 依然报错**——

```js
try { f(); } catch (e) { throw; }   // 仍是 SyntaxError，参数 e 不会自动喂给 throw
```

实测在 tsx 里同样是 `Unexpected ";"`。`throw` 后面的表达式不能省，没有例外。

## 解决方案

按"想干什么"对号入座：

```js
// 1. 重新抛出原异常（rethrow）—— 最常见诉求
try {
  doWork();
} catch (e) {
  log(e);
  throw e;            // ✅ 带上 e
}

// 2. 换成新异常（wrap）
try {
  doWork();
} catch (e) {
  throw new Error(`处理失败: ${e.message}`);   // ✅ throw + 表达式
}

// 3. 用 ES2019 的 catch {} 时，省略了参数就没法 rethrow，只能抛新异常
try {
  doWork();
} catch {
  throw new Error("doWork 失败");   // ✅ 这里写 throw; 是错的
}
```

最小可运行复现 + 修复，直接用 tsx 跑：

```ts
function risky(): void {
  throw new Error("origin");
}

function rethrowOptional(): void {
  try {
    risky();
  } catch (e) {          // ← 必须接收 e
    console.log("caught, rethrowing");
    throw e;             // ← 而不是 throw;
  }
}

try {
  rethrowOptional();
} catch (e) {
  console.log("recovered:", (e as Error).message);   // origin
}
```

关于调用栈：`throw e` 复用的是同一个 error 对象，它的 `.stack` 在 `new Error` 时就已经捕获，rethrow 不会覆盖；只有 `throw new Error(...)` 才会从当前抛出点重新生成栈。所以"rethrow 会不会丢栈"的答案是——不会，只要你不 `new` 一个新的。

异常处理的另一个常见坑，是 catch 块干脆把异常吞掉、对外表现为静默失败，见 [Python 任务全标 failed 却不报错？try/except 吞掉了异常](/blog/python-try-except-swallow-exception-silent-failure)——跨语言都值得警惕。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- **元凶不是 optional catch binding**：`catch {}`（ES2019）本身合法，问题只在 `throw;`。别为了"修 throw"去给 catch 强加参数，除非你确实要用那个变量。
- **async/await 同理**：`try { await f() } catch (e) { throw; }` 在 async 函数里同样是 SyntaxError，规则不分同步异步。
- **stack 保留**：`throw e` 保留原始栈；`throw new Error(...)` 刷新栈。排查时想看最早抛出点就用前者。
- **跨语言习惯对齐**：从 C#/Python 转来 JS，把 `throw;` / `raise` 直接搬过来必踩；团队里 review 时留意这个模式。

</InfoBox>

## 常见问题

### JavaScript 怎么重新抛出（rethrow）捕获到的异常？

用 `throw e`，且 catch 必须带绑定参数：`catch (e) { ...; throw e; }`。JavaScript 没有 bare rethrow，单独写 `throw;` 是 SyntaxError，Node、tsc、esbuild 三个工具链都会在编译期拒绝，这不是任何一个工具的局限。

### JavaScript 重新抛出异常会保留原始调用栈吗？

会。`throw e` 复用的是同一个 error 对象，它的 `.stack` 在 `new Error` 构造时就已经捕获，rethrow 不会覆盖或重置。只有 `throw new Error(...)` 才会从当前抛出点重新生成调用栈——所以排查时要看最早抛出位置，就用 `throw e`。

### JavaScript try/catch 里怎么正确 rethrow？

catch 必须先接收参数，再把它抛回：`try { ... } catch (e) { log(e); throw e; }`。如果用了 ES2019 的 `catch {}`（省略参数），就没有变量可抛，只能 `throw new Error(...)` 抛一个新异常。无论哪种，`throw` 后都必须跟表达式，`throw;` 永远非法。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
