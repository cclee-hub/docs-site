---
title: "Milvus 报 invalid collection name？collection 名首字符必须字母/下划线，UUID 不能直接拼"
description: "Milvus 报 invalid collection name（错误码 1100）：collection 名首字符必须字母或下划线、仅允许 [a-zA-Z0-9_]、禁连字符、≤255 字符；UUID 首字符为数字且含连字符，不能直接拼接作 collection 名。"
date: 2026-07-04
tags: [Milvus, 向量数据库, RAG]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Milvus collection 名有哪些命名规则？"
    a: "首字符必须是字母或下划线，其余字符仅允许字母、数字、下划线，禁连字符和空格，最长 255 个字符。违反则报 invalid collection name（code 1100）。"
  - q: "Milvus collection 名长度上限是多少？"
    a: "255 个字符。超出会被校验拒绝并报 invalid collection name（错误码 1100），collection 创建或寻址直接失败。"
  - q: "Milvus collection 名为什么不能用 UUID 作前缀？"
    a: "UUID 首字符常是数字、且含连字符 `-`，两点都违反命名规则。多租户隔离应把 tenant_id 放进普通字段或分区键，不要拼进 collection 名。"
---

在按租户给向量库的 collection 加前缀、用 `{tenant_id}_{collection}` 拼名时，第一个请求就被 Milvus 顶了回来——`invalid collection name: the first character ... must be an underscore or letter`，接口直接 500。

在开发 [AI客服](/docs/customer-service) 时遇到此问题——7×24小时AI客服，快速解答产品使用问题，提供功能指导和最佳实践。

## TL;DR

Milvus 对 collection 名有严格校验：首字符必须是字母或下划线、其余只允许 `[a-zA-Z0-9_]`（**禁连字符**）、长度 ≤255，违反就报 `invalid collection name`（错误码 1100）。UUID 首字符常是数字、且自带连字符 `-`，两点都踩雷，所以**不能把 tenant_id 这种 UUID 直接拼进 collection 名**做隔离。改用原始名 + tenant 字段过滤即可。

## 问题现象

带 `collection=system_product_help` 的查询接口返回 500，rag-service 日志只吐一行：

```
pymilvus.exceptions.MilvusException: code=1100,
Invalid collection name: 00000000-0000-0000-0000-000000000001_system_product_help.
the first character of a collection name must be an underscore or letter
```

诡异的是，同一参数的另一个纯查日志接口（`/query-logs`）却返回 200——因为它只读 PostgreSQL，根本没碰 Milvus；只有真正会去 Milvus `has_collection` 的路径才触发校验。

## 根因

代码里用 `f"{tenant_id}_{collection}"` 拼出 collection 名，例如 `00000000-0000-0000-0000-000000000001_system_product_help`。这个名字同时犯了两条规：

```text
00000000-0000-0000-0000-000000000001_system_product_help
^              ^ ^
│              │ └─ 下划线后 OK，但……
│              └─── 连字符 `-` 违规
└────────────────── 首字符是数字 `0` 违规（必须字母/下划线）
```

Milvus 的 collection 名校验规则（源码 `nameutil.go`，正则 `^[a-zA-Z_][a-zA-Z0-9_]*$`，长度 ≤255）：

| 规则 | 要求 |
|------|------|
| 首字符 | 字母或下划线 `_` |
| 其余字符 | 仅 `[a-zA-Z0-9_]`（字母、数字、下划线） |
| 禁止 | 连字符 `-`、空格、点号、其他特殊符号 |
| 长度 | 1–255 个字符 |

UUID 几乎必然违规：标准形式 `8-4-4-4-12` 含 4 个连字符，且首段常以数字开头。把这样的前缀拼到 collection 名上，`has_collection` / `describe_collection` / 创建语句都会被服务端拒掉，抛 code 1100。

更要命的是：因为拼出来的名从来就不合法，所谓的"按租户前缀隔离"从未真正生效过——库里实际存在的 collection 全是没前缀的原始名，拼接逻辑与真实数据系统性脱节，纯写代码时的一个想当然。

## 解决方案

**别把 tenant_id 拼进 collection 名。** collection 一律用原始名，租户隔离交给普通字段：

```python
from pymilvus import MilvusClient

client = MilvusClient(uri="http://localhost:19530")

# ❌ 错误：UUID 拼前缀，首字符是数字 + 含连字符 → code 1100
tenant_id = "00000000-0000-0000-0000-000000000001"
bad_name = f"{tenant_id}_system_product_help"   # 非法

# ✅ 正确：collection 用原始名，tenant_id 作为 schema 字段过滤
client.create_collection(
    collection_name="system_product_help",        # 合法、稳定
    schema=client.create_schema(auto_id=True, enable_dynamic_field=False),
)
# 写入与查询时用 tenant_id 字段做过滤，而不是改 collection 名
client.insert(
    collection_name="system_product_help",
    data=[{"tenant_id": tenant_id, "text": "...", "vector": [...]}],
)
```

如果你确实需要"一段可读前缀"做多租户或环境隔离，把任意字符串转成安全 slug 再拼：

```python
import re

def safe_slug(raw: str) -> str:
    # 非 [a-zA-Z0-9_] 一律替成下划线，首字符若非字母/下划线则补一个
    s = re.sub(r"[^a-zA-Z0-9_]", "_", raw)
    if not re.match(r"^[a-zA-Z_]", s):
        s = "_" + s
    return s[:255]   # 截到长度上限内

name = f"{safe_slug(tenant_id)}_system_product_help"   # 合法
```

排查这类 500 时，第一眼先看 PM2 / 服务日志里的 `MilvusException`——错误码和"first character must be ..."这句提示基本能直接定位到名字不合法，不必往业务逻辑深处找。

顺带一提，rag-service 这类依赖 Milvus 的服务，本身还有"容器没配 restart 策略、崩溃后整条 RAG 链路起不来"的坑，见 [Docker Compose 服务重启后起不来？检查 restart 策略](/blog/docker-compose-restart-policy-service-down)；混合检索那侧则要注意 [RRF 分数与相似度阈值不兼容](/blog/milvus-hybrid-search-rrf-threshold)。

## 注意事项

<InfoBox variant="warning" title="注意事项">

- **连字符是最隐蔽的坑**：很多团队习惯用 `tenant-env-docs` 这种 kebab-case 命名，在 Milvus 里全部非法。命名一律用下划线 `snake_case`。
- **不只是 collection 名**：database 名、partition 名、字段名的校验规则相近（首字符、允许字符集），用 UUID 或连字符拼接时都要先过一遍校验。
- **隔离用字段，不要用 collection 数量**：按租户各建一个 collection 会让 collection 数量随租户线性膨胀，超出 Milvus 管理舒适区。把 `tenant_id` 做成普通字段 + 过滤，或用 partition key，是更稳的隔离方式。
- **校验在服务端**：pymilvus 客户端不一定对每个调用都前置校验，非法名可能直到请求落到 Milvus 才报 1100，本地单测容易漏。

</InfoBox>

## 常见问题

### Milvus collection 名有哪些命名规则？

首字符必须是字母或下划线，其余字符仅允许字母、数字、下划线（`[a-zA-Z0-9_]`），禁止连字符和空格，最长 255 个字符。Milvus 在服务端用正则强制校验，违反就抛 `invalid collection name`（错误码 1100），创建和寻址都会失败。命名用 `snake_case` 最保险。

### Milvus collection 名长度上限是多少？

255 个字符。超出会被校验拒绝并报 `invalid collection name`（错误码 1100）。实际命名通常远短于此，真正卡上限的往往是把长 UUID 或多段路径拼了进去——这恰恰说明你不该把这类动态串拼进 collection 名。

### Milvus collection 名为什么不能用 UUID 作前缀？

UUID 标准形式首段常以数字开头（违反"首字符必须字母/下划线"），且自带 4 个连字符 `-`（不在允许字符集），两点都违反命名规则。把 tenant_id 拼成 collection 前缀做隔离是常见误用：不仅名字非法，还会让 collection 数量随租户膨胀。正确做法是把 tenant_id 放进普通字段或分区键，collection 用稳定的原始名。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
