---
title: Chrome 扩展 Service Worker 读不到登录态？跨上下文 Token 同步方案
description: Chrome 扩展 sidepanel 登录存 localStorage，但 Service Worker 没有 localStorage API。通过 chrome.runtime.sendMessage 消息机制将 token 同步到 chrome.storage.local。
date: 2026-05-09
tags: [Chrome插件, 认证]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Chrome 扩展 Service Worker 里用 localStorage 为什么报 ReferenceError？"
    a: "Service Worker 没有 window 和 localStorage，只能用 chrome.storage API 和消息通信。"
  - q: "Chrome 扩展 sidepanel 登录后 background 脚本怎么拿到 token？"
    a: "登录后通过 chrome.runtime.sendMessage 发给 Service Worker，由它写入 chrome.storage.local。"
  - q: "chrome.storage 在 sidepanel 里能直接用吗？"
    a: "DevTools 上下文中 chrome.storage 可能是 undefined，建议用 localStorage + 消息转发双写。"
---

## TL;DR

Chrome 扩展使用 sidepanel 作为 UI 入口，用户登录后 token 存入 `localStorage`。但 Service Worker（background script）没有 `localStorage`，调用直接抛 `ReferenceError`。解决方案：sidepanel 登录后通过 `chrome.runtime.sendMessage` 将 token 同步给 Service Worker，由 Service Worker 写入 `chrome.storage.local`。两边各取所需——sidepanel 读 `localStorage`，Service Worker 读 `chrome.storage.local`。

---

## 问题现象

用户在 sidepanel 登录成功，`localStorage` 中写入了 `sessionToken`。但当 Service Worker（background script）尝试读取 token 发起 API 请求时：

```
ReferenceError: localStorage is not defined
    at getAuthToken (background.js:42)
    at submitCollectedData (background.js:87)
```

登录在 sidepanel 没问题，但所有从 Service Worker 发出的认证请求全部失败。

---

## 根因

Chrome 扩展有多个执行上下文，各自拥有的 API 不同：

| 上下文 | window | localStorage | chrome.storage | chrome.runtime |
|--------|--------|-------------|---------------|----------------|
| Sidepanel / Popup | 有 | 有 | 可能 undefined | 有 |
| Content Script | 有 | 有（隔离） | 有 | 有 |
| Service Worker | 无 | 无 | 有 | 有 |

关键限制：
- **Service Worker** 没有 `window`、`document`、`localStorage`，只能用 `chrome.storage` API
- **Sidepanel** 在 DevTools 上下文中 `chrome.storage` 可能是 `undefined`

登录流程在 sidepanel 将 token 存入 `localStorage`。Service Worker 尝试从 `localStorage` 读取 → `ReferenceError`。

---

## 解决方案

### 架构

```
Sidepanel (login)
  ├→ localStorage.setItem(token)           ← sidepanel 读取
  └→ chrome.runtime.sendMessage(syncToken)
       └→ Service Worker
            └→ chrome.storage.local.set(token)  ← Service Worker 读取
```

Token 存在两个地方：`localStorage`（sidepanel 读取）和 `chrome.storage.local`（Service Worker 读取）。登录和登出时通过消息机制保持两边同步。

### Step 1：登录函数 — 双写

登录成功后，先写 `localStorage`（sidepanel 可用），再通过消息同步给 Service Worker：

```typescript
// auth.ts — 登录成功后
localStorage.setItem('sessionToken', token);
localStorage.setItem('userInfo', JSON.stringify(user));
localStorage.setItem('subscriptionInfo', JSON.stringify(subscription));

// 同步到 chrome.storage.local（通过 Service Worker）
try {
  chrome.runtime.sendMessage({
    action: 'syncToken',
    token,
    user,
    subscription,
  });
} catch (e) {
  // 非扩展上下文（单元测试、普通网页），忽略
}
```

`try/catch` 是必要的——在非扩展上下文中 `chrome.runtime.sendMessage` 会抛异常。

### Step 2：Service Worker — 消息处理

在 background script 中监听消息，将 token 写入 `chrome.storage.local`：

```typescript
// background.ts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 同步 token：sidepanel → chrome.storage.local
  if (request.action === 'syncToken') {
    const { token, user, subscription } = request;
    const data: Record<string, string> = {};
    if (token) data.sessionToken = token;
    if (user) data.userInfo = typeof user === 'string' ? user : JSON.stringify(user);
    if (subscription)
      data.subscriptionInfo =
        typeof subscription === 'string' ? subscription : JSON.stringify(subscription);

    chrome.storage.local.set(data, () => {
      console.log('[syncToken] token synced to chrome.storage.local');
      sendResponse({ success: true });
    });
    return true; // 异步 sendResponse 必须返回 true
  }

  // 登出时清除 token
  if (request.action === 'clearToken') {
    chrome.storage.local.remove(
      ['sessionToken', 'userInfo', 'subscriptionInfo'],
      () => {
        console.log('[clearToken] token cleared from chrome.storage.local');
        sendResponse({ success: true });
      }
    );
    return true;
  }
});
```

### Step 3：Service Worker 从 chrome.storage.local 读取 token

```typescript
// Before（Service Worker 中报错）:
const sessionToken = localStorage.getItem('sessionToken');

// After（正确方式）:
chrome.storage.local.get('sessionToken', (result) => {
  const sessionToken = result.sessionToken;
  if (!sessionToken) {
    console.warn('No session token found');
    return;
  }
  // 使用 token 发起 API 请求
  fetch('https://api.example.com/data', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
});
```

### Step 4：登出清除两边

```typescript
// auth.ts
function clearAuthData(): void {
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('subscriptionInfo');
  try {
    chrome.runtime.sendMessage({ action: 'clearToken' });
  } catch (e) {
    // 非扩展上下文，忽略
  }
}
```

---

## 注意事项

<InfoBox variant="warning" title="双存储必须同步">
  Token 存在两个地方：`localStorage`（sidepanel 读）+ `chrome.storage.local`（Service Worker 读）。登录和登出都必须同时操作两边，否则状态不一致。
</InfoBox>

<InfoBox variant="warning" title="onMessage 中 return true 不能省">
  `chrome.runtime.onMessage` 监听器中使用异步 `sendResponse`（如 `chrome.storage.local.set` 的回调）时，必须 `return true`。否则消息通道提前关闭，`sendResponse` 调用无效。
</InfoBox>

<InfoBox variant="warning" title="不要在 sidepanel 直接用 chrome.storage">
  DevTools 上下文中 `chrome.storage` 可能是 `undefined`，无法直接写入。用 `localStorage` + 消息转发是最可靠的方案。
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
