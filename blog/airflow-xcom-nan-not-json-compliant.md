---
title: "Airflow XCom 报 'Out of range float values are not JSON compliant'？pandas NaN 惹的祸"
description: "Airflow 任务在 ti.xcom_push 时崩溃 ValueError: Out of range float values are not JSON compliant: nan。根因：pandas 从 SQL NULL 转来的 NaN 被 XCom 的 json.dumps(allow_nan=False) 拒绝，JSON 标准不含 NaN。解法：push 前递归把 NaN/±Inf 转成 None。"
date: 2026-08-05
tags: [Airflow, pandas, JSON, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Airflow 报 Out of range float values are not JSON compliant 怎么解决？"
    a: "XCom 用 JSON 序列化，而 json.dumps(allow_nan=False) 拒绝 NaN/Infinity。在 xcom_push 前递归把 NaN/±Inf 转成 None（JSON null）即可。"
  - q: "为什么 Airflow 任务失败但自建 logs 表没有错误记录？"
    a: "若异常发生在 XCom 序列化阶段且未被任务的 catch 捕获，错误只进 Airflow 任务日志（容器内 /opt/airflow/logs/），不进应用自建 logs 表。排查时直接看 Airflow task log 的 traceback。"
  - q: "Airflow XCom 能不能直接存 pandas 的 NaN？"
    a: "不能。XCom 默认 JSON 序列化，JSON 标准没有 NaN/Infinity。需在 push 前把 NaN 转成 None，或换二进制对象序列化（不推荐，破坏可读性与跨进程兼容，且有反序列化风险）。"
---

在 Airflow 任务用 `ti.xcom_push()` 把 pandas 处理后的结果推给下游任务时，任务直接崩溃——`ValueError: Out of range float values are not JSON compliant: nan`，而且应用自建的 logs 表里找不到任何错误记录。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析流水线，Airflow DAG 从 SQL 取数、经 pandas 处理后，通过 XCom 在任务间传递结果。

## TL;DR

XCom 底层用 JSON 序列化，而 Airflow 调用 `json.dumps(..., allow_nan=False)` 严格遵循 JSON 标准——标准里压根没有 `NaN` / `Infinity`。pandas 从 SQL `NULL` 转来的浮点 `NaN` 一旦进了 `xcom_push` 的数据，序列化立即抛 `ValueError`。解法：在 push 前递归遍历数据，把 `NaN` / `±Inf` 转成 `None`（JSON `null`）。

## 问题现象

某次季度报表 DAG 失败，但症状很迷惑——应用自建的 `logs` 表里，该 trace 的步骤 1–4 全部正常，连「分析完成」都打了两次（重试），然后就断了，**步骤 5 缺失，且没有任何 error 行**：

```text
trace=91c126c3
├─ step 1  SQL 取数            ✅
├─ step 2  pandas 处理         ✅
├─ step 3  规则判定            ✅
├─ step 4  LLM 分析完成        ✅  ← 之后重试了一次
└─ step 5  XCom 推送结果       ❌  ← 缺失，无 error 记录
```

去 Airflow 任务日志才看到真正的 traceback：

```text
# 容器内 /opt/airflow/logs/dag_id=ai_analysis_v2/run_id=.../task_id=analyze_results/attempt=N.log
ValueError: Out of range float values are not JSON compliant: nan
  File ".../ai_analysis_tasks.py", line 142, in analyze_results
    ti.xcom_push(key='sql_metadata', value=result)
```

崩溃点精确落在 `ti.xcom_push`——任务把结果推给 XCom 的那一刻。

## 根因

三层叠加，缺一不可：

**1. JSON 标准不含 `NaN` / `Infinity`。** RFC 8259 定义的 JSON 只允许数字字面量是有限数。虽然 Python 的 `json.dumps` 默认会把 `NaN` 写成裸 `NaN`、把 `Infinity` 写成 `Infinity`，但这是 Python 的私有扩展，**不是合法 JSON**——任何严格 parser（包括 Airflow 用的）读到都会拒绝。

**2. Airflow XCom 序列化时显式 `allow_nan=False`。** XCom 默认走 JSON serializer，序列化时关闭了 NaN 容忍，遇到 `NaN` 直接抛 `ValueError: Out of range float values are not JSON compliant`，而不是偷偷写出非法 JSON。

**3. pandas 把 SQL `NULL` 读成 `NaN`。** `pandas.read_sql` 对 SQL 的 `NULL` 列返回 `float('nan')`。一旦这列参与计算后被 `to_dict('records')` 带进结果对象，`NaN` 就顺着数据流进了 `xcom_push`：

```python
import pandas as pd

# SQL 某行某列是 NULL → pandas 读成 NaN
df = pd.DataFrame({"ad_roi": [1.2, None, 0.8]})
records = df.to_dict("records")
# [{'ad_roi': 1.2}, {'ad_roi': nan}, {'ad_roi': 0.8}]   ← nan 混了进来

# 下游任务 push 时崩
ti.xcom_push(key="result", value=records)
# ValueError: Out of range float values are not JSON compliant: nan
```

这次之所以长期没触发，是因为平时跑的数据那些列都有值；直到某客户某个季度完全没有广告投放、`ad_roi` 整列 `NULL`，`NaN` 才第一次大规模进入 XCom 路径。

**为什么 logs 表没有 error？** 因为崩溃发生在 XCom 序列化阶段，处于任务函数的 `try/except` **之外**——异常直接冒泡给 Airflow 调度器，只写进 Airflow 自己的任务日志，应用层自建的 `logs` 表的 catch 根本没机会记录。这是这类故障最迷惑的地方：看起来「无声失败」。

## 解决方案

在数据进入 XCom 前，递归清洗掉所有 `NaN` / `±Inf`。

### 1. 写一个纯函数递归清洗

```python
import math

def json_safe_value(obj):
    """
    递归把 NaN / +Inf / -Inf 转成 None，使数据可被 JSON 严格序列化。
    兼容 dict / list / tuple / scalar，遇到未知类型原样返回。
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: json_safe_value(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe_value(v) for v in obj]
    return obj
```

为什么不能用 `df.fillna(None)`？因为 pandas 的 `fillna(None)` 在数值列上行为依版本和 dtype 不稳定，有时会把 `NaN` 强制转型而非置空；而且它只处理 DataFrame，管不到已经 `to_dict` 之后嵌在 dict/list 里的浮点。递归清洗在「数据已变成 Python 原生结构」这一层兜底，最稳。

### 2. 在 push 前统一兜底

最省心的做法是把清洗挂在所有 `xcom_push` 的必经之路上（比如一个归一化函数），而不是每个 push 点都记得调：

```python
def push_safe(ti, key, value):
    """XCom push 前清洗 NaN/Inf，杜绝序列化崩溃。"""
    ti.xcom_push(key=key, value=json_safe_value(value))

# 任务内
push_safe(ti, "sql_metadata", result)
push_safe(ti, "processor_output", processor_result)
```

### 3. 补上「无声失败」的可观测性

光修序列化还不够——异常发生在 catch 外、应用 logs 表不记录这个缺口要一起补。给任务挂一个失败装饰器，顶层异常先落库再 re-raise：

```python
import functools
import logging

logger = logging.getLogger(__name__)

def log_task_failure(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            logger.error("task %s failed", fn.__name__, exc_info=True)
            # 这里把 traceback 写进应用自建 logs 表
            raise
    return wrapper

@log_task_failure
def analyze_results(**context):
    ...
```

这样即使以后再出现 catch 外的异常，应用 logs 表也能留下 error 行，不再「无声失败」。

修完后重跑同一份 conf：DAG 全绿、落库 success，原本 `NaN` 的 `ad_roi` 在库里落成 `null`，下游正常。

同一条 Airflow 分析流水线上，让数据悄悄出问题的坑不止这一个——[PostgresHook 多语句 SQL 静默丢结果](/blog/2026/06/14/airflow-postgreshook-multistatement-sql-truncated)是另一个典型案例。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- **`json.dumps` 默认 `allow_nan=True` 会埋雷**：它会偷偷写出裸 `NaN` / `Infinity` 这个非法 JSON，当下游用严格 parser（如 Airflow XCom、JS 的 `JSON.parse`）读取时才崩。永远在序列化跨进程边界的数据时显式 `allow_nan=False` 提前暴露问题。
- **`±Infinity` 同样踩雷**：`float('inf')` / `float('-inf')` 和 `NaN` 一样被 JSON 标准排除，`json_safe_value` 要一并处理。
- **XCom 不止 JSON 一种 serializer**：Airflow 也支持二进制对象序列化，能存任意 Python 对象，但这种 XCom 不可读、不跨版本、且反序列化任意对象有安全风险，生产环境坚持用 JSON 并把数据清洗干净。
- **排查心法**：当 logs 表 trace 中断且无 error 行时，直接去 Airflow 任务日志（容器内 `/opt/airflow/logs/dag_id=.../task_id=.../`）找 traceback——「应用层无日志」不等于「没出错」。

</InfoBox>

## 常见问题

### Airflow 报 Out of range float values are not JSON compliant 怎么解决？

这是 XCom 用 `json.dumps(allow_nan=False)` 序列化时遇到了 `NaN` / `Infinity`，而 JSON 标准不含这两种值。根因通常是 pandas 把 SQL `NULL` 读成了 `float('nan')`，跟着数据流进了 `xcom_push`。解法是在 push 前递归把 `NaN` / `±Inf` 转成 `None`（JSON `null`），用一个 `json_safe_value` 纯函数统一兜底即可。

### 为什么 Airflow 任务失败但自建 logs 表没有错误记录？

如果异常发生在 XCom 序列化阶段、且位于任务函数的 `try/except` 之外，错误只会冒泡给 Airflow 调度器、写进 Airflow 任务日志（容器内 `/opt/airflow/logs/`），应用层自建的 logs 表的 catch 拿不到，于是表现为「无声失败」。排查这类情况要直接看 Airflow task log 的 traceback，别只盯应用日志。

### Airflow XCom 能不能直接存 pandas 的 NaN？

不能。XCom 默认走 JSON 序列化，而 JSON 标准只有有限数字，没有 `NaN` / `Infinity`。正确做法是 push 前把 `NaN` 转成 `None`（对应 JSON `null`）。换成二进制对象序列化虽能绕过类型限制，但结果不可读、不跨进程/版本、还有反序列化安全风险，生产环境不推荐。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
