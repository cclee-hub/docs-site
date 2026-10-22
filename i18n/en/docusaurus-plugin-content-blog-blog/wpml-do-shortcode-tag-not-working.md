---
title: "WPML Switcher Not Changing? do_shortcode_tag Never Fires"
description: "do_shortcode_tag hooks never fire on the WPML switcher: 4.9.6 renders its slot directly, bypassing shortcodes. Fix: output buffering, anchor replacement."
date: 2026-10-22
tags: [WordPress, WPML, PHP, Bug Fixes]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I customize the WPML language switcher output?"
    a: "Check your version's source first: the 4.9.6 shortcode_actions slot has no add_shortcode registration and renders directly from the header builder, so every hook on the shortcode pipeline misses it. The fallback is output buffering — hook ob_start on template_redirect and replace anchors in the final HTML."
  - q: "Why doesn't the do_shortcode_tag filter fire in WordPress?"
    a: "The filter only runs for markup produced by do_shortcode(). WPML 4.9.6 registers no shortcode for its switcher slot and the theme never calls do_shortcode on it either, so the filter is simply never invoked — verify against rendered HTML, not function-level unit tests."
  - q: "Why does hand-calling apply_filters('do_shortcode_tag') throw ArgumentCountError?"
    a: "Other plugins hook the same filter — instagram-feed registers a callback requiring exactly 4 arguments, so a 2-argument test call fatals. Production never hits this because core always passes 4; fixtures should call it with the full 4-argument form."
---

While reworking the header of a WordPress site — replacing the WPML language switcher with a single text link — the `do_shortcode_tag` filter I hooked changed nothing on the page: no error, no log entry, no cache to clear.

Ran into this while providing [managed hosting for a WordPress site in China](/cases/waterpark-china-hosting-migration) — full-site migration, image CDN offload, daily backups and automated patrols.

## TL;DR

The WPML 4.9.x language switcher never touches the WordPress shortcode pipeline: its shortcode_actions slot has no `add_shortcode` registration, and the HTML is rendered directly by the theme's header builder, so `do_shortcode_tag` never fires for it. To change the rendered output, the only place that works regardless of render path is the output buffer — hook `ob_start` on template_redirect and run bounded, anchor-based replacements. Every page ends up with exactly one header link, and rolling back means deleting one mu-plugin file.

## Symptoms: the filter is hooked, the page ignores it

Once the mu-plugin lands, the page renders the switcher exactly as before — no error, no log entry, no cache to clear.

The code looks unimpeachable — hook the filter, match the tag, replace the output:

```php
add_filter( 'do_shortcode_tag', function ( $output, $tag ) {
    if ( 'wpml_language_switcher' === $tag ) {
        // replace switcher markup
        return my_replace_switcher( $output );
    }
    return $output;
}, 10, 2 );
```

Searching "do_shortcode_tag not working" or "filter has no effect" mostly surfaces priority and argument-count advice; none of it helps.

Two usual suspects drop out quickly: there is no page-cache layer (origin responds with no-cache, and the public HTML is byte-identical to the origin), and the filter function itself is fine — calling it directly under `wp eval` returns the expected replacement markup. The function works, no cache exists, the page ignores it — the problem has to be further upstream.

## Root cause: the WPML switcher bypasses the shortcode pipeline

`do_shortcode_tag` lives in the core shortcode parsing loop; it only fires for markup that actually goes through `do_shortcode()`.

Reading WPML 4.9.6 source: the switcher's shortcode_actions slot (`classes/language-switcher/slots/class-wpml-ls-shortcode-actions-slot.php`) never registers an `add_shortcode`, and its render method is invoked directly by the theme's header builder. On the other side, the theme (Impreza) contains zero `do_shortcode` references to this slot. With both ends disconnected, the shortcode pipeline simply isn't part of this HTML's birth path — and a filter on that pipeline waits forever.

Not a cache issue, not a priority issue, not a callback-signature issue: the filter is never called at all. The `wp eval` test produced a false signal precisely because it tests the function, not the pipeline.

## Four false leads

**Cache first.** CDN and page-cache layers checked — origin no-cache, public bytes identical to origin. Not a wrong direction, but it cost a round; confirming whether shortcodes participate in the render path should have come first.

**The wp eval false positive.** Calling the filter function directly returned the correct replacement markup, so "the function works" steered the hunt toward caching and priorities. In hindsight, a unit test proves nothing about the request path — same lesson as the [plugin PDF download 500](/blog/wordpress-plugin-pdf-500-deployment-rest-context): the context wp eval loads is not the context a real request walks.

**Zero hits on a full-database search.** The handover notes said the switcher's host element carried the class `ush_html_1`; a `wp db search` across every table found 0 hits for that literal — one step from declaring the notes wrong. Reality: Impreza assembles element classes at runtime as `ush_` + type + index, and the literal is never written to the database. To decide whether an element exists, read the rendered HTML; don't grep the database.

**The "three flags" illusion.** The requirement spoke of three language flags in the header; the WPML switcher renders only two (EN/BR). Grabbing every img tag on the page revealed the third "Chinese flag" as an independent media-library image element — a redundant self-link back to the site's own Chinese homepage, nowhere near the switcher block. When auditing header elements, dump the full img list first and classify second; don't stay trapped inside one component's markup.

## Side pit: hand-calling apply_filters takes all 4 arguments

A test fixture calling `apply_filters( 'do_shortcode_tag', $out, $tag )` with 2 arguments died with ArgumentCountError on the spot. Reason: the instagram-feed plugin hooks the same filter with a callback requiring exactly 4 arguments (a cron status check), and an under-argued invocation fatals.

Production never trips this — core always passes 4 arguments. Only `wp eval`-style fixtures do, so fixtures should use the full form:

```php
apply_filters( 'do_shortcode_tag', $out, $tag, '', '' );
```

## Fix: bounded anchor replacement in the output buffer

If the render layer can't be changed, change the final HTML after rendering: hook `ob_start` on template_redirect and run anchor-based regex replacements in the callback. The output buffer is indifferent to render paths — directly-rendered HTML passes through it too, which is exactly why this works.

Four design constraints:

1. Front-end only: admin, ajax, cron and REST all bypass
2. HTML guard: output without `<html` or `<!doctype` (feeds, JSON) is never touched
3. Anchors must be stable features of the rendered markup (image filenames, aria-labels); bounded regex consumes only the anchor's block
4. Idempotence: replacement output never contains its own anchors, so repeated runs don't stack

```php
<?php
/**
 * Plugin Name: Header Link Replace
 * Description: Replace header language elements with a single text link via output buffering. Rollback = delete this file.
 * Version:     1.0.0
 */

defined( 'ABSPATH' ) || exit;

function hlrep_link_html() {
    return '<a href="https://example.com/en/" hreflang="en" lang="en" aria-label="English site" style="text-decoration:none;color:inherit">EN</a>';
}

function hlrep_buffer_start() {
    if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
        return;
    }
    ob_start( 'hlrep_buffer_flush' );
}

function hlrep_buffer_flush( $html ) {
    if ( ! is_string( $html ) || '' === $html ) {
        return $html;
    }
    if ( false === stripos( $html, '<html' ) && false === stripos( $html, '<!doctype html' ) ) {
        return $html; // feeds/JSON etc. stay untouched.
    }
    $en   = hlrep_link_html();
    $done = 0;
    if ( false !== stripos( $html, 'flag-cn.png' ) ) {
        // (1) Swap the flag element in place: replace only the <a><img></a> anchor, keep the wrapper div.
        $html = (string) preg_replace(
            '#<a[^>]*>\s*<img[^>]*flag-cn\.png[^>]*/?>(?:\s*</a>)#is',
            $en,
            $html,
            1,
            $done
        );
    }
    if ( false === stripos( $html, 'aria-label="Language Switcher"' ) ) {
        return $html;
    }
    // (2) Switcher block: with (1) present, blank it to avoid a double link; otherwise fall back to the link.
    $html = (string) preg_replace(
        '#<div[^>]*aria-label="Language Switcher"[^>]*>.*?</div>#is',
        $done ? '' : $en,
        $html,
        1
    );
    return $html;
}
add_action( 'template_redirect', 'hlrep_buffer_start', 1 );
```

Division of labor between the two anchors: on pages with a flag image, the link lands in the flag's original spot (only the `<a><img></a>` anchor is replaced; the wrapper div stays, so the position holds) and the switcher block is blanked to prevent a duplicate; on pages without a flag, the fallback branch puts the link where the switcher was. Together, every page ends up with exactly one header link.

This went through three iterations: v1.0 was a single-anchor replacement of the switcher — through the very filter pipeline that got falsified, so it failed outright; v1.1 moved to the output buffer but only handled the flag image, leaving flag-less pages without the link; v1.2 added the dual-anchor fallback and closed the loop. The single-anchor version passed functional checks; its gap was page coverage — acceptance lists must include the flag-less pages.

Deployment and verification: pass `php -l` before the file lands in `wp-content/mu-plugins/`; the verification metric is anchor counting on rendered HTML — flag 0, switcher marker 0, target link 1. Rollback equals renaming the file, zero database changes. The site also runs a sibling ob mu-plugin (font-domain rewrite); the two layers stack and regress cleanly — output buffers nest, and each handles its own anchors.

<InfoBox variant="warning" title="Note">

Anchors must come from measured rendered markup (grab the HTML and confirm), never guessed from theme templates or the database — classes may be runtime-assembled, and database greps will always return 0 hits. The `.*?` plus "first closing tag ends the block" pattern assumes no nested same-name structure inside; verify, or switch to a safer anchor and a bounded match. Replacement output must not contain its own anchors, or stacked runs will replace twice. And since the ob layer edits final HTML, search engines and structured data see the replaced markup too — confirm that is what you want.

</InfoBox>

## FAQ

### How do I customize the WPML language switcher output?

Check your version's source first: the 4.9.6 shortcode_actions slot has no `add_shortcode` registration and renders directly from the header builder, so every hook on the shortcode pipeline misses it. The fallback is output buffering — hook `ob_start` on template_redirect and replace anchors in the final HTML.

### Why doesn't the do_shortcode_tag filter fire in WordPress?

The filter only runs for markup produced by `do_shortcode()`. WPML 4.9.6 registers no shortcode for its switcher slot and the theme never calls `do_shortcode` on it either, so the filter is simply never invoked — verify against rendered HTML, not function-level unit tests.

### Why does hand-calling apply_filters('do_shortcode_tag') throw ArgumentCountError?

Other plugins hook the same filter — instagram-feed registers a callback requiring exactly 4 arguments, so a 2-argument test call fatals. Production never hits this because core always passes 4; fixtures should call it with the full 4-argument form.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
