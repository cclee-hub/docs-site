---
title: "WordPress Block Theme Changes Not Taking Effect? FSE Development Troubleshooting Guide"
description: Five common WordPress FSE theme development issues—file changes not applying, block nesting errors, missing post-content, SVG icons disappearing, and WP-CLI mail failures—with root causes and copy-paste solutions.
date: 2026-04-17
tags: [WordPress, FSE, Block Theme, Docker, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why do my WordPress Block Theme file changes not appear on the site?"
    a: "FSE templates and styles are saved to the database (wp_template, wp_global_styles). The database version takes priority over files. Clear the corresponding CPT records and flush cache."
  - q: "Why are blocks nested incorrectly in the Site Editor?"
    a: "A missing closing comment <!-- /wp:group --> causes Gutenberg to treat all subsequent blocks as children, completely breaking the nesting hierarchy."
  - q: "Child theme template overrides hide page editor content?"
    a: "Your child theme template must include <!-- wp:post-content /-->, otherwise WordPress cannot render content from the page editor."
---

Encountered these five issues repeatedly while developing WordPress Block Themes for clients. Each one took significant debugging time. This guide covers the root causes and provides ready-to-use solutions.

## TL;DR

Five issues ranked by frequency: **file changes not applying** (database cache overrides files), **block nesting errors** (unclosed comments), **child theme content not rendering** (missing post-content block), **SVG icons disappearing** (WP_Filesystem polluted by plugins), and **WP-CLI mail failures** (SMTP plugins don't hook in CLI). Each scenario includes copy-paste diagnostic commands.

## Scenario 1: Changed Theme Files, But the Page Looks the Same

### Problem

You modified `theme.json`, `templates/*.html`, or `parts/*.html` in your theme directory, but the page shows no change. Even after `git pull` updates the code, the frontend still renders the old version.

### Root Cause

FSE themes have their templates and global styles saved to the database via the Site Editor—stored as `wp_template`, `wp_template_part`, and `wp_global_styles` custom post types. **The database version takes priority over file versions.** Even if you update the file, as long as a database record exists, WordPress uses that instead.

### Solution

Different file types require different cleanup:

| Modified content | Cleanup method |
|-----------------|----------------|
| `templates/*.html` | Clear `wp_template` |
| `parts/*.html` | Clear `wp_template_part` |
| `theme.json` | Clear `wp_global_styles` + flush cache |
| `patterns/*.php` | Takes effect immediately, no cleanup needed |

One-command cleanup for all database template caches:

```bash
# Local Docker environment
docker exec wp_cli bash -c 'wp post delete $(wp post list --post_type=wp_template --format=ids --allow-root) --force --allow-root'
docker exec wp_cli bash -c 'wp post delete $(wp post list --post_type=wp_template_part --format=ids --allow-root) --force --allow-root'
docker exec wp_cli bash -c 'wp post delete $(wp post list --post_type=wp_global_styles --format=ids --allow-root) --force --allow-root'
docker exec wp_cli wp cache flush --allow-root
```

If theme.json changes still don't apply, verify the JSON has no syntax errors (e.g., trailing commas are invalid in JSON):

```bash
docker exec wp_cli wp eval 'echo json_encode(json_decode(file_get_contents(get_template_directory() . "/theme.json")));' --allow-root
# Empty output → JSON syntax error
```

<InfoBox variant="warning" title="Important">

- Never save in the Site Editor during development—this prevents database overrides
- Before clearing in production, verify no custom modifications need to be preserved from the Site Editor
- `patterns/*.php` is unaffected—Pattern registration runs through PHP code, not the database
- Corrupted `wp_global_styles` JSON from the Site Editor can cause site-wide `WP_Theme_JSON_Resolver` errors, breaking all page styles

</InfoBox>

## Scenario 2: Site Editor Shows "Attempt Recovery" and the Layout Breaks

### Problem

The Site Editor shows "Attempt Recovery" for a Pattern. After saving, the page layout is completely broken. Some blocks are incorrectly nested inside others, and the hierarchy doesn't match the source code.

### Root Cause

WordPress block editor uses HTML comments to mark block boundaries:

```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- content -->
<!-- /wp:group -->
```

When a container block (like `wp:group` or `wp:columns`) is missing its closing comment `<!-- /wp:group -->`, Gutenberg's `parse_blocks()` treats **all** subsequent blocks as children of that container. The consequences:

1. The parent block's save output is empty
2. Block validation fails
3. All subsequent blocks have incorrect nesting

### Solution

**Diagnose**: Check block tree hierarchy in the browser console:

```javascript
wp.data.select('core/block-editor').getBlocks()
```

Inspect the returned block tree. If a group block contains blocks that shouldn't be inside it, a previous container is likely missing its closing comment.

**Fix**: Open the Pattern source file and verify every `<!-- wp:xxx -->` has a matching `<!-- /wp:xxx -->`. Search for `<!-- wp:` and `<!-- /wp:` and count to confirm the numbers match.

<InfoBox variant="info" title="Prevention Tip">

Use an editor with bracket matching (like VS Code) with a Block Comment highlight extension to catch unclosed comments immediately. For complex Patterns, write the skeleton first (all open/close comment pairs), then fill in the content.

</InfoBox>

## Scenario 3: Child Theme Override Hides Page Editor Content

### Problem

After creating a child theme to override a parent template, content entered in the WordPress page editor (text, images, etc.) is completely blank on the frontend. However, hardcoded Patterns in the template (hero sections, CTAs) display normally.

### Root Cause

FSE templates render the page editor's `post_content` through the `<!-- wp:post-content /-->` block. If the child theme's template file doesn't include this block, WordPress has nowhere to output the page content.

The result: the template's fixed structure (header, hero, sidebar) renders correctly, but everything written in the editor is lost.

### Solution

Ensure your child theme template includes the `post-content` block:

```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">

  <!-- Template fixed structure (hero, sidebar, etc.) -->

  <!-- wp:post-content {"layout":{"type":"constrained"}} /-->

  <!-- More fixed structure (CTA, footer reference, etc.) -->

</div>
<!-- /wp:group -->
```

When troubleshooting "changes not showing", confirm in this order:

1. Does the template file include `<!-- wp:post-content /-->`?
2. Are you modifying the template file or the page content? They control different content areas
3. Inline cover blocks in the template are controlled by the template file, not the database `post_content`

## Scenario 4: SVG Icons Disappeared But the Files Are Still There

### Problem

Your theme uses `WP_Filesystem` to read SVG icon files. Suddenly all SVG icons disappear. Accessing the SVG file URL directly returns normal content, but the icon positions on pages are empty.

### Root Cause

WordPress's `$wp_filesystem` global defaults to `WP_Filesystem_Direct` (direct local file access). Some plugins (backup, security) replace `$wp_filesystem` with `WP_Filesystem_ftpsockets` or `WP_Filesystem_SSH2` during initialization.

FTP/SSH adapters read files through remote connections. For local paths (like `/var/www/html/wp-content/themes/...`), they can't access the files correctly and return empty strings. Since the replacement happens in the global scope, all theme and plugin code using `WP_Filesystem` is affected.

### Solution

**Step 1 — Diagnose**: Check the actual `$wp_filesystem` type:

```bash
# Local Docker environment
docker exec wp_cli wp eval 'global $wp_filesystem; echo get_class($wp_filesystem);' --allow-root

# Returns WP_Filesystem_Direct → normal
# Returns WP_Filesystem_ftpsockets or other → polluted
```

**Step 2 — Identify the source**: Disable plugins one by one to find which one replaces the adapter:

```bash
docker exec wp_cli wp plugin deactivate <plugin-name> --allow-root
docker exec wp_cli wp eval 'global $wp_filesystem; echo get_class($wp_filesystem);' --allow-root
# Repeat until it returns WP_Filesystem_Direct
```

**Step 3 — Code fallback**: Add `file_get_contents()` as a safety net in your theme:

```php
function mytheme_get_svg( $path ) {
    global $wp_filesystem;

    // Prefer WP_Filesystem
    if ( $wp_filesystem && method_exists( $wp_filesystem, 'get_contents' ) ) {
        $content = $wp_filesystem->get_contents( $path );
        if ( $content ) {
            return $content;
        }
    }

    // Fallback to direct file read
    if ( file_exists( $path ) ) {
        return file_get_contents( $path );
    }

    return '';
}
```

<InfoBox variant="warning" title="Important">

- `file_get_contents()` may be disabled via `disable_functions` on restricted hosts, but VPS and Docker environments typically support it
- The root fix is to identify and handle the polluting plugin; the code fallback is a temporary measure
- This issue is deceptive—the SVG files are intact and accessible via URL, but return empty only when read through `WP_Filesystem` in PHP

</InfoBox>

## Scenario 5: Email Sending Fails from Command Line, Works from Browser

### Problem

Calling `wp_mail()` via `wp eval` on the command line always fails. However, emails triggered by web requests (user registration, contact forms) send normally. SMTP plugins like WP Mail SMTP are correctly configured.

### Root Cause

SMTP plugins intercept `wp_mail()` via hooks to switch the sending channel from PHP `sendmail` to an SMTP service. But these hooks depend on WordPress's full bootstrap sequence—particularly stages after `wp_loaded`.

WP-CLI's `wp eval` loads the WordPress core, but some plugin hooks don't register in the CLI environment. `wp_mail()` falls back to PHP `sendmail`, and most servers don't have sendmail configured, causing the failure.

### Solution

**Method 1 — Web request test**: Add a temporary test route in your theme, trigger via browser:

```php
// Add to functions.php temporarily, remove after testing
add_action( 'wp_loaded', function() {
    if ( ! isset( $_GET['test_mail'] ) ) return;
    if ( '1' !== $_GET['test_mail'] ) return;

    $result = wp_mail( 'your@email.com', 'SMTP Test', 'Test email body' );
    var_dump( $result ); // true = sent successfully
    exit;
} );
```

Visit `https://yoursite.com/?test_mail=1` to trigger the test.

**Method 2 — eval-file with full bootstrap**:

```bash
cat > /tmp/test-smtp.php << 'EOF'
<?php
require_once ABSPATH . 'wp-load.php';
do_action('wp_loaded');

$result = wp_mail('your@email.com', 'CLI SMTP Test', 'Test body');
echo $result ? "Sent\n" : "Failed\n";
EOF

docker exec wp_cli wp eval-file /tmp/test-smtp.php --allow-root
```

<InfoBox variant="info" title="Best Practice">

In production, always test email sending through web requests. WP-CLI is great for cron jobs and batch operations, but not for verifying features that depend on the full WordPress hook chain (email, cache warming, etc.).

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Get in Touch</a>
</div>
