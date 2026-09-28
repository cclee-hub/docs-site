---
title: "Duplicate hreflang in Docusaurus? Built-in i18n emits them"
description: "Docusaurus i18n already emits hreflang alternates — a custom injector duplicates them and search engines ignore conflicts. Fix: remove the custom injection."
date: 2026-09-28
tags: [Docusaurus, SEO, i18n]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What are hreflang tags in SEO?"
    a: "They tell search engines which language/region variants a page has and which URL each maps to, powering regional targeting for multilingual sites. Format: <link rel=\"alternate\" hreflang=\"zh-CN\" href=\"...\">."
  - q: "How do I check hreflang tags on a page?"
    a: "Fetch the page source and count: curl -s https://your-site.com/ | grep -o 'hreflang=\"[^\"]*\"' | sort | uniq -c. Each locale code (including x-default) should appear exactly once; more means a duplicate injection somewhere."
  - q: "Does Docusaurus generate hreflang automatically?"
    a: "Yes — with i18n.locales configured, Docusaurus emits the full alternate set plus x-default for every page out of the box. No plugin needed; adding one is how duplicates happen."
---

Running an SEO audit on a multilingual site, you read the page source and find every `<link rel="alternate" hreflang="...">` appearing twice — two full hreflang sets coexisting, with overlapping language codes.

Encountered this while building [CCLEE Docusaurus Theme](/docs/cclee-docusaurus-theme) — a documentation theme built on Docusaurus 3.x with multilingual and SEO infrastructure baked in; hreflang is exactly the kind of thing it must get right natively.

## Symptom: two hreflang sets in the head

In the page head, the same locale's alternate link appears twice — one set from Docusaurus's built-in i18n, one from a custom injector. Each set is individually correct; together they conflict. One-line self-check:

```bash
curl -s https://your-site.com/ | grep -o 'hreflang="[^"]*"' | sort | uniq -c
```

Any locale code (including `x-default`) appearing more than once means duplication. If you searched for "duplicate hreflang", "hreflang emitted twice" or "Docusaurus two sets of hreflang" — same issue.

## Root cause: built-in i18n already generates them; the plugin adds a second set

Once `i18n.locales` is configured, **Docusaurus's built-in i18n automatically emits complete hreflang alternates (including x-default) for every page** — out of the box, no plugin involved. This site's custom SEO plugin, however, also had hreflang injection logic, so every page received two sets:

- Built-in i18n: generated from the locales config, rendered with the page;
- Custom plugin: another set injected into the head, with language codes heavily overlapping the generated ones.

hreflang semantics are declaration, not accumulation: two sets that disagree on even one entry (say, a different URL for a locale) are conflicting annotations as far as search engines are concerned.

## The fix: remove the custom injection, rely on built-in i18n

The fix is subtraction — delete the custom plugin's hreflang injection entirely and keep only what Docusaurus generates:

```diff
// custom SEO plugin
- const links = locales.map((locale) => ({
-   rel: 'alternate',
-   hreflang: locale,
-   href: urlFor(locale),
- }));
- // inject into head ...
```

Post-fix live measurement (homepages of both sites): `en-US`, `zh-CN` and `x-default` each appear exactly once — one clean set. Re-run the grep above after the change; ship only when every locale code counts exactly one.

## Boundary cases

- **When manual injection is actually needed**: only for pages Docusaurus doesn't generate, or variant URLs that don't follow i18n routing rules. Even then, grep the current state first — the built-in generator may already cover the pair you're about to declare.
- **Duplicates don't only come from your own plugin**: multiple SEO plugins stacking, or theme plus plugin each contributing a set, are common sources; debug by disabling one injector at a time — every head tag should have exactly one owner.
- **hreflang vs canonical**: canonical handles "duplicate content in the same language", hreflang handles "cross-language variants"; neither replaces the other, and custom logic shouldn't entangle the two.

<InfoBox variant="warning" title="Watch out">

- **Built-in capability before custom code**: Docusaurus ships i18n, sitemap and meta-description infrastructure out of the box — confirm what's already covered before writing injectors, or you're manufacturing duplicates.
- **Make the grep self-check part of the release flow**: one line of cost that catches an entire class of head-tag conflicts.
- **Search engines ignore conflicting hreflang silently** — no error, no warning. It's the same "silent, no alarm" family as dotenv truncating values.

</InfoBox>

## FAQ

### What are hreflang tags in SEO?

They tell search engines which language/region variants a page has and which URL each maps to, powering regional targeting for multilingual sites. Format: `<link rel="alternate" hreflang="zh-CN" href="...">`.

### How do I check hreflang tags on a page?

Fetch the page source and count: `curl -s https://your-site.com/ | grep -o 'hreflang="[^"]*"' | sort | uniq -c`. Each locale code (including x-default) should appear exactly once; more means a duplicate injection somewhere.

### Does Docusaurus generate hreflang automatically?

Yes — with `i18n.locales` configured, Docusaurus emits the full alternate set plus x-default for every page out of the box. No plugin needed; adding one is how duplicates happen.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
