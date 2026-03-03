---
title: 在 Docusaurus 中集成 Umami 网站分析
description: 一步步教你如何在 Docusaurus 网站中集成 Umami 隐私友好的网站分析工具，包括脚本配置和 CSP 安全策略设置。
date: 2026-03-03
tags: [Docusaurus, Umami, 网站分析]
schema: Article
---

## TL;DR

在 `docusaurus.config.ts` 的 `scripts` 数组中添加 Umami 脚本，同时更新 CSP 的 `script-src` 和 `connect-src` 允许 Umami 域名即可完成集成。

## 问题现象

Google Analytics 太重？想用 Umami 这类轻量级、隐私友好的分析工具，但不知道如何在 Docusaurus 中正确配置，尤其是遇到 CSP（内容安全策略）拦截的问题。

## 根因

Docusaurus 默认配置了严格的 CSP 策略，阻止外部脚本执行。Umami 脚本需要：
1. 从外部域名加载脚本
2. 向外部域名发送追踪数据

这两个操作都会被默认 CSP 拦截。

## 解决方案

### 步骤 1：添加 Umami 脚本

在 `docusaurus.config.ts` 中添加 `scripts` 配置：

```typescript
const config: Config = {
  // ...其他配置

  // Umami 网站分析
  scripts: [
    {
      src: 'https://umami.example.com/script.js',
      async: true,
      'data-website-id': 'your-website-id',
    },
  ],

  // ...
};
```

**关键点**：
- `async: true` 异步加载，不阻塞页面渲染
- `data-website-id` 从 Umami 后台获取

### 步骤 2：更新 CSP 策略

在 `themeConfig.metadata` 中更新 Content-Security-Policy：

```typescript
themeConfig: {
  metadata: [
    {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'self'; script-src 'self' 'unsafe-inline' https://umami.example.com; connect-src 'self' https://umami.example.com; ...",
    },
  ],
},
```

**必须添加**：
- `script-src` 添加 Umami 域名（允许加载脚本）
- `connect-src` 添加 Umami 域名（允许发送数据）

### 步骤 3：验证集成

打开浏览器开发者工具，检查：
1. Network 面板中是否有 `script.js` 请求
2. Console 中是否有 CSP 报错
3. Umami 后台是否开始接收数据

## FAQ

### Q: Umami 脚本加载了但没有数据？

A: 检查 `connect-src` 是否包含 Umami 域名。Umami 使用 `fetch` 或 `sendBeacon` 发送数据，需要 `connect-src` 权限。

### Q: 为什么要用 Umami 而不是 Google Analytics？

A: Umami 是开源的、自托管的、符合 GDPR 的，且脚本仅 2KB。GA4 脚本超过 50KB，且数据存储在 Google 服务器。

### Q: 可以用环境变量配置 website-id 吗？

A: 可以，但需要用 `process.env` 读取。注意 `docusaurus.config.ts` 在构建时执行，不是运行时：

```typescript
'data-website-id': process.env.UMAMI_WEBSITE_ID || 'default-id',
```
