---
title: "Postgres 42501 on new tables? Default grants per database"
description: "ALTER DEFAULT PRIVILEGES covers only the database you ran it in. Run it per database, and clear stale entries with DROP OWNED BY to unblock DROP ROLE."
date: 2026-11-13
tags: [PostgreSQL, SQL, debugging]
authors: [cclee]
image: "/images/blog/postgres-alter-default-privileges-per-database-architecture-en.webp"
schema: FAQPage
faqs:
  - q: "Why is ALTER DEFAULT PRIVILEGES not working for new tables?"
    a: "Because its scope is one role in one database: running it in the postgres database only affects future objects created there. Run it in each application database, with FOR ROLE set to the role that actually creates tables."
  - q: "What does PostgreSQL error 42501 (permission denied for table) mean?"
    a: "SQLSTATE 42501 is insufficient_privilege. When old tables query fine and only migrated tables fail, the app role is missing default grants — verify with SELECT count(*) FROM pg_default_acl; in that database (0 means none configured), then add the per-database ALTER DEFAULT PRIVILEGES."
  - q: "Do I need ALTER DEFAULT PRIVILEGES FOR ROLE in every database?"
    a: "Yes — once per database per table-creating role, and it only covers future objects, so existing tables need a one-time GRANT ... ON ALL TABLES IN SCHEMA public. To drop a role blocked by 'privileges for default privileges', run DROP OWNED BY in each database holding stale entries, and retry DROP ROLE once SELECT count(*) FROM pg_default_acl; returns 0 there."
---

While creating new tables with a dedicated owner role in a multi-tenant system, every query from the application role failed with permission denied for table — old tables were fine, every freshly migrated table was unreachable.

Ran into this in a Node.js + PostgreSQL multi-tenant system (row-level security isolating tenant data).

<!-- TODO backfill source note once the product page exists: Ran into this while building [product](link) — {business value} -->

## TL;DR

`ALTER DEFAULT PRIVILEGES` is not a global switch: its scope is "which role grants × which database it runs in". Running it once in the postgres database gives future tables in your app database nothing — queries fail with 42501 anyway. Fix in two moves: run it in every application database; and when DROP ROLE complains about dependencies, clear the stale entries with `DROP OWNED BY` in that same database.

## Symptoms: old tables work, new tables fail with 42501

A freshly created table is immediately unreadable for the application role while the same role queries every existing table without trouble — grants missing only on "tables created after migration" is the signature of missing default privileges. If you searched "postgres permission denied for table", "42501 insufficient privilege", or "granted privileges but still permission denied", it's the same problem.

```sql
-- a table the owner role just created via migration
ERROR:  permission denied for table vendors
SQLSTATE: 42501
```

The second symptom shows up later, when cleaning up a role:

```text
ERROR:  role "app_role" cannot be dropped because some objects depend on it
DETAIL:  privileges for default privileges in database appdb
```

The DETAIL line is the tell: the dependency is not a table or a function, it's a stale default-privileges entry.

## Root cause: ALTER DEFAULT PRIVILEGES is scoped to a role × a database

**The default-privilege rule lives in the database where you ran it, and never crosses databases.** What `ALTER DEFAULT PRIVILEGES` records is a rule — "objects created in this database, from now on, by the role named in FOR ROLE (default: the current role), are granted to the TO role automatically". The rule is stored in the database-local `pg_default_acl` catalog, which means:

- run it in the **postgres database** → only future objects in the postgres database are covered
- never ran it in the app database → new tables there carry no default grants at all
- tables get created by a different role (no FOR ROLE) → the rule doesn't match

The order of events that produced this: a tutorial-style "global" default-privilege statement ran in the postgres database first, then the app database was created. The first few tables happened to be granted manually, so everything looked fine — until migrations started creating tables automatically and 42501 errors appeared in bulk. First hypothesis: a missing GRANT statement; adding grants changed nothing. The stale entry surfaced only when dropping an unused role failed with privileges for default privileges in the DETAIL — the grants did exist, just in the wrong database.

PostgreSQL treating "where you run it" as a behavior boundary shows up elsewhere too: [fe_sendauth across containers](/blog/postgres-fe-sendauth-docker-cross-container) is the same logic — identical command, different execution path, completely different rules.

![ALTER DEFAULT PRIVILEGES scope: one role × one database](/images/blog/postgres-alter-default-privileges-per-database-architecture-en.webp)

## Fix: grants go into the app database, cleanup goes into the same database

Three steps, all organized around the database unit:

1. **Inventory which databases have default privileges.** Run in each database; 0 in an application database means it was missed:

```sql
SELECT count(*) FROM pg_default_acl;
```

2. **Run the default grants per database.** One statement for TABLES, one for SEQUENCES, FOR ROLE naming the role that actually creates tables:

```sql
-- run with psql -d <appdb>, not while connected to the postgres database
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_role;
```

3. **Clear stale entries.** When DROP ROLE reports dependencies, connect to each database named in the DETAIL (every database holding default-privileges entries) and run:

```sql
DROP OWNED BY app_role;
DROP ROLE app_role;
```

For new databases, bake step 2 into the provisioning script — every grant statement in our init script is forced through `-d <database>`, which rules out the "ran it while connected to postgres" failure mode for good.

Default privileges only cover future objects, so tables that already exist need a one-time grant:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
```

<InfoBox variant="warning" title="Watch out">

- **No FOR ROLE means the current role**: run it as the superuser without FOR ROLE and the rule is attached to the superuser — it only fires when the superuser creates objects, and migrations running as the owner role still produce ungranted tables.
- **DROP OWNED drops objects too**: it revokes the role's privileges in that database and drops objects it owns. Use it for dedicated roles being removed, not casually on shared roles.
- **A new database is a new grants gap**: default privileges are not inherited on CREATE DATABASE. "Create database → immediately set default privileges" should be one fixed step in the provisioning script.

</InfoBox>

## FAQ

### Why is ALTER DEFAULT PRIVILEGES not working for new tables?

Its scope is one role in one database: running it in the postgres database only affects future objects created there. Run it in each application database, with FOR ROLE set to the role that actually creates tables.

### What does PostgreSQL error 42501 (permission denied for table) mean?

SQLSTATE 42501 is insufficient_privilege. When old tables query fine and only migrated tables fail, the app role is missing default grants — verify with `SELECT count(*) FROM pg_default_acl;` in that database (0 means none configured), then add the per-database ALTER DEFAULT PRIVILEGES.

### Do I need ALTER DEFAULT PRIVILEGES FOR ROLE in every database?

Yes — once per database per table-creating role, and it only covers future objects, so existing tables need a one-time `GRANT ... ON ALL TABLES IN SCHEMA public`. To drop a role blocked by "privileges for default privileges", run `DROP OWNED BY` in each database holding stale entries, and retry DROP ROLE once `SELECT count(*) FROM pg_default_acl;` returns 0 there.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
