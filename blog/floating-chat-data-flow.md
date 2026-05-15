---
title: 浮窗 AI 咨询数据流转
date: 2026-02-11
tags: [浮窗, 数据流, 架构]
authors: [cclee]
---

# 浮窗 AI 咨询数据流转

<!-- truncate -->

## 前端组件

| 文件 | 职责 |
|------|------|
| `src/components/FloatingChat.jsx` | 浮窗组件 |
| `src/rag-api-config.js` | API 配置 |
| `src/theme/Layout/index.js` | 全局挂载 |

## 状态定义

```javascript
// FloatingChat.jsx:63-68
isOpen          // boolean - 浮窗开关
messages        // Array<{role, content}> - 消息列表
input           // string - 用户输入
isLoading       // boolean - 加载状态
showBadge       // boolean - 首次访问红点
```

## 场景化配置

```javascript
// FloatingChat.jsx:31-34
getPageType(pathname)
  '/browser-plugin' → browser-plugin
  '/ai-analytics' → ai-analytics
  default → default
```

```javascript
// FloatingChat.jsx:8-28
WELCOME_MESSAGES[pageType]  // 场景化欢迎语
QUICK_QUESTIONS[pageType]   // 快捷问题按钮
```

## API 调用

```javascript
// FloatingChat.jsx:83-90
fetch(RAG_API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    collection: 'product_help',
    question: textToSend
  })
})
```

**端点**: `https://rag.ccleeai.com/query` (可通过 `RAG_API_URL` 环境变量覆盖)

## 请求数据

```json
{
  "collection": "product_help",
  "question": "用户问题"
}
```

## 响应数据

```json
{
  "answer": "回答内容",
  "sources": [{"source": "doc_id", "title": "标题"}],
  "collection": "product_help",
  "cached": false,
  "similarity": 0.85
}
```

## 数据流转

```
用户点击浮窗按钮
  ↓
setIsOpen(true)
  ↓
用户输入 / 点击快捷问题
  ↓
handleSend(questionText)
  ↓
setMessages([...prev, userMessage])
setIsLoading(true)
  ↓
fetch(RAG_API_URL, ...)
  ↓
setMessages([...prev, assistantMessage])
setIsLoading(false)
  ↓
UI 渲染新消息
```

## 本地存储

```javascript
// FloatingChat.jsx:48-53
localStorage.getItem('floating-chat-visited')  // 首次访问检测
localStorage.setItem('floating-chat-visited', 'true')
```

## 响应式设计

| 条件 | 样式值 |
|------|--------|
| 移动端 | `window.innerWidth < 640` |
| 浮窗宽度 (移动) | `calc(100vw - 32px)` |
| 浮窗宽度 (桌面) | `380px` |
| 浮窗高度 (移动) | `60vh` |
| 浮窗高度 (桌面) | `520px` |

## 暗色模式

```javascript
// FloatingChat.jsx:38-39
const { colorMode } = useColorMode()
const isDark = colorMode === 'dark'
```

暗色模式下使用 `#1F2937` / `#374151` / `#111827` 色系。

## 交互细节

| 交互 | 行为 |
|------|------|
| Enter 键 | 发送消息 |
| 点击快捷问题 | 直接触发 `handleSend(question)` |
| 按钮禁用条件 | `isLoading \|\| !input.trim()` |
| 首次访问红点 | 显示 5 秒后消失 |
| 脉冲动画 | CSS `@keyframes pulse` |

## 错误处理

```javascript
// FloatingChat.jsx:94-95
catch
  → content: '抱歉，服务暂时不可用，请稍后再试。'
```
