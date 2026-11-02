---
title: "DeepSeek 缓存命中率低？先查 system 段里的每请求变化内容"
description: "DeepSeek 缓存命中率只有 28%：实测渲染序 system→tools→messages，system 里每请求变化内容会切断其后 23.7k 工具缓存；重排救回缓存却抖动输出——prompt 布局是行为面。"
date: 2026-11-03
tags: [DeepSeek, LLM, Prompt Cache, 成本优化]
authors: [cclee]
image: "/images/blog/deepseek-prompt-cache-render-order-pitfall-architecture.webp"
schema: FAQPage
faqs:
  - q: "DeepSeek 缓存命中率低怎么办？"
    a: "先查每请求变化的内容是否写在 system 段。实测渲染序是 system→tools→messages、前缀逐序匹配，system 里一个 token 变化就会切断其后全部工具定义缓存（我们实测约 23.7k token/次）。把动态内容移到 messages 层能救回命中率，但 prompt 重排要当行为变更对待——我们的一次纯缓存重排就让输出回归脏例从 0 涨到每轮 2.25 个，最终回滚。"
  - q: "DeepSeek 缓存命中率是什么意思？"
    a: "指 usage 里 prompt_cache_hit_tokens 占 prompt_tokens 的比例。命中部分按未命中价约 1/50 计费，命中率直接决定输入成本。我们单次请求输入 40.8k token、命中只有 28%，意味着七成以上输入在按全价计费。"
  - q: "prompt cache 命中率与哪些因素有关？"
    a: "核心是前缀稳定性：缓存按 system→tools→messages 顺序逐段比对，最前面变化的那一段就是断点，断点之后全部重算。所以召回内容、用户上下文、会话状态这些每请求变化的部分，都会抹掉后面的共享前缀；另外缓存条目有保留时长，长时间没有流量会自然失效，低频服务的命中率天然偏低。"
---

在一个 Node.js + TypeScript 的后端服务里，通过 OpenAI 兼容端点调用 DeepSeek 做结构化抽取时，输入成本居高不下——单次请求输入 40.8k token，缓存命中只有 28%，而命中部分的计价约为未命中的 1/50。也就是说，七成以上的输入在按全价付费。

这类服务的常规写法，是把系统指令、召回的参考内容、用户上下文统统拼进 system 段。问题就出在这里。

## TL;DR

- 用真实请求实测，DeepSeek 的渲染顺序是 **system → tools → messages**，缓存按这个顺序做前缀逐序匹配。system 段里任何一个每请求变化的字节，都会让排在它后面的约 23.7k token 工具定义缓存全部失效。
- 把动态内容迁到 messages、静态内容前置，命中率能救回来。但 prompt 布局同时是**行为面**：我们的一次纯「缓存重排」让输出回归的脏例从 0 涨到每轮 2.25 个，定向 A/B 证实因果后全量回滚。
- 结论：prompt 段序与指令位置不是纯性能参数。动它之前，先冻结行为判据基线。

## 问题现象：账单降不下来，命中率卡在 28%

API 返回的 usage 里带着缓存命中字段（这是排查的起点，先确认端点支持）：

```json
{
  "usage": {
    "prompt_tokens": 40800,
    "prompt_cache_hit_tokens": 11424
  }
}
```

`prompt_cache_hit_tokens` 除以 `prompt_tokens` 就是命中率。我们的抽取调用单次输入 40.8k token，命中率长期停在 28% 上下——无论怎么调采样参数，缓存未命中（cache miss）的比例就是下不去。按 DeepSeek 命中价约为未命中 1/50 的价差算，把命中率提上去是当时最直白的一笔省钱账。

## 根因：每请求变化的内容写进了 system 段

实测渲染序是 system → tools → messages，缓存按这个顺序做前缀逐序匹配——谁排在变化内容后面，谁的缓存就被切断。带着这个假设回头查，先排除两个好查的嫌疑：

1. **工具定义太大？** 工具定义是静态的，逐字节相同，理论上应该跨请求共享前缀——它自己不产生变化。
2. **端点不支持缓存？** usage 里有 `prompt_cache_hit_tokens` 字段，且同一段对话连续请求时命中会上涨——缓存机制工作正常，只是前缀很快被「污染」。

剩下的嫌疑只有请求里会变的部分。用 6 次真实请求逐段做试验（改一段、打一次、看命中断点），实测出渲染顺序：

```text
请求渲染顺序：  system  →  tools  →  messages
                          ↑
       前缀匹配逐序进行，断点落在最前面变化的那一段末尾：
       system 里有 1 个 token 变化，断点就在 system 结束处，
       其后的 tools（约 23.7k token）与 messages 全部按未命中计价。
```

我们的 system 段里混着三类每请求变化的内容：注入的召回参考块、用户上下文、会话状态。它们每一个都在刷新前缀，把后面 23.7k token 的工具定义一起拖下水。

<img src="/images/blog/deepseek-prompt-cache-render-order-pitfall-architecture.webp" width="560" loading="lazy" />

DeepSeek 的结构化调用还有一记闷棍——[调用成功却返回空](/blog/deepseek-thinking-empty-output-silent-fallback)，thinking 模式吃满输出预算；建议顺手一起排查。

## 重排实验：缓存救回来了，行为跟着抖了

重排把命中率救了回来，但行为回归判据把整个方案否决了。方案本身很标准——重建共享前缀：

```text
重排后的拼装顺序：
  system  = 静态指令 + 少样本示例        ← 逐字节不变，全用户共享
  tools   = 工具定义，静态前置           ← 紧跟静态段，前缀连续
  messages = 召回块 / 用户上下文 / 会话状态 ← 每请求变化的内容全放这里
```

缓存侧如预期改善。然后跑行为回归——固定的回放样本集，改动前后各跑一遍、比对输出是否落在预期形态内：

- **改动前基线**：3 轮回放共 315 次调用，0 脏例；
- **重排后**：同一判据下平均每轮冒出 2.25 个脏例——输出里固定格式的边界句开始不稳，同一类输入有时带格式、有时不带；
- **怀疑是测试抖动**：用 git worktree 挂旧 commit 双环境对照重跑，改动前依旧稳定为 0，差异确凿来自改动本身；
- **定向 A/B**：专挑 6 个边界句用例同题重放，0/6 → 2/6 翻转，把因果钉死在重排上；
- **折中方案**：只把模式指令保留在原位置、其余照排，3 轮仍累计 6 个脏例——没有安全的部分重排。

最终全量回滚，回归恢复全绿。回滚不是终点：缓存命中率的问题还在，我们把「重开需要什么证据」写进了排查记录——仅抽取链路的变体单独过判据、全量探针复测，缺一不启动。

这笔账怎么算：命中价差 1/50 很诱人，但省下的钱要和「输出质量回归」的排查成本、以及用户侧的体验抖动放在一起算。在行为判据补齐之前，这笔账不划算。

这套「prompt 面改动必须先过行为判据」的流程，已在 [Life 记账助手](/life) 的生产环境持续运行——自然语言记账健康助手，说人话就能记，同时追踪情绪与服药，端到端加密保护隐私。

<InfoBox variant="warning" title="注意事项">

- **「只动布局、不动语义」是错觉。** 指令位置的变化足以改变模型的输出纪律，缓存优化要当行为变更对待，走同一条回归闸。
- **重排前先冻结基线。** 固定的回放样本加判据，改动前后各跑同样本；没有基线，抖动和回归分不开。
- **缓存与行为分开验证。** 先只测缓存（同一请求连打、看命中上涨），再单独测行为，别混在一轮里互相污染结论。
- **缓存条目有保留时长**，长时间没有流量会自然失效。低频服务的命中率天然偏低，先确认流量形态再决定值不值得优化。

</InfoBox>

LLM 的输出本质不可控，我们在 [Function Calling 静默失败](/blog/llm-tool-calling-silent-failures) 里另有一份踩坑清单——枚举漂移与 prompt 膨胀，同样属于「不报错、只 quietly 变坏」的问题族。

## 常见问题

### DeepSeek 缓存命中率低怎么办？

先查每请求变化的内容是否写在 system 段。实测渲染序是 system→tools→messages、前缀逐序匹配，system 里一个 token 变化就会切断其后全部工具定义缓存（我们实测约 23.7k token/次）。把动态内容移到 messages 层能救回命中率，但 prompt 重排要当行为变更对待——我们的一次纯缓存重排就让输出回归脏例从 0 涨到每轮 2.25 个，最终回滚。

### DeepSeek 缓存命中率是什么意思？

指 usage 里 prompt_cache_hit_tokens 占 prompt_tokens 的比例。命中部分按未命中价约 1/50 计费，命中率直接决定输入成本。我们单次请求输入 40.8k token、命中只有 28%，意味着七成以上输入在按全价计费。

### prompt cache 命中率与哪些因素有关？

核心是前缀稳定性：缓存按 system→tools→messages 顺序逐段比对，最前面变化的那一段就是断点，断点之后全部重算。所以召回内容、用户上下文、会话状态这些每请求变化的部分，都会抹掉后面的共享前缀；另外缓存条目有保留时长，长时间没有流量会自然失效，低频服务的命中率天然偏低。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
