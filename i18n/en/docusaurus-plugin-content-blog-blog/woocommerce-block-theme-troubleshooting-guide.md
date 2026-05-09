---
title: "WooCommerce Blocks Showing core/missing After Upgrade? Block Theme Troubleshooting Guide"
description: Four common WooCommerce Block Theme issues—block rename causing core/missing, shop slug change resulting in 404, template HTML mismatch with Gutenberg save output, and Cart/Checkout templates not auto-assigning—with root causes and solutions.
date: 2026-04-17
tags: [WooCommerce, Block Theme, FSE, WordPress]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why do WooCommerce blocks show as core/missing after upgrading?"
    a: "WooCommerce renamed internal blocks with a -block suffix in newer versions. Old block names in templates render as core/missing in the editor. Update block comment names in your templates."
  - q: "WooCommerce shop page returns 404 after changing the slug?"
    a: "You must run wp rewrite flush after changing the slug. WordPress caches rewrite rules, and the old slug mapping persists until flushed."
  - q: "WooCommerce Cart Block template page is blank?"
    a: "Cart and Checkout are dynamic blocks rendered by PHP. Ensure template HTML exactly matches the Gutenberg save output to avoid validation errors."
---

Ran into these four WooCommerce-specific issues while building Block Themes for clients. Each relates to how FSE architecture interacts with WooCommerce's block system. Documenting the troubleshooting process to help others working on WooCommerce theme development.

## TL;DR

Four common issues in WooCommerce Block Theme development: **block rename causing core/missing** (block names gained -block suffix after upgrade), **product archive 404 after shop slug change** (rewrite cache not flushed), **template HTML mismatch with Gutenberg save** (dynamic block validation failure), and **Cart/Checkout templates not auto-assigning** (manual assignment required). Each scenario includes copy-paste fixes.

## Scenario 1: Blocks Show as core/missing After WooCommerce Upgrade

### Problem

After upgrading WooCommerce, several blocks in the Site Editor display as `core/missing` (Block Recovery prompt). The frontend renders correctly, but these blocks can't be edited in the editor.

### Root Cause

WooCommerce renamed multiple internal blocks in newer versions, adding a `-block` suffix:

| Old name | New name |
|----------|----------|
| `cart-order-summary-subtotal` | `cart-order-summary-subtotal-block` |
| `cart-order-summary-shipping` | `cart-order-summary-shipping-block` |
| `cart-order-summary-taxes` | `cart-order-summary-taxes-block` |
| `cart-order-summary-total` | `totals-block` |
| `proceed-to-checkout` | `proceed-to-checkout-block` |

If your templates or Patterns use old block comment names (e.g., `<!-- wp:woocommerce/cart-order-summary-subtotal -->`), Gutenberg can't find the corresponding block registration and renders it as `core/missing`.

Frontend rendering works because WooCommerce's PHP callbacks still support old names. But the editor depends on JavaScript block registration info—when it's not found, the block shows as missing.

### Solution

**Diagnose**: Confirm registered block names in the browser console:

```javascript
wp.blocks.getBlockTypes()
  .map(b => b.name)
  .filter(n => n.includes('cart-order-summary'))
```

Compare the output with the names used in your templates to find mismatches.

**Fix**: Batch replace old block names in template and Pattern files:

```bash
# Run in your theme directory
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-subtotal/woocommerce\/cart-order-summary-subtotal-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-shipping/woocommerce\/cart-order-summary-shipping-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-taxes/woocommerce\/cart-order-summary-taxes-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-total/woocommerce\/totals-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/proceed-to-checkout/woocommerce\/proceed-to-checkout-block/g' {} +
```

After replacing, clear the database template cache (see the previous article's "file changes not applying" scenario).

<InfoBox variant="warning" title="Important">

- Back up template files before upgrading WooCommerce—block renames typically appear in major version upgrades
- Normal frontend rendering doesn't mean there's no issue—always check in the Site Editor
- Subscribe to WooCommerce developer changelogs to learn about block name changes in advance

</InfoBox>

## Scenario 2: Changed the Shop URL, Now the Product Page Is Gone

### Problem

After changing the WooCommerce shop page slug (e.g., from `/shop/` to `/products/`) or modifying the permalink structure, visiting the new shop URL returns 404 or displays as a plain page without the product listing.

### Root Cause

WordPress's Rewrite API caches URL routing rules in the database on first access. After changing a page slug, the cached routing still maps to the old slug. The new URL has no matching route, so WordPress renders it as a regular page instead of a WooCommerce product archive.

### Solution

After changing slugs or permalink structures, flush the rewrite cache:

```bash
# Local Docker environment
docker exec wp_cli wp rewrite flush --allow-root

# Server environment
ssh your-server "docker exec prod_cli wp rewrite flush --allow-root"
```

One command fixes it. You can also do this in the WordPress admin: **Settings → Permalinks → Save Changes**. Saving automatically flushes rewrite rules.

<InfoBox variant="info" title="Best Practice">

Run `wp rewrite flush` after any URL structure change—modifying slugs, changing permalinks, or adding custom post types. Consider adding it to your deployment script to avoid forgetting.

</InfoBox>

## Scenario 3: Cart/Checkout Blocks Show Validation Errors

### Problem

WooCommerce dynamic blocks like Cart and Checkout show Block validation failed in the Site Editor. The error message says Expected HTML and Actual HTML don't match.

### Root Cause

Many WooCommerce blocks are server-side rendered (SSR) dynamic blocks—frontend content is generated by PHP in real time, not dependent on JavaScript's `save()` function. However, Gutenberg still requires the block markup in templates to exactly match the `save()` output.

If the HTML in your template doesn't match what Gutenberg expects (extra or missing classes, styles, or inner elements), validation errors are triggered.

Reference for WooCommerce block save output:

| Block | save output |
|-------|------------|
| `product-price` | `<div class="is-loading"></div>` |
| `price-filter` | `<div class="wp-block-woocommerce-price-filter is-loading"><span aria-hidden="true" class="wc-block-product-categories__placeholder"></span></div>` |
| `woocommerce/cart` | `<div class="wp-block-woocommerce-cart alignwide is-loading"></div>` |
| `woocommerce/checkout` | `<div class="wp-block-woocommerce-checkout alignwide wc-block-checkout is-loading"></div>` |
| `cart-order-summary-*-block` | `<div class="wp-block-woocommerce-{block-name}"></div>` |
| `proceed-to-checkout-block` | `<div class="wp-block-woocommerce-proceed-to-checkout-block"></div>` |

### Solution

**Key rules**:

1. Blocks with `html: false` (save returns null, like `core/query-pagination`) can use self-closing tags
2. Blocks where JS save returns placeholder HTML **must not** be self-closing—they need complete content
3. `core/query-pagination` must not have a wrapper div; InnerBlocks go directly between open/close comments

**Troubleshooting steps**:

1. Open the Site Editor and browser DevTools Console
2. Find the `Block validation failed` log entry
3. Compare Expected (Gutenberg-generated) vs. Actual (from your template)
4. Fix the HTML using the reference table above

<InfoBox variant="warning" title="Safe to Ignore">

These WooCommerce validation errors can be safely ignored:

| Error | Explanation |
|-------|-------------|
| `woocommerce/cart` or `woocommerce/checkout` validation failure | Dynamic blocks rendered by PHP in real time; frontend displays correctly |
| `woocommerce-blocktheme-css` loading error | WooCommerce plugin CSS issue; wait for official fix |

</InfoBox>

## Scenario 4: Custom Cart/Checkout Template Not Showing Up

### Problem

You created custom Cart or Checkout template files (e.g., `templates/cart.html`, `templates/checkout.html`), but the corresponding WooCommerce pages still use the default template. The custom template is visible in the Site Editor but hasn't been applied to the Cart/Checkout pages.

### Root Cause

WooCommerce Cart and Checkout pages **auto-match** templates by name. But if matching fails (e.g., template slug doesn't exactly correspond, or page creation order issues), manual assignment is needed.

Pages that rely on shortcodes (like My Account) will **never** auto-match templates and always require manual assignment.

### Solution

Manually assign templates to their corresponding pages:

```bash
# 1. Find the Cart page ID
docker exec wp_cli wp post list --post_type=page --fields=ID,post_title,post_name --allow-root | grep -i cart

# 2. Assign the template
docker exec wp_cli wp post meta update <page_id> _wp_page_template <template_slug> --allow-root

# Example: assign cart-block template to the Cart page
docker exec wp_cli wp post meta update 42 _wp_page_template cart-block --allow-root
```

Verify the assignment:

```bash
docker exec wp_cli wp post meta get <page_id> _wp_page_template --allow-root
```

<InfoBox variant="info" title="Template Naming Tips">

Ensure template file names correspond to WooCommerce page functions. Standard naming:
- `cart.html` or `cart-block.html` → Cart page
- `checkout.html` or `checkout-block.html` → Checkout page
- `single-product.html` → Product detail page
- `archive-product.html` → Product archive page (shop)

Consistent naming increases the auto-matching success rate.

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
