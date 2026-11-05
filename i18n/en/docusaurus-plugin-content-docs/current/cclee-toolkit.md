---
title: CCLEE Toolkit User Guide
description: Complete guide to CCLEE Toolkit plugin — AI-assisted writing, automatic SEO optimization, and case study showcases
project: cclee-toolkit
schema: HowTo
steps:
  - name: Enable and configure plugin modules
    text: Toggle modules on the WordPress settings page
  - name: Generate content with AI Assistant
    text: Use the editor sidebar to generate headlines, paragraphs, lists, and more
  - name: Verify SEO tag output
    text: Check page source for OG/Twitter/JSON-LD tags
  - name: Create and publish case studies
    text: Add a new Case Study, fill in client info and metrics, then publish
rag: true
rag_tags: ["WordPress", "CCLEE Toolkit", "AI Writing", "SEO Optimization", "Case Study", "Plugin"]
---

import { RocketIcon, ZapIcon, CheckIcon, LightbulbIcon } from '@site/src/components/Icons'
import StatusTag from '@site/src/components/StatusTag'

# <RocketIcon size={28} /> CCLEE Toolkit User Guide

An enhancement toolkit for B2B corporate websites. Four modules you can toggle independently.

| Module | Function | Default |
|--------|----------|---------|
| AI Assistant | AI-powered content generation in the editor sidebar | <StatusTag type="warning">Off</StatusTag> |
| SEO Enhancer | Auto-output OG + Twitter Card + JSON-LD | <StatusTag type="success">On</StatusTag> |
| Case Study CPT | Case study post type + 4 dynamic blocks | <StatusTag type="success">On</StatusTag> |

---

## Quick Start

<InfoBox variant="info" title="Requirements">
WordPress 6.4+ / PHP 8.0+. SEO and Case Study modules are enabled by default — no extra setup needed.
</InfoBox>

**Download**: [cclee-plugins (GitHub)](https://github.com/cclee-hub/cclee-plugins)

---

## Plugin Settings

Navigate to **Settings → CCLEE Toolkit** (`/wp-admin/options-general.php?page=cclee-toolkit`)

<img src="/images/docs/cclee-toolkit/s1-settings.webp" width="400" alt="Plugin settings page" loading="lazy" />

| Setting | Description |
|---------|-------------|
| AI Assistant | Check to load the AI panel in the editor |
| AI API Key | API Key for your chosen AI provider |
| AI Provider | OpenAI / DeepSeek / Anthropic / Custom |
| API Base URL | Required only for Custom mode, must end with `/v1` |
| AI Model | Leave empty to use the provider's default |
| SEO Enhancer | Auto-output social tags and structured data |
| Case Study CPT | Register case study post type and blocks |

---

## AI Assistant — Editor AI Helper

### Enabling AI

1. Go to **Settings → CCLEE Toolkit**
2. Check **AI Assistant**
3. Select a Provider (OpenAI, DeepSeek, Anthropic, or Custom)
4. Enter the corresponding **API Key**
5. For Custom mode, also fill in **API Base URL** and **Model**
6. Click **Save Changes**

### Generating Content

1. Create or edit any post/page
2. Find the **"CCLEE AI Assistant"** panel in the right sidebar
3. Choose a content type:

| Type | Output |
|------|--------|
| Paragraph | Body text |
| Headline | Title suggestions |
| List | List items |
| CTA | Call-to-action copy |
| FAQ | Q&A pairs |

4. Describe what you need in the Topic/Prompt field
5. Click **Generate Content**
6. Once generated, click **Copy to Clipboard** and paste into the editor

<img src="/images/docs/cclee-toolkit/s2-ai-panel.webp" width="560" alt="AI Assistant panel" loading="lazy" />

<InfoBox variant="warning" title="Note">
If the API Key is missing or invalid, you'll see an error when generating. Make sure your key is valid and has available credits.
</InfoBox>

---

## SEO Enhancer — Automatic SEO

<InfoBox variant="success" title="Zero Configuration">
This module is enabled by default and works automatically after plugin activation.
</InfoBox>

### What It Outputs

All front-end pages automatically get these tags in `<head>`:

- **Open Graph** tags — og:title, og:description, og:url, og:type, og:image
- **Twitter Card** tags — twitter:card, twitter:title, twitter:description
- **JSON-LD Schema** — Single posts/pages also get Article structured data

### Verifying Output

1. Visit any front-end page
2. Right-click → **View Page Source**
3. Search for `og:title` or `twitter:card` to confirm tags are present
4. On a single post page, search for `application/ld+json` to confirm JSON-LD output

<img src="/images/docs/cclee-toolkit/s3-seo-source.webp" width="560" alt="SEO tags in source" loading="lazy" />

---

## Case Study — Project Showcases

### Creating a Case Study

### Creating a Case Study

Navigate: **Case Studies → Add New**

Fill in the fields:

| Field | Description | Example |
|-------|-------------|---------|
| Title | Case study title | Smart Factory Upgrade |
| Client Name | Client company | TechCorp Manufacturing |
| Project Duration | Timeline | 8 months |
| Company Size | Scale | 500+ employees |
| Metric 1~4 Value/Label | Performance metrics | +200% / Revenue Growth |
| Testimonial Content | Client quote | The solution significantly improved our production line efficiency |
| Testimonial Author | Reviewer name | Zhang Wei |

Set industry via the **Industries** panel on the right. Click **Publish** when done.

The detail page auto-renders 4 Blocks: Case Hero / Case Metrics / Case Testimonial / Case Meta.

URL: `/case-study/{slug}/`

<img src="/images/docs/cclee-toolkit/cs-new-editor.webp" width="560" alt="New case study editor" loading="lazy" />

---

## FAQ

### AI generation returns an error?

Check three things: Is the API Key valid? Is the correct Provider selected? Can your server reach the API endpoint?

### SEO tags not showing?

Confirm **SEO Enhancer** is enabled (it's on by default). If you're using a caching plugin, clear the cache and retry.

### Case study blocks show no data?

Make sure the Meta Box fields are filled and saved. Blocks read from post meta — empty fields produce no output.

### Can I insert other blocks in the case study editor?

Yes. The template renders Case Study blocks above and below the post content. Any blocks you insert in the editor appear in the middle.

### Case Studies menu not showing?

Confirm **Case Study CPT** is enabled. If you just enabled it, refresh the admin page.
