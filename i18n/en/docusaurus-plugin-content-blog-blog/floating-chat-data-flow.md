---
title: Floating Widget AI Consultation Data Flow
date: 2026-02-11
tags: [Widget, Data Flow, Architecture]
---

# Floating Widget AI Consultation Data Flow

<!-- truncate -->

## Frontend Components

| File | Responsibility |
|------|----------------|
| `src/components/FloatingChat.jsx` | Widget component |
| `src/rag-api-config.js` | API configuration |
| `src/theme/Layout/index.js` | Global mounting |

## State Definition

```javascript
// FloatingChat.jsx:63-68
isOpen          // boolean - Widget toggle
messages        // Array<{role, content}> - Message list
input           // string - User input
isLoading       // boolean - Loading state
showBadge       // boolean - First visit red dot
```

## Contextual Configuration

```javascript
// FloatingChat.jsx:31-34
getPageType(pathname)
  '/browser-plugin' → browser-plugin
  '/ai-analytics' → ai-analytics
  default → default
```

```javascript
// FloatingChat.jsx:8-28
WELCOME_MESSAGES[pageType]  // Contextual welcome message
QUICK_QUESTIONS[pageType]   // Quick question buttons
```

## API Call

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

**Endpoint**: `https://rag.ccleeai.com/query` (can be overridden via `RAG_API_URL` env variable)

## Request Data

```json
{
  "collection": "product_help",
  "question": "User question"
}
```

## Response Data

```json
{
  "answer": "Response content",
  "sources": [{"source": "doc_id", "title": "Title"}],
  "collection": "product_help",
  "cached": false,
  "similarity": 0.85
}
```

## Data Flow

```
User clicks widget button
  ↓
setIsOpen(true)
  ↓
User input / Click quick question
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
UI renders new message
```

## Local Storage

```javascript
// FloatingChat.jsx:48-53
localStorage.getItem('floating-chat-visited')  // First visit detection
localStorage.setItem('floating-chat-visited', 'true')
```

## Responsive Design

| Condition | Style Value |
|-----------|-------------|
| Mobile | `window.innerWidth < 640` |
| Widget Width (Mobile) | `calc(100vw - 32px)` |
| Widget Width (Desktop) | `380px` |
| Widget Height (Mobile) | `60vh` |
| Widget Height (Desktop) | `520px` |

## Dark Mode

```javascript
// FloatingChat.jsx:38-39
const { colorMode } = useColorMode()
const isDark = colorMode === 'dark'
```

Dark mode uses `#1F2937` / `#374151` / `#111827` color palette.

## Interaction Details

| Interaction | Behavior |
|-------------|----------|
| Enter key | Send message |
| Click quick question | Directly trigger `handleSend(question)` |
| Button disabled condition | `isLoading \|\| !input.trim()` |
| First visit red dot | Disappears after 5 seconds |
| Pulse animation | CSS `@keyframes pulse` |

## Error Handling

```javascript
// FloatingChat.jsx:94-95
catch
  → content: 'Sorry, service is temporarily unavailable. Please try again later.'
```
