---
title: "URL Rewrites Miss JSON Images? Escape Forms Are the Reason"
description: "Slider images still serve the old domain after migration: URLs inside JSON escape forms dodge plain str_replace. Three-form replace plus a fixpoint check."
date: 2026-11-05
tags: [WordPress, CDN, Slider Revolution, JSON]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I safely search and replace URLs in the WordPress database?"
    a: "PHP serialized fields carry a s:length: prefix — a plain str_replace corrupts the structure once the URL length changes, so go through unserialize/serialize or a length-safe replace tool. JSON fields have no length prefix and can be replaced byte-for-byte per escape form. We closed out 204 occurrences across the three tables — slides, sliders7, slides7 — this way with intact structure."
  - q: "Why doesn't plain str_replace catch URLs inside JSON?"
    a: "The same URL exists in three byte-stream forms: plain (https://), single-escaped (https:\\/\\/) and double-escaped (https:\\\\/\\\\/). In the single-escaped form there is no contiguous https:// substring — the slashes are broken up by backslashes, so any plain-text replacement silently matches nothing. Inspect the stored form first, then replace per form."
  - q: "Will Slider Revolution write the old domain back after saving?"
    a: "Verify with a two-hop save fixpoint: save once, diff the database row's byte stream, save again, diff again. If two consecutive saves leave the stored bytes unchanged, the editor path writes back exactly what it read. On our Slider Revolution install both hops landed unchanged — the replacement is one-shot."
---

During the final verification pass of a CDN migration for a client site, the homepage slider's large images and a 47MB background video were still serving from the origin domain, hogging a 5Mbps shared uplink — while the `noscript` fallback inside the very same element already pointed at the CDN domain. Half the element migrated, half didn't.

## TL;DR

1. URLs don't only live in `src="..."`. Slider plugins store image paths inside inline JSON (`"src":"..."` — colon form), often further escaped into `https:\/\/` byte streams. An attribute-grammar rewrite surface (`src=`/`srcset=`/`href=` with a whitespace-required prefix) misses all of these, and a plain `str_replace` misses the escaped forms too.
2. Close it with a storage-side three-form replace: inspect the stored form first, then replace plain, single-escaped, and double-escaped variants separately. We closed 204 occurrences across the three `slides`/`slides7` tables of Slider Revolution. PHP serialized fields must go through the serialization engine; JSON fields can be replaced byte-for-byte.
3. Then run a two-hop save fixpoint: two consecutive editor saves that leave the stored byte stream unchanged prove the save path writes back no old domain.

<!-- truncate -->

This is the second pitfall write-up from our [China site full-hosting case](/cases/waterpark-china-hosting-migration) — the same CDN acceleration engagement, where the previous post covered the og:image cache channel and this one covers slider-plugin JSON storage. The case migrated two China sites into locally managed infrastructure with image acceleration on cloud storage, and this leak surfaced on the heaviest page of the site.

## The symptom: a homepage half migrated, half origin-bound

Within one block of homepage HTML, the `noscript` fallback image was already on the CDN domain while the slider hero images and the 47MB video inside inline JSON still pointed at the origin. The pipeline itself was healthy — zero old-domain references in visible `src`/`srcset`, with both the database replacement and the output-rewrite layers active — and the homepage crawl showed this contrast:

| Location | Domain |
|------|------|
| The same element's `noscript` fallback image | ✅ CDN domain |
| Slide backgrounds, image arrays, thumbs inside inline JSON | ❌ Plain old domain |
| The background video layer inside inline JSON (47MB) | ❌ Plain old domain |

The cost landed on the egress pipe: every play of the 47MB hero video hit the origin, and a single visitor could saturate the 5Mbps shared uplink, queuing every other static asset behind it.

"Half migrated, half not" was the diagnostic clue: the `noscript` fallback goes through regular HTML attribute output (covered by the rewrite engine), while everything leaked lives in the same element's inline JSON — a matching-surface problem, not a dead pipeline.

## Root cause: an attribute-grammar surface can't see JSON forms

The rewrite engine matches HTML attribute grammar: `src=`, `srcset=`, `href=`, `poster=`, with a whitespace character required before the attribute name. The slider plugin's stored forms dodge every clause:

```html
<!-- What the engine sees: attribute equals sign + whitespace prefix -->
<img src="https://old.example/hero.jpg" data-src="https://old.example/2.jpg" />

<!-- What the plugin stores: inline JSON, a colon instead of an equals sign -->
SR7_14_2({"bg":{"image":{"src":"https:\/\/old.example\/hero.jpg"}}})
```

Clause by clause:

| Blind spot | Form | Why it misses |
|------|------|-----------|
| Colon vs equals | JSON `"src":"..."` | The engine matches `src=`; JSON has `src":` — no equals sign |
| Whitespace prefix | `"src":` preceded by quote/comma | The whitespace-before-attribute-name rule excludes JSON forms wholesale |
| Hyphenated attribute | `data-src=` | The prefix is `data-`, not whitespace — missed as well |
| Escaped byte stream | `https:\/\/old.example` | There is no contiguous `https://` in the bytes — even a plain-prefix str_replace fails |

The last row is the trap: the first instinct for database cleanup is "run a plain str_replace across the DB." But in the single-escaped form, the stored bytes are `https:\/\/old.example` — a backslash follows `https:`, and the substring `https://` simply does not exist to be found. The same URL takes three byte-stream forms:

```
Plain:          https://old.example/hero.jpg
Single-escaped: https:\/\/old.example\/hero.jpg        ← byte stream after one JSON.stringify pass
Double-escaped: https:\\/\\/old.example\\/hero.jpg      ← one more string-layer escape on top
```

Replacing without confirming the form produces "command ran, zero matches, zero errors" — harder to notice than an outright failure.

## The fix: three-form replace + fixpoint verification

**Step 1: inspect the stored form.** Check which escape form the target field holds before choosing a strategy:

```bash
# Check whether the field contains escaped forms (adapt table/column names)
wp db query "SELECT ID FROM wp_revslider_slides WHERE layers LIKE '%https:\\\\/%' LIMIT 5"
```

**Step 2: replace per form.** Two field classes, two rules:

```php
// JSON fields (no length prefix): replace all three forms; key order irrelevant
foreach ( $fields as $field ) {
    foreach ( $rows as $row ) {
        $v = $row[ $field ];
        $v = str_replace( 'https:\\/\\/old.example', 'https:\\/\\/cdn.example', $v ); // single-escaped
        $v = str_replace( 'https:\\\\/\\\\/old.example', 'https:\\\\/\\\\/cdn.example', $v ); // double-escaped
        $v = str_replace( 'https://old.example', 'https://cdn.example', $v ); // plain
        // ...write back
    }
}
```

```php
// PHP serialized fields: a length-changed URL corrupts the s:length: prefix — use the engine
$data = unserialize( $raw );
// ...walk and replace plain URLs...
$raw = serialize( $data );
```

Our targets were the three Slider Revolution tables — `slides`, `sliders7`, `slides7` — where layer and background data live in JSON/escaped forms. The three-form replace handled 204 occurrences with table structure intact and front-end rendering normal. If you run a similar plugin, first find out which tables hold its layer data before touching anything.

**Step 3: a two-hop save fixpoint, proving no write-back.** The nightmare after a storage-side replace is "the editor saves once and the old domain returns." Verify like this:

1. Open the migrated slider in the admin and save once;
2. Diff the affected row's byte stream before/after the save;
3. Save a second time and diff again.

Two consecutive unchanged landings confirm the save path persists exactly what it read. On our Slider Revolution install both hops landed unchanged — the replacement is one-shot, nothing to keep watching.

## Boundaries and variants

- **One correction on the record**: after closing the tables, a review pass briefly concluded "a 47MB video still leaks from post content." Checking the source disproved it: that video is the homepage slider's hero background layer (stored in the slider tables) and was already covered by the table replace; post content references it zero times, with only KB-scale thumbnails left. The lesson: attribute a URL to its carrier before filing it — not to the page where you first saw it.
- **Egress-side capability**: the storage replace is the immediate close-out. The rewrite engine's shared text ingress now natively supports all three escape forms (covered by unit tests), so future sites hitting the same plugin can attach a plugin adapter and fold JSON forms into output rewriting instead of touching the database each time.
- **A batch declaration hook**: to route similar tables through the database-replacement channel, declare them via the plugin's `cclee_oss_url_replace_tables` filter instead of hand-running per-table replaces.
- **A cross-origin prerequisite**: once the background video/images serve from the CDN domain, cross-origin loading requires an ACAO response header on the CDN side (value pinned to the site origin) — otherwise the migration completes and playback starts failing with CORS errors.
- **A separate leak channel**: the og:image indexable-cache passthrough was another leak caught in the same engagement, with a completely different mechanism — see [Yoast og:image Not Following CDN](/blog/yoast-og-image-indexable-cache-cdn-domain).

<InfoBox variant="warning" title="Things to watch">

- Inspect the stored escape form before replacing — "ran the replace, zero matches, zero errors" is the hardest failure state to notice.
- Never plain-`str_replace` PHP serialized fields (a length-changed URL corrupts the `s:length:` prefix); JSON fields can be replaced byte-for-byte per form.
- A migration is done when egress captures show zero old-domain references — not when the replace command has run. Verify per channel (visible images, JSON, og:image, schema).

</InfoBox>

## Frequently asked questions

### How do I safely search and replace URLs in the WordPress database?

PHP serialized fields carry a s:length: prefix — a plain str_replace corrupts the structure once the URL length changes, so go through unserialize/serialize or a length-safe replace tool. JSON fields have no length prefix and can be replaced byte-for-byte per escape form. We closed out 204 occurrences across the three tables — slides, sliders7, slides7 — this way with intact structure.

### Why doesn't plain str_replace catch URLs inside JSON?

The same URL exists in three byte-stream forms: plain (https://), single-escaped (https:\/\/) and double-escaped (https:\\/\\/). In the single-escaped form there is no contiguous https:// substring — the slashes are broken up by backslashes, so any plain-text replacement silently matches nothing. Inspect the stored form first, then replace per form.

### Will Slider Revolution write the old domain back after saving?

Verify with a two-hop save fixpoint: save once, diff the database row's byte stream, save again, diff again. If two consecutive saves leave the stored bytes unchanged, the editor path writes back exactly what it read. On our Slider Revolution install both hops landed unchanged — the replacement is one-shot.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
