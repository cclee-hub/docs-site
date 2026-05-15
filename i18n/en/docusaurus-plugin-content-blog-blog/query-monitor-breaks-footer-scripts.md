---
title: "Theme JS Broken After Disabling a Plugin? Check Query Monitor's Footer Scripts Callback"
description: Troubleshooting WordPress theme.js loading issues caused by Query Monitor plugin, analyzing hook priority to identify root cause and solutions
date: 2026-04-04
tags: [wordpress, debugging, query-monitor, bug-fixing]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does navigation scroll effect stop working after disabling WooCommerce?"
    a: "Query Monitor's footer scripts callback has abnormal priority, blocking theme.js from loading. Delete the plugin to restore functionality."
  - q: "How to troubleshoot WordPress script loading issues?"
    a: "Check if HTML has </body> tag, compare page size differences, use curl or Playwright to verify JS file loading."
  - q: "Why does Query Monitor affect other plugins?"
    a: "Query Monitor registers an extremely low priority wp_print_footer_scripts callback that may prematurely terminate script output."
---

Encountered this issue while developing a WordPress theme for a client. Here's the root cause and solution.

## TL;DR

The WordPress theme's navigation scroll effect (`.is-scrolled` class) stopped working after disabling WooCommerce. Investigation revealed that Query Monitor plugin's `action_print_footer_scripts` callback with priority 9999 was prematurely executing and terminating all footer scripts output. Deleting Query Monitor resolved the issue.


<!-- truncate -->
## Problem

The WordPress theme implements a navigation scroll effect: when users scroll down the page, the header gains the `.is-scrolled` class, triggering a glassmorphism effect and shadow.

Testing revealed:
- With WooCommerce active: scroll effect works normally, page size 144KB
- With WooCommerce disabled: scroll effect broken, page size only 94KB

Playwright testing confirmed:
- With WooCommerce active: `theme.js` loads normally, `.is-scrolled` class added/removed correctly
- With WooCommerce disabled: `theme.js` not loaded. Page HTML ends directly after `</footer>`, missing `</body></html>`, all footer scripts not output

## Root Cause

### Investigation Process

1. **Check theme JS enqueue condition**: `inc/setup.php` lines 44-50 `wp_enqueue_script` executes unconditionally, no WooCommerce dependency

2. **Check page script output**: Using `curl` to fetch page HTML, found that with WooCommerce disabled the page only has 2 script tags (importmap, speculationrules), no theme or WordPress core scripts

3. **Check page integrity**: Page HTML ends directly after footer, missing `</body></html>` tags

4. **Search wp_print_footer_scripts callbacks**: Found in `query-monitor/collectors/assets.php:55`:

```php
add_action( 'wp_print_footer_scripts', array( $this, 'action_print_footer_scripts' ), 9999 );
```

### Key Findings

**Priority 9999 is extremely low**: In WordPress hook system, higher numbers mean lower priority. This callback executes after all normal script output, but its internal logic may prematurely terminate the output process.

**Activates without config file**: Query Monitor still registers this callback even without a `query-monitor.php` config file.

**Callback behavior**: The `action_print_footer_scripts` method outputs empty content and terminates all subsequent script output.

### Impact

Any scripts relying on `wp_print_footer_scripts` or `wp_footer` hooks are affected, including:
- Theme JavaScript (`theme.js`)
- WordPress core scripts
- Other plugins' footer scripts

## Solution

### Option 1: Delete Query Monitor Plugin (Recommended)

```bash
# Delete inside container
docker exec -it wordpress_container rm -rf /var/www/html/wp-content/plugins/query-monitor

# Or use WP-CLI
wp plugin delete query-monitor
```

### Option 2: Modify Callback Priority

If you need to keep Query Monitor, modify `query-monitor/collectors/assets.php:55`:

```php
// Original code (priority 9999 - too low)
add_action( 'wp_print_footer_scripts', array( $this, 'action_print_footer_scripts' ), 9999 );

// Change to (priority 999 - normal range)
add_action( 'wp_print_footer_scripts', array( $this, 'action_print_footer_scripts' ), 999 );
```

### Verify Fix

```bash
# Re-test page size
curl -s http://localhost:8080 | wc -c
# Should return to around 144KB

# Check if theme.js loads
curl -s http://localhost:8080 | grep -o "theme.js"
# Should see theme.js script tag
```

<InfoBox variant="warning" title="Important Notes">

During investigation, we found that Query Monitor can interfere with normal WordPress script output flow under certain configurations. Recommend using this plugin only in development environments; production environments should disable or delete it.

**Troubleshooting Tips Summary**:
1. Page size comparison: Normal vs abnormal page size difference is obvious (144KB vs 94KB)
2. HTML integrity check: Check for `</body></html>` closing tags
3. Script loading check: Use Playwright or curl to check if specific JS files load
4. Hook priority analysis: Search for `wp_print_footer_scripts` and `9999` or similar low priority callbacks
5. Plugin isolation: Disable plugins one by one to identify conflict source

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Contact Us</a>
</div>
