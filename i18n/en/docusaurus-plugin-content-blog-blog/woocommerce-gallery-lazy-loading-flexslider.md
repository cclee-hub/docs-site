---
title: "WooCommerce Gallery Images Not Loading? FlexSlider Conflict"
description: "Gallery images never load past the first slides? WordPress lazy loading plus FlexSlider off-screen layout blocks the request. Fix with a small PHP filter."
date: 2026-10-10
tags: [WordPress, WooCommerce, FlexSlider, Theme Development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why do images with a src attribute never trigger a network request?"
    a: "loading=\"lazy\" hands the timing to the browser: when an image sits beyond the preload threshold (about 1250px on desktop Chrome), IntersectionObserver never fires and the request is never sent. A src value only means the DOM is ready — loading depends on the visibility check."
  - q: "Can I just remove all loading=\"lazy\" attributes site-wide?"
    a: "It fixes the gallery, but every image below the fold switches to immediate loading, costing bandwidth and competing with LCP resources. Keep global lazy loading and strip the attribute only for the woocommerce_single size with a filter."
  - q: "Which slider libraries cause the same problem?"
    a: "Any horizontal slider that moves non-active frames out of the viewport: FlexSlider, Swiper, Slick, and similar. If the slider ships its own lazy-loading module (like Swiper's lazy option), use that and remove the native loading attribute to avoid conflicting mechanisms."
  - q: "Since which WordPress version does this problem exist?"
    a: "WordPress 5.5 (2020) introduced native lazy loading, and since 5.9 every content image except the first gets loading=\"lazy\" by default. The problem appears whenever a product gallery uses a translating slider, regardless of WooCommerce or slider version."
---

Flipping through the product gallery thumbnails on a WooCommerce product page, everything works until slide seven — from there the main image stays blank, and the DevTools Network panel shows no request was ever sent.

Ran into this while building a [minimal FSE WordPress theme](/cases/cclee-theme-fse-developer) for a client — a full-site-editing theme for corporate sites and lightweight e-commerce, with WooCommerce compatibility kept intentionally thin. The issue was ultimately fixed inside the theme with a single filter.

## TL;DR

WordPress 5.5+ automatically injects `loading="lazy"` into content images, while WooCommerce's FlexSlider gallery moves non-active slides out of the viewport with CSS transforms. Together, the IntersectionObserver that native lazy loading depends on never sees those images enter its trigger range — no request is ever sent. The fix: a `wp_get_attachment_image_attributes` filter that removes the `loading` attribute for the `woocommerce_single` size only.

## Symptom: Gallery Images Not Loading, No Request in DevTools

The first few gallery images render fine; from a certain slide onward the main image area stays blank. The same problem surfaces under searches like "gallery images not showing" or "product images won't load".

DevTools shows three facts at once:

1. The `<img>` node exists with a valid `src` attribute;
2. The `<img>` carries `loading="lazy"`;
3. The Network panel has no matching request — not a failed load, the browser never started the download.

"A src but no request" is the dividing line between this problem and image 404s or broken paths: those show requests and errors, this one is completely silent.

## Root Cause: Native Lazy Loading Stacked on Slider Off-Screen Layout

Every gallery image sits in the state "has a src, not visible, waiting for the browser to decide" — and FlexSlider's layout makes the "visible" condition permanently unreachable. The mechanism has three layers:

**Layer 1: WordPress injects lazy loading automatically.** Since WordPress 5.5, images output by `wp_get_attachment_image()` carry `loading="lazy"` by default (the first image excepted). Product gallery main images use the `woocommerce_single` size, so all of them match this rule. The intent is bandwidth savings: only load images near the viewport.

**Layer 2: FlexSlider moves non-active frames off-screen.** FlexSlider arranges all slides in one horizontal strip; slides outside the current frame sit beyond the viewport and swap positions via CSS transforms.

**Layer 3: IntersectionObserver's trigger condition is never met.** Browser lazy loading is not "load when visible" but "preload when within a threshold" — about 1250px for images on desktop Chrome, expanding to 2500px on slow connections. In a horizontal slider, the distance between slide N and the viewport grows linearly with its index; past the threshold, IntersectionObserver never fires. In practice, from slide seven onward not a single request goes out.

The entire chain throws no error: the img has a src, the page logs no JS exception, the server log is clean — the browser simply classified those images as "not needed yet". That is what makes this expensive to diagnose: each component behaves exactly as documented, and the combination deadlocks.

## Fix: Remove the loading Attribute for the Gallery Size Only

A `wp_get_attachment_image_attributes` filter that unsets `loading` for `woocommerce_single` images returns gallery images to default eager loading, and the problem disappears.

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

Drop it into the theme's `functions.php` or an inc module; child theme users should put it in the child's `functions.php` without touching the parent.

Why it works: once the `loading` attribute is gone, the browser falls back to immediate loading — requests fire during HTML parsing, and FlexSlider's positioning only affects display from then on, never loading. Ordinary content images never pass through a slider, so their lazy loading works and should stay; gallery images have their visibility managed by the slider, so the loading decision goes back to the browser default.

[CCLEE Theme](/cclee-theme) ships this filter built in (`inc/woocommerce.php`) — update the theme and you are covered.

If you are also chasing [other WooCommerce block theme rendering issues](/blog/woocommerce-block-theme-troubleshooting-guide), gallery problems tend to appear alongside template structure issues, so it is worth reviewing both.

<InfoBox variant="warning" title="Caution">

Do not remove `loading` globally for convenience — immediate loading for everything below the fold slows the page down, and lazy loading is a pure win for body images. Keep the condition locked to the `woocommerce_single` size. If you switch sliders (e.g. Swiper), check whether the new slider ships its own lazy-loading module first to avoid stacking two mechanisms.

</InfoBox>

## FAQ

### Why do images with a src attribute never trigger a network request?

`loading="lazy"` hands the timing to the browser: when an image sits beyond the preload threshold (about 1250px on desktop Chrome), IntersectionObserver never fires and the request is never sent. A src value only means the DOM is ready — loading depends on the visibility check.

### Can I just remove all loading="lazy" attributes site-wide?

It fixes the gallery, but every image below the fold switches to immediate loading, costing bandwidth and competing with LCP resources. Keep global lazy loading and strip the attribute only for the `woocommerce_single` size with a filter.

### Which slider libraries cause the same problem?

Any horizontal slider that moves non-active frames out of the viewport: FlexSlider, Swiper, Slick, and similar. If the slider ships its own lazy-loading module (like Swiper's lazy option), use that and remove the native `loading` attribute to avoid conflicting mechanisms.

### Since which WordPress version does this problem exist?

WordPress 5.5 (2020) introduced native lazy loading, and since 5.9 every content image except the first gets `loading="lazy"` by default. The problem appears whenever a product gallery uses a translating slider, regardless of WooCommerce or slider version.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
