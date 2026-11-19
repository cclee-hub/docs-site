---
title: "Map field arrives as {}? JSON.stringify skips Maps entirely"
description: "API returns 200 with {} where your Map should be: JSON.stringify walks own enumerable properties and a Map has none — flatten it at the boundary"
date: 2026-11-20
tags: [Node.js, Fastify, JSON]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does JSON.stringify(new Map()) return an empty object?"
    a: "JSON.stringify serializes an object's own enumerable properties, and a Map stores its entries in an internal slot instead of properties — zero own enumerable properties, so the output is {}. Nested Maps behave the same: JSON.stringify({m: new Map([['a',1]])}) gives {\"m\":{}}. Fix: Object.fromEntries(map) before serializing."
  - q: "Why is my Map field empty in a TypeScript API response?"
    a: "TypeScript cannot catch it — a Map is a valid object and JSON.stringify throws no error; the failure is purely at the serialization boundary. Convert explicitly where the response leaves the server: estimates: Object.fromEntries(r.estimates), or type the cross-boundary field as Record<string, T> so plain objects are enforced at the source."
  - q: "Do Set and Date serialize correctly with JSON.stringify?"
    a: "Set fails the same way: JSON.stringify(new Set([1])) is {} — spread it into an array with [...set]. Date works: it implements toJSON(), so JSON.stringify emits an ISO string like \"2026-01-05T00:00:00.000Z\". Rule of thumb: everything outside JSON's native types needs an explicit conversion at the boundary."
---

Ran into this on an estimation endpoint of a Node.js + Fastify service: the response came back 200 with a healthy body, except one field — the per-row dates the client needed were missing because `estimates` was always `{}`, whatever parameters were sent.

## TL;DR

`JSON.stringify(new Map([['a', 1]]))` returns `'{}'`. A Map's entries live in an internal slot, not in own enumerable properties — and stringify only walks own enumerable properties. Fastify and Express both default to `JSON.stringify` and special-case nothing. Returning a Map from the core layer is fine; the bug is passing it through the route untouched. Fix: `Object.fromEntries(map)` before the response leaves.

## Symptoms

The client received `{}` for `estimates` on every call — status 200, a healthy response body, no server-side error, regardless of parameters. The endpoint follows the usual shape — the server computes a schedule, the client renders rows — and the route handed the core function's return value straight to the response:

```ts
app.post('/api/projects/:id/preview', async (req, reply) => {
  const r = await recalcProject({ projectId: req.params.id, /* ... */ });
  return { estimatedEnd: r.estimatedEnd, estimates: r.estimates };
});
```

What the client received:

```json
{
  "estimatedEnd": "2026-10-29",
  "estimates": {}
}
```

`estimatedEnd` was fine; `estimates` was permanently empty. Server-side logs showed the field present, typed Map, with the right number of entries — the same value crossed the HTTP boundary and vanished. Because the status was 200 and nothing errored, the first instinct was a client-side field-access bug, and investigation spent a while on that side — until logging `JSON.stringify(r.estimates)` on the server, which printed `{}`.

One line reproduces it:

```js
JSON.stringify(new Map([['a', 1]]));        // '{}'
JSON.stringify(new Set([1]));               // '{}'
JSON.stringify({ m: new Map([['a', 1]]) }); // '{"m":{}}'
JSON.stringify(new Date('2026-01-05'));     // '"2026-01-05T00:00:00.000Z"'
```

Three empty results, one that works.

## Root cause: stringify only walks own enumerable properties

`JSON.stringify` serializes objects by enumerating their **own enumerable properties** and turning each into a JSON key-value pair. A Map fails the premise entirely: its entries live in the internal [[MapData]] slot defined by the ECMAScript spec, reachable only through `get`/`forEach` and friends, never as properties. An instance has **0** own enumerable properties, so the output is `{}`.

Set is the same story ([[SetData]]). Date is the counter-example — it implements `toJSON()`, which stringify calls first, hence the ISO string.

No framework will save you here. Fastify's default JSON serialization is `JSON.stringify` (unless you register a fast-json-stringify schema), and so is Express's `res.json`. This is not a framework bug but a language-level behavior — and it decides **where** the failure lives: not in the compute layer, at the transport boundary.

In this codebase the core function returning a Map was reasonable: consumed internally, key-value semantics, convenient `get`. The mistake was the route passing the return value **as-is** into the HTTP response, with nothing along the chain checking "a Map is not a legal JSON value" — silent all the way through.

## Fix: flatten at the transport boundary

Convert the Map into a plain object explicitly, at the edge where the response leaves the server. The fix is one call:

```ts
return {
  estimatedEnd: r.estimatedEnd,
  estimates: Object.fromEntries(r.estimates), // Map<string, T> → Record<string, T>
};
```

`Object.fromEntries` produces a plain object, and client-side `estimates.a.plannedEnd` resolves again.

More durable than the one-off fix is a boundary rule: **before a route passes core return values into a response, check for non-POJO fields.** The three common cases and their conversions:

| Type | stringify output | Boundary conversion |
|---|---|---|
| `Map<K, V>` | `{}` | `Object.fromEntries(map)` |
| `Set<T>` | `{}` | `[...set]` |
| `Date` | ISO string (fine) | leave it; `.toISOString()` if you want uniformity |

For a type-level cure, change the cross-boundary return type from `Map<string, TaskEstimate>` to `Record<string, TaskEstimate>` — TypeScript then forces every construction site to choose, and a missed conversion becomes a compile error instead of an empty field in production.

<InfoBox variant="warning" title="Watch out">

- An empty object errors nothing and alerts nothing; tests can stay green if they only assert on `estimatedEnd` and never on `estimates` entry counts. Give cross-boundary fields assertions at the "count > 0" level.
- Maps nested deeper also become `{}` and hide better: in `{ rows: [{ est: new Map() }] }` the casualty is `rows[].est`. When in doubt, `JSON.stringify` the suspect field — fastest way to see what the wire will carry.
- `Object.fromEntries` flattens only the outermost layer; deeply nested Maps need recursive handling — or better, stop using Map at construction sites that feed serialized output.

</InfoBox>

Silent reshaping at serialization boundaries is not JS-only — the Python sibling bug is [json.dumps with default=str turning a set into a string](/blog/python-json-dumps-set-default-str), where membership checks silently degrade into substring matching. Shared lesson: when the serializer meets a non-native type, convert explicitly — never let a fallback decide the shape for you.

## FAQ

### Why does JSON.stringify(new Map()) return an empty object?

JSON.stringify serializes an object's own enumerable properties, and a Map stores its entries in an internal slot instead of properties — zero own enumerable properties, so the output is `{}`. Nested Maps behave the same: `JSON.stringify({m: new Map([['a',1]])})` gives `{"m":{}}`. Fix: `Object.fromEntries(map)` before serializing.

### Why is my Map field empty in a TypeScript API response?

TypeScript cannot catch it — a Map is a valid object and JSON.stringify throws no error; the failure is purely at the serialization boundary. Convert explicitly where the response leaves the server: `estimates: Object.fromEntries(r.estimates)`, or type the cross-boundary field as `Record<string, T>` so plain objects are enforced at the source.

### Do Set and Date serialize correctly with JSON.stringify?

Set fails the same way: `JSON.stringify(new Set([1]))` is `{}` — spread it into an array with `[...set]`. Date works: it implements `toJSON()`, so JSON.stringify emits an ISO string like `"2026-01-05T00:00:00.000Z"`. Rule of thumb: everything outside JSON's native types needs an explicit conversion at the boundary.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
