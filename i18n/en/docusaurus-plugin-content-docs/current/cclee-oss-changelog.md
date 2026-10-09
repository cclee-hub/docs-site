---
title: "CCLEE OSS Changelog: WordPress Media Offload Release Notes"
sidebar_label: Changelog
description: "CCLEE OSS changelog, newest first: media sync, image and video URL rewriting, local copy management, one-click URL replacement with rollback, and licensing."
project: cclee-oss
schema: Article
date: 2026-10-09
rag: true
rag_tags: ["WordPress", "Alibaba Cloud OSS", "Object Storage", "Media Library", "CDN"]
---

CCLEE OSS keeps evolving. This page lists the new features and improvements in every version, newest first. The latest release is **0.4.10**.

## How to Update to the Latest Version

Licensed sites receive the update notice automatically on the WordPress "Plugins" page — just click "Update". Update packages are distributed by the CCLEE update server and only reach sites with an active license. Your current version number is shown on the CCLEE OSS entry in the "Plugins" list. For first-time installation and setup, see the [CCLEE OSS guide](/docs/cclee-oss).

## 0.4.5: Video Blocks Join the Cloud, Replacement Scope Extends as Needed (2026-10-09)

### New

- **Video blocks get rewritten too**: video blocks in posts, templates, and block widgets now have their video files, poster images, and caption tracks rewritten to your OSS/CDN domain, with the same rewrite behavior as images — the database still stores local links, so changing domains later requires no migration
- **Custom tables can join the one-click replacement**: if another plugin stores media links in its own database tables, a single-line declaration through the `cclee_oss_url_replace_tables` hook folds those tables into one-click replacement and rollback; if the declaration changes while a task is running, the task pauses — correct the declaration to resume, or restart under the current scope
- **A clear way out for the few entries that can't be handled automatically**: the replacement task card now explains that entries which can't be processed on their own can be excluded individually through a hook and the task rerun — no need to shelve an entire replacement over a few entries

## 0.4.2: Large Files Upload Reliably, Failed Pushes in Plain Sight (2026-10-08)

### New

- **Videos and other large files upload without a hitch**: files over 10 MB are automatically uploaded in parts, so even a modestly sized server pushes big media through reliably
- **See at a glance what didn't make it**: files that failed to push are collected in a failures list on the settings page (also available via `wp cclee-oss push-failures`) — no more guessing which file didn't reach the cloud; just work through the list
- **Local copies are verified before removal**: the offload task checks every cloud copy before deleting local files and re-pushes any that don't match — delete freely knowing a complete copy always remains in OSS

## 0.4.0: Switch Every Stored Media URL to Your Cloud Domain — Reversible Anytime (2026-10-08)

### New

- **Replace every stored media link with your OSS/CDN domain in one click**: links inside posts, pages, term descriptions, comments, and site settings — including data saved by page builders — all switch over in a single run. It's the finishing step for sites that want media fully in the cloud with nothing left on the server
- **Roll back anytime**: every changed link is backed up before replacement; one click on Rollback restores the originals, and content you edited after the replacement is left untouched
- **Old-domain links are verified first — skip rather than mis-replace**: legacy links pointing to a previous domain are checked against the media library and the cloud copies before replacement; anything that can't be verified is skipped and listed for your review, and those attachments keep their local copies
- **Local files are never deleted while links are unfinished**: as long as any stored link hasn't been replaced and verified, every local-copy deletion task refuses to start — images won't break no matter what order you do things in
- **Live progress you can pause**: the settings page gains replacement and rollback task cards with progress and verification status at a glance; entries needing your review are listed one by one — confirm each and watch the list shrink
- **The same jobs from the command line**: `wp cclee-oss url-report` runs the health check first (a full census of stored links, each checked against the cloud), and replace, rollback, and backup each have a matching command — bulk operations without clicking through wp-admin
- **Sites that changed domains get a clean sweep too**: the new "Extra Source Hosts" setting takes one legacy domain per line and folds them into the same replacement run

## 0.3.0: Local Copy Management and One-Click Migration Back (2026-09-29)

### New

- **"Keep Local Copy" switch**: on (default), media files stay on your server as usual; off, newly uploaded files are automatically removed from the server once they are confirmed to be synced to Alibaba Cloud OSS, freeing up hosting space — removal waits until other plugins have finished processing the upload, so nothing conflicts. Before switching off, every media item must be pushed to the bucket (you will be asked to run Backfill first otherwise)
- **Offload existing media task**: frees hosting space by batch-removing the local copies of existing media — only files whose bucket copies are verified complete get removed (edit history stays on the server); supports pause/resume, and progress is saved across sessions
- **Restore media from OSS task**: pulls bucket files back onto your server, safe to run repeatedly; it also serves as the migration path back to local storage when you stop using the plugin
- **Media URLs follow the site's actual state**: with local copies kept, licensing behaves as before; for media whose local copy was removed, links keep pointing to the bucket files even if the license expires — the expired-license fallback only applies to media still stored locally
- **On-demand temporary fetch**: operations that need a local file (regenerating thumbnails, the image editor, PDF thumbnails) automatically fetch the file from the bucket for the duration of the operation and clean up afterwards
- **Programmatically imported media now syncs too**: attachments added by import or sideload are pushed to the bucket as soon as they enter the media library, with the same sync, URL rewrite, and on-demand fetch behavior as dashboard uploads

## 0.2.0: Content Link Rewrite and CLI Tools (2026-09-26)

### New

- Image edits (crop, rotate, etc.) now update the corresponding bucket files; repeated saves don't upload duplicates, and old image sizes no longer in use are removed from the bucket automatically
- Media links inside post content and block templates (image, gallery, cover, etc.) are also rewritten to the OSS/CDN domain; the database always stores local links, so switching buckets or CDN domains later requires no data migration
- CLI tools: `wp cclee-oss manifest` exports the list of objects the bucket should contain as a verification baseline; `wp cclee-oss cleanup` reports and cleans up orphaned objects

### Changed

- To save storage space, system originals and edit backups are no longer uploaded to the bucket

## 0.1.6: Backfill for Existing Media (2026-09-24)

A new "Backfill" option on the settings page pushes media that existed before activation to the bucket in batches, with a progress display, pause/resume, and saved progress; media that could not be uploaded are listed with their links, and reruns don't upload duplicates. Sites with existing content no longer risk broken images when they enable the plugin.

## 0.1.0 – 0.1.4: Upload Sync and Setup Guidance (since 2026-09-12)

### 0.1.4 (2026-09-16)

New: brand icon in the plugins list.

### 0.1.3 (2026-09-16)

New: a media storage status card on the settings page — any missing required settings are listed one by one, and a one-click connectivity test (a real upload probe) reports "connected / rejected / unreachable" in plain language.

### 0.1.1 (2026-09-16)

New: each Alibaba Cloud setting on the settings page is annotated with where to get its value, plus a [RAM least-privilege setup guide](/docs/cclee-oss-ram-setup) that follows your admin language (English/Chinese).

### 0.1.0 (2026-09-12)

First release: automatic upload sync (original + all thumbnail sizes), media URL rewriting (original, srcset, all sizes), a delete-sync switch, and the settings page.
