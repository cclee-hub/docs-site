---
title: "Embedding a Timeline in SITE123 Event Pages? First Dodge These 5 Platform Limits"
description: "Embedding a timeline into a SITE123 event page hits 5 platform walls: no precise positioning, scripts running before DOM loads, selectors hitting hidden elements, float layout conflicts, and duplicate script injection from cache. Here's what we learned."
date: 2026-04-10
tags: [Bug Fix, E-commerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Can SITE123 Custom Code insert content precisely between specific sections on an event page?"
    a: 'No. Custom Code can only inject into head or body (start or end). There is no way to target a specific page or insert between sections—you must use JS DOM manipulation to work around it.'
  - q: "Why does the embedded timeline not show up on SITE123?"
    a: "Two common causes: the script runs before DOM is ready (placed in head), or the selector matches a hidden element (like the breadcrumb nav with visibility:hidden), placing the timeline in an invisible spot."
---

## TL;DR

Embedding a self-hosted timeline into a SITE123 event page hits 5 platform walls: Custom Code **can't target a page or position**, scripts **run before DOM is ready**, selectors **hit hidden elements**, `float` layout **pushes adjacent blocks out of place**, and platform cache **injects the script twice**. Fix: JS DOM manipulation + horizontal fishbone layout + `DOMContentLoaded` wrapper.


<!-- truncate -->
---

## The Problem

The client runs their event site on SITE123 and needed a timeline below the Hero banner showing key dates. The Timeline service was already deployed (`timeline.aidevhub.ai`), but after injecting the embed script via SITE123 Custom Code:

- Timeline didn't appear
- Timeline showed up at the page footer
- After inserting the timeline, the Tickets section got pushed below

## Root Causes

### Limit 1: Custom Code Has No Precise Positioning

SITE123 Custom Code offers only 4 injection spots (head start, head end, body start, body end). **You can't target a specific page** and **can't insert between sections**.

This is the fundamental constraint with no workaround—only JS DOM manipulation after page load can compensate.

### Limit 2: Script Runs Before DOM Is Ready

If the script is placed in "Before closing head tag", `document.body` is null at execution time. Stranger still: changing the injection position in SITE123 dashboard sometimes doesn't reflect in the actual page source.

**Fix: Wrap everything in `DOMContentLoaded` regardless of where the script ends up.**

### Limit 3: Selector Matches a Hidden Element

`tl.js` prioritizes `.container`, but on SITE123 event pages `.container` is the breadcrumb area with `visibility: hidden`—the timeline gets inserted before the hidden element and stays invisible.

`querySelector` takes the first match only, and `.container` is a generic class name that easily collides.

**Lesson: Always verify selectors in the browser console on the actual page. Never rely on assumptions.**

### Limit 4: Float Layout Conflict

SITE123 event pages use Bootstrap float layout (`col-sm-5` + `col-sm-7`, exactly 12 columns). Inserting a full-width block before `.product-container` pushes the Tickets column to the next row.

This is a structural conflict—inside a float container, you cannot insert a full-row element without breaking the layout.

**Fix: Switch to a horizontal fishbone layout (贯穿横线 + 圆点 + alternating cards), which uses `width:100%` naturally and doesn't participate in float calculation.**

### Limit 5: Platform Cache Injects Script Twice

After changing the Custom Code position, the page source showed two `timeline.aidevhub.ai` entries—one script injected twice. SITE123 platform bug, root cause unknown, doesn't affect the final result.

---

## Solutions

### 1. Execution Timing Safeguard

Wrap all insertion logic in `DOMContentLoaded` so it works regardless of SITE123's placement:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // insertion logic
});
```

### 2. Always Verify Selectors in Console

Three-step browser console checklist:

```javascript
// Step 1: Confirm element exists and is visible
const el = document.querySelector('.product-container');
console.log(el.getBoundingClientRect());

// Step 2: Confirm uniqueness (cross-page, should return 1)
const all = document.querySelectorAll('.product-container');
console.log(all.length);

// Step 3: Insert a red test block to verify position visually
const test = document.createElement('div');
test.style.cssText = 'background:red;height:100px;';
el.parentNode.insertBefore(test, el);
```

### 3. Layout Choice

Horizontal fishbone: a single horizontal line with dots positioned on it and cards alternating above and below. Vertical layouts easily break in float-based structures; horizontal layouts naturally don't participate in float calculation.

### 4. Insertion Target

Verified working target: `.product-container` (parent of event details and Tickets). Insert before it—the timeline lands below Hero, above event details.

### 5. Deployment

After modifying `routes/script.js`, run `pm2 restart timeline` and it takes effect immediately. **No need to update the SITE123 embed code.**

---

## Notes

<InfoBox variant="warning" title="Always Verify Selectors in Console">
  SITE123 page structure is undocumented—never assume. `.container` is a generic class that may match the breadcrumb nav instead of your target. Always use the browser console on the actual page to confirm.
</InfoBox>

<InfoBox variant="warning" title="Custom Code Position Settings Are Unreliable">
  Changing the injection position in the SITE123 dashboard may not reflect in the actual page source. Make your script self-sufficient with `DOMContentLoaded`—don't rely on platform settings.
</InfoBox>

<InfoBox variant="warning" title="No Full-Width Elements Inside Float Layouts">
  Inserting a `width:100%` block inside or before a Bootstrap float container (`col-*`) pushes subsequent columns to the next row. Workaround: insert outside the container, or switch to a layout that doesn't rely on floats.
</InfoBox>

---

<div className="my-8 p-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-center">
  <div className="text-lg font-semibold mb-3">Self-Hosted Timeline Service—What Server to Use?</div>
  <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
    This project runs on Express + sql.js deployed on Vultr. A $5/month instance is sufficient. PM2 manages the process. Includes one-command setup script—running in 5 minutes.
  </div>
  <a href="https://www.vultr.com/?ref=9811050" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">Vultr — From $5/month →</a>
</div>

---

## Key Takeaways

1. SITE123 Custom Code can't target pages or positions—JS DOM manipulation is the only workaround
2. Wrap scripts in `DOMContentLoaded` to be self-sufficient, don't trust platform position settings
3. Verify selectors with `querySelectorAll` + `getBoundingClientRect` in the browser console
4. Full-width elements inside float layouts cause structural conflicts—horizontal layout bypasses this
5. After modifying server code, `pm2 restart timeline` takes effect immediately, no need to touch the embed code

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Contact</a>
</div>
