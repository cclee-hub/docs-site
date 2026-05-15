---
title: Fix WordPress FSE Pattern Block Validation Errors - 5 Common Causes
description: "Getting 'Block contains unexpected or invalid content' in WordPress block editor? Learn the 5 root causes: undefined color slugs, duplicate JSON keys, Style Variation palette override, HTML attribute mismatch, and global styles conflict."
date: 2026-03-21
tags: [WordPress, FSE, Block Editor, Theme Development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does my Pattern show Block contains unexpected or invalid content?"
    a: "Block validation fails due to undefined color slugs, JSON format errors, incomplete Style Variation palettes, mismatched HTML attributes and block comments, or global styles override."
  - q: "How do Style Variations affect Pattern validation?"
    a: "Style Variation's color.palette completely overrides (not merges) the parent theme palette. Pattern color references fail validation if the color doesn't exist after switching styles."
  - q: "Why does hand-written Pattern HTML fail validation?"
    a: "WordPress save function has strict requirements for class order and style attribute format. Always copy block code from the editor, don't hand-write HTML."
  - q: "Why doesn't theme.json take effect after modification?"
    a: "Global styles saved by Site Editor are stored in wp_global_styles table with higher priority than theme.json. Delete the record and clear cache to apply theme.json changes."
  - q: "How to ensure Patterns validate under all Style Variations?"
    a: "Each Style Variation must include all color slugs used by Patterns, especially the neutral series (neutral-50 through neutral-900)."
---
Encountered frequent Block Pattern validation failures while developing a WordPress FSE theme for a client. This article summarizes 5 common causes and solutions.

## TL;DR

Block validation failures are usually caused by one of: **undefined color slugs**, **duplicate JSON keys**, **Style Variation palette override**, **HTML attribute mismatch with block comments**, or **global styles overriding theme.json**. Check each one systematically.


<!-- truncate -->
## Problem

Patterns show a red warning in the editor:

```
Block contains unexpected or invalid content
```

After attempting to recover the block, it may work temporarily, but the issue returns after refresh.

---

## Cause 1: Undefined Color Slug

### Root Cause

Pattern block attributes reference color slugs that don't exist in `theme.json`:

```html
<!-- Error: neutral-text doesn't exist -->
<!-- wp:paragraph {"textColor":"neutral-text"} -->
<p class="has-neutral-text-color">...</div>
```

### Solution

1. Open `theme.json` and check all colors defined in `settings.color.palette`
2. Replace invalid slugs in your Pattern with valid ones

```bash
# Batch replacement example
cd patterns/
sed -i 's/"neutral-text"/"neutral-500"/g' *.php
sed -i 's/has-neutral-text-color/has-neutral-500-color/g' *.php
```

**Valid slugs reference:** `primary`, `secondary`, `accent`, `base`, `contrast`, `neutral-50` through `neutral-900`

---

## Cause 2: Duplicate JSON Key

### Root Cause

Block comment JSON has duplicate keys at the same level (common when copy-pasting):

```json
// Error: two style keys
{"style":{"typography":{...}},"style":{"spacing":{...}}}
```

JSON specification doesn't allow duplicate keys; parser behavior is undefined.

### Solution

Merge into a single key:

```json
// Correct
{"style":{"typography":{...},"spacing":{...}}}
```

**Debug command:**
```bash
# Search for potentially duplicate keys
grep -n ',"style":{' patterns/*.php | head -20
```

---

## Cause 3: Style Variation Palette Override

### Root Cause

`color.palette` in `styles/*.json` **completely overrides** (doesn't merge) the parent theme palette.

When a Pattern references `neutral-500`, but the current Style Variation doesn't define it, validation fails.

### Solution

Each Style Variation must include the complete neutral series:

```json
// styles/ocean.json
{
  "version": 3,
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary", "color": "#0d9488", "name": "Primary" },
        { "slug": "secondary", "color": "#0f766e", "name": "Secondary" },
        { "slug": "accent", "color": "#f59e0b", "name": "Accent" },
        { "slug": "base", "color": "#f8fafc", "name": "Base" },
        { "slug": "contrast", "color": "#0f172a", "name": "Contrast" },
        { "slug": "neutral-50", "color": "#fafafa", "name": "Neutral 50" },
        { "slug": "neutral-100", "color": "#f5f5f5", "name": "Neutral 100" },
        { "slug": "neutral-200", "color": "#e5e5e5", "name": "Neutral 200" },
        { "slug": "neutral-300", "color": "#d4d4d4", "name": "Neutral 300" },
        { "slug": "neutral-400", "color": "#a3a3a3", "name": "Neutral 400" },
        { "slug": "neutral-500", "color": "#737373", "name": "Neutral 500" },
        { "slug": "neutral-600", "color": "#525252", "name": "Neutral 600" },
        { "slug": "neutral-700", "color": "#404040", "name": "Neutral 700" },
        { "slug": "neutral-800", "color": "#262626", "name": "Neutral 800" },
        { "slug": "neutral-900", "color": "#171717", "name": "Neutral 900" }
      ]
    }
  }
}
```

**Key point:** Neutral series color values must match `theme.json` exactly; only change brand colors.

---

## Cause 4: HTML Attribute Mismatch with Block Comments

### Root Cause

This is the most subtle issue. WordPress `save` function has strict requirements for generated HTML.

#### Issue 4.1: Incorrect class Order

WordPress generates classes in a fixed order:

```
has-border-color has-{slug}-border-color has-{slug}-background-color has-background
```

Wrong order in hand-written HTML causes validation failure.

#### Issue 4.2: Background Color Attribute Mixing

Background color must use `backgroundColor` attribute, not `style.color.background`:

```html
<!-- Error: mixing causes invalid CSS generation -->
<!-- wp:group {"style":{"color":{"background":"#f5f5f5"}}} -->

<!-- Correct -->
<!-- wp:group {"backgroundColor":"neutral-100"} -->
```

#### Issue 4.3: Border Style Attribute Order

`border-width` must come before `border-style`:

```html
<!-- Correct -->
<div style="border-width:1px;border-style:solid;border-radius:8px;">
```

### Solution

**Best practice: Copy block code from the editor, don't hand-write HTML class and style.**

1. Configure the block in the editor
2. Switch to Code Editor view
3. Copy the complete block comment + HTML
4. Paste into Pattern file

**Correct example:**
```html
<!-- wp:group {"backgroundColor":"accent","borderColor":"neutral-200","style":{"border":{"radius":"8px","width":"1px","style":"solid"}}} -->
<div class="wp-block-group has-border-color has-neutral-200-border-color has-accent-background-color has-background" style="border-width:1px;border-style:solid;border-radius:8px;">
  <!-- content -->
</div>
<!-- /wp:group -->
```

---

## Cause 5: Global Styles Override theme.json

### Root Cause

Custom styles saved by Site Editor are stored in `wp_global_styles` CPT with **higher priority** than `theme.json`.

After modifying `theme.json`, the frontend still shows old values because global styles override theme defaults.

### Debug

```bash
# Check if global styles exist
wp post list --post_type=wp_global_styles --fields=ID,post_title --allow-root

# View global styles content
wp post get <ID> --fields=post_content --allow-root
```

### Solution

```bash
# Delete global styles
wp post delete <ID> --force --allow-root

# Clear cache
wp cache flush --allow-root
```

**Prevention:** Avoid using Site Editor for custom styles during development. Manage all configuration through `theme.json`.

---

## Debug Flow Summary

```
Block validation failed
    │
    ├─→ Check if color slugs are defined in theme.json
    │
    ├─→ Check JSON for duplicate keys
    │
    ├─→ Check all Style Variations have complete palettes
    │
    ├─→ Check HTML class/style matches block comments
    │
    └─→ Check if wp_global_styles overrides theme.json
```

---
**Interested in similar projects? [Get in touch](/about)**
