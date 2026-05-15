---
title: 在 Zustand Store 中实现数据缓存
description: 通过 lastFetchTime + TTL 模式，在 Zustand store 内实现简单的缓存过期机制，避免重复请求
date: 2026-03-19
tags: [React, Zustand, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Zustand store 如何实现数据缓存？"
    a: "在 store 中记录 lastFetchTime，每次请求前检查是否超过 TTL，未过期则跳过请求"
  - q: "什么场景适合用 store 缓存？"
    a: "配置数据、字典数据等变化不频繁、多页面共享的数据，如工具列表、用户权限等"
---

在构建 AI Agent 平台时遇到此问题，记录根因与解法。

## TL;DR

在 Zustand store 中添加 `lastFetchTime` 字段和 TTL 常量，请求前检查缓存是否过期。10 行代码实现简单有效的数据缓存，避免多页面重复请求同一数据。


<!-- truncate -->
## 问题现象

MCP 工具列表被多个页面使用（Agent 设置页、工具市场页、聊天页），每次进入页面都触发 API 请求：

```
GET /api/mcp-tools  → 200  (AgentSettingsPage)
GET /api/mcp-tools  → 200  (McpToolsPage)
GET /api/mcp-tools  → 200  (ChatPage tool selector)
```

工具列表变化频率很低（管理员手动配置），频繁请求浪费带宽且影响页面加载速度。

## 根因

直接在组件中调用 API，没有缓存层：

```typescript
// ❌ 无缓存：每次挂载都请求
function McpToolsPage() {
  const [tools, setTools] = useState([])

  useEffect(() => {
    mcpToolsApi.list().then(setTools)
  }, [])

  return <ToolList tools={tools} />
}
```

问题：
1. **每个页面独立请求** — 没有全局状态共享
2. **短时间内重复请求** — 用户在页面间跳转时触发多次
3. **无法控制刷新频率** — 即使数据未变化也重新获取

## 解决方案

### Zustand Store + TTL 缓存

```typescript
// src/stores/mcpToolsStore.ts
import { create } from 'zustand'
import { mcpToolsApi, type McpTool } from '@/services/api'

const CACHE_TTL = 10 * 60 * 1000 // 10 分钟

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

    // 有缓存且未过期且非强制 → 跳过
    if (tools.length && lastFetchTime && !force) {
      if (Date.now() - lastFetchTime < CACHE_TTL) {
        return  // 缓存命中，直接返回
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

### 组件中使用

```typescript
// ✅ 使用 store 缓存
function McpToolsPage() {
  const { tools, loading, fetchTools } = useMcpToolsStore()

  useEffect(() => {
    fetchTools()  // 自动检查缓存
  }, [fetchTools])

  if (loading) return <Spinner />
  return <ToolList tools={tools} />
}

// 强制刷新
function RefreshButton() {
  const { fetchTools } = useMcpToolsStore()
  return <button onClick={() => fetchTools(true)}>刷新</button>
}
```

## 核心逻辑解析

```typescript
// 缓存检查逻辑
if (tools.length && lastFetchTime && !force) {
  if (Date.now() - lastFetchTime < CACHE_TTL) {
    return  // 缓存有效，跳过请求
  }
}
```

| 条件 | 说明 |
|------|------|
| `tools.length` | 已有数据（空数组不算有效缓存） |
| `lastFetchTime` | 记录了上次请求时间 |
| `!force` | 非强制刷新 |
| `Date.now() - lastFetchTime < CACHE_TTL` | 未超过过期时间 |

## 适用场景

| 场景 | 是否适合 | 原因 |
|------|----------|------|
| 工具列表、配置字典 | ✅ 适合 | 变化频率低，多页面共享 |
| 用户权限、角色 | ✅ 适合 | 会话内基本不变 |
| 实时数据（消息、通知） | ❌ 不适合 | 需要最新状态 |
| 分页列表 | ❌ 不适合 | 数据量大，缓存策略复杂 |

## 扩展：更精细的缓存控制

```typescript
interface CacheOptions {
  ttl: number           // 过期时间
  staleWhileRevalidate: boolean  // 过期后先返回旧数据再更新
}

// 过期后后台刷新，先返回缓存数据
if (tools.length && lastFetchTime) {
  const age = Date.now() - lastFetchTime
  if (age < CACHE_TTL) {
    return  // 缓存新鲜
  }
  if (options.staleWhileRevalidate && age < CACHE_TTL * 2) {
    // 缓存过期但可接受，后台刷新
    mcpToolsApi.list().then(data => set({ tools: data, lastFetchTime: Date.now() }))
    return
  }
}
```

## 关键原则

1. **缓存时间要合理** — 根据数据变化频率设置 TTL
2. **提供强制刷新入口** — 用户可手动刷新最新数据
3. **首次加载要有 loading 状态** — 空数据时不应跳过请求

---
**对类似需求感兴趣？[联系合作](/about)**
