---
title: "FastAPI 422 or useParams Undefined? 4 Contract Mismatches"
description: "422 errors, undefined params, silent SSE failures — all contract mismatches. Locate each by reading the 422 detail, route param names, and event field checks."
date: 2026-09-28
tags: [FastAPI, React, TypeScript, API Design, Frontend-Backend]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does FastAPI return 422 Unprocessable Entity?"
    a: "In 9 out of 10 cases the request body does not match the Pydantic schema: a field name the backend does not expect (sending name when the schema wants label) or a field type mismatch (an array of objects where List[str] is declared). The 422 response body lists every offending field in its detail array — read it before guessing."
  - q: "How do I debug which field caused a FastAPI 422?"
    a: "Open the response body in the browser Network tab or curl: FastAPI returns a detail array where each entry has loc (the field path), msg (Field required / Input should be a valid string), and type. loc pointing at a field you did send under a different name is the classic field-name mismatch."
  - q: "Why does useParams return undefined in React Router?"
    a: "The keys of useParams come from the route definition: a route of /agents/:id exposes only id. Destructuring a name that does not appear in any :param — like agentId — yields undefined silently, no error thrown. Rename during destructuring instead: const { id: agentId } = useParams()."
---

Three classic scenes in frontend-backend integration: a POST returns 422; a route page's parameter stays undefined forever; an SSE request sits at 200 while the UI silently shows nothing. Different symptoms, one family of root causes — **the two sides disagreeing about the interface contract**.

> Encountered this while building an AI Agent SaaS platform for a client, frontend and backend developed in parallel — we hit all four, and here is the locating method and the prevention discipline.

## TL;DR

Contract mismatches come in four shapes, producing three kinds of symptoms:

| Pitfall | Mismatch | Symptom |
|----|---------|------|
| Field name | frontend sends `name`, backend wants `label` | 422 |
| Field type | frontend sends objects, backend expects `List[str]` | 422 |
| Route param | route defines `:id`, component reads `agentId` | undefined, feature silently dead |
| Event field | backend pushes `{"content": ...}`, frontend checks `token` | 200, UI shows nothing |

Prevention is a single discipline: **align on the schema before writing code** — field names, types, route param names, event data shapes, all sourced from the backend schema (or an interface doc both sides confirmed).

## Pitfall 1: Field Name Mismatch → 422

The most basic one. The frontend TypeScript interface declares `name` + `key` for creating an API key; the backend Pydantic schema expects `label` + `api_key`:

```ts
// what the frontend sends
interface CreateApiKeyInput {
  name: string
  key: string
}

# what the backend declares
class ApiKeyCreate(BaseModel):
    label: str
    api_key: str
```

```
POST /api/api-keys → 422 Unprocessable Entity
```

**Locate it from the 422 response body — don't guess.** FastAPI's 422 carries a `detail` array spelling out every missing field and why:

```json
[
  { "loc": ["body", "label"], "msg": "Field required", "type": "missing" },
  { "loc": ["body", "api_key"], "msg": "Field required", "type": "missing" }
]
```

`Field required` = the field is not in your request body at all = a field-name mismatch. Expand the response in the Network tab and it takes ten seconds.

## Pitfall 2: Field Type Mismatch → 422

Names can line up and types can still betray you. The backend declares `mcp_tools` as a list of strings; the frontend sends an array of objects (each with `tool_id` and `token_id` — the business genuinely needs OAuth token binding):

```ts
// what the frontend sends
{ mcp_tools: [{ tool_id: "t1", token_id: "k1" }] }

# what the backend expects
mcp_tools: List[str]
```

```
PATCH /api/agents/{id} → 422 Unprocessable Entity
```

This time `detail` says `Input should be a valid string` — a type mismatch. The fix is making the backend schema accept both shapes (the frontend's structure has a real business reason to exist; don't amputate it):

```python
from typing import List, Union

class McpToolConfig(BaseModel):
    tool_id: str
    token_id: str | None = None

mcp_tools: List[Union[str, McpToolConfig]]
```

`Union` lets the schema accept both a plain string (tool reference only) and an object (with binding config); Pydantic tries them in order. The pattern generalizes to any "API evolves, frontend moves first" situation: **the schema accommodates the real business shape, not the other way around**.

## Pitfall 3: useParams Name Mismatch → undefined

Route definition and component each written from memory, one word apart:

```tsx
// route definition
<Route path="/agents/:id/memory" element={<MemoryPage />} />

// component
const { agentId } = useParams<{ agentId: string }>()
// agentId is undefined forever — the route param is named id, not agentId
```

No error, status codes fine, feature silently dead — `agentId` is undefined, so downstream API calls carry undefined or never fire.

Two fixes:

```tsx
// 1. match the route definition
const { id } = useParams<{ id: string }>()

// 2. or rename while destructuring
const { id: agentId } = useParams<{ id: string }>()
```

What makes this one sneaky is the generic: `useParams<{ agentId: string }>` — TypeScript does not verify that the keys in your generic actually exist in the route definition. The type annotation hands you false confidence.

## Pitfall 4: Event Field Mismatch → 200 but Silent Failure

In an SSE stream, the backend pushes `{"content": "..."}` while the frontend's event check looks for `token`:

```ts
// the frontend's event predicate
const isTokenEvent = (d: any) => 'token' in d        // always false

// what the backend actually pushes
data: {"content": "hello"}
```

The Network tab shows 200 and the stream flowing; the UI shows nothing — the predicate never fires and events are silently dropped. This one is harder to catch than a 422: **no error, just a feature that never happens**.

Fix: align the predicate with the backend's actual data shape:

```ts
const isTokenEvent = (d: any) => 'content' in d && !('type' in d)
```

For SSE/WebSocket interfaces carrying many event kinds over one connection, prefer an explicit `type` field for dispatching; inferring event kinds from "which keys happen to exist" turns every contract change into silent breakage.

## Prevention: One Discipline

All four pitfalls share an origin: each side wrote its half of the interface from imagination. Prevention needs no tooling, one discipline —

**Before writing any interface code, align on the schema: field names, types, route param names, event shapes — item by item.** The backend Pydantic schema (or OpenAPI doc) is the single source of truth; the frontend TypeScript interfaces mirror it. Whoever changes the contract changes the schema first, both sides confirm, then code moves.

When symptoms appear, triage in order: 422 → expand the response `detail` and read `loc`; undefined → check the route's `:param` names; 200 but nothing happened → capture a real response and diff it field-by-field against the frontend predicate.

The server side of streaming interfaces has a companion pitfall (exceptions and leaked resources on client disconnect), covered in [FastAPI SSE CancelledError on Client Disconnect? Catch and Re-raise in the Generator](/blog/fastapi-sse-cancellederror).

<InfoBox variant="warning" title="Watch out">

Frontend TypeScript interfaces (`interface XxxInput`) are compile-time paper constraints — `as any` and third-party request wrappers can bypass them entirely. Types matching does not mean fields matching. The final arbiter of contract truth is always a comparison against the backend schema, not the absence of red squiggles.

</InfoBox>

## FAQ

### Why does FastAPI return 422 Unprocessable Entity?

In 9 out of 10 cases the request body does not match the Pydantic schema: a field name the backend does not expect (sending `name` when the schema wants `label`) or a field type mismatch (an array of objects where `List[str]` is declared). The 422 response body lists every offending field in its `detail` array — read it before guessing.

### How do I debug which field caused a FastAPI 422?

Open the response body in the browser Network tab or curl: FastAPI returns a `detail` array where each entry has `loc` (the field path), `msg` (Field required / Input should be a valid string), and `type`. `loc` pointing at a field you did send under a different name is the classic field-name mismatch.

### Why does useParams return undefined in React Router?

The keys of `useParams` come from the route definition: a route of `/agents/:id` exposes only `id`. Destructuring a name that does not appear in any `:param` — like `agentId` — yields undefined silently, no error thrown. Rename during destructuring instead: `const { id: agentId } = useParams()`.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
