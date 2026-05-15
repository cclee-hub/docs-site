---
title: CCLEE Docusaurus Theme — Open Source Documentation Theme
description: Open-source documentation theme based on Docusaurus 3.x with purple theme, dark mode, and Tailwind CSS, production-ready out of the box
project: cclee-docusaurus-theme
schema: Article
date: 2026-04-29
rag: true
rag_tags: ["Docusaurus", "Open Source", "Documentation Theme"]
---

# CCLEE Docusaurus Theme

[Live Demo](https://ccleeai.com) · [中文](https://ccleeai.com)

<FeatureCard title="Out of the Box">
Based on Docusaurus 3.x with integrated purple theme, dark mode, and Tailwind CSS. Clone and configure to get started.
</FeatureCard>

## Features

### Purple Theme + Dark Mode

CSS variable-based color system:

- **Light mode**: #4C1D95 as primary
- **Dark mode**: #8B5CF6 as primary, WCAG AA compliant (≥4.5:1 contrast)

### Tailwind CSS Integration

Docusaurus doesn't support Tailwind natively. This theme provides integration:

```bash
npm install tailwindcss postcss autoprefixer @tailwindcss/typography
```

Add to `src/css/custom.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Custom MDX Components

Globally registered — use directly in any `.md/.mdx` file without imports:

| Component | Purpose |
|-----------|---------|
| `FeatureCard` | Feature card |
| `InfoBox` | Info/warning/success callouts |
| `ComparisonTable` | Feature comparison tables |
| `StepBox` | Step containers |

### SEO Automation

`plugins/plugin-json-ld.js` handles structured data automatically:

- Frontmatter `schema: Article | HowTo | FAQPage` maps to Schema.org types
- Automatic hreflang tags

### Internationalization

Dual-language routing out of the box:

```bash
npm run start          # Chinese site
SITE=ai npm run start  # English site
```

## Tech Stack

| Technology | Version |
|-----------|---------|
| Docusaurus | 3.9+ |
| React | 18.3+ |
| Tailwind CSS | 3.4+ |
| TypeScript | 5.7+ |
| Node.js | ≥20.0 |

## Quick Start

### Option 1: Fork the Project

```bash
git clone https://github.com/cclee-hub/docs-site
cd docs-site
npm install
npm run start
```

### Option 2: Integrate into Existing Project

```
src/css/custom.css          → your-project/src/css/
src/theme/MDXComponents.tsx → your-project/src/theme/
tailwind.config.js          → your-project root/
```

```bash
npm install tailwindcss postcss autoprefixer @tailwindcss/typography
```

### Configure Theme Colors

Edit CSS variables in `src/css/custom.css`:

```css
:root {
  --ifm-color-primary: #4C1D95;
}
[data-theme='dark'] {
  --ifm-color-primary: #8B5CF6;
}
```

## Project Structure

```
docs-site/
├── docs/                    # Chinese docs
├── i18n/en/                 # English translations
├── src/
│   ├── components/          # React components
│   ├── css/custom.css       # Tailwind + styles
│   └── theme/               # Theme overrides
├── plugins/
│   └── plugin-json-ld.js    # SEO plugin
└── tailwind.config.js       # Tailwind config
```

## Next Steps

- [CCLEE Theme](/docs/cclee-theme) — WordPress FSE block theme
- [CCLEE Toolkit](/docs/cclee-toolkit) — WordPress AI enhancement plugin
- [GitHub Repository](https://github.com/cclee-hub/docs-site) — View source

<InfoBox variant="success" title="Open Source & Free">
MIT license. Free for personal and commercial use.
</InfoBox>

## Changelog

<!-- truncate -->

| Date | Update |
|------|--------|
| 2026-04-29 | Initial release of CCLEE Docusaurus Theme documentation |

<details>
<summary>View full update history</summary>

- **2026-04-29** — Initial release

</details>
