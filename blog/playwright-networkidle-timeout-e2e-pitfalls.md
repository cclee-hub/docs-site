---
title: "Playwright E2E 两个静默坑：networkidle 恒超时与日期比对恒空"
description: "Playwright 走查脚本 networkidle 30 秒超时、日期比对恒 false？两个零报错静默失败：401 续期循环让网络永不空闲，UTC 存储让日期永不相等，附排查判据与修复代码。"
date: 2026-09-29
tags: [Playwright, E2E, Prisma, Bug修复]
authors: [cclee]
image: "/images/blog/playwright-networkidle-timeout-e2e-pitfalls.webp"
schema: FAQPage
faqs:
  - q: "Playwright page.goto networkidle 一直超时怎么办？"
    a: "先确认页面是否挂了静默请求循环——401 自动续期、定时轮询、失败自动重试都会让网络永远凑不出 500ms 空窗，waitUntil: 'networkidle' 必然在 30 秒超时。用 curl 带当前 token 打一个鉴权接口，返回 401 即坐实 token 过期；修法是把 token 现签和整轮走查串在同一条命令里，全程控制在 token TTL（本文案例 15 分钟）内完成。"
  - q: "为什么 toISOString().slice(0,10) 和当天日期不相等？"
    a: "toISOString() 恒输出 UTC：东八区用户在上海时间 0 点到 8 点之间运行代码，UTC 日期仍是前一天，slice 出来的字符串和本地今天差一天。若比对的是 ORM 存储的 UTC 日期字段，则恒差 8 小时、永不相等。修法是统一口径：把比对键转成 UTC 表示（new Date(todayKey + 'T00:00:00+08:00').toISOString().slice(0,10)），或两侧都显式带时区。"
---

在给一个登录态应用写 Playwright E2E 走查脚本时，用 `waitUntil: 'networkidle'` 打开页面，30 秒后抛 TimeoutError——而页面在浏览器里明明秒开。同一天，另一个按日期过滤记录的走查脚本，查「今天」的数据永远为空，连一个报错都没有。

这是一个 React + Node.js + Prisma 的登录态全栈 Web 应用——下面两个坑都出在它的自动化走查脚本里。

**TL;DR**

- **networkidle 恒超时 ≠ 页面慢**：token 过期后，前端的 401 单飞续期（single-flight refresh）会自动换新 token 并重放请求，网络永远凑不出 500ms 无请求空窗。修法：跑闸（整轮回归走查）前现签 token，并和跑闸串在同一条命令里。
- **日期比对恒 false ≠ 没数据**：Prisma 返回的 date 是 UTC 表示，拿它 slice 出的字符串和本地日历日永不相等。修法：比对键换算成 UTC 表示再 slice。

## 场景一：networkidle 一直超时？根因：401 静默续期循环

`page.goto` 配 `waitUntil: 'networkidle'` 一直超时，多数不是页面慢，而是有请求在静默循环——登录态应用里的 401 自动续期就是最典型的一个。

### 问题现象

```ts
await page.goto(url, { waitUntil: 'networkidle' });
// TimeoutError: page.goto: Timeout 30000ms exceeded.
```

页面本身 HTTP 200，浏览器打开秒开，换网络、绕过代理都无效——典型的「像环境问题」。而且只在走查中间穿插了较长的手工步骤后必现，重签 token 又立刻消失。

### 根因：token 过期，续期循环让网络永不空闲

三层因果，一层层叠出来的：

1. access token 是短 TTL 的（本项目 15 分钟）。走查中间穿插写配置、改数据等手工步骤，一超 15 分钟，脚本携带的 token 就过期了。
2. 前端为登录态做了 401 单飞续期（single-flight refresh）：任何请求收到 401，拦截器先去换新 token，再把原请求原样重放。对用户透明——会话过期只会被默默续上，不会被踢出。
3. 这套机制恰好是 networkidle 的天敌：每次失败的请求都会立刻产生一次重放请求，网络永远凑不出「至少 500ms 无连接」的空窗。等待器等满 30 秒，超时。

<img src="/images/blog/playwright-networkidle-timeout-e2e-pitfalls.webp" alt="401 单飞续期循环让 networkidle 永不空闲，30 秒超时" width="560" loading="lazy" />

### 排查判据：一条 curl 让它亮牌

我们的第一反应也是环境问题：页面 200、本地浏览器一切正常，一度怀疑代理或 DNS。最后是拿脚本当前持有的 token，打一个任意的鉴权接口：

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  https://your-app.example.com/api/whoami
# 输出 401 → token 过期，坐实
```

401 一出现，整条链就通了：token 过期 → 前端续期重放 → 网络永不空闲 → networkidle 超时。

### 解决方案：现签 token，和跑闸串在同一条命令

```bash
TOKEN=$(curl -s -X POST https://your-app.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ci","password":"***"}' | jq -r .accessToken) \
&& node e2e-check.mjs
```

要点只有一条：现签与跑闸之间不能隔人工步骤。我们踩的第二次复发，就是把签名和跑闸拆成了两条命令——中间改了会儿代码，再跑时拿的还是 15 分钟前签的 token，原样再踩一遍。把签名助手直接嵌进走查脚本入口之后，这类超时没有再出现过。

<InfoBox variant="warning" title="注意事项">

- 前端若没有自动续期，同样的症状还可能来自定时轮询、心跳、失败自动重试——任何「失败后自动再发一次」的机制都会喂出这个症状，排查思路相同：先证明有请求在循环。
- Playwright 官方文档已把 networkidle 标注为 discouraged（不推荐），建议用 web assertions 判断页面就绪。确有「等网络彻底安静」的需求时，给整段逻辑配 token 保活或超时熔断，别让它裸等。

</InfoBox>

## 场景二：日期过滤恒空？根因：toISOString 输出的是 UTC 日期

走查脚本按「今天」过滤记录却查不到数据、结果恒为空且零报错——因为记录的日期字段是 UTC 表示，和本地日历日永不相等。

### 问题现象

```ts
const todayKey = new Date().toLocaleDateString('en-CA', {
  timeZone: 'Asia/Shanghai',
});
// '2026-09-29'

const todays = records.filter((r) => r.date.slice(0, 10) === todayKey);
// todays 恒为空 —— 没有任何报错
```

其中 `r.date` 来自 Prisma 的返回值，长这样：`2026-09-28T16:00:00.000Z`。

### 根因：DTO 里的「日期」是上海日零点的 UTC 午夜表示

1. Prisma 对 PostgreSQL 的 naive timestamp 按 UTC 存取。「上海 9 月 29 日」这条记录，存储值是 `2026-09-28T16:00:00.000Z`——UTC 的 9 月 28 日 16 点，即上海时间 9 月 29 日零点。
2. `slice(0, 10)` 取的是 UTC 日历日 `'2026-09-28'`，而 `todayKey` 是上海日 `'2026-09-29'`。两个键口径不同，永不相等。
3. 最麻烦的是它零报错：过滤逻辑「看起来在正常执行」，只是永远空。表象极具欺骗性——我们当时先看到的是走查起点的残留记录跨 run 累积（「当日记录预清」恒空转，该清的没清），一路追下来才发现不是数据丢了，是比对键口径错了。之后另一个自写脚本按同样的 slice 比对，同样恒空——第二处独立复现，坐实根因在比对键，不在数据。

### 解决方案：比对键换算成 UTC 表示再比

```ts
// 把上海日零点转成 UTC 表示，取它的 UTC 日历日
const todayKeyUtc = new Date(todayKey + 'T00:00:00+08:00')
  .toISOString()
  .slice(0, 10);
// '2026-09-28' —— 和 DTO 的存储表示同口径

const todays = records.filter((r) => r.date.slice(0, 10) === todayKeyUtc);
```

两侧现在都是「UTC 日历日」，比对成立。注意偏移写的是 `+08:00`（业务时区），不要依赖机器本地时区——脚本可能在任何 TZ 的环境里跑，显式偏移是唯一确定的做法。

### 边界与变体

- 同一个根因在 SQL 侧是另一副面孔：对 UTC 时间列套一层 `AT TIME ZONE` 再做窗口过滤，等于把 UTC 值按墙钟又解释了一次，检索窗口整体偏 8 小时，按时间窗对账会假阴性。两侧解法同构：先统一到 UTC 基准，再做换算。
- 反方向也有同款：用 `new Date().toISOString().slice(0, 10)` 取「今天」，在上海时间 0 点到 8 点之间拿到的还是昨天的 UTC 日期。凡是日期字符串比对，先问三个值各是什么时区口径——存储值、比对键、显示值。

<InfoBox variant="warning" title="注意事项">
这类坑的特征是「零报错 + 可复现 + 表象是数据丢了」。过滤恒空时，先打印两侧比对键的实际值再查数据——多数情况下数据一直都在，是键的口径不一致。
</InfoBox>

## 共同点：零报错的静默失败

两个坑都没有报错——一个「只是超时」，一个「只是没查到」，第一反应都是环境问题。两个修法如今都常驻在 [Life](/life) 的自动化走查里——Life 是一款自然语言记账健康助手，说人话就能记，AI 自动抽取金额、类目、账户，端到端加密保护隐私。同一类静默失败此前还出现过两次：[Zod .strict() 校验 LLM 输出整条被静默丢弃](/blog/zod-strict-llm-output-silent-drop)，以及[微信小程序识图全失败的静默坑](/blog/wx-promise-wrapper-object-object)——Promise 包装器把整个结果对象 String() 成 `[object Object]`，同样零报错、只有静默的空结果。这类问题的通用抓手，是给「空」找一个能亮牌的判据：401 判据、比对键值打印，让故障在第一现场显形，而不是靠猜。

## 常见问题

### Playwright page.goto networkidle 一直超时怎么办？

先确认页面是否挂了静默请求循环——401 自动续期、定时轮询、失败自动重试都会让网络永远凑不出 500ms 空窗，`waitUntil: 'networkidle'` 必然在 30 秒超时。用 curl 带当前 token 打一个鉴权接口，返回 401 即坐实 token 过期。修法是把 token 现签和整轮走查串在同一条命令里，全程控制在 token TTL（本文案例 15 分钟）内完成。

### 为什么 toISOString().slice(0,10) 和当天日期不相等？

`toISOString()` 恒输出 UTC：东八区用户在上海时间 0 点到 8 点之间运行代码，UTC 日期仍是前一天，slice 出来的字符串和本地今天差一天。若比对的是 ORM 存储的 UTC 日期字段，则恒差 8 小时、永不相等。修法是统一口径：把比对键转成 UTC 表示（`new Date(todayKey + 'T00:00:00+08:00').toISOString().slice(0,10)`），或两侧都显式带时区。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
