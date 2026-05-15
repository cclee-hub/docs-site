---
title: WooCommerce 升级后编辑器显示异常、页面 404？Block Theme 排查指南
description: WooCommerce Block Theme 开发中块重命名导致 core/missing、修改 shop slug 后产品归档 404、模板 HTML 与 Gutenberg save 输出不匹配、Cart/Checkout 模板未自动分配，4 个常见故障的根因与解决方案。
date: 2026-04-17
tags: [WooCommerce, Block Theme, FSE, WordPress]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WooCommerce 升级后编辑器显示 core/missing 怎么办？"
    a: "WooCommerce 新版将内部块重命名，统一加了 -block 后缀。旧名称在编辑器中显示为 core/missing，需更新模板中的块注释名称。"
  - q: "修改 WooCommerce 商店页面 slug 后产品列表页 404？"
    a: "修改 slug 后必须执行 wp rewrite flush 刷新重写规则缓存，否则 WordPress 保留旧 slug 的路由映射。"
  - q: "WooCommerce Cart Block 模板页面显示空白？"
    a: "Cart 和 Checkout 是动态块，需要 PHP 实时渲染。确保模板 HTML 与 Gutenberg save 输出完全匹配，否则触发验证错误。"
---

在为客户构建 WooCommerce Block Theme 时遇到了这四个与 WooCommerce 相关的问题，每个都与 FSE 架构和 WooCommerce 的块系统有关。记录排查过程，帮助同样在做 WooCommerce 主题开发的同学避坑。

## TL;DR

四个 WooCommerce Block Theme 开发中的常见问题：**块重命名导致 core/missing**（升级后块名加了 -block 后缀）、**修改 shop slug 后产品归档 404**（rewrite 缓存未刷新）、**模板 HTML 与 Gutenberg save 不匹配**（动态块验证失败）、**Cart/Checkout 模板未自动分配**（需要手动指定）。每个场景给出可直接复用的修复方案。


<!-- truncate -->
## 场景一：WooCommerce 升级后编辑器出现 core/missing

### 问题现象

升级 WooCommerce 后，Site Editor 中多个块显示为 `core/missing`（Block Recovery 提示）。前端渲染看起来正常，但编辑器中无法编辑这些块。

### 根因

WooCommerce 在新版本中将多个内部块重命名，统一添加了 `-block` 后缀。例如：

| 旧名称 | 新名称 |
|--------|--------|
| `cart-order-summary-subtotal` | `cart-order-summary-subtotal-block` |
| `cart-order-summary-shipping` | `cart-order-summary-shipping-block` |
| `cart-order-summary-taxes` | `cart-order-summary-taxes-block` |
| `cart-order-summary-total` | `totals-block` |
| `proceed-to-checkout` | `proceed-to-checkout-block` |

如果你的模板或 Pattern 中使用了旧名称的块注释（如 `<!-- wp:woocommerce/cart-order-summary-subtotal -->`），Gutenberg 找不到对应的块注册，将其渲染为 `core/missing`。

前端渲染正常是因为 WooCommerce 的 PHP 回调函数仍然兼容旧名称，但编辑器依赖块的 JavaScript 注册信息，找不到就显示为 missing。

### 解决方案

**诊断**：在浏览器控制台确认已注册的块名称：

```javascript
wp.blocks.getBlockTypes()
  .map(b => b.name)
  .filter(n => n.includes('cart-order-summary'))
```

对比输出与模板中使用的名称，找出不一致的。

**修复**：批量替换模板和 Pattern 文件中的旧块名为新名称：

```bash
# 在主题目录下执行
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-subtotal/woocommerce\/cart-order-summary-subtotal-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-shipping/woocommerce\/cart-order-summary-shipping-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-taxes/woocommerce\/cart-order-summary-taxes-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/cart-order-summary-total/woocommerce\/totals-block/g' {} +
find . -name "*.html" -exec sed -i 's/woocommerce\/proceed-to-checkout/woocommerce\/proceed-to-checkout-block/g' {} +
```

替换后清理数据库中的模板缓存（见上一篇"修改不生效"场景），确保新名称生效。

<InfoBox variant="warning" title="注意事项">

- 升级 WooCommerce 前备份模板文件，块重命名通常出现在大版本升级中
- 前端渲染正常不代表没有问题，一定要在 Site Editor 中检查
- 订阅 WooCommerce 开发者 changelog，提前了解块名称变更

</InfoBox>

## 场景二：改了商店网址后，产品列表页打不开了

### 问题现象

修改了 WooCommerce 商店页面的 slug（如从 `/shop/` 改为 `/products/`），或修改了固定链接结构后，访问新的商店 URL 返回 404 或显示为普通页面（没有产品列表）。

### 根因

WordPress 的 Rewrite API 会在首次访问时将 URL 路由规则缓存到数据库中。修改页面 slug 后，缓存中的路由映射仍然指向旧 slug。新的 URL 没有对应的路由规则，WordPress 将其渲染为普通页面而非 WooCommerce 产品归档。

### 解决方案

修改 slug 或固定链接结构后，必须刷新 rewrite 缓存：

```bash
# 本地 Docker 环境
docker exec wp_cli wp rewrite flush --allow-root

# 服务器环境
ssh yougu-wp "docker exec prod_cli wp rewrite flush --allow-root"
```

一条命令即可解决。也可以在 WordPress 后台手动操作：**设置 → 固定链接 → 保存更改**，保存时会自动刷新 rewrite 规则。

<InfoBox variant="info" title="最佳实践">

任何涉及 URL 结构变更的操作（修改 slug、变更固定链接、新增自定义文章类型）之后，都应该执行 `wp rewrite flush`。建议在部署脚本中加入此命令，避免遗忘。

</InfoBox>

## 场景三：Cart/Checkout 块报验证错误

### 问题现象

WooCommerce 的 Cart、Checkout 等动态块在 Site Editor 中显示 Block validation failed。错误信息提示 Expected HTML 和 Actual HTML 不一致。

### 根因

WooCommerce 的许多块是服务端渲染（SSR）的动态块——前端内容由 PHP 实时生成，不依赖 JavaScript 的 `save()` 函数。但 Gutenberg 仍然要求模板 HTML 中的块标记与 `save()` 输出完全匹配。

如果模板中写的 HTML 与 Gutenberg 期望的输出不一致（多了或少了 class、style、内部元素），就会触发验证错误。

WooCommerce 常见块的 save 输出对照：

| 块 | save 输出 |
|----|----------|
| `product-price` | `<div class="is-loading"></div>` |
| `price-filter` | `<div class="wp-block-woocommerce-price-filter is-loading"><span aria-hidden="true" class="wc-block-product-categories__placeholder"></span></div>` |
| `woocommerce/cart` | `<div class="wp-block-woocommerce-cart alignwide is-loading"></div>` |
| `woocommerce/checkout` | `<div class="wp-block-woocommerce-checkout alignwide wc-block-checkout is-loading"></div>` |
| `cart-order-summary-*-block` | `<div class="wp-block-woocommerce-{block-name}"></div>` |
| `proceed-to-checkout-block` | `<div class="wp-block-woocommerce-proceed-to-checkout-block"></div>` |

### 解决方案

**关键规则**：

1. `html: false` 的块（save 返回 null，如 `core/query-pagination`）可以使用自闭合标签
2. JS save 返回 placeholder HTML 的块**禁止**自闭合，必须包含完整内容
3. `core/query-pagination` 禁止写 wrapper div，InnerBlocks 直接放在 open/close 注释之间

**排查流程**：

1. 打开 Site Editor，打开浏览器 DevTools Console
2. 找到 `Block validation failed` 日志
3. 对比 Expected（Gutenberg 生成）和 Actual（你的模板中写的）
4. 按上方表格修复 HTML

<InfoBox variant="warning" title="可忽略的验证错误">

以下 WooCommerce 验证错误可以安全忽略：

| 错误 | 说明 |
|------|------|
| `woocommerce/cart` 或 `woocommerce/checkout` 验证失败 | 动态块，PHP 实时渲染，前端显示正常 |
| `woocommerce-blocktheme-css` 加载错误 | WooCommerce 插件 CSS 问题，等待官方修复 |

</InfoBox>

## 场景四：自定义购物车/结算模板没生效

### 问题现象

创建了自定义的 Cart 或 Checkout 模板文件（如 `templates/cart.html`、`templates/checkout.html`），但对应的 WooCommerce 页面仍然使用默认模板。在 Site Editor 中能看到自定义模板，但它没有自动应用到 Cart/Checkout 页面。

### 根因

WooCommerce 的 Cart 和 Checkout 页面会**自动匹配**对应名称的模板。但如果匹配失败（如模板 slug 不完全对应，或页面创建顺序问题），就需要手动分配。

My Account 等依赖 shortcode 的页面**不会**自动匹配模板，必须手动分配。

### 解决方案

手动将模板分配给对应页面：

```bash
# 1. 查找 Cart 页面 ID
docker exec wp_cli wp post list --post_type=page --fields=ID,post_title,post_name --allow-root | grep -i cart

# 2. 分配模板
docker exec wp_cli wp post meta update <page_id> _wp_page_template <template_slug> --allow-root

# 示例：将 cart-block 模板分配给 Cart 页面
docker exec wp_cli wp post meta update 42 _wp_page_template cart-block --allow-root
```

验证分配结果：

```bash
docker exec wp_cli wp post meta get <page_id> _wp_page_template --allow-root
```

<InfoBox variant="info" title="模板命名建议">

确保模板文件名与 WooCommerce 页面功能对应。标准命名：
- `cart.html` 或 `cart-block.html` → Cart 页面
- `checkout.html` 或 `checkout-block.html` → Checkout 页面
- `single-product.html` → 产品详情页
- `archive-product.html` → 产品归档页（shop）

保持命名一致可以提高自动匹配的成功率。

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
