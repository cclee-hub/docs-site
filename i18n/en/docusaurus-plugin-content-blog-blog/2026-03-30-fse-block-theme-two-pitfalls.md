---
title: Fix FSE Block Theme Style Preview Single Color Block and Front Page Blank Canvas
description: WordPress FSE theme style variation palette replaces instead of merges, and front-page template hardcoding patterns causes Site Editor blank canvas - root causes and solutions
date: 2026-03-30
tags: [WordPress, FSE, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does my WordPress style variation show only one color in Site Editor?"
    a: "Style variation palette and gradients replace the parent theme entirely, not merge. Declaring only one color drops all others. You must include the full list."
  - q: "Why is the Site Editor front page canvas blank?"
    a: "The post-content block in front-page.html renders the page_on_front post content from the database. If the page content is empty, the canvas is blank. Layout should be content-driven, not template-hardcoded."
  - q: "How to make FSE theme front page layout editable?"
    a: "Keep only header, post-content, and footer in the template. Inject layout patterns into page post_content via after_switch_theme hook so users can edit in the page editor."
---

Encountered these two issues while developing a WordPress FSE Block Theme for a client. Here are the root causes and solutions.

## TL;DR

1. Style variation `palette`/`gradients` **replace** rather than merge -- declaring only 1 color drops all others. You must include the complete list and only change what differs.
2. Hardcoding patterns in `front-page.html` causes Site Editor blank canvas and prevents users from editing the layout -- switch to content-driven architecture.


<!-- truncate -->
## Pitfall 1: Style Variation Shows Only One Color Block

### Problem

In Site Editor > Browse Styles, the default style shows 16 color blocks, but the second style variation (Amber) shows only 1. After switching to Amber, all elements referencing `primary`, `base`, `contrast` CSS variables lose their colors entirely.

### Root Cause

In WordPress theme.json style variations, `settings.color.palette` and `settings.color.gradients` **replace** the parent theme's declarations entirely, rather than merging incrementally.

The original `styles/amber.json`:

```json
{
  "settings": {
    "color": {
      "palette": [
        { "slug": "accent", "color": "#b45309", "name": "Amber" }
      ]
    }
  }
}
```

The intent was "only change the accent color to amber", but the actual effect is "the entire palette now has only this one color". All colors from the parent theme.json -- `primary`, `secondary`, `base`, `contrast`, `surface`, `neutral-50` through `neutral-900` -- are gone.

The same applies to `gradients`: declaring 1 gradient replaces all 7 from the parent theme.

### Solution

Include the complete palette and gradients list in the variation file, only modifying the values you want to change:

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "title": "Amber",
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary",    "color": "#0f172a", "name": "Primary" },
        { "slug": "secondary",  "color": "#334155", "name": "Secondary" },
        { "slug": "accent",     "color": "#b45309", "name": "Amber" },
        { "slug": "base",       "color": "#ffffff",  "name": "Base" },
        { "slug": "contrast",   "color": "#f8fafc",  "name": "Contrast" },
        { "slug": "surface",    "color": "#0f172a",  "name": "Surface" },
        { "slug": "neutral-50", "color": "#fafafa",  "name": "Neutral 50" }
        // ... remaining neutrals unchanged
      ],
      "gradients": [
        // include all 7 gradients, only modify the accent gradient target color
      ]
    }
  }
}
```

**Key principle**: Any array-type config in a variation (palette, gradients, fontSizes, spacingSizes, etc.) replaces entirely. Always include the complete list.

## Pitfall 2: Site Editor Front Page Blank Canvas

### Problem

Opening the front page via Site Editor > Pages > Home shows a completely blank canvas. However, the full layout is visible in Templates > Front Page.

### Root Cause

These are two different editing entry points with different data sources:

| Entry | Edits | Data Source |
|-------|-------|-------------|
| Templates > Front Page | `front-page.html` template | Theme files |
| Pages > Home | `page_on_front` page content | Database `wp_posts.post_content` |

The original `front-page.html` hardcoded three patterns at the template level:

```html
<!-- wp:pattern {"slug":"cclee-theme/hero-centered"} /-->
<!-- wp:pattern {"slug":"cclee-theme/features-grid"} /-->

<!-- wp:group {"tagName":"main","align":"full"} -->
<main class="wp-block-group alignfull">
  <!-- wp:post-content /-->
</main>
<!-- /wp:group -->

<!-- wp:pattern {"slug":"cclee-theme/cta-banner"} /-->
```

The `post-content` block renders the `page_on_front` page's database content. That page content was empty, so Pages > Home shows a blank canvas -- this is expected WordPress behavior.

The real problem: hardcoding patterns in the template prevents users from adjusting the front page layout order and content in the page editor.

### Solution

Switch the front page architecture from "template-hardcoded" to "content-driven".

**1. Template keeps only the skeleton** (`front-page.html`):

```html
<!-- wp:template-part {"slug":"header-transparent","tagName":"header"} /-->

<!-- wp:group {"tagName":"main","align":"full","layout":{"type":"constrained"}} -->
<main class="wp-block-group alignfull">
  <!-- wp:post-content {"layout":{"type":"constrained"}} /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer-columns","tagName":"footer"} /-->
```

**2. Inject default content on theme activation** (`functions.php` or `inc/setup.php`):

```php
add_action( 'after_switch_theme', function () {
    $front_page_id = (int) get_option( 'page_on_front' );
    if ( ! $front_page_id ) {
        return;
    }

    $post = get_post( $front_page_id );
    // Only inject when content is empty -- never overwrite user content
    if ( ! $post || ! empty( trim( $post->post_content ) ) ) {
        return;
    }

    $default_content = '<!-- wp:pattern {"slug":"cclee-theme/hero-centered"} /-->' . "\n"
                     . '<!-- wp:pattern {"slug":"cclee-theme/features-grid"} /-->' . "\n"
                     . '<!-- wp:pattern {"slug":"cclee-theme/cta-banner"} /-->';

    wp_update_post( [
        'ID'           => $front_page_id,
        'post_content' => $default_content,
    ] );
} );
```

**Design decisions**:
- Template handles only the header / main (post-content) / footer skeleton
- Front page layout is entirely content-driven -- users can add, remove, and reorder patterns in the page editor
- `after_switch_theme` hook ensures default content on first activation
- Empty content check guarantees no user customization is overwritten

---

**Interested in similar solutions? [Get in touch](/about)**
