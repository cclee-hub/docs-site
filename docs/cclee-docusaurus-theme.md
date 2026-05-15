---
title: CCLEE Docusaurus Theme — 开源文档主题
description: 基于 Docusaurus 3.x 的开源文档主题，集成紫色主题、深色模式、Tailwind CSS，开箱即用的生产级文档站点模板
project: cclee-docusaurus-theme
schema: Article
date: 2026-04-29
rag: true
rag_tags: ["Docusaurus", "开源", "文档主题"]
---

# CCLEE Docusaurus Theme

[在线演示](https://ccleeai.com) · [English](https://aidevhub.ai)

<FeatureCard title="开箱即用">
基于 Docusaurus 3.x，集成紫色主题、深色模式、Tailwind CSS。Clone 下来配置一下即可使用。
</FeatureCard>

## 特色功能

### 紫色主题 + 深色模式

CSS 变量系统管理颜色：

- **浅色模式**：#4C1D95 作为主色
- **深色模式**：#8B5CF6 作为主色，对比度 ≥4.5:1（WCAG AA）

### Tailwind CSS 集成

Docusaurus 原生不支持 Tailwind，本主题提供集成方案：

```bash
npm install tailwindcss postcss autoprefixer @tailwindcss/typography
```

在 `src/css/custom.css` 中引入：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 自定义 MDX 组件

全局注册，无需导入即可在 `.md/.mdx` 文件中使用：

| 组件 | 用途 |
|------|------|
| `FeatureCard` | 功能卡片 |
| `InfoBox` | 信息/警告/成功提示框 |
| `ComparisonTable` | 功能对比表格 |
| `StepBox` | 步骤容器 |

### SEO 自动化

`plugins/plugin-json-ld.js` 自动处理结构化数据：

- Frontmatter `schema: Article | HowTo | FAQPage` 自动映射到 Schema.org 类型
- 自动生成 hreflang 标签

### 国际化

双语言路由，开箱即用：

```bash
npm run start          # 中文站
SITE=ai npm run start  # 英文站
```

## 技术栈

| 技术 | 版本 |
|------|------|
| Docusaurus | 3.9+ |
| React | 18.3+ |
| Tailwind CSS | 3.4+ |
| TypeScript | 5.7+ |
| Node.js | ≥20.0 |

## 快速开始

### 方式一：Fork 项目

```bash
git clone https://github.com/cclee-hub/docs-site
cd docs-site
npm install
npm run start
```

### 方式二：集成到现有项目

```
src/css/custom.css      → 你的项目 src/css/
src/theme/MDXComponents.tsx → 你的项目 src/theme/
tailwind.config.js      → 你的项目根目录/
```

```bash
npm install tailwindcss postcss autoprefixer @tailwindcss/typography
```

### 配置主题颜色

在 `src/css/custom.css` 中修改 CSS 变量：

```css
:root {
  --ifm-color-primary: #4C1D95;
}
[data-theme='dark'] {
  --ifm-color-primary: #8B5CF6;
}
```

## 项目结构

```
docs-site/
├── docs/                    # 中文文档
├── i18n/en/                 # 英文翻译
├── src/
│   ├── components/          # React 组件
│   ├── css/custom.css       # Tailwind + 样式
│   └── theme/               # 主题覆盖
├── plugins/
│   └── plugin-json-ld.js    # SEO 插件
└── tailwind.config.js       # Tailwind 配置
```

## 下一步

- [CCLEE Theme](/docs/cclee-theme) — WordPress FSE 区块主题
- [CCLEE Toolkit](/docs/cclee-toolkit) — WordPress AI 增强插件
- [GitHub 仓库](https://github.com/cclee-hub/docs-site) — 查看源码

<InfoBox variant="success" title="开源免费">
MIT 协议开源，可免费用于个人和商业项目。
</InfoBox>

## 更新日志

<!-- truncate -->

| 日期 | 更新内容 |
|------|----------|
| 2026-04-29 | 初始发布 CCLEE Docusaurus Theme 文档 |

<details>
<summary>查看完整更新历史</summary>

- **2026-04-29** — 初始发布

</details>
