---
title: "PostgreSQL 数据库迁移后留下废弃空表？用 information_schema 审计 schema 残留"
description: "数据源切换或重构后，只在早期 migration 建过、运行时已无引用的表成了废弃空表残留（旧字段、未规范化列名）。用 information_schema.tables 列出 schema 全表并与代码引用比对，定位 orphan 表后写 migration DROP 清理。"
date: 2026-08-08
tags: [PostgreSQL, SQL, DevOps]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "怎么列出 PostgreSQL 数据库中的所有表？"
    a: "查 information_schema.tables，过滤 table_schema 和 table_type='BASE TABLE'，即可列出某 schema 下所有基础表。它比 psql 的 \\dt 更适合脚本化审计，且跨数据库标准通用。"
  - q: "PostgreSQL 怎么找出没被使用的废弃表？"
    a: "用 information_schema.tables 列出全部表，再与代码库或查询日志的引用比对，0 引用且无写入的表即为废弃候选；空表可进一步用 SELECT count(*) 确认行数后再决定删除。"
  - q: "information_schema 和 pg_catalog 有什么区别？"
    a: "information_schema 是 SQL 标准、跨数据库通用、字段稳定不易变；pg_catalog 是 PostgreSQL 专有，信息更全但版本间可能调整。审计场景优先用 information_schema 保证可移植。"
---

在一次广告数据源从日表切换到周表后，我发现 schema 里还躺着一张只在最早期的 migration 里建过、0 行数据、运行时代码从不引用的空表——还带着过时的字段名和没规范化的中文列。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。这次数据源切换后，写入端早已迁到新的周表，旧日表的清理 migration 也补了，唯独一张只在 baseline 里 `CREATE` 过的月表被遗漏——它既没有对应的新写入，也没有 `DROP`，就那样潜伏在 schema 里，带着早已废弃的字段定义。

## TL;DR

废弃表的典型特征：**只在早期/baseline migration 里 `CREATE`、当前代码 0 引用、常带旧字段或未规范化的列名**。批量迁移时它们不会被自动处理，需要主动用 `information_schema.tables` 列出 schema 全表，再与代码引用比对，定位 orphan 表后写一条 `DROP` migration 清理——而不是手动 `psql` 删完就了事。

## 问题现象

一张典型的废弃表长这样：

- **0 行数据**——业务早已不再写入它；
- **0 运行时引用**——代码里 `grep` 不到任何 `SELECT`/`INSERT`，只剩 migration 文件里的 `CREATE`；
- **旧字段残留**——字段名是上一版命名（如 `ad_plan_id`/`product_id`），与当前规范不一致；
- **未规范化的列名**——甚至还有中文列名没来得及改。

它不报错、不影响线上运行，所以从「线上没出问题」的视角完全无感。但它的危害是隐性的：误导后来者以为它仍在用、占用 schema 命名空间、在跨表审计时制造噪音，还可能被某个误判的 `SELECT *` 意外读到脏数据。

## 根因

数据库迁移有一个普遍的模式：**migration 是「加法」的**。

一次数据源切换通常这样演进：

1. 早期 baseline migration `CREATE` 了一批表（日表、月表）；
2. 业务跑通后，写入端开始依赖这些表；
3. 需求变化，引入新表（周表），写入端逐步迁移过去；
4. 旧表的写入停了，补一条 migration `DROP` 旧日表；
5. **但月表/其他只在 baseline 建过、从未被写入端直接引用的表，没有对应的 `DROP`**。

问题出在第 5 步：迁移注意力集中在「现在用到的表」上——哪些表在写入、哪些 SQL 在查。而「曾经存在、但从未进入主链路」的表既不在写入端、也不在查询端，自然不会触发任何 `DROP`，于是成了 orphan。这类残留和 [Airflow 删除 DAG 后元数据残留](/blog/airflow-delete-dag-metadata-residual) 是同一类问题：「删了入口、忘了清结构」，是迁移类问题的高发区。

## 解决方案

核心流程：**列全表 → 比对引用 → 确认空表 → 写 migration DROP → 验证**。

### 步骤 1：用 information_schema 列出 schema 下所有基础表

```sql
-- 列出某 schema 下所有基础表（排除视图）
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'your_schema'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

`information_schema.tables` 是 SQL 标准目录视图，跨 PostgreSQL/MySQL/SQL Server 通用，字段稳定，非常适合写进审计脚本。

### 步骤 2：grep 代码库确认运行时引用

对每张候选表，在代码库里搜索引用，**排除 migration 文件本身**：

```bash
# 搜索运行时代码引用，排除 migrations 目录
grep -rn "ad_product_monthly_stats" src/ --include="*.py" \
  | grep -v "migrations/"
# 0 行输出 → 运行时无引用，进入候选
```

0 引用是判定 orphan 的关键证据。注意一定要排除 migration 目录——baseline 里的 `CREATE` 不算「引用」。

### 步骤 3：确认是空表

```sql
SELECT count(*) FROM your_schema.ad_product_monthly_stats;
-- 0 → 确认无数据，可安全清理
```

对有数据的表要格外谨慎：先确认它真的废弃（而非只是近期没写入），有疑问就先做逻辑备份再处理。

### 步骤 4：写一条 migration DROP（而非手动删）

```sql
-- db-migrations/{project}/027_drop_ad_product_monthly_stats.sql
DROP TABLE IF EXISTS your_schema.ad_product_monthly_stats;
```

**务必走 migration 文件**：它会被版本控制、在所有环境（开发/预发/生产）一致重放，留下审计轨迹。手动 `psql` 删一次，换台机器就又长回来了。

### 步骤 5：验证已删除

```sql
SELECT to_regclass('your_schema.ad_product_monthly_stats');
-- 返回 NULL 表示表已不存在
```

`to_regclass()` 是验证表是否存在的标准手段，返回 `NULL` 即确认删除成功。

### 批量审计：按前缀一次性排查同类遗漏

单张表清掉后，按前缀把同类表全部列出来逐个核对，避免「清了一张、漏了兄弟」：

```sql
-- 列出某前缀下所有表，逐个走 步骤2-5
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'your_schema'
  AND table_name LIKE 'ad_%'
ORDER BY table_name;
```

<InfoBox variant="warning" title="注意事项">

- **DROP 前先备份/快照**：生产库删表不可逆。对任何有数据的表，先确认废弃再做逻辑备份（如 `CREATE TABLE ... AS SELECT` 导出到归档库）。
- **外键依赖要排查**：如果有其他表的外键指向它，`DROP TABLE` 会失败。确认依赖已解除或有意 `CASCADE`——但 `CASCADE` 会连带删除依赖对象，生产环境慎用。
- **走 migration，不要手动 psql**：手动删除只在当前环境生效，迁移文件才能保证多环境一致并留下记录。
- **用前缀批量审计**：一次切换通常涉及一组同前缀的表（如 `ad_*`），清完一张后用 `LIKE 'ad_%'` 把兄弟表都过一遍，主动发现同类遗漏。

</InfoBox>

## 常见问题

### 怎么列出 PostgreSQL 数据库中的所有表？

查 `information_schema.tables`，过滤 `table_schema` 和 `table_type = 'BASE TABLE'`，即可列出某 schema 下所有基础表。它比 psql 的 `\dt` 更适合写进脚本做自动化审计，且是 SQL 标准、跨数据库通用，代码可移植性更好。

### PostgreSQL 怎么找出没被使用的废弃表？

用 `information_schema.tables` 列出全部表，再与代码库或查询日志的引用做比对，运行时代码 0 引用且无写入的表即为废弃候选；空表可进一步用 `SELECT count(*)` 确认行数，确认无数据、无外键依赖后再写 migration `DROP` 清理。

### information_schema 和 pg_catalog 有什么区别？

`information_schema` 是 SQL 标准定义的目录视图，跨 PostgreSQL/MySQL/SQL Server 通用、字段稳定不易变，适合写可移植的审计脚本；`pg_catalog` 是 PostgreSQL 专有目录，信息更全更细（如精确行数估算、存储细节），但版本间可能调整。做通用 schema 审计优先用 `information_schema`。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
