---
title: Installing WP-CLI in Docker WordPress Container
description: Solve the missing WP-CLI issue in official WordPress Docker image by auto-installing via docker-compose command, making wp command available inside container.
date: 2026-03-20
tags: [Docker, WordPress, WP-CLI]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is the wp command missing in Docker WordPress container?"
    a: "The official WordPress Docker image is designed to be minimal and doesn't include WP-CLI by default. You need to install it manually."
  - q: "How to auto-install WP-CLI in docker-compose?"
    a: "Add a command to the wordpress service that downloads and installs wp-cli.phar, executed automatically when the container starts."
---

## TL;DR

The official WordPress Docker image doesn't include WP-CLI. Add a `command` configuration in `docker-compose.yml` to auto-install WP-CLI on container startup—no manual container entry required.


<!-- truncate -->
## Problem

Running `wp` command inside WordPress Docker container:

```bash
docker exec -it wordpress_container wp --version
```

Returns:

```
bash: wp: command not found
```

## Root Cause

The official WordPress Docker image is built on `php:apache` with a focus on minimal size. WP-CLI is a separate CLI tool that requires additional installation—it's not included in the default image.

## Solution

Add a `command` to the WordPress service in `docker-compose.yml` to auto-install WP-CLI on startup:

```yaml
services:
  wordpress:
    image: wordpress:latest
    volumes:
      - ./wordpress:/var/www/html
    command: >
      bash -c "curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar &&
               chmod +x wp-cli.phar &&
               mv wp-cli.phar /usr/local/bin/wp &&
               docker-entrypoint.sh apache2-foreground"
```

**Key points:**

1. `curl -sO` - Silently download WP-CLI phar package
2. `chmod +x` - Add execute permission
3. `mv ... /usr/local/bin/wp` - Move to PATH directory for global access
4. `docker-entrypoint.sh apache2-foreground` - Execute original image entrypoint to start Apache

Verify after restart:

```bash
docker-compose down
docker-compose up -d
docker exec -it wordpress_container wp --version
# Output: WP-CLI 2.x.x
```

---
**Interested in similar solutions? [Contact us](/about)**
