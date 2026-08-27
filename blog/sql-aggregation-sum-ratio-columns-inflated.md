---
title: "SQL 聚合后指标暴涨几十倍？别直接 SUM 比率列"
description: "周聚合时对 CTR、PPC、ROI 等比率/均值列直接 SUM，结果是 7 天之和而非均值，指标放大几十倍。正确做法：聚合跳过比率列，聚合后用总量重算比率，分母不同用加权平均。"
date: 2026-08-28
tags: [SQL, PostgreSQL, 数据聚合, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "百分比可以直接 SUM 吗？"
    a: "不能。百分比/比率是相对值，各行分母不同，直接 SUM 得到的是 N 个相对值之和，放大 N 倍且无业务含义。要么聚合总量后重算比率，要么用分母作权重做加权平均。"
  - q: "百分比能加起来求平均吗？"
    a: "只有分母相同时才可以。分母不同的百分比直接平均等于不加权平均，会偏向分母小的项。正确做法是分别加总分子和分母，再相除（即加权平均）。"
---

在把按天返回的广告数据聚合成周报时，PPC、CPM、ROI 等比率指标暴涨几十倍——PPC 从日粒度实测的 4.70 变成了周报表里的 111.39。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。广告数据接口按天返回明细行，入库前要聚合成周粒度供报表消费。聚合上线后首查周报：PPC 111.39（日实测 4.70）、CPM 1585.9（日实测 68.6）、ROI 169.98（日实测 1.82）——13 个比率/均值列全部失真。

## TL;DR

聚合查询里对 CTR、PPC、ROI 这类**比率/均值列**直接 `SUM`，得到的是「每天比率的总和」而不是均值，数值按聚合天数成倍放大。两条规则：**聚合时只加总可加列**（展现、点击、花费等总量），跳过所有比率列；**聚合后用总量重算比率**（花费÷点击、点击÷展现）。如果手里只有比率没有总量，用分母作权重做加权平均，绝不简单平均。

## 问题现象

聚合代码对数值列「全部 SUM」，比率列被静默带进去：

```sql
-- 错误写法：所有列都 SUM
SELECT
  campaign_id,
  date_trunc('week', day) AS week,
  SUM(clicks)      AS clicks,
  SUM(impressions) AS impressions,
  SUM(ppc)         AS ppc,   -- 7 天日 PPC 之和！
  SUM(ctr)         AS ctr,   -- 7 天日 CTR 之和！
  SUM(roi)         AS roi    -- 7 天日 ROI 之和！
FROM daily_ad_report
GROUP BY campaign_id, date_trunc('week', day);
```

实测对比（某计划单周）：

| 指标 | 日粒度实测 | SUM 周值 | 放大倍数 |
|------|-----------|---------|---------|
| ppc  | 4.70      | 111.39  | ~24×    |
| cpm  | 68.6      | 1585.9  | ~23×    |
| roi  | 1.82      | 169.98  | ~93×    |

没有任何报错，数据照常入库，报表照常渲染——只有把周报和日明细并排对比，才能发现数值差了一到两个数量级。

## 根因

**比率与均值是不可加的派生量。** `ppc = cost / clicks` 的分母每天不同，把 7 天的日 PPC 直接相加，数学上得到的是「7 个相对值的和」，没有任何业务含义。CTR、ROI 同理。

**「全部数值列求和」是静默陷阱。** 聚合代码通常按列循环统一处理，比率列混在其中不报错、不告警，只是结果悄悄失真。列越多、比率列占比越高，越难肉眼发现。

**ROI 放大 93 倍反而更具迷惑性。** 它看起来像「投放效果极好」，如果下游直接消费周报做预算决策，错误的数字会一路传到运营动作里。这次事故里，下游还有只读消费方直接读这张周表——表值修对之前，所有消费方都在读错数据。

## 解决方案

### 第一步：聚合只保留可加列

```sql
CREATE VIEW weekly_ad_totals AS
SELECT
  campaign_id,
  date_trunc('week', day) AS week,
  SUM(impressions) AS impressions,
  SUM(clicks)      AS clicks,
  SUM(cost)        AS cost,
  SUM(gmv)         AS gmv
FROM daily_ad_report
GROUP BY campaign_id, date_trunc('week', day);
```

可加列的特征：它们是「计数/总量」（展现、点击、花费、订单数），跨时间区间相加仍有意义。

### 第二步：聚合后用总量统一重算比率

```sql
SELECT
  campaign_id,
  week,
  impressions,
  clicks,
  cost,
  CASE WHEN clicks > 0
       THEN cost / NULLIF(clicks, 0)::numeric
       ELSE 0 END AS ppc,
  CASE WHEN impressions > 0
       THEN clicks::numeric / NULLIF(impressions, 0)
       ELSE 0 END AS ctr,
  CASE WHEN cost > 0
       THEN (gmv - cost)::numeric / NULLIF(cost, 0)
       ELSE 0 END AS roi
FROM weekly_ad_totals;
```

两个细节：PostgreSQL 整数除法会截断，除法前先 `::numeric`；分母为 0 统一返回 0，保持与明细层口径一致。

### 第三步：只有比率、拿不到总量时用加权平均

```sql
-- 用展现量加权聚合日 CTR（展开式：SUM(ctr × impressions) / SUM(impressions)）
SELECT
  date_trunc('week', day) AS week,
  SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) AS ctr_weighted
FROM daily_ad_report
GROUP BY date_trunc('week', day);
```

加权平均的本质就是「还原分子分母再相除」——只要还拿得到权重列，就永远优先于简单平均。

改完后周报 13 个比率列全部与日明细实测一致，历史脏数据用同一套公式回填，下游只读消费方不改一行代码自动变对。

<InfoBox variant="warning" title="注意事项">
「所有数值列求和」的通用聚合代码是这类事故的源头：维护一份**可加列白名单**，比率/均值列显式排除，新增指标列时先回答「它跨天相加还有意义吗」。

多粒度报表（周报、月报）从同一张日表派生时，把「用总量重算比率」收敛成一个函数/视图，别在每份报表 SQL 里复制公式——口径漂移往往从复制开始。

修完聚合逻辑记得回填历史数据：聚合错误通常已持续多个周期，只改代码不回填，报表会继续展示旧错值。
</InfoBox>

## 常见问题

### 百分比可以直接 SUM 吗？

不能。百分比/比率是相对值，各行分母不同，直接 SUM 得到的是 N 个相对值之和，按聚合天数放大且无业务含义。正确做法是聚合时跳过比率列，聚合后用总量重算（点击÷展现、花费÷点击）；只有比率没有总量时，用分母作权重做加权平均。

### 百分比能加起来求平均吗？

只有分母相同时才可以。分母不同的百分比直接平均等于不加权平均，结果偏向分母小的项（小流量日的极端比率会被放大）。正确做法是分别加总分子和分母再相除，数学上等价于以分母为权重的加权平均。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
