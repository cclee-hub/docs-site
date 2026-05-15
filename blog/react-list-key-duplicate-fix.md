---
title: 修复 React 列表 key 重复导致的 DOM 报错
description: 使用 Date.now() 作为 React 列表 key 时，毫秒级时间戳可能重复，导致 Failed to execute 'removeChild' 错误
date: 2026-03-19
tags: [React, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么不能用 Date.now() 作为 React 列表的 key？"
    a: "Date.now() 返回毫秒级时间戳，同一毫秒内的多次调用返回相同值，导致 key 重复"
  - q: "React key 重复会有什么后果？"
    a: "会导致 reconciliation 失败，出现 Failed to execute 'removeChild' on 'Node' 等 DOM 操作错误"
---

在开发 AI Agent 对话界面时遇到此问题，记录根因与解法。

## TL;DR

`Date.now()` 毫秒级时间戳可能在同一毫秒内重复，作为 React 列表 key 会导致 DOM 报错。解决方案是添加随机后缀，或使用 `crypto.randomUUID()`。


<!-- truncate -->
## 问题现象

聊天界面快速发送消息时，控制台报错：

```
Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
```

消息列表渲染异常，部分消息消失或错位。

## 根因

原代码使用 `Date.now()` 生成消息 ID：

```typescript
// ❌ 问题代码
const id = `msg-${Date.now()}-user`
```

`Date.now()` 返回毫秒级时间戳（如 `1742345678001`）。问题在于：

1. **同一毫秒内多次调用返回相同值** — JavaScript 事件循环中，同步代码执行速度远快于 1ms
2. **快速操作触发多次调用** — 用户快速发送消息、SSE 流式响应同时创建多条消息
3. **key 重复破坏 reconciliation** — React 认为 key 相同的是同一元素，导致 DOM 操作错乱

示例：用户在 1ms 内发送两条消息，两条消息的 key 都是 `msg-1742345678001-user`。

## 解决方案

### 方案一：添加随机后缀（推荐）

```typescript
// ✅ 修复后
const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-user`
```

- `Math.random().toString(36)` 生成 36 进制随机字符串
- `.slice(2, 9)` 截取 7 位，提供足够的唯一性
- 时间戳 + 随机串的组合，碰撞概率极低

### 方案二：使用 crypto.randomUUID()

```typescript
// ✅ 更严格方案（需要现代浏览器或 Node 15.6+）
const id = crypto.randomUUID()  // 如 "550e8400-e29b-41d4-a716-446655440000"
```

- 密码学安全的唯一标识符
- 无碰撞保证
- 兼容性：Chrome 92+、Firefox 95+、Safari 15.4+

### 方案三：计数器 + 时间戳

```typescript
let counter = 0
const id = `msg-${Date.now()}-${counter++}-user`
```

- 简单可靠
- 需要维护计数器状态

## 完整示例

```typescript
// Zustand store 中的消息创建
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],

  addUserMessage: (content: string) => {
    // ✅ 时间戳 + 随机后缀
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

## 关键原则

1. **key 必须唯一且稳定** — 同一元素在兄弟节点间 key 不能重复
2. **避免使用 index 作为 key** — 列表顺序变化时会出问题
3. **避免仅用时间戳** — 毫秒级不够精确，微秒级（`performance.now()`）也不可靠

---
**对类似需求感兴趣？[联系合作](/about)**
