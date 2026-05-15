---
title: Fixing 4 CSS Conflicts Between WooCommerce and FSE Block Themes
description: WooCommerce silently overrides theme.json font sizes, font-size class hyphenation trap, contrast color inversion, and ul.products pseudo-elements breaking CSS Grid layout
date: 2026-04-01
tags: [WordPress, FSE, WooCommerce, CSS]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why did my theme font sizes change after installing WooCommerce?"
    a: "WooCommerce registers small/medium/large/x-large font size presets via WP_Theme_JSON_API, overriding theme.json values with the same slug. Use custom slugs like h-1~h-6 to avoid conflicts."
  - q: "Why does has-h1-font-size render the wrong size in FSE templates?"
    a: "Gutenberg renders fontSize:h1 slug as has-h-1-font-size (with hyphen) matching theme.json. The non-hyphenated has-h1-font-size matches WooCommerce's override value. Always use the hyphenated version in hand-written HTML."
  - q: "Why does CSS Grid break WooCommerce product listings?"
    a: "WooCommerce injects ::before/::after pseudo-elements on ul.products for clearfix. CSS Grid treats them as grid items, causing layout issues. Fix: set display:none on the pseudo-elements."
---

While developing a WordPress FSE Block Theme with WooCommerce integration, I encountered 4 hidden traps where WooCommerce silently overrides theme styles. Each one was difficult to diagnose. Here are the root causes and solutions to help other FSE + WooCommerce theme developers.

## TL;DR

1. **Font size preset override**: WooCommerce registers `small/medium/large/x-large` presets that override theme.json. Use custom slugs like `h-1~h-6` to avoid conflicts.
2. **Font-size class hyphenation**: `has-h-1-font-size`(48px) vs `has-h1-font-size`(20px). Hand-written HTML must use the hyphenated version.
3. **Contrast color inversion**: `--wp--preset--color--contrast` is set to a light color (#f8fafc) by WooCommerce, making white text invisible.
4. **ul.products pseudo-elements**: WooCommerce injects `::before/::after` that break CSS Grid layout. Fix with `display:none`.


<!-- truncate -->
## Trap 1: Font Size Presets Overridden

### Symptom

Defined font size presets in theme.json:

```json
{
  "settings": {
    "typography": {
      "fontSizes": [
        { "slug": "small", "size": "0.875rem" },
        { "slug": "large", "size": "1.125rem" }
      ]
    }
  }
}
```

After installing WooCommerce, paragraphs using `has-large-font-size` render at **36px** instead of the expected 18px. H1 headings may also shrink from 48px to 20px.

### Root Cause

WooCommerce registers its own font size presets via `WP_Theme_JSON_API`:

| slug | theme.json original | WooCommerce override |
|------|--------------------|--------------------|
| small | 0.875rem (14px) | 13px |
| medium | 1rem (16px) | 20px |
| large | 1.125rem (18px) | 36px |
| x-large | 1.25rem (20px) | 42px |

Presets with the same slug get overridden. Custom slugs (like `h-1`~`h-6`, `base`) are unaffected.

### Solution

**Use custom slugs in theme.json to avoid WooCommerce conflicts:**

```json
{
  "fontSizes": [
    { "slug": "h-1", "size": "3rem" },
    { "slug": "h-2", "size": "2.25rem" },
    { "slug": "h-3", "size": "1.75rem" },
    { "slug": "base", "size": "16px" }
  ]
}
```

Use `has-h-5-font-size` instead of `has-large-font-size` in templates.

## Trap 2: Font-Size Class Hyphenation

### Symptom

When hand-writing FSE template HTML, H1 headings render at 20px instead of the theme.json value of 48px:

```html
<!-- Wrong: renders at 20px -->
<h1 class="has-h1-font-size">Heading</h1>

<!-- Correct: renders at 48px -->
<h1 class="has-h-1-font-size">Heading</h1>
```

Two classes differ by one hyphen, but the rendered size differs by 2.4x.

### Root Cause

Gutenberg renders `fontSize: "h1"` slug as `has-h-1-font-size` (hyphen added before the number). This is correct behavior.

But when WooCommerce overrides the font size system, `has-h1-font-size` (no hyphen) matches WooCommerce's override value (20px), while `has-h-1-font-size` (with hyphen) matches the theme.json original (48px).

Verify in browser console:

```javascript
const el = document.createElement('div');
document.body.appendChild(el);

el.className = 'has-h1-font-size';
console.log('No hyphen:', getComputedStyle(el).fontSize); // 20px (wrong)

el.className = 'has-h-1-font-size';
console.log('With hyphen:', getComputedStyle(el).fontSize); // 48px (correct)

document.body.removeChild(el);
```

### Solution

**Always use the hyphenated format in hand-written FSE template HTML:**

```html
<!-- wp:heading {"fontSize":"h1"} -->
<h1 class="has-h-1-font-size">Heading</h1>
<!-- /wp:heading -->

<!-- wp:heading {"fontSize":"h3"} -->
<h2 class="has-h-3-font-size">Section Title</h2>
<!-- /wp:heading -->
```

Rule: `has-h-{N}-font-size` (with hyphen), applies to all h-* presets.

## Trap 3: Contrast Color Inversion

### Symptom

White text on a `contrast` background is invisible:

```html
<div class="has-contrast-background-color">
  <h2 class="has-base-color">White text on dark background</h2>
</div>
```

Expected contrast to be dark, but it renders as a very light background.

### Root Cause

WooCommerce registers `--wp--preset--color--contrast` as `#f8fafc` (very light gray). This is WooCommerce's design intent (their default theme uses contrast as a light background section), but conflicts with most FSE themes where contrast means dark.

### Solution

**Use `primary` (dark) as text color on contrast backgrounds:**

```html
<div class="has-contrast-background-color">
  <h2 class="has-primary-color has-text-color">Dark text on light background</h2>
</div>
```

Or define your own dark preset in theme.json (e.g. `surface`) instead of relying on `contrast`:

```json
{
  "settings": {
    "color": {
      "palette": [
        { "slug": "surface", "color": "#0f172a", "name": "Surface" }
      ]
    }
  }
}
```

## Trap 4: ul.products Pseudo-Elements Break CSS Grid

### Symptom

WooCommerce product listings using CSS Grid show misaligned cards with empty gaps:

```css
ul.products {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
```

Expected 3 equal columns, but empty slots appear and cards wrap to the next row.

### Root Cause

WooCommerce injects `::before` and `::after` pseudo-elements on `ul.products`:

```css
ul.products::before,
ul.products::after {
  display: table;
  content: '';
}

ul.products::after {
  clear: both;
}
```

These pseudo-elements are designed as clearfix for traditional float layouts. But CSS Grid treats them as grid items, occupying two implicit grid cells.

### Solution

**Hide pseudo-elements for Grid layouts on ul.products:**

```css
ul.products {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

ul.products::before,
ul.products::after {
  display: none;
}
```

<InfoBox variant="warning" title="Important Notes">

- Each trap relates to WooCommerce's `WP_Theme_JSON_API` registration or CSS injection. Disabling WooCommerce removes these overrides.
- Traps 1 and 2 are linked: after WooCommerce overrides font size presets, hyphenated and non-hyphenated classes map to different values.
- Trap 3's contrast value may change across WooCommerce versions. Use a custom slug (e.g. `surface`) for stability.
- Before hand-writing FSE templates, inspect Gutenberg's auto-rendered class names in DevTools. Don't guess class name formats.

</InfoBox>


<div className="my-8 p-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-center">
  <div className="text-lg font-semibold mb-1">Deploying a WooCommerce Site?</div>
  <div className="text-sm text-gray-500 mb-4">Recommended cloud hosting providers</div>
  <div className="flex flex-wrap justify-center gap-4">
    <a href="https://www.aliyun.com/minisite/goods?userCode=fvyejhr0" className="button button--primary button--lg" target="_blank" rel="noopener noreferrer">Aliyun (China)</a>
    <a href="https://www.vultr.com/?ref=9811050" className="button button--secondary button--lg" target="_blank" rel="noopener noreferrer">Vultr (Global)</a>
  </div>
</div>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>

