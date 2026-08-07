---
title: "Python json.dumps with default=str turns a set into a string? The hidden substring-match trap"
description: "json.dumps with default=str serializes a Python set as the literal string '{1, 2}' instead of an array; after reload, x in s degrades to substring matching and silently returns wrong results. Fix: serialize as list, rebuild with set() on read."
date: 2026-08-08
tags: [Python, JSON, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I convert a Python set to JSON?"
    a: "A set has no native JSON type, so json.dumps raises TypeError. Convert it with list(set) before serializing to store a standard JSON array, then rebuild with set() when reading it back."
  - q: "How do I fix 'Object of type set is not JSON serializable' in json.dumps?"
    a: "The cause is that sets aren't JSON serializable. The safe fix is to convert the set to a list before dumping, or pass a default function that returns list(obj) for sets. Avoid default=str, which stores the set as a string and loses the type."
  - q: "Why does `in` return wrong results after serializing a set with default=str?"
    a: "default=str passes the set to str(), storing the literal string '{1, 2}' in JSON. On reload the value is a str, so x in s degrades from membership testing to substring matching, silently returning wrong results."
---

When you persist a dict containing a Python `set` with `json.dumps(data, default=str)` and later read it back to test membership with `in`, the result is silently wrong — no exception, but the `in` checks are completely off.

Encountered this while building [AI Ops](/docs/ai-analytics) — AI-powered analytics that surfaces market trends, user behavior, and sales data to drive precise operational strategy. In a decision-replay feature for an analysis template, I needed to serialize a "missing months" set into a snapshot and read it back to decide whether a given month was missing. After replay, months that should have been flagged "missing" were silently judged "not missing" — with zero exceptions anywhere in the chain.

## TL;DR

`default=str` is not a universal escape hatch. It hands `set` to `str()`, storing a **literal string** like `"{1, 2}"` in the JSON instead of an array; the type is irreversible on reload, and an `in` check against it degrades to **substring matching**, silently returning wrong results. When `set` is involved, the correct approach is to convert to `list` before serializing and rebuild with `set()` on read.

## The symptom

This code fully reproduces the silent failure:

```python
import json

# A dict containing a set — say, "months that still need backfill"
data = {"missing_months": {"3", "5", "12"}}

# Serialize with default=str (the common "just don't crash" shortcut)
serialized = json.dumps(data, default=str)
print(serialized)
# {"missing_months": "{'3', '5', '12'}"}   ← a string, not an array!

# Read it back
back = json.loads(serialized)
value = back["missing_months"]
print(type(value))   # <class 'str'>   ← no longer a set

# Silent bug: you meant to test membership in the "missing" set
print("1" in value)   # True   ← 1 is NOT in {3,5,12}, but "1" is a substring of "12"!
print("3" in value)   # True   ← correct by coincidence
print("9" in value)   # False
```

`"1" in value` returns `True`, yet the original set `{"3", "5", "12"}` does not contain `"1"`. No exception, no warning — the result is just quietly wrong. This kind of bug is especially dangerous in branches that act on the check (e.g. "is this month missing data? if so, backfill it").

## Root cause

Three layers:

**Layer 1: `set` is not JSON serializable to begin with.** JSON has only array (list) and object — no set type. A direct `json.dumps({"x": {1, 2}})` raises `TypeError: Object of type set is not JSON serializable`.

**Layer 2: `default=str` turns the error into silent corruption.** The `default` parameter of `json.dumps` is called for objects that can't be serialized, and is expected to return a **serializable value**. When `default=str`, the object goes to `str()` — so a `set` becomes its Python literal form `{'3', '5', '12'}`, stored as a **string** in the JSON:

```python
>>> json.dumps({"m": {"3", "5", "12"}}, default=str)
'{"m": "{\'3\', \'5\', \'12\'}"}'
```

The error is gone — at the cost of the type silently changing from `set` to `str`, with no signal that it happened.

**Layer 3: `in` means different things for `str` vs `set`.** This is the core of the silent bug. For `set`/`list`, `x in s` is a **membership test**; for `str`, `x in s` degrades to **substring matching**. The reloaded value is the string `"{'3', '5', '12'}"`, so `"1" in "{'3', '5', '12'}"` tests whether the substring `"1"` appears — and since `"12"` contains `"1"`, it returns `True`.

This is the same family of trap as [Airflow PostgresHook silently dropping multi-statement SQL results](/blog/2026/06/14/airflow-postgreshook-multistatement-sql-truncated): the most dangerous bugs don't throw — they silently return the wrong answer, leaving you no signal to investigate.

## The fix

Core principle: **store only standard JSON types; rebuild set semantics on the read side.**

### Option 1: explicitly convert to list before serializing (recommended)

The most direct and controllable approach — when you know where the `set` is, convert it to `list` in place:

```python
import json

# Before serializing: set → list (a standard JSON array)
data = {"missing_months": list({"3", "5", "12"})}
serialized = json.dumps(data)
print(serialized)
# {"missing_months": ["3", "5", "12"]}   ← a proper JSON array

# Rebuild the set after reading back
back = json.loads(serialized)
months = set(back["missing_months"])
print("1" in months)   # False ✓
print("3" in months)   # True  ✓
```

The serialized result is a clean JSON array — portable, readable, and restorable.

### Option 2: a custom default function (when data is complex)

If the data structure is deep and you're not sure where a `set` might sneak in, use a `default` function dedicated to collection types — preserving semantics while still falling back for other non-standard types:

```python
import json

def safe_default(obj):
    # Collection types → list, kept as a standard JSON array
    if isinstance(obj, (set, frozenset)):
        return sorted(obj)          # sort for stable, predictable output
    # Only fall back to str for types that truly can't be represented
    return str(obj)

data = {"missing_months": {"3", "5", "12"}, "created_at": some_datetime}
serialized = json.dumps(data, default=safe_default)
# {"missing_months": ["3", "5", "12"], "created_at": "..."}

back = json.loads(serialized)
months = set(back["missing_months"])
print("1" in months)   # False ✓
```

Compared to a blind `default=str`, this function handles "types you need to preserve" (collections) explicitly and only falls back to `str` for genuinely unrepresentable types — minimizing silent risk.

<InfoBox variant="warning" title="Caveats">

- **`default=str` is "silent", not "safe"**: it removes the error but flattens `set`/`tuple`/`datetime`/custom objects into strings irreversibly. Any operation that depends on the original type after reload (`in` membership, arithmetic, comparison) can misbehave.
- **`tuple` has the same problem**: `str((1, 2))` is `"(1, 2)"`, and `in` against it also degrades to substring matching. Handle collection-like containers the same way: serialize as `list`.
- **Cross-process / cross-language portability is the litmus test**: if this JSON will be read by Node.js, Go, etc., the `"{1, 2}"` produced by `default=str` is just a plain string there — not even a valid Python literal — and is nearly impossible to restore. Stick to standard JSON types for portability.
- **Convert at the source when possible**: rather than patching with `default` after the fact, store collection semantics as `list` when you build the data structure, keeping `set` out of the serialization pipeline entirely.

</InfoBox>

## FAQ

### How do I convert a Python set to JSON?

A set has no native JSON type, so `json.dumps` raises `TypeError`. Convert it with `list(set)` before serializing to store a standard JSON array, then rebuild with `set()` when reading it back. This avoids the error and fully restores the set semantics, across languages too.

### How do I fix "Object of type set is not JSON serializable" in json.dumps?

The root cause is that sets aren't JSON serializable. The safe fix is to convert the set to a list before dumping, or pass a `default` function that returns `list(obj)` for `isinstance(obj, (set, frozenset))`. Avoid `default=str` — it doesn't crash, but it stores the set as a string, so the type can't be restored on read.

### Why does `in` return wrong results after serializing a set with default=str?

`default=str` passes the set to `str()`, storing the literal string `'{1, 2}'` in JSON. On reload the value is a `str`, not a `set`, so `x in s` degrades from membership testing to substring matching — e.g. `"1" in "{'3','5','12'}"` returns `True` because `"12"` contains the character `"1"`, even though the original set doesn't contain `"1"`. The fix is to serialize as `list` and rebuild with `set()` on read.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
