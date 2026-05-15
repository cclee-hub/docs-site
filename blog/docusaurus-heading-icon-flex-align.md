---
title: 用 Flex 布局对齐 Docusaurus 文档页标题图标
description: Docusaurus 标题内联 SVG 图标与文字垂直居中对齐，使用 flex 布局和 .theme-doc-markdown 选择器实现 docs/blog 页面隔离
date: 2026-03-16
tags: [docs-site, Docusaurus, CSS, flex]
authors: [cclee]
---

## TL;DR

Docusaurus 文档页标题中的 SVG 图标与文字对齐，推荐使用 `display: flex` + `align-items: center` + `gap`，配合 `.theme-doc-markdown` 选择器精准隔离 docs 页面，不影响 blog。


<!-- truncate -->
## 问题现象

在 Docusaurus 文档中使用内联 SVG 图标作为标题装饰：

```markdown
## 🚀 快速开始
```

或通过 MDX 组件：

```mdx
## <RocketIcon /> 快速开始
```

默认情况下，SVG 图标与文字基线对齐，视觉效果偏上：

```
🚀 快速开始     ← 图标偏上，与文字顶部对齐
```

传统解法是 `vertical-align: middle` + `margin-right`，但存在以下问题：

1. 图标大小变化时需要调整 margin
2. 行高变化时对齐可能失效
3. 多行标题时对齐表现不一致

## 根因

SVG 默认是 `inline` 元素，参与行内布局。`vertical-align: middle` 基于当前行的 x-height 计算，受字体、行高、图标尺寸等多因素影响，难以精确控制。

更深层的问题是选择器作用范围。Docusaurus 的 `.markdown` 类同时作用于 docs 和 blog 页面，直接修改会影响全局。

## 解决方案

### 1. 使用 Flex 布局

Flex 的 `align-items: center` 基于容器高度计算，与字体无关，对齐更稳定：

```css
/* 文档页标题图标对齐 */
.theme-doc-markdown h1,
.theme-doc-markdown h2,
.theme-doc-markdown h3,
.theme-doc-markdown h4 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
```

### 2. 重置 SVG 原有样式

覆盖全局 `.markdown` 的 `margin-right` 和 `vertical-align`：

```css
.theme-doc-markdown h1 svg,
.theme-doc-markdown h2 svg,
.theme-doc-markdown h3 svg,
.theme-doc-markdown h4 svg {
  margin-right: 0;
  vertical-align: baseline;
  flex-shrink: 0;  /* 防止图标被压缩 */
}
```

### 3. 选择器隔离

Docusaurus 提供了页面特定的类名：

| 选择器 | 作用范围 |
|--------|----------|
| `.markdown` | docs + blog 全局 |
| `.theme-doc-markdown` | 仅 docs 文档页 |
| `article` | 仅 blog 文章页 |

使用 `.theme-doc-markdown` 精准修改文档页，blog 页保持原有样式。

### 完整代码

```css
/* ========== Docs 文档页样式 ========== */

/* 文档页标题图标对齐 */
.theme-doc-markdown h1,
.theme-doc-markdown h2,
.theme-doc-markdown h3,
.theme-doc-markdown h4 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.theme-doc-markdown h1 svg,
.theme-doc-markdown h2 svg,
.theme-doc-markdown h3 svg,
.theme-doc-markdown h4 svg {
  margin-right: 0;
  vertical-align: baseline;
  flex-shrink: 0;
}
```

## FAQ

### Q: Docusaurus 中 .markdown 和 .theme-doc-markdown 有什么区别？

`.markdown` 是 Docusaurus 全局内容样式类，同时应用于 docs 文档页和 blog 博客页。`.theme-doc-markdown` 是文档页专用容器类，仅作用于 `/docs/*` 路径下的页面，适合做文档页专属样式。

### Q: 为什么用 gap 而不是 margin-right？

`gap` 是 Flexbox/Grid 的间距属性，与 `align-items: center` 配合更自然，不依赖元素自身的 margin。当图标隐藏或不存在时，`gap` 不会产生多余空白，而 `margin-right` 会。

### Q: flex-shrink: 0 有什么作用？

防止 flex 子项在容器空间不足时被压缩。SVG 图标通常有固定尺寸，压缩会导致变形模糊。设置 `flex-shrink: 0` 确保图标保持原始大小。
