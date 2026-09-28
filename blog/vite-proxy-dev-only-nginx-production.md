---
title: "本地能调通线上 404？Vite Proxy 不参与生产，需要 Nginx 反代"
description: "Vite dev proxy 只活在开发服务器里，build 产物是纯静态文件没有代理层。部署后 /api 404 的根因与 Nginx location /api 反代配置，含 SPA fallback 吃掉请求的坑。"
date: 2026-09-28
tags: [Vite, Nginx, 反向代理, 前端部署]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "生产环境 Nginx 反向代理 /api 怎么配置？"
    a: "在 server 块里加一个前缀 location：location /api { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }，然后 nginx -t 校验、nginx -s reload 生效。注意反代块的 location /api 必须与后端路由前缀一致，且优先级高于 SPA 的 fallback location。"
  - q: "Vite 的 proxy 配置怎么确认生效了？"
    a: "dev server 启动日志不会打印 proxy 规则，直接验证请求走向：浏览器 Network 面板里请求 URL 仍是 http://localhost:5173/api/xxx 但响应数据来自后端，或用 curl http://localhost:5173/api/xxx 能拿到后端返回，就是生效了。proxy 只在 dev server（默认 5173 端口）上工作。"
  - q: "build 后 Vite 的 proxy 配置会打包进产物吗？"
    a: "不会。server.proxy 是 dev server 的运行时中间件，npm run build 产出的是纯静态文件，没有任何代理能力。生产环境的「代理」需要 Nginx 这类反向代理服务器承担，配置写在 Nginx 的 location 里而不是 vite.config.ts。"
---

Vite 项目本地开发接口全通，`npm run build` 部署到服务器后，页面能打开，但所有 `/api` 请求返回 404——或者更隐蔽：返回的是 `index.html`，前端把 HTML 当 JSON 解析直接报错。

> 在为客户构建 AI Agent SaaS 平台时遇到此问题，前后端分离部署，记录根因与解法。

## TL;DR

**`vite.config.ts` 里的 `server.proxy` 只属于 dev server。** `npm run build` 产出纯静态文件，没有任何代理层；生产环境由 Nginx 接住 `/api`：

```nginx
location /api {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

加在 SPA fallback（`try_files ... /index.html`）能命中的范围之外，`nginx -t` 校验后 `nginx -s reload`。

## 问题现象

两种表现，同一个根因：

**表现一：直接 404**

```
GET https://example.com/api/agents  → 404 Not Found
```

**表现二：返回 index.html（更隐蔽）**

```
GET /api/agents  → 200 OK，响应体却是 <!DOCTYPE html>...
前端 JSON.parse 失败：Unexpected token '<'
```

第二种是 SPA fallback 吃掉了请求：Nginx 找不到 `/api/agents` 对应的静态文件，`try_files $uri /index.html` 把它兜底到了前端入口页。状态码还是 200，等前端解析响应时才炸，排查时容易被「请求成功了」迷惑。

## 根因：proxy 是 dev server 的运行时功能

`vite.config.ts` 里的这段配置：

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
})
```

它生效的场合只有一个：**`npm run dev` 启动的开发服务器**。Vite dev server 是一个 Node 进程，`server.proxy` 是这个进程里的转发中间件——浏览器请求 `localhost:5173/api/agents`，dev server 收到后转手发给 `127.0.0.1:3000`，把响应带回来。

`npm run build` 之后，产物是 `dist/` 下的一堆静态文件，浏览器直接从 Nginx 拿文件——**这个链路里没有 Vite 进程，`server.proxy` 配置留在 vite.config.ts 里，根本不随构建走**。

所以生产的请求走向是：浏览器 → Nginx → ？。Nginx 按 location 匹配，没有 `/api` 规则时，静态文件找不到 `/api/agents` 这个路径，要么 404，要么被 SPA fallback 兜到 `index.html`——两种表现就是这么来的。

## 解法：Nginx 承担生产代理

**第一步：server 块加反代 location。**

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/app/dist;

    # API 反代：前缀匹配，优先于 SPA fallback
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback：其余路径全给前端入口
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

要点两个：

- `proxy_pass` 指向后端真实地址端口（示例的 3000 换成你的后端端口）；`/api` 前缀请求会原样转发，后端路由也要带 `/api` 前缀
- Nginx 前缀 location 按最长匹配优先，`/api` 天然赢过 `/`，两块不用调顺序；但如果你的 API 路径有更深的公共前缀，保证前缀匹配覆盖即可

**第二步：验证后生效。**

```bash
nginx -t          # 语法校验
nginx -s reload   # 平滑重载

# 冒烟验证：应返回后端数据而非 HTML
curl -i https://example.com/api/health
```

`curl` 看到 JSON 响应、`Content-Type: application/json`，代理就通了；看到 `text/html` 说明请求还在被 fallback 接住。

顺带的收益：反代后前端和后端同域，**开发时靠 Vite proxy 绕开的跨域问题在生产也自然消失**，不需要再配 CORS。

这一篇与 [部署后前端没更新？Nginx 缓存与构建产物检查](/blog/frontend-deploy-build-outdated) 是部署排查的姊妹篇：那篇管「上线的代码是旧的」，这篇管「接口在生产没有代理层」，两处都查完，部署类 404 基本穷尽。

<InfoBox variant="warning" title="注意事项">

`location /api` 的路径拼写必须和后端路由前缀完全一致。如果后端路由是 `/api/agents` 而 Nginx 反代配的是 `/apis`，或者 `proxy_pass` 末尾多了一个 `/`（会触发路径重写，`/api/agents` 变成 `/agents` 到达后端），都会得到新的 404。改完先用 `curl -i` 打一条真实接口确认响应头，再放流量。

</InfoBox>

## 常见问题

### 生产环境 Nginx 反向代理 /api 怎么配置？

在 server 块里加一个前缀 location：`location /api { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }`，然后 `nginx -t` 校验、`nginx -s reload` 生效。反代块的 `/api` 必须与后端路由前缀一致，且优先级高于 SPA 的 fallback location。

### Vite 的 proxy 配置怎么确认生效了？

dev server 启动日志不会打印 proxy 规则，直接验证请求走向：浏览器 Network 面板里请求 URL 仍是 `http://localhost:5173/api/xxx` 但响应数据来自后端，或用 `curl http://localhost:5173/api/xxx` 能拿到后端返回，就是生效了。proxy 只在 dev server（默认 5173 端口）上工作。

### build 后 Vite 的 proxy 配置会打包进产物吗？

不会。`server.proxy` 是 dev server 的运行时中间件，`npm run build` 产出的是纯静态文件，没有任何代理能力。生产环境的「代理」需要 Nginx 这类反向代理服务器承担，配置写在 Nginx 的 location 里而不是 vite.config.ts。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
