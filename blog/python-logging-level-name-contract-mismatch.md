---
title: "监控漏报 38 行日志？Python 的 WARNING 不等于契约里的 warn"
description: "logs 表里 38 行 level='warning'，监控按契约级名 warn 过滤全部漏掉。Python stdlib 的 WARNING/CRITICAL 与跨语言契约的 warn/fatal 对不上，需在出口单点归一化；契约文档照抄实现是漂移根源。"
date: 2026-08-28
tags: [Python, Logging, DevOps, 监控]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Python 的 WARNING 为什么不能直接写进日志表？"
    a: "stdlib 级名是 WARNING/CRITICAL，而跨语言契约通常定义 warn/fatal。直写或简单 lower() 会产出 warning/critical，消费方按契约级名过滤时这些行全部匹配不上，形成静默漏报。"
  - q: "WARNING 和 WARN 是同一个级别吗？"
    a: "语义相同、字面不同。Python 没有 WARN 级别（WARN 只是废弃别名），logging 输出的字面量是 WARNING。契约采用 warn 时，必须在写出口做映射，而不是让每个消费方兼容两种拼写。"
  - q: "怎么发现日志契约和实现已经漂移？"
    a: "定期跑对账查询：按 level 列分组统计各服务产出，出现契约之外的拼写（warning/critical）即为漂移。契约文档要写『应该的实现』而非复制现状，否则错误会借契约之名传播。"
---

排查一个监控漏报：server-monitor 按日志级别 `warn` 过滤告警，但 `logs` 表里有 38 行告警级日志的 level 写的是 `warning`——过滤条件一个字符都对不上，这 38 行在监控眼里不存在。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析平台，自动洞察市场趋势、用户行为与销售数据；server-monitor 是它的告警模块，消费四个服务共写的一张日志表。

## TL;DR

跨语言日志契约定义的级名是小写 `warn/fatal`，而 Python stdlib 的 `record.levelname` 是 `WARNING/CRITICAL`——直写或简单 `.lower()` 产出的是 `warning/critical`，按契约过滤永远匹配不上。修复原则两条：**在写出口做单点映射**（`WARNING→warn`、`CRITICAL/FATAL→fatal`），别让每个消费方兼容多种拼写；**契约文档写「应该的实现」而不是复制现状**——这次漂移能长期存在，正因为契约文档的 Python 列照抄了错误实现。

## 问题现象

四个服务写同一张 `logs` 表，契约规定 `level` 取值：`debug / info / warn / error / fatal`。对账查询：

```sql
SELECT service, level, count(*)
FROM logs
GROUP BY service, level ORDER BY 1, 2;
```

结果里混着契约之外的拼写：

```text
 service    | level    | count
------------+----------+-------
 ai-dag     | warning  |    21   ← 契约里没有
 rag-service| warning  |    17   ← 契约里没有
 ...        | warn     |   ...   ← 这才是契约级名
```

监控按 `level = 'warn'` 过滤，这 38 行告警级日志静默蒸发。

## 根因

第一层是**字面差异**：Python stdlib 的级别体系是 `DEBUG / INFO / WARNING / ERROR / CRITICAL`——没有 `WARN`（那是个废弃别名），也没有 `FATAL`。两服务把 `record.levelname` 直接送进了日志表：一个原样写（大写 `WARNING`），一个 `.lower()` 后写（`warning`）。无论哪种，和契约的 `warn` 都对不上。

第二层更值得警惕：**契约文档本身写着错误实现**。跨项目日志契约的字段对照表里，Python 两服务的 `level` 列写的就是「`record.levelname`」「`record.levelname.lower()`」——文档在描述现状，而不是规定应该怎样。于是错误实现拿到了「契约背书」，两个服务各自照做，谁也没怀疑。这和 [try/except 吞异常导致的静默失败](/blog/python-try-except-swallow-exception-silent-failure)是同一种危害形态：不出错、只是悄悄少东西，等发现时已经积了几十行漏报。

## 解决方案

### 步骤 1：出口单点映射

每个服务定义一个归一化函数，所有落库/输出路径统一走它：

```python
_LEVEL_NAME_MAP = {"WARNING": "warn", "CRITICAL": "fatal", "FATAL": "fatal"}

def normalize_level(levelname: str) -> str:
    """WARNING→warn、CRITICAL/FATAL→fatal，其余小写。"""
    return _LEVEL_NAME_MAP.get(levelname.upper(), levelname.lower())
```

```python
payload = {"level": normalize_level(record.levelname)}   # 永远产出契约级名
```

关键在「单点」：JSON formatter 和落库 handler 共用同一个函数，映射规则改一处即可，不存在第二个实现。

### 步骤 2：契约文档改为「应该的实现」

字段对照表里 Python 两服务的 `level` 列改为 `normalize_level(record.levelname)`，并新增一节「level 名映射」：写明映射规则、反模式（禁直写/禁裸 lower）、两个服务的函数入口。契约是规范，不是现状快照。

### 步骤 3：加对账查询，让漂移可发现

```sql
SELECT level, count(*) FROM logs
WHERE service IN ('ai-dag', 'rag-service')
GROUP BY level ORDER BY 2 DESC;
```

出现 `warn` 之外的拼写即漂移。这条查询可以进监控巡检，把「契约 vs 实现」从口头约定变成可断言的检查。

### 步骤 4：清洗存量（可选）

修复后新数据不再产生错误级名，存量 38 行按需处理：

```sql
UPDATE logs SET level = 'warn' WHERE level = 'warning';
```

量小可忽略（自然过期），量大或影响历史统计时统一 UPDATE。

<InfoBox variant="warning" title="注意事项">

- 归一化必须在**写出口**做，别指望消费方兼容多种拼写——消费方清单会持续增长（监控、告警、BI、排障脚本），每加一个消费方就多一处要兼容。
- 映射函数要覆盖非标级别：`CRITICAL→fatal`、`FATAL→fatal`，缺了这条，fatal 级告警会以 `critical` 的拼写漏过监控。
- 契约文档里每个「来源/实现」列都是规范的一部分：写下它之前先问一句「这是应该的写法，还是今天恰好是这么写的？」
- 跨服务日志的字段契约（级名、traceId、service 名）建议集中一处维护，四服务引用同一份，避免各写各的。

</InfoBox>

## 常见问题

### Python 的 WARNING 为什么不能直接写进日志表？

stdlib 级名的字面量是 `WARNING/CRITICAL`，跨语言契约通常定义为 `warn/fatal`——直写或 `.lower()` 得到的 `warning/critical` 在契约世界里是未知级别，所有按契约级名过滤的消费方（监控、告警）都会漏掉这些行。Python 侧必须在写出口映射成契约级名。

### WARNING 和 WARN 是同一个级别吗？

语义相同、字面不同。Python 的 logging 没有 `WARN` 级别（`WARN` 是废弃别名，实际输出永远是 `WARNING`），也没有 `FATAL`（对应 `CRITICAL`）。所以「小写一下」解决不了问题——需要在出口做显式映射：`WARNING→warn`、`CRITICAL→fatal`。

### 怎么发现日志契约和实现已经漂移？

定期按契约级名做对账查询（`GROUP BY level`），出现契约外的拼写即为漂移。更重要的是契约文档要写「应该的实现」并注明映射函数入口，而不是复制某个服务的现状——文档照抄实现，错误就有了背书，这是本次漂移存活已久的根源。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
