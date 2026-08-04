---
title: "用 Zod 校验 LLM 输出却静默失败？别用 .strict()"
description: "用 Zod 给 LLM 的 tool_call / function call 输出做校验，模型偶尔多吐一个字段就整条失败、动作被静默丢弃，用户只收到一句没识别到。根因：.strict() 对未知键报错，而 LLM 输出不可控。解法：去掉 .strict() 用默认 strip 容错，配 safeParse 兜底。"
date: 2026-08-05
tags: [Zod, LLM, TypeScript, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 Zod .strict() 会让 LLM 输出校验失败？"
    a: ".strict() 要求对象不含任何未知键，多一个就报错。LLM 的 function call 输出是模型生成的，常会填入它以为该有的字段，触发 unknown key 错误导致整条校验失败。"
  - q: "用 Zod 校验 LLM function calling 输出应该用 strict 吗？"
    a: "不建议。strict 适合校验你完全控制的客户端，LLM 输出不可控。去掉 .strict() 用默认 strip（静默删除未知键）容错性更好，或用 .passthrough() 保留未知字段。"
  - q: "Zod 默认对未知字段是 strip 还是报错？"
    a: "默认是 strip，静默删除未知键不报错；.strict() 改为报错；.passthrough() 改为保留。校验 LLM 输出推荐用默认 strip 或 passthrough，避免 strict。"
---

用 Zod 给 LLM 的 `tool_call` / function call 输出做校验，模型偶尔多吐一个字段——比如你只定义了 `amount` / `category`，它顺手填了个 `note`——整条校验就挂了，动作被**静默丢弃**，用户只收到一句「没识别到」，实则是一条 `tool_call` 被 whole-reject。

在开发 [Life 记账助手](https://life.ccleeai.com) 时遇到此问题——自然语言记账健康助手，说人话就能记，AI 自动抽取金额、类目、账户；用户说「删掉昨天那杯咖啡」时，模型在 delete locator 里多塞了个 `note: "咖啡"` 想按备注定位。

## TL;DR

Zod 的 `.strict()` 等于「对象不许有任何未知键，多一个就报错」。这套约束适合校验**你完全控制的客户端**，但 LLM 的 function call 输出是模型生成的、本质不可控——它会填入自己「以为该有」的字段，尤其当多个 tool 共用相似 schema 时。一个无关字段就把整条 `tool_call` 杀掉，校验返回 null，动作静默丢失。解法：**去掉 `.strict()`，用 Zod 默认的 strip（静默删除未知键）容错**，配合 `safeParse` 兜底。

## 问题现象

delete/update 的 locator schema 定义了几个已知字段，但用 `.strict()` 收紧：

```typescript
import { z } from "zod";

// ❌ 危险：带 .strict()
const LocatorSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  noteContains: z.string().optional(),
}).strict();   // ← 未知键一律报错

// 解析 LLM 的 tool_call 参数
function parseToolCall(raw: unknown) {
  const parsed = LocatorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;   // ← 整条 tool_call 被丢弃
  }
  return parsed.data;
}
```

用户说「删掉昨天那杯咖啡」，模型给出（合理但多了一个字段的）输出：

```json
{
  "date": "昨天",
  "noteContains": "咖啡",
  "note": "咖啡"
}
```

模型同时填了 `noteContains`（schema 内）和 `note`（schema 外，它以为该有）。`.strict()` 对 `note` 这个未知键直接判失败，`parseToolCall` 返回 `null`，这条 delete 动作被**静默丢弃**——用户收到「没识别到」，实际是被整条拒绝。

## 根因

**`.strict()` 改的是 Zod 对未知键的策略，而 LLM 输出天然会带未知键。**

Zod `z.object()` 对未知键有三种策略：

| 写法 | 未知键行为 | 适合场景 |
|------|-----------|---------|
| 默认（strip） | 静默删除 | LLM 输出、宽松外部输入 |
| `.strict()` | **报错**（unknown key） | 你完全控制的客户端 API |
| `.passthrough()` | 保留原样 | 下游要用未知键时 |

`.strict()` 的设计意图是「契约严格性」——服务端定义了什么字段，客户端就该只给什么，多给即违约。这套逻辑对传统 API 成立，因为客户端是开发者写的、可以要求守约。

但 LLM function calling 颠覆了这个前提：

1. **输出来自模型生成，不是开发者写的客户端。** 模型基于 schema 的 description 和示例猜测该填什么，跨域复用的 schema（比如 locator 在 budget / mood / todo 多个域共用）更会让它混淆，填入「它以为该有」的字段。
2. **字段填错是常态，不是异常。** 模型偶尔多吐一个 `note`、少吐一个可选字段，是 LLM 应用的预期行为，不该用「整条失败」来惩罚。
3. **失败被静默吞掉。** `safeParse` 失败后返回 null，上游拿到 null 只能笼统地说「没识别到」，真正的根因（一个 unknown key）藏在 `parsed.error` 里没人看。

```text
LLM 输出 { date, noteContains, note }
                        │
                        ▼
         .strict() 遇到未知键 note
                        │
                        ▼
           safeParse → { success: false }
                        │
                        ▼
          parseToolCall 返回 null（动作丢弃）
                        │
                        ▼
        用户收到「没识别到」（实则 whole-reject）
```

## 解决方案

### 1. 去掉 `.strict()`，用默认 strip 容错

```typescript
// ✅ 推荐：不带 .strict()，Zod 默认 strip 未知键（静默删除）
const LocatorSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  noteContains: z.string().optional(),
});
// 模型多吐的 note 会被静默删掉，已知字段照常解析
```

去掉 `.strict()` 后，「删掉昨天那杯咖啡」正常解析为 `{ date, noteContains }`，多余的 `note` 被 strip，delete 动作正确执行。

### 2. 如果未知键本身有用，用 `.passthrough()` 显式保留

当模型多吐的字段其实承载了你想用的语义（比如它填 `note` 是想表达「按备注定位」），别丢，保留下来再决定怎么消费：

```typescript
const LocatorSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  noteContains: z.string().optional(),
}).passthrough();   // 保留未知键，parsed.data.note 仍可读
```

更好的做法是把它收编成已知字段——发现模型反复填某个未知键，说明 schema 缺了这个能力位，补上（比如这里的 `noteContains` 就是收编「按备注定位」需求后新增的）。

### 3. 失败要可观测，别静默返 null

无论哪种策略，`safeParse` 失败时都要把具体的 `error` 落日志，而不是吞成 null：

```typescript
function parseToolCall(raw: unknown) {
  const parsed = LocatorSchema.safeParse(raw);
  if (!parsed.success) {
    // 把 Zod 的具体报错（哪个键、什么问题）落日志，便于定位
    logger.warn(
      { raw, issues: parsed.error.issues },
      "locator parse failed"
    );
    return null;
  }
  return parsed.data;
}
```

这样真出问题时，日志里有完整的 `issues`（含 unknown key 的路径），而不是一句无从下手的「没识别到」。

修完后，「删掉昨天那杯咖啡」→ `delete_record { locator: { noteContains: "咖啡" } }` 正确解析，不再静默丢失。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- **`.strict()` 适合校验「你控制的客户端」，不适合「LLM 生成的输出」。** 判断标准：数据来源是你写的代码 → 可以 strict；数据来源是模型生成 → 用默认 strip 或 passthrough。
- **strip 会丢失未知字段。** 如果那个字段承载了模型的意图（如例子里的 `note`），用 `.passthrough()` 保留，或直接收编成已知字段，别让意图被静默删掉。
- **永远用 `safeParse` 而非 `parse`。** `parse` 校验失败会抛异常，在 tool 调度链里可能中断整个流程；`safeParse` 返回结果对象，失败可控。
- **LLM tool schema 设计要给容错空间。** 字段尽量 `.optional()`、description 写清用途、提供 few-shot 示例；预期到模型会「多填/少填」，schema 层就该兜得住。

</InfoBox>

## 常见问题

### 为什么 Zod .strict() 会让 LLM 输出校验失败？

`.strict()` 要求对象不含任何未知键，多一个就抛 unknown key 错误。LLM 的 function call 输出是模型基于 schema description 猜测生成的，常会填入它「以为该有」的字段（尤其跨域复用的 schema），一旦命中未知键，`.strict()` 就让整条校验失败、整个 tool_call 被丢弃。

### 用 Zod 校验 LLM function calling 输出应该用 strict 吗？

不建议。`.strict()` 适合校验你完全控制的客户端（开发者写的代码可以要求守约），但 LLM 输出不可控、多填少填是常态。去掉 `.strict()` 用 Zod 默认的 strip（静默删除未知键）容错性更好；如果未知键承载了想用的语义，用 `.passthrough()` 保留，或直接收编成已知字段。

### Zod 默认对未知字段是 strip 还是报错？

默认是 strip——静默删除未知键、不报错；`.strict()` 改为遇到未知键就报错；`.passthrough()` 改为保留未知键原样。校验 LLM 这类不可控输出时推荐默认 strip 或 passthrough，避免 `.strict()` 因一个无关字段杀掉整条数据。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
