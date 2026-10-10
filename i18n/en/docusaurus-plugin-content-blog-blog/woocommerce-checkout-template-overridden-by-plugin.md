---
title: "WooCommerce Checkout Template Not Applied? Plugin Override"
description: "Body class says theme template, render shows WooCommerce's own? Its hierarchy filter cuts in at priority 1. Delete _wp_page_template and let it resolve."
date: 2026-10-10
tags: [WordPress, WooCommerce, FSE, Theme Development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How does WooCommerce win template resolution?"
    a: "It hooks page_template_hierarchy at priority 1, earlier than consumers at the default priority 10, and unshifts its template slug to the front of the hierarchy array. The WooCommerce source comments state this priority is intentional."
  - q: "Why do the body class and the actual render disagree?"
    a: "Two separate signal sources: the body class is generated directly from the _wp_page_template meta, while the rendered template is decided by the hierarchy filter's array order. A manually set meta falls out of sync with the filter's result."
  - q: "How do I confirm the plugin template is the one rendering?"
    a: "There is exactly one reliable marker: the data-block-name attribute on the main element. data-block-name=\"woocommerce/page-content-wrapper\" means the plugin template renders; a theme-template main is built from the theme's own blocks and carries no such marker."
  - q: "Is the Cart page taken over the same way?"
    a: "Yes. The same AbstractPageTemplate mechanism has two implementations, CartTemplate and CheckoutTemplate, covering both the Cart and Checkout pages — the same data-block-name marker diagnoses them."
---

After assigning the theme's checkout template to the Checkout page, the front end still renders WooCommerce's own structure — the theme template's heading and footer are nowhere in the output, while the body class reports the assignment as active.

Ran into this while building a [minimal FSE WordPress theme](/cases/cclee-theme-fse-developer) for a client — a full-site-editing theme for corporate sites and lightweight e-commerce, with WooCommerce compatibility kept intentionally thin.

## TL;DR

WooCommerce hooks `page_template_hierarchy` at priority 1 and unshifts its own template slugs (`checkout`, `cart`) to the front of the hierarchy array, so the plugin template outranks nearly every candidate. Manually setting `_wp_page_template` on the page at that point only creates a second, conflicting signal — the body class reads the meta while the render follows the filter. The fix: delete the manually set `_wp_page_template` and let the hierarchy filter resolve.

## Symptom: Body Class Says Theme Template, Render Is the Plugin's

The template assignment in the page editor clearly names the theme's checkout template, and the body class faithfully shows `page-template-checkout`; the front-end output, however, is WooCommerce's `page-content-wrapper` — store notices and product content only, none of the heading and footer structure from the theme template.

The diagnostic marker is a single attribute: check whether the page's `<main>` element carries `data-block-name="woocommerce/page-content-wrapper"`. If it does, WooCommerce's plugin template is what actually renders — the theme template has been sidelined, confirmed.

A symptom as self-contradictory as "body class says A, render shows B" almost always means two signal sources that never sync — and this machine has exactly one such pair.

## Root Cause: page_template_hierarchy Cuts In at Priority 1

WooCommerce's `AbstractPageTemplate` registers the filter in `init()`:

```php
add_filter( 'page_template_hierarchy', array( $this, 'page_template_hierarchy' ), 1 );
```

The callback is a one-line `array_unshift`: when the page matches the Checkout/Cart scenario, its own template slug goes to the front of the candidate array. The source comments state it plainly — priority 1 is deliberate, to run first; extensions using the default priority 10 line up behind it.

WordPress resolves templates by walking the array and taking the first file that exists. With `checkout` at the front: if the theme ships a template file of that name, the theme's wins; if not, resolution lands on WooCommerce's registered plugin template of the same slug (`page-checkout.html`, containing the `woocommerce/page-content-wrapper` structure).

Why does manually setting `_wp_page_template` backfire? That meta only feeds the body class and the editor display — it never enters the filter's resolution order. Its signal and the filter's result travel on separate tracks, producing the stalemate "assignment shows active, render doesn't move".

## Fix: Delete _wp_page_template and Let the Hierarchy Filter Resolve

Delete the manually set template meta and let WooCommerce's resolution mechanism run:

```bash
wp post meta delete <page_id> _wp_page_template
```

After deletion, body class and render agree again: whatever the filter resolves is what renders, and the body class reflects it. No template meta should be set explicitly on pages WooCommerce owns — the hierarchy filter is the authoritative signal.

[A separate structural pitfall of the Cart template](/blog/woocommerce-fse-cart-placeholder-fix) (placeholders and SSR rendering) lives at the same template layer and is worth checking alongside Checkout.

<InfoBox variant="warning" title="Caution">

When verifying the fix, do not set `_wp_page_template` back "just to test" — that is the very source of the conflicting signal. The Cart page runs the same mechanism; if it shows the same assignment-ignored behavior, treat it identically, diagnosing with the same `data-block-name="woocommerce/page-content-wrapper"` marker.

</InfoBox>

## FAQ

### How does WooCommerce win template resolution?

It hooks `page_template_hierarchy` at priority 1, earlier than consumers at the default priority 10, and unshifts its template slug to the front of the hierarchy array. The WooCommerce source comments state this priority is intentional.

### Why do the body class and the actual render disagree?

Two separate signal sources: the body class is generated directly from the `_wp_page_template` meta, while the rendered template is decided by the hierarchy filter's array order. A manually set meta falls out of sync with the filter's result.

### How do I confirm the plugin template is the one rendering?

There is exactly one reliable marker: the `data-block-name` attribute on the main element. `data-block-name="woocommerce/page-content-wrapper"` means the plugin template renders; a theme-template main is built from the theme's own blocks and carries no such marker.

### Is the Cart page taken over the same way?

Yes. The same `AbstractPageTemplate` mechanism has two implementations, `CartTemplate` and `CheckoutTemplate`, covering both the Cart and Checkout pages — the same `data-block-name` marker diagnoses them.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
