---
title: 解决 WooCommerce 与 FSE Block Theme 的 4 个 CSS 冲突
description: WooCommerce 静默覆盖 theme.json 字号预设、font-size class 连字符陷阱、contrast 颜色反转、ul.products 伪元素破坏 Grid 布局的根因与解法
date: 2026-04-01
tags: [WordPress, FSE, WooCommerce, CSS]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WooCommerce 安装后主题字号为什么全变了？"
    a: "WooCommerce 通过 WP_Theme_JSON_API 注册 small/medium/large/x-large 四个字号预设，覆盖 theme.json 中同名 slug 的值。用 h-1~h-6 等自定义 slug 可避免冲突。"
  - q: "FSE 模板手写 has-h1-font-size 为什么字号不对？"
    a: "Gutenberg 渲染 fontSize:h1 slug 生成 has-h-1-font-size（带连字符），这是 theme.json 的正确值。无连字符的 has-h1-font-size 匹配的是 WooCommerce 覆盖值。手写 HTML 必须用带连字符版本。"
  - q: "WooCommerce 商品列表用 CSS Grid 为什么卡片错位？"
    a: "WooCommerce 在 ul.products 上注入 ::before/::after 伪元素（clear:both），CSS Grid 把它们当作 grid items。解法：ul.products 设置 grid 后，对伪元素 display:none。"
---

在为客户开发 WordPress FSE Block Theme 并集成 WooCommerce 时，遇到 4 个 WooCommerce 静默篡改主题样式的陷阱。每个都很隐蔽，排查耗时。记录根因与解法，帮助同样开发 FSE + WooCommerce 主题的开发者避坑。

## TL;DR

1. **字号预设覆盖**：WooCommerce 注册 `small/medium/large/x-large` 四个预设覆盖 theme.json，用 `h-1~h-6` 自定义 slug 规避
2. **font-size class 连字符**：`has-h-1-font-size`(48px) vs `has-h1-font-size`(20px)，手写 HTML 必须带连字符
3. **contrast 颜色反转**：`--wp--preset--color--contrast` 被 WooCommerce 改为浅色（#f8fafc），白色文字完全不可见
4. **ul.products 伪元素**：WooCommerce 注入 `::before/::after` 破坏 CSS Grid 布局，需 `display:none` 清除


<!-- truncate -->
## 陷阱一：字号预设被覆盖

### 问题现象

在 theme.json 中定义了字号预设：

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

安装 WooCommerce 后，使用 `has-large-font-size` 的段落实际渲染为 **36px**，而非预期的 18px。H1 标题也可能从 48px 缩水到 20px。

### 根因

WooCommerce 通过 `WP_Theme_JSON_API` 注册自己的字号预设：

| slug | theme.json 原值 | WooCommerce 覆盖值 |
|------|----------------|-------------------|
| small | 0.875rem (14px) | 13px |
| medium | 1rem (16px) | 20px |
| large | 1.125rem (18px) | 36px |
| x-large | 1.25rem (20px) | 42px |

同 slug 的预设会被 WooCommerce 的值覆盖。但自定义 slug（如 `h-1`~`h-6`、`base`）不受影响。

### 解法

**theme.json 使用自定义 slug，避免与 WooCommerce 冲突：**

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

模板中用 `has-h-5-font-size` 代替 `has-large-font-size`。

如果需要用到 WooCommerce 的字号值，在 `woocommerce.css` 顶部定义自定义变量：

```css
:root {
  --cclee-font-sm: 13px;
  --cclee-font-md: 20px;
  --cclee-font-lg: 36px;
  --cclee-font-xl: 42px;
}
```

## 陷阱二：font-size class 的连字符陷阱

### 问题现象

手写 FSE 模板 HTML 时，H1 标题只显示 20px 而非 theme.json 定义的 48px：

```html
<!-- 错误：渲染为 20px -->
<h1 class="has-h1-font-size">标题</h1>

<!-- 正确：渲染为 48px -->
<h1 class="has-h-1-font-size">标题</h1>
```

两个 class 只差一个连字符，但字号差 2.4 倍。

### 根因

Gutenberg 将 `fontSize: "h1"` slug 渲染为 `has-h-1-font-size`（slug 中的数字前加连字符）。这是正确行为。

但当 WooCommerce 覆盖了字号系统后，`has-h1-font-size`（无连字符）匹配到的是 WooCommerce 的覆盖值（20px），而 `has-h-1-font-size`（有连字符）匹配到 theme.json 原始值（48px）。

验证方法 -- 浏览器控制台：

```javascript
// 创建临时元素测试
const el = document.createElement('div');
document.body.appendChild(el);

el.className = 'has-h1-font-size';
console.log('无连字符:', getComputedStyle(el).fontSize); // 20px（错误）

el.className = 'has-h-1-font-size';
console.log('有连字符:', getComputedStyle(el).fontSize); // 48px（正确）

document.body.removeChild(el);
```

### 解法

**手写 FSE 模板 HTML 时，font-size class 必须带连字符：**

```html
<!-- wp:heading {"fontSize":"h1"} -->
<h1 class="has-h-1-font-size">标题</h1>
<!-- /wp:heading -->

<!-- wp:heading {"fontSize":"h3"} -->
<h2 class="has-h-3-font-size">区块标题</h2>
<!-- /wp:heading -->
```

规则：`has-h-{N}-font-size`（带连字符），适用于所有 h-* 预设。

## 陷阱三：contrast 颜色反转

### 问题现象

在 `contrast` 背景色上使用 `base`（白色）文字，发现文字完全不可见：

```html
<div class="has-contrast-background-color">
  <h2 class="has-base-color">白色标题在深色背景上</h2>
</div>
```

预期 contrast 是深色背景 + 白色文字，实际 contrast 是浅色背景。

### 根因

WooCommerce 将 `--wp--preset--color--contrast` 注册为 `#f8fafc`（极浅灰），不是深色。这是 WooCommerce 的设计意图（其默认主题用 contrast 做浅色背景区域），但与大多数 FSE 主题的 contrast 语义（深色）冲突。

### 解法

**contrast 背景上用 `primary`（深色）作为文字颜色：**

```html
<div class="has-contrast-background-color">
  <h2 class="has-primary-color has-text-color">深色标题在浅色背景上</h2>
</div>
```

或者在 theme.json 中定义自己的深色 preset（如 `surface`），不依赖 `contrast`：

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

## 陷阱四：ul.products 伪元素破坏 Grid 布局

### 问题现象

WooCommerce 商品列表使用 CSS Grid 布局时，卡片排列错位、多出空白格：

```css
ul.products {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
```

预期 3 列等宽，实际出现空位，部分卡片换到下一行。

### 根因

WooCommerce 在 `ul.products` 上注入了 `::before` 和 `::after` 伪元素：

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

这些伪元素是为传统 float 布局设计的 clearfix。但 CSS Grid 把伪元素当作 grid items，占用了两个隐式格子位。

### 解法

**对 Grid 布局的 ul.products 隐藏伪元素：**

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

<InfoBox variant="warning" title="注意事项">

- 每个陷阱都与 WooCommerce 的 `WP_Theme_JSON_API` 注册或 CSS 注入有关，禁用 WooCommerce 后这些覆盖会消失
- 陷阱一和二是联动的：WooCommerce 覆盖字号预设后，连字符和无连字符的 class 映射到不同值
- 陷阱三的 contrast 值取决于 WooCommerce 版本，升级后可能变化，建议用自定义 slug（如 `surface`）代替
- 手写 FSE 模板前，先用浏览器 DevTools 检查 Gutenberg 自动渲染的 class 名称，不要想当然地缩写

</InfoBox>


<div className="my-8 p-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-center">
  <div className="text-lg font-semibold mb-1">正在部署 WooCommerce 站点？</div>
  <div className="text-sm text-gray-500 mb-4">推荐以下云服务器，稳定可靠</div>
  <div className="flex flex-wrap justify-center gap-4">
    <a href="https://www.aliyun.com/minisite/goods?userCode=fvyejhr0" className="button button--primary button--lg" target="_blank" rel="noopener noreferrer">阿里云（国内站）</a>
    <a href="https://www.vultr.com/?ref=9811050" className="button button--secondary button--lg" target="_blank" rel="noopener noreferrer">Vultr（海外站）</a>
  </div>
</div>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>

