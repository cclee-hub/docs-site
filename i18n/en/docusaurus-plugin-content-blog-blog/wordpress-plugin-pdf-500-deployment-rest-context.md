---
title: "WordPress PDF Download 500? Vendor, REST Context, tempDir"
description: "PDF downloads fail with critical error, then 500? Three pits in one chain: vendor missing from git, REST skipping wp-admin includes, mPDF temp dir unwritable."
date: 2026-10-10
tags: [WordPress, WooCommerce, mPDF, REST API, Docker Deployment]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does wp eval work while the REST endpoint returns 500?"
    a: "The CLI environment loads full WordPress including wp-admin/includes/, while REST requests never load that directory. Code depending on admin-only functions like wp_tempnam runs fine under wp eval and Fatal Errors inside REST — the two contexts load different file sets."
  - q: "How do I find the actual exception behind a REST 500?"
    a: "Call the plugin's internal method directly with wp eval-file, bypassing the REST route and permission checks — the exception stack arrives in one step, far more useful than an 858-byte 500 page."
  - q: "Should a containerized WordPress plugin deployment run composer install on the server?"
    a: "Don't count on it — in a CI plus rsync pipeline the server never runs composer install. The vendor directory must be committed to git and land on the server through rsync; a plugin .gitignore that excludes /vendor/ ships a broken plugin."
  - q: "Why is a library's built-in temp dir unwritable inside a container?"
    a: "rsync preserves the source machine's owner UID (say 1001) while PHP-FPM inside the container runs as another identity (www-data, UID 82), so the default temp dir under vendor/ becomes unwritable — and volume-mounted filesystems often refuse chown. Point tempDir at sys_get_temp_dir() explicitly."
---

Clicking the PDF catalog download on a product page first produces WordPress's "There has been a critical error on this website"; after the missing-library problem is fixed, the same endpoint switches to HTTP 500 — three independent pits, stacked into one failure chain.

Ran into this while building [CCLEE B2B](/docs/cclee-b2b-general), a WooCommerce B2B enhancement plugin covering customer group management, tiered pricing, and bulk ordering — the PDF catalog feature walked through all three.

## TL;DR

| Pit | Root Cause | Fix |
|-----|-----------|-----|
| Critical error | vendor never entered git, rsync deployed without libraries | .gitignore exception + force-commit vendor |
| REST endpoint 500 | admin-only functions absent in REST context | `function_exists` guard + `tempnam()` fallback |
| Still 500 after fixes | mPDF's default temp dir unwritable in container | point `tempDir` at `sys_get_temp_dir()` |

All three share one backdrop: a CI + rsync containerized deployment pipeline. None of them reproduces on a standard LAMP host — they are almost pure products of the container-plus-REST combination.

## Pit 1: "There has been a critical error" — vendor never reached the server

**Symptom**: everything works locally; after deployment, clicking download yields WordPress's generic fatal error page.

**Root cause**: `vendor/` (the mPDF library) never reached the server. The chain is doubled: the plugin's own `.gitignore` excludes `/vendor/`, and the repo root `.gitignore` carries both `vendor/` and `plugins/` rules, masking tracked files at the top level. CI checkout skips untracked files, rsync faithfully mirrors a library-less directory, and on the server `require_once vendor/autoload.php` fatals immediately.

**Fix**: remove `/vendor/` from the plugin `.gitignore`, add an exception at the repo root, then force-commit:

```bash
git add -f wp/plugins/cclee-b2b/vendor/
```

When a WordPress plugin ships via CI + rsync, the server never runs `composer install` — vendor must go into git as part of the source.

## Pit 2: wp eval Works, REST Endpoint 500 — Admin Functions Missing

**Symptom**: with vendor in place, calling the PDF generation method through `wp eval` works; the REST endpoint `/wp-json/cclee-b2b/v1/pdf-catalog` returns 500.

**Root cause**: two calls incompatible with the REST context. `wp_tempnam()` is defined in `wp-admin/includes/file.php` — REST requests never load that directory, so the call fatals. `WC()->shop_management` is not a public WooCommerce property either, and the fallback path fatals the same way. `wp eval` avoids all of this precisely because the CLI loads full WordPress including admin files.

**Fix**: guard admin functions with an existence check and fall back to PHP native:

```php
$tmp = function_exists( 'wp_tempnam' )
	? wp_tempnam( $filename )
	: tempnam( sys_get_temp_dir(), 'pdf' );
```

The shop name moves to the public API: `get_bloginfo( 'name' )`. Inside REST, treat everything under `wp-admin/includes/` as nonexistent.

## Pit 3: Dependencies in Place, Still 500 — mPDF Temp Dir Unwritable

**Symptom**: the class loads, no more fatals, yet REST still returns 500. The server access log keeps a single 858-byte response.

**Root cause**: mPDF defaults to `vendor/mpdf/mpdf/tmp/` as its temp directory; rsync preserves the source owner UID 1001 while PHP-FPM inside the container runs as www-data (UID 82). The directory is unwritable and the mPDF constructor throws. Attempting `chown` inside the container fails too — the volume-mounted filesystem doesn't allow it.

**Fix**: point the temp directory at the system `/tmp` explicitly:

```php
$mpdf_tmp = sys_get_temp_dir() . '/mpdf';
if ( ! is_dir( $mpdf_tmp ) ) {
	wp_mkdir_p( $mpdf_tmp );
}

$mpdf = new \Mpdf\Mpdf( array(
	'mode'    => 'utf-8',
	'format'  => 'A4',
	'tempDir' => $mpdf_tmp,
) );
```

There is a shortcut for diagnosing this class of 500: `wp eval-file` calls the internal method directly, bypassing the REST route and permission checks, and the exception stack arrives in one step. Silent skips of this kind are not unique to PDF generation — [PPCP buttons silently skipping render](/blog/woocommerce-ppcp-buttons-not-rendering-form-cart) is another example.

<InfoBox variant="warning" title="Caution">

Verify the three fixes in order: vendor lands first, then test the REST context, and only then the temp directory — skipping steps misattributes which fix killed the 500. Also, the `function_exists` guard is not a long-term shape; if the plugin claims to run outside admin contexts, its temp-file logic should never touch `wp-admin/includes/` at all.

</InfoBox>

## FAQ

### Why does wp eval work while the REST endpoint returns 500?

The CLI environment loads full WordPress including `wp-admin/includes/`, while REST requests never load that directory. Code depending on admin-only functions like `wp_tempnam` runs fine under `wp eval` and Fatal Errors inside REST — the two contexts load different file sets.

### How do I find the actual exception behind a REST 500?

Call the plugin's internal method directly with `wp eval-file`, bypassing the REST route and permission checks — the exception stack arrives in one step, far more useful than an 858-byte 500 page.

### Should a containerized WordPress plugin deployment run composer install on the server?

Don't count on it — in a CI plus rsync pipeline the server never runs `composer install`. The vendor directory must be committed to git and land on the server through rsync; a plugin `.gitignore` that excludes `/vendor/` ships a broken plugin.

### Why is a library's built-in temp dir unwritable inside a container?

rsync preserves the source machine's owner UID (say 1001) while PHP-FPM inside the container runs as another identity (www-data, UID 82), so the default temp dir under `vendor/` becomes unwritable — and volume-mounted filesystems often refuse chown. Point `tempDir` at `sys_get_temp_dir()` explicitly.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
