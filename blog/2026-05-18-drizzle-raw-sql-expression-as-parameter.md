---
title: "UPSERT 写入全零？Drizzle sql 模板混用参数化值与 SQL 表达式的坑"
description: "Drizzle ORM 的 sql 模板会把所有值参数化，包括 SQL 表达式如 date_trunc()——导致 PostgreSQL 报 invalid input syntax for type date，数据静默写入默认值零"
date: 2026-05-18
tags: [Drizzle, PostgreSQL, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Drizzle sql 模板中怎么正确使用 SQL 函数（如 date_trunc）？"
    a: "SQL 表达式必须用 sql.raw() 或直接写在 sql`` 模板里，不能通过 sql.join(map(v => sql`${v}`)) 参数化传入。"
  - q: "为什么 Drizzle 参数化传 date_trunc() 会报 invalid input syntax？"
    a: "Drizzle 把它当成普通字符串参数传给 PostgreSQL，PG 尝试把它解析为 date 类型字面量，自然报错。"
---

在为客户构建电商数据分析平台时遇到此问题，记录根因与解法。

## TL;DR

Drizzle ORM 的 `sql` 模板标签中，`sql.join(values.map(v => sql(v)))` 会把**所有值**参数化传递。如果 values 数组里混入了 SQL 表达式（如 `date_trunc('week', '2026-05-17'::date)::date`），PostgreSQL 会把它当成普通字符串解析，报 `invalid input syntax for type date` 错误。**SQL 表达式必须用 `sql.raw()` 或单独写在模板外部**。

## 问题现象

电商数据采集流程：Chrome 扩展采集 → CCLHub 转发 → Analytics 写库。现象：

1. CCLHub 日志显示采集数据正常（`uv: 403, payAmt: 19478.47`）
2. Analytics 返回 200 成功
3. 但数据库查询结果**全是 0**：`uv: 0, pay_amt: 0.00`

```sql
-- 数据库实际数据
 report_date | uv  | pay_amt  | reveal_cnt
-------------+-----+----------+------------
 2026-05-12  | 392 |  7333.67 |      11879  -- 旧数据正常
 2026-05-13  |   0 |     0.00 |          0  -- 新数据全零！
```

同时 Analytics 错误日志有：

```
PostgresError: invalid input syntax for type date:
  "date_trunc('week', '2026-05-17'::date)::date"
```

## 根因

原始代码混用了参数化值和 SQL 表达式：

```typescript
// ❌ 问题代码
const insertVals: (string | number | null)[] = [
  String(shop_id),
  String(platform_id),
  reportDate,
  tenant_id,
  `date_trunc('week', '${reportDate}'::date)::date`, // ← SQL 表达式
];

// sql.join 会把所有值参数化，包括 date_trunc 表达式
await db.execute(sql`
  INSERT INTO table (..., week_start_date)
  VALUES (${sql.join(insertVals.map(v => sql`${v}`), sql`,`)})
  ...
`);
```

生成的 SQL：

```sql
-- PostgreSQL 收到的 $5 参数值是字面字符串
INSERT INTO table (..., week_start_date)
VALUES ($1, $2, $3, $4, $5, ...)
-- $5 = "date_trunc('week', '2026-05-17'::date)::date"  ← 被当字符串！
```

PostgreSQL 尝试把 `"date_trunc('week', '2026-05-17'::date)::date"` 解析为 date 类型 → 报错。

**为什么数据是 0 而不是报错？** 因为同一张表有独立的询盘写入（PARTIAL UPSERT），询盘 INSERT 成功创建了行（看板列默认值 0），日报 UPSERT 失败但没有回滚已存在的行。

## 解决方案

把 SQL 表达式从参数化数组中分离出来，用 `sql.raw()` 或直接写在模板中：

```typescript
// ✅ 修复：参数化值和 SQL 表达式分开
const insertCols = ['shop_id', 'platform_id', 'report_date', 'tenant_id'];
const insertVals: (string | number | null)[] = [
  String(shop_id), String(platform_id), reportDate, tenant_id,
];

// 19 个数据列正常参数化
for (const [apiKey, dbCol] of Object.entries(DAILY_COLUMNS)) {
  insertCols.push(dbCol);
  insertVals.push(row[apiKey] != null ? String(row[apiKey]) : '0');
}

// week_start_date 用 SQL 表达式，不进参数化数组
await db.execute(sql`
  INSERT INTO table (${sql.raw(insertCols.join(', '))}, week_start_date)
  VALUES (
    ${sql.join(insertVals.map(v => sql`${v}`), sql`,`)},
    date_trunc('week', ${reportDate}::date)::date  -- ← 直接写在模板里
  )
  ...
`);
```

关键区别：

| 写法 | Drizzle 处理方式 | PostgreSQL 收到 |
|------|-----------------|-----------------|
| `sql` 模板插值 | 参数化（`$N`） | 字符串字面量 |
| `sql.raw(expression)` | 原样拼入 SQL | SQL 表达式 |
| 直接写在 `sql` 模板中 | 作为模板的一部分 | SQL 表达式 |

## 注意事项

<InfoBox variant="warning" title="注意事项">

- `sql.raw()` 存在 SQL 注入风险，**不要**用于用户输入。本例中 `reportDate` 来自内部 API，格式可控
- Drizzle 的 `sql` 模板标签会自动参数化所有插值——这是安全特性，但 SQL 函数调用不该被参数化
- 如果整条 SQL 都是动态构建的，考虑用 Drizzle 的 query builder API 代替 raw SQL
- 数据库连接配置也容易踩坑——如果你遇到[连接到了错误的 PostgreSQL 实例](/blog/2026/05/09/wsl-docker-postgresql-port-conflict)，可能是端口被 Docker 静默占用
- 环境变量加载时序也是常见坑源，[JWT 签名静默失败](/blog/2026/05/18/nodejs-env-loaded-undefined-dotenv-import-order)就是 dotenv 在 import 链之后才执行的典型例子

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
