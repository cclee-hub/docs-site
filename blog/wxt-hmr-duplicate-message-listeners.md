---
title: "Chrome 扩展热重载后消息被处理两次？WXT HMR 多实例叠加监听器"
description: "WXT (WXT-dev) 热重载时 content script 不会销毁旧的 window.addEventListener，导致 postMessage 被多个实例重复处理"
date: 2026-05-18
tags: [Chrome插件, WXT, Vite, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Chrome 扩展热重载后 postMessage 被执行两次怎么办？"
    a: "WXT HMR 重新执行 content script 但不销毁旧的事件监听器。需要手动用 removeEventListener 移除旧监听器，再注册新的。"
  - q: "为什么 removeEventListener 没生效？"
    a: "必须用同一个函数引用才能移除。把监听器函数存到 window 变量上，重载时取出旧引用再移除。"
---

在为客户构建电商数据采集 Chrome 扩展时遇到此问题，记录根因与解法。

## TL;DR

WXT 框架 HMR 热重载时，content script 重新执行但旧的 `window.addEventListener('message', ...)` 不会被清除。每热重载一次就多一个监听器实例，导致每条 `postMessage` 被处理 N 次。

**解法**：注册新监听器前，从 `window` 变量取出旧监听器引用并 `removeEventListener`。

## 问题现象

浏览器控制台显示同一条消息被两个不同实例捕获：

```
content.js:114 [CCL] CCL_SHOP_REPORT_DAILY daily caught - 实例: nxctn6
content.js:2   [CCL] CCL_SHOP_REPORT_DAILY daily caught - 实例: t6jce7
```

每条 `postMessage` 被处理两次，导致后台发送重复请求。

## 根因

WXT (基于 Vite 的 Chrome 扩展框架) 开发模式下，修改 content script 后触发 HMR：

1. 新的 content script 模块被加载执行
2. 新的 `window.addEventListener('message', messageListener)` 被注册
3. **旧的监听器函数仍然存在于内存中**——HMR 不负责清理 DOM 事件监听器

结果：`window` 上挂载了多个独立的 message 监听器，每条 `postMessage` 触发所有实例。

## 解决方案

在 content script 入口处，注册新监听器前移除旧的：

```typescript
const instanceId = Math.random().toString(36).slice(2, 8);

// 取出旧监听器引用
const prevListener = (window as any).__cclMessageListener;
if (prevListener) {
  window.removeEventListener('message', prevListener);
}

// 定义新监听器
const messageListener = (event: MessageEvent) => {
  // ... 处理逻辑
};

// 存储当前引用（供下次 HMR 取用）
(window as any).__cclMessageListener = messageListener;

// 注册
window.addEventListener('message', messageListener);
```

**关键点**：`removeEventListener` 必须传入和 `addEventListener` 相同的函数引用。把函数存到 `window` 变量上，下次 HMR 时就能取出旧引用并正确移除。这样无论热重载多少次，始终只有一个活跃的 message 监听器。

如果你同时遇到[ postMessage 的 targetOrigin 安全问题](/blog/2026/05/18/chrome-extension-postmessage-targetorigin-star)或[Cookie 取值导致数据全零](/blog/chrome-extension-cookie-priority-mismatch)，建议一并排查。

<InfoBox variant="warning" title="注意事项">

- 此问题不仅限于 WXT，所有支持 content script 热重载的框架（Plasmo、CRXJS 等）都可能遇到
- `window` 上的变量在页面刷新前一直存在，HMR 只替换脚本模块不清除 `window` 属性
- 生产构建不存在此问题（content script 只加载一次），但开发时会产生难以排查的重复请求

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
