---
title: "Airflow 3 password reset not working? It reads a JSON file"
description: "Airflow 3 password change 401? ab_user is legacy FAB data. Real source: SimpleAuthManager's passwords.json — recreate the api-server after editing."
date: 2026-09-28
tags: [Airflow, Docker, DevOps, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does the reset-password command fail after upgrading to Airflow 3?"
    a: "On 3.x deployments running SimpleAuthManager, the FAB airflow users CLI is gone for good — it crashes with AttributeError: AirflowSecurityManagerV2 has no attribute find_user (verified). Run airflow config get-value core auth_manager first to see which manager actually handles auth."
  - q: "Where does SimpleAuthManager store user passwords?"
    a: "In a passwords.json file (flat JSON like {\"username\": \"password\"}) pointed to by AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE. The file is read only at container startup — after editing it you must run docker compose up -d --force-recreate airflow-api-server."
  - q: "Why doesn't updating the ab_user table change the password?"
    a: "ab_user belongs to the FAB auth manager. On deployments migrated to SimpleAuthManager it is leftover data the auth flow never reads — we wrote a scrypt hash with rowcount=1 and /auth/token still returned 401."
---

After updating a user password on Airflow 3, requests to `/auth/token` with the new password still return 401 — while the password hash in the database verifiably holds the new value.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy. The platform's DAG trigger chain rides on this Airflow JWT auth, so a stuck password rotation left the pipeline authorization dangling.

## Symptom: password changed, /auth/token still answers with the old one

The new password gets 401 from `/auth/token` while the old one still gets 201 — every modification step "succeeded", yet the password in effect never changed. This particular rotation was incident response: the old credential had leaked, so every minute of "changed but not effective" was exposure.

The first reflex is the official CLI:

```text
$ airflow users reset-password -u apiuser -p <new>
AttributeError: 'AirflowSecurityManagerV2' object has no attribute 'find_user'
```

The error points into the FAB (Flask-AppBuilder) auth stack, which smells like a 3.x version bug. CLI broken? Fine — bypass it and update the database directly. That detour set up an even deeper trap.

## Root cause: SimpleAuthManager never reads the database — the password lives in passwords.json

This deployment's auth manager is not the FAB the error implies, but **SimpleAuthManager** — one command reveals it:

```bash
airflow config get-value core auth_manager
# airflow.api_fastapi.auth.managers.simple.simple_auth_manager.SimpleAuthManager
```

Three layers, and the symptom explains itself:

- **The CLI error is a red herring.** The `airflow users` CLI family belongs to the FAB auth stack; on a SimpleAuthManager deployment its code path crashes with `AttributeError`. The `AirflowSecurityManagerV2` class in the message does exist (as a leftover component), but it has nothing to do with the manager actually handling auth.
- **`ab_user` is a leftover table.** Deployments upgraded from Airflow 2.x carry FAB's user tables. Writing directly — `UPDATE ab_user SET password=...` with a werkzeug `generate_password_hash` scrypt hash — returned rowcount=1, and `check_password_hash` confirmed the stored hash matched the new password. Yet `/auth/token` kept answering 401: **the table genuinely changed; the auth flow simply never reads it**.
- **The real source is a JSON file.** SimpleAuthManager takes user passwords from the file pointed to by `AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE` — a flat mapping:

```json
{
  "apiuser": "<password>",
  "admin": "<password>"
}
```

The username-to-role mapping is declared separately via `AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_USERS` (e.g. `apiuser:admin,admin:admin`). The first move in incidents like this should be asking "which manager owns auth?", not patching the symptom "auth is broken".

## The fix: edit passwords.json, then force-recreate the container

Three steps:

1. Edit the host-side passwords.json (the source file mounted into the container):

```bash
python3 - <<'EOF'
import json
d = json.load(open('/root/workspace/ai_dag/deploy/passwords.json'))
d['apiuser'] = '<new password>'
json.dump(d, open('/root/workspace/ai_dag/deploy/passwords.json', 'w'), indent=2)
EOF
```

2. Recreate the api-server container. This step is not optional — the password file is **read only at startup**, so editing it does nothing to the running process:

```bash
cd /root/workspace/ai_dag/deploy
docker compose up -d --force-recreate airflow-api-server
```

3. Once the service is up, verify in both directions — the new password must pass AND the old one must fail; both assertions matter:

```bash
# health: back to 200 within ~30s of the recreate
curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/v2/monitor/health

# new password → expect 201
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"apiuser","password":"<new>"}'

# old password → expect 401
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"apiuser","password":"<old>"}'
```

On this incident the results were 201 for the new password, 401 for the old — rotation closed. Verifying only "the new password works" without "the old one fails" is the most common loose end in credential rotation.

<InfoBox variant="warning" title="Watch out">

- **Identify the auth manager before touching anything**: the output of `airflow config get-value core auth_manager` decides where the password lives — FAB keeps it in the database, SimpleAuthManager in a file. Completely different paths.
- **Editing the password file demands a container recreate**: the file is read only at startup, and `docker compose restart` won't reload it.
- **Services depending on that auth must pick up the new password too** and restart — otherwise the pipeline sits in a window where the old password 401s and the new one isn't wired in.
- **Recreating the api-server costs seconds to half a minute of downtime** — do it off-peak, and poll health until it returns 200 before verifying.

</InfoBox>

## FAQ

### Why does the reset-password command fail after upgrading to Airflow 3?

On 3.x deployments running SimpleAuthManager, the FAB `airflow users` CLI is gone for good — it crashes with `AttributeError: 'AirflowSecurityManagerV2' object has no attribute 'find_user'` (verified). Run `airflow config get-value core auth_manager` first to see which manager actually handles auth.

### Where does SimpleAuthManager store user passwords?

In a passwords.json file (flat JSON like `{"username": "password"}`) pointed to by `AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE`. The file is read only at container startup — after editing it you must run `docker compose up -d --force-recreate airflow-api-server`.

### Why doesn't updating the ab_user table change the password?

`ab_user` belongs to the FAB auth manager. On deployments migrated to SimpleAuthManager it is leftover data the auth flow never reads — we wrote a scrypt hash with rowcount=1 and `/auth/token` still returned 401.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
