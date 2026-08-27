---
title: "DeepSeek / Qwen 结构化调用成功却返回空？显式关闭 thinking 防推理吃满输出预算"
description: "DeepSeek/Qwen 思考模型的推理段与正文共享 max_tokens 预算：thinking 吃满预算后 content 为空、解析失败静默重试降级。结构化输出调用必须显式关闭 thinking，排查先看 finish_reason。"
date: 2026-08-28
tags: [DeepSeek, LLM, Python, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "如何关闭 DeepSeek 的 thinking 输出？"
    a: "OpenAI 兼容接口通过 extra_body 传 thinking type disabled；Qwen 用 enable_thinking False。布尔判定、JSON 抽取这类结构化小输出调用不需要推理链，默认关掉最稳。"
  - q: "为什么 DeepSeek API 调用成功但返回空内容？"
    a: "思考模型的推理段与正文共享 max_tokens，预算被推理吃满后 finish_reason 返回 length、content 为空且不抛异常。关闭 thinking 或调大 max_tokens，排查时先看 finish_reason。"
---

在对生产数据批量跑 LLM 语义校验时，2449 次调用全部「成功」返回，但结果全部降级为默认值，日志里几乎没有失败记录。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。商品标题优化链路里，需要让 LLM 对「关键词 × 商品」组合做语义校验：每批词一次调用，只返回一个小小的 JSON 判定。这本该是最简单的一类 LLM 调用，结果首跑 2449 对全部走了兜底降级，Layer2 一次有效 LLM 判定都没产生。

## TL;DR

DeepSeek / Qwen 等思考模型的**推理文本与正文共享同一份 `max_tokens` 预算**。结构化小输出调用如果不显式关闭 thinking，推理链会独自吃满预算：`finish_reason` 变 `length`、`content` 返回空字符串，而解析失败的重试循环又只记异常不记解析错误——静默重试耗尽后整体降级，全程不报一条错。两件事要做：**结构化调用显式关闭 thinking**；**解析失败时先记 `finish_reason`**，别只 catch 异常。

## 问题现象

下面这段最小复现代码展示了整个过程（需要 `pip install openai` 和一个支持 thinking 的模型）：

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
)

resp = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {
            "role": "user",
            "content": (
                '判断下面的关键词是否适合写入商品标题，'
                '只返回 JSON：{"suitable": true} 或 {"suitable": false}。\n'
                "关键词：summer women dress\n"
                "商品：floral midi dress for women"
            ),
        }
    ],
    max_tokens=2000,  # 推理段与正文共享这份预算
)

print("finish_reason:", resp.choices[0].finish_reason)
print("content:", repr(resp.choices[0].message.content))
```

thinking 开启时的典型输出：

```text
finish_reason: length
content: ''
```

HTTP 层一切正常：没有超时、没有 5xx、SDK 不抛异常。如果外层是「解析失败就重试、重试耗尽就兜底」的循环，日志里最后只会留下一条「重试耗尽」的 warning——看起来就像偶发网络问题。

## 根因

**思考模型的推理段不单独计预算。** DeepSeek、Qwen 等模型的思考内容（reasoning content）与最终正文共用 `max_tokens` 这一个上限，没有独立的「推理预算」字段。

**结构化小输出调用的预算往往设得小。** 一个布尔判定预期输出只有几十个 token，`max_tokens` 给到 2000 已经绰绰有余——但推理链的长度完全不可控，一旦它先吃掉 2000 个 token，模型就再也没有机会输出正文：`finish_reason` 返回 `length`，`content` 是空字符串，接口却正常返回 200。

**工程侧还有一个放大器。** 空字符串不是合法 JSON，但很多重试循环只 catch 网络与 API 异常，解析失败被当成「这一轮没结果」静默重试。这类[吞掉异常的静默失败](/blog/python-try-except-swallow-exception-silent-failure)在重试循环里尤其难查：重试 N 次全部是同一个根因，日志里却只有最后一条兜底 warning，极易误判为网络抖动。

## 解决方案

### 第一步：结构化输出调用显式关闭 thinking

布尔判定、JSON 抽取、分类打标这类调用不需要多轮推理，按供应商传参关闭：

```python
def thinking_disabled_extra_body(provider: str) -> dict:
    """结构化小输出调用：按供应商显式关闭 thinking。"""
    if provider == "deepseek":
        return {"thinking": {"type": "disabled"}}
    if provider == "qwen":
        return {"enable_thinking": False}
    return {}


resp = client.chat.completions.create(
    model=model_name,
    messages=messages,
    max_tokens=2000,
    extra_body=thinking_disabled_extra_body("deepseek"),
)
```

关闭之后，2000 token 预算全部留给 JSON 判定本身。实测修复后重跑，2449 个词×商品对全部正常返回判定结果——而修复前整批静默降级，日志里只有 3 条「重试耗尽」warning。

### 第二步：别让解析失败静默发生

即使关掉了 thinking，也要把「解析失败」变成一条带证据的日志，下次任何原因导致的空输出都能在一条日志里定位：

```python
import json
import logging

logger = logging.getLogger(__name__)


def parse_judgment(resp) -> dict | None:
    content = resp.choices[0].message.content
    try:
        return json.loads(content)
    except (TypeError, json.JSONDecodeError):
        # 关键：记录 finish_reason 与原始 content，而不是只记异常
        logger.warning(
            "LLM 输出解析失败: finish_reason=%s content=%r",
            resp.choices[0].finish_reason,
            content,
        )
        return None
```

排查 LLM 降级时，先看 `finish_reason`：`length` 说明输出预算被打满（大概率是推理占的），`stop` 才是正常结束。这一步比翻异常日志有效得多。

如果你的返回 JSON 还要过一层 schema 校验，在 TypeScript 项目里用 Zod 时留意另一个[校验 LLM 输出静默丢字段](/blog/zod-strict-llm-output-silent-drop)的坑。

<InfoBox variant="warning" title="注意事项">
各供应商关闭 thinking 的参数并不统一：DeepSeek 用 `{"thinking": {"type": "disabled"}}`，Qwen 用 `{"enable_thinking": False}`，OpenAI o 系列则是 `reasoning_effort` 相关参数。接入新供应商前先查文档，别假设参数通用。

如果某供应商的 thinking 无法关闭，就必须按实测推理长度调大 `max_tokens`，否则同样的静默降级还会发生。
</InfoBox>

## 常见问题

### 如何关闭 DeepSeek 的 thinking 输出？

OpenAI 兼容接口通过 `extra_body` 传 `{"thinking": {"type": "disabled"}}`；Qwen 用 `{"enable_thinking": False}`。布尔判定、JSON 抽取这类结构化小输出调用不需要推理链，默认关掉最稳，预算全部留给正文。

### 为什么 DeepSeek API 调用成功但返回空内容？

思考模型的推理段与正文共享 `max_tokens`，预算被推理吃满后 `finish_reason` 返回 `length`、`content` 为空，且不抛任何异常。关闭 thinking 或按实测推理长度调大 `max_tokens`，排查时先看 `finish_reason` 再看异常日志。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
