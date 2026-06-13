---
title: Milvus collection name returns 500? UUID hyphens break the naming rules
description: "Milvus throws Invalid collection name when the name starts with a digit or contains hyphens. Rule: first char letter/underscore, only [a-zA-Z0-9_], no hyphens — never concatenate UUIDs raw."
date: 2026-06-13
tags: [Milvus, RAG, vector-db, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What are the Milvus collection name naming rules?"
    a: "The first character must be a letter or underscore, only [a-zA-Z0-9_] are allowed, hyphens are forbidden, and length ≤ 255. UUIDs contain hyphens and often start with a digit, so they cannot be concatenated into a collection name directly."
  - q: "How do you rename a Milvus collection?"
    a: "Milvus does not support direct rename. Create a collection with a valid name, migrate the data, then drop the old one; or point an alias at the new collection so queries switch without code changes."
  - q: "Can I use a UUID as a Milvus collection name?"
    a: "Not raw. Convert it first: strip the hyphens and prepend a letter prefix, e.g. c_{uuid.replace('-', '')}, so the first character is a letter and no hyphens remain."
---

> Debugging multi-tenant collection naming in a RAG knowledge base project — full writeup below.

## TL;DR

Concatenating `f"{tenant_id}_{collection}"` to name a Milvus collection breaks when `tenant_id` is a UUID: the result starts with a digit and contains hyphens `-`, both of which violate Milvus naming rules and throw `code=1100`. The rule in one line: **first character must be a letter or underscore, only `[a-zA-Z0-9_]` allowed, no hyphens**. Never concatenate a UUID raw — use the original collection name, or convert it to a legal identifier.

{/* truncate */}

## Symptom

With a `tenant_id` in the request, `/stats` reliably returns 500:

```python
GET /api/v1/stats?collection=system_product_help → 500 Internal Server Error
```

The rag-service log is explicit:

```python
pymilvus.exceptions.MilvusException:
code=1100,
Invalid collection name:
00000000-0000-0000-0000-000000000001_system_product_help.
the first character of a collection name must be an underscore or letter
```

The odd part: the **same parameters** against `/query-logs` return 200. One endpoint dead, one alive — that points straight at a layer only one of them touches.

## Root cause

The bug is in how the collection name is built:

```python
# Original: tenant_id (UUID) prepended to the collection name
collection_name = f"{tenant_id}_{collection}"
# Result: 00000000-0000-0000-0000-000000000001_system_product_help
```

Since `tenant_id` is a UUID, it trips two of Milvus's naming rules at once:

1. **Often starts with a digit** (UUID segments begin with hex digits), but Milvus requires the first character to be a letter or underscore.
2. **Contains hyphens `-`**, but Milvus collection names only allow `[a-zA-Z0-9_]` — hyphens are illegal.

Why does `/stats` fail while `/query-logs` succeeds? Because `/stats` hits Milvus (`has_collection` triggers name validation and throws), while `/query-logs` is a pure database query that never touches Milvus, so it returns 200. That "same params, different behavior" is the key clue — **the divergence sits exactly at the Milvus layer**.

## Solution

The cleanest fix: always use the **original collection name** and never encode `tenant_id` in it. Do multi-tenant isolation with a metadata field and a filter expression (Milvus lets you store `tenant_id` in metadata and filter via `expr`), not via a collection-name prefix.

```python
# ✅ Use the raw collection name — no tenant prefix
collection_name = collection  # e.g. "system_product_help"

# Isolate tenants via metadata + filter expression, not collection naming
results = client.query(
    collection_name=collection_name,
    filter=f'metadata["tenant_id"] == "{tenant_id}"',
    output_fields=["text", "metadata"],
)
```

If you genuinely must encode the tenant in the collection name (e.g. for physical isolation), convert the UUID to a legal identifier first — **strip hyphens and prepend a letter prefix**:

```python
def safe_collection_name(tenant_id: str, collection: str) -> str:
    # UUID: 00000000-0000-...-... → 00000000_0000_..._...
    # c_ prefix guarantees a letter first; hyphens become underscores
    safe = tenant_id.replace("-", "_")
    return f"c_{safe}_{collection}"

# Result: c_00000000_0000_0000_0000_000000000001_system_product_help
# ✅ First char is a letter, only [a-zA-Z0-9_]
```

<InfoBox variant="warning" title="Naming rules cheat sheet">

Milvus collection name hard constraints:

- **First character**: must be a letter (a-z, A-Z) or underscore `_`, never a digit
- **Allowed characters**: only `[a-zA-Z0-9_]` — **no hyphens `-`, spaces, or dots**
- **Length**: ≤ 255 characters

Any identifier carrying a UUID, email, or domain (with dots or hyphens) cannot be concatenated into a collection name raw. The same applies to **field names, partition names, and index names**.

</InfoBox>

For the record, Milvus has other collection-level traps too: empty sparse vectors and unloaded collections both break search — covered in [the four common Milvus hybrid search pitfalls](/blog/milvus-hybrid-search-pitfalls); and a hybrid search threshold set too high filters everything out, since the weighted-fusion score caps around 0.7 — see [Milvus hybrid search RRF threshold](/blog/milvus-hybrid-search-rrf-threshold).

## FAQ

### What are the Milvus collection name naming rules?

The first character must be a letter or underscore, only `[a-zA-Z0-9_]` are allowed, hyphens are forbidden, and length ≤ 255. UUIDs contain hyphens and often start with a digit, so they cannot be concatenated into a collection name directly.

### How do you rename a Milvus collection?

Milvus does not support direct rename. Create a collection with a valid name, migrate the data, then drop the old one; or point an alias at the new collection so the query side switches without code changes.

### Can I use a UUID as a Milvus collection name?

Not raw. Convert it first: strip the hyphens and prepend a letter prefix, e.g. `c_{uuid.replace('-', '')}`, so the first character is a letter and no hyphens remain.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
