---
title: "drizzle 迁移报成功却没执行？journal 水位与漏登记两个静默坑"
description: "drizzle-kit migrate 报成功、部署报无待应用，迁移实际没跑：账本 max(created_at) 是水位，journal when 手改未来值永久压住后续迁移；裸 SQL 不登记 journal 直接跳过"
date: 2026-11-20
tags: [Drizzle, PostgreSQL, Node.js]
authors: [cclee]
image: "/images/blog/drizzle-journal-watermark-silent-skip.webp"
schema: FAQPage
faqs:
  - q: "drizzle migrate 显示成功但迁移没执行怎么排查？"
    a: "先对两本账：drizzle.__drizzle_migrations 的行数要等于 drizzle/ 目录的 SQL 文件数，再看 journal（drizzle/meta/_journal.json）里该迁移的 when 是否小于账本 max(created_at)——小于就会被水位判定跳过。两个位置分别对应「漏登记」和「被水位压住」两种静默形态，哪边对不上修哪边。"
  - q: "drizzle 的 journal 文件可以手动改吗？"
    a: "_journal.json 的 when 和数据库账本的 created_at 都不要手改。migrate 以账本 max(created_at) 为水位、只执行 when 大于水位的条目：手改成未来值会永久压住所有 when 更小的后续迁移，归位后水位还卡在高位，迁移照样不跑。要强制重放迁移，走能同时维护账本的正规通道，修完核对行数与文件数。"
  - q: "手写的迁移 SQL 怎么正确加进 drizzle？"
    a: "不要把 SQL 文件直接丢进 drizzle/ 目录——journal 里没有对应条目，migrate 的待应用清单会把它漏掉，文件躺在目录里也永远不会被执行。用 drizzle-kit generate --custom --name=xxx 生成空迁移文件再填入 SQL，让工具登记 journal 和快照。"
---

在一个 Node.js + PostgreSQL 的多租户系统里，一次部署输出「迁移核对：无待应用」，全链绿灯；约 18 分钟后生产撞上「relation does not exist」——本批明明带了一个建表迁移，它从头到尾没被执行，容器日志里连一行报错都没有。

## TL;DR

drizzle 判定「哪些迁移已应用」的输入只有两本账：数据库里的 `drizzle.__drizzle_migrations`（执行账本）和 `drizzle/meta/_journal.json`（登记清单）。两处都可能静默坏掉：账本 `created_at` 被 hand-edit 过未来值，migrate 以 `max(created_at)` 为水位，把 `when` 更小的后续迁移永久压住；手写 SQL 裸文件丢进 `drizzle/` 不登记 journal，待应用清单直接漏掉它。修法：手写迁移走 `generate --custom` 正规登记、journal/账本禁手改、部署侧加「journal 条数 = 迁移文件数」的防漏门。

## 问题现象：两个现场，账本各坏一处

**现场一：migrate 报成功，下一步建表迁移的表不存在。** 跑 `pnpm db:migrate`（drizzle-kit migrate），输出正常结束；紧接着灌 RLS policy 脚本，报 `relation "task_assignees" does not exist`——它依赖的建表迁移（0032）实际没有执行，但 migrate 的输出和退出码都看不出任何异常。

手工修复账本后再跑 migrate，又冒出第二个问题：工具把 0028、0029 两个早就应用过的迁移**重放**了一遍，`__drizzle_migrations` 里出现重复行和孤儿行——账本 34 行，迁移文件 32 个，对不上了。

**现场二：部署报「无待应用迁移」，生产缺表。** 另一批发布带了一个手写的建表 SQL（0037），部署入口的迁移核对输出「无待应用迁移」；当时没引起注意，应用容器正常启动。直到企微侧同步部门时才暴露：生产库根本没有这张表。从部署到发现约 18 分钟，容器日志零报错。

事后对账：journal 36 条、生产账本 36 行，两边“相等”、各自自洽——缺的是第 37 个条目。0037 的 SQL 文件躺在 `drizzle/` 目录里，journal 里没有它的登记。

## 根因：drizzle 怎么判定“哪些迁移已应用”

判定逻辑只读账本，两个静默坑各对应一处误用。

**水位机制：账本 `max(created_at)` 是唯一水位线。** drizzle-orm 的 migrate 以账本里 `created_at` 的最大值为水位，只执行 journal 中 `when` **大于水位**的条目。现场一的伏笔是更早的一次操作：为了强制重放某个迁移，`_journal.json` 的 `when` 被手改成了未来值（如 `1794716400000`）。把 `when` 归回真实时序后，账本里那两行未来时间戳的 `created_at` 还在——水位被抬到高位，比它小的 0032 永远满足不了「when > 水位」，静默跳过。

**hash 执行时现算，所以重放会插新行。** migrate 校验或记账用的 hash 是执行时对 SQL 文件内容现算的，不从账本读。这解释了现场一的第二段：被水位放行的旧迁移重放时，工具不认为它们“已应用”，执行完各插一行新账——重复行、孤儿行就是这么来的（34 行 > 32 文件）。

**裸文件不进 journal，待应用清单直接漏掉它。** migrate 的待应用列表按 journal 条目和账本行数的差集算（`tags.slice(rows.length)` 的思路）：0037 没登记 journal，journal 36 条 = 账本 36 行，差集为空 → 「无待应用」。测试也没兜住：catalog/int 测试打的是从开发库克隆的测试库，开发库早就用 psql 直灌过 0037、库内账本也有记账行——结构齐全恒绿，唯一缺的是 journal 文件里那一条。三本账（journal、开发库、测试库）只错一本，其余两本全绿。

## 解决方案：登记走正规通道，部署加防漏门

**手写迁移必须经 `generate --custom` 登记：**

```bash
# 先备份！同名文件已存在时该命令会直接覆盖
cp drizzle/0037_departments.sql /tmp/0037_backup.sql
pnpm exec drizzle-kit generate --custom --name=departments
# 生成的空迁移文件回填 SQL，journal 与 snapshot 自动登记
```

**journal `when` 与账本 `created_at` 禁手改，改过的要归一：** `when` 回到真实时序；账本删重复/孤儿行、`created_at` 与 journal `when` 对齐；修完核对三件事——账本行数 = 文件数、`max(created_at)` 对齐最后一个迁移、复跑 migrate 为 no-op。现场一按这个顺序清完后，后续迁移恢复正常执行。

**部署侧防漏门，两条硬规则：**

1. journal 条数 ≠ `drizzle/*.sql` 文件数 → 立即终止部署，报出差异文件名。这是裸文件漏登记的唯一可靠信号——库侧账本可能因为开发库直灌过而“看起来正常”。
2. 输出「无待应用迁移」而本批变更携带迁移文件 → 自相矛盾，停下来查 journal，不要继续。

![迁移执行的账本判定与两个静默坑的位置](/images/blog/drizzle-journal-watermark-silent-skip.webp)

防漏门命中过的实战记录：登记 0037 后 journal 37 条，部署重新识别出待应用 1 个，走「逐文件 psql ON_ERROR_STOP 直灌 + 服务器端 sha256 记账 + 属主与 policy 核对」的 owner 通道完成，账本 37/37 对齐。这套 owner 通道为什么替代了部署路径上的 drizzle-kit migrate（账本与表结构脱节的另一类坑），见姊妹篇 [drizzle-kit migrate 表没建？journal 静默跳过与迁移属主排查](/blog/drizzle-kit-migrate-silent-skip)——两篇合起来是这个迁移链路的完整账本地图：那篇讲账本与库的两本账，这篇讲账本自身怎么被改坏。

<InfoBox variant="warning" title="注意事项">

- `drizzle-kit generate --custom` 对**同名已存在文件是直接覆盖**——先备份原文件内容，生成后回填，别让工具静默吞掉手写 SQL。
- 「计数相等」核对要双份：journal 条数对文件数（登记完整性），账本行数对 journal 条数（执行完整性）。现场二的 36=36 恰恰说明只对其中一对不够。
- 手工补账本行时对齐既有行格式（hash 用 SQL 文件全文 sha256、`created_at` 是 epoch 秒 bigint），混格式会让后续对账失真——这条的细节在姊妹篇里。

</InfoBox>

## 常见问题

### drizzle migrate 显示成功但迁移没执行怎么排查？

先对两本账：drizzle.__drizzle_migrations 的行数要等于 drizzle/ 目录的 SQL 文件数，再看 journal（drizzle/meta/_journal.json）里该迁移的 when 是否小于账本 max(created_at)——小于就会被水位判定跳过。两个位置分别对应「漏登记」和「被水位压住」两种静默形态，哪边对不上修哪边。

### drizzle 的 journal 文件可以手动改吗？

_journal.json 的 when 和数据库账本的 created_at 都不要手改。migrate 以账本 max(created_at) 为水位、只执行 when 大于水位的条目：手改成未来值会永久压住所有 when 更小的后续迁移，归位后水位还卡在高位，迁移照样不跑。要强制重放迁移，走能同时维护账本的正规通道，修完核对行数与文件数。

### 手写的迁移 SQL 怎么正确加进 drizzle？

不要把 SQL 文件直接丢进 drizzle/ 目录——journal 里没有对应条目，migrate 的待应用清单会把它漏掉，文件躺在目录里也永远不会被执行。用 drizzle-kit generate --custom --name=xxx 生成空迁移文件再填入 SQL，让工具登记 journal 和快照。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
