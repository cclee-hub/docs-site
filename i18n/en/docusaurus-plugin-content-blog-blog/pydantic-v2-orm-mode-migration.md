---
title: Fix Pydantic v2 ORM Mode model_config Override Error
description: Complete solution for class Config deprecation and model_config field conflicts when migrating to Pydantic v2.
date: 2026-03-15
tags: [Python, Pydantic, FastAPI, aigent, Migration]
schema: Article
---

## TL;DR

Pydantic v2 no longer supports `class Config`. Use `model_config = ConfigDict(from_attributes=True)` instead. If your model has a field named `model_config`, you must rename it to avoid conflict with the reserved attribute.


<!-- truncate -->
## Problem Symptoms

### Error 1: class Config Not Working

```python
from pydantic import BaseModel

class AgentResponse(BaseModel):
    id: str
    name: str

    class Config:
        orm_mode = True  # v1 style
```

```bash
PydanticUserError: `orm_mode` is not a valid config option. Did you mean `from_attributes`?
```

### Error 2: model_config Field Conflict

```python
class Agent(BaseModel):
    id: str
    model_config: dict  # Business field storing LLM config

    model_config = ConfigDict(from_attributes=True)
# TypeError: 'dict' object is not callable
```

Your model has a business field called `model_config` (storing LLM configuration), which conflicts with Pydantic v2's reserved name.

## Root Cause

### 1. Pydantic v2 Configuration Syntax Change

Pydantic v2 uses `model_config` as the configuration attribute name, no longer supporting nested `class Config`:

| Pydantic v1 | Pydantic v2 |
|-------------|-------------|
| `class Config: orm_mode = True` | `model_config = ConfigDict(from_attributes=True)` |
| `class Config: schema_extra = {...}` | `model_config = ConfigDict(json_schema_extra={...})` |

### 2. model_config is a Reserved Name

`model_config` is a special attribute in Pydantic v2 and cannot be used as a business field name simultaneously.

## Solution

### 1. Update ORM Mode Configuration

```python
from pydantic import BaseModel, ConfigDict

class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # New syntax

    id: str
    name: str
```

### 2. Rename Conflicting Field

Rename the business field `model_config` to `llm_config` (or any non-reserved name):

```python
# models/agent.py
class Agent(BaseModel):
    __tablename__ = "agent_agents"

    id: str
    llm_config: dict  # Renamed to avoid conflict

# schemas/agent.py
class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    agent_id: str
    llm_config: LlmConfig  # Keep consistent with model
```

### 3. Database Migration (If Needed)

If the database column also needs renaming:

```python
# alembic/versions/xxx_rename_model_config.py
def upgrade():
    op.alter_column('agent_agents', 'model_config', new_column_name='llm_config')

def downgrade():
    op.alter_column('agent_agents', 'llm_config', new_column_name='model_config')
```

## FAQ

### Q: What did Pydantic v2 replace orm_mode with?

A: It's now `from_attributes=True`, and the configuration syntax changed from `class Config` to `model_config = ConfigDict(...)`.

### Q: Why is my model_config field causing errors?

A: `model_config` is a reserved attribute name in Pydantic v2 for configuring model behavior. If your business code has a field with the same name, you need to rename it.

### Q: What other common ConfigDict options exist?

A: `from_attributes` (ORM mode), `json_schema_extra` (schema extension), `str_strip_whitespace` (auto strip whitespace), `validate_assignment` (validate on assignment).
