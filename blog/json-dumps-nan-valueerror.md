---
title: "pandas NaN 让 json.dumps 报错？异常炸在你的 try 之外"
description: "pandas 的 NaN 是合法 float，json.dumps 却抛 ValueError——异常炸在框架序列化层，业务 try 拦不住。跨边界前递归清洗 NaN/±Inf→None。"
date: 2026-09-28
tags: [Python, JSON, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "json.dumps 遇到 NaN 为什么报 ValueError？"
    a: "JSON 规范没有 NaN/Infinity；allow_nan=False 开启严格模式后遇到它们即抛 ValueError: Out of range float values are not JSON compliant。默认 allow_nan=True 会输出非法 JSON 的 NaN 字面量，埋给下游。"
  - q: "pandas 的 NaN 怎么转成 null 再序列化？"
    a: "递归遍历数据结构，把 float 类型的 NaN 和 ±Inf 替换为 None 再 dumps；pandas 层可用 df.where(df.notna(), None) 或 to_json（自带 NaN→null）。结论：清洗要在序列化边界前做，别指望 json 模块替你转。"
  - q: "JSON 为什么不支持 NaN 和 Infinity？"
    a: "JSON 规范（RFC 8259）的数字语法只覆盖有限数，NaN/Infinity 不是合法值。Python json 默认放行输出了 NaN 字面量，属于对规范的宽松扩展——下游严格解析器会拒绝。"
---

数据管道里一个任务跑到一半戛然而止：日志的 trace 停在中间步骤，没有任何 error 记录，仿佛进程凭空消失。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。分析任务从 pandas 数据起步、以 JSON 落库收尾，NaN 是这条路上最常见的隐形地雷。

## 问题现象：trace 中断，无 error 记录

任务状态是失败，但业务日志里找不到任何报错——trace 走到某一步就没了下文。异常确实发生了，只是它**炸的位置不在你的 try 覆盖范围内**：排查发现是 `ti.xcom_push` 内部做 JSON 序列化时抛的错，而 xcom_push 这一行在业务 try 块之外（即便包进去，框架内部更深层的序列化点也照样在你的 catch 半径之外）。

真身是这个报错：

```text
ValueError: Out of range float values are not JSON compliant: nan
```

如果你搜的是「json.dumps NaN 报错」「Out of range float values are not JSON compliant」「任务日志中断无 error」，都是同一类问题。

## 根因：NaN 是 Python 的合法 float，JSON 却不认识它

两套规则在这里错位。实测行为矩阵：

```python
import json, math

# NaN 在 Python 世界畅通无阻
isinstance(float('nan'), float)   # True —— 合法 float
float('nan') == float('nan')      # False —— 连等号都测不出来

# JSON 世界：默认宽松，严格模式直接抛
json.dumps(float('nan'))                      # 'NaN'（非法 JSON 字面量！）
json.dumps(float('nan'), allow_nan=False)     # ValueError: Out of range float values...
json.dumps(math.inf, allow_nan=False)         # ValueError（±Inf 同罪）
```

三个要点：

- **JSON 规范（RFC 8259）的数字语法不含 NaN/Infinity**。Python json 模块默认 `allow_nan=True`，遇到 NaN 输出 `NaN` 字面量——这是对规范的宽松扩展，产出的字符串下游严格解析器会拒绝。坑分两层：要么现在炸（严格模式），要么埋给下游炸（宽松模式）。
- **NaN 骗过常规判空**。它不是 None、不是 0、`==` 自己都返回 False——`if not value` 一类的卫语句统统放行，数据一路走到序列化层才爆。
- **爆点在框架代码里**。业务代码把 dict 交给 `xcom_push`、日志 SDK、HTTP 客户端——序列化发生在这些框架内部，深于你的 try/catch 半径。这解释了「trace 中断且无 error 记录」：异常没进你的日志埋点，直接把 task 掀翻。

## 解决方案：边界前递归清洗，兜底交给任务级钩子

两道防线。第一道在数据侧——跨 JSON 边界之前递归清洗，NaN 和 ±Inf 一律转 None：

```python
import math

def json_safe(value):
    """递归把 NaN/±Inf 转成 None，其余原样返回。"""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    return value

import json
payload = json_safe(result_dict)
json.dumps(payload, allow_nan=False)   # 现在永不抛
```

清洗之后仍保留 `allow_nan=False`——它从「炸雷」变成「哨兵」：万一有漏网的非法值，在自家代码里抛出来，好过流到下游。

第二道在框架侧——给任务挂失败钩子，把 catch 外的异常也落进日志体系（Airflow 场景用 task failure callback 或装饰器包住整个 task callable），保证「trace 中断无 error」变成「trace 末端有 error」。排查存量问题时，去 Airflow 任务日志翻 traceback（容器内 `logs/dag_id=.../task_id=.../attempt=N.log`）比翻业务日志快。

## 边界与变体

- **pandas 自带的 `to_json` 会在输出层把 NaN 转 null**，如果整条链路用它输出，可以不清洗；但数据一旦转成 dict 再走 json.dumps，就得自己清洗——坑出现在「换序列化器」的那一刻。
- **`NaN == NaN` 为 False**，去重、断言、测试里的相等比较都会被它骗；判 NaN 只能用 `math.isnan`。
- **numpy 数组直接 dumps 也会炸**（ndarray 不是 JSON 可序列化类型），先 `.tolist()`；tolist 之后 NaN 还在，清洗逻辑依然需要。
- 数值语义上 NaN→null 是一次有损转换（「测量失败」变成「没有值」），下游如果依赖这个区分，应另立字段标注，而不是硬转。

<InfoBox variant="warning" title="注意事项">

- **判 NaN 只用 `math.isnan`**，任何基于 `==`、`if not x` 的判断都不可靠。
- **清洗放在序列化边界前统一做一次**，别在每个调用点各自为战——漏一个调用点就复现一次。
- **严格模式（allow_nan=False）当哨兵用**：清洗后仍报错说明有漏网数据，这是好信号。
- **框架兜底钩子（failure callback）不是可选品**：它能接住你今天想不到的、明天一定出现的「catch 之外的异常」。

</InfoBox>

## 常见问题

### json.dumps 遇到 NaN 为什么报 ValueError？

JSON 规范没有 NaN/Infinity；`allow_nan=False` 开启严格模式后遇到它们即抛 `ValueError: Out of range float values are not JSON compliant`。默认 `allow_nan=True` 会输出非法 JSON 的 NaN 字面量，埋给下游。

### pandas 的 NaN 怎么转成 null 再序列化？

递归遍历数据结构，把 float 类型的 NaN 和 ±Inf 替换为 None 再 dumps；pandas 层可用 `df.where(df.notna(), None)` 或 `to_json`（自带 NaN→null）。结论：清洗要在序列化边界前做，别指望 json 模块替你转。

### JSON 为什么不支持 NaN 和 Infinity？

JSON 规范（RFC 8259）的数字语法只覆盖有限数，NaN/Infinity 不是合法值。Python json 默认放行输出了 NaN 字面量，属于对规范的宽松扩展——下游严格解析器会拒绝。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
