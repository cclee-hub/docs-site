---
title: "PostgreSQL fe_sendauth in Docker? exec trust vs TCP auth"
description: "fe_sendauth: no password supplied over cross-container TCP? Socket trust does not apply to TCP — put the password in the DSN."
date: 2026-09-28
tags: [Docker, PostgreSQL, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What does fe_sendauth: no password supplied mean?"
    a: "The server's pg_hba.conf requires password auth, but the client's connection string carries no password. It is not \"wrong password\" (that's authentication failed) — it's \"no password at all\"; check whether the DSN is missing its password part."
  - q: "Why does docker exec psql connect without a password?"
    a: "Inside the container psql uses the Unix domain socket, which pg_hba covers with a trust rule; cross-container traffic is TCP and hits a host rule that demands a password. Same command, different path, completely different auth requirements."
  - q: "How should containerized scripts connect to PostgreSQL?"
    a: "Use a DSN with an explicit password — postgresql://user:password@host:5432/db — read from the DB container's POSTGRES_PASSWORD environment variable. Don't hardcode it and don't expect socket trust to apply over TCP."
---

On the host that runs the database container, `docker exec`-ing in and running psql connects with no password at all. Run the same username from another container over TCP and it dies instantly with `fe_sendauth: no password supplied`.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy. Ops scripts inside the orchestration container reach the analytics database cross-container, and a connection string copied from the exec habit tripped on the very first hop.

## Symptom: exec connects, TCP answers fe_sendauth: no password supplied

Same host, same database, same user — two paths, two fates. Verified matrix (Airflow container → PostgreSQL container):

| Connection method | Result |
|-------------------|--------|
| `docker exec cclhub-db psql -U postgres` (in-container socket) | Connects, no password |
| Cross-container TCP, DSN without password | `fe_sendauth: no password supplied` |
| Cross-container TCP, DSN with password | Connects |

If you searched for "fe_sendauth no password supplied", "psql no password error" or "docker postgres connection fails without password" — this is it.

## Root cause: socket trust and TCP password auth are two different pg_hba paths

PostgreSQL authentication is matched line by line in `pg_hba.conf` by connection type, and the official image ships completely different rules for the two paths:

- **`docker exec` uses the Unix domain socket**, covered by a `local all all trust`-style rule — local socket is trusted, no password asked;
- **Cross-container traffic is TCP** (a `host`-type rule), and the official image defaults to scram-sha-256 / md5 password auth.

So the no-password habit built on exec turns into "no password at all" the moment you switch to TCP — the literal meaning of `fe_sendauth: no password supplied` is "the server wants a password and the client supplied none".

Worth separating two often-confused errors: **`no password supplied` means no password was provided; `password authentication failed` means one was, and it was wrong**. The former points at the connection string; the latter at the credential itself — different fixes.

## The fix: put the password in the DSN, don't copy the exec habit

Cross-container scripts use a password-carrying connection string, always:

```bash
postgresql://postgres:<password>@<db host>:5432/<db>
```

The recommended source for the password is the DB container's own environment — the official image's `POSTGRES_PASSWORD` exists precisely for initialization — avoiding a second hardcode:

```bash
PW=$(docker exec cclhub-db printenv POSTGRES_PASSWORD)
psql "postgresql://postgres:${PW}@localhost:5432/postgres" -c "SELECT 1"
```

Application-side (Python here) it's the same shape, with the DSN in environment management:

```python
import os
import psycopg

DSN = os.environ["APP_DB_DSN"]  # postgresql://user:pass@host:5432/db
with psycopg.connect(DSN) as conn:
    conn.execute("SELECT 1")
```

Note that passwords containing reserved characters like `@ : / #` must be percent-encoded in the URL — another place special characters bite; avoiding them in generated database passwords removes an entire class of trouble.

## Boundary cases

- **The error's shape varies by client**: an interactive libpq terminal (psql without `-t`) first prompts `Password for user postgres:` and then fails with fe_sendauth; connection pools and GUI tools (pgAdmin) surface it as an auth failure in the UI — different texts, same root cause.
- **`.pgpass` files and the `PGPASSWORD` environment variable** are two alternative ways to supply the password; in containerized setups, DSN/env injection is more common than mounting a .pgpass file.
- **You can set pg_hba to trust for TCP too** — technically possible, and wrong for production: anything that can reach the port gets credential-free access.
- **Auth method version drift**: newer official images default to scram-sha-256; very old client libraries may not support it — that's a different error class (unsupported authentication method), not "no password supplied".

<InfoBox variant="warning" title="Watch out">

- **Diagnose the connection path first**: socket or TCP, and which pg_hba rule it matches, decides whether a password is even requested — don't generalize exec behavior to everything.
- **Keep the error semantics straight**: `no password supplied` (missing) and `authentication failed` (wrong) lead to completely different fixes.
- **Avoid or percent-encode special characters in DSN passwords** — URL reserved characters silently change how the string parses.

</InfoBox>

## FAQ

### What does fe_sendauth: no password supplied mean?

The server's pg_hba.conf requires password auth, but the client's connection string carries no password. It is not "wrong password" (that's authentication failed) — it's "no password at all"; check whether the DSN is missing its password part.

### Why does docker exec psql connect without a password?

Inside the container psql uses the Unix domain socket, which pg_hba covers with a trust rule; cross-container traffic is TCP and hits a host rule that demands a password. Same command, different path, completely different auth requirements.

### How should containerized scripts connect to PostgreSQL?

Use a DSN with an explicit password — `postgresql://user:password@host:5432/db` — read from the DB container's `POSTGRES_PASSWORD` environment variable. Don't hardcode it and don't expect socket trust to apply over TCP.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
