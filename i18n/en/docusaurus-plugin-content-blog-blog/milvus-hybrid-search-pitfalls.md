---
title: "Four Common Pitfalls in Milvus Hybrid Search"
description: "Fix empty sparse vectors, unloaded collections, malformed sparse formats, and thresholds set too high in Milvus Dense + Sparse hybrid search — with minimal fix code for each."
date: 2026-03-07
tags: [RAG, Milvus, Vector-Search, Python, vector-db]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does Milvus reject empty sparse vectors?"
    a: "SPARSE_FLOAT_VECTOR requires at least one non-zero element per row. An empty dict cannot determine vector dimensions; use {0: 0.0} as a placeholder."
  - q: "Why do hybrid search scores usually land between 0.3 and 0.5?"
    a: "The score is a weighted combination (e.g. 0.7 * dense + 0.3 * sparse). Dense and sparse rarely both hit 1.0 in practice, so typical scores run 0.3–0.5. Set thresholds around 0.3."
  - q: "Must I call load_collection before searching in Milvus 2.4?"
    a: "Yes. Milvus 2.4+ no longer auto-loads collections into memory; you must call load_collection explicitly before searching. It is a deliberate memory-optimization design."
---

> Debugging hybrid retrieval scoring in a RAG knowledge-base project — the full troubleshooting trail below.

## TL;DR

Milvus hybrid search (Dense + Sparse) has four common pitfalls: empty sparse vectors erroring out, unloaded collections, malformed sparse formats, and thresholds set too high. Minimal fix code for each below.


<!-- truncate -->
## The symptoms

### Pitfall 1: empty sparse vector insert fails

```python
MilvusException: (code=65535, message=empty sparse float vector row)
```

### Pitfall 2: collection not loaded

```python
MilvusException: (code=101, message=failed to search: collection not loaded[collection=xxx])
```

### Pitfall 3: malformed sparse vector format

```python
ParamError: (code=1, message=`search_data` value [{0: {81705: 1.3486}}] is illegal)
```

### Pitfall 4: searches return nothing (scores filtered out)

```json
{"answer": "Sorry, no relevant content in the knowledge base", "similarity": 0.0}
```

## Root causes

**Pitfall 1**: Milvus's `SPARSE_FLOAT_VECTOR` type rejects empty dicts `{}` — at least one key-value pair is required.

**Pitfall 2**: Milvus 2.4+ requires an explicit `load_collection()` before searching, otherwise "collection not loaded".

**Pitfall 3**: DashScope API returns sparse embeddings as `{text_index: sparse_vec}` — when searching you must extract the `sparse_vec` itself, not the whole nested structure.

**Pitfall 4**: the hybrid score is a weighted combination (e.g. `0.7 * dense_score + 0.3 * sparse_score`), typically 0.3–0.5. A 0.7 threshold filters out every result.

## Fixes

### Pitfall 1: placeholder for empty sparse vectors

```python
# Fetch the sparse vector; fall back to a minimal placeholder when empty
sparse_vec = sparse_vectors.get(chunk_idx, {})
if not sparse_vec:
    sparse_vec = {0: 0.0}  # Milvus rejects empty sparse vectors

data = {
    "dense_vector": dense_embeddings[chunk_idx],
    "sparse_vector": sparse_vec,  # guaranteed non-empty
    "text": chunk,
    "doc_id": doc_id,
    "metadata": metadata
}
```

### Pitfall 2: load the collection before searching

```python
async def hybrid_search(self, collection_name: str, ...):
    self.get_or_create_collection(collection_name)

    # Milvus 2.4+ requirement: load before search
    self.client.load_collection(collection_name=collection_name)

    dense_results = self.client.search(...)
    sparse_results = self.client.search(...)
```

### Pitfall 3: extract the sparse vector correctly

```python
async def embed_query(self, text: str) -> dict:
    result = await self._embed_batch([text], text_type="query", use_instruct=True)
    # _embed_batch returns {"sparse": {0: sparse_vec}}
    # extract the vector at index 0 itself
    return {
        "dense": result["dense"][0],
        "sparse": result["sparse"].get(0, {})  # extract sparse_vec
    }
```

### Pitfall 4: adjust the hybrid-search threshold

```python
# config.py or environment variables
rag_min_similarity: float = 0.3      # filter threshold (0.7 was far too high)
rag_refuse_similarity: float = 0.3   # refuse-to-answer threshold (0.5 was too high)
```

Hybrid score formula:

```python
# typical score range: 0.3 - 0.5
score = dense_similarity * 0.7 + sparse_similarity * 0.3
```

## FAQ

### Why does Milvus reject empty sparse vectors?

`SPARSE_FLOAT_VECTOR` requires at least one non-zero element per row. An empty dict `{}` cannot determine vector dimensions and triggers the `empty sparse float vector row` error. Use `{0: 0.0}` as a placeholder.

### Must I call load_collection before searching in Milvus 2.4?

Yes. Milvus 2.4+ no longer auto-loads collections into memory; call `client.load_collection(collection_name)` explicitly before searching. It is a deliberate design to keep unused collections from occupying memory.

### Why do hybrid search scores usually land between 0.3 and 0.5?

The hybrid score is a weighted sum, not a raw similarity. Even with both retrievals at a perfect 1.0, the weighted maximum is 1.0 — and in practice dense and sparse rarely peak together, so typical scores run 0.3–0.5. Set thresholds around 0.3, not 0.7.

### What format does DashScope sparse embedding return?

DashScope returns `{"embeddings": [{"sparse_embedding": [{"index": 123, "value": 0.5}, ...]}]}`. After batch conversion the shape is `{text_index: {dim_index: value}}`. When searching, use `.get(0, {})` to extract the first entry's sparse vector.
