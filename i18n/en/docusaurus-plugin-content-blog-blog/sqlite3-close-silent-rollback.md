---
title: "sqlite3 Writes Vanish After close()? Python Never Committed"
description: "Some sqlite3 writes survive, others roll back? Under default isolation, close() rolls back uncommitted work — one missing commit freezes. One-line fix."
date: 2026-11-22
tags: [Python, sqlite3]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Does sqlite3 close() commit the transaction?"
    a: "No. Under the default isolation_level (deferred mode), INSERT/UPDATE/DELETE open a transaction implicitly; close() only closes the connection and does not commit — the uncommitted transaction rolls back with the connection. Call conn.commit() explicitly before close."
  - q: "Why did my sqlite3 data disappear after closing the connection?"
    a: "Most likely a write path executed DML but never committed before close(). The statement succeeds and reads inside the same connection see the data, but nothing is durable until commit. Trace who owns the connection and where each write path commits."
  - q: "How do I make sqlite3 autocommit in Python?"
    a: "Either pass isolation_level=None at connect time, or wrap writes in a with conn: block. Autocommit lands every statement immediately; the context manager commits one transaction per block — prefer the block when several statements must stay atomic."
---

During a shadow-mode observation window, metric samples from two freshly installed machines kept landing in the database every cycle — yet the state table's `updated_at` stayed frozen at the installation moment. None of the state-machine transitions ever reached disk, for two straight days.

Ran into this while building [CCLee Server Sentinel](/docs/server-sentinel) — monitoring and alerting for Linux servers: performance, availability, security and backup. Alerts arrive as conclusions with next steps, and backups are proven restorable by monthly real-restore drills.

## TL;DR

Python's `sqlite3` with the default `isolation_level=""` (deferred mode) opens a transaction implicitly on the first write statement — and `close()` only closes the connection, it does **not** commit. The uncommitted transaction rolls back when the connection closes. The treacherous shape is "some tables live, some die": within a single run, write paths that end with `conn.commit()` persist, paths that miss it roll back. The fix is one line: `conn.commit()` before `close()`.

## Symptom: samples keep landing, state table frozen at install time

Shadow mode (dry_run) is the 48-hour baseline window after a new install: collection, writes and state-machine evaluation all run normally; only outbound push is suppressed. Watching two new machines produced a contradictory pair:

- the `samples` table gained a row every 5 minutes — the collection path was alive;
- the `state` table's `updated_at` stuck at 10:53 / 10:55 on installation day, even though the state machine was evaluating transitions (the alerting count should have moved).

"data was written" and "data was not written" held at the same time in the same run. That is not a classic write failure (an error, a lost batch) — it is a **per-path rollback**.

## Root cause: close() does not commit for you

With the default `isolation_level=""`, Python's `sqlite3` runs deferred transactions: the first write statement opens a `BEGIN` implicitly, and every subsequent write hangs on that one uncommitted transaction. `close()` means "close the connection" — **committing is not its job**; at close, the pending transaction rolls back.

In the code, two paths diverged:

```python
def insert_samples(conn, samples, ts_iso, epoch):
    conn.executemany("INSERT INTO samples (…) VALUES (…)", rows)
    ...
    conn.commit()          # ← commits at the end: samples survive every cycle
```

```python
# the dry_run branch of do_check (pre-fix)
for rule_name, st in new_state.items():
    state_save(conn, rule_name, st, now_iso)   # writes state, no commit

if cfg.get("dry_run"):
    LOG.info("[dry_run] %d samples, %d events", ...)
    ...
    conn.close()                               # ← closes directly: this cycle's state writes roll back
    return 0
```

The non-dry_run branch commits before closing — which is why only the shadow-mode state writes rolled back, and why the freeze started exactly when the machines entered shadow mode.

## Fix: one commit line before close

```python
if cfg.get("dry_run"):
    LOG.info("[dry_run] %d samples, %d events", len(samples), len(events))
    ...
    conn.commit()   # 状态机/安全基线照常落库——此前漏 commit，影子期每轮回滚（state 表冻结、基线永不生效）
    conn.close()
    return 0
```

The fix landed with the 2026-11-22 commit; the full regression suite of 271 cases passed, and the client ships with the next rollout. Nothing in the language enforces "every write path commits" — each path owns its own commit discipline, and one missed path silently loses its writes.

When chasing similar vanishing-write reports (data not saved, freshly written rows not found), check two things first: the connection's lifecycle (who creates it, who closes it) and each write path's commit timing — not the SQL itself. A statement executing successfully and a transaction reaching disk are two different events. A close relative on the Python side is swallowed exceptions that let the flow continue as if nothing happened, see [Python try/except swallows exceptions and fails silently? Recovery triggers and fallbacks are both required](/blog/python-try-except-swallow-exception-silent-failure).

<InfoBox variant="warning" title="Watch out">

- **Do not switch everything to autocommit to save a commit**: `isolation_level=None` lands every statement immediately, but `insert_samples` runs `executemany` plus two ring-cleanup DELETEs that must stay in one transaction for atomicity — committing between them can persist a half-cleaned state. For statement groups, use a `with conn:` block (commits on exit, rolls back on exception).
- **`with conn:` (using the connection as a context manager) does not close the connection** — commit discipline and close timing are two independent decisions.
- Sharing one connection across threads turns messy commit timing into intermittent data loss: `sqlite3` is single-thread by default; with `check_same_thread=False` and your own lock, "whoever owns the path commits" becomes a hard rule.

</InfoBox>

## FAQ

### Does sqlite3 close() commit the transaction?

No. Under the default `isolation_level` (deferred mode), INSERT/UPDATE/DELETE open a transaction implicitly; `close()` only closes the connection and does not commit — the uncommitted transaction rolls back with the connection. Call `conn.commit()` explicitly before `close()`.

### Why did my sqlite3 data disappear after closing the connection?

Most likely a write path executed DML but never committed before `close()`. The statement succeeds and reads inside the same connection see the data, but nothing is durable until commit. Trace who owns the connection and where each write path commits.

### How do I make sqlite3 autocommit in Python?

Either pass `isolation_level=None` at connect time, or wrap writes in a `with conn:` block. Autocommit lands every statement immediately; the context manager commits one transaction per block — prefer the block when several statements must stay atomic.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
