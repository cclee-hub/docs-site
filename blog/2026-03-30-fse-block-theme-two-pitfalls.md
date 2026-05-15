---
title: 修复 FSE Block Theme 的风格预览单色块与首页白屏问题
description: WordPress FSE 主题的 style variation palette 是整体替换而非合并，以及 front-page 模板硬编码 pattern 导致 Site Editor 白屏的根因与解法
date: 2026-03-30
tags: [WordPress, FSE, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 WordPress style variation 在 Site Editor 只显示一个颜色？"
    a: "variation 的 palette 和 gradients 是整体替换父主题，不是增量合并。只声明一个颜色会导致其余全部丢失，必须补全完整列表。"
  - q: "Site Editor 编辑首页为什么画布空白？"
    a: "front-page.html 的 post-content 块对应 page_on_front 页面内容，页面内容为空则画布为空。布局应通过页面内容驱动而非模板硬编码。"
  - q: "FSE 主题怎么让首页布局可编辑？"
    a: "模板只保留 header、post-content、footer，布局 patterns 通过 after_switch_theme 钩子注入页面 post_content，用户可在页面编辑器中自由调整。"
---

在为客户开发 WordPress FSE Block Theme 时，遇到风格预览显示异常和首页编辑白屏两个问题。记录根因与解法。

## TL;DR

1. Style variation 的 `palette`/`gradients` 是**整体替换**而非合并，只写 1 个颜色会丢失其余全部 -- 必须补全完整列表，只改需要变化的颜色。
2. `front-page.html` 模板硬编码 pattern 会导致 Site Editor 编辑白屏，且用户无法在编辑器中调整布局 -- 应改为页面内容驱动。


<!-- truncate -->
## 坑一：Style Variation 风格预览只显示一个颜色块

### 问题现象

Site Editor > Browse Styles 中，默认风格显示 16 个颜色块，而第二个风格（Amber）只显示 1 个颜色块。切换到 Amber 风格后，所有引用 `primary`、`base`、`contrast` 等 CSS 变量的元素全部失去颜色。

### 根因

WordPress theme.json 的 style variation 机制中，`settings.color.palette` 和 `settings.color.gradients` 是**整体替换（replace）**父主题的对应声明，而非增量合并（merge）。

原始 `styles/amber.json`：

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

这段配置的本意是"只把 accent 颜色换成琥珀色"，但实际效果是"整个调色板只剩这一个颜色"。父主题 theme.json 中定义的 `primary`、`secondary`、`base`、`contrast`、`surface`、`neutral-50` ~ `neutral-900` 全部丢失。

`gradients` 同理，只声明 1 个就会替换掉父主题的 7 个渐变。

### 解决方案

在 variation 文件中补全完整的 palette 和 gradients 列表，只修改需要变化的值：

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
        // ... 其余 neutral 色保持不变
      ],
      "gradients": [
        // 补全所有 7 个渐变，只修改 accent gradient 的目标色
      ]
    }
  }
}
```

**关键原则**：variation 中声明的任何数组类型配置项（palette、gradients、fontSizes、spacingSizes 等）都是整体替换，必须包含完整内容。

## 坑二：Site Editor 编辑首页白屏

### 问题现象

在 Site Editor 中通过 Pages > Home 打开首页编辑，画布完全空白。但在 Templates > Front Page 中能看到完整布局。

### 根因

这是两个不同的编辑入口，对应不同的数据源：

| 入口 | 编辑对象 | 数据来源 |
|------|---------|---------|
| Templates > Front Page | `front-page.html` 模板 | 主题文件 |
| Pages > Home | `page_on_front` 页面内容 | 数据库 `wp_posts.post_content` |

原始 `front-page.html` 在模板层面硬编码了三个 pattern：

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

`post-content` 块渲染 `page_on_front` 页面的数据库内容。该页面内容为空，所以 Pages > Home 画布空白 -- 这是 WordPress 预期行为。

问题在于：模板硬编码 pattern 导致用户无法在页面编辑器中调整首页布局顺序和内容。

### 解决方案

将首页布局从"模板硬编码"改为"页面内容驱动"。

**1. 模板只保留骨架**（`front-page.html`）：

```html
<!-- wp:template-part {"slug":"header-transparent","tagName":"header"} /-->

<!-- wp:group {"tagName":"main","align":"full","layout":{"type":"constrained"}} -->
<main class="wp-block-group alignfull">
  <!-- wp:post-content {"layout":{"type":"constrained"}} /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer-columns","tagName":"footer"} /-->
```

**2. 激活时自动注入默认内容**（`functions.php` 或 `inc/setup.php`）：

```php
add_action( 'after_switch_theme', function () {
    $front_page_id = (int) get_option( 'page_on_front' );
    if ( ! $front_page_id ) {
        return;
    }

    $post = get_post( $front_page_id );
    // 仅在内容为空时注入，不覆盖用户已有内容
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

**设计决策**：
- 模板只负责 header / main（post-content）/ footer 骨架
- 首页布局完全由页面内容驱动，用户可在页面编辑器中增删、排序 pattern
- `after_switch_theme` 钩子保证主题首次激活时有默认内容
- 内容为空判断确保不覆盖用户的自定义内容

---

**对类似需求感兴趣？[联系合作](/about)**
