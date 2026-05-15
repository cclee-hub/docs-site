---
title: 修复 Tailwind Preflight 重置 Docusaurus 面包屑样式
description: Tailwind Preflight 会重置 ul 元素的 list-style、margin、padding，导致 Docusaurus 面包屑显示异常，需要 CSS 覆盖修复
date: 2026-03-16
tags: [docs-site, Docusaurus, Tailwind, CSS]
authors: [cclee]
---

## TL;DR

Docusaurus 引入 Tailwind 后，Preflight 的 CSS Reset 会重置 `<ul>` 元素的 `list-style`、`margin`、`padding`，导致面包屑导航样式丢失。解决方法是在 `custom.css` 中添加显式覆盖样式。


<!-- truncate -->
## 问题现象

在 Docusaurus 项目中引入 Tailwind CSS 后，文档页的面包屑导航（Breadcrumbs）样式异常：

- 列表样式丢失（`list-style` 被重置为 `none`）
- 间距消失（`margin`、`padding` 被重置为 0）
- 布局可能错乱（`display` 可能被影响）

查看浏览器开发者工具，发现 `.breadcrumbs` 的计算样式中，这些属性被 Preflight 重置：

```css
/* Tailwind Preflight 重置 */
ul, ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
```

## 根因

**Tailwind Preflight** 是一套基于 modern-normalize 的 CSS Reset，它在 `@tailwind base` 阶段注入，目的是提供一致的跨浏览器样式基准。

问题在于：Docusaurus 的 `.breadcrumbs` 组件使用 `<ul>` 元素，依赖浏览器默认的 flex 布局和间距。Preflight 的重置规则优先级较高，覆盖了 Docusaurus 的默认样式。

由于 Preflight 是全局注入的，任何使用 `<ul>`/`<ol>` 的第三方组件都可能受影响。

## 解决方案

在 `src/css/custom.css` 中添加显式覆盖样式，使用 `!important` 确保优先级：

```css
/* ========== Breadcrumbs 面包屑 ========== */
.theme-doc-breadcrumbs {
  margin-bottom: 1.5rem;
}

.breadcrumbs {
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.breadcrumbs__item {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
}
```

**关键点**：

1. `.breadcrumbs` 使用 `display: flex !important` 确保水平布局
2. `list-style: none` 是预期行为（面包屑不需要圆点）
3. `.breadcrumbs__item` 添加 `gap: 0.5rem` 控制元素间距

## FAQ

### Q: 为什么需要 !important？

Tailwind Preflight 在 `@tailwind base` 阶段注入，其选择器权重可能与 Docusaurus 默认样式相当。使用 `!important` 可以确保自定义样式生效，避免优先级战争。

### Q: 除了面包屑，还有哪些组件可能受影响？

任何使用 `<ul>`/`<ol>` 的组件都可能受影响，例如：
- 导航菜单
- 分页组件
- 自定义列表

检查方法：在浏览器开发者工具中搜索 `list-style: none` 的来源，确认是否来自 Preflight。

### Q: 可以禁用 Preflight 吗？

可以，但不推荐。在 `tailwind.config.js` 中设置：

```js
module.exports = {
  corePlugins: {
    preflight: false,
  },
}
```

禁用后需要自行处理跨浏览器样式一致性，可能导致更多问题。
