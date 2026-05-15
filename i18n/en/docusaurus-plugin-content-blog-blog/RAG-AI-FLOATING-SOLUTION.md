---
title: RAG Knowledge Base and AI Floating Widget Solution
date: 2026-02-11
tags: [RAG, AI, Knowledge Base, enterprise-ai]
---

# RAG Knowledge Base and AI Floating Widget Solution

<!-- truncate -->

> Designed this RAG floating widget solution while building an intelligent consultation system for enterprise clients. Here's the complete implementation.

## Architecture

```
User → Docusaurus → Floating Widget → RAG API → Vector Database
                              ↑
                          sync-to-rag.js
                              ↑
                          docs/*.md
```

## RAG Sync

### Configuration

| Variable | Default |
|----------|---------|
| `RAG_URL` | `http://localhost:3003` |
| `RAG_COLLECTION` | `product_help` |
| `RAG_API_KEY` | `''` |

### Chunking Rules

```
Fixed 750 characters/chunk (~500 tokens)
Overlap 75 characters (~50 tokens)
Split by character count, ignoring heading boundaries
```

### Sync Commands

```bash
npm run sync-rag:dry  # Preview
npm run sync-rag      # Execute
```

### Frontmatter

```yaml
rag: true          # Sync | false to delete
rag_tags:          # Optional
  - tag1
  - tag2
```

### API

```javascript
// DELETE
DELETE /documents?collection={collection}&doc_id={docId}

// POST /index
{
  collection: string,
  documents: Array<{
    doc_id: string,      // {docId}_chunk_{index}
    doc_name: string,
    chunk_id: string,
    chunk_text: string,
    metadata: {
      title: string,
      tags: string[],
      url: string,
      section_title: string
    }
  }>
}
```

## AI Floating Widget

### Core Files

| File | Responsibility |
|------|----------------|
| `src/components/FloatingChat.jsx` | Component |
| `src/rag-api-config.js` | Configuration |
| `src/theme/Layout/index.js` | Mounting |

### State

```javascript
isOpen, messages, input, isLoading, showBadge
```

### Scenarios

```javascript
getPageType(pathname) → 'browser-plugin' | 'ai-analytics' | 'default'

WELCOME_MESSAGES[pageType]
QUICK_QUESTIONS[pageType]
```

### API Call

```javascript
POST RAG_API_URL
{
  collection: 'product_help',
  question: string
}
→ {
  answer: string,
  sources: [{source, title}],
  cached: boolean,
  similarity: number
}
```

### Responsive Design

| Condition | Width | Height |
|-----------|-------|--------|
| `<640px` | `calc(100vw - 32px)` | `60vh` |
| `≥640px` | `380px` | `520px` |

### Dark Mode

```javascript
useColorMode() → isDark
// #1F2937 / #374151 / #111827
```

## Workflow

### Development

```bash
vim docs/guide.md
git add docs/ && git commit && git push
# One-click sync from admin panel (replaces manual SSH sync)
```

### Deployment

```bash
git pull
npm run build
# Nginx static hosting, takes effect immediately
```

## Data Structures

### Document Chunk

```typescript
{
  doc_id: string,
  doc_name: string,
  chunk_id: string,
  chunk_text: string,
  metadata: { title, tags[], url, section_title }
}
```

### RAG Request/Response

```typescript
// Request
{ collection: string, question: string }

// Response
{
  answer: string,
  sources: [{ source: string, title: string }],
  collection: string,
  cached: boolean,
  similarity: number
}
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Sync failed | `curl http://localhost:3003/health` <br /> `echo $RAG_URL` <br /> frontmatter `rag: true` |
| Widget unresponsive | Browser CSP errors <br /> `RAG_API_URL` injection <br /> `curl https://rag.ccleeai.com/query` |
| Inaccurate answers | Documents synced <br /> Clear heading structure <br /> `rag_tags` contains keywords |

## Related

- [Floating Widget Data Flow](floating-chat-data-flow.md)
