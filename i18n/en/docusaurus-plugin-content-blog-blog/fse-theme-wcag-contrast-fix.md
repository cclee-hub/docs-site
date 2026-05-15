---
title: Fix WordPress FSE Theme Footer Text Visibility - WCAG Contrast Issue
description: FSE theme's contrast color token caused Footer contrast ratio of only 1.05:1. Introduced surface semantic color and resolved global styles override, achieving 15.8:1 (AAA grade).
date: 2026-03-22
tags: [WordPress, FSE, WCAG, theme.json]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is my WordPress FSE theme Footer text suddenly invisible?"
    a: "The contrast color token has conflicting semantics across Style Variations. In light themes, contrast is light gray, creating less than 2:1 ratio against white base."
  - q: "Why don't new theme.json colors take effect after adding them?"
    a: "The wp_global_styles table has higher priority than theme.json and completely overrides the color palette. Delete global styles or re-save in Site Editor."
---

While developing a WordPress FSE enterprise theme for a client, I discovered the Footer block text was nearly invisible across multiple Style Variations. This post documents the complete fix process - from WCAG contrast diagnosis to introducing semantic colors and handling global styles override.

## TL;DR

**Problem**: FSE theme's `contrast` color token has conflicting semantics. In light themes, contrast ≈ light gray ≈ base (white), resulting in Footer contrast ratio of only 1.05:1.

**Solution**:
1. Introduce `surface` semantic color for dark block backgrounds
2. Delete override styles in `wp_global_styles`
3. Add surface definition to all Style Variations

**Result**: Contrast ratio improved from 1.05:1 to 15.8:1 (WCAG AAA grade).


<!-- truncate -->
## Problem

Footer block uses `backgroundColor="contrast"` + `textColor="base"`:

```html
<!-- wp:group {"backgroundColor":"contrast","textColor":"base"} -->
<div class="has-base-color has-contrast-background-color">
  Footer content
</div>
```

Under default theme, Footer text is nearly invisible:

| Combination | Foreground | Background | Contrast | WCAG |
|-------------|------------|------------|----------|------|
| Footer text | `#ffffff` (base) | `#f8fafc` (contrast) | **1.05:1** | ❌ Fail |
| Footer link | `#f59e0b` (accent) | `#f8fafc` (contrast) | **1.78:1** | ❌ Fail |

WCAG AA standard requires ≥ 4.5:1 for normal text. Current state is far below standard.

## Root Cause Analysis

### 1. Conflicting contrast Semantics

`contrast` was designed as "background color that contrasts with base", but semantics conflict across themes:

| Variation | base | contrast | Expected vs Actual |
|-----------|------|----------|-------------------|
| Default (light) | `#ffffff` white | `#f8fafc` light gray | Expected dark, actual light |
| Tech (dark) | `#0f0f1a` deep black | `#1e1e2e` deep purple | Expected light, actual dark |

Footer Pattern assumes `contrast` is a dark background, but in 5/6 Style Variations it's light.

### 2. Missing Semantic Color for Dark Blocks

Original design system only had one "contrast" color, without distinguishing:
- Light contrast blocks (CTA Banner, etc.)
- Dark contrast blocks (Footer, dark Hero, etc.)

## Solution

### Step 1: Introduce surface Semantic Color

Add `surface` token in `theme.json` for dark block backgrounds:

```json
{
  "slug": "surface",
  "color": "#0f172a",
  "name": "Surface"
}
```

### Step 2: Update All Style Variations

Each variation defines its own surface color (usually equals primary):

```json
// styles/commerce.json
{ "slug": "surface", "color": "#1f2937", "name": "Surface" }

// styles/nature.json
{ "slug": "surface", "color": "#14532d", "name": "Surface" }

// styles/tech.json (dark theme)
{ "slug": "surface", "color": "#1e1e2e", "name": "Surface" }
```

### Step 3: Update Footer Template

```html
<!-- wp:group {"backgroundColor":"surface","textColor":"base"} -->
<div class="has-base-color has-surface-background-color">
  Footer content
</div>
```

### Step 4: Delete Global Styles Override

Colors still not working after modifying theme.json? Check global styles:

```bash
# Check if global styles exist
docker exec wp_cli wp post list --post_type=wp_global_styles --fields=ID,post_title --allow-root

# Delete global styles
docker exec wp_cli wp post delete <ID> --force --allow-root
docker exec wp_cli wp cache flush --allow-root
```

**Reason**: `color.palette` in `wp_global_styles` **completely overrides** (not merges) theme.json's palette.

## Results

| Variation | surface + base Contrast | WCAG Grade |
|-----------|------------------------|------------|
| Default | **15.8:1** | ✅ AAA |
| Commerce | **13.1:1** | ✅ AAA |
| Industrial | **12.6:1** | ✅ AAA |
| Professional | **9.9:1** | ✅ AAA |
| Nature | **10.8:1** | ✅ AAA |
| Tech | **11.5:1** | ✅ AAA |

## Color Semantics Summary

| Token | Purpose |
|-------|---------|
| `primary` | Brand color (Logo, primary button) |
| `secondary` | Secondary elements |
| `accent` | Call to action (CTA, links) |
| `base` | Page main background |
| `contrast` | Light contrast block background |
| `surface` | **Dark block background (Footer, dark CTA)** ← New |

---
**Interested in similar solutions? [Get in touch](/about)**
