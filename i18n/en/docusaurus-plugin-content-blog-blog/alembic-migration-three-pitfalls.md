---
title: "Model Changed but Column Missing? 3 Alembic Pitfalls"
description: "Column does not exist after a model change? Fix the three Alembic pitfalls: async engine config, down_revision chain breaks, and skipped autogenerate."
date: 2026-09-28
tags: [Alembic, SQLAlchemy, FastAPI, PostgreSQL, AI Agent]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What are the basic alembic migration commands?"
    a: "Generate a migration with alembic revision --autogenerate -m \"message\", apply it with alembic upgrade head, roll back one step with alembic downgrade -1, and inspect the chain with alembic history. The standard workflow after any model change is exactly two steps: autogenerate, then upgrade head. Skip either one and the table stays unchanged."
  - q: "I created my tables with SQLAlchemy — why doesn't a model change take effect?"
    a: "A SQLAlchemy model is a code-level declaration only; it never touches the database. Alembic migrations own schema changes. Even if you built tables with create_all() locally, the new column lives in in-memory metadata — production PostgreSQL raises ProgrammingError: column does not exist the first time a query touches it. Always generate a migration and run upgrade."
  - q: "Why does alembic upgrade fail with Can't locate revision?"
    a: "Your down_revision references a revision identifier that does not exist in the chain — usually a short name typed from memory. Run alembic history to get the real IDs, point the new migration's down_revision at the actual chain tail, then run alembic upgrade head. revision and down_revision must match character for character; one wrong character breaks the whole chain."
---

You add a field to a SQLAlchemy model in a FastAPI project using async SQLAlchemy. Everything works locally. After deploying, the first API call throws `sqlalchemy.exc.ProgrammingError: column "xxx" does not exist` — the model changed, the table did not.

> Encountered this while building an AI Agent SaaS platform for a client — recording the root causes and fixes.

## TL;DR

When the model changed but the table didn't (or alembic won't even run), it is one of three pitfalls:

1. **Alembic still using the async engine** — Alembic does not run inside an event loop. `env.py` must switch to a sync URL (`postgresql+asyncpg://` → `postgresql://`, psycopg2 driver)
2. **down_revision pointing at a revision ID that doesn't exist** — `alembic upgrade` fails with `Can't locate revision`
3. **Model edited, migration never generated** — the code looks right, the table is untouched, and production blows up on first use of the new column

The three pitfalls map to "migration won't run", "chain is broken", "migration was never created" — in that triage order.

## Symptoms

Three symptoms, one per pitfall:

**Symptom 1: production error after adding a model field**

```
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedColumn) column "risk_threshold" does not exist
```

Works locally, fails on the first production query.

**Symptom 2: the migration command itself fails**

```
Can't locate revision identified by '001_initial'
```

`alembic upgrade head` never reaches your new migration.

**Symptom 3: autogenerate reports no changes**

```
Generating migration ...  (no changes in schema detected)
```

You definitely edited a model, yet alembic sees nothing — usually `env.py` never imports your models, or it connects to the wrong database.

## Root Cause 1: Alembic Running on an Async Engine

**Alembic migration scripts do not run inside an asyncio event loop.** Your application can use async SQLAlchemy with the asyncpg driver, but the `alembic` command executes synchronously. If `env.py` reuses the app's async URL, the driver fails or behaves unpredictably.

The fix: give `env.py` its own sync engine. Swap `postgresql+asyncpg://` for `postgresql://` and install the psycopg2 driver.

```bash
pip install psycopg2-binary
```

Key part of `alembic/env.py` (after the config object is ready, before `engine_from_config`):

```python
from sqlalchemy import pool, engine_from_config
from alembic import context

from app.config import settings
from app.database import Base
from app.models import *  # noqa: F401,F403 - import all models

# Override sqlalchemy.url with sync URL for migrations
# Replace postgresql+asyncpg:// with postgresql:// for psycopg2
sync_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
config.set_main_option("sqlalchemy.url", sync_url)
```

Two details:

- Replacing the async URL with the sync one via `config.set_main_option()` overrides the ini setting, so `alembic.ini` never needs a second connection string
- The `from app.models import *` line is what registers every model into `Base.metadata` for autogenerate — drop it and you get symptom 3, "no changes in schema detected"

On dependencies: `psycopg2-binary` must be installed in whatever environment runs alembic. It is easy to miss in CI or a container that only runs migrations.

## Root Cause 2: A Broken down_revision Chain

Alembic maintains a one-way linked list through `revision` / `down_revision`. `upgrade head` walks that chain from the current version to the tail. **down_revision must reference a revision identifier that actually exists in the chain, character for character.** A "close enough" name from memory breaks the link.

A real repository's chain, three files under `alembic/versions/`:

```python
# 001_initial.py
revision = '001_initial'
down_revision = None

# 002_rename_model_config_to_llm_config.py
revision = '002_rename_model_config'
down_revision = '001_initial'

# 003_add_cascade_delete.py
revision = '003'
down_revision = '002_rename_model_config'
```

`Can't locate revision identified by 'xxx'` means some `down_revision` string does not resolve — a wrong migration filename, half-copied ID, anything.

The fix is always the same two commands:

```bash
# 1. See the real chain (left column = revision ID)
alembic history

# 2. See where the database currently sits
alembic current
```

Point the new migration's `down_revision` at the real chain tail from `alembic history`, then `alembic upgrade head`. Alembic resumes from the position recorded in the `alembic_version` table; already-applied migrations do not re-run.

Use `alembic history --verbose` once the chain grows — guessing the topology from filenames does not scale.

<InfoBox variant="warning" title="Watch out">

Two developers branch in parallel and both write a migration whose `down_revision` points at the same parent — `upgrade head` now reports multiple heads. Resolve it with `alembic merge`, which generates a merge migration. Our repository carries one such merge file, created to stitch two parallel branches. Multiple heads are not an anomaly; leaving them unmerged is.

</InfoBox>

## Root Cause 3: Model Edited, Migration Never Created

The most common misconception: **an ORM model is a code-level declaration and never modifies the database by itself.** Adding a field to a model class:

```python
class Agent(Base):
    __tablename__ = "agent_agents"
    # ...
    risk_threshold = Column(String, default="medium")  # new
```

This changes a Python object definition. The `agent_agents` table is untouched, and the first query referencing the column raises `column does not exist`. Locally it often "just works" because your dev environment built tables with `create_all()`, or a SQLite in-memory database is recreated each run — both paths bypass migrations and mask the problem. Another model-layer trap is the Pydantic v2 ORM mode change; see [Pydantic v2 ORM mode migration](/blog/pydantic-v2-orm-mode-migration).

After any ORM model change, three fixed steps:

```bash
# 1. Generate a migration (autogenerate diffs model vs. database)
alembic revision --autogenerate -m "add risk_threshold to agent_agents"

# 2. Review the generated file by hand (autogenerate misses server defaults and
#    constraint names; never upgrade blind)
#    alembic/versions/xxxx_add_risk_threshold_to_agent_agents.py

# 3. Apply it
alembic upgrade head
```

Step 2 is not optional. Autogenerate is a diff tool with blind spots; upgrading its output unchecked is a gamble.

Verify the migration landed:

```bash
psql -c "\d agent_agents"   # confirm the new column exists
alembic current             # confirm the version sits at the chain tail
```

## Triage: Three Questions

For any "changed the model, table didn't move" problem (also searched as "column does not exist" or "field missing in table"), three questions locate it in a minute:

1. **Does the migration command run at all?** No → pitfall 2, check the `down_revision` chain
2. **It runs, but the column is still missing?** → pitfall 3, confirm autogenerate produced a file, `upgrade head` ran, and `alembic current` sits at the tail
3. **Connection or driver errors from `alembic upgrade`?** → pitfall 1, the sync URL setup in `env.py`

One team rule on top: **model changes and their migration files ship in the same commit.** A model without its migration hands every collaborator the exact production error on pull.

## FAQ

### What are the basic alembic migration commands?

Generate a migration with `alembic revision --autogenerate -m "message"`, apply it with `alembic upgrade head`, roll back one step with `alembic downgrade -1`, and inspect the chain with `alembic history`. The standard workflow after any model change is exactly two steps: autogenerate, then upgrade head. Skip either one and the table stays unchanged.

### I created my tables with SQLAlchemy — why doesn't a model change take effect?

A SQLAlchemy model is a code-level declaration only; it never touches the database. Alembic migrations own schema changes. Even if you built tables with `create_all()` locally, the new column lives in in-memory metadata — production PostgreSQL raises `ProgrammingError: column does not exist` the first time a query touches it. Always generate a migration and run upgrade.

### Why does alembic upgrade fail with Can't locate revision?

Your `down_revision` references a revision identifier that does not exist in the chain — usually a short name typed from memory. Run `alembic history` to get the real IDs, point the new migration's `down_revision` at the actual chain tail, then run `alembic upgrade head`. revision and down_revision must match character for character; one wrong character breaks the whole chain.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
