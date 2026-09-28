---
title: "Airflow 触发 DAG 没跑？重复 logical_date 被 409 拒绝"
description: "重复用同一 logical_date 调 Airflow 触发 API 会吃 409，DAG 没跑，响应体无 dag_run_id。触发要换新 logical_date，调用方必须校验响应含 dag_run_id 才算成功。"
date: 2026-09-28
tags: [Airflow, API, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Airflow 用 API 重复触发 DAG 会怎样？"
    a: "被唯一约束拒绝：实测重复 logical_date 触发返回 HTTP 409（Unique constraint violation），响应体无 dag_run_id，DAG 不会运行。调用方只打日志不看响应就会静默失败。"
  - q: "为什么 Airflow dagRun 触发了却没实际运行？"
    a: "最常见原因是重复 logical_date：Airflow 按 (dag_id, logical_date) 唯一约束拒绝重复 run，请求被 409 拒绝但调用方没校验。结论：收到响应后必须确认响应体含 dag_run_id 才算触发成功。"
  - q: "Airflow 的 logical_date 可以重复吗？"
    a: "同一 DAG 下不能重复——(dag_id, logical_date) 有唯一约束，dag_run_id 也是主键。重复触发同一 logical_date 是被设计为拒绝的，这个拒绝恰好可以当幂等保护用。"
---

调用 Airflow 的触发 API，请求正常发出、日志也打了「已触发」——回过头发现 DAG 根本没跑，任务面板里空空如也。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。平台的批量补数脚本逐日触发分析 DAG，日期参数一重复，下游就整批静默缺数。

## 问题现象：API「成功」返回，DAG 却没跑

触发请求发出后没有抛错，调用方的日志里写着触发成功——但 Airflow 里查不到对应的 run，任务一个都没执行。这类问题最阴险的地方在于：**它不出现在触发方的报错里，而是出现在下游「怎么少了几天数据」的追问里**。如果你搜的是「Airflow API 触发没反应」「dagRun 创建失败」「trigger dag no run」，都是同一类问题。

## 根因：Airflow 按 (dag_id, logical_date) 唯一约束拒绝重复触发

Airflow 里同一个 DAG 的 `logical_date` 不能重复（`dag_run_id` 也是主键唯一）。用已存在的 logical_date 再触发一次，实测（Airflow 3）API 直接拒绝：

```text
POST /api/v2/dags/{dag_id}/dagRuns
HTTP 409
{"detail": {"reason": "Unique constraint violation", ...}}
```

响应是 4xx，状态码和响应体都在说「没触发成功」——问题出在调用方怎么消费这个响应。最常见的三种漏判姿势：

- **不校验状态码**：请求没抛网络异常就当成功，4xx 响应体被扔掉；
- **只判断「有响应」**：把 `resp.json()` 解析成功当成触发成功，不看里面有没有 `dag_run_id`；
- **错误信息被日志噪音淹没**：409 的 detail 是一坨约束报错文本，grep 关键字对不上就没人看第二眼。

## 解决方案：换新 logical_date 触发，校验响应体里的 dag_run_id

两件事缺一不可。触发侧，批量补数时每次用不同的 logical_date（天然按日期递增）：

```python
from datetime import date, timedelta

for i in range(days):
    ld = (date(2026, 1, 1) + timedelta(days=i)).isoformat()
    trigger(dag_id, logical_date=ld)
```

调用侧，把「响应体含 `dag_run_id`」定为唯一的成功判据，状态码只做辅助：

```python
import requests

def trigger(dag_id: str, logical_date: str) -> str:
    resp = requests.post(
        f"{BASE}/api/v2/dags/{dag_id}/dagRuns",
        headers=auth_headers(),
        json={"logical_date": logical_date},
    )
    body = resp.json()
    run_id = body.get("dag_run_id")
    if not run_id:
        # 409 = 该 logical_date 已有 run；其余 4xx/5xx 同样不是成功
        raise TriggerFailed(f"{resp.status_code}: {body}")
    return run_id
```

这个判据的好处是状态码无关：不管服务端返回 409 还是别的什么，只要响应里没有 `dag_run_id`，触发就没成立——一行判断覆盖所有失败形态。

## 边界与变体：重复触发被拒绝，有时恰恰是保护

值得说清楚另一面：**如果你的 logical_date 就是业务日期，唯一约束本身就是幂等保护**。同一天的数据补跑两次，第二次被 409 拒绝，不会产生重复 run——这时该做的不是「想办法触发成功」，而是走 Airflow 的 clear 重跑已有 run。两种场景别搞混：

| 场景 | 正确姿势 |
|------|----------|
| 批量补数：每天一个新 run | 每次用新的 logical_date，触发前换日期 |
| 同一业务日重跑 | 不重新触发，对已有 run 做 clear + 重跑 |
| 判断触发是否成立 | 只认响应体里的 `dag_run_id`，状态码辅助 |

另外，手动触发不传 logical_date 时 Airflow 会生成 `manual__<时间戳>` 形态的 run_id 和对应 logical_date，天然不重复——踩坑的都是自己构造 logical_date 的调用方。

<InfoBox variant="warning" title="注意事项">

- **把 dag_run_id 校验写进触发封装**，别散落在各调用点——漏一处就是一批静默缺数。
- **409 的 detail 文本是约束报错**，做监控告警时按状态码分类，别指望 grep 消息关键词。
- **logical_date 用业务日期是最佳实践**：既语义清晰，又白拿一层幂等保护。

</InfoBox>

## 常见问题

### Airflow 用 API 重复触发 DAG 会怎样？

被唯一约束拒绝：实测重复 logical_date 触发返回 HTTP 409（Unique constraint violation），响应体无 dag_run_id，DAG 不会运行。调用方只打日志不看响应就会静默失败。

### 为什么 Airflow dagRun 触发了却没实际运行？

最常见原因是重复 logical_date：Airflow 按 (dag_id, logical_date) 唯一约束拒绝重复 run，请求被 409 拒绝但调用方没校验。结论：收到响应后必须确认响应体含 `dag_run_id` 才算触发成功。

### Airflow 的 logical_date 可以重复吗？

同一 DAG 下不能重复——(dag_id, logical_date) 有唯一约束，dag_run_id 也是主键。重复触发同一 logical_date 是被设计为拒绝的，这个拒绝恰好可以当幂等保护用。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
