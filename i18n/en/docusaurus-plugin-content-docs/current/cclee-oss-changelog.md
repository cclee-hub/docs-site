---
title: "CCLEE OSS Changelog: WordPress Media Offload Release Notes"
description: "CCLEE OSS changelog tracks new features and improvements in the WordPress media offload plugin, covering media sync, URL rewrite, and local copy management."
project: cclee-oss
schema: Article
date: 2026-09-28
rag: true
rag_tags: ["WordPress", "Alibaba Cloud OSS", "Object Storage", "Media Library", "CDN"]
---

CCLEE OSS keeps evolving. This page lists the new features and improvements in every version, newest first. The latest release is **0.3.0**.

## How to Update to the Latest Version

Licensed sites receive the update notice automatically on the WordPress "Plugins" page — just click "Update". Update packages are distributed by the CCLEE update server and only reach sites with an active license. Your current version number is shown on the CCLEE OSS entry in the "Plugins" list. For first-time installation and setup, see the [CCLEE OSS guide](/docs/cclee-oss).

## 0.3.0: Local Copy Management and One-Click Migration Back (2026-09-29, current version)

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
