---
title: "PostgreSQL ON CONFLICT 报 there is no unique constraint？改唯一键后 INSERT 必须同步"
description: "PostgreSQL 报 there is no unique or exclusion constraint matching the ON CONFLICT specification（错误码 42P10）：ON CONFLICT 的列集必须精确匹配一个唯一约束/索引，改唯一键时所有 INSERT 必须同步，migration 与写入端部署要背靠背"
date: 2026-07-04
tags: [PostgreSQL, SQL, 数据库]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "PostgreSQL ON CONFLICT 必须有唯一约束吗？"
    a: "指定列时必须有。ON CONFLICT (cols) 的 cols 要精确对应一个已存在的 UNIQUE 约束或唯一索引。无对应约束时只能用不带列的 ON CONFLICT DO NOTHING，它不指定仲裁器、无需匹配索引。"
  - q: "PostgreSQL ON CONFLICT 可以指定多个唯一约束吗？"
    a: "不能。单条 INSERT 的 ON CONFLICT 只能指定一个仲裁约束（一个列集或一个索引名）。需按不同唯一键分别处理冲突时，要拆成多次写入或先查再决定 insert/update。"
  - q: "报 there is no unique or exclusion constraint matching the ON CONFLICT specification 怎么办？"
    a: "这是 42P10 错误，说明 ON CONFLICT 指定的列集找不到匹配的唯一索引。排查：确认存在覆盖这些列的 UNIQUE 约束、列顺序一致、改过唯一键后 INSERT 已同步；若用部分唯一索引，ON CONFLICT 还要带上相同 WHERE 子句。"
---

在为某张表收紧唯一键（移除一个不再区分数据的列）之后，原本正常的 UPSERT 写入立刻批量报错——`there is no unique or exclusion constraint matching the ON CONFLICT specification`。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。

## TL;DR

PostgreSQL 的 `ON CONFLICT (cols)` 要求 `cols` 精确匹配一个已存在的唯一约束或唯一索引（列与顺序都要一致，否则错误码 42P10）。一旦你 `ALTER` 了唯一键，所有引用它的 `INSERT ... ON CONFLICT` 必须同步修改；而且 migration 跑完后写入端要立刻部署，中间窗口会持续报错。

## 问题现象

唯一键改造一上线，定时导入任务全量失败，写库日志只剩这一条：

```
ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
SQL state: 42P10
```

业务表 0 行写入，但同一张表的其它纯 `SELECT` 查询完全正常——问题只出在带 `ON CONFLICT` 的写入路径上。

## 根因

`ON CONFLICT (cols)` 里指定的列集叫**仲裁器（arbiter）**。PostgreSQL 要求它精确匹配表上某个 `UNIQUE` 约束或唯一索引：

- 列的集合必须相同；
- 列的顺序也要相同；
- 如果是带 `WHERE` 的部分唯一索引（partial unique index），`ON CONFLICT` 还要带上相同的 `WHERE`。

找不到匹配项时，PostgreSQL 不知道用哪个索引来判断"冲突"，于是抛出 42P10。

典型触发场景是**收缩唯一键**：原先唯一键含 3 列，你发现其中一列（比如 `audience`）的 4 个取值对应的指标行 100% 全等、纯属冗余，于是把唯一键降到 2 列。这是对的优化方向，但旧的 `INSERT` 仍写着 `ON CONFLICT (c1, c2, c3)`，而表上只剩 `(c1, c2)` 的唯一约束——仲裁器找不到落点，报错。

```text
旧唯一键: UNIQUE (store_id, metric_key, audience)
新唯一键: UNIQUE (store_id, metric_key)

旧 INSERT: ON CONFLICT (store_id, metric_key, audience)   ← 找不到匹配
```

## 解决方案

下面是最小复现，建表、触发、修复一条龙，可直接在 psql 里跑：

```sql
-- 1. 带 3 列唯一键的表
CREATE TABLE daily_metric (
    store_id   TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    audience   TEXT NOT NULL,
    value      NUMERIC,
    CONSTRAINT daily_metric_unique UNIQUE (store_id, metric_key, audience)
);

-- 2. 旧 UPSERT：ON CONFLICT 含 audience
INSERT INTO daily_metric (store_id, metric_key, audience, value)
VALUES ('s1', 'revenue', 'visitor', 100)
ON CONFLICT (store_id, metric_key, audience)
DO UPDATE SET value = EXCLUDED.value;

-- 3. 收缩唯一键：移除 audience
ALTER TABLE daily_metric
    DROP CONSTRAINT daily_metric_unique,
    ADD  CONSTRAINT daily_metric_unique_new UNIQUE (store_id, metric_key);

-- 4. 再跑第 2 步的 INSERT，立刻报错 ↓
-- ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

修复就是把 `INSERT` 的 `ON CONFLICT` 列同步收缩到 2 列；既然 `audience` 不再区分数据，写入端干脆把它的值固定为字面量，避免按入参凭空拼出多行：

```sql
INSERT INTO daily_metric (store_id, metric_key, audience, value)
VALUES ('s1', 'revenue', 'visitor', 100)
ON CONFLICT (store_id, metric_key)         -- ← 同步收缩
DO UPDATE SET value = EXCLUDED.value;
```

真正容易踩的是**部署顺序**，不是 SQL 本身：

1. 先发 migration（`DROP` 旧约束 + `ADD` 新约束）；
2. 紧接着发布写入端代码（`INSERT` 的 `ON CONFLICT` 改为 2 列）；
3. 两步之间不要留间隔——旧代码撞新 schema 必报 42P10，新代码撞旧 schema 同样报 42P10（找不到 2 列的唯一约束）。

如果你用 Drizzle 这类 ORM，`ON CONFLICT` 的列一旦在 `sql` 模板里写死，改 schema 时极易漏改——schema 与写入端不同步的代价，在[另一篇 Drizzle + PostgreSQL 的坑](/blog/2026/05/18/drizzle-raw-sql-expression-as-parameter)里也领教过。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- **列顺序敏感**：`ON CONFLICT (a, b)` 与 `UNIQUE (b, a)` 不算匹配，顺序必须一致。
- **部分唯一索引要带 WHERE**：若仲裁器是 `UNIQUE ... WHERE active`，`INSERT` 里要写成 `ON CONFLICT (cols) WHERE active DO ...`，否则同样报 42P10。
- **只想"冲突就跳过"**：用不带列的 `ON CONFLICT DO NOTHING`，它不指定仲裁器、无需匹配任何具体索引，能捕获所有冲突。
- **灰度并存**：新老版本写入端可能短暂共存，确保两套代码都能匹配当前 schema，或让 migration 与代码同步上线、不留窗口。

</InfoBox>

## 常见问题

### PostgreSQL ON CONFLICT 必须有唯一约束吗？

只有指定列时才必须。`ON CONFLICT (cols)` 的 `cols` 要精确对应一个已存在的 `UNIQUE` 约束或唯一索引，否则报 42P10。如果你只想"有任何冲突就跳过"、不关心具体哪个约束，用不带列的 `ON CONFLICT DO NOTHING`，它不需要匹配特定索引。

### PostgreSQL ON CONFLICT 可以指定多个唯一约束吗？

不能。单条 `INSERT` 的 `ON CONFLICT` 只能指定**一个**仲裁约束（一个列集，或一个索引名）。表上可以有多个唯一键，但一条语句只能选其一做冲突判定。需要按不同唯一键分别处理时，要么拆成多次写入，要么在应用层先查再决定 `INSERT` 还是 `UPDATE`。

### 报 there is no unique or exclusion constraint matching the ON CONFLICT specification 怎么办？

这是错误码 42P10，含义是 `ON CONFLICT` 指定的列集在表上找不到匹配的唯一索引。按顺序排查：确认存在覆盖这些列的 `UNIQUE` 约束、列与顺序完全一致、最近改过唯一键后 `INSERT` 已同步更新；如果用的是带 `WHERE` 的部分唯一索引，`ON CONFLICT` 还要补上相同的 `WHERE` 子句。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
