---
title: "npm audit Findings Attributed to the Wrong Directory? Match Package Trees by audited N"
description: "npm audit summary lines carry no path, so in multi-package deploys vulnerability reports get attributed to the wrong directory. Locate the source by the audited N packages count, then pin transitive dependencies with overrides."
date: 2026-08-28
tags: [npm, Node.js, DevOps, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is npm audit fix not working?"
    a: "npm audit fix only upgrades within the allowed semver range. When the vulnerability sits in a transitive dependency pinned by an upstream package, fix can't touch it — use package.json overrides and reinstall."
  - q: "How do I find which dependency chain an npm audit finding comes from?"
    a: "Check the Path field in the full npm audit output, or trace dependents with npm ls <package>. The summary line only shows counts, with no path or chain."
  - q: "How do I map npm audit results to a specific subproject?"
    a: "Deploy log summaries carry no directory name. Match them by the added/audited N packages tree size of each directory; run npm install locally in each to record the N values."
---

While deploying a multi-package project (frontend and backend sharing one repository), npm audit reported 3 high vulnerabilities in the deploy log. We logged them against the backend — only to confirm later that all 3 highs lived in the frontend tree, and the backend had been a separate set of moderates all along.

Encountered this while building [AI Analytics](/docs/ai-analytics) — an LLM-powered analytics platform that surfaces market trends, user behavior, and sales data; the frontend lives at the repository root and the backend in `server/`, deployed separately from one repo.

## TL;DR

npm audit summary lines carry only counts, **no path**. When a deploy pipeline runs `npm install` in several directories in sequence, the outputs interleave and the summaries become unattributable. The fix: use each package tree's unique fingerprint — the N in `audited N packages` — to attribute findings first, then pin the vulnerable transitive dependencies with `overrides` in `package.json`. A second deploy brought both sides to zero.

## Symptoms

The deploy script runs `npm install` in the frontend (repo root) and then the backend (`server/`), and both outputs land in the same log stream:

```
# Deploy log (summary lines carry no path)
added 546 packages in 41s
found 3 high severity vulnerabilities

added 372 packages in 24s
found 4 moderate severity vulnerabilities
```

Our handover notes attributed the "3 high" to `server/`. Chasing the backend dependency chain led nowhere — the `server/` audit, run locally or on the server, consistently showed 4 moderates and never a single high. "Visible in the log, unattributable in practice" is a chronic disease of mixed deploy pipelines; our earlier write-up on [stale build artifacts after deployment](/blog/frontend-deploy-build-outdated) is the same family of problem.

## Root Cause

The npm audit summary only prints "found X vulnerabilities" with no directory info, and the adjacent `audited 546 packages` rarely registers as an attribution clue. Two package trees with wildly different sizes (546 vs 372) turn out to be the only stable fingerprint.

The frontend root installs the full Vite + React + Ant Design Pro stack, so its tree is large; `@ant-design/pro-components → @ant-design/pro-layout` pulls in an old `path-to-regexp`, which is exactly where the 3 highs came from. The backend `server/` is a lean Express + tsx tree whose only issue is the `tsx → @esbuild-kit/core-utils → old esbuild` chain of moderates.

## Solution

### Step 1: Attribute findings by audited N

Run `npm install` in each directory locally (or read `added N packages` straight from the deploy log) and record the tree sizes:

```bash
cd <repo-root> && npm install 2>&1 | tail -2   # added 546 packages ...
cd server      && npm install 2>&1 | tail -2   # added 372 packages ...
```

In the deploy log, `found 3 high` immediately follows `added 546` → frontend; `4 moderate` follows `added 372` → backend. Get attribution right before touching any dependency.

### Step 2: Expand the vulnerability chain

```bash
npm audit                # see the Path field, full chain
npm ls path-to-regexp    # or reverse-lookup who depends on a package
```

The frontend output confirmed the chain: `@ant-design/pro-components → @ant-design/pro-layout → path-to-regexp` (old version, 3 high).

### Step 3: Pin the transitive dependency with overrides

Frontend root `package.json`:

```json
{
  "overrides": {
    "path-to-regexp": "^8.4.2"
  }
}
```

Backend `server/package.json` (with tsx bumped to a newer release):

```json
{
  "overrides": {
    "@esbuild-kit/core-utils": {
      "esbuild": "^0.25.12"
    }
  }
}
```

`overrides` supports nested syntax, scoping the pin to the child dependency under one specific parent — more surgical than overriding a package name globally.

### Step 4: Reinstall and verify

```bash
rm -rf node_modules package-lock.json && npm install && npm audit
```

After redeploying both sides, audit reports 0 vulnerabilities on each.

<InfoBox variant="warning" title="Notes">

- `overrides` requires npm 8.3+ and only takes effect in the package root `package.json`; run `npm install` afterward to refresh the lockfile, or nothing changes.
- Pinning across a major version (e.g. old `path-to-regexp` → 8.x) can break the APIs of packages that depend on it. Make sure the build passes and regression-test key pages before merging — don't stop at "audit says zero".
- The "audited N" fingerprint is only reliable while the tree is stable: any dependency change shifts N. Fine for attribution during an incident, but don't hard-code it as an assertion in long-lived scripts.

</InfoBox>

## FAQ

### Why is npm audit fix not working?

`npm audit fix` only upgrades versions inside the allowed semver range. When the vulnerability lives in a transitive dependency whose version is pinned by an upstream package's range, fix cannot touch it. Use `overrides` in `package.json` to force the version, then reinstall.

### How do I find which dependency chain an npm audit finding comes from?

Read the Path field in the full `npm audit` output — it lists the complete chain from a direct dependency down to the vulnerable package. You can also reverse-lookup with `npm ls <package>`. Summary lines carry counts only.

### How do I map npm audit results to a specific subproject?

Deploy log summaries carry no directory name, so match them by each directory's `added N packages` / `audited N packages` tree size. Run `npm install` once per directory locally, record each N, and the mapping stays stable.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
