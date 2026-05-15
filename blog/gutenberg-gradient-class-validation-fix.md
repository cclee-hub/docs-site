---
title: 修复 Gutenberg Gradient Class 命名变更导致的 Block 验证失败
description: 解决 WordPress Site Editor 中历史 Pattern 报 "Block contains unexpected or invalid content" 错误，根因是 Gutenberg 升级后 gradient class 命名规则变更
date: 2026-03-26
tags: [WordPress, Gutenberg, FSE]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么我的 Pattern 在 Site Editor 中显示 Block 验证失败？"
    a: "Gutenberg 升级后，gradient CSS class 命名从 `has-{slug}-gradient` 变为 `has-{slug}-gradient-background`，历史代码与新规则不匹配。"
  - q: "如何批量修复所有受影响的 Pattern 文件？"
    a: "使用 find + sed 批量替换 pattern 文件中的 gradient class 名称，将旧的 has-X-gradient 替换为 has-X-gradient-background"
---

在为客户开发 WordPress FSE 主题时遇到此问题，记录根因与解法。

## TL;DR

Gutenberg 升级后，gradient 的 CSS class 命名规则从 `has-{slug}-gradient` 变为 `has-{slug}-gradient-background`。手写 Pattern HTML 中的旧 class 与 Gutenberg 验证逻辑不匹配，导致 Site Editor 报错。解决方案是批量替换 class 名称。


<!-- truncate -->
## 问题现象

所有历史 Pattern 在 Site Editor 中显示错误：

```
Block contains unexpected or invalid content
```

- 新建 Pattern 无此问题
- 前台渲染正常
- 点击 "Attempt Recovery" 可恢复显示

## 根因分析

通过 DevTools Console 查看 `Block validation failed` 日志，对比 Expected 与 Actual：

**Expected（Gutenberg 生成）**：
```html
<div class="wp-block-group has-accent-gradient-background has-background">
```

**Actual（Pattern 中手写）**：
```html
<div class="wp-block-group has-accent-gradient has-background">
```

Gutenberg 版本升级后，gradient class 命名规则变更：

| 旧命名 | 新命名 |
|--------|--------|
| `has-{slug}-gradient` | `has-{slug}-gradient-background` |

Block 验证时，Gutenberg 会根据块注释中的 JSON 属性（如 `"gradient":"accent-gradient"`）重新计算期望的 HTML，与实际 HTML 比对。class 不匹配即报验证失败。

## 解决方案

### 1. 确认影响范围

```bash
# 查找使用旧 class 的文件
grep -r "has-[a-z0-9-]*-gradient " patterns/ --include="*.php"
```

### 2. 批量替换

```bash
# macOS/Linux 通用
sed -i '' 's/has-\([a-z0-9-]*\)-gradient /has-\1-gradient-background /g' patterns/*.php

# Linux (GNU sed)
sed -i 's/has-\([a-z0-9-]*\)-gradient /has-\1-gradient-background /g' patterns/*.php
```

**注意**：
- 只替换 HTML 标签中的 class 属性
- 块注释中的 `"gradient":"accent-gradient"` 声明不需要改动
- 正则末尾有空格，避免误匹配 `has-accent-gradient-background`

### 3. 验证修复

1. 清理 WordPress 缓存：`wp cache flush`
2. 刷新 Site Editor，确认错误消失
3. 抽查几个 Pattern，验证前后台显示正常

## 预防措施

1. **优先使用块注释属性**：通过 JSON 属性（如 `"gradient":"accent-gradient"`）设置样式，让 Gutenberg 自动生成 class，避免手写
2. **关注 Gutenberg 更新日志**：升级前检查 Breaking Changes
3. **开发环境先验证**：升级后在开发环境测试所有 Pattern，确认无验证错误再部署

---
**对类似需求感兴趣？[联系合作](/about)**
