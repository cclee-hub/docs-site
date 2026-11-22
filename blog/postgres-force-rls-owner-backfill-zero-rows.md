---
title: "Postgres RLS 迁移全绿、回填 0 行？FORCE RLS 连表主一起拦"
description: "多租户表开 FORCE RLS 后，owner 会话的数据回填 INSERT…SELECT 静默 0 行：租户策略把 SELECT 源滤成空集，DDL 迁移却照常成功。三条绕行通道与回填行数核对法"
date: 2026-11-15
tags: [PostgreSQL, SQL, 数据库]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "PostgreSQL 开了 RLS 为什么表主（owner）还能看到所有行？"
    a: "只执行 ENABLE ROW LEVEL SECURITY 时不约束表主——owner 对本表默认拥有全部行权限，RLS 策略只约束其他角色。要连 owner 一起管，必须再执行 ALTER TABLE … FORCE ROW LEVEL SECURITY，之后 owner 的每条行访问语句都要过一遍策略。"
  - q: "owner 会话 INSERT…SELECT 返回 INSERT 0 0 是什么意思？"
    a: "0 是实际插入行数——语句执行成功但一行都没插。FORCE RLS 下策略把 INSERT…SELECT 的 SELECT 源滤成了空集，没有行可插，也就不会触发 violates row-level security 类报错，全程无告警。"
  - q: "数据迁移怎么绕过 PostgreSQL 的 RLS？"
    a: "三条通道：用超级用户（如 postgres 角色）执行，超级用户天然绕过 RLS；给迁移角色挂 BYPASSRLS 属性；或在会话里逐租户 SET app.tenant_id 后执行，让策略正常放行。一次性回填推荐第一条，并做回填行数核对。"
  - q: "FORCE RLS 之后 DDL 迁移为什么还是正常的？"
    a: "RLS 只管行级访问（SELECT/UPDATE/DELETE 的可见性与写入），不管 DDL。CREATE TABLE、ALTER TABLE、建索引都不经过策略评估，所以同一批迁移里 DDL 全绿、DML 回填静默 0 行——两件事共用一条通道，行为却是分开的。"
---

在给多租户业务表跑一次性数据回填时，命令正常结束，返回值是 `INSERT 0 0`——基准里有 23 行该回填的数据，一行都没进去。而同一批部署里，建表和加列的迁移全部成功。

## TL;DR

`ENABLE ROW LEVEL SECURITY` 不约束表 owner，`FORCE ROW LEVEL SECURITY` 才连 owner 一起管。owner 的运维会话里没有 `app.tenant_id` 这种租户上下文，按租户过滤的策略恒为假，`INSERT…SELECT` 的 SELECT 源被滤成空集——语句成功、插入 0 行、没有任何报错。DDL 不经过 RLS，所以同一通道里迁移照常绿。数据型回填要么用超级用户执行，要么逐租户 `SET app.tenant_id`，并且必做「基准行数 vs 落库行数」核对。

## 问题现象

FORCE RLS 多租户表上，owner 会话的数据回填会静默插 0 行——语句成功、无报错、无告警，只看命令输出会以为任务完成了。下面是当时的真实过程。

场景是多租户 SaaS 的部署：一批迁移（建表、加列）走 owner 数据库通道直灌，全部成功；紧接着跑一条幂等回填，把旧单选列的数据搬进新子表：

```sql
INSERT INTO task_assignees (tenant_id, task_id, assignee_user_id, assignee_vendor_id)
SELECT tenant_id, id, assignee_user_id, assignee_vendor_id
FROM tasks
WHERE assignee_user_id IS NOT NULL OR assignee_vendor_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

用项目的 owner 角色（下称 `app_owner`）执行：

```
INSERT 0 0
```

语句成功退出，`ON_ERROR_STOP` 没触发，部署流程继续往下走。但用超级用户查基准，`tasks` 里旧列非空的任务有 23 个——回填等于没发生。如果只看命令是否成功，这一步就静默漏过去了。

更迷惑的是同一通道的前后对比：同一条 psql 管道里，`CREATE TABLE`、`ALTER TABLE … ADD COLUMN` 全部正常，唯独这条 `INSERT…SELECT` 插了 0 行。

## 根因：FORCE RLS 连 owner 一起拦

FORCE RLS 把策略管到了 owner 头上，而 owner 的运维会话没有租户上下文——策略恒假、SELECT 静默滤空；DDL 不经过 RLS，所以同一通道迁移照常绿。三层叠出来的静默链，每层单看都"合理"。

**第一层：ENABLE 和 FORCE 是两回事。** PostgreSQL 9.5 起内置 RLS。`ENABLE ROW LEVEL SECURITY` 启用策略，但表 owner 对本表默认豁免——策略只管其他角色。多租户表通常加一句 `FORCE ROW LEVEL SECURITY`，把 owner 的豁免也取消：

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;   -- owner 也不再豁免
```

安全上这是对的：owner 账号万一被应用误用，也逃不出租户隔离。代价是 owner 的运维通道同样被策略管——这一点在部署文档里容易漏记。

**第二层：missing_ok 的 current_setting 静默返回 NULL。** 策略是按租户头过滤的标准写法：

```sql
CREATE POLICY tasks_tenant ON tasks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

`current_setting` 第二个参数 `missing_ok = true` 表示配置项不存在时返回 NULL 而不是报错——这本是给应用连接设计的宽松读法。owner 的运维会话里没人 `SET app.tenant_id`，于是策略表达式变成 `tenant_id = NULL`，结果是 NULL（不是 true 也不是 false），行被滤掉。会话不报错、查询不报错，只是什么都查不到。

**第三层：DDL 不经过 RLS。** RLS 只评估行访问（SELECT 可见性、写入合法性），`CREATE TABLE`、`ALTER TABLE`、建索引都不碰策略。所以同一个 owner 通道呈现分裂行为：

| 操作 | owner 通道结果 |
|------|--------------|
| 建表 / 加列 / 建索引（DDL） | 正常执行 |
| `INSERT…SELECT`（DML，源表受 FORCE RLS 管） | SELECT 源被滤空，`INSERT 0 0` |
| 对目标表的裸 `INSERT`（带 VALUES） | 报 "violates row-level security"（有报错） |

最险的是第二行：`INSERT…SELECT` 的故障形态是**源被滤空**，而不是目标校验失败。没有行试图插入，自然没有违规报错——静默 0 行比报错难察觉得多。

## 解决方案

绕行的本质是让回填会话绕过或满足租户策略——三条通道按场景选：超级用户（一次性迁移首选）、BYPASSRLS 专用角色（常跑订正）、逐租户 SET（保留隔离语义）。先最小复现，再逐条展开。

### 最小复现

```sql
-- 建一张 FORCE RLS 的多租户表
CREATE TABLE tasks (
    id      INT GENERATED ALWAYS AS IDENTITY,
    tid     UUID NOT NULL,
    title   TEXT,
    done    BOOLEAN DEFAULT false
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant ON tasks
  USING (tid = current_setting('app.tenant_id', true)::uuid);

-- 一张不受 RLS 管的归档表（回填目标）
CREATE TABLE tasks_archived (
    id      INT,
    tid     UUID,
    title   TEXT,
    done    BOOLEAN
);

-- 超级用户塞两行数据
INSERT INTO tasks (tid, title) VALUES ('11111111-1111-1111-1111-111111111111', 'a'),
                                      ('22222222-2222-2222-2222-222222222222', 'b');

-- 换 owner 角色的会话（不设租户上下文）：
SELECT count(*) FROM tasks;   -- 0
INSERT INTO tasks_archived SELECT * FROM tasks;   -- INSERT 0 0
```

`count(*)` 返回 0 就是定位点：不是 SQL 写错，是会话根本看不到行。

### 通道一：超级用户执行（一次性数据迁移推荐）

超级用户不受 RLS 约束，直接把回填交给 `postgres` 角色跑：

```bash
psql -U postgres -d mydb -v ON_ERROR_STOP=1 -f backfill.sql
```

同一语句执行结果从 `INSERT 0 0` 变 `INSERT 0 23`。代价是超级用户权限最大，只用在受控的一次性运维动作上，绝不进应用连接串。

### 通道二：BYPASSRLS 专用角色

如果运维通道需要经常跑数据订正，可以造一个专用角色：

```sql
CREATE ROLE migrator WITH LOGIN BYPASSRLS;
```

`BYPASSRLS` 角色绕过所有策略但拿不到超级用户的其他特权，权限面比 superuser 窄。注意它仍要单独 GRANT 各表的权限，且这种角色本身要当作敏感凭证管理。

### 通道三：逐租户设置上下文

想保留 RLS 语义（迁移逻辑也要过一遍隔离规则），在会话里逐租户执行：

```sql
SET app.tenant_id = '11111111-1111-1111-1111-111111111111';
-- 该租户的回填语句
```

适合回填逻辑需要按租户区分的场景；纯一次全量搬运时，逐租户循环比直接绕过繁琐。

### 回填后必做行数核对

不管走哪条通道，回填类操作的验收不是"命令成功"，是行数对账：

```sql
-- 基准：受影响行数（回填前统计）
SELECT count(*) FROM tasks
WHERE assignee_user_id IS NOT NULL OR assignee_vendor_id IS NOT NULL;

-- 落库：回填后核对
SELECT count(*) FROM task_assignees;                          -- 总数 = 基准
SELECT count(DISTINCT task_id) FROM task_assignees;           -- 去重任务数 = 基准（单选场景）
```

这次事故里，正是「基准 23 = 落库 23」这一步没对上才暴露问题—— owner 通道跑完显示 `INSERT 0 0`，如果不核对，部署就带着空子表上线了。逐值校验再加一层 join 对比：新旧行按主键 join，比对迁移列的值，0 差异才算完。

数据库写入路径上的坑往往不是语法错，是部署顺序与约束语义的错位——[ON CONFLICT 唯一约束匹配](/blog/2026/07/04/postgresql-on-conflict-unique-constraint)那一篇是同一家族：SQL 对了，migration 与写入端的时序错了照样全线报错。

同一条 FORCE RLS 静默链还有备份侧的形态：用 owner 角色跑 `pg_dump` 会得到一份只有结构的空备份，数据动作分通道与恢复演练判据怎么设计，见姊妹篇 [pg_dump 备份没有数据？FORCE RLS 连 owner 也拦](/blog/postgres-pg-dump-empty-backup-force-rls)。

## 注意事项

FORCE RLS 表上的运维动作，判据要从「命令成功」换成「行数对账」。四条都从这次事故里来：

<InfoBox variant="warning" title="注意事项">

- **静默 0 行比报错险**：`INSERT…SELECT` 被 RLS 滤空源时不报任何错，回填类操作必须带「基准行数 vs 落库行数」核对，不能只看命令退出码。
- **别用"迁移成功"推断数据通路**：DDL 不经 RLS，同通道里 DDL 绿不代表 DML 通。核对通道能力要用真实 DML 试。
- **missing_ok=true 是静默链的一环**：`current_setting('app.tenant_id', true)` 在配置缺失时返回 NULL（策略恒假、滤空全表）；若写 `missing_ok=false`，配置缺失直接报错，反而早暴露。应用连接用宽松读法可以，运维通道里要心里有数。
- **超级用户凭证与通道隔离**：`postgres` 角色只用于一次性运维，连接串、应用配置、CI 里都不该出现它。

</InfoBox>

## 常见问题

### PostgreSQL 开了 RLS 为什么表主（owner）还能看到所有行？

只执行 `ENABLE ROW LEVEL SECURITY` 时不约束表主——owner 对本表默认拥有全部行权限，策略只约束其他角色。要连 owner 一起管，必须再执行 `ALTER TABLE … FORCE ROW LEVEL SECURITY`，之后 owner 的每条行访问语句都要过一遍策略评估。

### owner 会话 INSERT…SELECT 返回 INSERT 0 0 是什么意思？

0 是实际插入行数——语句执行成功但一行都没插。FORCE RLS 下策略把 `INSERT…SELECT` 的 SELECT 源滤成了空集，没有行可插，也就不会触发 "violates row-level security" 类报错，全程无告警。定位方法：同会话先跑 `SELECT count(*)`，返回 0 即确认是可见性被滤空，不是 SQL 写错。

### 数据迁移怎么绕过 PostgreSQL 的 RLS？

三条通道：超级用户（如 `postgres` 角色）执行，天然绕过 RLS，适合一次性回填；给迁移角色挂 `BYPASSRLS` 属性，权限面比超级用户窄；或在会话里逐租户 `SET app.tenant_id` 后执行，保留 RLS 语义。任选其一后都要做回填行数核对。

### FORCE RLS 之后 DDL 迁移为什么还是正常的？

RLS 只管行级访问（SELECT 可见性与写入合法性），不管 DDL。`CREATE TABLE`、`ALTER TABLE`、建索引都不经过策略评估，所以同一批迁移里 DDL 全绿、DML 回填静默 0 行——共用一条通道，行为却是分开的。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
