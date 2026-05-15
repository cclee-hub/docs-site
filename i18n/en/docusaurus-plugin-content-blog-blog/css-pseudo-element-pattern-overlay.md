---
title: Fix CSS ::before Pseudo-element Decorative Patterns Covering Buttons
description: ::before pseudo-element background patterns missing opacity and z-index overlay child elements. Adding both properties fixes the issue.
date: 2026-03-28
tags: [CSS, WordPress]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why do CSS ::before pseudo-element background patterns cover buttons?"
    a: "::before with position:absolute + inset:0 covers the entire container. Without z-index, it renders above child elements in the default stacking order. Add z-index:-1 to push it behind child content."
  - q: "What properties are required for ::before decorative pattern overlays?"
    a: "You must set opacity (transparency), pointer-events:none (prevent click interception), and z-index:-1 (prevent covering children). All three are mandatory."
---

## TL;DR

When using `::before` pseudo-elements for container background decorations (dots/grid), you must set `opacity`, `pointer-events: none`, and `z-index: -1` together. Missing `opacity` causes 100% opaque patterns; missing `z-index` causes patterns to cover buttons and other child elements.


<!-- truncate -->
## Problem

An FSE theme's CTA banner section used a `::before` pseudo-element to render decorative dot patterns. The expected effect was a subtle background texture, but the actual result was fully opaque dots covering the button surface:

```css
/* Broken code — pattern is fully opaque and covers children */
.has-dots-pattern::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
    /* Missing opacity — pattern renders at 100% opacity */
    /* Missing z-index — pattern overlays child content */
}
```

Dense white dots appeared on button surfaces, and obvious grid lines covered the gradient background of the CTA section.

## Root Cause

Three critical properties are required for `::before` decorative patterns. Missing any one causes issues:

**1. `opacity` — controls pattern transparency**

`radial-gradient` generates solid dots. `currentColor` inherits the text color. On dark backgrounds, white solid dots are very prominent. Without `opacity`, the default value is `1`, making the pattern fully opaque.

**2. `z-index: -1` — pushes the pattern behind child elements**

`::before` is set to `position: absolute`. In the default stacking context, positioned elements paint after normal flow elements. When the container is `position: relative`, `z-index: -1` pushes the pseudo-element behind child content while keeping it visible above the container's own background.

**3. `pointer-events: none` — prevents click interception**

This is the easiest to remember because it directly affects interaction. Without it, the pattern layer intercepts click events.

The same project had a correctly implemented reference using a standalone element approach:

```css
/* Correct implementation — standalone element approach */
.cclee-dots-pattern {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.08;          /* Present */
    pointer-events: none;
    /* Standalone element controlled by HTML order, no z-index needed */
}
```

## Solution

Add `opacity` and `z-index: -1` to the `::before` pseudo-element:

```css
/* Fixed */
.has-dots-pattern {
    position: relative;
}
.has-dots-pattern::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 20px 20px;
    opacity: 0.08;           /* Added: 8% opacity */
    pointer-events: none;
    z-index: -1;             /* Added: behind child content */
}
```

Same fix for grid patterns:

```css
.has-grid-pattern {
    position: relative;
}
.has-grid-pattern::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(currentColor 1px, transparent 1px),
        linear-gradient(90deg, currentColor 1px, transparent 1px);
    background-size: 40px 40px;
    opacity: 0.05;           /* Grid is more subtle, 5% opacity */
    pointer-events: none;
    z-index: -1;
}
```

**Checklist for decorative pattern pseudo-elements**:

| Property | Purpose | Missing consequence |
|----------|---------|-------------------|
| `opacity: 0.05~0.1` | Controls pattern transparency | Pattern is fully opaque, overwhelming |
| `z-index: -1` | Stacks behind child elements | Pattern covers buttons and other children |
| `pointer-events: none` | Prevents mouse event interception | Click-through fails |

All three properties must be present together. This is the fixed pattern for `::before` decorative overlays.

---
**Interested in similar solutions? [Get in touch](/about)**
