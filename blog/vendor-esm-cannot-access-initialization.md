---
title: "转 ESM 报 Cannot access before initialization？隐式全局赋值"
description: "浏览器扩展点击报 Cannot access before initialization，构建全绿？根因是 vendor 经典脚本隐式全局赋值在 ESM 严格模式中断模块初始化，文件头补 var 声明即可修复。"
date: 2026-09-13
tags: [Chrome插件, ESM, JavaScript, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 typecheck 和 build 全绿，运行时才报 Cannot access before initialization？"
    a: "静态检查和打包不执行模块代码，而隐式全局赋值的 ReferenceError 只在模块真正初始化时抛出。如果出问题的模块位于动态 import 的依赖链上，报错会推迟到用户交互那一刻——本例点击扩展按钮才炸，构建期 0 报错。用 Vitest（jsdom 环境）直接 import 该模块即可本地复现并拿到真实行号。"
  - q: "Cannot access 'xxx' before initialization 和暂时性死区（TDZ）有什么关系？"
    a: "动态 import 返回的命名空间对象，在依赖模块初始化中断后处于暂时性死区，访问其任何导出都抛这个错。识别线索是报错名：压缩产物里是 2 个字母的随机短名（如 Hc）而不是业务符号名，说明中断发生在模块图求值阶段，而非业务代码。"
  - q: "怎么修复 vendor 经典脚本的隐式全局赋值？"
    a: "在 vendor 文件顶部为每个隐式全局补 var 声明（本例 2 个：ReaderArticleFinder 与 CandidateElement），让赋值落在已声明变量上。一行声明消除整个模块图的初始化中断；新 vendor 文件入库前跑一次 strict-mode 冒烟测试即可提前拦截。"
---

在浏览器扩展里点击「提取本页」按钮时，控制台抛出 `Cannot access 'Hc' before initialization`——而 typecheck、build、常规测试全部通过，本地开发时也从未复现。

在为客户开发[电商自动化数据采集工具](/cases/ecommerce-data-collection-tool)时遇到此问题——批量抓取商品图片、SKU、价格与评价，清洗后导出结构化数据，支撑库存管理与竞品分析。「提取本页」正是该工具链里的采集入口，炸的是它的内容脚本模块。

## TL;DR

第三方经典脚本（vendored classic script）里有一处隐式全局赋值（`CandidateElement = function(...)`，未声明直接赋值）。经典脚本里这是合法的全局变量创建，但文件被内联进 ESM 模块图后在严格模式下变成 ReferenceError，模块初始化当场中断，下游通过动态 import 拿到的命名空间因此处于暂时性死区（TDZ）。修法：vendor 文件头补一行 `var CandidateElement;`。

## 问题现象：构建全绿，点击即炸

报错发生在用户点击时，不是页面加载时：

```text
TypeError: Cannot access 'Hc' before initialization
```

三个反直觉的点：

1. **typecheck 通过**——类型层面没有任何问题；
2. **build 通过**——打包器只做静态分析，不执行模块代码；
3. **常规测试通过**——测试没有把该模块完整 import 一遍。

报错对象是 `Hc` 这种 2 字母压缩名，不是任何业务符号名。这个特征先记下，后面识别时会用到。

## 根因：隐式全局赋值如何中断 ESM 模块图

出问题的是第三方库里的一行代码，位于 `reader-finder.js:878`：

```js
// 经典脚本语义：未声明就赋值 = 创建全局变量，合法
CandidateElement = function(e, t) { ... }
```

整个故障链条有 4 步，逐环递进：

**第 1 步：经典脚本语义下合法。** 这个文件原本以 `<script>` 方式加载，非严格模式下「未声明直接赋值」会静默创建全局变量，原作者依赖了这一行为。

**第 2 步：进入 ESM 后变成雷区。** 文件被内联进扩展的 ESM 模块图，而 ESM 代码强制运行在严格模式下——隐式全局赋值直接抛 `ReferenceError`，模块初始化（module evaluation）当场中断。

**第 3 步：中断沿模块图扩散。** 内容脚本 `content.js` 的内联模块图在求值到这个 vendor 模块时停摆：靠前模块的消息监听器已经注册成功，靠后的模块 facade（门面导出）还没执行——模块处于「半初始化」状态。

**第 4 步：动态 import 踩进 TDZ。** 用户点击按钮时，代码通过动态 import 加载命名空间 facade。由于第 3 步的中断，这个命名空间处于暂时性死区，访问即抛 `Cannot access 'Hc' before initialization`——压缩名 `Hc` 正是那个没初始化完的模块内部绑定。

这就解释了所有现象：静态检查不执行模块代码所以全绿；报错在点击时才出现，因为动态 import 发生在点击处理器里；报错名是压缩随机名，因为炸的是被打包器改名过的模块内部绑定。

关于 ESM 动态 import 的另一个高频坑（模块找不到），见这篇：[Node.js ESM 动态 import 报模块找不到？检查文件扩展名](/blog/esm-dynamic-import-missing-extension)。

## 解法：vendor 文件头补一行 var 声明

不改第三方逻辑，只把隐式全局变成显式声明——在 vendor 文件头部补上：

```js
var ReaderArticleFinder;
var CandidateElement;
```

赋值从「创建全局变量」变成「给已声明变量赋值」，严格模式下合法，模块初始化不再中断，下游动态 import 拿到的 facade 正常可用。

同文件里的 `ReaderArticleFinder` 早就是这样处理的——同一个坑，这个库埋了两次，第一次修了，第二次（`CandidateElement`）漏了。

### 验证：用 Vitest 让它本地复现

修复前先要能稳定复现，否则只能等线上验证。常规测试跑不到这条路径，但用 Vitest（jsdom 环境）直接 `import` 该模块可以：

```ts
import { describe, it, expect } from 'vitest';

describe('vendor reader-finder strict-mode', () => {
  it('模块图完整初始化，不抛 ReferenceError', async () => {
    const mod = await import('./lib/vendor/reader-finder');
    expect(mod).toBeDefined();
  });
});
```

这条测试在修复前能复现报错，且给出真实文件行号堆栈（`reader-finder.js:878`）——比线上压缩产物的 `Hc` 可定位得多。修复后转绿。

修完的完整验证是把提取链端到端跑一遍：模块图完整初始化 + 提取功能实际可用，两条都过才算闭环。

### 防回归

把这个复现用例固化成冒烟测试（`extractor.test.ts`），并立一条入库纪律：新的经典脚本 vendor 进项目前，必须先过这个测试或等价的 strict-mode 检查。

<InfoBox variant="warning" title="注意事项">

- vendor 文件尽量保持原样以便 diff 上游，补 `var` 声明时在文件头加注释说明改动原因，避免下次更新 vendor 时被当作冲突冲掉。
- 隐式全局通常不止一个：补声明前全文搜一遍「未声明直接赋值」的模式，本例同一文件里就有 2 处。
- 这类问题与打包器无关——换 esbuild、rollup 结果一样，因为严格模式语义是语言层面的。

</InfoBox>

## 如何快速识别这类 TDZ 报错

下次见到 `Cannot access 'xxx' before initialization`，按两个特征判断是不是同款问题：

| 特征 | 同款问题 | 其他 TDZ 问题 |
|---|---|---|
| 报错名 | 压缩随机短名（`Hc`、`Wt`） | 业务符号名（`myConfig`） |
| 报错时机 | 交互触发（动态 import）时 | 模块加载/页面加载时 |
| 静态检查 | 全绿 | 通常也能查出（let/const 重复声明类） |

命中左列：优先怀疑 vendor 经典脚本的隐式全局，搜「未声明赋值」+ 用 Vitest 直接 import 复现。ESM 迁移期的另一类经典报错（CJS require ESM）见：[Node.js require nanoid 报 ERR_REQUIRE_ESM？v5 改纯 ESM 的替代方案](/blog/2026/06/12/nanoid-v5-err-require-esm-commonjs)。

## 常见问题

### 为什么 typecheck 和 build 全绿，运行时才报 Cannot access before initialization？

静态检查和打包不执行模块代码，而隐式全局赋值的 ReferenceError 只在模块真正初始化时抛出。如果出问题的模块位于动态 import 的依赖链上，报错会推迟到用户交互那一刻——本例点击扩展按钮才炸，构建期 0 报错。用 Vitest（jsdom 环境）直接 import 该模块即可本地复现并拿到真实行号。

### Cannot access 'xxx' before initialization 和暂时性死区（TDZ）有什么关系？

动态 import 返回的命名空间对象，在依赖模块初始化中断后处于暂时性死区，访问其任何导出都抛这个错。识别线索是报错名：压缩产物里是 2 个字母的随机短名（如 Hc）而不是业务符号名，说明中断发生在模块图求值阶段，而非业务代码。

### 怎么修复 vendor 经典脚本的隐式全局赋值？

在 vendor 文件顶部为每个隐式全局补 var 声明（本例 2 个：ReaderArticleFinder 与 CandidateElement），让赋值落在已声明变量上。一行声明消除整个模块图的初始化中断；新 vendor 文件入库前跑一次 strict-mode 冒烟测试即可提前拦截。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
