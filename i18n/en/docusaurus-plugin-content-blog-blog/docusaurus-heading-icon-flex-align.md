---
title: Align Heading Icons in Docusaurus Docs with Flexbox
description: Use flex layout with align-items center and gap to vertically align inline SVG icons with text in Docusaurus headings, scoped to docs pages only via .theme-doc-markdown selector
date: 2026-03-16
tags: [docs-site, Docusaurus, CSS, flex]
---

## TL;DR

To align SVG icons with text in Docusaurus document headings, use `display: flex` + `align-items: center` + `gap`, combined with the `.theme-doc-markdown` selector to target docs pages only without affecting blog.


<!-- truncate -->
## Problem

When using inline SVG icons as heading decorations in Docusaurus docs:

```markdown
## 🚀 Quick Start
```

Or via MDX components:

```mdx
## <RocketIcon /> Quick Start
```

By default, SVG icons align to the text baseline, appearing visually offset upward:

```
🚀 Quick Start     ← Icon sits high, aligned to top of text
```

The traditional approach uses `vertical-align: middle` + `margin-right`, but has issues:

1. Margin needs adjustment when icon size changes
2. Alignment may break with different line-heights
3. Multi-line headings have inconsistent alignment

## Root Cause

SVG elements are `inline` by default, participating in inline layout. `vertical-align: middle` is calculated based on the x-height of the current line, affected by font, line-height, and icon size—making precise control difficult.

A deeper issue is selector scope. Docusaurus applies the `.markdown` class to both docs and blog pages, so direct modifications affect everything globally.

## Solution

### 1. Use Flexbox Layout

Flexbox `align-items: center` calculates based on container height, independent of font metrics, providing more stable alignment:

```css
/* Docs page heading icon alignment */
.theme-doc-markdown h1,
.theme-doc-markdown h2,
.theme-doc-markdown h3,
.theme-doc-markdown h4 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
```

### 2. Reset SVG Original Styles

Override global `.markdown` styles for `margin-right` and `vertical-align`:

```css
.theme-doc-markdown h1 svg,
.theme-doc-markdown h2 svg,
.theme-doc-markdown h3 svg,
.theme-doc-markdown h4 svg {
  margin-right: 0;
  vertical-align: baseline;
  flex-shrink: 0;  /* Prevent icon compression */
}
```

### 3. Selector Scoping

Docusaurus provides page-specific class names:

| Selector | Scope |
|----------|-------|
| `.markdown` | docs + blog globally |
| `.theme-doc-markdown` | docs pages only |
| `article` | blog post pages only |

Use `.theme-doc-markdown` to precisely target docs pages, leaving blog styling untouched.

### Complete Code

```css
/* ========== Docs Page Styles ========== */

/* Docs heading icon alignment */
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

### Q: What's the difference between .markdown and .theme-doc-markdown in Docusaurus?

`.markdown` is Docusaurus's global content styling class, applied to both docs and blog pages. `.theme-doc-markdown` is a docs-page-specific container class that only affects pages under `/docs/*` paths, ideal for docs-only styling.

### Q: Why use gap instead of margin-right?

`gap` is a Flexbox/Grid spacing property that works naturally with `align-items: center` without depending on element margins. When an icon is hidden or absent, `gap` produces no extra whitespace, whereas `margin-right` would.

### Q: What does flex-shrink: 0 do?

It prevents flex children from shrinking when container space is insufficient. SVG icons typically have fixed dimensions—shrinking would cause distortion and blurriness. Setting `flex-shrink: 0` ensures icons maintain their original size.
