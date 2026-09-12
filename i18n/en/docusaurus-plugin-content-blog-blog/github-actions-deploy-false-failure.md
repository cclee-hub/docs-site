---
title: "GitHub Actions deploy false failure? pm2 restart race"
description: "pm2 restart races leave Actions red while the deploy lands; pnpm adds in the wrong cwd drift the lockfile so frozen-lockfile CI always fails."
date: 2026-09-13
tags: [GitHub Actions, PM2, pnpm, Deployment]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does pm2 report 'Process N not found' during a GitHub Actions deploy?"
    a: "Two deploy channels ran pm2 restart on the same process at the same time. One restart hits the instant the process is being replaced, finds nothing, and exits 1 — while pm2.log shows a successful restart and a 'process already online' error within the same second."
  - q: "GitHub Actions shows the deploy as failed — how do I tell if it is a false alarm?"
    a: "Check 3 things: the code on the server is the latest, pm2 list shows the process online, and the health check returns 200. If all three pass and the failure point is the pm2 restart step, it is a concurrency false alarm; collapsing deploys to a single channel removes it."
  - q: "What causes a pnpm frozen-lockfile error in CI when local installs pass?"
    a: "The root cause is pnpm-lock.yaml out of sync with package.json: running pnpm add in a subdirectory updates the child package declaration but leaves the root lockfile stale. Run pnpm install once at the workspace root, commit the regenerated lockfile, and check the specifiers diff in the CI log."
---

Push code, the GitHub Actions deploy step turns red and exits — yet the service on the server is already the latest version. Another day, the reverse: everything is green locally while `pnpm install --frozen-lockfile` fails on CI every single time. These two opposite signal failures both live in the deploy pipeline, not in the code.

I hit this while building an [e-commerce automated data collection tool](/cases/ecommerce-data-collection-tool) for a client — bulk-scraping product images, SKUs, prices, and reviews, cleaned and exported as structured data for inventory management and competitor analysis. The tool's server deploys through PM2 + GitHub Actions, and both false failures happened on that pipeline.

## TL;DR

- **CI red but the deploy actually landed**: two deploy channels ran `pm2 restart` concurrently; one looked up the process mid-restart and misreported failure. Signature: pm2.log shows a successful restart and a `process already online` error within the same second. Fix: collapse deploys to a single channel.
- **Local green but CI always fails**: `pnpm add` ran in a subdirectory, updating only the child `package.json` while the root `pnpm-lock.yaml` went stale. Fix: run `pnpm install` at the workspace root and commit the regenerated lockfile.

## Scenario 1: green locally, CI always red — pnpm lockfile drift

This failure has nothing to do with code quality — pnpm-lock.yaml simply drifted out of sync with package.json, and CI is the only environment that checks the two strictly.

### The symptom

CI fails on every run at the same step:

```text
ERR_PNPM_OUTDATED_LOCKFILE
```

Locally, install, build, and tests all pass. That "works on my machine but CI fails" combination tempts you to suspect CI caching or the Node version first — both wrong here.

### Root cause: pnpm add ran in the wrong directory

This project is a pnpm workspace monorepo with a single lockfile at the root. The dependency was added like this:

```bash
# executed inside client/
pnpm --filter @ccl-ext/client add <pkg>
```

`client/package.json` got updated, but the root `pnpm-lock.yaml` was never regenerated and committed. CI then received a lockfile inconsistent with package.json, and the `--frozen-lockfile` check refused to install.

Why local never catches it: node_modules already has the packages physically installed, so a local install reuses what is there and never exercises the frozen check. CI starts from a clean environment and compares the lockfile strictly, every time.

There is also a telltale side effect: running pnpm in the wrong cwd leaves a stray `client/pnpm-lock.yaml` behind. Spotting that file is near-proof that a command ran in the wrong place again.

### The fix

Two steps:

1. From the workspace root, run `pnpm install` to regenerate the root lockfile, and commit it with the code;
2. From now on, run `pnpm add` / `pnpm remove` at the workspace root only.

The specifiers diff in the CI failure details names exactly which package's dependency range changed — use it to confirm the fix targets the right spot.

A similar "wrong attribution" issue in multi-package workspaces is covered here: [npm audit blames the wrong directory? Multi-package deploys audit N package trees](/blog/npm-audit-multi-package-deploy-attribution).

## Scenario 2: Actions reports failure, the deploy actually landed — pm2 restart race

The deploy itself did not fail; the second, colliding restart did — PM2 reported that race as a deploy error.

### The symptom

After a push, GitHub Actions "Deploy Server" fails at the pm2 restart step:

```text
[PM2][ERROR] Process 3 not found → exit 1
```

But on the server: the code is the latest, `pm2 list` shows the process online, and the health check returns 200. All three deploy essentials pass — only Actions believes it failed.

### Root cause: two channels restarting the same process

Deploys had two trigger paths at the time:

1. The push trigger in `deploy.yml`;
2. A local `/deploy` script (deploy.sh).

One push made both paths run `pm2 restart ccl-ext-api`. When the restarts collided, one of them queried the process at the exact instant the other was replacing it, found nothing, logged `Process not found`, and exited 1 — PM2 reported the race as a failure.

### Verification: the same second in pm2.log

pm2.log is the hardest evidence. The log shows two kinds of records within the same second:

```text
# one side: the restart completes, process online
Stopping → starting → online

# the other: the colliding restart finds no process
PM2 error: process already online
```

One restart "in flight" interleaving with another "querying" inside 1 second is the race signature. Combined with the three checks — code latest, process online, health 200 — the deploy landed and the Actions failure was noise.

### The fix: drop the push trigger, single deploy channel

The change removes the push auto-trigger from `deploy.yml`, keeping `workflow_dispatch` for manual fallback:

```yaml
on:
  workflow_dispatch:
```

Between the two options — a concurrency lock versus collapsing to one channel — I chose the latter: a lock only makes the two channels queue up, leaving two deploy paths in place. A deploy should have exactly one entry point; who deployed what, when, should originate from a single place. After the change, the false alarms never returned.

For a different take on verifying what is actually live after a deploy, see: [Frontend deployed but the site did not update? Troubleshooting stale builds](/blog/frontend-deploy-build-outdated).

<InfoBox variant="warning" title="Watch out">

- The kept `workflow_dispatch` trigger can still race a local deploy — use it only when no local deploy is in progress.
- The race window is tiny (about 1 second), but with two channels in place a higher push frequency makes collisions a matter of when, not if.
- Order of judgment for a suspected false failure: server essentials first (code, process, health), then pm2.log for the same-second double record, and only then consider a re-run.

</InfoBox>

## Side by side: both false failures share one trait — a polluted signal source

Put the two scenarios together and one trait surfaces immediately: what broke was never the deploy result, but the pipeline producing the signal.

| | Scenario 1 | Scenario 2 |
|---|---|---|
| Surface signal | CI always red, local green | Actions red, server updated |
| Actual state | lockfile genuinely out of sync | deploy completed |
| Pollution source | pnpm run in the wrong cwd | a second deploy channel |
| Hard evidence | specifiers diff + stray child lockfile | same-second double record in pm2.log |

CI's red and green are just the pipeline's output. When the pipeline itself is polluted (two lockfiles, two channels), the signal stops being trustworthy. Fix the pipeline first; read the signal after.

## FAQ

### Why does pm2 report 'Process N not found' during a GitHub Actions deploy?

Two deploy channels ran pm2 restart on the same process at the same time. One restart hits the instant the process is being replaced, finds nothing, and exits 1 — while pm2.log shows a successful restart and a 'process already online' error within the same second.

### GitHub Actions shows the deploy as failed — how do I tell if it is a false alarm?

Check 3 things: the code on the server is the latest, pm2 list shows the process online, and the health check returns 200. If all three pass and the failure point is the pm2 restart step, it is a concurrency false alarm; collapsing deploys to a single channel removes it.

### What causes a pnpm frozen-lockfile error in CI when local installs pass?

The root cause is pnpm-lock.yaml out of sync with package.json: running pnpm add in a subdirectory updates the child package declaration but leaves the root lockfile stale. Run pnpm install once at the workspace root, commit the regenerated lockfile, and check the specifiers diff in the CI log.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
