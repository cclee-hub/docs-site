---
title: CCLEE Theme
description: Lightweight WordPress FSE block theme - setup guide, page templates, navigation menus, WooCommerce store, block patterns reference
project: cclee-theme
schema: Article
date: 2026-03-23
rag: true
rag_tags: ["WordPress", "FSE Theme", "Block Theme", "Website Builder", "Open Source Theme", "Free Theme", "WooCommerce"]
---

import { RocketIcon, ZapIcon, CheckIcon, LightbulbIcon, GithubIcon, GlobeIcon, FileIcon } from '@site/src/components/Icons'
import StatusTag from '@site/src/components/StatusTag'

# <RocketIcon size={28} /> CCLEE Theme

A lightweight FSE block theme for developers. Clean architecture, customizable design tokens, SEO-friendly.

<div className="flex gap-4 my-6 justify-center flex-wrap">
  <a href="https://github.com/cclee-hub/cclee-theme"
     className="button button--primary button--lg"
     target="_blank">
    <GithubIcon size={16} />
    Download on GitHub
  </a>
  <a href="https://ai.ccleeai.com"
     className="button button--secondary button--lg"
     target="_blank">
    <GlobeIcon size={16} />
    Live Demo
  </a>
</div>

---

## Basic Info

| Item | Details |
|------|---------|
| Requires WP | 6.4+ |
| Tested up to | 6.7 |
| Requires PHP | 8.0+ |
| License | GPLv2 or later |

---

## Key Features

### <ZapIcon size={20} /> Full Site Editing (FSE)

- theme.json design system - change once, update everywhere
- 20+ block patterns (hero, features, CTA, testimonials, pricing, etc.)
- 5 style variations (commerce, industrial, professional, nature, tech)
- Responsive layout with configurable breakpoints

### <CheckIcon size={20} /> WooCommerce Compatible

- CSS-only styling, zero template overrides
- Supports shop, product, cart, and checkout pages

### <LightbulbIcon size={20} /> Design Tokens

- Fully customizable colors, typography, spacing, and shadows
- Child theme friendly - customizations survive updates

---

## Template List

### Page Templates

| Template | Usage |
|----------|-------|
| `index` | Default archive |
| `single` | Single post |
| `page` | Standard page |
| `archive` | Archive list |
| `search` | Search results |
| `404` | Not found |
| `front-page` | Front page |
| `home` | Blog home |
| `page-no-sidebar` | No sidebar page |
| `page-landing` | Landing page |
| `author` | Author archive |
| `page-about-us` | About page |
| `page-contact` | Contact page |

### WooCommerce Templates

| Template | Usage |
|----------|-------|
| `archive-product` | Product list |
| `single-product` | Product detail |
| `cart` | Shopping cart |
| `checkout` | Checkout page |

### Template Parts

- `header` - Site header
- `footer` - Site footer
- `sidebar` - Sidebar

---

## Installation

### Manual Upload

1. Download the theme ZIP file
2. Go to WordPress Admin > Appearance > Themes > Add New > Upload Theme
3. Activate the theme

### WP-CLI

```bash
wp theme install /path/to/cclee-theme --activate
```

---

## User Guide

This section walks you through setting up a complete site with CCLEE Theme using the WordPress admin dashboard. No command line needed.

### Basic Settings

After activating the theme, configure these essentials first:

1. Go to **Settings → General** and enter your site title and tagline
2. Go to **Settings → Permalinks**, select "Post name" (`/%postname%/`), and save
3. Go to **Settings → Timezone** and select your city (e.g., "Shanghai")

### Creating Pages

CCLEE Theme provides purpose-built templates for different page types. Select the matching template when creating each page for the best layout.

#### Available Page Templates

| Page Purpose | Template | Notes |
|-------------|----------|-------|
| Homepage | `front-page` | Transparent header, hero, features, CTA |
| About Us | `page-about-us` | Company intro, stats, timeline, team |
| Contact | `page-contact` | Contact form, map area |
| Full Width | `page-full-width` | No sidebar, full-width content |
| Landing Page | `page-landing` | Video hero marketing page |
| Standard Page | `page` (default) | Standard header and footer layout |
| Blog Listing | `home` (auto) | Automatically used when blog page is set |
| Product Catalog | `archive-product` (auto) | Automatically used after WooCommerce install |
| Cart | `cart` (auto) | Automatically assigned by WooCommerce |
| Checkout | `checkout` (auto) | Automatically assigned by WooCommerce |
| My Account | `my-account` (manual) | ⚠️ Must be manually assigned |
| Search Results | `search` (auto) | Automatically used |
| 404 Page | `404` (auto) | Automatically used |

> Templates marked "auto" are matched by WordPress or WooCommerce automatically — no manual assignment needed.

#### Steps to Create a Page

1. Go to **Pages → Add New Page**
2. Enter the page title (e.g., "About Us")
3. In the right sidebar, find the **Template** option and select the appropriate template from the dropdown
4. Click **Publish**
5. Repeat for each page you need

### Setting Up Homepage and Blog Page

After creating your pages, tell WordPress which one is the homepage and which displays blog posts:

1. Go to **Settings → Reading**
2. Under "Your homepage displays", select **A static page**
3. Set **Homepage** to your front page
4. Set **Posts page** to your blog page
5. Click **Save Changes**

### Configuring Navigation Menus

CCLEE Theme uses WordPress Full Site Editing (FSE) navigation blocks. Menus are managed in the Site Editor.

1. Go to **Appearance → Editor**
2. Click **Template Parts** on the left → select **Header**
3. Click the navigation block on the page to edit it:
   - Add page links: click **+** → select your pages
   - Add custom links: enter the URL and label text
   - Drag to reorder items
4. Click **Save**

> CCLEE Theme provides two headers: **Header** (solid background) and **Header Transparent** (transparent, for hero pages). Configure navigation in both for consistent menus.

### Installing WooCommerce

If your site needs an online store:

1. Go to **Plugins → Add New**, search for "WooCommerce"
2. Click **Install Now**, then **Activate** after installation
3. Follow the WooCommerce setup wizard to enter store details (address, currency, etc.)
4. In **WooCommerce → Settings**, verify these page assignments are correct:
   - Shop page → your product catalog page
   - Cart → your cart page
   - Checkout → your checkout page
   - My account → your account page

> ⚠️ The "My Account" page needs the `my-account` template assigned manually: edit the page → right sidebar → Template → select `my-account`.

### Using Block Patterns

CCLEE Theme includes 20+ block patterns you can insert directly when editing pages:

1. Edit any page and click the **+** button
2. Switch to the **Patterns** tab
3. Browse available patterns under the **CCLEE** category
4. Click any pattern to insert it into your page

#### Available Patterns

**Hero Sections**

| Pattern | Description |
|---------|-------------|
| `hero-centered` | Centered hero with heading, text, buttons |
| `hero-simple` | Simple hero with side text |
| `hero-about` | About page hero |
| `hero-contact` | Contact page hero |
| `hero-blog` | Blog page hero |
| `landing-video-hero` | Video background hero |

**Content Sections**

| Pattern | Description |
|---------|-------------|
| `features-grid` | Feature cards in grid layout |
| `services` | Services listing |
| `stats` | Statistics counters |
| `timeline` | Company timeline / history |
| `team` | Team member cards |
| `testimonial` | Customer testimonials |
| `faq` | FAQ accordion |
| `pricing` | Pricing table |
| `portfolio` | Portfolio / gallery grid |
| `logo-cloud` | Client/partner logos |

**CTAs and Utility**

| Pattern | Description |
|---------|-------------|
| `cta-banner` | Call to action banner |
| `contact` | Contact form section |
| `page-header` | Generic page header |
| `page-header-products` | Product page header |
| `breadcrumb` | Breadcrumb navigation |

**WooCommerce**

| Pattern | Description |
|---------|-------------|
| `view-toggle` | Grid/list view toggle |
| `woo-trust-badges` | Trust badges for checkout |
| `woo-progress-steps` | Order progress steps |
| `woo-account-nav` | Account navigation sidebar |
| `woo-account-user-info` | Account user info card |

**Header / Footer Variations**

| Part | Description |
|------|-------------|
| `header` | Solid background header with nav, cart, CTA button |
| `header-transparent` | Transparent header (for hero pages) |
| `header-centered` | Centered logo header |
| `footer-columns` | Multi-column footer with nav, social, copyright |
| `footer-simple` | Simple footer |
| `footer-newsletter` | Footer with newsletter signup |

### Customizing Styles

CCLEE Theme supports global style customization through the Site Editor:

1. Go to **Appearance → Editor**
2. Click the **Styles** panel on the right (paintbrush icon)
3. Adjust:
   - **Colors**: global palette, element-specific colors
   - **Typography**: fonts, sizes, line heights
   - **Layout**: spacing, container widths
4. Click **Save** to apply site-wide

> For deeper customization, create a child theme so your changes survive theme updates.

### Legal Pages

Create these legal pages using the default `page` template:

- Privacy Policy
- Terms and Conditions
- Refund and Returns Policy

---

## FAQ

### My page doesn't look right. What should I check?

Verify the page has the correct template assigned. Edit the page → right sidebar → confirm the "Template" option matches the page purpose.

### The navigation menu isn't showing?

CCLEE Theme uses FSE navigation blocks, not classic menus. Manage navigation through **Appearance → Editor** → edit the Header template part.

### WooCommerce pages look broken?

Confirm WooCommerce page bindings are correct (shop, cart, checkout, my account). The "My Account" page needs the `my-account` template assigned manually.

### Does this theme require any plugins?

<StatusTag type="info">No</StatusTag> CCLEE works out of the box. WooCommerce support is optional.

### Can I use this theme for commercial projects?

<StatusTag type="success">Yes</StatusTag> CCLEE is licensed under GPLv2 or later, free for commercial use.

### How do I customize colors and fonts?

Use the Site Editor (Appearance > Editor), or create a child theme with custom theme.json.

### Why does WooCommerce say "Products" instead of "Shop"?

CCLEE uses B2B-friendly terminology by default. "Products" is more appropriate for business-focused websites. This is a text display preference only - it doesn't modify WooCommerce functionality. To restore "Shop", remove the filter in a child theme.

---

## Changelog

### v1.1.1

- Add author archive template and post layout patterns
- Add WooCommerce cart/checkout templates

### v1.1.0

- Add 5 style variations
- Add landing page patterns
- Add WooCommerce progress steps and trust badges patterns

### v1.0.0

- Initial release

---

## Resources

| Resource | License |
|----------|---------|
| [DM Serif Display](https://fonts.google.com/specimen/DM+Serif+Display) | SIL Open Font License |
| [Inter](https://fonts.google.com/specimen/Inter) | SIL Open Font License |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | SIL Open Font License |

---

## Technical Tags

`full-site-editing` `block-themes` `one-column` `two-columns` `custom-colors` `custom-menu` `custom-logo` `featured-images` `sticky-post` `threaded-comments` `translation-ready`

---

<div className="text-center my-8">
  <a href="https://github.com/cclee-hub/cclee-theme"
     className="button button--primary button--lg"
     target="_blank">
    <GithubIcon size={18} />
    <span className="ml-2">Get Source on GitHub</span>
  </a>
</div>

:::tip

CCLEE Theme is fully open source under GPLv2 license. Star, Fork, and PRs are welcome!

:::
