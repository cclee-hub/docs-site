---
title: 在 Docusaurus 中配置多个博客实例
description: Docusaurus 支持多个博客实例，本文介绍如何配置技术博客 + 案例展示两套独立的博客系统，各自拥有独立的路由和标签管理。
date: 2026-03-03
tags: [Docusaurus, 博客配置]
schema: Article
---

## TL;DR

在 `plugins` 数组中添加多个 `@docusaurus/plugin-content-blog` 实例，每个实例使用不同的 `id`、`path` 和 `routeBasePath` 即可实现多个独立博客。

## 问题现象

官网需要一个技术博客（发布开发技巧）+ 一个案例展示（展示项目成果），两者内容风格不同，需要独立的列表页、标签页和路由。Docusaurus 默认只支持一个博客，怎么办？

## 根因

Docusaurus 的 `@docusaurus/preset-classic` 预设只包含一个博客实例。要实现多博客，需要：
1. 禁用预设中的默认博客
2. 手动添加多个博客插件实例

## 解决方案

### 步骤 1：禁用预设中的默认博客

在 `presets` 配置中设置 `blog: false`：

```typescript
presets: [
  [
    'classic',
    {
      docs: {
        sidebarPath: './sidebars.ts',
      },
      blog: false, // 禁用默认博客
      theme: {
        customCss: './src/css/custom.css',
      },
    },
  ],
],
```

### 步骤 2：添加多个博客插件实例

在 `plugins` 数组中配置：

```typescript
plugins: [
  // 技术博客
  [
    '@docusaurus/plugin-content-blog',
    {
      id: 'blog',
      path: 'blog',
      routeBasePath: 'blog',
    },
  ],
  // 案例博客
  [
    '@docusaurus/plugin-content-blog',
    {
      id: 'cases-blog',
      path: 'cases-blog',
      routeBasePath: 'cases',
      blogTitle: '项目案例',
      blogDescription: '真实交付案例展示',
      postsPerPage: 10,
      tagsBasePath: 'cases-tags',
      archiveBasePath: null, // 禁用归档
      authorsMapPath: 'authors.yaml',
    },
  ],
],
```

### 关键配置说明

| 参数 | 说明 |
|------|------|
| `id` | 插件实例唯一标识，必须不同 |
| `path` | Markdown 文件存放目录 |
| `routeBasePath` | URL 路由前缀，如 `/cases` |
| `tagsBasePath` | 标签页路由，默认 `tags` |
| `archiveBasePath` | 归档页路由，设为 `null` 禁用 |
| `authorsMapPath` | 作者定义文件路径 |

### 步骤 3：创建目录结构

```
docs-site/
├── blog/                    # 技术博客
│   ├── 2024-01-01-hello.md
│   └── authors.yml
├── cases-blog/              # 案例博客
│   ├── 2024-01-01-project-a.mdx
│   └── authors.yaml
└── docusaurus.config.ts
```

### 步骤 4：添加导航链接

在 `themeConfig.navbar.items` 中添加入口：

```typescript
navbar: {
  items: [
    { to: '/blog', label: '博客', position: 'left' },
    { to: '/cases', label: '案例', position: 'left' },
  ],
},
```

## FAQ

### Q: 两个博客可以共用 authors.yml 吗？

A: 可以，但需要两个实例都设置相同的 `authorsMapPath`。建议分开管理，各自独立。

### Q: 如何为第二个博客添加国际化？

A: 在 `i18n/{locale}/docusaurus-plugin-content-blog-{id}/` 目录下创建翻译文件。例如 `i18n/en/docusaurus-plugin-content-blog-cases-blog/`。

### Q: 可以有三个以上的博客吗？

A: 可以，继续添加插件实例即可。但建议控制数量，避免网站结构过于复杂。

### Q: 多博客会影响构建速度吗？

A: 会有影响，但 Docusaurus 3.x 的 Rspack 构建已经很快，通常不是问题。
