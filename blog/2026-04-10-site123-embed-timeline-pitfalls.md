---
title: SITE123 活动页面嵌入时间轴？先绕过这 5 个平台限制
description: 在 SITE123 平台活动页面嵌入时间轴，遭遇 5 类平台限制：Custom Code 无法精准定位、DOM 未加载就执行、隐藏元素干扰、float 布局冲突、脚本重复注入。从 10 阶段调试中提取的避坑指南。
date: 2026-04-10
tags: [Bug修复, 电商]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "SITE123 活动页面能精准插入内容到某个 section 之间吗？"
    a: "不能。Custom Code 只能注入到 head 或 body 开头/结尾，无法指定页面和位置，必须通过 JS 动态 DOM 操作来绕行。"
  - q: "SITE123 嵌入 JS 后时间轴不显示，最常见原因是什么？"
    a: "最常见原因有两个：一是脚本放在 head 中执行时 DOM 未加载完成；二是选择器匹配到了隐藏元素（如面包屑导航），导致时间轴被插入到不可见位置。"
---

## TL;DR

在 SITE123 平台的活动页面嵌入时间轴，踩了 5 类坑：Custom Code **无法精准定位**、脚本在 **DOM 未加载时执行**、选择器命中 **隐藏元素**、`float` 布局冲突导致相邻区块错位、平台缓存造成 **脚本重复注入**。解决方案：JS 动态 DOM 操作 + 横向鱼骨布局 + `DOMContentLoaded` 包裹。


<!-- truncate -->
---

## 问题现象

客户基于 SITE123 搭建活动网站，需要在 Hero 横幅下方嵌入竖排时间轴，展示关键日期（Key Dates）。Timeline 服务已自建完成（部署在 `timeline.aidevhub.ai`），但嵌入到 SITE123 页面后：

- 时间轴不显示
- 时间轴出现在页面底部
- 时间轴插入后，Tickets 区域被挤到下方

## 根因

### 限制一：Custom Code 无法精准定位

SITE123 的 Custom Code 只能选择 4 个注入位置（head 开头、head 结尾、body 开头、body 结尾），**无法指定目标页面**，也**无法插入到页面某个 section 之间**。

这是最根本的限制，绕不过去。只能通过 JS 动态操作 DOM，在页面加载后自行找到目标节点再插入。

### 限制二：脚本在 DOM 未加载时执行

如果将代码放在 "Before closing head tag"，`document.body` 在执行时为 null。更诡异的是，在 SITE123 后台修改注入位置后，页面源码中的实际位置可能与设置不符。

**解决方案：无论脚本放在哪，都用 `DOMContentLoaded` 包裹，确保 DOM 就绪后再执行。**

### 限制三：选择器命中隐藏元素

`tl.js` 的插入逻辑优先查找 `.container`，但 SITE123 活动页面的 `.container` 是面包屑导航区域，设有 `visibility: hidden`，时间轴被插入到隐藏元素前，页面不可见。

`querySelector` 只取第一个匹配项，而 `.container` 是通用类名，很容易踩坑。

**教训：选择器必须通过浏览器控制台在实际页面验证，不能依赖推断。**

### 限制四：float 布局冲突

SITE123 活动页面采用 Bootstrap float 布局（`col-sm-5` + `col-sm-7`，12 列刚占满）。在 `.product-container` 之前插入独占一行的元素，会导致 Tickets 列被挤到下一行。

这是结构性冲突——在 float 容器内部无法插入独占行元素而不破坏布局。

**解决方案：改用横向鱼骨布局（贯穿线 + 圆点 + 上下交替卡片），`width:100%` 自然撑满，不参与 float 计算。**

### 限制五：平台缓存导致脚本重复注入

修改 Custom Code 位置设置后，页面源码中出现两处 `timeline.aidevhub.ai`——同一条代码被注入了两次。这是 SITE123 的平台 bug，暂未找到根因，但不影响最终效果。

---

## 解决方案

### 1. 脚本执行时机兜底

用 `DOMContentLoaded` 包裹全部插入逻辑，不再依赖 SITE123 的位置设置：

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // 插入逻辑
});
```

### 2. 选择器必须实测

在浏览器控制台验证三步走：

```javascript
// 第一步：确认元素存在且可见
const el = document.querySelector('.product-container');
console.log(el.getBoundingClientRect());

// 第二步：确认唯一性（跨页面验证返回值为 1）
const all = document.querySelectorAll('.product-container');
console.log(all.length);

// 第三步：插入测试色块确认位置
const test = document.createElement('div');
test.style.cssText = 'background:red;height:100px;';
el.parentNode.insertBefore(test, el);
```

### 3. 布局选型

采用横向鱼骨布局：一条贯穿横线 + 圆点定位在线上 + 卡片上下交替。竖排布局在 float 场景下容易引发结构冲突，横向布局天然不参与 float 计算。

### 4. 插入位置

最终验证有效的插入目标：`.product-container`（活动详情和 Tickets 的父容器），在其之前插入时间轴，位置回到 Hero 下方、活动详情之前。

### 5. 部署生效

修改 `routes/script.js` 后执行 `pm2 restart timeline` 即生效，**无需更新 SITE123 的嵌入代码**。

---

## 注意事项

<InfoBox variant="warning" title="选择器必须实测">
  SITE123 页面结构没有文档，选择器不能靠推断。`.container` 在其他场景是通用类名，在活动页面匹配到的是面包屑导航。始终用浏览器控制台在实际页面验证。
</InfoBox>

<InfoBox variant="warning" title="Custom Code 位置设置不可靠">
  在 SITE123 后台修改注入位置后，页面源码中的实际位置可能与设置不符。脚本自身做好执行时机的兜底，不要依赖平台设置。
</InfoBox>

<InfoBox variant="warning" title="float 布局内不能插入独占行元素">
  在 Bootstrap float 布局（`col-*`）的容器内部或之前插入 `width:100%` 的块级元素，会导致后续列被挤到下一行。绕行方案：插入位置改到容器外部，或改用不依赖 float 的布局。
</InfoBox>

---

<div className="my-8 p-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-center">
  <div className="text-lg font-semibold mb-3">自建 Timeline 服务，服务器怎么选？</div>
  <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
    本项目使用 Express + sql.js 部署在 Vultr，最低 $5/月配置足够，支持 PM2 进程管理。附安装脚本，5 分钟搭建完毕。
  </div>
  <a href="https://www.vultr.com/?ref=9811050" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">Vultr $5/月起 →</a>
</div>

---

## 关键结论

1. SITE123 Custom Code 无法精准定位，必须靠 JS 动态 DOM 操作弥补
2. 脚本自身做好 `DOMContentLoaded` 兜底，不依赖平台位置设置
3. 选择器用控制台在实际页面验证，`querySelectorAll` + `getBoundingClientRect`
4. float 布局内插入独占行元素会引发结构冲突，改用横向布局绕过
5. 修改服务端代码后 `pm2 restart timeline` 即生效，无需动嵌入代码

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
