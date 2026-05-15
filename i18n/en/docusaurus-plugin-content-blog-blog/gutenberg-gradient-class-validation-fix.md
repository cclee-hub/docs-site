---
title: Fix Gutenberg Gradient Class Naming Change Causing Block Validation Failure
description: Resolve "Block contains unexpected or invalid content" error in WordPress Site Editor caused by Gutenberg's gradient CSS class naming convention change
date: 2026-03-26
tags: [WordPress, Gutenberg, FSE]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why do my Patterns show Block validation failed in Site Editor?"
    a: "After Gutenberg upgrade, gradient CSS class naming changed from `has-{slug}-gradient` to `has-{slug}-gradient-background`. Legacy code doesn't match the new rule."
  - q: "How to batch fix all affected Pattern files?"
    a: "Use find + sed to batch replace gradient class names in pattern files, changing old has-X-gradient to has-X-gradient-background"
---

Encountered this issue while developing a WordPress FSE theme for a client. Here's the root cause and solution.

## TL;DR

After a Gutenberg upgrade, the gradient CSS class naming convention changed from `has-{slug}-gradient` to `has-{slug}-gradient-background`. Hand-written Pattern HTML with old classes doesn't match Gutenberg's validation logic, causing Site Editor errors. The fix is to batch replace class names.


<!-- truncate -->
## Problem

All legacy Patterns show an error in Site Editor:

```
Block contains unexpected or invalid content
```

- New Patterns work fine
- Frontend renders correctly
- Clicking "Attempt Recovery" restores display

## Root Cause

Check DevTools Console for `Block validation failed` logs, compare Expected vs Actual:

**Expected (Gutenberg generated)**:
```html
<div class="wp-block-group has-accent-gradient-background has-background">
```

**Actual (hand-written in Pattern)**:
```html
<div class="wp-block-group has-accent-gradient has-background">
```

After Gutenberg upgrade, gradient class naming changed:

| Old Naming | New Naming |
|------------|------------|
| `has-{slug}-gradient` | `has-{slug}-gradient-background` |

During Block validation, Gutenberg recalculates expected HTML based on JSON attributes in block comments (e.g., `"gradient":"accent-gradient"`) and compares with actual HTML. Class mismatch triggers validation failure.

## Solution

### 1. Identify Affected Files

```bash
# Find files using old class naming
grep -r "has-[a-z0-9-]*-gradient " patterns/ --include="*.php"
```

### 2. Batch Replace

```bash
# macOS/Linux compatible
sed -i '' 's/has-\([a-z0-9-]*\)-gradient /has-\1-gradient-background /g' patterns/*.php

# Linux (GNU sed)
sed -i 's/has-\([a-z0-9-]*\)-gradient /has-\1-gradient-background /g' patterns/*.php
```

**Notes**:
- Only replace class attributes in HTML tags
- Block comment declarations like `"gradient":"accent-gradient"` don't need changes
- Regex ends with a space to avoid matching `has-accent-gradient-background`

### 3. Verify Fix

1. Clear WordPress cache: `wp cache flush`
2. Refresh Site Editor, confirm errors are gone
3. Spot-check a few Patterns, verify frontend and editor display correctly

## Prevention

1. **Prefer block comment attributes**: Set styles via JSON attributes (e.g., `"gradient":"accent-gradient"`) to let Gutenberg auto-generate classes, avoid hand-writing
2. **Watch Gutenberg changelog**: Check Breaking Changes before upgrading
3. **Test in development first**: After upgrade, test all Patterns in dev environment before deploying

---
**Interested in similar solutions? [Contact us](/about)**
