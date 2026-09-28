---
title: "Airflow 删了 DAG 文件元数据还在？清表顺序错了会复活"
description: "删掉 DAG 文件后 dag、serialized_dag 等表仍残留；先清表后删文件还会复活——dag-processor 扫到文件就重新注册。正确顺序：删文件→按外键序清表→reserialize 验证。"
date: 2026-09-28
tags: [Airflow, PostgreSQL, DevOps]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Airflow 删除 DAG 文件后为什么 UI 里还在？"
    a: "元数据残留在 dag、serialized_dag、dag_code、dag_version 等表里，UI 按表渲染；reserialize 只 upsert 现存文件、不清理文件已消失的旧行，需要按外键顺序手动 DELETE。"
  - q: "Airflow 清了元数据表为什么又复活？"
    a: "清表时 DAG 文件还在：dag-processor 定期扫描 DAG 目录，扫到文件就重新注册元数据。必须先删文件（git pull 同步到挂载目录），再清表，最后 reserialize 验证不再重建。"
  - q: "彻底删除一个 Airflow DAG 的正确顺序是什么？"
    a: "①删 .py 文件并同步到 DAG 目录；②按外键顺序清表：dag_run（级联 task_instance）→ serialized_dag → dag_code → dag_version → dag；③airflow dags reserialize 确认 dag 表不再重建。"
---

把某个 DAG 的 .py 文件从代码库里删掉、部署完成——Airflow 的 DAG 列表里它还稳稳挂着；手动清了元数据表，过一会儿它又回来了。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。平台的 DAG 管道迭代下线旧分析类型时，元数据残留让列表页越积越乱。

## 问题现象：文件删了，元数据「阴魂不散」

两类症状，取决于操作顺序：

- **先删文件、再查库**：`dag`、`serialized_dag`、`dag_code`、`dag_version` 表里该 dag_id 的行全都还在，UI 列表照常显示；
- **先清表、后删文件**：更诡异——刚 DELETE 干净的行，过几分钟自己回来了，DAG「复活」。

如果你搜的是「Airflow delete DAG still shows in UI」「删除 DAG 后还在」「dag metadata not removed」，都是同一件事。

## 根因：dag-processor 扫到文件就注册，reserialize 不清旧行

「复活」的机制是 Airflow 的设计行为，不是灵异事件：

- **dag-processor 定期扫描 DAG 目录**。只要 .py 文件还在目录里，扫描进程就会解析它并重新注册元数据行——这解释了「先清表后删文件」的复活：清表时文件还在，下一次扫描立刻重建。
- **`airflow dags reserialize` 只做增量注册**。它把「目录里现存的文件」序列化进表，但**不会清理「文件已消失」的旧行**——删文件后跑 reserialize，残留纹丝不动。

所以「删文件」和「清元数据」的顺序天然是单向的：文件在，清了也白清；文件没了，清一次就是最终态。

## 解决方案：删文件 → 按外键序清表 → reserialize 验证

三步，顺序不能反：

1. **先删 .py 文件**。生产环境 DAG 目录是 volume 挂载的，文件要在宿主机 git pull 同步到位，而不是进容器里删：

```bash
ssh <host> "cd /root/workspace/ai_dag && git pull"
# DAG 目录（挂载进容器 /opt/airflow/dags）此刻已无该 .py
```

2. **再清元数据，按外键顺序 DELETE**（`dag_run` 的子表 `task_instance` 随级联清理）：

```sql
DELETE FROM dag_run        WHERE dag_id = 'old_dag';      -- 级联 task_instance
DELETE FROM serialized_dag WHERE dag_id = 'old_dag';
DELETE FROM dag_code       WHERE dag_id = 'old_dag';
DELETE FROM dag_version    WHERE dag_id = 'old_dag';
DELETE FROM dag            WHERE dag_id = 'old_dag';
```

3. **reserialize 一次做验证**：`airflow dags reserialize` 跑完后查 `dag` 表——该 dag_id 不再重建，才算清干净。

整个过程一分钟内完成，文件已不在目录里，dag-processor 扫描时不会再注册它。

## 边界与变体

- **清表前先确认调度器/处理器没有正在解析该 DAG**，避免清表与注册赛跑；低峰操作最省心。
- **`dag_run` 历史要留证据的话**，先 `SELECT` 导出再删——运行历史是排查「当时发生了什么」的唯一记录，删了就没了。
- **同一文件名换目录/换平台目录的场景**，dag_id 若相同，残留逻辑同本文：先让旧文件从目录消失，再做元数据手术。
- Airflow 各版本的元数据表结构有差异（如 `dag_code`/`dag_version` 是较新版本引入），DELETE 前先 `\d` 确认本环境的表与外键，别照抄表名。

<InfoBox variant="warning" title="注意事项">

- **顺序是铁律**：文件未删先清表 = 必然复活；把「删文件」放在流程第一步，后面全是顺路。
- **SQL 直连生产元数据库属于高风险操作**：WHERE 条件必须精确到 dag_id，先在事务里 BEGIN 查影响行数再提交。
- **UI 里「删除」按钮（较新版本）走的是 API 删除路径**，与手工清表效果不同；本文流程针对「需要精确控制清理范围」的场景。

</InfoBox>

## 常见问题

### Airflow 删除 DAG 文件后为什么 UI 里还在？

元数据残留在 `dag`、`serialized_dag`、`dag_code`、`dag_version` 等表里，UI 按表渲染；reserialize 只 upsert 现存文件、不清理文件已消失的旧行，需要按外键顺序手动 DELETE。

### Airflow 清了元数据表为什么又复活？

清表时 DAG 文件还在：dag-processor 定期扫描 DAG 目录，扫到文件就重新注册元数据。必须先删文件（git pull 同步到挂载目录），再清表，最后 reserialize 验证不再重建。

### 彻底删除一个 Airflow DAG 的正确顺序是什么？

①删 .py 文件并同步到 DAG 目录；②按外键顺序清表：dag_run（级联 task_instance）→ serialized_dag → dag_code → dag_version → dag；③`airflow dags reserialize` 确认 dag 表不再重建。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
