# CCLEE Docusaurus Theme

An open-source documentation theme for Docusaurus 3.x with integrated purple branding, dark mode, and Tailwind CSS typography enhancements.

[Live Demo](https://ccleeai.com) · [English Demo](https://aidevhub.ai)

---

## Features

### Purple Theme + Dark Mode

CSS variable-based color system with brand purple as primary color:

- **Light mode**: `#4C1D95` as primary
- **Dark mode**: `#8B5CF6` as primary, WCAG AA compliant (≥4.5:1 contrast)
- One-click toggle, automatic style adaptation

### Tailwind CSS Integration

Unlike vanilla Docusaurus, this theme includes Tailwind with:

- All Tailwind utility classes available in MDX
- `@tailwindcss/typography` for optimized prose styling
- Custom `tailwind.config.js` with purple color palette and entrance animations
- Dark mode via `data-theme` attribute selector (not class-based)

### Custom MDX Components

Globally registered components in `MDXComponents.tsx` — use directly in any `.md/.mdx` file without imports:

| Component | Purpose |
|-----------|---------|
| `FeatureCard` | Feature highlights with icon support |
| `InfoBox` | Info/warning/success callouts |
| `ComparisonTable` | Feature comparison tables |
| `StepBox` | Step-by-step containers |
| `ProcessStep` | Process flow steps |

### SEO Automation

`plugins/plugin-json-ld.js` handles structured data automatically:

- **Frontmatter-driven**: `schema: Article | HowTo | FAQPage` maps to Schema.org types
- **Automatic JSON-LD**: Each page gets appropriate structured data
- **hreflang management**: Automatic cross-language linking between zh/en sites

### Internationalization

Native Docusaurus i18n with dual-site routing:

```bash
npm run start          # Chinese site → ccleeai.com
SITE=ai npm run start  # English site → aidevhub.ai
```

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Docusaurus | 3.9+ | Documentation framework |
| React | 18.3+ | UI components |
| Tailwind CSS | 3.4+ | Utility-first styling |
| TypeScript | 5.7+ | Type safety |
| @tailwindcss/typography | latest | Prose optimization |
| Node.js | ≥20.0 | Runtime |

---

## Quick Start

### Option 1: Use as a Template

```bash
# Fork or clone the repository
git clone https://github.com/cclee-hub/docs-site
cd docs-site

# Install dependencies
npm install

# Start development server
npm run start
```

### Option 2: Integrate into Existing Project

Copy these files to your Docusaurus project:

```
src/css/custom.css    → your project src/css/
src/theme/MDXComponents.tsx → your project src/theme/
tailwind.config.js   → your project root/
```

Then install Tailwind:

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

---

## Project Structure

```
docs-site/
├── docs/                          # Product documentation (zh)
├── i18n/en/                       # English translations
│   └── docusaurus-plugin-content-docs/current/
├── src/
│   ├── components/               # React components
│   │   ├── FeatureCard.tsx
│   │   ├── InfoBox.tsx
│   │   ├── ComparisonTable.tsx
│   │   └── StepBox.tsx
│   ├── css/custom.css            # Tailwind + custom styles
│   └── theme/                    # Docusaurus theme overrides
├── plugins/
│   └── plugin-json-ld.js         # SEO automation plugin
├── tailwind.config.js            # Tailwind configuration
└── docusaurus.config.ts         # Docusaurus configuration
```

---

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run start` | Start dev server (Chinese) |
| `SITE=ai npm run start` | Start dev server (English) |
| `npm run build` | Build for production |
| `npm run build:ren` | Build for ccleeai.com |
| `npm run build:ai` | Build for aidevhub.ai (Vercel) |

---

## License

MIT License. Free for personal and commercial use.

---

## About the Author

- [Chinese Site](https://ccleeai.com/about)
- [English Site](https://aidevhub.ai/about)
- [Upwork](https://www.upwork.com/freelancers/~010ab5ec29d8f4ff3f)
- [LinkedIn](https://www.linkedin.com/in/cc-lee-9b0b113bb/)

---

## Contributing

Contributions welcome. Please submit issues or pull requests on [GitHub](https://github.com/cclee-hub/docs-site).
