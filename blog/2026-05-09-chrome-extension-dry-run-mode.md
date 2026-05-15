---
title: Chrome 扩展数据直写生产库？加个 DRY-RUN 开关安全调试
description: Chrome 扩展采集数据调试时直写生产数据库？用环境变量 + HTTP Header + 服务端拦截三层实现 DRY-RUN 模式，预览数据不写库。
date: 2026-05-09
tags: [Chrome插件, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Chrome 扩展开发时怎么避免测试数据写入生产数据库？"
    a: "用环境变量控制 DRY-RUN 模式，客户端发 X-Dry-Run Header，服务端拦截后只返回预览数据不写库。"
  - q: "Vite 项目怎么让开发环境自动加自定义 HTTP Header？"
    a: "在 background script 中读取 import.meta.env 环境变量，条件判断后给 fetch 请求 headers 加字段。"
---

## TL;DR

Chrome 扩展在开发调试时，每次测试采集都会把数据写进生产数据库。用三层 DRY-RUN 开关解决：`.env.development` 设环境变量 → 客户端读取后给请求加 `X-Dry-Run` Header → 服务端拦截该 Header 返回数据预览，不执行写入。生产环境不设该变量，完全不受影响。


<!-- truncate -->
---

## 问题现象

Chrome 扩展采集电商数据后通过 API 提交到后端。开发调试阶段，每触发一次采集就往生产数据库写一条记录。测试几次后，数据库里全是脏数据，影响线上数据准确性。

没有"只看不写"的开关，要么注释掉提交代码（容易忘改回来），要么连着生产库调试（脏数据不可避免）。

---

## 根因

Chrome 扩展的开发环境和生产环境共用同一个 API 端点。`fetch` 请求里没有任何标记区分"这是一次调试提交"还是"这是一次真实提交"。后端收到请求就执行写入，无法区分意图。

开发时需要一个"预览模式"——看到数据会提交什么，但不实际写入。

---

## 解决方案

三层实现：环境变量 → HTTP Header → 服务端拦截。

### Step 1：声明环境变量类型

```typescript
// client/src/env.d.ts
interface ImportMetaEnv {
  // ... 其他变量
  readonly VITE_INQUIRY_DRY_RUN?: string;
}
```

### Step 2：开发环境配置

```env
# client/.env.development（仅开发环境）
VITE_INQUIRY_DRY_RUN=true
```

```env
# client/.env.production（不设置此变量）
# 生产环境始终走真实写入
```

### Step 3：客户端读取环境变量，条件加 Header

在 Service Worker（background script）中，读取环境变量并给请求加标记：

```typescript
// background.ts
chrome.storage.local.get('sessionToken', (result) => {
  const sessionToken = result.sessionToken;
  if (!sessionToken) return;

  // 读取 DRY-RUN 开关
  const dryRun = import.meta.env.VITE_INQUIRY_DRY_RUN === 'true';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`,
  };

  // DRY-RUN 模式加标记 Header
  if (dryRun) {
    headers['X-Dry-Run'] = 'true';
  }

  fetch(`${baseURL}/inquiry/collect`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ memberId, rows }),
  });
});
```

WXT/Vite 在构建时将 `import.meta.env.VITE_INQUIRY_DRY_RUN` 内联替换为字符串。开发构建（`.env.development`）值为 `"true"`，生产构建（`.env.production`）值为 `undefined`，`=== 'true'` 自然为 `false`。

### Step 4：服务端拦截 DRY-RUN 请求

```typescript
// server/src/functions/analytics/inquiry.ts
router.post('/collect', async (req, res) => {
  // ... 认证、memberId 映射等前置逻辑

  const dryRun = req.headers['x-dry-run'] === 'true';

  if (dryRun) {
    // 不写入数据库，返回数据预览
    return res.json({
      code: 200,
      message: 'dry-run ok',
      data: {
        dryRun: true,
        shop_id: match.shop_id,
        platform_id: match.platform_id,
        memberId,
        rowCount: rows.length,
        sampleRows: rows.slice(0, 3),
      },
      timestamp: Date.now(),
    });
  }

  // 正常流程：写入数据库
  const result = await analyticsClient.post('/internal/data/import/inquiry', payload);
  res.json({ code: 200, data: result });
});
```

服务端在 DRY-RUN 模式下仍然执行认证和数据校验（确保数据格式正确），只是跳过最终的数据库写入。这样既能验证数据格式，又不产生脏数据。

---

## 注意事项

<InfoBox variant="warning" title="不要在生产 .env 中设置 DRY-RUN 变量">
  `.env.production` 不设置 `VITE_INQUIRY_DRY_RUN`，生产构建中该变量为 `undefined`，条件判断自然为 `false`。永远不要在生产配置中开启此开关。
</InfoBox>

<InfoBox variant="warning" title="客户端要检查 dryRun 标志">
  DRY-RUN 模式下服务端返回 `200` 状态码和 `{ dryRun: true, data: {...} }`。客户端代码如果只检查 `code === 200` 会导致误判为"写入成功"。检查 `response.data.dryRun` 区分真实写入和预览。
</InfoBox>

<InfoBox variant="warning" title="DRY-RUN 仍然执行认证和数据校验">
  不要在认证之前就拦截 DRY-RUN 请求。保持完整的请求链路（认证 → 校验 → 拦截），这样能验证请求格式和权限是否正确，只是跳过最后一步写入。
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
