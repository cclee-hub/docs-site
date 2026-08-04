---
title: "Airflow 删除 DAG 后它还在列表里？元数据没清干净 + 正确清理顺序"
description: "Airflow 删除 DAG 的 .py 文件后 UI 和数据库仍残留 dag_id；先清元数据后删文件还会复活。根因：dag-processor 定期扫描重新注册，reserialize 不清已删文件的旧行。解法：先删文件→按外键顺序 SQL DELETE 清元数据→跑 dags reserialize 验证。"
date: 2026-08-05
tags: [Airflow, DevOps, PostgreSQL, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Airflow 删除 DAG 的 .py 文件后为什么还在列表里？"
    a: "因为删文件不会清数据库元数据。dag/serialized_dag/dag_code/dag_version 表的旧行还在，Web UI 读这些表所以仍显示。需手动按外键顺序 DELETE 清理。"
  - q: "Airflow 怎么彻底删除一个 DAG 及其全部元数据？"
    a: "三步：①先删 .py 文件让 dag-processor 不再注册；②按外键顺序 SQL DELETE（dag_run→serialized_dag→dag_version→dag→orphan dag_code）；③跑 airflow dags reserialize 验证 dag 表不再重建。"
  - q: "Airflow 清理 DAG 元数据的正确顺序是什么？为什么不能先清元数据再删文件？"
    a: "必须先删文件后清元数据。若反过来，.py 文件还在，dag-processor 下个扫描周期会重新把清空的 dag 行注册回来，即元数据复活。"
---

在 Airflow 里删掉某个 DAG 的 `.py` 文件想下线它，Web UI 的 DAG 列表和数据库里却还挂着这个 `dag_id`；更诡异的是——如果先清元数据再删文件，刚刚清空的行会「复活」重新出现。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析流水线，下线旧版报表 DAG 时要把它的元数据一起清干净，否则 UI 列表和定时扫描会被残留行干扰。

## TL;DR

Airflow 的 dag-processor 会定期扫描 DAG 目录重新注册，而 `airflow dags reserialize` 也不会清理「文件已删除」的孤儿 dag 行——所以光删 `.py` 文件，UI 和数据库里的 `dag_id` 不会自动消失；反过来先清元数据再删文件，processor 扫到文件还在，会把清空的行重新注册（「复活」）。正确顺序：**①先删文件让 processor 不再注册 → ②按外键顺序 SQL DELETE 清元数据 → ③跑 `airflow dags reserialize` 验证**。

## 问题现象

下线 `shop_report_aggregation` 这个 DAG，删了它的 `.py` 文件后：

```text
$ ls /opt/airflow/project/airflow_dags/shop_report_aggregation.py
ls: cannot access '.../shop_report_aggregation.py': No such file or directory

$ # 但数据库里还在
$ docker exec cclhub-db psql -U airflow -d airflow -c \
    "SELECT dag_id, is_paused, is_active FROM dag WHERE dag_id='shop_report_aggregation';"
       dag_id            | is_paused | is_active
--------------------------+-----------+-----------
 shop_report_aggregation | f         | t          ← 仍残留
```

不只 `dag` 表，`serialized_dag`、`dag_code`、`dag_version` 表里对应行也全在，于是 Web UI 的 DAG 列表继续显示这个已「删除」的 DAG。

更坑的是反向操作——先清元数据、后删文件：

```text
T0  DELETE FROM dag WHERE dag_id='shop_report_aggregation';   ← 清空
T1  （此时还没删 .py 文件）
T2  dag-processor 扫描周期到达，发现文件存在、dag 表无对应行 → 重新注册
T3  SELECT ... FROM dag WHERE dag_id='shop_report_aggregation';   ← 又回来了（复活）
```

## 根因

两个机制叠加：

**1. dag-processor 定期扫描并重新注册。** Airflow 的 dag-processor（Scheduler 的一部分）按 `processor_poll_interval`（默认约 5 分钟）周期性扫描 `dags_folder` 目录，解析每个 `.py` 文件并 upsert 进元数据表（`dag`、`serialized_dag`、`dag_version`）。**只要文件还在，下一个扫描周期就会重新写入对应行。** 这是「复活」的直接来源——你清了行，文件还在，processor 把它当新 DAG 重新登记。

**2. `reserialize` 不管「文件已消失」的旧行。** `airflow dags reserialize` 的职责是把**现有** DAG 文件重新序列化、刷新 `serialized_dag`；它不会去删除「文件已经不存在」的孤儿 `dag` 行。而 `airflow dags cleanup` 默认只清理过期的 `dag_run` 运行历史，**也不动** `dag` / `serialized_dag` / `dag_code` / `dag_version` 这几张元数据表。所以删了文件后，元数据行成了无人清理的孤儿。

```text
┌─ dag-processor ──────────────────────────────┐
│  扫描 dags_folder                             │
│  ├─ 文件在 → upsert dag / serialized_dag ... │  ← 复活来源
│  └─ 文件不在 → 跳过，不删旧行                │  ← 孤儿残留
└──────────────────────────────────────────────┘
```

结论：要让元数据真正消失，必须让 processor **没有文件可注册**（先删文件），再手动清掉残留的元数据行。

## 解决方案

### 第 1 步：先删文件

让 `.py` 文件从 DAG 目录消失，dag-processor 就不会再注册它。

```bash
# 生产环境通常经 git pull 同步到 volume 挂载的 DAG 目录
# /opt/airflow/project/airflow_dags/
git pull   # 让 shop_report_aggregation.py 从仓库移除并同步到目录

# 或直接删除（确认无其他依赖后）
rm /opt/airflow/project/airflow_dags/shop_report_aggregation.py
```

### 第 2 步：按外键顺序清元数据

按外键依赖顺序 DELETE，避免约束冲突。`dag_run` 删除会 CASCADE 到 `task_instance`：

```sql
BEGIN;

-- 1. 运行历史（CASCADE 带 task_instance）
DELETE FROM dag_run      WHERE dag_id = 'shop_report_aggregation';

-- 2. 序列化 DAG
DELETE FROM serialized_dag WHERE dag_id = 'shop_report_aggregation';

-- 3. 版本
DELETE FROM dag_version  WHERE dag_id = 'shop_report_aggregation';

-- 4. dag 主表
DELETE FROM dag          WHERE dag_id = 'shop_report_aggregation';

-- 5. dag_code 按源码 hash 存，多个 DAG 可能共享同一份代码；
--    只删已经没有任何 serialized_dag 引用的 orphan hash
DELETE FROM dag_code
WHERE dag_hash NOT IN (SELECT dag_hash FROM serialized_dag);

COMMIT;
```

### 第 3 步：验证

```bash
airflow dags reserialize

# 确认 dag 表不再重建该行
docker exec cclhub-db psql -U airflow -d airflow -c \
  "SELECT count(*) FROM dag WHERE dag_id='shop_report_aggregation';"
#  count
# -------
#      0   ✅
```

`reserialize` 后 `dag` / `serialized_dag` / `dag_code` / `dag_version` 对该 `dag_id` 全部为 0，且下一个 processor 扫描周期过去也不再重建，说明清理稳定。

顺带一提，同一条流水线上 [pandas NaN 进 XCom 导致任务无声崩溃](/blog/airflow-xcom-nan-not-json-compliant)是另一个值得收藏的坑。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- **`dag_code` 是按源码 hash 共享的**：多个 DAG 可能引用同一份源码 hash，删除前务必用 orphan 判定（`dag_hash NOT IN (SELECT dag_hash FROM serialized_dag)`），不要按 `dag_id` 直接删——这张表压根没有 `dag_id` 列。
- **别指望 `airflow dags cleanup` 清元数据**：它默认只删过期的 `dag_run`（由 `max_active_runs` / retention 控制），不动 `dag` / `serialized_dag` / `dag_code` / `dag_version`。清元数据得手写 SQL。
- **删文件后等一个扫描周期再清更稳**：极端竞态下，删文件和清元数据之间若正好夹一个 processor 扫描，可能在文件已被你删但 processor 还没刷新的窗口里写入。实践中按「先删文件→再清元数据→reserialize 验证」顺序操作即可，必要时清完再跑一次 reserialize 确认。
- **删 DAG 前确认无下游依赖**：其他 DAG 可能用 `ExternalTaskSensor` 等待这个 DAG，或 `TriggerDagRunOperator` 触发它。下线前 grep 一遍 `dag_id` 引用。

</InfoBox>

## 常见问题

### Airflow 删除 DAG 的 .py 文件后为什么还在列表里？

因为删除文件不会清理数据库元数据。`dag` / `serialized_dag` / `dag_code` / `dag_version` 这几张表的旧行仍然存在，Web UI 读这些表来渲染列表，所以已删的 DAG 还会显示。Airflow 没有内置命令自动清这些孤儿行，需要手动按外键顺序 SQL DELETE。

### Airflow 怎么彻底删除一个 DAG 及其全部元数据？

三步：①先删 `.py` 文件，让 dag-processor 不再注册它；②按外键顺序 SQL DELETE 清理（`dag_run` → `serialized_dag` → `dag_version` → `dag` → orphan `dag_code`）；③跑 `airflow dags reserialize`，然后查 `dag` 表确认该 `dag_id` 行数不再重建为 0。

### Airflow 清理 DAG 元数据的正确顺序是什么？为什么不能先清元数据再删文件？

必须先删文件、后清元数据。反过来操作的话，`.py` 文件还在，dag-processor 下一个扫描周期会重新把清空的 `dag` 行注册回来，元数据「复活」。只有先让文件消失、processor 无文件可注册，再清残留的元数据行，才能彻底下线。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
