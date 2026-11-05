---
title: Docusaurus 中使用 require 引入静态图片资源
description: 解决 Docusaurus 图片路径在构建时 404 的问题，使用 require 确保图片被正确打包
date: 2026-03-01
tags: [Docusaurus, Webpack, 构建问题]
authors: [cclee]
schema: Article
---

## TL;DR

在 Docusaurus 组件中使用 `/images/xxx.png` 直接引用图片，构建后可能 404。改用 `require('@site/static/images/xxx.png').default` 可确保图片被 Webpack 正确打包。

<!-- truncate -->

## 问题现象

开发环境下图片正常显示：

```jsx
<img width="560" src="/images/plugin-sidebar-ecommerce.webp" alt="screenshot" />
```

但构建部署后图片返回 404，因为 `static/` 目录下的文件路径处理方式不同。

## 根因

Docusaurus 基于 Webpack/Rspack 构建：

- `/images/xxx.png` 是静态路径，Webpack 不会处理
- `require('@site/static/images/xxx.png')` 会被 Webpack 解析并打包到输出目录

`@site` 是 Docusaurus 提供的路径别名，指向项目根目录。`static/` 目录的文件会被复制到构建输出的根目录，但通过 `require` 引入可以触发 Webpack 的资源处理流程。

## 解决方案

使用 require 引入图片：

```jsx
<img width="560"
  src={require('@site/static/images/plugin-sidebar-ecommerce.webp').default}
  alt="screenshot"
  className="w-full h-full object-cover"
/>
```

路径说明：
- `@site` → 项目根目录
- `/static/images/xxx.png` → static 目录下的图片

require 返回的对象中 `.default` 是图片的最终 URL。

## FAQ

### Q: 为什么开发环境正常，生产构建后 404？

A: 开发服务器会自动服务 static 目录文件，但生产构建时文件路径可能因 base URL 配置而变化。require 方式让 Webpack 自动处理路径。

### Q: 能不能用 import 导入图片？

A: 可以。`import img from '@site/static/images/xxx.png'` 然后使用 `<img src={img} />`，效果与 require 相同。require 适合动态场景或不想在文件顶部声明的情况。
