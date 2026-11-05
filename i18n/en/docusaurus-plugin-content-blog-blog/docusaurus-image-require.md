---
title: Using require to Import Static Images in Docusaurus
description: Fix Docusaurus image 404 issues after build by using require to ensure images are properly bundled by Webpack
date: 2026-03-01
tags: [Docusaurus, Webpack, Build Issue]
schema: Article
---

## TL;DR

Using `/images/xxx.png` directly in Docusaurus components works in dev but may return 404 after build. Use `require('@site/static/images/xxx.png').default` to ensure images are properly bundled by Webpack.

<!-- truncate -->

## Problem

Images display normally in development:

```jsx
<img width="560" src="/images/plugin-sidebar-ecommerce.webp" alt="screenshot" />
```

But return 404 after deployment because files in the `static/` directory are handled differently.

## Root Cause

Docusaurus is built on Webpack/Rspack:

- `/images/xxx.png` is a static path, Webpack won't process it
- `require('@site/static/images/xxx.png')` is parsed and bundled by Webpack

`@site` is a path alias provided by Docusaurus pointing to the project root. Files in `static/` are copied to the build output root, but using `require` triggers Webpack's asset processing pipeline.

## Solution

Use require to import images:

```jsx
<img width="560"
  src={require('@site/static/images/plugin-sidebar-ecommerce.webp').default}
  alt="screenshot"
  className="w-full h-full object-cover"
/>
```

Path explanation:
- `@site` → project root directory
- `/static/images/xxx.png` → image in static directory

The `.default` property in the returned object is the final URL of the image.

## FAQ

### Q: Why does it work in dev but 404 in production?

A: Dev server automatically serves static directory files, but production build paths may vary due to base URL configuration. require lets Webpack handle the path automatically.

### Q: Can I use import for images?

A: Yes. `import img from '@site/static/images/xxx.png'` then use `<img src={img} />` - same effect as require. require is better for dynamic scenarios or when you don't want top-level declarations.
