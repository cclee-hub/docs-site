---
title: "PostgreSQL jsonb 字段判空失效？JSON null 不是 SQL NULL"
description: "jsonb 用 IS NOT NULL 判空时 JSON null 也会通过——它是合法 jsonb 值而非 SQL NULL。判键存在用 ? 操作符，判值类型用 jsonb_typeof，->> 无法区分二者。"
date: 2026-09-28
tags: [PostgreSQL, SQL, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "PostgreSQL jsonb 里 JSON null 和 SQL NULL 有什么区别？"
    a: "JSON null 是合法的 jsonb 值，SQL NULL 是「值不存在」。实测 {\"a\":null}::jsonb -> 'a' IS NOT NULL 返回 true；jsonb_typeof 对前者返回字符串 'null'，对缺键返回 SQL NULL。"
  - q: "为什么 jsonb 字段 IS NOT NULL 过滤不掉空值？"
    a: "->'key' 对 JSON null 返回的是合法 jsonb 值而非 SQL NULL，IS NOT NULL 自然为 true。要判「有真值」用 jsonb_typeof(字段->'key') = 'array' 这类类型断言，要判「键存在」用 ? 操作符。"
  - q: "jsonb 怎么判断键存在还是值为 null？"
    a: "键存在用 ? 操作符，值是 JSON null 也返回 true，不受值影响。值为 JSON null 时 jsonb_typeof 返回字符串 'null'，缺键时返回 SQL NULL——二者据此区分。"
---

用 `IS NOT NULL` 过滤 jsonb 字段的「空值」，结果 JSON null 的行照样通过——数据明明是空的，判断却为真。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。分析结果的决策快照以 jsonb 存储，规则未触发的行写入的是 JSON null，「有没有规则输出」这个判断因此失真。

## 问题现象：IS NOT NULL 拦不住的「空值」

`字段->'key' IS NOT NULL` 对值为 JSON null 的行返回 true——过滤条件形同虚设，本该被排除的行混进了结果集。如果你搜的是「jsonb 判空不生效」「jsonb 空值过滤不掉」「IS NOT NULL 对 json 无效」，都是同一个问题。

## 根因：JSON null 是合法 jsonb 值，不是 SQL NULL

PostgreSQL 里 jsonb 有两套「空」：**SQL NULL 表示值不存在，JSON null 是一个合法的 jsonb 值**。`->` 取出一个值为 JSON null 的键，拿回来的是后者——`IS NOT NULL` 判断的是「拿回来的东西存不存在」，不是「拿回来的是不是有意义的值」。直接看实测矩阵（PostgreSQL 16 容器实测）：

| 表达式 | 结果 |
|--------|------|
| `('{"a":null}'::jsonb -> 'a') IS NOT NULL` | `true` |
| `('{"a":1}'::jsonb -> 'b') IS NULL` | `true`（缺键返回 SQL NULL） |
| `jsonb_typeof('{"a":null}'::jsonb -> 'a')` | `'null'`（字符串） |
| `jsonb_typeof('{"a":1}'::jsonb -> 'b')` | SQL NULL |
| `'{"a":null}'::jsonb ? 'a'` | `true` |
| `('{"a":null}'::jsonb ->> 'a') IS NULL` | `true` |

两个最容易踩的组合：

- **`IS NOT NULL` 分不出「JSON null」和「真值」**——第一行，这正是误判的来源。
- **`->>` 取文本后判 `IS NULL` 同样分不出**——JSON null 和缺键都变成 SQL NULL，第六行。想用取文本绕过这个坑，会原样掉进去。

## 解决方案：判键用 ?，判值用 jsonb_typeof

两件事要在查询里分开表达，用对工具就不会再混：

```sql
-- 判「键存在」：值是不是 null 无所谓
SELECT '{"a":null}'::jsonb ? 'a';                          -- true

-- 判「有真值」：断言具体 JSON 类型，'null'、缺键一律排除
SELECT jsonb_typeof(config->'rule_output') = 'array';      -- 数组才算
SELECT jsonb_typeof(config->'rule_output') = 'object';     -- 对象才算

-- 找出「写了 JSON null」的行（数据排查用）
SELECT * FROM t WHERE jsonb_typeof(config->'rule_output') = 'null';
```

我们踩的具体场景：规则引擎在「规则未触发」时往决策快照里写 JSON null，下游用 `->'rule_output' IS NOT NULL` 统计「有规则输出的行」，统计口径全错。修复是把断言收紧为 `jsonb_typeof(...) = 'array'`——只认数组，JSON null、缺键、其他类型一次排除。配套的 JSON null 判定此前用的是 `IS NOT NULL`，同批修正。

## 边界与变体：JSON null 不总是错的

先说清楚：JSON null 本身是合法设计——「键存在但值为空」和「键不存在」是两种业务语义，API 返回 `"extra": null` 与不返回 `extra` 键不是一回事。错的不是数据，是拿 `IS NOT NULL` 去 做「有值」判断。三种意图对应三种写法：

| 意图 | 写法 |
|------|------|
| 键存在（不管值） | `jsonb ? 'key'` |
| 有指定类型的真值 | `jsonb_typeof(x) = 'array' / 'object' / ...` |
| 值为 JSON null | `jsonb_typeof(x) = 'null'` |

另一个隐藏差异在更新侧：`jsonb_set(config, '{rule_output}', 'null')` 会写入 JSON null，`jsonb_set(config, '{rule_output}', NULL)` 则把整个键删掉——参数给的是 JSON 还是 SQL NULL，语义完全不同。同是「查询结果与预期不符」的排查，[跨查询粒度错位导致的悬空引用](/blog/sql-cross-query-granularity-mismatch)是另一类高频根因，可以对照着看。

<InfoBox variant="warning" title="注意事项">

- **存量数据先摸底再改判定**：用 `jsonb_typeof(...) = 'null'` 跑一遍全表，确认 JSON null 行的规模和来源，再决定是修查询还是修写入方。
- **团队内统一写法**：即便某字段当前恒为合法数组、`IS NOT NULL` 暂时不会出错，也统一用 `jsonb_typeof` 断言——字段语义一变，宽松写法就是静默错误。
- **ORM/驱动层同理**：应用代码里判「JSON 字段非空」时，注意驱动把 JSON null 映射成什么（多数语言映射为语言级 null/None），别把两层空混为一谈。

</InfoBox>

## 常见问题

### PostgreSQL jsonb 里 JSON null 和 SQL NULL 有什么区别？

JSON null 是合法的 jsonb 值，SQL NULL 表示「值不存在」。实测 `('{"a":null}'::jsonb -> 'a') IS NOT NULL` 返回 true；`jsonb_typeof` 对前者返回字符串 `'null'`，对缺键返回 SQL NULL。

### 为什么 jsonb 字段 IS NOT NULL 过滤不掉空值？

`->'key'` 对 JSON null 返回的是合法 jsonb 值而非 SQL NULL，`IS NOT NULL` 自然为 true。要判「有真值」用 `jsonb_typeof(字段->'key') = 'array'` 这类类型断言，要判「键存在」用 `?` 操作符。

### jsonb 怎么判断键存在还是值为 null？

键存在用 `?` 操作符：`'{"a":null}'::jsonb ? 'a'` 为 true，不受值是否为 null 影响。值为 JSON null 时 `jsonb_typeof` 返回 `'null'`，缺键时返回 SQL NULL——二者据此区分。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
