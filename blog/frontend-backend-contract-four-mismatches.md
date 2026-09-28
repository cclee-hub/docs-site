---
title: "接口 422、参数 undefined？前后端契约对不上的四个坑"
description: "请求 422、useParams 是 undefined、接口 200 却静默失败——三个症状同一根因：前后端契约不一致。字段名、字段类型、路由参数、事件字段四个坑的定位与预防。"
date: 2026-09-28
tags: [FastAPI, React, TypeScript, API 设计, 前后端联调]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "FastAPI 返回 422 Unprocessable Entity 怎么排查？"
    a: "422 的响应体里带 detail 数组，逐条写明哪个字段、什么原因——先用浏览器 Network 面板或 curl 展开它，九成的 422 是字段名与后端 Schema 不一致或字段类型不符。请求体里发 name 而后端 Schema 要 label，就是典型的字段名坑。"
  - q: "React Router 的 useParams 为什么取不到值？"
    a: "useParams 返回的键名由路由定义里的 :param 决定：路由是 /agents/:id，就只能用 useParams().id 取。解构时想换变量名用重命名语法 const { id: agentId } = useParams()。参数名对不上不会报错，只是安静地给你 undefined。"
  - q: "前后端字段名不一致怎么预防？"
    a: "把后端 Schema（Pydantic/Zod 都行）当成契约的唯一来源：新接口动手前先对齐字段名和类型，前端 TypeScript 接口从 Schema 生成或逐字段核对。接口评审时多问一句「请求体长什么样」，比联调时抓包省一个下午。"
---

前后端联调的三种经典场面：POST 请求返回 422；路由页面参数永远是 undefined；SSE 请求状态码 200，消息却静默无响应。症状各不相同，挖到底是同一类根因——**前后端对接口的理解不一致**。

> 在为客户构建 AI Agent SaaS 平台时遇到此问题，前后端分别开发，四个坑全踩了一遍，记录定位方法与预防纪律。

## TL;DR

契约不一致有四种形态，对应三类症状：

| 坑 | 不一致点 | 症状 |
|----|---------|------|
| 字段名 | 前端发 `name`，后端要 `label` | 422 |
| 字段类型 | 前端发对象数组，后端收字符串数组 | 422 |
| 路由参数 | 路由定义 `:id`，组件取 `agentId` | undefined，功能静默失效 |
| 事件字段 | 后端推 `{"content": ...}`，前端检查 `token` | 200，界面无响应 |

预防只有一个纪律：**动手写代码前，先对齐 Schema**——字段名、类型、路由参数名，全部以后端 Schema（或双方共同确认的接口文档）为唯一来源。

## 坑一：字段名不一致 → 422

最原始的坑。前端 TypeScript 接口定义创建 API Key 的入参用 `name` + `key`，后端 Pydantic Schema 期望的是 `label` + `api_key`：

```ts
// 前端以为的
interface CreateApiKeyInput {
  name: string
  key: string
}

# 后端定义的
class ApiKeyCreate(BaseModel):
    label: str
    api_key: str
```

```
POST /api/api-keys → 422 Unprocessable Entity
```

**定位靠 422 响应体，别瞎猜。** FastAPI 的 422 会带 `detail` 数组，逐条写明缺哪个字段、为什么：

```json
[
  { "loc": ["body", "label"], "msg": "Field required", "type": "missing" },
  { "loc": ["body", "api_key"], "msg": "Field required", "type": "missing" }
]
```

`Field required` = 请求体里根本没有这个字段 = 字段名对不上。浏览器 Network 面板展开响应，十秒钟定位。

## 坑二：字段类型不一致 → 422

字段名对上了，类型也能埋雷。后端 Schema 声明 `mcp_tools` 是字符串数组，前端却发对象数组（每个对象带 `tool_id` 和 `token_id`，业务上确实需要绑定 OAuth Token）：

```ts
// 前端发的
{ mcp_tools: [{ tool_id: "t1", token_id: "k1" }] }

# 后端收的
mcp_tools: List[str]
```

```
PATCH /api/agents/{id} → 422 Unprocessable Entity
```

这次 `detail` 里报的是 `Input should be a valid string`——类型不符。修法在后端 Schema 兼容两种形态（前端数据结构有业务理由，不该硬砍）：

```python
from typing import List, Union

class McpToolConfig(BaseModel):
    tool_id: str
    token_id: str | None = None

mcp_tools: List[Union[str, McpToolConfig]]
```

`Union` 让 Schema 同时接受字符串（只引用工具 ID）和对象（带绑定配置），Pydantic 按顺序尝试匹配。这个模式对「接口演进、前端先行」的场景通用：**Schema 迁就真实业务形态，而不是反过来逼调用方削足适履**。

## 坑三：useParams 参数名不一致 → undefined

路由定义和组件取参各写各的，参数名差一个词：

```tsx
// 路由定义
<Route path="/agents/:id/memory" element={<MemoryPage />} />

// 组件里
const { agentId } = useParams<{ agentId: string }>()
// agentId 永远是 undefined —— 路由里的参数名叫 id，不叫 agentId
```

页面不报错、请求状态码正常，就是功能静默失效——`agentId` 是 undefined，后续 API 调用全带上 undefined，或者干脆没发出去。

两条修法：

```tsx
// 1. 参数名对齐路由定义
const { id } = useParams<{ id: string }>()

// 2. 想用别的变量名，解构重命名
const { id: agentId } = useParams<{ id: string }>()
```

这个坑的隐蔽性在 `useParams<{ agentId: string }>` 的泛型参数——TypeScript 不会校验泛型里的键名是否真的存在于路由定义，类型标注给了假的安心。

## 坑四：事件字段不一致 → 200 但静默失败

SSE 流式响应里，后端推的事件数据是 `{"content": "..."}`，前端判断逻辑检查的却是 `token`：

```ts
// 前端的事件判断
const isTokenEvent = (d: any) => 'token' in d        // 永远 false

// 后端实际推的
data: {"content": "你好"}
```

网络面板里请求 200、数据流在动，界面上却一个字都不出现——判断条件永远不成立，事件被静默丢弃。这类坑比 422 更难排查：**没有报错，只有「功能没发生」**。

修法是事件判断对齐后端的实际数据结构：

```ts
const isTokenEvent = (d: any) => 'content' in d && !('type' in d)
```

SSE / WebSocket 这类「一个连接多种事件」的接口，建议在事件数据里带显式的 `type` 字段做分发，靠「有没有某字段」推断事件类型的写法，契约变更时就是静默失败的温床。

## 预防：一条纪律

四个坑的共同起因：前后端各自凭想象写了对接口的那一半。预防不需要工具，就一条纪律——

**新接口动手前，先对齐 Schema：字段名、类型、路由参数名、事件数据结构，逐项过。** 后端 Pydantic Schema（或 OpenAPI 文档）是唯一来源，前端 TypeScript 接口照着它写；谁要改契约，先改 Schema、双方确认，再动代码。

联调时遇到症状，按这个顺序筛：422 → 展开响应体 `detail` 看 `loc`；undefined → 核对路由定义的 `:param` 名；200 但功能没发生 → 抓一份真实响应，逐字段对前端判断逻辑。

流式接口的服务端另有伴生坑（客户端断开导致的异常与资源泄漏），已在 [FastAPI SSE 客户端断开报 CancelledError？生成器必须捕获并 re-raise](/blog/fastapi-sse-cancellederror) 一文展开。

<InfoBox variant="warning" title="注意事项">

前端 TypeScript 的接口类型（`interface XxxInput`）只是编译期的纸面约束，`as any`、第三方请求封装都能绕过它——类型对得上不代表字段对得上。契约校验的最终依据永远是与后端 Schema 的比对，不是前端类型不报红。

</InfoBox>

## 常见问题

### FastAPI 返回 422 Unprocessable Entity 怎么排查？

422 的响应体里带 `detail` 数组，逐条写明哪个字段、什么原因——先用浏览器 Network 面板或 curl 展开它，九成的 422 是字段名与后端 Schema 不一致或字段类型不符。请求体里发 `name` 而后端 Schema 要 `label`，就是典型的字段名坑。

### React Router 的 useParams 为什么取不到值？

`useParams` 返回的键名由路由定义里的 `:param` 决定：路由是 `/agents/:id`，就只能用 `useParams().id` 取。解构时想换变量名用重命名语法 `const { id: agentId } = useParams()`。参数名对不上不会报错，只是安静地给你 undefined。

### 前后端字段名不一致怎么预防？

把后端 Schema（Pydantic/Zod 都行）当成契约的唯一来源：新接口动手前先对齐字段名和类型，前端 TypeScript 接口从 Schema 生成或逐字段核对。接口评审时多问一句「请求体长什么样」，比联调时抓包省一个下午。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
