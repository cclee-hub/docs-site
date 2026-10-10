---
title: "WooCommerce 画廊图片不加载？lazy loading 与 FlexSlider 冲突"
description: "WooCommerce 商品画廊翻到后面的图片一直空白？WordPress 原生懒加载与 FlexSlider 离屏布局叠加导致浏览器永不触发，用过滤器移除画廊尺寸的 loading 属性即可修复。"
date: 2026-10-10
tags: [WordPress, WooCommerce, FlexSlider, 主题开发]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么图片有 src 却没有网络请求？"
    a: "loading=\"lazy\" 把请求时机交给浏览器：图片与视口的距离超过预加载阈值（Chrome 桌面端约 1250px）时，IntersectionObserver 不会触发，请求根本不发出。有 src 只代表 DOM 层面准备好了，加载与否由可见性判定决定。"
  - q: "直接移除全站所有 loading=\"lazy\" 能解决吗？"
    a: "能解决画廊问题，但首屏之外的正文图片会全部变成立即加载，页面流量与 LCP 后的资源竞争都会变差。建议保留全局懒加载，只对 woocommerce_single 尺寸用过滤器移除，改动面控制在画廊内。"
  - q: "还有哪些滑块组件会触发同样的问题？"
    a: "共同点是「把非当前帧移出可视区」：FlexSlider、Swiper、Slick 等横向滑块与原生懒加载叠加都有此风险。若滑块自带懒加载模块（如 Swiper 的 lazy），改用它并移除 img 上的原生 loading 属性，避免双重机制冲突。"
  - q: "WordPress 什么版本开始需要处理这个问题？"
    a: "WordPress 5.5（2020 年）引入原生懒加载，5.9 起首图之外的内容图片默认注入 loading=\"lazy\"。只要商品画廊用了会移位的横向滑块，这个问题就存在，与 WooCommerce 或滑块库的具体版本无关。"
---

在 WooCommerce 商品详情页逐张翻动画廊缩略图时，翻到第 7 张起主图一直是空白——DevTools 的 Network 面板里连图片请求都没有发出。

在为客户开发[极简 FSE WordPress 主题](/cases/cclee-theme-fse-developer)时遇到此问题——面向企业站和轻量电商场景的 WordPress 全站编辑主题，WooCommerce 兼容走轻量原则。本文的问题最终以一个 filter 修复在主题内。

## TL;DR

WordPress 5.5 起自动给内容图片注入 `loading="lazy"`，而 WooCommerce 商品画廊用的 FlexSlider 会把非当前帧通过 CSS transform 移出可视区。两者叠加后，浏览器懒加载依赖的 IntersectionObserver 永远等不到排位靠后的图片进入触发范围——这些图片一个请求都不会发出。解法：用 `wp_get_attachment_image_attributes` 过滤器，只对 `woocommerce_single` 尺寸移除 `loading` 属性。

## 问题现象：画廊图片不加载，Network 里没有请求

商品画廊前几张正常，往后翻到某一张开始，主图区域持续空白。搜「画廊图片不显示」「产品图加载不出来」，命中的都是同一类现象。

DevTools 里能看到三个事实同时成立：

1. `<img>` 节点存在，`src` 属性有值；
2. `<img>` 上挂着 `loading="lazy"`；
3. Network 面板没有对应请求——不是加载失败，是浏览器压根没发起下载。

「有 src 却没有请求」是区分本问题与图片 404、路径错误的分水岭：后者有请求有报错，前者完全静默。

## 根因：原生懒加载与滑块离屏布局的叠加

每张画廊图片都处于「有 src、不可见、等浏览器判定」的状态，而 FlexSlider 的布局方式让「可见」这个条件永远无法达成。机制分三层：

**第一层：WordPress 自动注入懒加载。** WordPress 5.5 起，`wp_get_attachment_image()` 输出的图片默认带 `loading="lazy"`（首图除外）。商品画廊主图以 `woocommerce_single` 尺寸输出，全部命中这条规则。原生懒加载的意图是省流量：只加载接近视口的图片。

**第二层：FlexSlider 把非当前帧移出视口。** FlexSlider 把所有幻灯片排成一条水平长带，当前帧之外的幻灯片停在视口之外，切换时靠 CSS transform 换位。

**第三层：IntersectionObserver 的触发条件永远不满足。** 浏览器懒加载不是「进视口才加载」，而是「距视口小于阈值就预加载」，Chrome 桌面端图片阈值约 1250px，弱网下扩大到 2500px。横向滑块里第 N 张图片与视口的横向距离随序号线性增长，超过阈值后 IntersectionObserver 永不触发。实测第 7 张起，请求一个都不会发出。

整个链条没有任何报错：img 有 src、页面无 JS 异常、服务器日志干净，图片只是被浏览器判定为「还不需要加载」。这正是排查成本高的原因——三个组件各自的行为都符合文档，叠加起来却是死锁。

## 解决方案：只对画廊尺寸移除 loading 属性

用 `wp_get_attachment_image_attributes` 过滤器删掉 `woocommerce_single` 尺寸图片的 `loading` 属性，画廊图片回到默认的立即加载，问题即消失。

```php
add_filter(
	'wp_get_attachment_image_attributes',
	function ( $attr, $attachment, $size ) {
		if ( 'woocommerce_single' === $size ) {
			unset( $attr['loading'] );
		}
		return $attr;
	},
	10,
	3
);
```

放进主题的 `functions.php` 或 inc 模块即可生效；子主题用户放进子主题的 `functions.php`，不必改父主题。

它有效的原因：`loading` 属性一旦移除，浏览器对这些图片回退到默认的立即加载策略——HTML 解析阶段就发起请求，FlexSlider 之后怎么移位都只影响显示，不再影响加载。普通内容图不经历滑块移位，懒加载照常工作、应当保留；画廊图片的可见性被滑块接管了，加载决策权就该还给浏览器默认行为。

[CCLEE Theme](/cclee-theme) 已内置这段过滤（`inc/woocommerce.php`），使用该主题的直接更新即可。

如果你同时在排查 [WooCommerce 区块主题的其他渲染异常](/blog/woocommerce-block-theme-troubleshooting-guide)，画廊问题往往与模板结构问题同期出现，值得一起过一遍。

<InfoBox variant="warning" title="注意事项">

不要为了省事全局移除 `loading` 属性——首屏之外的图片立即加载会拖慢页面，懒加载对正文图片是纯收益。判断条件必须锁定 `woocommerce_single` 尺寸；如果更换滑块方案（如 Swiper），先确认新滑块是否自带懒加载模块，避免双重加载机制叠加。

</InfoBox>

## 常见问题

### 为什么图片有 src 却没有网络请求？

`loading="lazy"` 把请求时机交给浏览器：图片与视口的距离超过预加载阈值（Chrome 桌面端约 1250px）时，IntersectionObserver 不会触发，请求根本不发出。有 src 只代表 DOM 层面准备好了，加载与否由可见性判定决定。

### 直接移除全站所有 loading="lazy" 能解决吗？

能解决画廊问题，但首屏之外的正文图片会全部变成立即加载，页面流量与 LCP 后的资源竞争都会变差。建议保留全局懒加载，只对 `woocommerce_single` 尺寸用过滤器移除，改动面控制在画廊内。

### 还有哪些滑块组件会触发同样的问题？

共同点是「把非当前帧移出可视区」：FlexSlider、Swiper、Slick 等横向滑块与原生懒加载叠加都有此风险。若滑块自带懒加载模块（如 Swiper 的 lazy），改用它并移除 img 上的原生 `loading` 属性，避免双重机制冲突。

### WordPress 什么版本开始需要处理这个问题？

WordPress 5.5（2020 年）引入原生懒加载，5.9 起首图之外的内容图片默认注入 `loading="lazy"`。只要商品画廊用了会移位的横向滑块，这个问题就存在，与 WooCommerce 或滑块库的具体版本无关。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
