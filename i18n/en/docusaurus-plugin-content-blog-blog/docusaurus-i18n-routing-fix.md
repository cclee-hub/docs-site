---
title: Fix Docusaurus i18n Links Losing Language Prefix
description: Solve the issue where absolute path links in English pages redirect to Chinese version. Use Link component and relative paths to fix i18n routing.
date: 2026-03-03
tags: [Docusaurus, i18n, Bug Fix]
schema: Article
---

## TL;DR

In Docusaurus i18n sites, using `<a href="/docs/xxx">` absolute paths in English pages redirects to Chinese. Solution: Use `<Link to="/docs/xxx">` for page components, and relative paths `./xxx` in MD documents.

## The Problem

Docusaurus configured with Chinese (default) and English. On English pages (`/en/` path), clicking navigation or doc links changes URL to `/docs/xxx` instead of `/en/docs/xxx`, redirecting back to Chinese.

```typescript
// Problem code: Footer link on homepage
<a href="/docs/ai-analytics">AI Analytics</a>
// English version clicks to /docs/ai-analytics (Chinese)
// Instead of /en/docs/ai-analytics (English)
```

## Root Cause

Docusaurus i18n routing mechanism:
1. `<a>` tag's `href` is native HTML, doesn't auto-add language prefix
2. `@docusaurus/Link` component handles current locale, adds `/en/` prefix
3. `[text](/docs/xxx)` in MD/MDX docs is also absolute path, no auto-i18n

## Solution

### Method 1: Use Link Component in Page Components

Replace `<a>` with `<Link>`:

```tsx
// ❌ Wrong
<a href="/docs/ai-analytics">AI Analytics</a>

// ✅ Correct
import Link from '@docusaurus/Link';

<Link to="/docs/ai-analytics">AI Analytics</Link>
```

**Footer component fix example**:

```tsx
import Link from '@docusaurus/Link';

// Navigation links config
const links = [
  { href: '/docs/ai-analytics', label: 'AI Analytics' },
  { href: '/docs/browser-plugin', label: 'Browser Plugin' },
];

// Render
{links.map((link) => (
  <Link to={link.href} key={link.href}>
    {link.label}
  </Link>
))}
```

### Method 2: Use Relative Paths in MD Documents

In MD documents under `i18n/en/` directory, use relative paths:

```markdown
<!-- ❌ Wrong: absolute path goes to default locale -->
See [Browser Plugin](/docs/browser-plugin) for more.

<!-- ✅ Correct: relative path stays in current locale -->
See [Browser Plugin](./browser-plugin) for more.
```

**Path rules**:
- Same level: `./filename`
- Parent directory: `../filename`
- Subdirectory: `./subdir/filename`

### Method 3: Use Translate Component with Links

If link text needs translation:

```tsx
import Translate from '@docusaurus/Translate';

<Link to="/docs/ai-analytics">
  <Translate id="footer.aiAnalytics">AI Analytics</Translate>
</Link>
```

## Verify Fix

1. Start dev server: `npm run start -- --locale en`
2. Open `http://localhost:3000/en/`
3. Click page links, confirm URL stays under `/en/` prefix

## FAQ

### Q: Why doesn't `<a>` tag auto-handle language prefix?

A: `<a href>` is native HTML attribute. Docusaurus can't rewrite all hrefs at build time. `<Link>` is a React component that can add prefix at runtime based on `i18n.currentLocale`.

### Q: Can I use Link in MDX components?

A: Yes. MDX supports component imports:

```mdx
import Link from '@docusaurus/Link';

<Link to="/docs/xxx">Link Text</Link>
```

### Q: What about external links?

A: Use `<a>` tag with `target="_blank"` for external links:

```tsx
<a href="https://github.com" target="_blank" rel="noopener noreferrer">
  GitHub
</a>
```
