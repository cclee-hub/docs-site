---
title: "WooCommerce PayPal 按钮不显示？PPCP 缺少 form.cart"
description: "WooCommerce 商品页 PayPal 按钮不渲染且无报错？PPCP 脚本初始化时静默检查 form.cart，移除标准加购表单的定制会让它永远跳过。补一个最小 form 包裹即可恢复。"
date: 2026-10-10
tags: [WordPress, WooCommerce, PayPal, 插件开发]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么移除标准加购表单会导致 PayPal 按钮消失？"
    a: "标准表单由 woocommerce_template_single_add_to_cart 输出，挂在 woocommerce_single_product_summary 钩子、默认优先级 10。remove_action 移除它之后，PPCP 的按钮脚本在初始化时查不到 form.cart，直接跳过渲染。"
  - q: "怎么快速确认是 form.cart 缺失而不是其他问题？"
    a: "看两个点：Console 零报错、DOM 里 ppc-button-ppcp-gateway 容器存在但为空。再临时在商品页手插一个空 <form class=\"cart\"></form> 并刷新，按钮出现即可坐实。"
  - q: "用 JavaScript 在前端动态补一个 form.cart 行不行？"
    a: "不行。PPCP 的 init() 只在脚本初始化阶段检查一次，后插入的表单不会触发重新检查。必须在服务端输出静态的 form.cart，让它在脚本运行前就存在。"
  - q: "onsubmit=\"return false\" 是必须的吗？"
    a: "是。补出来的 form.cart 是一个真实表单，回车或脚本触发的提交会导致页面刷新、丢失已选变体；PPCP 对这个表单的提交依赖为 0，需要的只是它存在于 DOM，return false 负责阻断一切提交。"
---

在 WooCommerce 变体商品详情页往下翻到支付区域时，PayPal 按钮的位置一片空白——容器还在，按钮没了，浏览器 Console 里没有任何报错。

在开发 [CCLEE B2B](/docs/cclee-b2b-general)（WooCommerce B2B 增强插件，覆盖企业用户管理、差异化定价、批量下单）时踩到 PayPal Complete Payments（PPCP）的一个隐蔽行为。

## TL;DR

PPCP 的按钮脚本初始化时第一步检查 `document.querySelector("form.cart")`，找不到就静默跳过、不留任何日志。B2B 变体矩阵这类定制会用 `remove_action` 移除标准加购表单，`form.cart` 随之消失，PayPal 按钮从此不再渲染。解法：在渲染 PayPal 容器的位置补一个最小 `form.cart` 包裹，`onsubmit="return false"` 防止真实提交。

## 问题现象：PayPal 按钮位置空白，控制台无报错

商品页其余部分正常，标准加购按钮按定制要求确实移除了，但本该出现的 PayPal 按钮整个不渲染。搜「PayPal 按钮不显示」「PayPal 按钮不渲染」，命中的是同一类现象。

DevTools 里能看到三个事实：

1. 页面 HTML 里存在 PPCP 的按钮容器 `#ppc-button-ppcp-gateway`；
2. 容器是空的——不是渲染了一半，是空 div；
3. Console 没有报错也没有警告，ppcp-button 脚本本身加载成功。

「脚本加载了、容器在、按钮不出、零日志」这个组合说明问题不在网络或报错层，而在脚本自己的逻辑分支里。

## 根因：PPCP 的 form.cart 前置检查与静默跳过

ppcp-button 脚本（`ppcp-button-js-button.js`）的 `init()` 第一步是 `document.querySelector("form.cart")`——查不到就 return，不渲染按钮，也不输出任何提示。这个行为不见于 PPCP 官方文档，只有读源码或对照正常页面才能确认。

`form.cart` 为什么会消失？WooCommerce 标准加购表单由 `woocommerce_template_single_add_to_cart` 输出。做 B2B 变体矩阵、询价流程、隐藏价格这类定制时，常见做法是把它整个移除：

```php
remove_action(
	'woocommerce_single_product_summary',
	'woocommerce_template_single_add_to_cart',
	10
);
```

这一刀切掉的不只是加购按钮，还有 PPCP 渲染前提的 `form.cart`。定制自己的加购 UI 完全正常工作，页面没有一处报错——只有 PayPal 按钮凭空消失。

静默是这个问题的排查成本所在：脚本认为「没有表单就没有渲染目标」，于是安静地退出。你在 Network 里能看到 ppcp-button JS 正常下载执行，在 DOM 里能看到按钮容器，唯独没有一条日志告诉你它为什么选择不干活。

## 解决方案：为 PayPal 容器补一个最小 form.cart

在原本渲染 PayPal 容器的位置，用一个最小 `form.cart` 把容器包起来，PPCP 的前置检查即可通过，按钮恢复渲染。

```php
add_action( 'woocommerce_single_product_summary', function () {
	echo '<form class="cart" onsubmit="return false;">';
	echo '<div id="ppc-button-ppcp-gateway" class="ppc-button-wrapper"></div>';
	echo '</form>';
}, 25 );
```

三个部分各司其职：

- `class="cart"`——PPCP 检查的是这个 class，不是 id，必须原样保留；
- `onsubmit="return false;"`——这个 form 在 DOM 里是真实表单，回车或脚本触发的 submit 会导致页面刷新、丢失已选变体，统一阻断；
- 容器 div 的 id `ppc-button-ppcp-gateway` 是 PPCP 约定的挂载点，以你页面上实际容器的 id 为准。

[CCLEE B2B](/docs/cclee-b2b-general) 的完整版还追加了 PPCP 自己的渲染动作，供参考：

```php
do_action( 'woocommerce_paypal_payments_single_product_button_render' );
```

如果你在深度定制 WooCommerce 的模板与加购流程，[区块主题排查指南](/blog/woocommerce-block-theme-troubleshooting-guide) 收录了模板层的其他常见坑，值得一起过。

<InfoBox variant="warning" title="注意事项">

`form.cart` 这个 class 不只 PPCP 一个组件在用——第三方加购增强、追踪埋点插件也可能监听它。补表单后用无痕窗口完整走一遍下单流程，确认没有脚本因这个新表单而重复触发；`onsubmit="return false"` 不要省略，否则回车键就会刷新页面。

</InfoBox>

## 常见问题

### 为什么移除标准加购表单会导致 PayPal 按钮消失？

标准表单由 `woocommerce_template_single_add_to_cart` 输出，挂在 `woocommerce_single_product_summary` 钩子、默认优先级 10。`remove_action` 移除它之后，PPCP 的按钮脚本在初始化时查不到 `form.cart`，直接跳过渲染。

### 怎么快速确认是 form.cart 缺失而不是其他问题？

看两个点：Console 零报错、DOM 里 `ppc-button-ppcp-gateway` 容器存在但为空。再临时在商品页手插一个空 `<form class="cart"></form>` 并刷新，按钮出现即可坐实。

### 用 JavaScript 在前端动态补一个 form.cart 行不行？

不行。PPCP 的 `init()` 只在脚本初始化阶段检查一次，后插入的表单不会触发重新检查。必须在服务端输出静态的 `form.cart`，让它在脚本运行前就存在。

### onsubmit="return false" 是必须的吗？

是。补出来的 `form.cart` 是一个真实表单，回车或脚本触发的提交会导致页面刷新、丢失已选变体；PPCP 对这个表单的提交依赖为 0，需要的只是它存在于 DOM，`return false` 负责阻断一切提交。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
