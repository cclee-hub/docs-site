---
title: 修复 Milvus 混合检索 RRF 分数与相似度阈值不兼容
description: 混合检索加权融合分数通常不超过 0.7，用 0.7 阈值会导致结果全被过滤，需调整阈值策略
date: 2026-03-08
tags: [Milvus, RAG, 向量搜索, Bug修复, vector-db, rag, enterprise-ai]
authors: [cclee]
schema: Article
---

> 在 RAG 知识库项目中调试混合检索评分问题，以下是完整排查过程。

## TL;DR

Milvus 混合检索的加权融合分数 = `0.7 * dense_score + 0.3 * sparse_score`，理论最大值约 0.7。如果用 `min_similarity=0.7` 过滤，结果几乎全被剔除。解决方案：将阈值降到 0.3，或根据融合策略动态调整。


<!-- truncate -->
## 问题现象

混合检索返回空结果，即使数据库中明确存在相关文档：

```python
# 调用混合检索
results = await milvus_service.hybrid_search(
    collection_name="knowledge_base",
    query_dense=dense_vector,
    query_sparse=sparse_vector,
    top_k=5,
    min_similarity=0.7  # 问题根源
)

# 返回空数组 []
print(results)  # {"documents": [[]], "metadatas": [[]], "distances": [[]]}
```

日志显示检索到了结果，但过滤后为空：

```
fused_results before filter: 10, scores: [0.52, 0.48, 0.45, ...]
min_similarity threshold: 0.7
fused_results after filter: 0, scores: []
```

## 根因

混合检索使用**加权融合**（Weighted Fusion）而非 Reciprocal Rank Fusion（RRF）：

```python
def _fuse_and_rank(self, dense_results, sparse_results, top_k):
    semantic_weight = 0.7   # 语义权重
    keyword_weight = 0.3    # 关键词权重

    for result in dense_results:
        similarity = 1 - distance
        score = similarity * semantic_weight  # 0.7 * score

    for result in sparse_results:
        similarity = 1 - distance
        score = similarity * keyword_weight   # 0.3 * score

    # 同一文档的分数相加
    final_score = dense_score + sparse_score
```

**数学分析**：
- 假设 dense 和 sparse 的相似度最大值都是 1.0
- 融合分数最大值 = `0.7 * 1.0 + 0.3 * 1.0 = 1.0`
- 但实际中 sparse 分数通常较低（0.3-0.5），因为关键词很难完全匹配
- **实际最大分数约 0.5-0.7**

用 `min_similarity=0.7` 过滤，相当于要求"完美匹配"，结果自然为空。

## 解决方案

### 方案一：降低阈值（推荐）

```python
# config.py
class Settings(BaseSettings):
    rag_min_similarity: float = 0.3  # 混合搜索分数阈值（加权分数通常较低）
```

### 方案二：动态阈值

根据检索类型使用不同阈值：

```python
# 混合检索用较低阈值
if search_type == "hybrid":
    min_similarity = 0.3
else:
    min_similarity = 0.7  # 纯语义检索可用较高阈值
```

### 方案三：归一化融合分数

将融合分数归一化到 [0, 1]：

```python
def _fuse_and_rank(self, dense_results, sparse_results, top_k):
    # ... 融合逻辑 ...

    # 归一化：除以权重和
    max_possible_score = self.semantic_weight + self.keyword_weight  # 1.0
    for doc in doc_scores.values():
        doc["score"] = doc["score"] / max_possible_score

    return sorted_docs[:top_k]
```

## FAQ

### Q: 为什么混合检索分数比纯语义检索低？

A: 混合检索的分数是加权和，而非单纯的相似度。语义检索返回的是 0-1 的余弦相似度，而混合检索的分数是 `0.7*dense + 0.3*sparse`，即使两部分都是 1.0，最终也只有 1.0。但实际中 sparse 分数通常较低，导致总分偏低。

### Q: RRF（Reciprocal Rank Fusion）和加权融合有什么区别？

A: RRF 基于排名位置计算：`score = 1/(k+rank)`，与原始相似度无关。加权融合直接用相似度分数加权，更直观但需要调整阈值。Milvus 原生支持加权融合，RRF 需要自己实现。

### Q: 阈值设为 0.3 会不会引入低质量结果？

A: 需要结合业务场景测试。0.3 是一个经验值，如果发现结果质量下降，可以：
1. 提高到 0.4-0.5
2. 在应用层做二次过滤
3. 使用 LLM 对结果做相关性打分
