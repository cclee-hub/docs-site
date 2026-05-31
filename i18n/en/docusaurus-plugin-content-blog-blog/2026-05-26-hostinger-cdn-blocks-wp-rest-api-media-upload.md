---
title: "WordPress REST API Image Upload Returns 405? Check Your Hostinger CDN"
description: "Hostinger CDN blocks WP REST API Media POST requests by default, causing 405 Not Allowed. Full troubleshooting guide and CDN configuration fix."
date: 2026-05-26
tags: [WordPress, WooCommerce, Hostinger, CDN, REST API, bug-fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does WordPress REST API image upload return 405 Not Allowed?"
    a: "Check the server field in response headers. If it shows hcdn, the request is blocked by Hostinger CDN before reaching WordPress. Disable CDN or contact support to whitelist the endpoint."
  - q: "How to tell if 405 comes from CDN or WordPress?"
    a: "Use curl -v and check response headers: server value hcdn or other CDN identifiers means CDN-level blocking; server value nginx/apache with X-WP-* headers means the request reached WordPress."
---

While building a WooCommerce product import tool for a client, `POST /wp-json/wp/v2/media` would succeed for the first few images, then suddenly return 405 Not Allowed for all subsequent requests.

## TL;DR

Hostinger CDN (hcdn) blocks `POST /wp-json/wp/v2/media` requests by default. The response headers `server: hcdn` and `x-hcdn-request-id` are the smoking gun. Disable CDN or contact Hostinger support to whitelist `/wp-json/*` POST requests.

## The Problem

Uploading images to WordPress Media Library via REST API:

```bash
curl -X POST 'https://example.com/wp-json/wp/v2/media' \
  -u 'user:app_password' \
  -H 'Content-Disposition: attachment; filename="product-01.jpg"' \
  -H 'Content-Type: image/jpeg' \
  --data-binary @image.jpg
```

The first 2-4 images return `201 Created`, then all subsequent requests fail with:

```html
<html>
<head><title>405 Not Allowed</title></head>
<body>
<center><h1>405 Not Allowed</h1></center>
<hr><center>nginx</center>
</body>
</html>
```

This "partial success" pattern is misleading — it looks like rate limiting, but the real cause is entirely different.

## Root Cause

Using `curl -v` to inspect the full response headers revealed:

```
< HTTP/2 405
< server: hcdn
< x-hcdn-request-id: cfc5ad1198938cd9f1e02ce71ed0ae61-kul-edge1
```

Key findings:

- **`server: hcdn`** — This is Hostinger's custom CDN (hcdn), not the origin nginx server
- **`x-hcdn-request-id`** — CDN edge node ID (kul-edge1 = Kuala Lumpur), confirming the request was blocked at the CDN layer before reaching WordPress

Hostinger CDN's default security rules block POST requests to `/wp-json/wp/v2/media`. The initial successes were likely due to CDN rule cold-start or cache misses.

## Solution

### Option 1: Disable CDN (Quick Fix)

Go to Hostinger hPanel → Website → CDN → Disable.

This takes effect immediately but removes CDN acceleration. Suitable for staging environments or emergency fixes.

### Option 2: Contact Hostinger Support to Whitelist API Paths (Recommended)

Submit a support ticket requesting to whitelist POST requests to `/wp-json/*`. Hostinger's Manage panel currently doesn't offer custom CDN rule configuration — you must go through support.

### Option 3: Add Retry Logic in Code (Defensive Measure)

Even with correct CDN configuration, retry logic handles occasional CDN throttling:

```python
import time
import random

def upload_image(url, image_bytes, filename, auth, max_retries=3):
    for attempt in range(max_retries):
        resp = httpx.post(
            url,
            content=image_bytes,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "image/jpeg",
            },
            auth=auth,
            timeout=30,
        )
        if resp.status_code != 405:
            return resp
        delay = 3 * (attempt + 1) + random.uniform(0, 2)
        time.sleep(delay)
    resp.raise_for_status()
```

## Troubleshooting Journey

This issue led down several dead ends. Here's the full排查 path for reference:

| Hypothesis | Action | Result |
|-----------|--------|--------|
| WP plugin blocking | Disabled Speed Optimizer / Auto Upload Images | Still 405, ruled out |
| Rate limiting | Added 2-5s delay between uploads + retry | Still 405, ruled out |
| REST API disabled | GET `/wp-json/wp/v2/settings` | Returned normally, ruled out |
| Auth credentials | WC Test Connection | Succeeded, ruled out |
| **CDN blocking** | **curl -v to inspect response headers** | **`server: hcdn` confirmed CDN blocking** |

The turning point was using `curl -v` and spotting `server: hcdn` — only then did we realize the requests never reached WordPress.

<InfoBox variant="warning" title="Important Notes">

- After disabling CDN, DNS cache may take a few minutes to refresh — don't retry immediately
- If your site is on Hostinger and uses REST API for batch operations, test CDN behavior before going live
- WooCommerce WC API (`/wc/v3/products`) uses different authentication (Consumer Key) and is typically unaffected; this mainly impacts WP REST API (`/wp-json/wp/v2/*`) write operations

</InfoBox>

## FAQ

### Why does WordPress REST API image upload return 405 Not Allowed?

Check the `server` field in response headers. If it shows `hcdn` (Hostinger CDN) or another CDN identifier, the request is being blocked at the CDN layer before reaching WordPress. Disable the CDN or contact your hosting provider to whitelist the endpoint.

### How to tell if 405 comes from CDN or WordPress?

Use `curl -v` and inspect response headers: a `server` value of `hcdn`, `cloudflare`, or other CDN identifiers indicates CDN-level blocking; a `server` value of `nginx`/`apache` with `X-WP-*` or `X-RateLimit-*` headers means the request reached WordPress.

---

Encountered this issue while building a [WooCommerce product import tool](https://github.com/lightcollectiveteam/importer) for a client. If you're also developing with Hostinger + WordPress and running into REST API issues, [reach out](/blog/2026/05/26/hostinger-cdn-blocks-wp-rest-api-media-upload/#).

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
