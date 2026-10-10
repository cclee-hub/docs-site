---
title: "WooCommerce PayPal Buttons Not Showing? Missing form.cart"
description: "PayPal buttons never render and log nothing? PPCP's script checks for form.cart once at init and skips silently. Restore it with a minimal wrapper form."
date: 2026-10-10
tags: [WordPress, WooCommerce, PayPal, Plugin Development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does removing the standard add-to-cart form make PayPal buttons disappear?"
    a: "The standard form is output by woocommerce_template_single_add_to_cart on the woocommerce_single_product_summary hook at default priority 10. Once remove_action takes it away, the PPCP button script finds no form.cart at init and skips rendering entirely."
  - q: "How do I quickly confirm the missing form.cart is the cause?"
    a: "Check two things: a clean console, and a ppc-button-ppcp-gateway container in the DOM that exists but stays empty. Then temporarily insert an empty <form class=\"cart\"></form> on the product page and reload — if buttons appear, that is the cause."
  - q: "Can I inject the form.cart with JavaScript on the frontend?"
    a: "No. PPCP's init() runs its check once during script initialization; a form inserted afterwards never triggers a re-check. The form.cart must be rendered server-side so it exists before the script runs."
  - q: "Is onsubmit=\"return false\" required?"
    a: "Yes. The wrapper form.cart is a real form — a submit triggered by the Enter key or other scripts reloads the page and loses the selected variation. PPCP's dependency on the form actually submitting is zero; return false blocks every submission path."
---

Scrolling down to the payment area on a WooCommerce variable product page, the PayPal button spot is completely blank — the container is there, the button is gone, and the browser console shows no error at all.

Ran into this while building [CCLEE B2B](/docs/cclee-b2b-general), a WooCommerce B2B enhancement plugin covering customer group management, tiered pricing, and bulk ordering — and stepped on an undocumented behavior of PayPal Complete Payments (PPCP).

## TL;DR

The first thing PPCP's button script does in `init()` is `document.querySelector("form.cart")` — if nothing matches, it returns silently with no log. Customizations like a B2B variation matrix remove the standard add-to-cart form with `remove_action`, `form.cart` disappears with it, and PayPal buttons never render again. The fix: wrap the PayPal container in a minimal `form.cart`, with `onsubmit="return false"` to block real submissions.

## Symptom: Empty PayPal Button Spot, Clean Console

Everything else on the product page works; the standard add-to-cart button is gone by design, but the PayPal buttons that should appear simply don't render. Searches for "PayPal button not showing" or "PayPal button not rendering" all describe this same situation.

DevTools shows three facts:

1. The page HTML contains PPCP's button container `#ppc-button-ppcp-gateway`;
2. The container is empty — not half-rendered, an empty div;
3. The console has no errors or warnings, and the ppcp-button script itself loads fine.

"Script loaded, container present, button missing, zero logs" means the problem is not in the network or error layer — it is inside the script's own logic branch.

## Root Cause: PPCP's form.cart Precondition Check and Silent Skip

The ppcp-button script (`ppcp-button-js-button.js`) starts its `init()` with `document.querySelector("form.cart")` — no match, no render, no message. This behavior is absent from PPCP's official documentation; you confirm it by reading the source or comparing against a working product page.

Why would `form.cart` disappear? WooCommerce's standard add-to-cart form is output by `woocommerce_template_single_add_to_cart`. B2B variation matrices, quote flows, and price-hiding customizations commonly remove it outright:

```php
remove_action(
	'woocommerce_single_product_summary',
	'woocommerce_template_single_add_to_cart',
	10
);
```

That one cut removes more than the add-to-cart button — it also removes the `form.cart` that PPCP requires before rendering. The custom purchase UI works flawlessly, the page logs nothing — only the PayPal button vanishes.

The silence is what makes this expensive to diagnose: the script reasons "no form, no render target" and quietly exits. You can watch ppcp-button JS download and execute in the Network panel, you can see the button container in the DOM, and not a single line tells you why it chose to do nothing.

## Fix: Wrap the PayPal Container in a Minimal form.cart

Wrap the PayPal container in a minimal `form.cart` at the spot where it renders, and PPCP's precondition check passes — buttons come back.

```php
add_action( 'woocommerce_single_product_summary', function () {
	echo '<form class="cart" onsubmit="return false;">';
	echo '<div id="ppc-button-ppcp-gateway" class="ppc-button-wrapper"></div>';
	echo '</form>';
}, 25 );
```

Each part has one job:

- `class="cart"` — PPCP checks this class, not an id; keep it verbatim;
- `onsubmit="return false;"` — the form is real in the DOM, so a submit triggered by the Enter key or other scripts would reload the page and lose the selected variation; this blocks them all;
- The container div's id `ppc-button-ppcp-gateway` is PPCP's convention — match the actual container id on your page.

The full version in [CCLEE B2B](/docs/cclee-b2b-general) also fires PPCP's own render action, for reference:

```php
do_action( 'woocommerce_paypal_payments_single_product_button_render' );
```

If you are deep into customizing WooCommerce templates and purchase flows, the [block theme troubleshooting guide](/blog/woocommerce-block-theme-troubleshooting-guide) covers other common pitfalls at the template layer.

<InfoBox variant="warning" title="Caution">

PPCP is not the only component watching `form.cart` — third-party add-to-cart enhancers and tracking plugins may listen to it too. After adding the form, walk through a full order in a private window and confirm no script double-fires because of it; do not omit `onsubmit="return false"`, or the Enter key alone will reload the page.

</InfoBox>

## FAQ

### Why does removing the standard add-to-cart form make PayPal buttons disappear?

The standard form is output by `woocommerce_template_single_add_to_cart` on the `woocommerce_single_product_summary` hook at default priority 10. Once `remove_action` takes it away, the PPCP button script finds no `form.cart` at init and skips rendering entirely.

### How do I quickly confirm the missing form.cart is the cause?

Check two things: a clean console, and a `ppc-button-ppcp-gateway` container in the DOM that exists but stays empty. Then temporarily insert an empty `<form class="cart"></form>` on the product page and reload — if buttons appear, that is the cause.

### Can I inject the form.cart with JavaScript on the frontend?

No. PPCP's `init()` runs its check once during script initialization; a form inserted afterwards never triggers a re-check. The form.cart must be rendered server-side so it exists before the script runs.

### Is onsubmit="return false" required?

Yes. The wrapper `form.cart` is a real form — a submit triggered by the Enter key or other scripts reloads the page and loses the selected variation. PPCP's dependency on the form actually submitting is zero; `return false` blocks every submission path.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
