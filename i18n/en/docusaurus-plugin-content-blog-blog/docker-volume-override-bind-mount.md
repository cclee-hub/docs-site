---
title: "Docker Container Can't See Host Files? Anonymous Volume Overrides Bind Mount"
description: Configured bind mount in docker-compose.yml but container doesn't see host files. WordPress official image's VOLUME declaration creates anonymous volumes that override your mount config.
date: 2026-04-04
tags: [Docker, WordPress, Container Deployment]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why can't the container see host files even with bind mount configured?"
    a: "The VOLUME declaration in the image's Dockerfile creates an anonymous volume with higher mount priority than docker-compose.yml bind mounts."
  - q: "How to verify if anonymous volume override is the issue?"
    a: "Run docker inspect <container> and check the Mounts field. If you see Type: volume with a Docker-managed path, that's an anonymous volume."
---

Encountered this issue while deploying a WordPress site for a client. Here's the root cause and solution.

## TL;DR

The `VOLUME` declaration in an image's Dockerfile creates anonymous volumes with higher mount priority than docker-compose.yml bind mounts. Solution: Stop container → Delete anonymous volume → Restart.


<!-- truncate -->
## Problem

After CI deployment, new static files or PHP code don't exist inside the container:

- `assets/images/logo.png` exists on host, missing in container → Logo doesn't display
- `inc/setup.php` has new filter code, container has old version → Filter doesn't work
- Files updated after `git pull`, container still has old content

## Root Cause

WordPress official image's Dockerfile includes:

```dockerfile
VOLUME /var/www/html
```

Even if your docker-compose.yml configures bind mount:

```yaml
volumes:
  - ./wordpress/wp-content:/var/www/html/wp-content
```

Docker still creates an anonymous volume for the `VOLUME` declared path. **Anonymous volumes have higher mount priority than bind mounts**, causing:

1. `/var/www/html` is taken over by anonymous volume
2. Your bind mount targets `/var/www/html/wp-content`
3. But the anonymous volume already "occupies" the parent directory, bind mount gets overridden

Verify with `docker inspect`:

```bash
docker inspect prod_wordpress --format '{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

Output similar to:

```
volume: /var/lib/docker/volumes/wp-prod_wp_html/_data -> /var/www/html  # Anonymous volume!
bind: /var/www/wp-prod/wordpress/wp-content -> /var/www/html/wp-content
```

## Solution

```bash
# 1. Stop containers
cd /var/www/wp-prod && docker compose down

# 2. Delete anonymous volume
docker volume rm wp-prod_wp_html

# 3. Restart
docker compose up -d
```

### Verification

```bash
docker inspect prod_wordpress --format '{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

Should only show bind mount, no anonymous volume:

```
bind: /var/www/wp-prod/wordpress/wp-content -> /var/www/html/wp-content
```

## Prevention

When using bind mount deployment, check if the image declares `VOLUME`. If declared:

1. Before first start, confirm no residual anonymous volumes exist
2. Or modify docker-compose.yml to make bind mount path match VOLUME path (mount to same level)

After fixing, `git pull` updates are automatically read by the container—no `docker cp` or container restart needed.

<InfoBox variant="warning" title="Important">

- Backup data before deleting anonymous volumes or ensure it can be restored via git pull
- Test in staging environment before production operations
- If container has critical data, backup with `docker cp` first

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">Contact</a>
</div>
