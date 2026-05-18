---
title: "Chrome 扩展消息被意外接收？postMessage targetOrigin 用星号的跨域泄露风险"
description: "window.postMessage 第二个参数用 * 会导致消息广播到所有 frame，恶意页面可监听你的扩展数据——改为 window.location.origin 精确限定接收方"
date: 2026-05-18
tags: [Chrome插件, postMessage, 安全]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Chrome 扩展用 postMessage 传数据安全吗？"
    a: "取决于 targetOrigin 参数。用 '*' 不安全，任何嵌入的 iframe 都能收到；用 window.location.origin 只发给同源页面，安全得多。"
  - q: "postMessage 第二个参数不传会怎样？"
    a: "不传等同于 '*'，消息会广播到所有 frame，包括第三方 iframe，存在数据泄露风险。"
---

在为客户开发 Chrome 扩展数据采集工具时遇到此问题，记录根因与解法。

## TL;DR

`window.postMessage(data, '*')` 会把消息广播给页面中**所有 frame**，包括第三方 iframe。如果你的 Chrome 扩展通过 `postMessage` 传递用户数据（如 memberId、业务报表），任何嵌入页面的 iframe 都能监听到。把 `'*'` 改为 `window.location.origin` 即可精确限定接收方。

## 问题现象

Chrome 扩展的采集脚本通过 `postMessage` 将电商数据传递给 content script：

```javascript
// ❌ 不安全：消息广播到所有 frame
window.postMessage({
  type: 'CCL_SHOP_REPORT_DAILY',
  memberId: 'b2b-2214126315258ad300',  // 用户 ID
  rows: [{ uv: 403, payAmt: 19478.47 }]  // 业务数据
});
// 等同于 window.postMessage(data, '*')
```

页面上如果嵌入了第三方 iframe（广告、统计、社交插件），这些 iframe 的 `message` 事件监听器**同样能收到这条消息**。

## 根因

`postMessage` 的第二个参数 `targetOrigin` 决定消息的接收范围：

| targetOrigin | 行为 |
|-------------|------|
| `'*'` 或省略 | 广播到**所有** frame，不检查来源 |
| `'https://example.com'` | 只发送到 origin 为 `https://example.com` 的 frame |
| `window.location.origin` | 只发送到**当前页面同源**的 frame |

省略第二个参数时，浏览器默认使用 `'*'`。这在 Chrome 扩展场景下尤其危险——扩展注入的脚本运行在电商平台页面，页面上可能有多个第三方 iframe。

## 解决方案

### 封装安全的 postMessage 工具函数

```javascript
// safePostMessage：强制使用 window.location.origin
function safePostMessage(data) {
  window.postMessage(data, window.location.origin);
}

// 使用
safePostMessage({
  type: 'CCL_SHOP_REPORT_DAILY',
  subType: 'daily',
  memberId: memberId,
  rows: [row]
});
```

### 接收端也要验证 origin

```javascript
// content script 中监听消息
window.addEventListener('message', (event) => {
  // ✅ 验证来源 origin
  if (event.origin !== window.location.origin) return;

  // ✅ 验证消息结构
  if (!event.data || typeof event.data.type !== 'string') return;

  switch (event.data.type) {
    case 'CCL_SHOP_REPORT_DAILY':
      handleDailyReport(event.data);
      break;
    case 'CCL_ITEM_WEEKLY_REPORT':
      handleWeeklyReport(event.data);
      break;
  }
});
```

### 什么时候可以用 `'*'`

只有一种场景安全：消息内容完全不含敏感信息，且接收方 origin 不可预知。例如纯 UI 状态通知（"面板已打开"）。即使如此，用 `window.location.origin` 也更安全。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- Chrome 扩展的 MAIN world 脚本和 content script 运行在不同的 JavaScript 隔离环境，`postMessage` 是它们通信的标准方式——务必保护好这条通道（遇到[热重载后消息重复处理](/blog/wxt-hmr-duplicate-message-listeners)时需要手动清理旧监听器）
- 接收端 `event.origin` 验证和发送端 `targetOrigin` 限定**缺一不可**，单向防护不完整
- 如果消息需要跨 origin 传递（如从页面发到扩展 background），应使用 `chrome.runtime.sendMessage`（参考 [Service Worker Token 同步](/blog/2026/05/09/chrome-extension-token-sync-service-worker)）而不是 `postMessage`

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
