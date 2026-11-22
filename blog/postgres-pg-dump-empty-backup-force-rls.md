---
title: "Postgres pg_dump 备份没有数据？FORCE RLS 连 owner 也拦"
description: "pg_dump 只导出表结构、恢复库零行数据：FORCE RLS 把 owner 会话的 COPY 也拦了，备份照常产出文件。数据动作该走哪个通道、恢复演练行数判据怎么设计，一次讲清"
date: 2026-11-20
tags: [PostgreSQL, pg_dump, 数据库]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "pg_dump 备份只有表结构没有数据是怎么回事？"
    a: "表开了 FORCE ROW LEVEL SECURITY 时，连表 owner 的导出会话也要过一遍 RLS 策略；策略按租户上下文过滤，运维会话取不到租户 ID，COPY 被拦成空集。pg_dump 会打出 would be affected by row-level security 类报错，但仍然产出一份「只有结构」的备份文件——备份命令退出不报失败，数据其实一行都没进来。"
  - q: "备份的库恢复后没有数据怎么办？"
    a: "重新用超级用户导出：pg_dump -U postgres，超级用户天然绕过 RLS。恢复后做行数核对，别只看 pg_dump 退出码——同刻快照下各表行数应与生产绝对相等，活库在导出期间继续写入时才允许明确声明的容差。"
  - q: "数据迁移和备份分别该用哪个数据库角色跑？"
    a: "DDL（建表、加列、建索引）不受 RLS 管，owner 通道照常；数据动作（UPDATE、INSERT…SELECT 回填）和读全量数据的动作（pg_dump、统计）走超级用户，或逐租户 SET 租户上下文后执行。不建议给运维角色挂 BYPASSRLS——那等于把行级隔离在这个角色上整个放弃。"
---

在一个 Node.js + PostgreSQL 的多租户系统里做恢复演练：用业务 owner 角色跑 `pg_dump`，命令报了几行错但备份文件照常生成；拿这份备份恢复出一套演练库，一查行数——结构全在，数据零行。

## TL;DR

`FORCE ROW LEVEL SECURITY` 把 RLS 管到了表 owner 头上，而 `pg_dump` 的 COPY 属于数据访问——owner 会话没有租户上下文，策略恒为假，数据被滤成空集。pg_dump 会报 `query would be affected by row-level security policy` 但不中断，产出一份看似正常的空备份。数据类动作（回填、备份、全量统计）要么用超级用户执行，要么逐租户注入租户上下文；恢复演练的行数核对要能区分「结构齐」和「数据齐」。

## 问题现象：备份"成功"，恢复库是空的

恢复演练用 owner 角色跑 `pg_dump`：命令报了几行错、备份文件照常生成，恢复出的库结构齐全、数据零行。先看现场原始输出：

```text
$ pg_dump -U app_owner -Fc appdb -f drill.dump
pg_dump: warning: query would be affected by row-level security
         policy for table "attachments"
...（多张表各报一行）
$ echo $?
1
```

这几行看起来像警告，文件也生成了、体积不为零。直到把这份备份恢复进演练库再核对，问题才显形：所有业务表一行数据都没有，只有完整的表结构、索引和序列。

这之前还有一次同根因的预演。一批数据动作迁移（把某列的旧值清空）走 owner 通道直灌，部署记账全绿；事后用超级用户一查，目标列还剩 2 行没清掉——`UPDATE` 实际改了 0 行。更反直觉的是在 owner 会话里直接 `SELECT count(*)` 这张表：返回 **0**；换超级用户查：**6**。owner 连读都读不到行，而它明明是这张表的 owner。

两件事隔了几周、发生在不同环节（一次是迁移、一次是备份演练），根因是同一条。迁移侧还有一类与 RLS 无关的静默坑：[UPDATE FROM 里 lateral 引用目标表被拒、drizzle-kit 吞错零输出](/blog/postgres-update-from-lateral-invalid-reference)——解法是横向引用一律改 CTE 形态。

## 根因：FORCE RLS 为什么连 owner 和 pg_dump 都拦

RLS 策略管到 owner 头上后，owner 的数据访问和普通角色走同一套策略评估；pg_dump 的 COPY 就是一条 SELECT，一样被拦。三层叠出静默链：

**第一层：FORCE 让 owner 失去豁免。** 只 `ENABLE ROW LEVEL SECURITY` 的表，owner 默认豁免策略；多租户表通常再加 `FORCE ROW LEVEL SECURITY`——从此 owner 的每条行访问语句都要过策略。这是有意为之的隔离收紧，不是配置错误。

**第二层：运维会话取不到租户上下文。** 租户隔离策略的典型写法：

```sql
CREATE POLICY tenant_isolation ON tasks
  USING (tenant_id = current_setting('app.tenant_id', true));
```

`current_setting('app.tenant_id', true)` 第二个参数是 missing_ok：会话里没设过这个变量时返回 NULL 而不报错。NULL 参与比较恒为假——策略对所有行都不放行。如果当初不带 missing_ok，owner 会话会直接收到 `unrecognized configuration parameter` 报错，问题反而早暴露；missing_ok 把「没有上下文」变成了「静默零行」。

**第三层：pg_dump 的失败信号太弱。** 被 RLS 拦住的 COPY 会打 warning/error，但 pg_dump 不因此终止——它继续把能导的都导完，退出码非零、文件照常落盘。只检查「文件生成了没」的流程会把空备份当正常产出。DDL（建表、加列、建索引）不经过策略评估，所以同一批迁移里结构变更全部成功，数据动作全部静默零行。

## 解决方案：按动作类型分通道 + 判据设计

**通道决策只有一行原则：碰数据的动作，别用 owner 裸会话。**

| 动作 | 通道 |
|---|---|
| DDL 迁移（建表/加列/索引） | owner 通道照常 |
| 数据动作迁移（UPDATE/回填/清理） | 超级用户，或逐租户 `SET app.tenant_id` |
| 备份（pg_dump）、全量统计 | 超级用户 |
| 应用连接 | 业务角色 + 连接时注入租户上下文（RLS 正常生效） |

逐租户注入的形态：

```sql
SET app.tenant_id = 'tenant-a';
UPDATE ...;   -- 策略正常放行本租户的行
```

适合按租户循环的数据修补；一次性全量回填用超级用户更直接。

**备份修复只改一个字**：`pg_dump -U postgres`。改完重跑演练，这次核对能对上——迁移记录、五张关键表行数与生产全等、RLS 策略数量一致、表属主异常为 0。

**恢复演练的判据要防「结构齐 ≠ 数据齐」。** 这次演练差点被自己的判据放过去：核对项写的是「各表行数 ≤ 生产 + 租户表相等」，零行数据也满足 ≤。判据修正成两条：

1. 同刻快照（停写窗口内导出）→ 行数**绝对相等**；
2. 活库热导 → 允许容差，但容差必须显式声明并解释来源（导出期间的正常写入），零行数据不在任何容差范围内。

判据里再加上一句防呆：核心业务表行数为 0 直接判失败，不进容差讨论。

<InfoBox variant="warning" title="注意事项">

- `pg_dump` 退出码非零时不要只当警告处理——FORCE RLS 场景下它意味着数据没进备份，文件存在不等于备份可用。
- 别图省事给 owner 挂 `BYPASSRLS`：隔离对拥有迁移权限的角色同样重要，这正是当初选 FORCE 的原因；按动作选通道，比放宽角色权限安全。
- 自查现有流程只消一条命令：用各运维角色对核心表跑 `SELECT count(*)`，和超级用户的计数对不上就是中了这条。

</InfoBox>

同一条 FORCE RLS 静默链在数据回填场景的完整展开（三层机制、`INSERT 0 0` 的逐层拆解）写在了上一篇：[Postgres RLS 迁移全绿、回填 0 行？FORCE RLS 连表主一起拦](/blog/postgres-force-rls-owner-backfill-zero-rows)。两篇合起来是这个坑的完整地图：回填侧看第一篇，备份与判据侧看这篇。

## 常见问题

### pg_dump 备份只有表结构没有数据是怎么回事？

表开了 FORCE ROW LEVEL SECURITY 时，连表 owner 的导出会话也要过一遍 RLS 策略；策略按租户上下文过滤，运维会话取不到租户 ID，COPY 被拦成空集。pg_dump 会打出 would be affected by row-level security 类报错，但仍然产出一份「只有结构」的备份文件——备份命令退出不报失败，数据其实一行都没进来。

### 备份的库恢复后没有数据怎么办？

重新用超级用户导出：pg_dump -U postgres，超级用户天然绕过 RLS。恢复后做行数核对，别只看 pg_dump 退出码——同刻快照下各表行数应与生产绝对相等，活库在导出期间继续写入时才允许明确声明的容差。

### 数据迁移和备份分别该用哪个数据库角色跑？

DDL（建表、加列、建索引）不受 RLS 管，owner 通道照常；数据动作（UPDATE、INSERT…SELECT 回填）和读全量数据的动作（pg_dump、统计）走超级用户，或逐租户 SET 租户上下文后执行。不建议给运维角色挂 BYPASSRLS——那等于把行级隔离在这个角色上整个放弃。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
