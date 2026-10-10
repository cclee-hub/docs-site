---
title: "WooCommerce Variable Product Price Not Changing? Parent Only"
description: "wp wc product update only writes the parent product. The storefront and JSON-LD read variation _price, so nothing changes. Update every variation instead."
date: 2026-10-10
tags: [WordPress, WooCommerce, WP-CLI, E-commerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does the admin show the new price while the storefront keeps the old one?"
    a: "Two separate read paths: the parent product's edit screen reads the parent's own meta, while the storefront price and JSON-LD both come from the variation's _price. Updating the parent only refreshes the admin-facing copy; the storefront path never moves."
  - q: "Can I just UPDATE the _price rows in the database?"
    a: "Not recommended. Writing to wp_postmeta directly leaves the wc_product_meta_lookup table out of sync, and some read paths keep returning the old price. Use wp wc product_variation update so WooCommerce's CRUD syncs both stores."
  - q: "Is there a way to update all variations in bulk?"
    a: "wp wc product_variation update accepts one VID per call, so bulk updates need a script loop: list every variation ID with --parent first, then run the update for each."
  - q: "Do Simple products have this problem too?"
    a: "No. Simple products have no variations, so the price wp wc product update writes is the storefront price. The non-cascading update is a structural issue unique to Variable products."
---

Running `regular_price` updates against a Variable product via WP-CLI completes with a success message and the admin shows the new price — yet the product page and the JSON-LD keep displaying the old one.

Ran into this while building [Cross-border Product Listing Assistant](/docs/ai-product-listing) — one-click product sourcing with AI-generated descriptions and pricing, published to WooCommerce after review — and stepped on a quiet WooCommerce behavior.

## TL;DR

`wp wc product update` on a Variable product writes the parent product's meta only — no iteration, no cascade, no hint. The storefront price and the JSON-LD schema both read the variation's `_price`, while the parent price serves only the admin display, and the `wc_product_meta_lookup` table keeps the old value too. The fix: list every variation under the parent, then update them one by one with `wp wc product_variation update`.

## Symptom: Command Succeeds, Storefront Price Doesn't Move

```bash
wp wc product update 187 --regular_price="16.00" --user=admin --allow-root
# Success: Updated product 187.
```

Three observations make up the full picture:

1. The command returns success, without any warning;
2. In the admin, the parent product's price field already shows the new value;
3. The product page, price filters, and JSON-LD structured data all still show the old price.

Searches like "price not updating" or "changed price but storefront unchanged" all describe this path. The confusing part is the success message — it truthfully reports "parent updated", it just never claims the parent is where the storefront price comes from.

## Root Cause: The Parent Price Is Admin Display, the Real Price Lives in Variations

A Variable product's price storage is layered: the parent's `regular_price` in meta serves the admin edit screen; the product page display, cart calculations, and the JSON-LD schema all read each variation's own `_price`.

`wp wc product update` stops exactly at the parent layer — it does not iterate variations, does not cascade, and does not warn. After it writes the parent meta:

- Every variation's `_price` is untouched;
- WooCommerce's performance lookup table `wc_product_meta_lookup` (created in its `class-wc-install.php`) also keeps the old value, so read paths going through the lookup table return the old price as well.

Of a three-layer read system, only the least important layer got updated. Nothing along the chain ever says "variations not synced" — which is what makes this expensive to diagnose: every step looks like success.

## Fix: Update the Variations One by One

First list every variation under the parent:

```bash
wp wc product list --parent=187 --fields=id,sku,regular_price --user=admin --allow-root
```

Then update them individually (`wp wc product_variation update` accepts one VID per call):

```bash
wp wc product_variation update 187 1201 --regular_price="16.00" --user=admin --allow-root
wp wc product_variation update 187 1202 --regular_price="16.00" --user=admin --allow-root
```

Updating through the variation endpoint goes through WooCommerce's CRUD: the variation meta and the `wc_product_meta_lookup` table get synced by WooCommerce itself, so the storefront, JSON-LD, and filters all read one consistent new price. For products with many variations, a loop script handles it — one VID per call.

All commands here run inside a Docker container; see [Running WP-CLI in Docker](/blog/docker-wordpress-wp-cli) for the containerized setup.

<InfoBox variant="warning" title="Caution">

The `wp wc` command family requires an authenticated user — never drop `--user`; and do not take the shortcut of a raw database UPDATE — bypassing CRUD desyncs the `wc_product_meta_lookup` table from the meta, and the storefront can still read the old price.

</InfoBox>

## FAQ

### Why does the admin show the new price while the storefront keeps the old one?

Two separate read paths: the parent product's edit screen reads the parent's own meta, while the storefront price and JSON-LD both come from the variation's `_price`. Updating the parent only refreshes the admin-facing copy; the storefront path never moves.

### Can I just UPDATE the _price rows in the database?

Not recommended. Writing to `wp_postmeta` directly leaves the `wc_product_meta_lookup` table out of sync, and some read paths keep returning the old price. Use `wp wc product_variation update` so WooCommerce's CRUD syncs both stores.

### Is there a way to update all variations in bulk?

`wp wc product_variation update` accepts one VID per call, so bulk updates need a script loop: list every variation ID with `--parent` first, then run the update for each.

### Do Simple products have this problem too?

No. Simple products have no variations, so the price `wp wc product update` writes is the storefront price. The non-cascading update is a structural issue unique to Variable products.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
