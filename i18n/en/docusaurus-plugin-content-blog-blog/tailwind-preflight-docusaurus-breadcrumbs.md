---
title: Fix Tailwind Preflight Resetting Docusaurus Breadcrumbs Styles
description: Tailwind Preflight resets list-style, margin, padding on ul elements, breaking Docusaurus breadcrumbs - fix with CSS override
date: 2026-03-16
tags: [docs-site, Docusaurus, Tailwind, CSS]
---

## TL;DR

After adding Tailwind CSS to a Docusaurus project, Preflight's CSS Reset strips `<ul>` elements of their `list-style`, `margin`, and `padding`, breaking the breadcrumbs navigation. Fix by adding explicit override styles in `custom.css`.


<!-- truncate -->
## Problem

After integrating Tailwind CSS into Docusaurus, the breadcrumbs navigation on doc pages displays incorrectly:

- List styles are lost (`list-style` reset to `none`)
- Spacing disappears (`margin`, `padding` reset to 0)
- Layout may break (`display` may be affected)

Checking browser DevTools, the `.breadcrumbs` computed styles show these properties are reset by Preflight:

```css
/* Tailwind Preflight reset */
ul, ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
```

## Root Cause

**Tailwind Preflight** is a CSS Reset based on modern-normalize, injected during the `@tailwind base` stage. It provides a consistent cross-browser baseline.

The problem: Docusaurus's `.breadcrumbs` component uses a `<ul>` element, relying on browser-default flex layout and spacing. Preflight's reset rules have higher specificity and override Docusaurus's default styles.

Since Preflight is injected globally, any third-party component using `<ul>`/`<ol>` may be affected.

## Solution

Add explicit override styles in `src/css/custom.css`, using `!important` for specificity:

```css
/* ========== Breadcrumbs ========== */
.theme-doc-breadcrumbs {
  margin-bottom: 1.5rem;
}

.breadcrumbs {
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.breadcrumbs__item {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
}
```

**Key points**:

1. `.breadcrumbs` uses `display: flex !important` to ensure horizontal layout
2. `list-style: none` is expected behavior (breadcrumbs don't need bullets)
3. `.breadcrumbs__item` adds `gap: 0.5rem` for element spacing

## FAQ

### Q: Why is !important needed?

Tailwind Preflight is injected during `@tailwind base`, and its selector specificity may match Docusaurus default styles. Using `!important` ensures custom styles take effect, avoiding specificity wars.

### Q: What other components might be affected?

Any component using `<ul>`/`<ol>` may be affected, such as:
- Navigation menus
- Pagination components
- Custom lists

How to check: In browser DevTools, search for `list-style: none` sources and confirm if it comes from Preflight.

### Q: Can I disable Preflight?

Yes, but not recommended. In `tailwind.config.js`:

```js
module.exports = {
  corePlugins: {
    preflight: false,
  },
}
```

Disabling it means you'll need to handle cross-browser consistency yourself, which may cause more issues.
