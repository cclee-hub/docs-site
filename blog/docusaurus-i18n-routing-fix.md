---
title: 修复 Docusaurus 英文版页面链接丢失语言前缀问题
description: 解决 Docusaurus 国际化网站中，英文版页面使用绝对路径链接跳转到中文版的问题，使用 Link 组件和相对路径修复。
date: 2026-03-03
tags: [Docusaurus, i18n, Bug修复]
schema: Article
---

## TL;DR

在 Docusaurus i18n 网站中，使用 `<a href="/docs/xxx">` 绝对路径会在英文版页面跳转到中文版。解决方案：页面内链接用 `<Link to="/docs/xxx">`，MD 文档内用相对路径 `./xxx`。

## 问题现象

Docusaurus 配置了中英文双语（默认语言中文），在英文版页面（`/en/` 路径下）点击导航或文档链接，URL 变成了 `/docs/xxx` 而不是 `/en/docs/xxx`，导致跳回中文版。

```typescript
// 问题代码：首页 Footer 链接
<a href="/docs/ai-analytics">AI分析</a>
// 英文版点击后跳转到 /docs/ai-analytics（中文）
// 而不是 /en/docs/ai-analytics（英文）
```

## 根因

Docusaurus 的 i18n 路由机制：
1. `<a>` 标签的 `href` 是原生 HTML，不会自动添加语言前缀
2. `@docusaurus/Link` 组件会自动处理当前语言环境，添加 `/en/` 前缀
3. MD/MDX 文档中的 `[text](/docs/xxx)` 同样是绝对路径，不会自动国际化

## 解决方案

### 方法 1：页面组件中使用 Link 组件

将 `<a>` 替换为 `<Link>`：

```tsx
// ❌ 错误
<a href="/docs/ai-analytics">AI分析</a>

// ✅ 正确
import Link from '@docusaurus/Link';

<Link to="/docs/ai-analytics">AI分析</Link>
```

**Footer 组件修复示例**：

```tsx
import Link from '@docusaurus/Link';

// 导航链接配置
const links = [
  { href: '/docs/ai-analytics', label: 'AI分析' },
  { href: '/docs/browser-plugin', label: '浏览器插件' },
];

// 渲染
{links.map((link) => (
  <Link to={link.href} key={link.href}>
    {link.label}
  </Link>
))}
```

### 方法 2：MD 文档中使用相对路径

在 i18n/en 目录下的 MD 文档中，使用相对路径：

```markdown
<!-- ❌ 错误：绝对路径会跳到默认语言 -->
查看 [浏览器插件](/docs/browser-plugin) 了解更多。

<!-- ✅ 正确：相对路径保持在当前语言 -->
查看 [浏览器插件](./browser-plugin) 了解更多。
```

**路径规则**：
- 同级文档：`./filename`
- 上级目录：`../filename`
- 子目录：`./subdir/filename`

### 方法 3：使用 Translate 组件的 id 链接

如果链接文本需要翻译：

```tsx
import Translate from '@docusaurus/Translate';

<Link to="/docs/ai-analytics">
  <Translate id="footer.aiAnalytics">AI分析</Translate>
</Link>
```

## 验证修复

1. 启动开发服务器：`npm run start -- --locale en`
2. 打开 `http://localhost:3000/en/`
3. 点击页面链接，确认 URL 保持在 `/en/` 前缀下

## FAQ

### Q: 为什么 `<a>` 标签不能自动处理语言前缀？

A: `<a href>` 是原生 HTML 属性，Docusaurus 无法在构建时重写所有 href。`<Link>` 是 React 组件，可以在运行时根据 `i18n.currentLocale` 自动添加前缀。

### Q: MDX 组件中可以用 Link 吗？

A: 可以。MDX 支持导入组件：

```mdx
import Link from '@docusaurus/Link';

<Link to="/docs/xxx">链接文本</Link>
```

### Q: external 外部链接怎么办？

A: 外部链接使用 `<a>` 标签，加上 `target="_blank"`：

```tsx
<a href="https://github.com" target="_blank" rel="noopener noreferrer">
  GitHub
</a>
```
