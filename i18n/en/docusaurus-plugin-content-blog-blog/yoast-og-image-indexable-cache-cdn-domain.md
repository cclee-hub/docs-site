---
title: "Yoast og:image Not Following CDN? The indexable Cache Bypass"
description: "Yoast serves og:image from a cached indexable string that bypasses the attachment API, so CDN rewrites miss it. Filter wpseo_opengraph_image and reindex."
date: 2026-11-05
tags: [WordPress, Yoast, CDN, SEO]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I change the og:image Yoast SEO outputs?"
    a: "Hook the wpseo_opengraph_image filter, which every og:image passes through right before output. For stale URLs stored in the wp_yoast_indexable cache table, also rebuild the index with echo y | wp yoast index --reindex — the prompt has no --yes flag (verified on Yoast SEO 28.2)."
  - q: "Where does Yoast get the Open Graph image from?"
    a: "Not generated live: Yoast reads the wp_yoast_indexable table. In 28.2, add_from_indexable checks open_graph_image_meta first — a cached string with a full URL, returned as-is without ever touching the WordPress attachment API. Only the attachment-ID branch goes through the attachment API, which is why image-layer URL rewrites miss the cached path."
  - q: "Why is my og:image still on the old domain after a CDN migration?"
    a: "Historical pages have the pre-migration URL embedded in the open_graph_image_meta cache string. Yoast returns it verbatim, so rewrite layers attached to the attachment API never see it. In our scan of 233 pages, 95 files still served 404ing og:image URLs while twitter:image and JSON-LD images on the same pages were already on the CDN domain."
---

While doing the final verification pass on a CDN migration for a client site, a full crawl of 233 pages turned up 95 files whose `og:image` still pointed at the pre-migration domain and returned 404 — on the same pages where `twitter:image` and JSON-LD images were already serving the CDN domain. The rewrite pipeline covered the attachment output path, yet the social card image slipped through alone. This post records the diagnosis and the fix.

## TL;DR

1. Yoast SEO (verified on 28.2) picks `og:image` through `add_from_indexable`, which consumes the `open_graph_image_meta` cache string first. The old domain lives inside that cached string and is returned verbatim — **the WP attachment API is never touched**, so URL rewrites attached to the attachment layer cannot intercept it.
2. Two-step fix: hook a domain-swap callback on the `wpseo_opengraph_image` filter (shipped as `0.5.0` and deployed to both sites), then clear the cache with `echo y | wp yoast index --reindex`. Verification: all 95 affected files now return 200 (95/95), and a re-crawl of 233 pages shows zero og/twitter old-domain references.

<!-- truncate -->

This work happened during the CDN acceleration wrap-up of our [China site full-hosting case](/cases/waterpark-china-hosting-migration) — that engagement migrated two China sites into a locally managed infrastructure with image acceleration on cloud storage, and this leak was caught by the post-migration verification pass. The same WordPress stack is what [CCLEE Theme](/cclee-theme) is built on — the Yoast branch-order design is undocumented, and it decides which layer a domain-migration hook must sit on to be effective.

## The symptom: 95 og:image URLs, selectively 404ing

In the 233-page crawl, 95 files still served `og:image` pointing at the pre-migration domain and returning 404, while the `twitter:image` and JSON-LD images on the same pages were already on the CDN domain. The site-wide switch itself was done: with database replacement and the output-rewrite layer both live, visible `src`/`srcset` references to the old domain were at zero. The verification crawl produced this contrast:

| Channel | Old-domain leftovers |
|------|----------|
| Visible `src`/`srcset` | 0 |
| JSON-LD `primaryimage` | 0 |
| `twitter:image` | 0 |
| `og:image` | **95 files, all 404** |

```html
<!-- Head output on an affected page: two meta tags, one old, one new -->
<meta property="og:image" content="https://old-domain.example/wp-content/uploads/2026/03/hero.jpg" />
<meta name="twitter:image" content="https://cdn.example/wp-content/uploads/2026/03/hero.jpg" />
```

The selectivity was the starting clue: if the whole rewrite pipeline had failed, all four channels would leak together. Only og:image leaking means its output path differs from the other three.

## Root cause: the indexable cache string bypasses the attachment API

Yoast does not generate social image URLs live for performance reasons — it reads the `wp_yoast_indexable` table cache. On Yoast SEO 28.2, `Open_Graph_Image_Generator::add_from_indexable` picks the image in this branch order (simplified):

```php
// Yoast SEO 28.2 add_from_indexable branch order (simplified from observed behavior)
if ( ! empty( $indexable->open_graph_image_meta ) ) {
    // ① Image meta JSON: embeds a full URL, returned verbatim — attachment API untouched
    return $indexable->open_graph_image_meta;
}
if ( ! empty( $indexable->open_graph_image_id ) ) {
    // ② Attachment ID: only this branch goes through the WP attachment API
    return $this->image->generate_from_attachment_id( $indexable->open_graph_image_id );
}
// ③ Other cached fields as fallback
```

The leak lives in branch ①: images uploaded before the migration had their full old-domain URL stored in the `open_graph_image_meta` cache string. When Yoast hits it, the string is printed as-is — no attachment lookup, nothing that passes through `wp_get_attachment_image`-style APIs. Every rewrite hook in our pipeline sat on the attachment API side, so the cached old domain sailed past all of them and kept serving 404ing URLs until the indexable was rebuilt.

One detour worth recording: on some pages the `twitter:image` tag was missing entirely, and the first instinct was "the twitter channel is leaking too." Reading the source showed it's by design — `generate_twitter_image` only emits a tag when `twitter_image_source` is `set-by-user`; with a featured image and OG enabled it returns an empty string, and `Abstract_Indexable_Tag_Presenter::present` skips empty values. **A missing twitter tag ≠ failed rewrite** — keep it off the leak list.

## The fix: output filter + reindex

Two layers: a filter guards live output, and a reindex clears the cached old domain.

**Layer 1: an egress domain-swap filter.** Yoast ships the `wpseo_opengraph_image` filter, and every og:image passes through it before output. Hook a swap callback:

```php
add_filter( 'wpseo_opengraph_image', function ( $image ) {
    if ( ! is_string( $image ) || false === strpos( $image, 'https://old-domain.example' ) ) {
        return $image;
    }
    return str_replace( 'https://old-domain.example', 'https://cdn.example', $image );
} );
```

Branch ① emits the "image meta JSON" string form. If your `open_graph_image_meta` holds a JSON array rather than a plain URL, parse it inside the callback, swap the domains, and re-encode before returning. For plain-URL caches (our case) the snippet above is enough.

**Layer 2: rebuild the indexable cache.** The filter guarantees correct output, but the old domain still sits in the cache. Rebuild with the Yoast CLI:

```bash
# The --reindex prompt has no --yes flag (verified on Yoast SEO 28.2); pipe a y
echo y | wp yoast index --reindex
```

That undocumented `--yes` gap is its own trap: passing `--yes` errors out as an unknown option, and the interactive prompt hangs any non-interactive context. Piping `y` is the only non-interactive path.

**Verification results**:

- Stale indexable counts to zero: og-image-related count 186→0, meta count 174→0
- Full fetch of all 95 affected files: **95/95 return 200**
- Re-crawl of 233 pages: zero old-domain references in `og:image` and `twitter:image`, matching the pre-fix channel distribution

The filter-plus-reindex combination shipped as plugin version `0.5.0` and was deployed to both sites (release package sha256 verified against the local zip; diff confirmed as purely additive).

## Boundaries and variants

- **Schema image channel today**: the `Main_Image` inside JSON-LD `@graph` goes through the attachment API and is already covered by the existing rewrite hook — a full refscan found zero broken references. An earlier scan round reported schema breakage, later corrected: the scanner was counting non-image references, and the main-image channel was actually clean. If a future Yoast version switches schema images to indexable-string output too, hook `wpseo_schema_graph` the same way.
- **New uploads are unaffected**: images uploaded after the migration read their URLs from the attachment library and are naturally on the CDN domain. The leak only affects historical content whose indexable cache predates the migration.
- **Same family, different symptom**: cached-string passthrough is not the only quiet CDN behavior — we previously hit Hostinger's CDN [blocking WordPress REST API media uploads with 405](/blog/2026/05/26/hostinger-cdn-blocks-wp-rest-api-media-upload). The diagnostic instinct is the same: figure out which layer actually handled the request or produced the output before blaming anyone.

<InfoBox variant="warning" title="Things to watch">

- An old og:image ≠ a broken site-wide rewrite: check channels separately (src/srcset, JSON-LD, twitter, og) — selective leakage is itself the diagnostic clue.
- A missing twitter tag is expected behavior for Yoast's featured-image + OG combination; don't count it as a rewrite failure.
- When putting `wp yoast index --reindex` into cron or automation, pipe `echo y |` — the interactive prompt will hang any environment without a terminal.

</InfoBox>

## Frequently asked questions

### How do I change the og:image Yoast SEO outputs?

Hook the wpseo_opengraph_image filter, which every og:image passes through right before output. For stale URLs stored in the wp_yoast_indexable cache table, also rebuild the index with echo y | wp yoast index --reindex — the prompt has no --yes flag (verified on Yoast SEO 28.2).

### Where does Yoast get the Open Graph image from?

Not generated live: Yoast reads the wp_yoast_indexable table. In 28.2, add_from_indexable checks open_graph_image_meta first — a cached string with a full URL, returned as-is without ever touching the WordPress attachment API. Only the attachment-ID branch goes through the attachment API, which is why image-layer URL rewrites miss the cached path.

### Why is my og:image still on the old domain after a CDN migration?

Historical pages have the pre-migration URL embedded in the open_graph_image_meta cache string. Yoast returns it verbatim, so rewrite layers attached to the attachment API never see it. In our scan of 233 pages, 95 files still served 404ing og:image URLs while twitter:image and JSON-LD images on the same pages were already on the CDN domain.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
