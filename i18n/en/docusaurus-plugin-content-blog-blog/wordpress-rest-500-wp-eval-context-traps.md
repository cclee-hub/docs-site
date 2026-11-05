---
title: "wp eval Works but REST 500s? Three WordPress Context Traps"
description: "wp eval runs while the live REST endpoint 500s: vendor missing from deploys, REST skipping wp-admin includes, an mPDF tempDir unwritable across UIDs."
date: 2026-11-05
tags: [WordPress, REST API, WP-CLI, mPDF, WooCommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does my WordPress REST API endpoint return a 500 internal server error?"
    a: "Work through three layers: is the code itself deployed (vendor/ present on the server), is every function REST-safe (REST never loads wp-admin/includes/, so admin-only functions like wp_tempnam throw Call to undefined function), and are all disk paths writable by the PHP runtime user. The 500 in our PDF endpoint stacked all three."
  - q: "How do I fix mPDF's 'temporary files directory is not writable' error?"
    a: "Stop relying on mPDF's default tempDir inside vendor/mpdf/mpdf/tmp/ — under containerized deploys the rsync-preserved owner (UID 1001 in our case) never matches the PHP-FPM user www-data (UID 82), and volume-mounted filesystems refuse chown. Pass an explicit tempDir under sys_get_temp_dir() and create it with wp_mkdir_p."
  - q: "Why does wp eval work while the live REST endpoint fails?"
    a: "CLI boots a full WordPress including wp-admin/includes/; a REST request loads only the core runtime. So wp eval proves the business logic but not the REST context — verify endpoints by hitting them directly, or reflect-invoke the internal method with wp eval-file to get the real stack trace."
---

Three quiet WordPress plugin behaviors surfaced while building [CCLEE B2B](/docs/cclee-b2b-general) — a WooCommerce B2B plugin covering user management, differential pricing, quoting, and bulk ordering. The entry point was its PDF catalog download: on production the button returned the generic fatal-error page while the very same logic ran via `wp eval`; fixing the first layer exposed the second, and the second the third. The three root causes live on three different layers — deploy, context, filesystem — and they fit in one post.

## TL;DR

1. **Deploy layer**: CI/rsync deploys never run `composer install`. If the plugin's `vendor/` is hidden by stacked `.gitignore` rules (plugin-level `/vendor/` plus repo-level `vendor/` and `plugins/`), it never enters git, and the first `new` after `require autoload` is a Fatal. Fix: remove the ignore chain, commit vendor, smoke-test with `class_exists` after deploy.
2. **Context layer**: REST requests never load `wp-admin/includes/`, so admin-only functions like `wp_tempnam()` throw `Call to undefined function`. `wp eval` works because CLI loads full WordPress — "it works in CLI" proves nothing about the REST context. Fix: `function_exists` guard plus a `tempnam(sys_get_temp_dir(), ...)` fallback.
3. **Filesystem layer**: mPDF's default temp directory sits at `vendor/mpdf/mpdf/tmp/`. In the container, rsync preserved owner UID 1001 while PHP-FPM runs as www-data (UID 82), `is_writable` returns false, and `chown` fails on the volume-mounted filesystem. Fix: pass an explicit `tempDir` under the system temp directory at construction.

<!-- truncate -->

## The symptom: CLI passes, production 500s — and each fix reveals the next layer

Round one: clicking the PDF download returned the generic fatal error. Running the PDF class directly on the server via `wp eval` — success. With "the logic is fine" as the working theory, the deploy layer got fixed, and the symptom changed shape: the endpoint `/wp-json/cclee-b2b/v1/pdf-catalog` returned HTTP 500 while `wp eval` still passed. Round three: still 500, but the failure point had moved from "class missing" to "directory unwritable".

The 500 responses in the access log carried only 858 bytes of body — the size of the generic fatal-error page, meaning PHP threw an uncaught exception rather than the endpoint returning a business error.

"Works in CLI, fails over REST" is the strongest misleading signal in this whole story: it proves the business logic is correct, but it proves the wrong thing — the two entry points boot different contexts. The three root causes came out in exactly the order "fix one layer to see the next".

## Root cause one: deploy — a gitignore chain dropped vendor wholesale

CI/rsync deployments never run composer install, and a gitignore chain can keep vendor out of git entirely — the server ends up with no dependency library at all. PDF generation depends on the composer package mPDF, and every link in the chain looked reasonable on its own:

1. The plugin's own `.gitignore` listed `/vendor/` (keep it out of git);
2. The repo root `.gitignore` covered it twice more with `vendor/` and `plugins/`;
3. CI checked out with `actions/checkout` — untracked files simply don't exist;
4. rsync deployed the working tree as-is → no `vendor/` on the server;
5. `require vendor/autoload.php` threw Fatal on the missing file — treated as "a code problem" in round one — and `new \Mpdf\Mpdf()` died on the undefined class.

The server never runs `composer install` — in a CI/rsync deployment, **vendor must be in git**. The fix was three moves: drop `/vendor/` from the plugin's `.gitignore`, add a `!wp/plugins/<plugin>/vendor/` exception at the repo root, and force-add the directory.

One smoke command after every deploy:

```bash
docker exec wp_cli wp eval 'echo class_exists("Mpdf\\Mpdf") ? "OK" : "MISSING";' --allow-root
```

## Root cause two: context — REST never loads wp-admin/includes

REST requests never load files under wp-admin/includes/, so admin-only functions throw undefined-function errors in that context outright. With vendor in place, `wp eval` still passing while REST still 500'd meant two calls had stepped on exactly this layer:

| Call | Why it fails under REST |
|------|-------------------|
| `wp_tempnam()` | Defined in `wp-admin/includes/file.php`, which REST requests never load → `Call to undefined function` |
| `WC()->shop_management->get_shop_name()` | `shop_management` is not a standard WooCommerce property → Fatal on the fallback branch |

`wp eval` steps on neither landmine because CLI loads full WordPress, `wp-admin/includes/` included. Any admin-only function — `wp_tempnam`, `get_file_description`, and friends — is a landmine under REST.

The fix:

```php
// Admin-only functions: guard with function_exists + system temp fallback
if ( ! function_exists( 'wp_tempnam' ) ) {
    $tmp = tempnam( sys_get_temp_dir(), 'pdf' );
} else {
    $tmp = wp_tempnam( $filename );
}

// Non-standard global-object properties: switch to the public API
$shop_name = get_bloginfo( 'name' );
```

## Root cause three: filesystem — mPDF's default tempDir crosses a UID boundary

mPDF defaults its temp directory to a path inside the vendor package, which under containerized deploys crosses a UID boundary and becomes unwritable — the constructor throws outright. With both earlier layers fixed, this was the source of the surviving 500:

1. mPDF defaults its temp directory to `vendor/mpdf/mpdf/tmp/`;
2. The CI deploy rsynced vendor with `--copy-links`, preserving owner UID 1001;
3. PHP-FPM inside the container runs as `www-data` (UID 82), so `is_writable()` returns false;
4. mPDF checks its tempDir at construction → throws → REST 500;
5. Attempting `chown` to fix it — the volume-mounted filesystem refuses, closing that road entirely.

The fix: point the temp directory at the system temp area, writable everywhere:

```php
$mpdf_tmp = sys_get_temp_dir() . '/mpdf';
if ( ! is_dir( $mpdf_tmp ) ) {
    wp_mkdir_p( $mpdf_tmp );
}

$mpdf = new \Mpdf\Mpdf( array(
    'mode'    => 'utf-8',
    'format'  => 'A4',
    'tempDir' => $mpdf_tmp,
    // ...
) );
```

## The method: bypass REST permissions to get the real stack trace

The biggest time-saver across all three rounds: reproduce without the browser, by reflect-invoking the internal method through `wp eval-file` and reading the exception directly:

```php
<?php
$pdf = CCLEE_B2B_PDF_Catalog::get_instance();
$ref = new ReflectionMethod( $pdf, 'generate_pdf_to_file' );
$ref->setAccessible( true );
$result = $ref->invoke( $pdf, [ wc_get_product( 187 ) ], 'single' );
echo is_wp_error( $result ) ? $result->get_error_message() : 'OK: ' . filesize( $result ) . ' bytes';
```

```bash
docker exec -i wp_cli wp eval-file - --allow-root < check-pdf.php
```

Reflection sidesteps REST's permission checks and context gaps, exposing exactly where the generation action itself fails — that's how the unwritable directory jumped out of the stack in round three. One caveat: this stack still won't show context-layer errors (the undefined-function class of failures); verify the two layers separately.

## Boundaries and variants

- **CLI passing ≠ endpoint passing**: the reverse lesson matters just as much — when you must reproduce REST behavior from CLI, remember which files REST never loads rather than expecting CLI to surface them. Any function living under `wp-admin/includes/` gets a `function_exists` guard first in REST-facing code.
- **Third-party libraries' default-path assumptions**: mPDF is not the only composer package that defaults writable paths inside vendor/. Any library touching the disk (temp files, cache, logs) deserves a check before containerized deployment: does the default path's owner match the runtime UID? If not, move it to `sys_get_temp_dir()` explicitly at construction/configuration time.
- **rsync owner preservation**: `--copy-links` keeps source owners. When the deploy host and the container disagree on UID schemes, vendor directories end up wrongly owned as a rule — rather than fixing ownership directory by directory, make the code independent of deploy-directory writability.

<InfoBox variant="warning" title="Things to watch">

- "It runs in wp eval" is not acceptance for a REST endpoint; the two boot different file sets. Accept by hitting the real endpoint.
- Treat the admin-only function inventory as a fixed checklist for REST-facing plugin code: `wp_tempnam`, `get_file_description`, etc. — always `function_exists` first under REST.
- On Permission denied inside containers, check whether the filesystem allows `chown` at all (volume mounts often refuse) before choosing between fixing ownership and fixing path assumptions in code.

</InfoBox>

## Frequently asked questions

### Why does my WordPress REST API endpoint return a 500 internal server error?

Work through three layers: is the code itself deployed (vendor/ present on the server), is every function REST-safe (REST never loads wp-admin/includes/, so admin-only functions like wp_tempnam throw Call to undefined function), and are all disk paths writable by the PHP runtime user. The 500 in our PDF endpoint stacked all three.

### How do I fix mPDF's 'temporary files directory is not writable' error?

Stop relying on mPDF's default tempDir inside vendor/mpdf/mpdf/tmp/ — under containerized deploys the rsync-preserved owner (UID 1001 in our case) never matches the PHP-FPM user www-data (UID 82), and volume-mounted filesystems refuse chown. Pass an explicit tempDir under sys_get_temp_dir() and create it with wp_mkdir_p.

### Why does wp eval work while the live REST endpoint fails?

CLI boots a full WordPress including wp-admin/includes/; a REST request loads only the core runtime. So wp eval proves the business logic but not the REST context — verify endpoints by hitting them directly, or reflect-invoke the internal method with wp eval-file to get the real stack trace.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
