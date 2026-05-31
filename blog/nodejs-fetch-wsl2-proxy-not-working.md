---
title: "Node.js fetch 代理不生效？undici 不读 http_proxy 环境变量"
description: "Node.js 22+ 内置 fetch 基于 undici，不读取 http_proxy/https_proxy 环境变量，WSL2 代理环境下的排查过程与 node-fetch 替代方案。"
date: 2026-05-26
tags: [Node.js, WSL2, proxy, undici, node-fetch, 网络代理]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 Node.js fetch 不读 http_proxy 环境变量？"
    a: "Node.js 22+ 内置的 fetch 基于 undici 实现，undici 设计上不读取 http_proxy/https_proxy 环境变量。需要用 node-fetch 或 undici 的 ProxyAgent 手动配置代理。"
  - q: "Node.js fetch 如何通过代理发送请求？"
    a: "安装 node-fetch@3 和 https-proxy-agent，创建带代理的 fetch 实例。生产环境无代理时自动直连，不依赖 Node 版本。"
---

在 WSL2 环境下设置了 `https_proxy` 环境变量，Node.js 的 `fetch()` 仍然直连外网超时。

在为客户构建 AI 电商工具时遇到此问题，记录根因与解法。

## TL;DR

Node.js 22+ 内置的 `fetch()` 基于 undici 实现，**设计上不读取 `http_proxy`/`https_proxy` 环境变量**。解决方案：安装 `node-fetch@3` + `https-proxy-agent`，创建带代理配置的 fetch 实例，生产环境无代理时自动直连。

## 问题现象

WSL2 环境下，`https_proxy` 已正确设置，`curl` 能正常访问外网：

```bash
echo $https_proxy
# http://172.30.224.1:7897

curl -I https://httpbin.org/ip
# HTTP/1.1 200 OK
```

但 Node.js 的 `fetch()` 直接超时：

```js
await fetch('https://httpbin.org/ip');
// FetchError: fetch failed
// cause: TimeoutError: Headers Timeout Error
```

如果你同时遇到 [WSL2 代理完全不通](/blog/wsl2-proxy-firewall-block)（连 `curl` 也不行），先排查防火墙问题。

## 根因

Node.js v22+ 的全局 `fetch()` 由内置 undici 7.x 提供。undici **从设计上就不读取** `http_proxy`/`https_proxy` 环境变量——这是有意为之，不是 bug。

对比不同 HTTP 客户端的代理行为：

| 客户端 | 读取环境变量 | 走代理 |
|--------|:---:|:---:|
| `curl` | 自动读取 `https_proxy` | ✅ |
| Node.js `http`/`https` 模块 | 不读取 | ❌ |
| `axios` / `node-fetch@3` | 读取 `https_proxy` | ✅ |
| Node.js 内置 `fetch()`（undici） | 不读取 | ❌ |

这导致在必须通过代理才能访问外网的环境（WSL2、企业内网）下，`fetch()` 直连超时。

## 解决方案

安装 `node-fetch@3` 和 `https-proxy-agent`：

```bash
npm install node-fetch@3 https-proxy-agent
```

创建一个自动感知代理的 fetch 实例：

```js
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

export async function fetchWithProxy(url, options = {}) {
  return fetch(url, { ...options, agent });
}
```

使用方式和原生 `fetch()` 几乎一致：

```js
// 替换前
const res = await fetch('https://httpbin.org/ip');

// 替换后
const res = await fetchWithProxy('https://httpbin.org/ip');
```

### 为什么用 node-fetch 而不是 undici 的 ProxyAgent？

Node.js v24 内置 undici 7.x，但 npm 上的 `undici@8.x` 的 `ProxyAgent` 与内置版本不兼容：

```js
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// Node v24 下报错：UND_ERR_INVALID_ARG
// npm undici@8 的 ProxyAgent 与内置 undici@7 的 setGlobalDispatcher 不兼容
setGlobalDispatcher(new ProxyAgent(proxyUrl));
```

`node-fetch@3` + `https-proxy-agent` 与 Node 版本无关，不存在兼容性问题。生产环境无代理时 `agent` 为 `undefined`，自动直连。

<InfoBox variant="warning" title="注意事项">

- 不要尝试用 `setGlobalDispatcher` 覆盖全局 fetch——在 `tsx watch` 热重载环境下修改不会传播到工作模块
- npm `undici@8.x` 的 `FormData` 类型与全局 `FormData` 不兼容，混用会导致 TypeScript 编译报错
- `node-fetch@3` 是 ESM-only 包，`import` 导入即可，不支持 `require()`

</InfoBox>

## 常见问题

### 为什么 Node.js fetch 不读 http_proxy 环境变量？

Node.js 22+ 内置的 fetch 基于 undici 实现，undici 设计上不读取 http_proxy/https_proxy 环境变量。需要用 node-fetch 或 undici 的 ProxyAgent 手动配置代理。

### Node.js fetch 如何通过代理发送请求？

安装 node-fetch@3 和 https-proxy-agent，创建带代理的 fetch 实例。生产环境无代理时自动直连，不依赖 Node 版本。

WSL2 环境下还有其他网络陷阱——[Docker Desktop 的 host 模式也会让容器端口在 WSL2 里访问不到](/blog/docker-desktop-wsl2-host-network-unreachable)，排查思路类似：先确认 `curl` 能否到达，再查应用层配置。

同样的 Node 版本升级还可能踩到其他坑——比如 [Node 24 下 JWT 密钥格式变更](/blog/nodejs-24-jwt-jose-keyobject)，升级时建议一并检查。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-3">遇到 Node.js 网络问题？</p>
  <a href="https://aidevhub.ai" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">联系合作</a>
</div>
