---
title: 解决 WordPress FSE Pattern 块验证失败的 5 种原因
description: WordPress 块编辑器显示 Block contains unexpected or invalid content？详解颜色未定义、JSON 重复 key、Style Variation 覆盖、HTML 属性不一致、全局样式冲突 5 种根因与解决方案。
date: 2026-03-21
tags: [WordPress, FSE, Block Editor, 主题开发]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么我的 Pattern 显示 Block contains unexpected or invalid content？"
    a: "块验证失败通常由颜色 slug 未定义、JSON 格式错误、Style Variation 调色板不完整、HTML 属性与块注释不一致、或全局样式覆盖导致。"
  - q: "Style Variation 如何影响 Pattern 验证？"
    a: "Style Variation 的 color.palette 会完全覆盖父主题调色板，不合并。Pattern 引用的颜色在切换样式后若不存在，验证就会失败。"
  - q: "为什么手写 Pattern HTML 会验证失败？"
    a: "WordPress save 函数对 class 顺序、style 属性格式有严格要求。建议从编辑器复制块代码，不要手写 HTML。"
  - q: "修改 theme.json 后为什么不生效？"
    a: "Site Editor 保存的全局样式存储在 wp_global_styles 表中，优先级高于 theme.json。删除该记录后清除缓存即可。"
  - q: "如何确保 Pattern 在所有 Style Variation 下都能验证通过？"
    a: "每个 Style Variation 必须包含 Pattern 使用的所有颜色 slug，尤其是 neutral 系列（neutral-50 ~ neutral-900）。"
---
在为客户开发 WordPress FSE 主题时，频繁遇到 Block Pattern 验证失败问题。本文总结 5 种常见原因与解决方案。

## TL;DR

块验证失败通常是以下原因之一：**颜色 slug 未定义**、**JSON 重复 key**、**Style Variation 调色板覆盖**、**HTML 属性与块注释不一致**、**全局样式覆盖 theme.json**。逐一排查即可解决。


<!-- truncate -->
## 问题现象

编辑器中 Pattern 显示红色警告：

```
Block contains unexpected or invalid content
```

尝试恢复块内容后，可能暂时正常，但刷新后问题复现。

---

## 原因一：颜色 slug 未定义

### 根因

Pattern 块属性引用了 `theme.json` 中不存在的颜色 slug：

```html
<!-- 错误：neutral-text 不存在 -->
<!-- wp:paragraph {"textColor":"neutral-text"} -->
<p class="has-neutral-text-color">...</p>
```

### 解决方案

1. 打开 `theme.json`，检查 `settings.color.palette` 定义的所有颜色
2. 将 Pattern 中的无效 slug 替换为有效值

```bash
# 批量替换示例
cd patterns/
sed -i 's/"neutral-text"/"neutral-500"/g' *.php
sed -i 's/has-neutral-text-color/has-neutral-500-color/g' *.php
```

**有效 slug 参考：** `primary`, `secondary`, `accent`, `base`, `contrast`, `neutral-50` ~ `neutral-900`

---

## 原因二：JSON 重复 key

### 根因

块注释 JSON 中同一层级出现重复 key（常见于复制粘贴）：

```json
// 错误：两个 style
{"style":{"typography":{...}},"style":{"spacing":{...}}}
```

JSON 规范不允许重复 key，解析器行为未定义。

### 解决方案

合并为单一 key：

```json
// 正确
{"style":{"typography":{...},"spacing":{...}}}
```

**排查命令：**
```bash
# 搜索可能重复的 key
grep -n ',"style":{' patterns/*.php | head -20
```

---

## 原因三：Style Variation 覆盖调色板

### 根因

`styles/*.json` 中的 `color.palette` 会**完全覆盖**（非合并）父主题调色板。

当 Pattern 引用 `neutral-500`，但当前 Style Variation 未定义该颜色时，验证失败。

### 解决方案

每个 Style Variation 必须包含完整的 neutral 系列：

```json
// styles/ocean.json
{
  "version": 3,
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary", "color": "#0d9488", "name": "Primary" },
        { "slug": "secondary", "color": "#0f766e", "name": "Secondary" },
        { "slug": "accent", "color": "#f59e0b", "name": "Accent" },
        { "slug": "base", "color": "#f8fafc", "name": "Base" },
        { "slug": "contrast", "color": "#0f172a", "name": "Contrast" },
        { "slug": "neutral-50", "color": "#fafafa", "name": "Neutral 50" },
        { "slug": "neutral-100", "color": "#f5f5f5", "name": "Neutral 100" },
        { "slug": "neutral-200", "color": "#e5e5e5", "name": "Neutral 200" },
        { "slug": "neutral-300", "color": "#d4d4d4", "name": "Neutral 300" },
        { "slug": "neutral-400", "color": "#a3a3a3", "name": "Neutral 400" },
        { "slug": "neutral-500", "color": "#737373", "name": "Neutral 500" },
        { "slug": "neutral-600", "color": "#525252", "name": "Neutral 600" },
        { "slug": "neutral-700", "color": "#404040", "name": "Neutral 700" },
        { "slug": "neutral-800", "color": "#262626", "name": "Neutral 800" },
        { "slug": "neutral-900", "color": "#171717", "name": "Neutral 900" }
      ]
    }
  }
}
```

**关键：** neutral 系列色值必须与 `theme.json` 完全一致，只改变品牌色。

---

## 原因四：HTML 属性与块注释不一致

### 根因

这是最隐蔽的问题。WordPress `save` 函数对生成的 HTML 有严格要求。

#### 问题 4.1：class 顺序错误

WordPress 生成 class 的固定顺序：

```
has-border-color has-{slug}-border-color has-{slug}-background-color has-background
```

手写 HTML 时顺序错误会导致验证失败。

#### 问题 4.2：背景色属性混用

背景色只能用 `backgroundColor` 属性，不可在 `style.color.background` 中声明：

```html
<!-- 错误：混用导致 inline style 生成非法 CSS -->
<!-- wp:group {"style":{"color":{"background":"#f5f5f5"}}} -->

<!-- 正确 -->
<!-- wp:group {"backgroundColor":"neutral-100"} -->
```

#### 问题 4.3：border style 属性顺序

`border-width` 必须在 `border-style` 之前：

```html
<!-- 正确 -->
<div style="border-width:1px;border-style:solid;border-radius:8px;">
```

### 解决方案

**最佳实践：从编辑器复制块代码，不要手写 HTML class 和 style。**

1. 在编辑器中配置好块
2. 切换到代码编辑器视图
3. 复制完整的块注释 + HTML
4. 粘贴到 Pattern 文件

**正确示例：**
```html
<!-- wp:group {"backgroundColor":"accent","borderColor":"neutral-200","style":{"border":{"radius":"8px","width":"1px","style":"solid"}}} -->
<div class="wp-block-group has-border-color has-neutral-200-border-color has-accent-background-color has-background" style="border-width:1px;border-style:solid;border-radius:8px;">
  <!-- content -->
</div>
<!-- /wp:group -->
```

---

## 原因五：全局样式覆盖 theme.json

### 根因

Site Editor 保存的自定义样式存储在 `wp_global_styles` CPT 中，优先级**高于** `theme.json`。

修改 `theme.json` 后前端仍显示旧值，是因为全局样式覆盖了主题默认设置。

### 排查

```bash
# 检查是否存在全局样式
wp post list --post_type=wp_global_styles --fields=ID,post_title --allow-root

# 查看全局样式内容
wp post get <ID> --fields=post_content --allow-root
```

### 解决方案

```bash
# 删除全局样式
wp post delete <ID> --force --allow-root

# 清除缓存
wp cache flush --allow-root
```

**预防：** 开发阶段避免使用 Site Editor 自定义样式，所有配置通过 `theme.json` 管理。

---

## 排查流程总结

```
块验证失败
    │
    ├─→ 检查颜色 slug 是否在 theme.json 中定义
    │
    ├─→ 检查 JSON 是否有重复 key
    │
    ├─→ 检查所有 Style Variation 是否包含完整调色板
    │
    ├─→ 检查 HTML class/style 是否与块注释一致
    │
    └─→ 检查 wp_global_styles 是否覆盖了 theme.json
```

---
**对类似需求感兴趣？[联系合作](/about)**
