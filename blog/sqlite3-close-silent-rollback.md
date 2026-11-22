---
title: "Python sqlite3 写入消失表冻结？close() 不会替你 commit"
description: "sqlite3 写入部分表存活部分表回滚？默认 isolation 下 close() 不 commit 即回滚——自带 commit 的函数库存活，漏 commit 的路径冻结在装机时刻。附修复代码。"
date: 2026-11-22
tags: [Python, sqlite3]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "sqlite3 的 close() 会自动提交事务吗？"
    a: "不会。默认 isolation_level（deferred 模式）下，INSERT/UPDATE/DELETE 隐式开启事务，close() 只关闭连接、不提交——未提交事务随关闭回滚，写入直接消失。要落盘必须在 close 前显式 conn.commit()。"
  - q: "Python sqlite3 什么时候需要手动 commit？"
    a: "只要执行过写操作（INSERT/UPDATE/DELETE/REPLACE）就需要。读操作不开启数据事务。用 with conn: 包裹写操作块，块结束自动 commit、异常自动回滚；或连接时传 isolation_level=None 进 autocommit 模式。"
  - q: "如何让 Python sqlite3 自动 commit？"
    a: "两种方式：连接时 sqlite3.connect(path, isolation_level=None) 进入 autocommit；或把写操作包进 with conn: 上下文。前者每条语句即时落盘，后者整块一个事务——多语句需要原子性时选后者。"
---

影子观察期里，两台新装客户机的指标样本每轮照常进库，但状态表的 `updated_at` 冻结在装机那一刻——状态机的每一次翻转都没有落过库，一冻就是两天。

在开发 [CCLee 服务器哨兵](/docs/server-sentinel) 时踩到 Python sqlite3 的一个静默行为——Linux 服务器监控预警托管：性能、可用性、安全、备份四类监控，告警归并成结论并附处置指引，每月真实恢复演练验证备份可用。

## TL;DR

Python `sqlite3` 默认 `isolation_level=""`（deferred 模式）下，任何写操作都隐式开启事务，而 `close()` 只关闭连接、**不提交**——未提交事务随关闭回滚。坑的隐蔽形态是「部分表活、部分表死」：同一次运行里，自带 `conn.commit()` 的写库函数数据存活，漏 commit 的路径数据回滚。修法一行：`close()` 前补 `conn.commit()`。

## 问题现象：样本持续入库，状态表冻结在装机时刻

影子模式（dry_run）是新机上线首 48h 的基线观察期：采集、写库、状态机评估照常执行，只有对外推送被抑制。观察两台新装客户机时发现反常组合——

- `samples` 表每 5 分钟新增一行，采集链路活着；
- `state` 表的 `updated_at` 停在装机当天 10:53 / 10:55，之后状态机明明评估出了翻转（alerting 计数应有变化），库里却一动不动。

「数据写进去了」和「数据没写进去」同时成立于同一次运行——这不是典型的写入失败（报错、丢整批），而是**按路径选择性回滚**。

## 根因：close() 不会替你 commit

Python `sqlite3` 的默认 `isolation_level=""` 是 deferred 事务模式：执行第一条写语句时隐式 `BEGIN`，此后所有写操作都挂在这一个未提交事务上。`close()` 的语义是关闭连接——**提交不是它的职责**，连接关闭时未提交的事务直接回滚。

现场代码里两条路径行为分叉：

```python
def insert_samples(conn, samples, ts_iso, epoch):
    conn.executemany("INSERT INTO samples (…) VALUES (…)", rows)
    ...
    conn.commit()          # ← 末尾自带 commit：samples 每轮存活
```

```python
# do_check 的 dry_run 分支（修复前）
for rule_name, st in new_state.items():
    state_save(conn, rule_name, st, now_iso)   # 写 state，无 commit

if cfg.get("dry_run"):
    LOG.info("[dry_run] %d samples, %d events", ...)
    ...
    conn.close()                               # ← 直接关：本轮 state 写入全部回滚
    return 0
```

非 dry_run 分支在 `close()` 前有 `conn.commit()`，所以只有影子期的状态写入被回滚——这解释了「冻结恰好从进影子开始」。

## 修复：close 前补一行 commit

```python
if cfg.get("dry_run"):
    LOG.info("[dry_run] %d samples, %d events", len(samples), len(events))
    ...
    conn.commit()   # 状态机/安全基线照常落库——此前漏 commit，影子期每轮回滚（state 表冻结、基线永不生效）
    conn.close()
    return 0
```

修复随 2026-11-22 的提交合入，同批回归 271 条用例全绿；客户端按发布节奏随下次重推生效。这类「写库函数各自的 commit 纪律」没有语法层的强制——每个写路径自己负责提交，漏一处就静默丢一处。

排查同类「写入消失」问题（数据没保存、查不到刚写的行）时，先查两个点：连接的生命周期（谁创建、谁关闭）和每个写路径的 commit 时机，而不是先怀疑 SQL 本身——SQL 能执行成功和事务能落盘是两件事。Python 侧另一个静默丢失的近亲是异常被吞后流程照常走完，见 [Python try/except 吞掉异常静默失败？恢复触发与兜底缺一不可](/blog/python-try-except-swallow-exception-silent-failure)。

<InfoBox variant="warning" title="注意事项">

- **不要为了省 commit 一律换 autocommit**：`isolation_level=None` 让每条语句即时落盘，但 `insert_samples` 里 `executemany` + 两条环形清理 DELETE 需要在同一事务里保持原子——拆开提交会在中间态留下只删了一半的数据。多语句一组时用 `with conn:` 块（结束自动 commit、异常自动回滚）。
- **`with conn:` 与 `conn` 直接用作上下文管理器是同一件事**，但它不关闭连接——commit 纪律和 close 时机是两个独立决定。
- 多线程共用连接时，commit 时机混乱会放大成间歇性丢写：sqlite3 默认同一线程使用，跨线程需 `check_same_thread=False` 加自己的锁，此时更要把「谁的路径谁 commit」定成纪律。

</InfoBox>

## 常见问题

### sqlite3 的 close() 会自动提交事务吗？

不会。默认 `isolation_level`（deferred 模式）下，INSERT/UPDATE/DELETE 隐式开启事务，`close()` 只关闭连接、不提交——未提交事务随关闭回滚，写入直接消失。要落盘必须在 close 前显式 `conn.commit()`。

### Python sqlite3 什么时候需要手动 commit？

只要执行过写操作（INSERT/UPDATE/DELETE/REPLACE）就需要。读操作不开启数据事务。用 `with conn:` 包裹写操作块，块结束自动 commit、异常自动回滚；或连接时传 `isolation_level=None` 进 autocommit 模式。

### 如何让 Python sqlite3 自动 commit？

两种方式：连接时 `sqlite3.connect(path, isolation_level=None)` 进入 autocommit；或把写操作包进 `with conn:` 上下文。前者每条语句即时落盘，后者整块一个事务——多语句需要原子性时选后者。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
