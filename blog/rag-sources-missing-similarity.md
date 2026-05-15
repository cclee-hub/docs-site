---
title: 修复 RAG 查询返回的 sources 缺少 similarity 字段
description: RAG 查询接口返回的 sources 数组只有 metadata，缺少每条来源的相似度分数，需合并 distances 字段
date: 2026-03-08
tags: [RAG, Python, Bug修复, API设计, rag, enterprise-ai]
authors: [cclee]
schema: Article
---

> 在 RAG 知识库项目中调试查询结果返回格式问题，以下是完整排查过程。

## TL;DR

RAG `/query` 接口返回的 `sources` 字段只包含 metadata，没有每条来源的 `similarity` 分数。解决方案：在组装响应时，将 `metadatas` 和 `distances` 合并，计算 `similarity = 1 - distance`。


<!-- truncate -->
## 问题现象

调用 RAG 查询接口，返回的 `sources` 缺少相似度信息：

```json
{
  "answer": "根据文档...",
  "sources": [
    {"doc_id": "doc_001", "title": "API 文档", "source": "github"},
    {"doc_id": "doc_002", "title": "开发指南", "source": "github"}
  ],
  "similarity": 0.85
}
```

问题：
- `sources` 数组中的每个对象没有 `similarity` 字段
- 只有顶层的 `similarity`（最高相似度），无法知道每条来源的相关性
- 前端无法按相似度排序或高亮显示

## 根因

原始代码直接返回 metadata，忽略了 distances 信息：

```python
# 问题代码
result = {
    "answer": answer,
    "sources": search_results.get("metadatas", [[]])[0],  # 只有 metadata
    "collection": collection,
    "similarity": max_similarity  # 只有最高分
}
```

向量数据库（如 Milvus、Chroma）的检索结果通常包含三个数组：
- `documents`: 文本内容
- `metadatas`: 元数据
- `distances`: 距离分数（越小越相似）

**疏漏**：只传递了 metadata，没有把 distance 转换为 similarity 并合并到 sources 中。

## 解决方案

合并 `metadatas` 和 `distances`，计算每条来源的相似度：

```python
# 修复代码
metadatas = search_results.get("metadatas", [[]])[0]
distances = search_results.get("distances", [[]])[0]

sources = [
    {**meta, "similarity": round(1 - dist, 3)}
    for meta, dist in zip(metadatas, distances)
]

result = {
    "answer": answer,
    "sources": sources,  # 现在包含 similarity
    "collection": collection,
    "similarity": max_similarity
}
```

修复后返回：

```json
{
  "answer": "根据文档...",
  "sources": [
    {"doc_id": "doc_001", "title": "API 文档", "similarity": 0.85},
    {"doc_id": "doc_002", "title": "开发指南", "similarity": 0.72}
  ],
  "similarity": 0.85
}
```

### 完整代码示例

```python
async def query_handler(request):
    # 1. 执行向量检索
    search_results = await milvus_service.query(
        collection_name=collection,
        query_embeddings=[query_embedding],
        n_results=5
    )

    # 2. 生成答案
    answer = await llm.generate(context, question)

    # 3. 组装 sources（合并 metadata 和 similarity）
    metadatas = search_results.get("metadatas", [[]])[0]
    distances = search_results.get("distances", [[]])[0]

    sources = [
        {**meta, "similarity": round(1 - dist, 3)}
        for meta, dist in zip(metadatas, distances)
    ]

    # 4. 计算最高相似度
    max_similarity = max(s["similarity"] for s in sources) if sources else 0

    return {
        "answer": answer,
        "sources": sources,
        "similarity": max_similarity
    }
```

## FAQ

### Q: 为什么 similarity = 1 - distance？

A: 向量数据库通常返回距离（distance）而非相似度（similarity）。对于余弦距离，`cosine_distance = 1 - cosine_similarity`，所以 `similarity = 1 - distance`。对于欧氏距离，需要用 `similarity = 1 / (1 + distance)` 等公式转换。

### Q: 顶层 similarity 和 sources 中的 similarity 有什么区别？

A: 顶层 `similarity` 是最高相似度（最相关的那条来源），用于判断整体回答质量。`sources` 中每条记录的 `similarity` 表示该来源的相关性，用于排序、高亮或过滤。

### Q: 如果 distance 不是余弦距离怎么办？

A: 需要根据距离类型调整公式：
- 余弦距离：`similarity = 1 - distance`
- 欧氏距离：`similarity = 1 / (1 + distance)`
- 内积：`similarity = distance`（已经是相似度）

检查你的向量数据库配置，确认使用的是哪种距离度量。
