---
title: "Ant Design Table 点击一行却多行同时高亮？rowKey 不唯一"
description: "rowKey 取的字段不是数据真实业务键时，多行生成相同 React key：点击一行整组高亮、控制台刷 duplicate key 警告。查 information_schema 确认真实列，配置唯一复合键即可修复。"
date: 2026-08-28
tags: [React, Ant Design, Table, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Ant Design Table 的 rowKey 应该怎么设置？"
    a: "设置为数据中唯一标识一行的字段或字段组合，别用不唯一的业务字段，也别默认 index。单字段不唯一时用多列拼接复合键，并用 GROUP BY HAVING 验证唯一性。"
  - q: "React duplicate key 警告怎么解决？"
    a: "key 重复意味着 React 把多个节点当成同一个元素，渲染与状态都会串。找到列表渲染处换成真正唯一的 key，并从数据源侧验证唯一性，警告必须清零。"
---

在数据报表页面点击表格某一行查看详情时，被点的行和另外几行同时高亮，控制台还在不停刷 React duplicate key 警告。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。广告周报页面里有多张明细表（计划×关键词、计划×地域），每张表都要支持点击行高亮、联动查看该行的投放明细。上线后点任意一行，同一计划下的所有行会一起「点亮」。

## TL;DR

Ant Design 的 `Table` 用 `rowKey` 的返回值作为每行的 React key。当 `rowKey` 取的字段不是数据的**真实业务键**——列名凭猜测、或漏了参与唯一性的维度——多行会生成相同的 key：所有按 key 匹配的行交互（选中、高亮、展开）一次命中多行，React 还会抛出 duplicate key 警告。修法：先用 `information_schema` 查表的真实列，再选定真正唯一的列或复合列做 `rowKey`，并用 `GROUP BY HAVING` 验证。

## 问题现象

下面是一个最小复现（Ant Design 5 + React 18）：

```tsx
import { Table } from 'antd';
import { useState } from 'react';

// 数据粒度：关键词 × 商品 —— 同一个关键词会按推广商品拆成多行
const data = [
  { keyword_id: 88, keyword: 'summer dress', offer_id: 101, clicks: 12 },
  { keyword_id: 88, keyword: 'summer dress', offer_id: 102, clicks: 7 },
  { keyword_id: 90, keyword: 'maxi skirt', offer_id: 103, clicks: 5 },
];

export default function WeeklyKeywords() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Table
      rowKey={(r) => String(r.keyword_id)} // 坑：keyword_id 在该粒度下不唯一
      columns={[
        { title: '关键词', dataIndex: 'keyword' },
        { title: '商品', dataIndex: 'offer_id' },
        { title: '点击量', dataIndex: 'clicks' },
      ]}
      dataSource={data}
      rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
      onRow={(r) => ({ onClick: () => setSelected([String(r.keyword_id)]) })}
    />
  );
}
```

症状有两个：点击第一行，前两行（`keyword_id` 都是 88）同时高亮；控制台反复出现：

```text
Warning: Encountered two children with the same key, `88`.
Keys should be unique so that components maintain their identity across updates.
```

## 根因

**antd Table 的行身份就是 `rowKey` 的返回值。** 它被直接用作该行 React 元素的 key。key 重复时，React 的 diff 会把多行视为同一个元素：渲染可能错乱，受控状态会在行间互相串。

**所有按 key 匹配的行交互都会被放大。** `rowSelection` 的 `selectedRowKeys`、`onRow` 点击、`expandedRowKeys` 全部按 key 比较——key 重复时一次匹配命中多行，这就是「点一行亮一片」的直接原因。

**键列选错往往发生在数据侧。** 这次的实际根因：键列是凭命名猜测的——以为地域表有 `region_id`，表里实际的业务键列是 `area_name`；以为关键词表的粒度是关键词，实际是关键词×商品（`offer_id` 也参与唯一键）。键列漏配维度，同组所有行的 rowKey 就完全相同。

## 解决方案

### 第一步：查表的真实列，别凭命名猜

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ad_weekly_keywords'
ORDER BY ordinal_position;
```

确认业务键到底是哪些列，表里是否真的存在你以为的那一列。

### 第二步：验证键（或键组合）唯一

```sql
SELECT keyword, offer_id, COUNT(*)
FROM ad_weekly_keywords
GROUP BY keyword, offer_id
HAVING COUNT(*) > 1;
-- 返回 0 行 = 唯一；同时确认键列无 NULL
```

### 第三步：用复合键配置 rowKey

```tsx
<Table
  rowKey={(r) => `${r.keyword}::${r.offer_id}`}
  // 或者更稳：JSON.stringify([r.keyword, r.offer_id])
  dataSource={data}
  ...
/>
```

拼接复合键时用一个字段值里不可能出现的分隔符（或直接 `JSON.stringify` 成数组），避免 `a + b` 与 `ab` 撞键。

改完后行点击只高亮一行，duplicate key 警告清零。这和[React 列表 key 重复导致 DOM 报错](/blog/react-list-key-duplicate-fix)是同一族问题——key 唯一，diff 与行交互才谈得上正确。

<InfoBox variant="warning" title="注意事项">
定键列之前先查 `information_schema` 的实际列，别凭字段命名猜测：业务键列可能和直觉完全不同（表里只有 `area_name` 没有 `region_id`；关键词粒度实际是关键词×商品）。

duplicate key 警告不是「警告而已」：它意味着 React 调和出错，行状态互串、高亮错乱、更新不生效都可能发生，必须清零。

换完 `rowKey` 后用 `GROUP BY ... HAVING COUNT(*) > 1` 复核唯一性，并检查键列是否有 NULL——NULL 键同样会制造重复。
</InfoBox>

## 常见问题

### Ant Design Table 的 rowKey 应该怎么设置？

设置为数据中唯一标识一行的字段或字段组合：单字段唯一就直接用，单字段不唯一就用多列拼复合键（分隔符防撞或 `JSON.stringify`）。别用不唯一的业务字段，也别图省事用数组 index——排序、筛选、分页后状态会串行。

### React duplicate key 警告怎么解决？

key 重复意味着 React 把多个节点当成同一个元素，渲染错乱、状态互串。先定位产生重复 key 的列表渲染处，换成真正唯一的 key，再从数据源侧用 `GROUP BY HAVING` 验证唯一性——只消警告不查数据，问题迟早换个形式复发。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
