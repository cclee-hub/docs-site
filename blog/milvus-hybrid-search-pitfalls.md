---
title: 修复 Milvus 混合搜索的四个常见坑
description: 解决 empty sparse vector、collection not loaded、sparse 格式错误、阈值过高导致的 Milvus Hybrid Search 失败问题
date: 2026-03-07
tags: [RAG, Milvus, 向量搜索, Python, Bug修复, vector-db]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Milvus 为什么不接受空的稀疏向量？"
    a: "Milvus 的 SPARSE_FLOAT_VECTOR 类型要求每行至少有一个非零元素。空字典无法确定向量维度，使用 {0: 0.0} 作为占位符即可绕过。"
  - q: "混合搜索的分数为什么通常只有 0.3-0.5？"
    a: "混合搜索分数是加权组合（如 0.7 * dense + 0.3 * sparse）。实际场景中 dense 和 sparse 分数很少同时为 1.0，所以典型分数在 0.3-0.5。阈值应设为 0.3 左右。"
  - q: "Milvus 2.4 搜索前必须调用 load_collection 吗？"
    a: "是的。Milvus 2.4+ 默认不自动加载 Collection 到内存，必须显式调用 load_collection 后才能搜索。这是性能优化设计。"
---

> 在 RAG 知识库项目中调试混合检索评分问题，以下是完整排查过程。

## TL;DR

Milvus 混合搜索（Dense + Sparse）有四个常见坑：空稀疏向量报错、Collection 未加载、sparse 格式错误、阈值过高。本文给出每个问题的最小修复代码。


<!-- truncate -->
## 问题现象

### 坑 1：空稀疏向量插入失败

```python
MilvusException: (code=65535, message=empty sparse float vector row)
```

### 坑 2：Collection 未加载

```python
MilvusException: (code=101, message=failed to search: collection not loaded[collection=xxx])
```

### 坑 3：Sparse 向量格式错误

```python
ParamError: (code=1, message=`search_data` value [{0: {81705: 1.3486}}] is illegal)
```

### 坑 4：搜索无结果（分数被过滤）

```json
{"answer": "抱歉，知识库中没有相关内容", "similarity": 0.0}
```

## 根因

**坑 1**：Milvus 的 `SPARSE_FLOAT_VECTOR` 类型不接受空字典 `{}`，必须有至少一个键值对。

**坑 2**：Milvus 2.4+ 要求搜索前显式调用 `load_collection()`，否则报 collection not loaded。

**坑 3**：DashScope API 返回的 sparse 格式是 `{text_index: sparse_vec}`，搜索时需要提取 `sparse_vec` 本身，而非整个嵌套结构。

**坑 4**：混合搜索的分数是加权组合（如 `0.7 * dense_score + 0.3 * sparse_score`），通常在 0.3-0.5 之间。如果阈值设为 0.7，所有结果都会被过滤。

## 解决方案

### 坑 1：为空稀疏向量添加占位符

```python
# 获取稀疏向量，如果为空则使用最小占位符
sparse_vec = sparse_vectors.get(chunk_idx, {})
if not sparse_vec:
    sparse_vec = {0: 0.0}  # Milvus 不接受空 sparse vector

data = {
    "dense_vector": dense_embeddings[chunk_idx],
    "sparse_vector": sparse_vec,  # 保证非空
    "text": chunk,
    "doc_id": doc_id,
    "metadata": metadata
}
```

### 坑 2：搜索前加载 Collection

```python
async def hybrid_search(self, collection_name: str, ...):
    self.get_or_create_collection(collection_name)

    # Milvus 2.4+ 要求：搜索前必须加载
    self.client.load_collection(collection_name=collection_name)

    dense_results = self.client.search(...)
    sparse_results = self.client.search(...)
```

### 坑 3：正确提取 Sparse 向量

```python
async def embed_query(self, text: str) -> dict:
    result = await self._embed_batch([text], text_type="query", use_instruct=True)
    # _embed_batch 返回 {"sparse": {0: sparse_vec}}
    # 需要提取 index 0 的向量本身
    return {
        "dense": result["dense"][0],
        "sparse": result["sparse"].get(0, {})  # 提取 sparse_vec
    }
```

### 坑 4：调整混合搜索阈值

```python
# config.py 或环境变量
rag_min_similarity: float = 0.3      # 过滤阈值（原 0.7 过高）
rag_refuse_similarity: float = 0.3   # 拒答阈值（原 0.5 过高）
```

混合搜索分数计算公式：

```python
# 典型分数范围：0.3 - 0.5
score = dense_similarity * 0.7 + sparse_similarity * 0.3
```

## FAQ

### Q: Milvus 为什么不接受空的稀疏向量？

A: Milvus 的 `SPARSE_FLOAT_VECTOR` 类型要求每行至少有一个非零元素。空字典 `{}` 无法确定向量维度，会触发 `empty sparse float vector row` 错误。使用 `{0: 0.0}` 作为占位符即可绕过。

### Q: Milvus 2.4 搜索前必须调用 load_collection 吗？

A: 是的。Milvus 2.4+ 默认不自动加载 Collection 到内存，必须显式调用 `client.load_collection(collection_name)` 后才能搜索。这是性能优化设计，避免不用的 Collection 占用内存。

### Q: 混合搜索的分数为什么通常只有 0.3-0.5？

A: 混合搜索分数是加权组合（如 `0.7 * dense + 0.3 * sparse`）。即使两个检索都完美匹配（1.0），加权后最高也只有 1.0。实际场景中 dense 和 sparse 分数很少同时为 1.0，所以典型分数在 0.3-0.5。阈值应设为 0.3 左右，而非 0.7。

### Q: DashScope sparse embedding 返回什么格式？

A: DashScope 返回 `{"embeddings": [{"sparse_embedding": [{"index": 123, "value": 0.5}, ...]}]}`。批量调用时，转换后格式为 `{text_index: {dim_index: value}}`。搜索时需要用 `.get(0, {})` 提取第一条的 sparse 向量。
