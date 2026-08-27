---
title: "Clicking One Row Highlights Many in Ant Design Table? Your rowKey Isn't Unique"
description: "When rowKey isn't the data's real business key, multiple rows generate identical React keys: clicking one row highlights the whole group and the console floods with duplicate key warnings. Check information_schema for the real columns and configure a unique composite key."
date: 2026-08-28
tags: [React, Ant Design, Table, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How should I set rowKey on an Ant Design Table?"
    a: "Use the field — or combination of fields — that uniquely identifies a row. Never use a non-unique business field or a bare index. If no single field is unique, build a composite key from multiple columns and verify uniqueness with GROUP BY HAVING."
  - q: "How do I fix the React duplicate key warning?"
    a: "Duplicate keys make React treat multiple nodes as the same element, corrupting rendering and state. Find the list rendering site, switch to a truly unique key, and verify uniqueness at the data source — warnings must go to zero."
---

Clicking a table row on a reporting page to inspect details, the clicked row — plus several other rows — highlighted at the same time, while the console flooded with React duplicate key warnings.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analysis that surfaces market trends, user behavior, and sales insights to drive precise operations strategy. The ad weekly-report page contains several detail tables (campaign × keyword, campaign × area), each supporting click-to-highlight so users can drill into a row's delivery details. After launch, clicking any row "lit up" every row under the same campaign.

## TL;DR

Ant Design's `Table` uses the return value of `rowKey` as each row's React key. When that field isn't the data's **real business key** — guessed by naming, or missing a dimension that participates in uniqueness — multiple rows generate identical keys: every key-matched row interaction (selection, highlight, expansion) hits multiple rows at once, and React throws duplicate key warnings. The fix: query `information_schema` for the table's actual columns, pick a truly unique column or composite columns for `rowKey`, and verify with `GROUP BY HAVING`.

## The Symptom

A minimal reproduction (Ant Design 5 + React 18):

```tsx
import { Table } from 'antd';
import { useState } from 'react';

// Data granularity: keyword × product — one keyword splits into multiple rows per promoted product
const data = [
  { keyword_id: 88, keyword: 'summer dress', offer_id: 101, clicks: 12 },
  { keyword_id: 88, keyword: 'summer dress', offer_id: 102, clicks: 7 },
  { keyword_id: 90, keyword: 'maxi skirt', offer_id: 103, clicks: 5 },
];

export default function WeeklyKeywords() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Table
      rowKey={(r) => String(r.keyword_id)} // Pitfall: keyword_id is not unique at this granularity
      columns={[
        { title: 'Keyword', dataIndex: 'keyword' },
        { title: 'Product', dataIndex: 'offer_id' },
        { title: 'Clicks', dataIndex: 'clicks' },
      ]}
      dataSource={data}
      rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
      onRow={(r) => ({ onClick: () => setSelected([String(r.keyword_id)]) })}
    />
  );
}
```

Two symptoms: clicking the first row highlights both rows with `keyword_id` 88, and the console repeatedly prints:

```text
Warning: Encountered two children with the same key, `88`.
Keys should be unique so that components maintain their identity across updates.
```

## Root Cause

**An antd Table row's identity is exactly the return value of `rowKey`.** It becomes the React key of that row's element. When keys duplicate, React's diff treats multiple rows as the same element: rendering can go wrong and controlled state bleeds between rows.

**Every key-matched row interaction gets amplified.** `rowSelection`'s `selectedRowKeys`, `onRow` clicks, and `expandedRowKeys` all match by key — with duplicate keys, one match hits multiple rows. That's the direct cause of "click one, highlight many."

**The wrong key column usually comes from the data side.** The actual root cause here: key columns were guessed from naming — we assumed the area table had `region_id`, but its real business key column was `area_name`; we assumed the keyword table's granularity was keyword, but it was actually keyword × product (`offer_id` also participates in the unique key). Miss one dimension and every row in a group shares the same rowKey.

## The Fix

### Step 1: Query the table's actual columns — don't guess from names

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ad_weekly_keywords'
ORDER BY ordinal_position;
```

Confirm which columns actually form the business key, and whether the column you assumed even exists.

### Step 2: Verify the key (or key combination) is unique

```sql
SELECT keyword, offer_id, COUNT(*)
FROM ad_weekly_keywords
GROUP BY keyword, offer_id
HAVING COUNT(*) > 1;
-- 0 rows = unique; also confirm key columns contain no NULLs
```

### Step 3: Configure rowKey with a composite key

```tsx
<Table
  rowKey={(r) => `${r.keyword}::${r.offer_id}`}
  // Or even safer: JSON.stringify([r.keyword, r.offer_id])
  dataSource={data}
  ...
/>
```

When concatenating composite keys, use a separator that cannot appear in the field values (or just `JSON.stringify` the array) to avoid collisions between `a + b` and `ab`.

After the change, clicking a row highlights only that row, and duplicate key warnings drop to zero. This is the same family of problems as [React list key duplicates causing DOM errors](/blog/react-list-key-duplicate-fix) — only with unique keys can diffing and row interactions be correct.

<InfoBox variant="warning" title="Heads up">
Before choosing key columns, query `information_schema` for the table's actual columns — don't guess from field names: business key columns can differ entirely from intuition (the table has only `area_name`, no `region_id`; keyword granularity is actually keyword × product).

The duplicate key warning is not "just a warning": it means React reconciliation is broken — row state bleeding, wrong highlights, and updates not taking effect can all follow. It must go to zero.

After changing `rowKey`, re-verify uniqueness with `GROUP BY ... HAVING COUNT(*) > 1`, and check key columns for NULLs — NULL keys create duplicates too.
</InfoBox>

## FAQ

### How should I set rowKey on an Ant Design Table?

Use the field — or combination of fields — that uniquely identifies a row: a single unique field works directly; if no single field is unique, build a composite key from multiple columns (with a collision-proof separator or `JSON.stringify`). Never use a non-unique business field, and don't take shortcuts with array index — after sorting, filtering, or pagination, state will bleed between rows.

### How do I fix the React duplicate key warning?

Duplicate keys make React treat multiple nodes as the same element, corrupting rendering and state. Locate the list rendering site producing the duplicate keys, switch to a truly unique key, then verify uniqueness at the data source with `GROUP BY HAVING` — silencing the warning without checking the data means the problem will resurface in another form.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
