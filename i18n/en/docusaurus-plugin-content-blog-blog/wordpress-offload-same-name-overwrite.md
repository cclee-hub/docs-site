---
title: "WordPress same-name upload overwrites media? Disk-only dedup"
description: "Same-name uploads overwrite cloud objects once local files are deleted: core dedup only checks the disk. Fix checks disk, database, and bucket."
date: 2026-11-19
tags: [WordPress, Alibaba Cloud OSS, Offload]
authors: [cclee]
image: "/images/blog/wordpress-offload-same-name-overwrite-en.webp"
schema: FAQPage
faqs:
  - q: "Can an overwritten object in cloud storage be recovered?"
    a: "Not by default. Object storage is flat: uploading a same-name file writes to the same key and replaces the old content in place. Without versioning enabled, the old bytes are gone. In our production test, the key's ETag changed to the new file's md5 while every historical post kept referencing the same URL."
  - q: "How do I know if my WordPress site is at risk?"
    a: "Two conditions together mean high risk: the media library is offloaded with local files deleted (cloud-only mode), and a same-name file was uploaded at some point. Spot-check by taking an attachment's _wp_attached_file as the object key and comparing its LastModified against the publishing date of posts using it."
  - q: "What is keep=0 (cloud-only) mode in media offload?"
    a: "keep=0 means the plugin deletes the local copy after syncing to object storage, leaving one copy in the cloud. WordPress core's same-name dedup (wp_unique_filename) only scans the local directory, so with an empty disk it always approves the name — and the upload reuses the same key, overwriting the cloud object. keep=1 keeps local files, and disk dedup accidentally masks the gap."
---

On a production site whose media library is offloaded to object storage in cloud-only mode (local copies deleted), an editor re-uploaded a cover image under a name that already existed months ago. The upload succeeded with no warning. That afternoon the site's theme vendor reported that a batch of older posts was showing the new image. The media library listed two separate attachments with different IDs; only readers noticed the pictures had changed.

## TL;DR

1. WordPress core's same-name dedup, `wp_unique_filename()`, only scans the local upload directory. It never queries the database — the function body contains zero `$wpdb` calls — and it knows nothing about your bucket. With local files deleted, the disk is always empty, so dedup always approves the name, the upload reuses the same object key, and `putObject` overwrites the old object.
2. The fix: hook `wp_unique_filename` (priority 999) and add three checks — a disk directory family-name scan, a `_wp_attached_file` family-prefix query, and per-key HEAD requests against the bucket (base / `-scaled` / `-rotated` × extension set). If any face is occupied, increment WordPress-native `-N` names up to 20 rounds; if a dedup source errors out, fall back to a random suffix and upload unblocked.
3. A pitfall worth copying: the object key equals the uploads-relative path, so the check set must carry the directory prefix. Our first version built keys from the bare basename, and a test fixture with a subdirectory immediately caught "bucket-face dedup misses every subdirectory upload" — `2026/11/hero.jpg` and `hero.jpg` are unrelated strings to object storage.

<!-- truncate -->

This is a real defect fix from [CCLEE OSS](/docs/cclee-oss) (0.6.1) — a WordPress plugin that syncs the media library to your own object-storage bucket and rewrites media URLs to the OSS/CDN domain. The root cause is not plugin-specific logic but a dedup boundary in WordPress core that has existed for over a decade: `wp_unique_filename()` was designed assuming the local disk is the single source of truth for filenames. Media offloading removes that assumption.

## Symptoms: two attachments in the library, one object in the cloud

The reproduction path is deterministic and quiet:

| Step | Action | Result |
|------|--------|--------|
| 1 | Upload `2026/11/old.jpg`, sync to bucket, delete local copy | Normal; older posts reference that URL |
| 2 | Months later, upload another `old.jpg` | No rename; new attachment ID, same URL |
| 3 | Sync layer pushes with the same key | Old cloud object silently overwritten |
| 4 | Open any post referencing that URL | Shows the new image |

No error, no log entry at any step. The damage hides behind three layers: the URL never changes (no reference breaks), the media library looks normal (two independent attachments at the WordPress level), and the old content vanishes without a trace (same-key overwrite keeps no version). On a production site with about 13,000 media files (2.2 GB), we verified that after a same-name re-upload the key's ETag immediately became the new file's md5.

## Root cause: wp_unique_filename only checks the disk

The occupancy test in `wp_unique_filename()` scans the local disk and nothing else — the function body never touches the database, so "what names have been used before" never enters the decision. In WordPress 6.x, the dedup loop ([functions.php:2589](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-includes/functions.php#L2589)) looks like this:

```php
// wp-includes/functions.php — dedup main loop
while ( file_exists( $_dir . $filename ) || ( $lc_filename && file_exists( $_dir . $lc_filename ) ) ) {
    $filename = str_replace( "$number$ext", "$new_number$ext", $filename );
    // ...increment -N and loop
}
```

Three facts make it fail silently under an offload architecture:

**Fact one: `file_exists()` is the only occupancy signal.** The loop scans the local directory; there is not a single `$wpdb` call anywhere in the function. Every attachment key already stored in `_wp_attached_file` — the complete history of names ever used — plays no part in the decision. If the disk has `old.jpg`, rename; if not, approve. "Has this name ever been used?" never enters the question.

**Fact two: after deleting local copies, the disk is always empty.** Cloud-only mode removes the local file after sync, so `file_exists()` is permanently false. Core dedup is not broken — it diligently and correctly answers a question that no longer matters: "does this name exist on the local disk?"

**Fact three: the sync layer uploads unconditionally.** The plugin receives a "deduplicated" filename and pushes it to the bucket under the same key. Object storage is flat; writing to an existing key replaces it. Somewhere between `add_attachment` and `wp_update_attachment_metadata`, the overwrite happens, and no step in the chain sees itself doing anything wrong.

Derived names open a second door: the `-scaled` suffix for large images ([image.php:336](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-admin/includes/image.php#L336)) and `-rotated` for EXIF rotation ([image.php:374](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-admin/includes/image.php#L374)) bypass the dedup loop entirely. Uploading a `hero.jpg` wider than 2560px produces `hero-scaled.jpg` directly — if that key exists in the bucket, it gets overwritten too.

One confounding note from our investigation: keep=1 sites (local files retained) accidentally survive, because disk dedup still has real data to scan. That is why many offloaded sites run for years without symptoms — the gap only opens once local deletion is enabled.

## Fix: three-face dedup at upload time

The idea is direct: widen the dedup surface from "the disk" back to "disk + all attachment keys + the bucket". Hook `wp_unique_filename` (fired at [functions.php:2832](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-includes/functions.php#L2832) before the final name is returned) with priority 999 so late-registered third-party filters cannot overwrite the guarded result:

```php
add_filter( 'wp_unique_filename', 'cclee_oss_upload_unique_guard', 999, 6 );

function cclee_oss_upload_unique_guard( $filename, $ext, $dir, $callback, $alt_filenames, $number ) {
    // Scope gate: only guard names inside uploads; everything else passes through
    $upload = wp_get_upload_dir();
    if ( 0 !== strpos( $dir, trailingslashit( $upload['basedir'] ) ) ) {
        return $filename;
    }
    // Run the three-face occupancy test per candidate; increment -N when occupied
    return cclee_dedupe_loop( $filename, $ext, $dir );
}
```

Each face, and why it is checked the way it is:

**Disk face — scan the directory's family names, not just the exact name.** After the core loop finishes incrementing, it never rescans the directory. A `scandir()` over the directory feeding a "family root" comparison (strip trailing `-(WxH|scaled|rotated)` repeatedly: `hero-scaled-150x150` → `hero-scaled`) catches derived-key collisions such as "uploading `hero.jpg` will generate `hero-scaled.jpg`, which already exists".

**Database face — one prefix LIKE covers the whole increment loop.** Every attachment key lives in `_wp_attached_file`, in exactly the uploads-relative-path format:

```php
$prefix = $relative_dir . '/' . $family_root; // family root, e.g. hero
$likes  = $wpdb->get_col( $wpdb->prepare(
    "SELECT meta_value FROM {$wpdb->postmeta}
     WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s",
    $wpdb->esc_like( $prefix ) . '%'
) );
```

The prefix must be the **family root**, not the original name: every `-N` candidate is an extension of the root, so one query covers the entire loop. A raw-name prefix would miss "candidate `hero-scaled` → root `hero` → DB holds `hero.jpg`". The directory prefix also guards against full-table scans on sites with hundreds of thousands of attachments and keeps legacy absolute-path junk rows out of the comparison.

**Bucket face — per-key HEAD, and the key set must carry the directory prefix.** The key set is `{family root}.{ext ∈ E}` + `{family root}-scaled.{ext ∈ E}` + `{family root}-rotated.{ext ∈ E}`, with the extension set widened by output-format conversions (if the site auto-converts JPEG to WebP, writing `hero.jpg` also writes `hero.webp`). This is where we stepped in it:

<InfoBox variant="warning" title="Detour: bare-basename keys checked nothing">
Our first bucket check built keys from the bare filename — it HEADed `hero.jpg` while the real object key was `2026/11/hero.jpg`. An object key is the full path including the directory; the two strings share nothing. Unit tests stayed green because the fixtures happened to use the root directory; a regression pass with subdirectory fixtures immediately caught "bucket-face dedup misses every subdirectory upload". Every key comparison must use the uploads-relative path as the single reference, and our suite now asserts the HEAD count and the first HEADed key byte-for-byte.
</InfoBox>

**Occupancy and incrementing.** A name is "occupied" when any face holds a name with the same family root and an intersecting extension set (byte-exact extension comparison). On occupancy, increment WordPress-native `hero-1.jpg`, `hero-2.jpg`, rerunning the full three-face test per candidate, capped at 20 rounds (a bucket holding `hero-1` through `hero-N` must not turn one upload into hundreds of HEADs). Past the cap, or when a dedup source errors out (database failure, bucket 403, network errors), fall back to an 8-hex-character random suffix validated against whichever faces remain available, and upload unblocked — hex never contains the letter `x`, so a random name can't be mistaken for a `-WxH` size suffix.

**Judging HEAD 404s.** Object storage SDKs return an empty body for a HEAD 404: the error object's code and message are both empty strings, and the HTTP status is the only reliable signal (we read the vendored aliyun oss-sdk-php source: `getObjectMeta` throws an array-style exception whose details carry only the status). Another trap: transport-layer errors arrive wrapped as string exceptions with no status at all — the exception type is the actual boundary between "network/permission failure" and "key does not exist". Treating generic exceptions as "key is free" leaks collisions through; treating them as "occupied" silently randomizes every upload on a broken network.

## Verification

The fix (0.6.1) went through three layers, all reproducible:

1. **64 stubbed unit checks**: three-face occupancy (the bucket face asserts zero PUTs and full-key HEADs), family-root criteria (WebP conversion, `-WxH` orphans, conservative renames), four error injections (DB error / scandir failure / bucket 403 / network exception) → random suffix plus a persisted counter, increment cap, callback-path shapes.
2. **End-to-end on a local stack (keep=0)**: seed `2026/11/old.jpg` in the bucket → a same-name upload lands as `old-1.jpg` with the old object's md5 unchanged; inject a HEAD failure → the file lands as `bar-4dace4d3.jpg`, upload succeeds, the settings-page counter increments.
3. **Ten-suite regression**: the existing suites (119 pure-function checks, 36 SDK-contract checks, gates, CLI, egress) all green — the new guard does not disturb deletion, rewriting, or URL-replacement behavior.

## Caveats

<InfoBox variant="warning" title="Three doors the guard does not close">
Concurrent same-name uploads are still a race: both requests check before either pushes, so neither sees the other (core's disk check has the same race, but with local files deleted the damage is permanent and hard to notice). Direct writes that bypass `wp_handle_upload` (archive imports, FTP/object-level uploads) never pass through `wp_unique_filename` and are unprotected. And keep=1 sites pay up to 3 extra read-only HEAD requests per upload — the price of also closing the derived-key vectors, which we consider worth paying.
</InfoBox>

## FAQ

### Can an overwritten object in cloud storage be recovered?

Not by default. Object storage is flat: uploading a same-name file writes to the same key and replaces the old content in place. Without versioning enabled, the old bytes are gone. In our production test, the key's ETag changed to the new file's md5 while every historical post kept referencing the same URL.

### How do I know if my WordPress site is at risk?

Two conditions together mean high risk: the media library is offloaded with local files deleted (cloud-only mode), and a same-name file was uploaded at some point. Spot-check by taking an attachment's `_wp_attached_file` as the object key and comparing its LastModified against the publishing date of posts using it.

### What is keep=0 (cloud-only) mode in media offload?

keep=0 means the plugin deletes the local copy after syncing to object storage, leaving one copy in the cloud. WordPress core's same-name dedup (`wp_unique_filename`) only scans the local directory, so with an empty disk it always approves the name — and the upload reuses the same key, overwriting the cloud object. keep=1 keeps local files, and disk dedup accidentally masks the gap.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
