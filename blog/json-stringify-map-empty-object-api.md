---
title: "API 返回的 Map 字段前端拿到空对象？JSON.stringify 不认 Map"
description: "接口 200 正常返回，前端拿到的 Map 字段恒为 {}：JSON.stringify 只遍历自有可枚举属性，Map 一个都没有。Fastify/Express 都不特判，路由层透传前要自己摊平"
date: 2026-11-20
tags: [Node.js, Fastify, JSON]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 JSON.stringify(new Map()) 返回空对象 {}？"
    a: "JSON.stringify 只序列化对象的自有可枚举属性，而 Map 的键值对存在内部槽里，不是自有属性——可枚举属性数为 0，输出就是 {}。Map 嵌在对象里一样：JSON.stringify({m: new Map([['a',1]])}) 得到 {\"m\":{}}。解法是序列化前用 Object.fromEntries(map) 摊平成普通对象。"
  - q: "TypeScript 里 Map 字段经接口返回变空对象怎么解决？"
    a: "类型系统帮不上忙——Map 是合法对象，JSON.stringify 也不报错，问题只在运行时序列化层。在返回给客户端的边界处把 Map 显式转成普通对象：estimates: Object.fromEntries(r.estimates)，或把类型改成 Record<string, T> 强迫自己在源头就用普通对象。"
  - q: "Set 和 Date 序列化也会出问题吗？"
    a: "Set 同样中招：JSON.stringify(new Set([1])) 是 {}，要展开成数组 [...set]。Date 不一样，它实现了 toJSON()，JSON.stringify 输出的是 ISO 字符串（如 \"2026-01-05T00:00:00.000Z\"），行为正常。一句话：JSON 原生类型之外，Map/Set 都要在序列化边界显式转换。"
---

在一个 Node.js + Fastify 的预估计算接口里，前端拿到的行级日期全部缺位——接口状态 200、响应体正常，唯独 `estimates` 字段打开永远是 `{}`，换什么参数都一样。

## TL;DR

`JSON.stringify(new Map([['a', 1]]))` 的输出是 `'{}'`。Map 的键值对存在内部槽里，不是自有可枚举属性，而 stringify 只遍历自有可枚举属性。Fastify、Express 默认都走 `JSON.stringify`，不特判 Map——core 层返回 Map 没问题，坏在路由层原样透传。修法一行：`Object.fromEntries(map)` 摊平后再返回。

## 问题现象

前端拿到的 `estimates` 恒为空对象——接口状态 200、响应体正常、服务端日志无任何报错，换什么参数都一样。接口本身是典型的「服务端算排期、前端按行渲染」结构，路由层把核心计算函数的返回值直接塞给响应：

```ts
app.post('/api/projects/:id/preview', async (req, reply) => {
  const r = await recalcProject({ projectId: req.params.id, /* ... */ });
  return { estimatedEnd: r.estimatedEnd, estimates: r.estimates };
});
```

前端拿到的响应：

```json
{
  "estimatedEnd": "2026-10-29",
  "estimates": {}
}
```

`estimatedEnd` 正常，`estimates` 恒为空对象。服务端日志里这个字段有值、类型是 Map、条目数正确；同一个值一过 HTTP 边界就空了。因为状态码 200、也没有任何报错，第一反应是前端取字段的方式不对，排查方向在客户端绕了很久——直到在服务端直接 `console.log(JSON.stringify(r.estimates))`，输出就是 `{}`。

一行就能复现：

```js
JSON.stringify(new Map([['a', 1]]));        // '{}'
JSON.stringify(new Set([1]));               // '{}'
JSON.stringify({ m: new Map([['a', 1]]) }); // '{"m":{}}'
JSON.stringify(new Date('2026-01-05'));     // '"2026-01-05T00:00:00.000Z"'
```

前三个全空，只有 Date 正常。

## 根因：JSON.stringify 只遍历自有可枚举属性

`JSON.stringify` 对对象的序列化规则是：枚举对象**自有可枚举属性**（own enumerable properties），逐个转成 JSON 键值。Map 完全不满足这个前提——它的键值对存在 ECMAScript 规范定义的内部槽（[[MapData]]）里，访问要靠 `get`/`forEach` 这些方法，而不是属性。一个 Map 实例的自有可枚举属性数量是 **0**，所以 stringify 的输出是 `{}`。

Set 同理（内部槽 [[SetData]]），Date 则相反——它实现了 `toJSON()`，stringify 会优先调用它，所以拿到的是 ISO 字符串。

框架层不会救场。Fastify 的默认 JSON 序列化就是 `JSON.stringify`（未注册 fast-json-stringify schema 时），Express 的 `res.json` 同样。这不是哪个框架的 bug，是语言层行为——但 它决定了问题出现的**位置**不在计算层而在传输边界。

这个项目里计算函数返回 Map 是合理的：内部消费、键值语义、`get` 方便。坏在路由层把返回值**原样透传**给了 HTTP 响应，中间没有任何一层做「Map 不是合法 JSON 值」的检查——整条链路静默。

## 解决方案：在传输边界摊平

在响应离开服务器的边界处把 Map 显式摊平成普通对象，修法一行：

```ts
return {
  estimatedEnd: r.estimatedEnd,
  estimates: Object.fromEntries(r.estimates), // Map<string, T> → Record<string, T>
};
```

`Object.fromEntries` 输出的就是普通对象，前端拿到 `estimates.a.plannedEnd` 这类行级字段恢复正常。

比单点修复更重要的是把规则落在边界上：**路由层透传 core 返回值前，检查非 POJO 字段**。三个高频通性和对应转换：

| 类型 | stringify 输出 | 边界转换 |
|---|---|---|
| `Map<K, V>` | `{}` | `Object.fromEntries(map)` |
| `Set<T>` | `{}` | `[...set]` |
| `Date` | ISO 字符串（正常） | 不用动；要统一格式可 `.toISOString()` |

想从类型层根治的话，把跨边界的返回类型从 `Map<string, TaskEstimate>` 改成 `Record<string, TaskEstimate>`——TypeScript 会在编译期逼着每个构造点做选择，透传漏网会变成编译错误而不是线上空字段。

<InfoBox variant="warning" title="注意事项">

- 空对象不会报错、不会告警，接口测试还可能全绿——如果测试断言只查 `estimatedEnd` 不查 `estimates` 的条目数，这条会一直潜伏。给跨边界字段加「条目数 > 0」级别的断言。
- 嵌套结构里的 Map 同样变 `{}`，且藏得更深：`{ rows: [{ est: new Map() }] }` 里坏的是 `rows[].est`。排查时对可疑字段直接 `JSON.stringify` 一下最快。
- 深层嵌套的 Map 要递归摊平，`Object.fromEntries` 只处理最外层——这种结构建议在构造处就别用 Map。

</InfoBox>

JSON 序列化边界的「静默变形」不止 JS 这一例——Python 那边同族坑是 [json.dumps 用 default=str 兜底把 set 序列化成字符串](/blog/python-json-dumps-set-default-str)，`in` 判断退化成子串匹配静默出错。两篇共同的教训：序列化边界遇到非 JSON 原生类型，显式转换，永远别让兜底逻辑替你决定形态。

## 常见问题

### 为什么 JSON.stringify(new Map()) 返回空对象 {}？

JSON.stringify 只序列化对象的自有可枚举属性，而 Map 的键值对存在内部槽里，不是自有属性——可枚举属性数为 0，输出就是 `{}`。Map 嵌在对象里一样：`JSON.stringify({m: new Map([['a',1]])})` 得到 `{"m":{}}`。解法是序列化前用 `Object.fromEntries(map)` 摊平成普通对象。

### TypeScript 里 Map 字段经接口返回变空对象怎么解决？

类型系统帮不上忙——Map 是合法对象，JSON.stringify 也不报错，问题只在运行时序列化层。在返回给客户端的边界处把 Map 显式转成普通对象：`estimates: Object.fromEntries(r.estimates)`，或把类型改成 `Record<string, T>` 强迫自己在源头就用普通对象。

### Set 和 Date 序列化也会出问题吗？

Set 同样中招：`JSON.stringify(new Set([1]))` 是 `{}`，要展开成数组 `[...set]`。Date 不一样，它实现了 `toJSON()`，JSON.stringify 输出的是 ISO 字符串（如 `"2026-01-05T00:00:00.000Z"`），行为正常。一句话：JSON 原生类型之外，Map/Set 都要在序列化边界显式转换。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
