---
title: Fix Hover Selector Penetration in Nested FSE Group Blocks
description: Generic card hover CSS selectors match inner nested groups in WordPress FSE, causing text to shift while the card border stays still. Fix with higher-specificity reset selectors.
date: 2026-03-28
tags: [WordPress, CSS, FSE]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does the hover effect only move inner text instead of the whole card in WordPress FSE?"
    a: "Generic hover selectors like .wp-block-columns .wp-block-column > .wp-block-group:hover match the inner text group, not the outer card container."
  - q: "How to make hover effects apply only to the outer card without affecting nested elements?"
    a: "Use a higher-specificity selector prefix (e.g., .wp-block-post-template) to reset transition and transform on inner groups to none."
  - q: "Why not just narrow down the generic hover selector scope?"
    a: "FSE Group blocks are nested across multiple patterns. Narrowing the selector breaks hover on other patterns that share the same structure. Resetting inner layers is more reliable."
---

Encountered this issue while developing a WordPress FSE Block Theme for a client: blog listing cards show text shifting on hover while the card border stays still. Here's the root cause and solution.

## TL;DR

Generic card hover selector `.wp-block-columns .wp-block-column > .wp-block-group:hover` matches the **inner nested** text group inside cards, causing text-only displacement. Fix: use `.wp-block-post-template` prefix to reset hover effects on inner groups.

## Symptom

Blog listing uses card-style layout -- outer bordered group wrapping an image + text group. On hover:
- Inner title and excerpt text shifts by `translateY(-4px)`
- Outer card border and shadow remain unchanged
- Looks like text "floats out" of the card

## Root Cause

FSE card patterns use nested HTML structure:

```html
<!-- Outer card group (has border) -->
<div class="wp-block-group has-border-color ...">
  <img ... />  <!-- Featured image -->

  <!-- Inner text group -->
  <div class="wp-block-group" style="padding:...">
    <h2>Post Title</h2>
    <p>Excerpt text...</p>
  </div>
</div>
```

The theme defines a generic hover effect:

```css
.wp-block-columns .wp-block-column > .wp-block-group:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
}
```

This selector is intended to lift the entire card. But in blog listing pages, the `post-template` block wraps cards inside `wp-block-columns`, so the selector also matches the **inner text group** (which is also `.wp-block-column > .wp-block-group`).

Since the inner group has no border or shadow, only text displacement is visible, while the outer card remains static.

## Solution

Two-step approach: **reset inner layer** + **add separate hover to outer layer**.

### 1. Reset hover on inner groups

Use `.wp-block-post-template` prefix for higher specificity, zeroing out all hover effects on inner groups:

```css
/* Reset hover for inner groups inside post template cards */
.wp-block-post-template .wp-block-columns .wp-block-column > .wp-block-group {
    transition: none;
}
.wp-block-post-template .wp-block-columns .wp-block-column > .wp-block-group:hover {
    transform: none;
    box-shadow: none;
}
```

### 2. Add dedicated hover to outer card

Outer cards have `.has-border-color` class -- use it for precise targeting:

```css
/* Blog card (outer bordered group) -- hover lift + shadow */
.wp-block-post-template .wp-block-group.has-border-color {
    transition:
        transform 0.3s ease-out,
        box-shadow 0.3s ease-out;
}
.wp-block-post-template .wp-block-group.has-border-color:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
}
```

### Why not narrow the generic selector?

The generic selector is shared across multiple patterns (features-grid, pricing, testimonial, etc.) where groups are single-level -- no nesting penetration issue. Narrowing the generic selector would break hover effects on those patterns.

Resetting inner layers is more reliable because:
- It doesn't affect other patterns using the generic hover
- It precisely targets the problematic nesting scenario
- Complete CSS-level isolation without any HTML/PHP changes

## Takeaway

Before adding hover effects in FSE Block Themes:
1. Inspect the actual HTML nesting structure of your patterns
2. Verify selectors only target the intended element (outer container), not nested groups
3. When multiple patterns share a selector, prefer "reset inner" over "restrict outer"

---
**Interested in similar solutions? [Get in touch](/about)**
