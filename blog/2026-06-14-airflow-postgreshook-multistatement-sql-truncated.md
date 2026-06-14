---
title: "Airflow PostgresHook 多语句 SQL 静默丢结果？按分号切分逐条执行"
description: "PostgresHook.get_pandas_df 把整段多语句 SQL 当一条字符串执行，psycopg2 只返回末条结果集，前置查询被静默丢弃——按顶层分号切分成 list 逐条执行即可修复"
date: 2026-06-14
tags: [Airflow, PostgreSQL, pandas, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Airflow PostgresHook 怎么执行多条 SQL 语句？"
    a: "传 list[str] 而不是单条字符串。DbApiHook.get_pandas_df / run 接受 sql 参数为 list 时按顺序逐条执行；单字符串含多条分号分隔语句时 psycopg2 只返回末条结果集。"
  - q: "为什么 get_pandas_df 多语句 SQL 只返回最后一条结果？"
    a: "pandas.io.sql.read_sql 调 psycopg2 cursor.execute 执行整段字符串，DBAPI 协议对多语句只暴露最后一个结果集的游标，前置 SELECT 结果被静默丢弃，不报错。"
  - q: "怎么安全地按分号切分含注释和引号的 SQL？"
    a: "逐字符扫描，仅在「非单引号内、非 -- 行注释内」的顶层分号处切分。单引号字面量用 SQL 标准 '' 转义；不要用 str.split(';')，会误切注释和字符串里的分号。"
---

在 Airflow DAG 把 `.sql` 模板文件整段读出后传给 `PostgresHook.get_pandas_df()` 时，前置 SELECT 的结果被静默丢弃——DAG 报「SQL 查询无结果」，但把同一段 SQL 复制到 psql 又能正常返回数据。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析流水线，Airflow DAG 从 SQL 模板文件读取多查询报表模板并执行。

## TL;DR

`PostgresHook.get_pandas_df(sql)` 内部走 `pandas.read_sql(sql, conn)` → `psycopg2 cursor.execute(sql)`。当 `sql` 是含多条 `;` 分隔 SELECT 的**单字符串**时，DBAPI 只暴露**最后一个结果集**的游标，前置查询结果被静默丢弃且不报错。修复方法：按顶层分号切分成 `list[str]`，逐条 `get_pandas_df` 收集结果，或直接传 list 让 DbApiHook 顺序执行。

## 问题现象

DAG 任务执行 `shop_monthly_overview.sql` 报「SQL 查询无结果」：

```
sql_count = 1   ← 模板里明明写了 4 条查询
result = "❌ SQL 查询无结果"
```

但同一份 SQL 复制到 psql 直连同库同参数，4 条 SELECT 都有数据。

### 复现实验

在 Airflow 容器内直接验证 `get_pandas_df` 对多语句的行为：

```python
from airflow.providers.postgres.hooks.postgres import PostgresHook

hook = PostgresHook(postgres_conn_id="postgres_default")

# 三条 SELECT 串成单字符串
sql = "SELECT 1 AS a; SELECT 2 AS b; SELECT 99 AS c WHERE 1=0;"

df = hook.get_pandas_df(sql)
print(df.columns.tolist())  # ['c']  ← 只拿到末条的列
print(df)                    # Empty  ← 末条本身 0 行
```

预期应得到三条结果，实际只拿到末条（`SELECT 99 ... WHERE 1=0`，0 行），前两条**完全消失**，没有任何报错或警告。

## 根因

调用链是 `PostgresHook.get_pandas_df` → `DbApiHook.get_pandas_df` → `pandas.io.sql.read_sql` → `psycopg2 cursor.execute(sql)`。

DBAPI 协议（PEP 249）允许 `execute` 接受含多条 `;` 分隔语句的字符串，PostgreSQL 服务端会依次执行全部语句，但**游标只暴露最后一个结果集**——这是 PostgreSQL wire protocol 的固有行为，不是 Airflow 或 pandas 的 bug。

```
┌────────────────────────────────────────────────────┐
│ SELECT 1;  ← 执行，结果集 1 立即被丢弃              │
│ SELECT 2;  ← 执行，结果集 2 立即被丢弃              │
│ SELECT 99 WHERE 1=0;  ← 执行，结果集 3 暴露给游标    │
└────────────────────────────────────────────────────┘
                       ↓
            pandas.read_sql 只 fetch 到结果集 3
```

源头是 `task_execute_sql` 把 `.sql` 文件整段读出后当成一条字符串传进 `get_pandas_df`：

```python
# ❌ 问题代码
sql_text = open(sql_path).read()  # 含 4 条 SELECT 的整段
df = pg_hook.get_pandas_df(sql_text)  # 只拿到末条结果
```

为什么 psql 能正常返回？因为 psql 前端会主动遍历所有结果集并依次打印，而 DBAPI 游标不会。

## 解决方案

### 方案 A（推荐）：按顶层分号切分后逐条执行

适合 `.sql` 模板文件场景——文件含注释、引号、多查询，需要稳健的切分。

```python
def split_sql_statements(sql: str) -> list:
    """
    按顶层分号切分 SQL，正确处理：
    - 单引号字符串内的分号（'a;b' 不切）
    - SQL 标准 '' 转义（'it''s' 不切）
    - -- 行注释内的分号（-- note; not split 不切）
    """
    statements = []
    buf = []
    i, n = 0, len(sql)
    in_quote = False

    while i < n:
        ch = sql[i]

        # 在单引号字符串内
        if in_quote:
            buf.append(ch)
            if ch == "'":
                # '' = 字面量单引号，不结束字符串
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append(sql[i + 1])
                    i += 2
                    continue
                in_quote = False
            i += 1
            continue

        # 顶层
        if ch == "'":
            in_quote = True
            buf.append(ch)
        elif ch == '-' and i + 1 < n and sql[i + 1] == '-':
            # 行注释，原样吞到行尾（注释里的 ; 不切分）
            while i < n and sql[i] != '\n':
                buf.append(sql[i])
                i += 1
            continue
        elif ch == ';':
            stmt = ''.join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        else:
            buf.append(ch)
        i += 1

    # 末尾无分号的残留块
    stmt = ''.join(buf).strip()
    if stmt:
        statements.append(stmt)

    return statements


# 调用方
sql_text = open(sql_path).read()
statements = split_sql_statements(sql_text)

# 逐条执行，收集所有结果
all_results = []
for idx, stmt in enumerate(statements, start=1):
    df = pg_hook.get_pandas_df(stmt)
    if not df.empty:
        all_results.append({
            "sql_index": idx,
            "sql": stmt,
            "data": df.to_dict("records"),
            "columns": df.columns.tolist(),
            "row_count": len(df),
        })
```

### 方案 B：直接传 list 给 DbApiHook

Airflow `DbApiHook.run` 和 `get_records` 接受 `list[str]` 参数会按顺序执行——但 `get_pandas_df` 在 list 模式下的返回行为各 provider 实现不一致，生产环境建议用方案 A 自己控制。

### 为什么不用 `sqlparse.split`？

社区答案常推荐 `sqlparse.split(sqlparse.format(sql, strip_comments=True))`，但 `strip_comments=True` 会**丢掉注释**，如果你的下游 processor 依赖注释中的元信息（如 `-- dimension: shop`），就会丢失上下文。手写切分器保留注释原文，行为可控。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- 不要用 `sql.split(';')` 简单切分——会误切 `WHERE name = 'a;b'` 这类引号内的分号，以及 `-- 注释;` 行注释里的分号
- `split_sql_statements` 只处理单引号字符串和 `--` 行注释；如果你的 SQL 用 `/* 块注释 */` 或 dollar-quoted string（`$$...$$`），需要扩展切分器
- 修复后下游 processor 的 `sql_index` 语义会变（1-based 顺序索引），同步检查所有 `df.iloc[sql_index]` 类用法
- 如果你的 SQL 是程序生成而非文件读取，更安全的做法是**生成时就用 list**，避免后续切分
- 顺带提一个相邻的坑：如果你在 Drizzle ORM 里也遇到过 SQL 表达式被静默参数化的问题，可以看 [Drizzle sql 模板混用参数化值与 SQL 表达式](/blog/2026/05/18/drizzle-raw-sql-expression-as-parameter)——同样是「框架替你做了你没预期到的转换」类陷阱

</InfoBox>

## 常见问题

### Airflow PostgresHook 怎么执行多条 SQL 语句？

传 `list[str]` 而不是单条字符串。`DbApiHook.get_pandas_df` 和 `run` 接受 `sql` 参数为 list 时按顺序逐条执行；单字符串含多条分号分隔语句时 psycopg2 只返回末条结果集。生产环境推荐自己切分后逐条调用，方便控制结果聚合和 `sql_index` 索引。

### 为什么 get_pandas_df 多语句 SQL 只返回最后一条结果？

`pandas.io.sql.read_sql` 调 `psycopg2 cursor.execute` 执行整段字符串，DBAPI 协议对多语句只暴露最后一个结果集的游标，前置 SELECT 结果被服务端立即丢弃，不报错也不警告。psql 能正常返回是因为 psql 前端会主动遍历所有结果集，DBAPI 游标不会。

### 怎么安全地按分号切分含注释和引号的 SQL？

逐字符扫描，仅在「非单引号内、非 `--` 行注释内」的顶层分号处切分。单引号字面量用 SQL 标准 `''` 转义；不要用 `str.split(';')`，会误切注释和字符串里的分号。如果用 `sqlparse.split`，注意 `strip_comments=True` 会丢掉注释原文。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
