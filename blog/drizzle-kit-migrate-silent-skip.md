---
title: "drizzle-kit migrate 表没建？journal 静默跳过与迁移属主排查"
description: "drizzle-kit migrate 退出 0 但表没建：journal 与表结构脱节、超级用户属主卡住 policy 应用。账本计数核对、psql ON_ERROR_STOP 直灌、OWNER 归位三步排查。"
date: 2026-11-13
tags: [Drizzle, PostgreSQL, Node.js]
authors: [cclee]
image: "/images/blog/drizzle-kit-migrate-silent-skip-architecture.webp"
schema: FAQPage
faqs:
  - q: "drizzle-kit migrate 显示 applying 但表没建怎么办？"
    a: "journal 与表结构脱节了。两个计数对账：SELECT count(*) FROM drizzle.__drizzle_migrations; 要等于迁移文件数，再用 information_schema.tables 确认关键表真实存在。对不上就用 psql -v ON_ERROR_STOP=1 直灌缺失的 SQL，并按既有行格式补 journal（hash 用 SQL 文件的 sha256）。"
  - q: "RLS 表上建外键报 unrecognized configuration parameter \"app.tenant_id\"？"
    a: "外键的 RI 校验触发器会以一条没注入租户上下文的连接扫描被引用表，policy 里的 current_setting('app.tenant_id')（不带 missing_ok）直接抛错。policy 改成 current_setting('app.tenant_id', true)——第 2 个参数就是 missing_ok：未注入时返回 NULL、匹配不到任何行，外键校验能过，隔离语义不变。"
  - q: "apply-policies 报 must be owner of table 怎么修？"
    a: "表属主不是迁移角色——历史表可能是超级用户手工建的。用超级用户把属主归位：ALTER TABLE … OWNER TO owner 角色；然后 SELECT tablename FROM pg_tables WHERE tableowner <> 'owner 角色'; 必须返回 0 行，再重跑 policy 应用。"
---

在给多租户系统上线一批新表时，部署机上的 drizzle-kit migrate 打印完 applying migrations 就安静退出，退出码 0；紧接着应用启动，第一条查询就报表不存在。

在一个 Node.js + PostgreSQL 多租户系统（Drizzle ORM 管迁移，行级安全隔离租户数据，drizzle-orm 0.45.4 / drizzle-kit 0.31.11）的部署链路里遇到。

<!-- TODO 产品建立后回填来源说明：在开发 [产品名](产品文档链接) 时踩到 Drizzle 迁移链路的一个行为——{业务价值} -->

## TL;DR

退出码 0 不代表迁移生效。drizzle-kit 的 journal（`drizzle.__drizzle_migrations` 账本）和数据库里真实的表是两本账：账本说应用过了，表没建，后续迁移就永远跳过。排查三步：对账（journal 条数 = 迁移文件数，关键表在 information_schema 里真实存在）→ 缺的直接用 `psql -v ON_ERROR_STOP=1` 补灌、账本手工补行 → 属主不对的表 OWNER 归位。部署链路上我们把 drizzle-kit migrate 退役了，换成「逐文件直灌 + 记账 + 核对失败即停」的 owner 通道。

## 问题现象：三个报错，退出码都是 0

症状有三层，前两层发生在迁移命令、第三层发生在它之后——共同点是命令层面都没有失败信号。如果你搜的是「drizzle migrate not working」「migrations applied but no tables」「迁移没生效」「must be owner of table」，往下看。

**症状一：迁移打印 applying 后退出 0，表不存在。**

```text
$ drizzle-kit migrate
...
applying migrations...
$ echo $?
0
```

本地 dev 库第一次遇到的是「journal 记了、表没建」——某次迁移中途被打断留下残局，之后每次 migrate 都把这批当作已应用直接跳过。生产环境同款问题换了形态复发：0019 号迁移退出 0，既没应用、账本也没记上。

**症状二：建外键时冒出与迁移无关的报错。**

```text
ERROR:  unrecognized configuration parameter "app.tenant_id"
```

**症状三：外键建完跑 policy 应用脚本，又卡住。**

```text
ERROR:  must be owner of table conflict_events
```

三个报错其实是同一条部署链上的三段。

## 根因：drizzle-kit migrate 的账本与表结构是两本账

**journal 记录的是「已记账」，不是「表已存在」。** drizzle-kit migrate 读迁移目录下的 SQL 文件、对照 `drizzle.__drizzle_migrations` 里的 hash 决定跳过哪些——判定输入只有账本。一旦出现「账本有行、表没建成」的中间态（最典型是迁移中途被打断），后续每一次 migrate 都认为这批已应用，直接跳过：不报错、退出码 0。生产上 0019 的形态相反——账没记上也没应用，但暴露方式相同：都是靠账本核对这道闸发现的，命令本身没有任何信号。

说直白点：这是「状态判定只看账本」的设计，账本被污染或没写入时，drizzle-kit 层面没有任何线索。至于为什么正常路径上会静默跳过，命令不解释；我们最后的选择是不再在部署路径上信任它的判定（取舍见解决方案）。

## 外键撞上 RLS：RI 校验用的连接没有租户上下文

**外键校验触发器读被引用表时，不会带上应用里的租户注入。** 多租户表的行级安全（Row Level Security，RLS）policy 用 `current_setting('app.tenant_id')` 读会话变量过滤行。可引用完整性（Referential Integrity，RI）校验是数据库内部的触发器扫描：它走一条没有 SET 过 `app.tenant_id` 的裸连接，current_setting 拿不到值直接抛 unrecognized configuration parameter——不是外键写错了，是 policy 在这条裸连接上先炸。

修法一行：policy 里的读取全部改成带 missing_ok 的形式：

```sql
current_setting('app.tenant_id', true)  -- 未注入返回 NULL
```

NULL 在 policy 里匹配不到任何行（等于拒绝），隔离语义不变，RI 校验的裸连接也不再炸。RLS 库加外键的顺序因此固定为：先改 policy，再建 FK。

## 属主错位：超级用户建的表挡住 policy 应用

**policy 只能属主改，历史表的属主可能不是迁移角色。** apply-policies 报 must be owner of table 的三张表（conflict_events、equipments、vendors），都是更早时期以超级用户手工建的——属主是 postgres，不是迁移用的 owner 角色。RLS 的 CREATE POLICY 要求执行者是表属主，属主不对，15 个 policy 文件的应用整段卡死。

归位一句：

```sql
ALTER TABLE conflict_events OWNER TO app_owner;
```

顺手全库体检，这条查询必须返回 0 行：

```sql
SELECT tablename FROM pg_tables WHERE tableowner <> 'app_owner';
```

## 解决方案：对账 → 补账 → 归位 → 部署固化

0019 那次的处理顺序是：先修 policy 再建外键，结果 apply-policies 又被属主挡住——归位三张表后 15 个 policy 全部过掉，回头一查 journal 才发现 0019 根本没应用没记账。后来 0020 在同一条部署链上又静默跳过一次，这次部署入口的账本核对直接拦停，半途状态没上到线。两次复发之后，部署链路上的迁移应用改成了固定形态：

1. **对账**（每次迁移后的固定动作）：

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;
-- 必须等于 drizzle/ 目录下的迁移文件数

SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- 关键表必须真实存在
```

2. **补账**：账本缺行的，把对应 SQL 用 owner 角色直灌，再补 journal 行：

```bash
psql -v ON_ERROR_STOP=1 -U app_owner -d appdb < drizzle/0019_missing.sql
# journal 补行：hash = SQL 文件全文 sha256；created_at 用 epoch 秒（bigint），与既有行同型
```

3. **归位**：查属主、`ALTER TABLE … OWNER TO app_owner`（上一节），再重跑 policy 应用。

4. **部署固化**：迁移从「跑一次 drizzle-kit migrate」换成逐文件循环——每个文件直灌、失败即停，记账 hash 在服务器端算，收尾统一核对 journal 条数：

```bash
for tag in $pending; do
  psql -v ON_ERROR_STOP=1 -U app_owner -d appdb < "drizzle/$tag.sql"
  hash=$(sha256sum "drizzle/$tag.sql" | cut -d' ' -f1)
  psql -d appdb -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                    VALUES ('$hash', extract(epoch from now())::bigint)"
done
# 收尾核对：journal 条数 = 本地迁移文件数，不等就终止部署
```

![部署迁移的 owner 通道：直灌、记账、双核对](/images/blog/drizzle-kit-migrate-silent-skip-architecture.webp)

取舍：为什么不留着 drizzle-kit migrate？部署要的不是「工具替我判断」，而是「应用结果可核对、任何一步失败就停」。逐文件直灌把每个动作变成可断言的原子操作，账本核对把「静默跳过」变成显式失败。本地开发仍然用 package.json 里的 `db:migrate`（drizzle-kit migrate 加 policy 应用），退役的只是部署用法，不是工具本身。

这条 owner 通道防的是「账本 vs 表结构」脱节；账本自身也会被改坏——`_journal.json` 的 `when` 被手改成未来时间戳后，账本水位 `max(created_at)` 把后续迁移永久压在下面，裸 SQL 文件不登记 journal 就永远不进 pending 名单。两个形态与修复见姊妹篇 [drizzle 迁移报成功却没执行？journal 水位与漏登记两个静默坑](/blog/drizzle-journal-future-timestamp-silent-skip)。

同样的「迁移看似完成」家族，SQLAlchemy 那边有 [Alembic 三个迁移坑](/blog/alembic-migration-three-pitfalls)（async 引擎误用、版本链断链、改模型不建迁移）；表存在性、属主这类核对想系统化，可以看 [information_schema 审计孤儿表的思路](/blog/postgresql-information-schema-audit-orphan-tables)。

<InfoBox variant="warning" title="注意事项">

- **每次迁移后必查双核对**：journal 条数 = 迁移文件数、关键表在 information_schema 里存在。两个都过才算迁移完成，只看命令退出码不够。
- **手工补 journal 要对齐既有行的格式**：hash 用 SQL 文件全文的 sha256，created_at 是 epoch 秒的 bigint——和 drizzle-kit 自己写入的类型保持一致，混格式会让后续对账失真。
- **迁移永远用 owner 角色跑**：超级用户跑出来的表属主是超级用户，下一轮 policy 应用必卡。「新表属主检查」该进迁移收尾清单。

</InfoBox>

## 常见问题

### drizzle-kit migrate 显示 applying 但表没建怎么办？

journal 与表结构脱节了。两个计数对账：`SELECT count(*) FROM drizzle.__drizzle_migrations;` 要等于迁移文件数，再用 information_schema.tables 确认关键表真实存在。对不上就用 `psql -v ON_ERROR_STOP=1` 直灌缺失的 SQL，并按既有行格式补 journal（hash 用 SQL 文件的 sha256）。

### RLS 表上建外键报 unrecognized configuration parameter "app.tenant_id"？

外键的 RI 校验触发器会以一条没注入租户上下文的连接扫描被引用表，policy 里的 `current_setting('app.tenant_id')`（不带 missing_ok）直接抛错。policy 改成 `current_setting('app.tenant_id', true)`——第 2 个参数就是 missing_ok：未注入时返回 NULL、匹配不到任何行，外键校验能过，隔离语义不变。

### apply-policies 报 must be owner of table 怎么修？

表属主不是迁移角色——历史表可能是超级用户手工建的。用超级用户把属主归位：`ALTER TABLE … OWNER TO owner 角色;` 然后 `SELECT tablename FROM pg_tables WHERE tableowner <> 'owner 角色';` 必须返回 0 行，再重跑 policy 应用。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
