---
title: Python 任务全标 failed 却不报错？try/except 吞掉了异常
description: "重构公共方法签名后，调用方 TypeError 被 try/except 吞进 failed 计数，服务不崩溃故长期未暴露。解法：except 记日志或重抛、重构后 grep 同步调用方。"
date: 2026-06-13
tags: [Python, FastAPI, Bug修复, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "python try except 怎么打印错误信息？"
    a: "用 except Exception as e 捕获异常对象，再 logging.error(e, exc_info=True) 打印完整堆栈；只 print(e) 会丢失 stack trace，排查时看不到调用链。"
  - q: "python 异常处理最佳实践是什么？"
    a: "捕获具体异常类型而非裸 except；except 块必须记日志或重新抛出，禁止空 pass；日志传 Error 实例而非 err.message 以保留堆栈；只在最外层兜底捕获。"
  - q: "python try except 怎么捕获多个异常？"
    a: "用一个 except (TypeError, ValueError) as e 捕获多种类型；或多个 except 分支分别处理。避免裸 except 或 except Exception 吞掉所有异常。"
---

> 在 RAG 知识库项目中排查文档同步任务全部标记 failed 的静默故障，以下是完整排查过程。

## TL;DR

重构一个公共方法改了参数签名，但漏改了一个调用方。调用方按旧契约传参抛 `TypeError`，而这个调用被包在 `try/except` 里，异常被悄悄吞进 `failed` 计数——服务不崩溃、日志没有 ERROR，只有计数字段悄悄上涨。这类「静默故障」是最难查的 bug。两个解法：重构签名后 `grep` 所有调用方同步；`except` 块必须记日志或重抛，绝不静默吞掉。

{/* truncate */}

## 问题现象

文档同步任务跑完，结果所有文档都标记成 `failed`：

```json
{
  "summary": {"added": 0, "updated": 0, "deleted": 0, "failed": 48}
}
```

诡异的是没有任何报错信号：

- 服务健康检查正常，进程没崩溃
- 进程管理器显示 `unstable_restarts=0`，没有重启
- 日志里**没有 ERROR / Exception**，只有一条 `Sync completed` 的 info

「能正常跑完、却不产出任何有效结果、且完全不报错」——典型的静默故障。

## 根因

问题由两个因素叠加造成。

**因素一：公共方法签名重构，调用方没同步。** 一个负责写入向量库的方法被重构，从「接收预计算好的向量」改成了「自己调用 embedding 服务」：

```python
# 重构后：方法自己 embed，签名变成 4 个参数
async def add_documents(self, collection_name, texts, embedding_service, metadatas=None):
    ...

# 某个调用方还按旧契约，传了预计算向量（5 个参数）
await rag_service.add_documents(
    collection, chunks, dense_embeddings, sparse_vectors, metadatas
)
# TypeError: 传了 5 个位置参数，但方法只接受 4 个
```

**因素二：调用被包在吞异常的 try/except 里。** 真正让它变成「静默故障」的是这段调用外层的异常处理：

```python
async def process_document(doc):
    try:
        await rag_service.add_documents(...)  # ❌ TypeError 在这里抛
    except Exception:
        summary["failed"] += 1                 # ❌ 吞掉异常，只计数
        # 没有记日志、没有重抛、没有打印堆栈
```

`except Exception` 把 `TypeError` 一并吞掉，只让 `failed` 计数 +1。于是：

- 异常**没有向上传播** → 服务不崩溃、进程不退出
- 异常**没有写日志** → ERROR 堆栈无处可寻
- 唯一留痕是**计数字段悄悄上涨** → 不主动看 `summary` 根本发现不了

两条因素缺一不可：只重构没同步 → 立即崩溃、立即暴露；只有吞异常 → 原本会暴露的错误被按下不表。叠加起来，就是最隐蔽的那类 bug。

## 解决方案

**第一步：重构公共方法签名后，立即 grep 所有调用方同步。**

```bash
# 重构任何被多处调用的方法后，必须检查所有调用点
grep -rn "add_documents(" app/
grep -rn "add_documents(" --include="*.py" .
```

如果新签名与旧语义不兼容（比如从「接收向量」变「自己 embed」），**不要改原方法**，而是新增一个语义清晰的方法，让两条路径各走各的：

```python
# 原方法：自己 embed（/index 路径用）
async def add_documents(self, collection_name, texts, embedding_service, metadatas=None):
    ...

# 新增方法：接收预计算向量（/sync 路径用）—— 语义不同，分开维护
async def add_precomputed_documents(self, collection_name, chunks, dense, sparse, metadatas):
    ...
```

**第二步：except 块绝不静默吞异常。**

```python
# ✅ except 必须记日志（带完整堆栈），再决定计数还是重抛
async def process_document(doc):
    try:
        await rag_service.add_documents(...)
    except Exception as e:
        logger.error(f"process failed: {doc['path']}", exc_info=True)  # 完整堆栈
        summary["failed"] += 1
```

关键在 `exc_info=True`（或 `traceback.print_exc()`）——它把 stack trace 一并写进日志。修好这两步后，同样的 `TypeError` 会在日志里立刻冒出完整的调用链，而不是埋进计数里装作没事。

<InfoBox variant="warning" title="注意事项">

- **`except Exception:` 是静默故障的最大来源**。它连 `TypeError`、`AttributeError` 这类编程错误一起吞，掩盖真正的 bug。优先捕获具体类型（`except (ConnectionError, TimeoutError)`）。
- **空 `pass` 和只计数的 `except` 一样危险**。`except: pass` 等于主动放弃错误信息，排查时无从下手。
- **`summary["failed"]` 这类计数是隐蔽信号**。一旦某条路径把异常归到计数里，就要核查：这个计数是否有人监控、计数上涨是否告警。没有监控的计数，等于把错误扫进地毯下。
- 重构公共方法签名是高风险操作，CI 里加 `grep` 检查或类型检查（mypy/pyright）能在合并前拦住遗漏的调用方。

</InfoBox>

Python 异常处理还有别的坑：FastAPI 里客户端断开触发的 `CancelledError` 也常被误吞，导致清理逻辑跑飞，[FastAPI SSE CancelledError](/blog/fastapi-sse-cancellederror) 记录了这类异步场景的处理方式。

## 常见问题

### python try except 怎么打印错误信息？

用 `except Exception as e` 捕获异常对象，再用 `logging.error(e, exc_info=True)` 打印完整堆栈；只 `print(e)` 会丢失 stack trace，排查时看不到调用链。

### python 异常处理最佳实践是什么？

捕获具体异常类型而非裸 `except`；`except` 块必须记日志或重新抛出，禁止空 `pass`；日志传 Error 实例而非 `err.message` 以保留堆栈；只在最外层做兜底捕获。

### python try except 怎么捕获多个异常？

用 `except (TypeError, ValueError) as e` 一个块捕获多种类型；或用多个 `except` 分支分别处理。避免裸 `except` 或 `except Exception` 吞掉所有异常。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
