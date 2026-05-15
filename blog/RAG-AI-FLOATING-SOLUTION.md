---
title: RAG 知识库与 AI 浮窗方案
date: 2026-02-11
tags: [RAG, AI, 知识库, enterprise-ai]
authors: [cclee]
---

# RAG 知识库与 AI 浮窗方案

<!-- truncate -->

> 在为企业客户构建智能咨询系统时设计的 RAG 浮窗方案，以下是完整实现。

## 架构

```
用户 → Docusaurus → 浮窗组件 → RAG API → 向量数据库
                            ↑
                        sync-to-rag.js
                            ↑
                        docs/*.md
```

## RAG 同步

### 配置

| 变量 | 默认值 |
|------|--------|
| `RAG_URL` | `http://localhost:3003` |
| `RAG_COLLECTION` | `product_help` |
| `RAG_API_KEY` | `''` |

### 分块规则

```
固定 750 字/块 (约 500 token)
重叠 75 字 (约 50 token)
按字数切分，不考虑标题边界
```

### 同步命令

```bash
npm run sync-rag:dry  # 预览
npm run sync-rag      # 执行
```

### Frontmatter

```yaml
rag: true          # 同步 | false 删除
rag_tags:          # 可选
  - 标签1
  - 标签2
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

## AI 浮窗

### 核心

| 文件 | 职责 |
|------|------|
| `src/components/FloatingChat.jsx` | 组件 |
| `src/rag-api-config.js` | 配置 |
| `src/theme/Layout/index.js` | 挂载 |

### 状态

```javascript
isOpen, messages, input, isLoading, showBadge
```

### 场景

```javascript
getPageType(pathname) → 'browser-plugin' | 'ai-analytics' | 'default'

WELCOME_MESSAGES[pageType]
QUICK_QUESTIONS[pageType]
```

### API 调用

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

### 响应式

| 条件 | 宽度 | 高度 |
|------|------|------|
| `<640px` | `calc(100vw - 32px)` | `60vh` |
| `≥640px` | `380px` | `520px` |

### 暗色

```javascript
useColorMode() → isDark
// #1F2937 / #374151 / #111827
```

## 工作流

### 开发

```bash
vim docs/guide.md
git add docs/ && git commit && git push
# 管理后台一键同步（替代 SSH 手动同步）
```

### 部署

```bash
git pull
npm run build
# Nginx 静态托管，立即生效
```

## 数据结构

### 文档块

```typescript
{
  doc_id: string,
  doc_name: string,
  chunk_id: string,
  chunk_text: string,
  metadata: { title, tags[], url, section_title }
}
```

### RAG 请求/响应

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

## 故障排查

| 症状 | 检查 |
|------|------|
| 同步失败 | `curl http://localhost:3003/health` <br /> `echo $RAG_URL` <br /> frontmatter `rag: true` |
| 浮窗无响应 | 浏览器 CSP 错误 <br /> `RAG_API_URL` 注入 <br /> `curl https://rag.ccleeai.com/query` |
| 回答不准 | 文档已同步 <br /> 标题结构清晰 <br /> `rag_tags` 包含关键词 |

## 相关

- [浮窗数据流](floating-chat-data-flow.md)
