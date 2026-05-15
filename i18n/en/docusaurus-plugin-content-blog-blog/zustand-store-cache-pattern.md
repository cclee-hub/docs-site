---
title: Implementing Data Caching in Zustand Store
description: Use lastFetchTime + TTL pattern to implement simple cache expiration in Zustand store, avoiding duplicate API requests
date: 2026-03-19
tags: [React, Zustand, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to implement data caching in Zustand store?"
    a: "Store lastFetchTime in state, check TTL before each request. Skip request if cache hasn't expired."
  - q: "When should I use store caching?"
    a: "For configuration data, dictionaries, and other infrequently-changing data shared across pages, like tool lists or user permissions."
---

Encountered this issue while building an AI Agent platform. Here's the root cause and solution.

## TL;DR

Add `lastFetchTime` field and TTL constant to Zustand store. Check cache expiration before requesting. Implement effective data caching in ~10 lines of code, avoiding duplicate requests across pages.


<!-- truncate -->
## Problem

MCP tools list is used by multiple pages (Agent Settings, Tools Marketplace, Chat tool selector). Each page entry triggers an API request:

```
GET /api/mcp-tools  → 200  (AgentSettingsPage)
GET /api/mcp-tools  → 200  (McpToolsPage)
GET /api/mcp-tools  → 200  (ChatPage tool selector)
```

Tools list rarely changes (admin configures manually), but frequent requests waste bandwidth and slow page loads.

## Root Cause

Components call API directly without caching:

```typescript
// ❌ No caching: requests on every mount
function McpToolsPage() {
  const [tools, setTools] = useState([])

  useEffect(() => {
    mcpToolsApi.list().then(setTools)
  }, [])

  return <ToolList tools={tools} />
}
```

Problems:
1. **Each page requests independently** — No global state sharing
2. **Repeated requests in short time** — Triggered when user navigates between pages
3. **No refresh control** — Re-fetches even when data unchanged

## Solution

### Zustand Store + TTL Cache

```typescript
// src/stores/mcpToolsStore.ts
import { create } from 'zustand'
import { mcpToolsApi, type McpTool } from '@/services/api'

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

interface McpToolsState {
  tools: McpTool[]
  lastFetchTime: number | null
  loading: boolean
  error: string | null

  fetchTools: (force?: boolean) => Promise<void>
  clearError: () => void
}

export const useMcpToolsStore = create<McpToolsState>((set, get) => ({
  tools: [],
  lastFetchTime: null,
  loading: false,
  error: null,

  fetchTools: async (force = false) => {
    const { tools, lastFetchTime } = get()

    // Has cache, not expired, not forced → skip
    if (tools.length && lastFetchTime && !force) {
      if (Date.now() - lastFetchTime < CACHE_TTL) {
        return  // Cache hit
      }
    }

    set({ loading: true, error: null })
    try {
      const data = await mcpToolsApi.list()
      set({ tools: data, lastFetchTime: Date.now(), loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tools'
      set({ error: message, loading: false })
    }
  },

  clearError: () => set({ error: null }),
}))
```

### Component Usage

```typescript
// ✅ Using store cache
function McpToolsPage() {
  const { tools, loading, fetchTools } = useMcpToolsStore()

  useEffect(() => {
    fetchTools()  // Auto-checks cache
  }, [fetchTools])

  if (loading) return <Spinner />
  return <ToolList tools={tools} />
}

// Force refresh
function RefreshButton() {
  const { fetchTools } = useMcpToolsStore()
  return <button onClick={() => fetchTools(true)}>Refresh</button>
}
```

## Core Logic Explained

```typescript
// Cache check logic
if (tools.length && lastFetchTime && !force) {
  if (Date.now() - lastFetchTime < CACHE_TTL) {
    return  // Cache valid, skip request
  }
}
```

| Condition | Meaning |
|-----------|---------|
| `tools.length` | Has data (empty array not valid cache) |
| `lastFetchTime` | Recorded last request time |
| `!force` | Not forced refresh |
| `Date.now() - lastFetchTime < CACHE_TTL` | Not expired |

## Use Cases

| Scenario | Suitable | Reason |
|----------|----------|--------|
| Tool lists, config dictionaries | ✅ Yes | Low change frequency, shared across pages |
| User permissions, roles | ✅ Yes | Rarely changes within session |
| Real-time data (messages, notifications) | ❌ No | Needs latest state |
| Paginated lists | ❌ No | Large data volume, complex caching strategy |

## Extension: Fine-grained Cache Control

```typescript
interface CacheOptions {
  ttl: number                    // Expiration time
  staleWhileRevalidate: boolean  // Return stale data while refreshing
}

// Background refresh after expiration, return cached data first
if (tools.length && lastFetchTime) {
  const age = Date.now() - lastFetchTime
  if (age < CACHE_TTL) {
    return  // Cache fresh
  }
  if (options.staleWhileRevalidate && age < CACHE_TTL * 2) {
    // Cache stale but acceptable, background refresh
    mcpToolsApi.list().then(data => set({ tools: data, lastFetchTime: Date.now() }))
    return
  }
}
```

## Key Principles

1. **Set reasonable TTL** — Based on data change frequency
2. **Provide force refresh** — Users can manually get latest data
3. **Show loading on first fetch** — Empty data shouldn't skip request

---
**Interested in similar solutions? [Contact us](/about)**
