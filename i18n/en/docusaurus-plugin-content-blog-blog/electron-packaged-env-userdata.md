---
title: "Packaged Electron App Can't Read .env? It Lives in userData"
description: "After packaging, cwd no longer points at your app and asar is read-only. Seed .env into userData and pass the path to dotenv.config via ENV_PATH."
date: 2026-09-28
tags: [Electron, dotenv, Node.js, Configuration]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How do I use app.getPath('userdata') for config files?"
    a: "Call it in the main process before any window or server starts: app.getPath('userData') returns the per-user data directory — ~/Library/Application Support/<app> on macOS, %APPDATA%\\<app> on Windows, ~/.config/<app> on Linux. Build your .env path with path.join(userDataPath, '.env') and it will be writable in every packaged build."
  - q: "Why can't my packaged Electron app read .env?"
    a: "Because dotenv defaults to process.cwd(), which is the launcher's directory after installation — on macOS a double-click even sets it to / — while your app resources sit inside a read-only asar archive. The fix: seed .env into userData on startup and hand that exact path to dotenv.config({ path })."
  - q: "Should .env.example be bundled into the app?"
    a: "Yes. Ship it as the first-run template inside the asar (read-only is fine for a template). On startup, if userData/.env does not exist, copy the example over. Users can then edit the copy directly to change configuration without reinstalling anything."
---

Configuration loads fine in development. After packaging the Electron app with electron-builder and installing it, every `process.env.XXX` is undefined and the modules that depend on them fail one after another.

> Encountered this while building a data-collection tool for a client — recording the root cause and the fix.

## TL;DR

**After packaging, `.env` is not in `process.cwd()` — it belongs in `app.getPath('userData')`.**

Three steps:

1. On startup, the main process checks whether `userData/.env` exists; if not, it copies the bundled `.env.example` over (seeding)
2. Store the full path in `process.env.ENV_PATH`
3. The config module reads it with `dotenv.config({ path: process.env.ENV_PATH || '.env' })`

## Symptoms

In development (`electron .`) everything works. After installing the packaged build (launched from the dock or the start menu), the configuration is empty:

```
undefined
undefined
TypeError: Cannot read properties of undefined (reading 'xxx')
```

Extra confusing part: launching the same packaged binary from a terminal inside its own directory sometimes works — because `process.cwd()` happens to be the app directory in that case. Same build, different launch method, different behavior.

## Root Cause: process.cwd() Is Unreliable After Packaging

`dotenv.config()` without arguments reads `process.cwd()/.env`. But `process.cwd()` is "the directory the process was started from", not "the directory the app is installed in" — they only coincide during development:

| Launch method | process.cwd() |
|---------|--------------|
| Dev: `electron .` from the project root | project root ✓ .env is here |
| Windows: double-click the exe | the exe's directory |
| macOS: double-click the .app | `/` (filesystem root) |

After packaging, there are exactly two places `.env` could live, and both fail:

- **asar archives are read-only**: electron-builder packs app resources into `app.asar`, mounted read-only at runtime. Even if you bundle `.env` inside, users cannot edit it — every config change would require a rebuild
- **The install directory is not writable**: Program Files and /Applications require elevated permissions to write; a normally-launched app cannot write there

Electron provides a standard directory for "runtime data belonging to this user": `app.getPath('userData')`. It resolves per platform (macOS `~/Library/Application Support/<app>`, Windows `%APPDATA%\<app>`, Linux `~/.config/<app>`), and it is guaranteed to exist, be writable, and survive reinstalls. That is where `.env` should live.

## The Fix: Seed + ENV_PATH

The change touches two files, about a dozen lines total.

**Step 1: seed on startup** (`electron/main.js`, before any window or the Express server starts):

```js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ── .env path setup ──
const userDataPath = app.getPath('userData');
const envPath = path.join(userDataPath, '.env');
// rootDir = the packaged app root; use app.getAppPath() or your project's convention
const envExamplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log(`[electron] .env copied to ${envPath}`);
}
process.env.ENV_PATH = envPath;
```

Logic: if `userData` has no `.env`, copy the bundled `.env.example` (read-only inside asar is fine — it is a template), then expose the final path as `process.env.ENV_PATH`.

**Step 2: the config module follows the pointer** (`src/config.js`):

```js
import dotenv from 'dotenv';
dotenv.config({ path: process.env.ENV_PATH || '.env' });
```

The `||` fallback keeps non-Electron contexts working (running the same code under plain Node), so development behavior is unchanged.

**Step 3: config changes without reinstalling.** To change an environment, edit the `.env` inside the userData directory and fully quit and relaunch the app — dotenv reads the file once, at process start; edits do not apply to a running process.

This "userData holds runtime state" pattern carries more than env files: login sessions, caches, and logs all belong there. The same tool stores its cookie-based login state this way — that investigation is covered in [Puppeteer Blocked by Anti-Bot? From Chrome CDP to an Electron Alternative](/blog/puppeteer-anti-bot-chrome-cdp-electron).

<InfoBox variant="warning" title="Watch out">

`process.env.ENV_PATH` must be set before the config module is imported — `dotenv.config()` reads the file at call time, not later. Do the seeding at the very top of the main-process entry file, not inside an `app.whenReady()` callback: if any module earlier in the import chain calls `require('dotenv').config()`, the path will not be there yet.

</InfoBox>

## FAQ

### How do I use app.getPath('userdata') for config files?

Call it in the main process before any window or server starts: `app.getPath('userData')` returns the per-user data directory — `~/Library/Application Support/<app>` on macOS, `%APPDATA%\<app>` on Windows, `~/.config/<app>` on Linux. Build your .env path with `path.join(userDataPath, '.env')` and it will be writable in every packaged build.

### Why can't my packaged Electron app read .env?

Because dotenv defaults to `process.cwd()`, which is the launcher's directory after installation — on macOS a double-click even sets it to `/` — while your app resources sit inside a read-only asar archive. The fix: seed .env into userData on startup and hand that exact path to `dotenv.config({ path })`.

### Should .env.example be bundled into the app?

Yes. Ship it as the first-run template inside the asar (read-only is fine for a template). On startup, if `userData/.env` does not exist, copy the example over. Users can then edit the copy directly to change configuration without reinstalling anything.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
