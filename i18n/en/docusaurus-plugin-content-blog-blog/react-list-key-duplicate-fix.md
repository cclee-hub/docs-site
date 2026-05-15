---
title: Fix React List Key Duplication Causing DOM Errors
description: Using Date.now() as React list key can cause duplicate keys within the same millisecond, leading to Failed to execute 'removeChild' errors
date: 2026-03-19
tags: [React, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why shouldn't I use Date.now() as React list key?"
    a: "Date.now() returns millisecond timestamps. Multiple calls within the same millisecond return identical values, causing key duplication."
  - q: "What happens when React keys are duplicated?"
    a: "It breaks React's reconciliation process, causing DOM errors like 'Failed to execute removeChild on Node'."
---

Encountered this issue while building an AI Agent chat interface. Here's the root cause and solution.

## TL;DR

`Date.now()` millisecond timestamps can duplicate within the same millisecond. When used as React list keys, this causes DOM errors. Fix by adding a random suffix or using `crypto.randomUUID()`.


<!-- truncate -->
## Problem

When rapidly sending messages in a chat interface, the console shows:

```
Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
```

Messages disappear or render incorrectly.

## Root Cause

Original code used `Date.now()` for message IDs:

```typescript
// ❌ Problematic code
const id = `msg-${Date.now()}-user`
```

`Date.now()` returns millisecond timestamps (e.g., `1742345678001`). The problem:

1. **Same millisecond = same value** — JavaScript's event loop executes synchronous code much faster than 1ms
2. **Rapid operations trigger multiple calls** — Fast message sending, SSE streaming creating multiple messages simultaneously
3. **Duplicate keys break reconciliation** — React treats same-key elements as identical, causing DOM operation errors

Example: User sends two messages within 1ms, both get key `msg-1742345678001-user`.

## Solution

### Option 1: Add Random Suffix (Recommended)

```typescript
// ✅ Fixed
const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-user`
```

- `Math.random().toString(36)` generates base-36 random string
- `.slice(2, 9)` extracts 7 characters for sufficient uniqueness
- Timestamp + random string combination has extremely low collision probability

### Option 2: Use crypto.randomUUID()

```typescript
// ✅ More robust (requires modern browser or Node 15.6+)
const id = crypto.randomUUID()  // e.g., "550e8400-e29b-41d4-a716-446655440000"
```

- Cryptographically secure unique identifier
- Collision-free guarantee
- Compatibility: Chrome 92+, Firefox 95+, Safari 15.4+

### Option 3: Counter + Timestamp

```typescript
let counter = 0
const id = `msg-${Date.now()}-${counter++}-user`
```

- Simple and reliable
- Requires maintaining counter state

## Complete Example

```typescript
// Message creation in Zustand store
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],

  addUserMessage: (content: string) => {
    // ✅ Timestamp + random suffix
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-user`
    const message: ChatMessage = {
      id,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, message],
    }))
    return id
  },
}))
```

## Key Principles

1. **Keys must be unique and stable** — Same element's key cannot duplicate among siblings
2. **Avoid using index as key** — Causes issues when list order changes
3. **Avoid timestamp-only keys** — Millisecond precision insufficient; microsecond (`performance.now()`) also unreliable

---
**Interested in similar solutions? [Contact us](/about)**
