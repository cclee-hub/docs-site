---
title: Configure Multiple Blog Instances in Docusaurus
description: Docusaurus supports multiple blog instances. Learn how to set up a tech blog + case studies with independent routes and tag management.
date: 2026-03-03
tags: [Docusaurus, Blog Config]
schema: Article
---

## TL;DR

Add multiple `@docusaurus/plugin-content-blog` instances in the `plugins` array, each with different `id`, `path`, and `routeBasePath`.

## The Problem

Your website needs a tech blog (for development tips) + a case studies section (for project showcases). Different content styles require independent list pages, tag pages, and routes. Docusaurus only supports one blog by default—what to do?

## Root Cause

The `@docusaurus/preset-classic` preset only includes one blog instance. To have multiple blogs:
1. Disable the default blog in preset
2. Manually add multiple blog plugin instances

## Solution

### Step 1: Disable Default Blog in Preset

Set `blog: false` in `presets` config:

```typescript
presets: [
  [
    'classic',
    {
      docs: {
        sidebarPath: './sidebars.ts',
      },
      blog: false, // Disable default blog
      theme: {
        customCss: './src/css/custom.css',
      },
    },
  ],
],
```

### Step 2: Add Multiple Blog Plugin Instances

Configure in `plugins` array:

```typescript
plugins: [
  // Tech blog
  [
    '@docusaurus/plugin-content-blog',
    {
      id: 'blog',
      path: 'blog',
      routeBasePath: 'blog',
    },
  ],
  // Cases blog
  [
    '@docusaurus/plugin-content-blog',
    {
      id: 'cases-blog',
      path: 'cases-blog',
      routeBasePath: 'cases',
      blogTitle: 'Case Studies',
      blogDescription: 'Real project showcases',
      postsPerPage: 10,
      tagsBasePath: 'cases-tags',
      archiveBasePath: null, // Disable archive
      authorsMapPath: 'authors.yaml',
    },
  ],
],
```

### Key Configuration Options

| Option | Description |
|--------|-------------|
| `id` | Unique plugin instance identifier |
| `path` | Directory for Markdown files |
| `routeBasePath` | URL route prefix, e.g., `/cases` |
| `tagsBasePath` | Tags page route, default `tags` |
| `archiveBasePath` | Archive page route, `null` to disable |
| `authorsMapPath` | Authors definition file path |

### Step 3: Create Directory Structure

```
docs-site/
├── blog/                    # Tech blog
│   ├── 2024-01-01-hello.md
│   └── authors.yml
├── cases-blog/              # Cases blog
│   ├── 2024-01-01-project-a.mdx
│   └── authors.yaml
└── docusaurus.config.ts
```

### Step 4: Add Navigation Links

Add entries in `themeConfig.navbar.items`:

```typescript
navbar: {
  items: [
    { to: '/blog', label: 'Blog', position: 'left' },
    { to: '/cases', label: 'Cases', position: 'left' },
  ],
},
```

## FAQ

### Q: Can two blogs share authors.yml?

A: Yes, but both instances need the same `authorsMapPath`. Recommend keeping them separate for independence.

### Q: How to add i18n for the second blog?

A: Create translation files in `i18n/{locale}/docusaurus-plugin-content-blog-{id}/`. For example: `i18n/en/docusaurus-plugin-content-blog-cases-blog/`.

### Q: Can I have more than two blogs?

A: Yes, just add more plugin instances. But keep the number reasonable to avoid complex site structure.

### Q: Will multiple blogs slow down build?

A: Some impact, but Docusaurus 3.x with Rspack is fast enough that this is rarely an issue.
