---
title: "WordPress REST API 上传图片返回 405？检查你的 Hostinger CDN"
description: "Hostinger CDN 默认拦截 WP REST API Media POST 请求，导致 405 Not Allowed。排查思路与关闭/配置 CDN 的完整解法。"
date: 2026-05-26
tags: [WordPress, WooCommerce, Hostinger, CDN, REST API, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WordPress REST API 上传图片返回 405 Not Allowed 怎么办？"
    a: "先检查 response header 中的 server 字段，如果是 hcdn 说明请求被 Hostinger CDN 拦截，未到达 WordPress。关闭 CDN 或联系客服放行即可。"
  - q: "如何判断 405 是 CDN 拦截还是 WordPress 返回的？"
    a: "curl 加 -v 参数查看 response header：server 值为 hcdn 或其他 CDN 标识说明是 CDN 层拦截；server 值为 nginx/apache 且有 X-WP-* 头说明请求已到达 WordPress。"
---

在为客户构建 WooCommerce 产品导入工具时，调用 `/wp-json/wp/v2/media` 上传图片，前几张成功后突然全部返回 405 Not Allowed。

## TL;DR

Hostinger CDN（hcdn）默认拦截了 `POST /wp-json/wp/v2/media` 请求。响应头 `server: hcdn` + `x-hcdn-request-id` 是关键证据。关闭 CDN 或联系 Hostinger 客服放行 `/wp-json/*` POST 请求即可解决。

## 问题现象

通过 WP REST API 批量上传图片到 WordPress Media Library：

```bash
curl -X POST 'https://example.com/wp-json/wp/v2/media' \
  -u 'user:app_password' \
  -H 'Content-Disposition: attachment; filename="product-01.jpg"' \
  -H 'Content-Type: image/jpeg' \
  --data-binary @image.jpg
```

前 2-4 张图片返回 `201 Created`，之后的请求全部返回：

```html
<html>
<head><title>405 Not Allowed</title></head>
<body>
<center><h1>405 Not Allowed</h1></center>
<hr><center>nginx</center>
</body>
</html>
```

"部分成功"这个现象容易误导判断——看起来像是频率限制（Rate Limiting），但实际原因完全不同。

## 根因

用 `curl -v` 查看完整的 response header：

```
< HTTP/2 405
< server: hcdn
< x-hcdn-request-id: cfc5ad1198938cd9f1e02ce71ed0ae61-kul-edge1
```

关键信息：

- **`server: hcdn`** — 这是 Hostinger 自研 CDN（hcdn），不是源站 nginx
- **`x-hcdn-request-id`** — CDN 边缘节点 ID（kul-edge1 = 吉隆坡），说明请求在 CDN 层就被拦截了，根本没有到达 WordPress

Hostinger CDN 默认安全规则拦截了 `/wp-json/wp/v2/media` 的 POST 方法。前几张成功可能是因为 CDN 规则存在短暂的冷启动窗口或缓存未命中。

## 解决方案

### 方案 1：关闭 CDN（快速验证）

在 Hostinger hPanel → Website → CDN → 关闭 CDN。

关闭后立即生效，但会失去 CDN 加速能力。适合 staging 环境或紧急修复。

### 方案 2：联系 Hostinger 客服放行 API 路径（推荐）

提交工单要求放行 `/wp-json/*` 的 POST 请求。Hostinger Manage 页面目前不提供自定义 CDN 规则选项，必须通过客服操作。

### 方案 3：代码层增加重试与延迟（防御性措施）

即使 CDN 配置正确，加入重试逻辑也能应对偶发的 CDN 限流：

```python
import time
import random

def upload_image(url, image_bytes, filename, auth, max_retries=3):
    for attempt in range(max_retries):
        resp = httpx.post(
            url,
            content=image_bytes,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "image/jpeg",
            },
            auth=auth,
            timeout=30,
        )
        if resp.status_code != 405:
            return resp
        delay = 3 * (attempt + 1) + random.uniform(0, 2)
        time.sleep(delay)
    resp.raise_for_status()
```

## 排查过程回顾

这个问题绕了不少弯路，记录排查路径供参考：

| 排查方向 | 操作 | 结果 |
|---------|------|------|
| WP 插件拦截 | 停用 Speed Optimizer / Auto Upload Images | 仍 405，排除 |
| 请求频率限制 | 图片间加 2-5s 延迟 + 重试 | 仍 405，排除 |
| REST API 禁用 | GET `/wp-json/wp/v2/settings` | 正常返回，排除 |
| 凭证错误 | WC Test Connection | 成功，排除 |
| **CDN 拦截** | **curl -v 查看 response header** | **`server: hcdn` 确认 CDN 拦截** |

关键转折点是用 `curl -v` 看到了 `server: hcdn`，才知道请求根本没到达 WordPress 层。

<InfoBox variant="warning" title="注意事项">

- 关闭 CDN 后 DNS 缓存可能需要几分钟刷新，不要立刻重试
- 如果你的站点在 Hostinger 且使用 REST API 做批量操作，上线前务必测试 CDN 是否会拦截
- WooCommerce 的 WC API (`/wc/v3/products`) 走的是不同的认证机制（Consumer Key），通常不受此影响；受影响的主要是 WP REST API (`/wp-json/wp/v2/*`) 的写操作

</InfoBox>

## 常见问题

### WordPress REST API 上传图片返回 405 Not Allowed 怎么办？

先检查 response header 中的 `server` 字段。如果值为 `hcdn`（Hostinger CDN）或其他 CDN 标识，说明请求被 CDN 拦截，未到达 WordPress。关闭 CDN 或联系服务商放行即可。

### 如何判断 405 是 CDN 拦截还是 WordPress 返回的？

用 `curl -v` 查看 response header：`server` 值为 `hcdn`、`cloudflare` 等 CDN 标识说明是 CDN 层拦截；`server` 值为 `nginx`/`apache` 且包含 `X-WP-*` 或 `X-RateLimit-*` 头说明请求已到达 WordPress。

---

在为 [LightCT](https://github.com/lightcollectiveteam/importer) 构建 WooCommerce 产品导入工具时遇到此问题。如果你也在用 Hostinger 做 WordPress 开发，遇到类似的 REST API 问题，欢迎[联系交流](/blog/2026/05/26/hostinger-cdn-blocks-wp-rest-api-media-upload/#)。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
