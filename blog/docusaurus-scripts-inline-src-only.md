---
title: Docusaurus scripts 添加 inline 脚本构建失败？只支持 src 不接受 content
description: Docusaurus 的 scripts 配置不支持 inline content，必须用 src 引用静态文件。本文给出报错原因、静态文件方案与 CSP 配置，可直接复用。
date: 2026-06-13
tags: [Docusaurus, 网站分析, 前端工程化]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "如何在 Docusaurus 配置自定义 scripts？"
    a: "在 docusaurus.config.ts 顶层的 scripts 数组中添加条目，每条要么是字符串（视作 src），要么是带 src 属性的对象。inline 内容不能用 content 字段，必须放进 static 目录后用 src 引用。"
  - q: "Docusaurus scripts 为什么不支持 inline content？"
    a: "Docusaurus 的 scripts 配置只生成 <script src=\"...\"> 标签，没有为 inline 脚本设计字段。构建期会校验每个条目，缺少 src 就抛出 'A script must be a plain string, or an object with at least a src property'。"
  - q: "Docusaurus 如何注入 inline JavaScript（如百度统计）？"
    a: "把脚本写进 static/js/xxx.js，scripts 数组用 { src: '/js/xxx.js', async: true } 引用；脚本内部再动态创建 <script> 标签加载外部 JS。同时记得在 CSP 的 script-src 放行目标域名。"
---

在 `docusaurus.config.ts` 的 `scripts` 数组里用 `{ content: '...' }` 注入 inline 脚本（例如百度统计的 IIFE），执行 `npm run build` 直接报错。

在开发 [CCLEE Docusaurus Theme](/docs/cclee-docusaurus-theme) 时遇到此问题——基于 Docusaurus 3.x 的高级文档主题，紫色主题 + 深色模式 + Tailwind 排版增强，开箱即用的生产级文档站点模板。

## TL;DR

Docusaurus 的 `scripts` 配置**只接受 `src`**，不支持 inline `content`。把 inline 脚本挪到 `static/js/` 下，用 `{ src: '/js/xxx.js', async: true }` 引用即可；若脚本加载外部域名，还要同步更新 CSP。

## 问题现象

按百度统计官方代码，本能地想直接塞进 `scripts`：

```ts
// docusaurus.config.ts
const config: Config = {
  scripts: [
    {
      content: `var _hmt=_hmt||[];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?XXXX";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s);})();`,
    },
  ],
};
```

构建立刻失败：

```
[ERROR] Error: "scripts[1]" is invalid.
A script must be a plain string (the src), or an object with at least a "src" property.
    at validateConfig (.../configValidation.js:397:15)
```

## 根因

Docusaurus 的 `scripts` 配置在构建期被 [`validateScripts`](https://github.com/facebook/docusaurus/blob/main/packages/docusaurus/src/server/configValidation.ts) 逐条校验，每条只允许两种形态：

1. **纯字符串**：直接当作 `src` 处理
2. **对象**：必须包含 `src` 属性，可选 `async`、`defer`、`data-*` 等

设计上 `scripts` 只生成形如 `<script src="..." />` 的标签，**没有为 inline 脚本保留 `content` / `innerHTML` 字段**。所以无论 inline 内容多短，校验都会在 `src` 缺失时直接抛错，本地构建、Vercel 远端构建同样失败。

> 想注入带构建期变量的 inline 脚本，应改用顶层的 [`headTags`](https://docusaurus.io/zh-CN/docs/api/docusaurus-config#headTags) 配置（`tagName: 'script'` + `innerHTML`），而不是 `scripts`。

## 解决方案

### 1. 把 inline 脚本放进 `static/js/`

```js
// static/js/baidu-tongji.js
var _hmt = _hmt || [];
(function () {
  var hm = document.createElement('script');
  hm.src = 'https://hm.baidu.com/hm.js?XXXX';
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(hm, s);
})();
```

`static/` 目录下的文件会被原样拷贝到站点根目录，最终 URL 即 `/js/baidu-tongji.js`。

### 2. 在 `scripts` 用 `src` 引用

```ts
// docusaurus.config.ts
scripts: [
  // 已有的 Umami（参见 /blog/docusaurus-umami-analytics）
  {
    src: 'https://tj.ccleeai.com/script.js',
    async: true,
    'data-website-id': 'xxxx',
  },
  // 百度统计：走静态文件
  {
    src: '/js/baidu-tongji.js',
    async: true,
  },
],
```

### 3. 同步更新 CSP

如果站点启用了 Content-Security-Policy（推荐做法，参见我们之前总结的 [Umami 集成与 CSP 配置](/blog/docusaurus-umami-analytics)），新加的外部域名必须放行，否则脚本会被浏览器拦截：

```ts
themeConfig: {
  metadata: [
    {
      'http-equiv': 'Content-Security-Policy',
      // script-src 加 https://hm.baidu.com
      // connect-src、img-src 同步放行（hm.js 会发图片像素和 fetch 上报）
      content: "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://tj.ccleeai.com https://hm.baidu.com; " +
        "connect-src 'self' https://tj.ccleeai.com https://hm.baidu.com; " +
        "img-src 'self' data: https://hm.baidu.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "object-src 'none'; base-uri 'self'",
    },
  ],
},
```

百度统计的 IIFE 内部用 `document.createElement('script')` 动态注入 `<script src="hm.baidu.com/...">`，所以光放 `'unsafe-inline'` 不够，必须把 `hm.baidu.com` 加进 `script-src`。

<InfoBox variant="warning" title="注意事项">

- `scripts` 数组里的纯字符串和 `src` 是等价的：`'https://x/a.js'` 与 `{ src: 'https://x/a.js' }` 等效
- 路径以 `/` 开头时是相对站点根目录（`static/` 拷贝产物），不是文件系统根
- 若脚本依赖运行期变量、必须 inline，请用顶层 `headTags` 而非 `scripts`；`headTags` 支持 `innerHTML`
- 多套统计（Umami + 百度 + GA）可以共存，但每个外部域名都要单独加进 CSP，否则该域名上报被静默拦截

</InfoBox>

## 常见问题

### 如何在 Docusaurus 配置自定义 scripts？

在 `docusaurus.config.ts` 顶层的 `scripts` 数组中添加条目，每条要么是字符串（视作 `src`），要么是带 `src` 属性的对象。inline 内容不能用 `content` 字段——把脚本放进 `static/js/` 目录后用 `src: '/js/xxx.js'` 引用即可。如果还需要 `async`、`defer` 或自定义 `data-*` 属性，把它们和 `src` 放在同一个对象里。

### Docusaurus scripts 为什么不支持 inline content？

Docusaurus 的 `scripts` 配置在构建期生成的是 `<script src="...">` 标签，本身没有为 inline 脚本设计字段。校验器（`configValidation.ts` 中的 `validateScripts`）逐条检查，只要对象缺少 `src` 就抛出 `A script must be a plain string, or an object with at least a "src" property`，无论你的 `content` 写得多完整。这是刻意的 API 边界，把 inline 注入的能力交给了 `headTags`。

### Docusaurus 如何注入 inline JavaScript（如百度统计）？

最稳的方式是「静态文件 + 内部动态注入」：把官方那段 IIFE 脚本完整保存到 `static/js/baidu-tongji.js`，`scripts` 用 `{ src: '/js/baidu-tongji.js', async: true }` 引用；脚本内部再 `document.createElement('script')` 加载 `hm.baidu.com/hm.js`。最后别忘了在 CSP 的 `script-src`、`connect-src`、`img-src` 都加上 `https://hm.baidu.com`，否则上报会被浏览器拦截。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
