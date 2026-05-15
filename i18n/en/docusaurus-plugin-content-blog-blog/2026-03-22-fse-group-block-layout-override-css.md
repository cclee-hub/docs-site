---
title: Fix FSE Group Block Layout Property Overriding Custom CSS
description: WordPress FSE Group block's layout property generates is-layout-* classes that override custom styles. Solved with default layout + !important + :has() selector
date: 2026-03-22
tags: [WordPress, CSS, FSE]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why doesn't my custom CSS work on WordPress FSE Group blocks?"
    a: "The layout property generates is-layout-flow classes with higher specificity than regular custom CSS declarations."
  - q: "How can I make custom CSS override WordPress block default styles?"
    a: "Use !important declarations with high-specificity selectors like .wp-block-group.className, and set padding: 0 to clear default padding."
  - q: "What's the purpose of the CSS :has() selector here?"
    a: "It controls parent container dimensions to prevent flexbox children from being stretched unexpectedly."
---

## TL;DR

WordPress FSE Group blocks with `layout` property automatically generate `is-layout-*` CSS classes that have higher specificity than custom CSS, causing size settings to be ignored. Solution: 1) Use `"layout":{"type":"default"}` in block annotation to avoid extra layout classes; 2) Use `!important` in CSS to force override; 3) **Key**: Add `padding: 0 !important` to clear the Group block's default padding.


<!-- truncate -->
## Problem

Timeline component year dots should display as 80px circles, but appear as ellipses:

```html
<!-- Size settings in block annotation -->
<!-- wp:group {"style":{"dimensions":{"width":"80px","height":"80px"}},"layout":{"type":"flex",...}} -->
```

```css
/* Custom CSS */
.cclee-timeline-dot {
    width: 80px;
    height: 80px;
    border-radius: 50%;
}
```

Neither adjusting CSS nor block attributes fixed the stretched dots.

## Root Cause

WordPress FSE Group blocks automatically add layout-related CSS classes based on the `layout` property:

```html
<div class="wp-block-group cclee-timeline-dot is-layout-flow">
```

These `is-layout-*` classes come from WordPress core stylesheets and override custom CSS. Additionally, Group blocks have default `padding` that increases element dimensions.

Key issues:
1. `layout: {"type": "flex"}` generates `is-layout-flex` class, causing children to be stretched by flexbox
2. `style.dimensions` in block annotation becomes inline style, but gets overridden by layout class styles
3. Group block default padding adds to actual element size

## Solution

### 1. Modify Block Annotation with Default Layout

```html
<!-- wp:group {"className":"cclee-timeline-dot","style":{"border":{"radius":"50%"}},"backgroundColor":"accent","textColor":"base","layout":{"type":"default"}} -->
<div class="wp-block-group cclee-timeline-dot has-base-color has-accent-background-color has-text-color has-background" style="border-radius:50%">
```

Remove `style.dimensions` and complex flex layout, use `"layout":{"type":"default"}` instead.

### 2. CSS Override + Clear Default Padding

```css
/* Timeline: Fixed circle dot */
.wp-block-group.cclee-timeline-dot {
    width: 80px !important;
    height: 80px !important;
    min-width: 80px !important;
    min-height: 80px !important;
    flex-shrink: 0 !important;
    aspect-ratio: unset !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    align-self: center !important;
    box-sizing: border-box !important;
    text-align: center !important;
    padding: 0 !important;  /* Key: clear default padding */
}

.wp-block-group.cclee-timeline-dot p {
    margin: 0 !important;
    white-space: nowrap !important;
    line-height: 1 !important;
    overflow: visible !important;
}
```

### 3. Use :has() to Control Parent Container

Prevent parent Column from being stretched by flexbox:

```css
.wp-block-columns .wp-block-column:has(.cclee-timeline-dot) {
    flex-shrink: 0 !important;
    flex-basis: 100px !important;
    width: 100px !important;
}
```

### Key Finding

`padding: 0 !important` is the final solution. Group block's default padding stretches the element—even with `width/height` set, the actual rendered size exceeds expectations.

---
**Interested in similar solutions? [Contact us](/about)**
