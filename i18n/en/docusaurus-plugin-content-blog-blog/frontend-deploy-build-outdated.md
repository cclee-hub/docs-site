---
title: Debugging Frontend Deployment Not Updating on Production
description: "New feature works locally but missing on production? Compare build artifact timestamps to identify outdated server builds"
date: 2026-03-07
tags: [Frontend Deployment, Nginx, Vite, Bug Fix]
schema: Article
---

## TL;DR

Frontend code pushed to Git but new feature missing on production? The root cause is usually **outdated build artifacts on the server**. Compare local and server `dist/` directory timestamps to confirm, then run `npm run build` on the server.


<!-- truncate -->
## Problem

New button/feature works locally (`npm run dev`) but not visible on production:

- Browser refresh doesn't help
- Clearing browser cache doesn't help
- Code logic looks correct
- Git confirms code was pushed

## Root Cause

Frontend static files are typically served directly by Nginx:

```
Git Push → Server git pull → Server npm run build → Nginx serves dist/
```

**The problem is between step 2 and 3**: Code was `git pull`ed, but `npm run build` wasn't executed or failed.

Common scenarios:
1. Auto-deploy script syncs code but doesn't trigger build
2. Manual deploy forgot to run build command
3. Build ran but output to wrong directory

## Solution

### Step 1: Compare Build Artifact Timestamps

```bash
# Local
ls -la dist/assets/ | head -5

# Server
ssh user@server "ls -la /path/to/project/dist/assets/ | head -5"
```

Output comparison:

```
# Local (latest build)
Mar  7 22:55 index-28dFGXhX.js   ← contains new feature

# Server (old build)
Mar  7 20:18 index-DsFdnylh.js   ← missing new feature
```

Different filenames (hash changed) means content changed, different timestamps means build not synced.

### Step 2: Rebuild on Server

```bash
ssh user@server "cd /path/to/project && npm run build"
```

### Step 3: Verify Build Artifacts Updated

```bash
ssh user@server "ls -la /path/to/project/dist/assets/"
```

Confirm timestamps and filenames match local.

### Step 4: Refresh Page

Since Vite/Webpack generates new filenames with hashes (e.g., `index-28dFGXhX.js`), `index.html` references the new file. Users just need a normal refresh, no forced cache clearing needed.

## Complete Debug Script

```bash
#!/bin/bash
# Save as check-deploy.sh

SERVER="user@server"
PROJECT_PATH="/path/to/project"

echo "=== Latest Local Commit ==="
git log --oneline -1

echo -e "\n=== Latest Server Commit ==="
ssh $SERVER "cd $PROJECT_PATH && git log --oneline -1"

echo -e "\n=== Local Build Time ==="
ls -la dist/assets/ | head -3

echo -e "\n=== Server Build Time ==="
ssh $SERVER "ls -la $PROJECT_PATH/dist/assets/ | head -3"

echo -e "\n=== Server vs Remote Diff ==="
ssh $SERVER "cd $PROJECT_PATH && git fetch origin && git log HEAD..origin/main --oneline"
```

## FAQ

### Q: Why is production still showing old code after Git push?

A: Git push only updates source code. Frontend requires `npm run build` to generate static files. If your deploy process doesn't automatically trigger a build, the server's `dist/` directory remains outdated. Nginx serves static files directly and won't auto-execute builds.

### Q: Why doesn't clearing browser cache work?

A: The problem isn't browser cache - the server's static files themselves are old. Even with forced refresh, Nginx returns the old JS/CSS files. The correct fix is updating build artifacts on the server.

### Q: How to avoid forgetting to rebuild?

A: Two options: 1) Configure CI/CD for automatic builds (e.g., GitHub Actions); 2) Use git hooks on the server to auto-run `npm run build` after `git pull`.

### Q: Why does Vite add hash to build filenames?

A: Vite adds content hash to bundle filenames by default (e.g., `index-28dFGXhX.js`). When content changes, hash changes. This is a cache busting strategy ensuring users always get the latest version while maintaining long-term cache capability.
