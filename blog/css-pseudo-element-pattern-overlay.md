---
title: 修复 CSS ::before 伪元素装饰纹理覆盖按钮的问题
description: ::before 伪元素实现背景装饰纹理时，缺少 opacity 和 z-index 导致网格点覆盖子元素，添加两个属性即可修复。
date: 2026-03-28
tags: [CSS, WordPress]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 CSS ::before 伪元素的背景纹理会覆盖在按钮上面？"
    a: "::before 使用 position:absolute + inset:0 覆盖整个容器，缺少 z-index 时按默认层叠顺序渲染在子元素上方。加 z-index:-1 可将其推到子内容后面。"
  - q: "::before 伪元素做装饰纹理需要注意哪些属性？"
    a: "必须同时设置 opacity（控制透明度）、pointer-events:none（防止拦截点击）和 z-index:-1（防止覆盖子元素），三者缺一不可。"
---

## TL;DR

用 `::before` 伪元素实现容器背景装饰纹理（圆点/网格）时，必须同时设置 `opacity`、`pointer-events: none` 和 `z-index: -1`。缺少 `opacity` 导致纹理 100% 不透明，缺少 `z-index` 导致纹理覆盖按钮等子元素。


<!-- truncate -->
## 问题现象

FSE 主题的 CTA 横幅区域使用 `::before` 伪元素渲染装饰性圆点纹理。预期效果是微妙的背景点缀，实际效果是圆点以完全不透明状态覆盖在按钮表面：

```css
/* 问题代码 — 纹理完全不透明且覆盖子元素 */
.has-dots-pattern::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
    /* 缺少 opacity — 纹理 100% 不透明 */
    /* 缺少 z-index — 纹理覆盖子内容 */
}
```

按钮表面出现密集的白色圆点，CTA 区域的渐变背景上也布满了明显的网格线。

## 根因

`::before` 伪元素实现装饰纹理时有三个关键属性，缺一不可：

**1. `opacity` — 控制纹理透明度**

`radial-gradient` 生成的是实心圆点，`currentColor` 继承文本颜色。在深色背景上，白色实心圆点会非常醒目。缺少 `opacity` 时默认值为 `1`，纹理完全不透明。

**2. `z-index: -1` — 将纹理推到子元素后方**

`::before` 设置了 `position: absolute`，在默认层叠上下文中，定位元素的绘制顺序晚于正常流元素。当容器是 `position: relative` 时，`z-index: -1` 将伪元素推到容器背景之后、子内容之前，确保按钮等子元素显示在纹理之上。

**3. `pointer-events: none` — 防止拦截点击**

这是最容易被记住的一个，因为它直接影响交互。没有它，纹理层会拦截点击事件。

同一个项目中存在正确实现的对照代码，说明是复制时遗漏了属性：

```css
/* 正确实现 — 独立元素方式 */
.cclee-dots-pattern {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.08;          /* 有 */
    pointer-events: none;
    /* 独立元素由 HTML 层级控制层叠，无需 z-index */
}
```

## 解决方案

为 `::before` 伪元素补上 `opacity` 和 `z-index: -1`：

```css
/* 修复后 */
.has-dots-pattern {
    position: relative;
}
.has-dots-pattern::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 20px 20px;
    opacity: 0.08;           /* 添加：8% 不透明度 */
    pointer-events: none;
    z-index: -1;             /* 添加：退到子内容后方 */
}
```

网格纹理同理：

```css
.has-grid-pattern {
    position: relative;
}
.has-grid-pattern::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(currentColor 1px, transparent 1px),
        linear-gradient(90deg, currentColor 1px, transparent 1px);
    background-size: 40px 40px;
    opacity: 0.05;           /* 网格更淡，5% 不透明度 */
    pointer-events: none;
    z-index: -1;
}
```

**装饰纹理伪元素的完整检查清单**：

| 属性 | 作用 | 缺失后果 |
|------|------|---------|
| `opacity: 0.05~0.1` | 控制纹理透明度 | 纹理完全不透明，喧宾夺主 |
| `z-index: -1` | 层叠在子元素后方 | 纹理覆盖按钮等子内容 |
| `pointer-events: none` | 不拦截鼠标事件 | 点击穿透失败 |

三个属性必须同时存在，这是 `::before` 装饰纹理的固定模式。

---
**对类似需求感兴趣？[联系合作](/about)**
