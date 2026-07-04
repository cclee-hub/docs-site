---
title: "Milvus: invalid collection name? The name must start with a letter or underscore — never concat a UUID"
description: "Milvus raises invalid collection name (error code 1100): a collection name must start with a letter or underscore, only [a-zA-Z0-9_] are allowed, hyphens are forbidden, and length ≤ 255. A UUID starts with a digit and contains hyphens, so it cannot be concatenated into a collection name."
date: 2026-07-04
tags: [Milvus, Vector Database, RAG]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What are the Milvus collection name naming rules?"
    a: "The first character must be a letter or underscore; the rest allow only letters, digits, and underscores. No hyphens or spaces, max 255 characters. Violations raise invalid collection name (code 1100)."
  - q: "What is the maximum length of a Milvus collection name?"
    a: "255 characters. Longer names are rejected with invalid collection name (error code 1100), and collection creation or lookup fails outright."
  - q: "Why can't a UUID be used as a Milvus collection name prefix?"
    a: "A UUID often starts with a digit and always contains hyphens, both of which violate the rules. Use tenant_id as a regular field or partition key for isolation, not as part of the collection name."
---

While prefixing vector collections per tenant with `{tenant_id}_{collection}`, the very first request bounced straight back from Milvus — `invalid collection name: the first character ... must be an underscore or letter` — and the endpoint returned 500.

Encountered this while building [AI Customer Service](/docs/customer-service) — 24/7 AI support that answers product usage questions with instant guidance and best practices.

## TL;DR

Milvus strictly validates collection names: the first character must be a letter or underscore, only `[a-zA-Z0-9_]` are allowed (**no hyphens**), and length ≤ 255 — otherwise it raises `invalid collection name` (error code 1100). A UUID typically starts with a digit and always contains hyphens `-`, tripping both rules, so **you cannot concat a tenant_id UUID into a collection name** for isolation. Use the original name plus a tenant field filter instead.

## The symptom

A query endpoint with `collection=system_product_help` returned 500, with a single line in the rag-service log:

```
pymilvus.exceptions.MilvusException: code=1100,
Invalid collection name: 00000000-0000-0000-0000-000000000001_system_product_help.
the first character of a collection name must be an underscore or letter
```

The strange part: another endpoint with the same parameter (`/query-logs`) returned 200 — because it only reads PostgreSQL and never touches Milvus. Only paths that actually call Milvus `has_collection` trigger the validation.

## Root cause

The code built the collection name with `f"{tenant_id}_{collection}"`, yielding e.g. `00000000-0000-0000-0000-000000000001_system_product_help`. This name breaks two rules at once:

```text
00000000-0000-0000-0000-000000000001_system_product_help
^              ^ ^
│              │ └─ underscore is fine here, but...
│              └─── hyphen `-` is illegal
└────────────────── first char is digit `0` (must be letter/underscore)
```

Milvus's collection name rules (source `nameutil.go`, regex `^[a-zA-Z_][a-zA-Z0-9_]*$`, length ≤ 255):

| Rule | Requirement |
|------|-------------|
| First char | letter or underscore `_` |
| Other chars | only `[a-zA-Z0-9_]` (letters, digits, underscore) |
| Forbidden | hyphen `-`, space, dot, any other special char |
| Length | 1–255 characters |

A UUID almost always violates this: the standard `8-4-4-4-12` form carries 4 hyphens, and the first segment usually starts with a digit. Prefixing a collection name with such a token gets every `has_collection` / `describe_collection` / create call rejected server-side with code 1100.

Worse: because the concatenated name was never valid, the supposed "per-tenant prefix isolation" never actually worked — the collections that really exist in the database all use the un-prefixed original names. The concat logic was systematically disconnected from the real data; an assumption baked into code that no one ever verified.

## The fix

**Don't put tenant_id in the collection name.** Always use the original name; let a regular field handle tenant isolation:

```python
from pymilvus import MilvusClient

client = MilvusClient(uri="http://localhost:19530")

# ❌ Wrong: UUID prefix — starts with a digit + contains hyphens → code 1100
tenant_id = "00000000-0000-0000-0000-000000000001"
bad_name = f"{tenant_id}_system_product_help"   # illegal

# ✅ Right: collection keeps its original name; tenant_id is a schema field
client.create_collection(
    collection_name="system_product_help",        # legal, stable
    schema=client.create_schema(auto_id=True, enable_dynamic_field=False),
)
# Filter by tenant_id at write and query time, instead of renaming the collection
client.insert(
    collection_name="system_product_help",
    data=[{"tenant_id": tenant_id, "text": "...", "vector": [...]}],
)
```

If you genuinely need "a readable prefix" for multi-tenant or environment isolation, convert any arbitrary string into a safe slug before concatenating:

```python
import re

def safe_slug(raw: str) -> str:
    # Replace anything outside [a-zA-Z0-9_] with underscore; prefix if first char is illegal
    s = re.sub(r"[^a-zA-Z0-9_]", "_", raw)
    if not re.match(r"^[a-zA-Z_]", s):
        s = "_" + s
    return s[:255]   # keep within the length cap

name = f"{safe_slug(tenant_id)}_system_product_help"   # legal
```

When debugging a 500 like this, first scan the service logs (PM2 or equivalent) for `MilvusException` — the error code and the "first character must be ..." hint pinpoint an illegal name almost immediately, so you don't need to dig into business logic.

As an aside, services that depend on Milvus have their own gotcha: containers without a restart policy take the whole RAG pipeline down after a crash — see [Docker Compose service won't come back? Check the restart policy](/blog/docker-compose-restart-policy-service-down). On the query side, watch out for [RRF scores being incompatible with the similarity threshold](/blog/milvus-hybrid-search-rrf-threshold) in hybrid search.

## Caveats

<InfoBox variant="warning" title="Caveats">

- **Hyphens are the sneakiest trap**: many teams default to kebab-case names like `tenant-env-docs`, all of which are illegal in Milvus. Always use `snake_case`.
- **It's not just collection names**: database names, partition names, and field names follow similar rules (first char, allowed charset). Any UUID or hyphenated concat should be validated first.
- **Isolate with fields, not collection counts**: giving each tenant its own collection makes the collection count scale linearly with tenants, well past Milvus's comfort zone. Modeling `tenant_id` as a regular field with filtering, or as a partition key, is the stable approach.
- **Validation is server-side**: the pymilvus client doesn't always pre-validate every call, so an illegal name may only surface with a 1100 once the request reaches Milvus — easy to miss in local unit tests.

</InfoBox>

## FAQ

### What are the Milvus collection name naming rules?

The first character must be a letter or underscore; the remaining characters allow only letters, digits, and underscores (`[a-zA-Z0-9_]`). Hyphens and spaces are forbidden, and the maximum length is 255 characters. Milvus enforces this server-side with a regex; violations raise `invalid collection name` (error code 1100), failing both creation and lookup. `snake_case` is the safe choice.

### What is the maximum length of a Milvus collection name?

255 characters. Anything longer is rejected with `invalid collection name` (error code 1100). Real names rarely approach this limit — what usually pushes you over is concatenating long UUIDs or multi-segment paths into the name, which is itself a sign you shouldn't be putting that dynamic string in the collection name at all.

### Why can't a UUID be used as a Milvus collection name prefix?

The standard UUID form usually starts with a digit (violating "first char must be a letter/underscore") and always contains four hyphens `-` (not in the allowed charset) — both break the rules. Using tenant_id as a collection-name prefix for isolation is a common misuse: not only is the name illegal, it also makes the collection count balloon with tenants. The right approach is to put tenant_id in a regular field or partition key and keep the collection name stable.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
