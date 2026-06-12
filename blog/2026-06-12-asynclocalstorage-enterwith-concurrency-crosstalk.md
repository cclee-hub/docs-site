---
title: "Node.js AsyncLocalStorage 并发读到错误的值？enterWith 改用 run 隔离上下文"
description: "BullMQ worker concurrency 大于 1 时，als.enterWith 改写共享父上下文，并发 job 在 await 交错后读到错误的 traceId（串到别的请求）。改用 als.run 包裹每个处理器，按调用隔离上下文。"
date: 2026-06-12
tags: [Node.js, AsyncLocalStorage, BullMQ, 并发, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "als.enterWith 和 als.run 有什么区别？"
    a: "enterWith 改写当前激活的共享父上下文，后续并发任务会互相覆盖；run 为回调建立独立的新上下文，回调退出后自动恢复，每次调用互不干扰。"
  - q: "为什么并发任务会读到错误的 traceId，串到别的请求？"
    a: "并发 job 在 await 处交错时，enterWith 写入的值被最后一次调用覆盖，所有交错的任务都读到同一个错误的 traceId。Node 官方明确推荐用 run 替代 enterWith。"
---

BullMQ worker 设了 `concurrency: 3`，上线后发现并发的几个 job 日志和 Sentry 上报全串了——A 任务的错误堆栈挂在了 B 任务的 traceId 下，排查时对着错误的链路看了半天。

在构建 [AI运营](/docs/ai-analytics) 数据分析平台时遇到此问题——为电商运营智能分析市场趋势、用户行为与销售数据，后台用 BullMQ 并发跑分析任务，每个任务都靠 AsyncLocalStorage 打 traceId 做日志关联，并发一上来 traceId 就开始错乱。

## TL;DR

`als.enterWith(store)` 改写的是**当前激活的共享父上下文**，并发任务在 `await` 交错时会互相覆盖，最后写的那个值「赢」，所有交错的任务都读到同一个错误的值。解法是改用 `als.run(store, fn)` 把整个处理器包起来——它为每次调用建立独立的新上下文，退出后自动恢复，并发再高也互不干扰。

## 问题现象

每个 job 进来时往 ALS 里塞自己的 traceId，处理器内部（含 `await`）读这个 traceId 打日志、上报 Sentry：

```js
// worker.js —— 串扰写法
new Worker('analytics', (job) => {
  als.enterWith({ traceId: job.data.executionId }); // 进来就写
  return processJob(job); // 内部多处 await + logger.info({ traceId: als.getStore().traceId })
}, { concurrency: 3 });
```

单跑没问题，`concurrency: 3` 一开就出诡异现象：

```bash
# job A (executionId: aaa) 与 job B (executionId: bbb) 几乎同时进入
[worker] job A start   traceId=aaa
[worker] job B start   traceId=bbb
# A 内部 await 让出，B 调了 enterWith({bbb})，A 恢复后：
[worker] job A step2    traceId=bbb   ← 串到 B 了
[worker] job A error    traceId=bbb   ← Sentry 上报到 B 的链路下
```

不是偶发，是只要并发就稳定复现，而且 traceId 永远等于「最近一次 enterWith 写入的值」。

## 根因

关键在于 `enterWith` 改写的不是「这次调用专属」的上下文，而是**当前激活的那个共享父上下文**。

`AsyncLocalStorage` 的上下文是树状的：一个 async context 可以被多个子任务共享。`als.enterWith(store)` 的语义是「把 store 写到我当前所处的这个 context 上」。当 worker 用 `concurrency: 3` 时，三个 job 的处理器共享同一个父上下文（worker 循环的上下文），于是：

- job A 调 `enterWith({aaa})` → 共享上下文被写成 `aaa`；
- job A `await` 让出执行权；
- job B 调 `enterWith({bbb})` → 同一个共享上下文被覆盖成 `bbb`；
- job A 恢复，读 `getStore()` → 拿到的是 `bbb`。

这就是经典的「last-write-wins」串扰。`await` 点越多、并发越高，覆盖越频繁，错乱越严重。`concurrency: 1` 时看似正常，是因为根本没有交错——这也是它最坑的地方：开发时单线程调试永远发现不了。

Node 官方文档对此有明确告警：`enterWith()` 会产生预期外的副作用，**推荐用 `run()` 替代**。

## 解决方案

把 `enterWith` 换成 `run`，并且用 `run` 包裹**整个处理器**（而不是某一段）：

```js
// worker.js —— 隔离写法
new Worker('analytics', (job) => {
  return als.run(
    { traceId: job.data.executionId },
    () => processJob(job), // 整个处理器都在独立上下文里跑
  );
}, { concurrency: 3 });
```

`als.run(store, fn)` 的语义是：**新建一个独立的 async context**，把 store 绑定到它上面，在 `fn` 执行期间（及其派生的所有异步任务里）`getStore()` 都能拿到这个 store，`fn` 返回后上下文自动恢复到调用前的状态。

因为每次调用 `run` 建立的都是**全新的、这次调用专属**的上下文，并发任务之间天然隔离——job A 的 context 里永远是 `aaa`，job B 的里永远是 `bbb`，无论怎么在 `await` 处交错都不会互相覆盖。

这个改动的收益是直接的：

- **每次调用独立快照**：traceId 在进入 job 时绑定，整个处理链路（含所有 `await`、子函数、Sentry scope）读到的都是这个 job 自己的值；
- **退出自动恢复**：job 结束后上下文归位，不会泄漏到下一个 job 或 worker 主循环；
- **并发安全**：`concurrency` 调到多少都不影响，行为和单线程一致。

如果处理器是抽出来的函数（比如 `processWorkflowJob`、`processAtomicJob`），同样在 Worker 构造处包一层即可，不需要改处理器内部：

```js
new Worker(queue, (job) => als.run({ traceId: job.data.id }, () => processWorkflowJob(job)), { concurrency });
```

<InfoBox variant="warning" title="注意事项">

- 只要存在并发（worker concurrency > 1、HTTP 并发请求、`Promise.all` 批处理），就别用 `enterWith`。它是为「单线程顺序设置一次」设计的，并发下必然串扰。
- `run` 要包住整个处理器，不是只包入口的同步段——否则处理器内部的 `await` 之后又回到共享上下文，等于没改。
- `concurrency: 1` 会掩盖这个 bug。开发时务必用目标并发数压测，否则上线才暴露。
- 另一个 ALS 高频坑是回调里读不到值（上下文丢失），见 [Node.js AsyncLocalStorage 在回调里读不到值？EventEmitter 越界丢失上下文](/blog/2026/06/12/asynclocalstorage-context-lost-eventemitter-callback)。

</InfoBox>

## 常见问题

### als.enterWith 和 als.run 有什么区别？

`enterWith` 把 store 写到当前激活的共享父上下文上，后续并发的异步任务会互相覆盖；`run` 则为回调新建一个独立的新上下文并绑定 store，回调结束后自动恢复到之前的状态，每次调用互不干扰。Node 官方推荐用 `run` 替代 `enterWith`。

### 为什么并发任务会读到错误的 traceId，串到别的请求？

并发任务在 `await` 处交错时，`enterWith` 写入的值会被最后一次调用覆盖，所有交错的任务读到的都是同一个错误的 traceId。改用 `als.run` 给每次调用建立独立上下文即可隔离，并发再高也不会串。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
