---
title: 解决 Pydantic v2 ORM mode 报错 model_config 被覆盖
description: 迁移到 Pydantic v2 时，class Config 报错、model_config 字段冲突的完整解决方案。
date: 2026-03-15
tags: [Python, Pydantic, FastAPI, aigent, 迁移]
authors: [cclee]
schema: Article
---

## TL;DR

Pydantic v2 不再支持 `class Config`，需要用 `model_config = ConfigDict(from_attributes=True)`。如果你的模型有 `model_config` 字段，必须重命名避免与保留字冲突。


<!-- truncate -->
## 问题现象

### 报错 1：class Config 不生效

```python
from pydantic import BaseModel

class AgentResponse(BaseModel):
    id: str
    name: str

    class Config:
        orm_mode = True  # v1 写法
```

```bash
PydanticUserError: `orm_mode` is not a valid config option. Did you mean `from_attributes`?
```

### 报错 2：model_config 字段冲突

```python
class Agent(BaseModel):
    id: str
    model_config: dict  # 业务字段，存储 LLM 配置

    model_config = ConfigDict(from_attributes=True)
# TypeError: 'dict' object is not callable
```

模型中有个业务字段叫 `model_config`（存储 LLM 配置），与 Pydantic v2 保留字冲突。

## 根因

### 1. Pydantic v2 配置语法变化

Pydantic v2 使用 `model_config` 作为配置属性名，不再支持嵌套的 `class Config`：

| Pydantic v1 | Pydantic v2 |
|-------------|-------------|
| `class Config: orm_mode = True` | `model_config = ConfigDict(from_attributes=True)` |
| `class Config: schema_extra = {...}` | `model_config = ConfigDict(json_schema_extra={...})` |

### 2. model_config 是保留字

`model_config` 在 Pydantic v2 中是特殊属性，不能同时作为业务字段名使用。

## 解决方案

### 1. 更新 ORM mode 配置

```python
from pydantic import BaseModel, ConfigDict

class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # 新写法

    id: str
    name: str
```

### 2. 重命名冲突字段

将业务字段 `model_config` 改为 `llm_config`（或任意非保留名）：

```python
# models/agent.py
class Agent(BaseModel):
    __tablename__ = "agent_agents"

    id: str
    llm_config: dict  # 改名，避免冲突

# schemas/agent.py
class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    agent_id: str
    llm_config: LlmConfig  # 与模型保持一致
```

### 3. 数据库迁移（如需要）

如果数据库字段也要改：

```python
# alembic/versions/xxx_rename_model_config.py
def upgrade():
    op.alter_column('agent_agents', 'model_config', new_column_name='llm_config')

def downgrade():
    op.alter_column('agent_agents', 'llm_config', new_column_name='model_config')
```

## FAQ

### Q: Pydantic v2 的 orm_mode 改成什么了？

A: 改为 `from_attributes=True`，配置方式从 `class Config` 变成 `model_config = ConfigDict(...)`。

### Q: 为什么 model_config 字段报错？

A: `model_config` 是 Pydantic v2 的保留属性名，用于配置模型行为。如果业务代码中有同名字段，需要重命名。

### Q: ConfigDict 还有哪些常用选项？

A: `from_attributes` (ORM mode)、`json_schema_extra` (schema 扩展)、`str_strip_whitespace` (自动去空格)、`validate_assignment` (赋值时验证)。
