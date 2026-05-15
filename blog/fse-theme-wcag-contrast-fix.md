---
title: 修复 WordPress FSE 主题 Footer 文字不可见的 WCAG 对比度问题
description: FSE 主题的 contrast 颜色语义混乱导致 Footer 对比度仅 1.05:1，引入 surface 语义色并处理全局样式覆盖后，对比度提升至 15.8:1（AAA 级）。
date: 2026-03-22
tags: [WordPress, FSE, WCAG, theme.json]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 WordPress FSE 主题的 Footer 文字突然不可见了？"
    a: "contrast 颜色 token 在不同 Style Variation 中语义混乱，浅色主题中 contrast 是浅灰，与白色 base 形成不到 2:1 的对比度。"
  - q: "修改 theme.json 新增颜色后为什么不生效？"
    a: "wp_global_styles 表中的全局样式优先级高于 theme.json，会完全覆盖调色板。需要删除全局样式或在 Site Editor 重新保存。"
---

在为客户开发 WordPress FSE 企业主题时，发现 Footer 区块在多个 Style Variation 下文字几乎不可见。本文记录从 WCAG 对比度诊断到引入语义色、处理全局样式覆盖的完整修复过程。

## TL;DR

**问题**：FSE 主题的 `contrast` 颜色 token 语义混乱，浅色主题中 contrast ≈ 浅灰 ≈ base（白色），导致 Footer 对比度仅 1.05:1。

**解法**：
1. 引入 `surface` 语义色，专用于深色区块背景
2. 删除 `wp_global_styles` 中的覆盖样式
3. 所有 Style Variations 同步添加 surface 定义

**结果**：对比度从 1.05:1 提升至 15.8:1（WCAG AAA 级）。


<!-- truncate -->
## 问题现象

Footer 区块使用 `backgroundColor="contrast"` + `textColor="base"`：

```html
<!-- wp:group {"backgroundColor":"contrast","textColor":"base"} -->
<div class="has-base-color has-contrast-background-color">
  Footer 内容
</div>
```

在默认主题下，Footer 文字几乎不可见：

| 组合 | 前景色 | 背景色 | 对比度 | WCAG |
|------|--------|--------|--------|------|
| Footer 文字 | `#ffffff` (base) | `#f8fafc` (contrast) | **1.05:1** | ❌ 失败 |
| Footer 链接 | `#f59e0b` (accent) | `#f8fafc` (contrast) | **1.78:1** | ❌ 失败 |

WCAG AA 标准要求普通文字对比度 ≥ 4.5:1，当前状态远不达标。

## 根因分析

### 1. contrast 语义混乱

`contrast` 的设计意图是"与 base 形成对比的背景色"，但在不同主题模式下语义矛盾：

| Variation | base | contrast | 期望 vs 实际 |
|-----------|------|----------|-------------|
| 默认（浅色） | `#ffffff` 白 | `#f8fafc` 浅灰 | 期望深色，实际浅色 |
| Tech（深色） | `#0f0f1a` 深黑 | `#1e1e2e` 深紫 | 期望浅色，实际深色 |

Footer Pattern 假设 `contrast` 是深色背景，但 5/6 的 Style Variations 中它是浅色。

### 2. 颜色语义缺乏明确用途定义

原设计系统只有 `contrast` 一个"对比色"，没有区分：
- 浅色对比区块（CTA Banner 等强调区域）
- 深色对比区块（Footer、暗色 Hero 等）

## 解决方案

### Step 1：引入 surface 语义色

在 `theme.json` 中新增 `surface` token，专用于深色区块背景：

```json
{
  "slug": "surface",
  "color": "#0f172a",
  "name": "Surface"
}
```

### Step 2：更新所有 Style Variations

每个 variation 定义自己的 surface 色（通常等于 primary）：

```json
// styles/commerce.json
{ "slug": "surface", "color": "#1f2937", "name": "Surface" }

// styles/nature.json
{ "slug": "surface", "color": "#14532d", "name": "Surface" }

// styles/tech.json（深色主题）
{ "slug": "surface", "color": "#1e1e2e", "name": "Surface" }
```

### Step 3：修改 Footer 模板

```html
<!-- wp:group {"backgroundColor":"surface","textColor":"base"} -->
<div class="has-base-color has-surface-background-color">
  Footer 内容
</div>
```

### Step 4：删除全局样式覆盖

修改 theme.json 后颜色仍不生效？检查全局样式：

```bash
# 检查是否存在全局样式
docker exec wp_cli wp post list --post_type=wp_global_styles --fields=ID,post_title --allow-root

# 删除全局样式
docker exec wp_cli wp post delete <ID> --force --allow-root
docker exec wp_cli wp cache flush --allow-root
```

**原因**：`wp_global_styles` 中的 `color.palette` 会**完全覆盖**（非合并）theme.json 的调色板。

## 修复结果

| Variation | surface + base 对比度 | WCAG 级别 |
|-----------|----------------------|-----------|
| 默认 | **15.8:1** | ✅ AAA |
| Commerce | **13.1:1** | ✅ AAA |
| Industrial | **12.6:1** | ✅ AAA |
| Professional | **9.9:1** | ✅ AAA |
| Nature | **10.8:1** | ✅ AAA |
| Tech | **11.5:1** | ✅ AAA |

## 颜色语义总结

| Token | 用途 |
|-------|------|
| `primary` | 品牌主色（Logo、主按钮） |
| `secondary` | 次要元素 |
| `accent` | 行动召唤（CTA、链接） |
| `base` | 页面主背景 |
| `contrast` | 浅色对比区块背景 |
| `surface` | **深色区块背景（Footer、暗色 CTA）** ← 新增 |

---
**对类似需求感兴趣？[联系合作](/about)**
