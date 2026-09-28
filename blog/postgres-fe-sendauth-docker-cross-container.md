---
title: "跨容器连 PostgreSQL 报 fe_sendauth？exec 免密≠TCP 免密"
description: "docker exec 进 DB 容器 psql 免密能连，跨容器 TCP 却报 fe_sendauth: no password supplied——socket 走 trust、TCP 走密码认证。DSN 带上密码即解，这不是密码错误。"
date: 2026-09-28
tags: [Docker, PostgreSQL, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "fe_sendauth: no password supplied 是什么意思？"
    a: "服务端 pg_hba.conf 要求密码认证，但客户端连接串里没有提供密码。它不是「密码错误」（那是 authentication failed），是「没带密码」——检查 DSN 是否缺 password 部分。"
  - q: "为什么 docker exec 进容器 psql 不用密码就能连？"
    a: "容器内默认走 Unix domain socket，pg_hba 对本地 socket 配置了 trust 免密；跨容器是 TCP 连接，命中要求密码的 host 规则。同一套命令换个连接路径，认证要求完全不同。"
  - q: "容器里脚本连 PostgreSQL 的正确姿势是什么？"
    a: "DSN 显式带密码，如 postgresql://user:password@host:5432/db。密码从 DB 容器的 POSTGRES_PASSWORD 环境变量读取注入，不要硬编码，也不要指望 socket 免密在 TCP 上生效。"
---

在 DB 容器所在宿主机上 `docker exec` 进容器跑 psql，免密直连一切正常；同样的用户名换到另一个容器里走 TCP 连接，直接报 `fe_sendauth: no password supplied`。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。编排容器里的运维脚本要跨容器访问分析数据库，连接串照搬了 exec 习惯，第一跳就摔在认证上。

## 问题现象：exec 能连，TCP 报 fe_sendauth: no password supplied

同一台宿主机、同一个数据库、同一个用户，两种连法两种命运。实测三方对照（Airflow 容器 → PostgreSQL 容器）：

| 连接方式 | 结果 |
|----------|------|
| `docker exec cclhub-db psql -U postgres`（容器内 socket） | 免密直连成功 |
| 跨容器 TCP，DSN 不带密码 | `fe_sendauth: no password supplied` |
| 跨容器 TCP，DSN 带密码 | 连接成功 |

如果你搜的是「fe_sendauth no password supplied」「psql 不带密码报错」「docker 连 postgres 免密失败」，都是这一类。

## 根因：socket 免密与 TCP 密码认证是两条 pg_hba 路径

PostgreSQL 的认证由 `pg_hba.conf` 按连接类型逐条匹配，官方镜像的默认配置对两条路径给的是完全不同的规则：

- **容器内 `docker exec` 走 Unix domain socket**，对应 `local all all trust` 一类的规则——信任本地 socket，不问密码；
- **跨容器走 TCP（host 类型规则）**，官方镜像默认要求 scram-sha-256 / md5 密码认证。

于是「exec 免密」建立起来的连接习惯，到了 TCP 上就是缺密码——`fe_sendauth: no password supplied` 的字面意思正是「服务端要密码，客户端一个都没给」。

顺带把两个容易混淆的错误分开：**`no password supplied` 是没带密码，`password authentication failed` 是带了但错了**。前者查连接串里有没有 password，后者查密码对不对——对症的药不同。

## 解决方案：DSN 带密码，别照搬 exec 的连接习惯

跨容器脚本统一用带密码的连接串：

```bash
postgresql://postgres:<密码>@<db 主机>:5432/<库名>
```

密码来源推荐直接读 DB 容器的环境变量（官方镜像的 `POSTGRES_PASSWORD` 就是为初始化设置的），避免二次硬编码：

```bash
PW=$(docker exec cclhub-db printenv POSTGRES_PASSWORD)
psql "postgresql://postgres:${PW}@localhost:5432/postgres" -c "SELECT 1"
```

Python/应用侧同理，DSN 进环境变量管理：

```python
import os
import psycopg

DSN = os.environ["APP_DB_DSN"]  # postgresql://user:pass@host:5432/db
with psycopg.connect(DSN) as conn:
    conn.execute("SELECT 1")
```

注意 URL 里的密码若含 `@ : / #` 等保留字符需要百分号编码——又一个特殊字符咬人的场景，生成数据库密码时规避这类字符能省掉一整类麻烦。

## 边界与变体

- **报错形态随客户端变**：libpq 交互式终端（不带 `-t` 的 psql）会先提示 `Password for user postgres:` 再因无输入报 fe_sendauth；连接池、GUI 工具（如 pgAdmin）则直接在界面标认证失败——错误文本不同，根因相同。
- **`.pgpass` 文件与 `PGPASSWORD` 环境变量**是 DSN 之外的两种供密方式，容器场景里 DSN/env 注入比挂 .pgpass 文件更常见。
- **pg_hba 允许改成 trust 让 TCP 也免密**——技术上可行，生产环境不要做：任何能触达端口的进程都拿得到无凭据访问。
- **认证方法版本差异**：新版本官方镜像默认 scram-sha-256，老客户端库可能不支持——那是另一类错误（认证方法不支持），与本文的「没带密码」不同。

<InfoBox variant="warning" title="注意事项">

- **排障先看连接路径**：socket 还是 TCP、命中 pg_hba 哪条规则，决定了要不要密码——别把 exec 的行为当成全局行为。
- **错误语义要分清**：`no password supplied`（没带）与 `authentication failed`（带错）的修复动作完全不同。
- **DSN 里的密码做特殊字符规避或百分号编码**，URL 保留字符会静默改变解析结果。

</InfoBox>

## 常见问题

### fe_sendauth: no password supplied 是什么意思？

服务端 pg_hba.conf 要求密码认证，但客户端连接串里没有提供密码。它不是「密码错误」（那是 authentication failed），是「没带密码」——检查 DSN 是否缺 password 部分。

### 为什么 docker exec 进容器 psql 不用密码就能连？

容器内默认走 Unix domain socket，pg_hba 对本地 socket 配置了 trust 免密；跨容器是 TCP 连接，命中要求密码的 host 规则。同一套命令换个连接路径，认证要求完全不同。

### 容器里脚本连 PostgreSQL 的正确姿势是什么？

DSN 显式带密码，如 `postgresql://user:password@host:5432/db`。密码从 DB 容器的 `POSTGRES_PASSWORD` 环境变量读取注入，不要硬编码，也不要指望 socket 免密在 TCP 上生效。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
