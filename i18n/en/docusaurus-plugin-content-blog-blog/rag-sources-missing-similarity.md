---
title: "RAG Query Sources Missing the similarity Field"
description: "The /query endpoint returned sources with metadata only — no per-source similarity. Fix: merge metadatas with distances and compute similarity = 1 - distance when assembling the response."
date: 2026-03-08
tags: [RAG, Python, API-Design, enterprise-ai]
authors: [cclee]
schema: Article
---

> Debugging the query-result response format in a RAG knowledge-base project — the full troubleshooting trail below.

## TL;DR

The RAG `/query` endpoint returned `sources` containing metadata only, with no per-source `similarity` score. Fix: merge `metadatas` and `distances` while assembling the response, computing `similarity = 1 - distance` for each source.


<!-- truncate -->
## The symptom

Calling the RAG query endpoint returns `sources` without similarity information:

```json
{
  "answer": "According to the documents...",
  "sources": [
    {"doc_id": "doc_001", "title": "API Docs", "source": "github"},
    {"doc_id": "doc_002", "title": "Dev Guide", "source": "github"}
  ],
  "similarity": 0.85
}
```

Problems:
- no `similarity` field on any object in the `sources` array
- only the top-level `similarity` (the highest score) — no per-source relevance
- the frontend cannot sort or highlight sources by similarity

## Root cause

The original code returned metadata directly and ignored the distances:

```python
# problem code
result = {
    "answer": answer,
    "sources": search_results.get("metadatas", [[]])[0],  # metadata only
    "collection": collection,
    "similarity": max_similarity  # highest score only
}
```

Vector database (Milvus, Chroma, etc.) search results typically carry three arrays:
- `documents`: text content
- `metadatas`: metadata
- `distances`: distance scores (smaller = more similar)

**The oversight**: only metadata was passed through; distance was never converted to similarity and merged into sources.

## The fix

Merge `metadatas` with `distances`, computing each source's similarity:

```python
# fixed code
metadatas = search_results.get("metadatas", [[]])[0]
distances = search_results.get("distances", [[]])[0]

sources = [
    {**meta, "similarity": round(1 - dist, 3)}
    for meta, dist in zip(metadatas, distances)
]

result = {
    "answer": answer,
    "sources": sources,  # now includes similarity
    "collection": collection,
    "similarity": max_similarity
}
```

After the fix:

```json
{
  "answer": "According to the documents...",
  "sources": [
    {"doc_id": "doc_001", "title": "API Docs", "similarity": 0.85},
    {"doc_id": "doc_002", "title": "Dev Guide", "similarity": 0.72}
  ],
  "similarity": 0.85
}
```

### Complete example

```python
async def query_handler(request):
    # 1. run vector retrieval
    search_results = await milvus_service.query(
        collection_name=collection,
        query_embeddings=[query_embedding],
        n_results=5
    )

    # 2. generate the answer
    answer = await llm.generate(context, question)

    # 3. assemble sources (merge metadata and similarity)
    metadatas = search_results.get("metadatas", [[]])[0]
    distances = search_results.get("distances", [[]])[0]

    sources = [
        {**meta, "similarity": round(1 - dist, 3)}
        for meta, dist in zip(metadatas, distances)
    ]

    # 4. compute the highest similarity
    max_similarity = max(s["similarity"] for s in sources) if sources else 0

    return {
        "answer": answer,
        "sources": sources,
        "similarity": max_similarity
    }
```

## FAQ

### Why is similarity = 1 - distance?

Vector databases usually return distances, not similarities. For cosine distance, `cosine_distance = 1 - cosine_similarity`, hence `similarity = 1 - distance`. For Euclidean distance, use a conversion such as `similarity = 1 / (1 + distance)`.

### Top-level similarity vs. per-source similarity — what's the difference?

The top-level `similarity` is the highest score (the most relevant source) and gauges overall answer quality. Each record's `similarity` inside `sources` expresses that source's relevance — for sorting, highlighting, or filtering.

### What if the distance isn't cosine?

Adjust the formula to the metric:
- Cosine distance: `similarity = 1 - distance`
- Euclidean distance: `similarity = 1 / (1 + distance)`
- Inner product: `similarity = distance` (already a similarity)

Check your vector database configuration to confirm which metric is in use.
