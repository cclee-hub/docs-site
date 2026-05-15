---
title: 修复 WooCommerce FSE Cart Block 空车白屏与商品无图塌陷
description: WooCommerce Cart Block 未声明 inner block 导致空车白屏，post-featured-image 无图时渲染空导致卡片塌陷，给出完整修复代码
date: 2026-03-28
tags: [WordPress, WooCommerce, FSE, Block Theme]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WooCommerce Cart Block 空购物车时页面空白怎么办？"
    a: "必须显式声明 filled-cart-block 和 empty-cart-block 子块，Cart Block 不会自动处理空车状态。"
  - q: "FSE 主题中商品没有特色图片时卡片高度塌陷怎么修复？"
    a: "通过 post_thumbnail_html filter 检测 product 类型无图时，输出 WooCommerce 占位图（wc_placeholder_img_src）。"
  - q: "WooCommerce Cart Block 的正确 HTML 结构是什么？"
    a: "wp:woocommerce/cart > wp:woocommerce/filled-cart-block + wp:woocommerce/empty-cart-block，两者必须同时存在。"
---

在为客户开发 WooCommerce FSE Block Theme 时遇到这两个问题：Cart Block 空车时页面白屏、商品无特色图片时卡片高度塌陷。记录根因与解法。

## TL;DR

1. Cart Block 必须显式声明 `filled-cart-block` 和 `empty-cart-block` 子块，否则空车时无任何内容输出。
2. 商品无特色图片时，FSE 的 `post-featured-image` 块渲染为空字符串，导致卡片高度塌陷。通过 `post_thumbnail_html` filter 补上 WooCommerce 占位图。


<!-- truncate -->
## 问题一：Cart Block 空车白屏

### 问题现象

购物车页面在有商品时正常显示，清空购物车后整个页面内容区变成空白 -- 没有提示文案，没有"继续购物"按钮，用户无法自助返回。

### 根因

WooCommerce Cart Block (`wp:woocommerce/cart`) 的设计要求开发者**显式声明**两个子块：

- `wp:woocommerce/filled-cart-block` -- 有商品时显示
- `wp:woocommerce/empty-cart-block` -- 空车时显示

如果只写了 Cart Block 本体而没有嵌套这两个子块，WooCommerce 在空车状态下不知道该渲染什么，输出为空。

这个问题在经典主题中不存在，因为经典主题使用 PHP 模板 `cart.php`，其中已经内置了空车处理逻辑。但 FSE 的 HTML 模板是声明式的，必须完整声明所有状态。

### 解决方案

cart.html 模板的正确结构：

```html
<!-- wp:woocommerce/cart {"className":"cclee-cart"} -->
<div class="wp-block-woocommerce-cart alignwide is-loading">

  <!-- wp:woocommerce/filled-cart-block -->
  <div class="wp-block-woocommerce-filled-cart-block">
    <!-- 有商品时的完整布局：商品列表 + 汇总 -->
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
    <!-- 空车提示 + 继续购物按钮 -->
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

**关键点**：`filled-cart-block` 和 `empty-cart-block` 必须是 `wp:woocommerce/cart` 的直接子块，WooCommerce 通过这两个子块实现有货/空车的条件渲染。

## 问题二：商品无特色图片时卡片塌陷

### 问题现象

在商品列表页（archive-product）中，没有设置特色图片的商品卡片只显示文字部分，没有图片区域。与有图卡片混排时，布局高度不统一，视觉上非常突兀。

### 根因

FSE 的 `wp:post-featured-image` 块在文章/商品没有缩略图时直接渲染为空字符串，不会输出占位图。经典主题中通常在 PHP 模板里手动处理这种情况（`has_post_thumbnail()` 判断），但 FSE HTML 模板无法嵌入这种条件逻辑。

### 解决方案

在主题的 `functions.php` 或 WooCommerce 集成文件中添加 filter：

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

**注意**：

- `wc_placeholder_img_src()` 依赖 WooCommerce 插件激活，用 `function_exists()` 做防护
- `object-fit: cover` 确保占位图和正常特色图片的裁剪行为一致
- 只针对 `product` 类型生效，不影响博客文章等其他 post type

---
**对类似需求感兴趣？[联系合作](/about)**
