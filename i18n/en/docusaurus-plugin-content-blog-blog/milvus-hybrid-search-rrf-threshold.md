---
title: "Milvus Hybrid Retrieval: Weighted Fusion Scores vs. Similarity Thresholds"
description: "Weighted-fusion hybrid scores rarely exceed 0.7, so a 0.7 threshold filters out everything. Lower the threshold to ~0.3 or normalize the fused scores."
date: 2026-03-08
tags: [Milvus, RAG, Vector-Search, vector-db, enterprise-ai]
authors: [cclee]
schema: Article
---

> Debugging hybrid retrieval scoring in a RAG knowledge-base project — the full troubleshooting trail below.

## TL;DR

Milvus hybrid retrieval with weighted fusion scores as `0.7 * dense_score + 0.3 * sparse_score` tops out around 0.7 in theory — and lower in practice. Filtering with `min_similarity=0.7` removes nearly everything. Fix: drop the threshold to 0.3, or adapt it to the fusion strategy dynamically.


<!-- truncate -->
## The symptom

Hybrid retrieval returns empty results even though relevant documents clearly exist in the database:

```python
# Calling hybrid retrieval
results = await milvus_service.hybrid_search(
    collection_name="knowledge_base",
    query_dense=dense_vector,
    query_sparse=sparse_vector,
    top_k=5,
    min_similarity=0.7  # the root of the problem
)

# Returns an empty array []
print(results)  # {"documents": [[]], "metadatas": [[]], "distances": [[]]}
```

The logs show results were retrieved, then filtered away:

```
fused_results before filter: 10, scores: [0.52, 0.48, 0.45, ...]
min_similarity threshold: 0.7
fused_results after filter: 0, scores: []
```

## Root cause

The retrieval uses **weighted fusion**, not Reciprocal Rank Fusion (RRF):

```python
def _fuse_and_rank(self, dense_results, sparse_results, top_k):
    semantic_weight = 0.7   # semantic weight
    keyword_weight = 0.3    # keyword weight

    for result in dense_results:
        similarity = 1 - distance
        score = similarity * semantic_weight  # 0.7 * score

    for result in sparse_results:
        similarity = 1 - distance
        score = similarity * keyword_weight   # 0.3 * score

    # scores for the same document are summed
    final_score = dense_score + sparse_score
```

**The math**:
- Assume dense and sparse similarities both max out at 1.0
- Maximum fused score = `0.7 * 1.0 + 0.3 * 1.0 = 1.0`
- In practice sparse scores usually run low (0.3–0.5) — keywords rarely match perfectly
- **Realistic maximum: about 0.5–0.7**

Filtering with `min_similarity=0.7` demands a near-perfect match, so the results are naturally empty.

## Fixes

### Option 1: lower the threshold (recommended)

```python
# config.py
class Settings(BaseSettings):
    rag_min_similarity: float = 0.3  # hybrid score threshold (weighted scores run low)
```

### Option 2: dynamic threshold

Different thresholds per retrieval type:

```python
# lower threshold for hybrid retrieval
if search_type == "hybrid":
    min_similarity = 0.3
else:
    min_similarity = 0.7  # pure semantic retrieval tolerates a higher threshold
```

### Option 3: normalize the fused scores

Normalize fused scores into [0, 1]:

```python
def _fuse_and_rank(self, dense_results, sparse_results, top_k):
    # ... fusion logic ...

    # normalize by dividing by the weight sum
    max_possible_score = self.semantic_weight + self.keyword_weight  # 1.0
    for doc in doc_scores.values():
        doc["score"] = doc["score"] / max_possible_score

    return sorted_docs[:top_k]
```

## FAQ

### Why are hybrid retrieval scores lower than pure semantic retrieval scores?

Hybrid scores are weighted sums, not plain similarities. Semantic retrieval returns a 0–1 cosine similarity; hybrid returns `0.7*dense + 0.3*sparse` — even at 1.0 on both sides the total is 1.0, and since sparse scores typically run low, totals sit low.

### How does RRF (Reciprocal Rank Fusion) differ from weighted fusion?

RRF scores by rank position: `score = 1/(k+rank)`, independent of raw similarity. Weighted fusion weights similarity scores directly — more intuitive, but thresholds need retuning. Milvus supports weighted fusion natively; RRF requires a custom implementation.

### Won't a 0.3 threshold let in low-quality results?

Test against your own workload. 0.3 is an empirical value; if quality degrades:
1. raise it to 0.4–0.5,
2. add a second filtering pass at the application layer, or
3. have an LLM score result relevance.
