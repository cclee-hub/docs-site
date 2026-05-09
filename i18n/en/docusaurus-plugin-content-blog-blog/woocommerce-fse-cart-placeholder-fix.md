---
title: Fix WooCommerce FSE Cart Block Blank Page and Product Image Collapse
description: WooCommerce Cart Block requires explicit inner blocks for empty state, and post-featured-image renders empty without thumbnail. Complete fix with code examples.
date: 2026-03-28
tags: [WordPress, WooCommerce, FSE, Block Theme]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does the WooCommerce Cart Block show a blank page when empty?"
    a: "You must explicitly declare filled-cart-block and empty-cart-block inner blocks. The Cart Block does not auto-handle the empty state."
  - q: "How to fix card height collapse when WooCommerce products have no featured image in FSE?"
    a: "Use the post_thumbnail_html filter to inject the WooCommerce placeholder image (wc_placeholder_img_src) for products without thumbnails."
  - q: "What is the correct HTML structure for the WooCommerce Cart Block?"
    a: "wp:woocommerce/cart > wp:woocommerce/filled-cart-block + wp:woocommerce/empty-cart-block. Both must be present."
---

Encountered these two issues while developing a WooCommerce FSE Block Theme for a client: Cart Block renders a blank page when empty, and product cards collapse when no featured image is set. Here's the root cause and solution.

## TL;DR

1. Cart Block requires explicit `filled-cart-block` and `empty-cart-block` inner blocks -- without them, empty cart renders nothing.
2. FSE's `post-featured-image` block renders an empty string when no thumbnail exists, causing card height collapse. Fix with `post_thumbnail_html` filter to inject WooCommerce placeholder.

## Issue 1: Cart Block Blank Page on Empty Cart

### Symptom

The cart page works fine with products, but after clearing the cart the entire content area becomes blank -- no message, no "Continue Shopping" button, users are stuck.

### Root Cause

WooCommerce Cart Block (`wp:woocommerce/cart`) requires developers to **explicitly declare** two inner blocks:

- `wp:woocommerce/filled-cart-block` -- shown when cart has items
- `wp:woocommerce/empty-cart-block` -- shown when cart is empty

If you only add the Cart Block without these inner blocks, WooCommerce doesn't know what to render for an empty cart and outputs nothing.

This issue doesn't occur in classic themes because their PHP templates (`cart.php`) have built-in empty cart handling. But FSE HTML templates are declarative -- you must declare all states.

### Solution

Correct structure in `cart.html`:

```html
<!-- wp:woocommerce/cart {"className":"cclee-cart"} -->
<div class="wp-block-woocommerce-cart alignwide is-loading">

  <!-- wp:woocommerce/filled-cart-block -->
  <div class="wp-block-woocommerce-filled-cart-block">
    <!-- Full layout for items: product list + totals -->
    <!-- wp:columns -->
    <div class="wp-block-columns">
      <!-- wp:column {"width":"65%"} -->
      <div class="wp-block-column" style="flex-basis:65%">
        <!-- wp:woocommerce/cart-items-block -->
        <div class="wp-block-woocommerce-cart-items-block"></div>
        <!-- /wp:woocommerce/cart-items-block -->
      </div>
      <!-- /wp:column -->
      <!-- wp:column {"width":"35%"} -->
      <div class="wp-block-column" style="flex-basis:35%">
        <!-- wp:woocommerce/cart-totals-block -->
        <div class="wp-block-woocommerce-cart-totals-block">
          <!-- wp:woocommerce/cart-order-summary-block /-->
          <!-- wp:woocommerce/proceed-to-checkout-block /-->
        </div>
        <!-- /wp:woocommerce/cart-totals-block -->
      </div>
      <!-- /wp:column -->
    </div>
    <!-- /wp:columns -->
  </div>
  <!-- /wp:woocommerce/filled-cart-block -->

  <!-- wp:woocommerce/empty-cart-block -->
  <div class="wp-block-woocommerce-empty-cart-block">
    <!-- Empty cart message + continue shopping button -->
    <!-- wp:paragraph {"align":"center","textColor":"neutral-500"} -->
    <p class="has-text-align-center has-neutral-500-color has-text-color">Your cart is currently empty.</p>
    <!-- /wp:paragraph -->
    <!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
    <div class="wp-block-buttons">
      <!-- wp:button {"backgroundColor":"accent","textColor":"base"} -->
      <div class="wp-block-button"><a href="/shop/" class="wp-block-button__link has-base-color has-accent-background-color has-text-color has-background wp-element-button">Browse Products</a></div>
      <!-- /wp:button -->
    </div>
    <!-- /wp:buttons -->
  </div>
  <!-- /wp:woocommerce/empty-cart-block -->

</div>
<!-- /wp:woocommerce/cart -->
```

**Key point**: `filled-cart-block` and `empty-cart-block` must be direct children of `wp:woocommerce/cart`. WooCommerce uses them for conditional rendering based on cart state.

## Issue 2: Card Collapse When Product Has No Featured Image

### Symptom

In product listing pages (archive-product), products without featured images only show the text area -- no image placeholder. Mixed with products that have images, the layout heights are inconsistent and visually broken.

### Root Cause

FSE's `wp:post-featured-image` block renders an empty string when a post/product has no thumbnail. Classic themes handle this in PHP templates with `has_post_thumbnail()` checks, but FSE HTML templates cannot embed conditional logic.

### Solution

Add a filter in your theme's `functions.php` or WooCommerce integration file:

```php
/**
 * Product placeholder image when no featured image is set.
 *
 * FSE post-featured-image block renders empty when no thumbnail,
 * causing card height collapse. This filter injects the WooCommerce
 * placeholder image for product post type.
 *
 * @param string $html    The post thumbnail HTML.
 * @param int    $post_id The post ID.
 * @return string
 */
add_filter( 'post_thumbnail_html', function ( $html, $post_id ) {
    // Already has image or not a product -- skip.
    if ( $html || get_post_type( $post_id ) !== 'product' ) {
        return $html;
    }

    // Use WooCommerce's built-in placeholder.
    $src = function_exists( 'wc_placeholder_img_src' )
        ? wc_placeholder_img_src()
        : '';

    if ( ! $src ) {
        return '';
    }

    return sprintf(
        '<img src="%s" alt="%s" loading="lazy" decoding="async" style="width:100%%;height:100%%;object-fit:cover;">',
        esc_url( $src ),
        esc_attr( get_the_title( $post_id ) )
    );
}, 10, 2 );
```

**Notes**:

- `wc_placeholder_img_src()` depends on WooCommerce being active -- use `function_exists()` as a guard
- `object-fit: cover` ensures the placeholder matches the cropping behavior of regular featured images
- Only applies to `product` post type, does not affect blog posts or other post types

---
**Interested in similar solutions? [Get in touch](/about)**
