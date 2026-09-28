---
title: "SQLAlchemy 模型加了字段，线上报列不存在？Alembic 迁移三个坑"
description: "SQLAlchemy 模型加了字段线上报 column does not exist？三个根因：Alembic 误用 async 引擎、down_revision 引用断链、改模型不建迁移。附 env.py 配置与排查顺序。"
date: 2026-09-28
tags: [Alembic, SQLAlchemy, FastAPI, PostgreSQL, ai-agent]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "alembic 迁移数据库的命令是什么？"
    a: "生成迁移用 alembic revision --autogenerate -m \"描述\"，应用到数据库用 alembic upgrade head，回滚一步用 alembic downgrade -1，查看版本链用 alembic history。改完 ORM 模型的标准动作就是 autogenerate 生成、upgrade head 应用这两步，缺一步表结构都不会变。"
  - q: "SQLAlchemy 创建数据库和表后，改模型为什么不生效？"
    a: "SQLAlchemy 模型只是代码层的声明，不会自动修改数据库，建表改表由 Alembic 迁移承担。即使本地用 create_all() 建过表，新字段也只存在于内存元数据里，生产 PostgreSQL 在第一次用到该字段时就报 ProgrammingError: column does not exist。模型变更必须同步生成迁移文件并执行 upgrade。"
  - q: "alembic upgrade 报 Can't locate revision 怎么办？"
    a: "这是 down_revision 引用了链上不存在的 revision 标识，常见于手写迁移时凭记忆填短名。先跑 alembic history 拿到真实 ID，把新迁移的 down_revision 改成链尾的真实值，再 alembic upgrade head。revision 与 down_revision 必须逐字符一致，差一个字符整条链就断。"
---

在 FastAPI + 异步 SQLAlchemy 项目里给 ORM 模型加了字段，本地跑通，部署上线后接口一调用就报 `sqlalchemy.exc.ProgrammingError: column "xxx" does not exist`——模型明明改了，表却没变。

> 在为客户构建 AI Agent SaaS 平台时遇到此问题，记录根因与解法。

## TL;DR

模型改了表没变（或迁移命令根本跑不起来），通常是三个坑之一：

1. **async 项目里 Alembic 还在用 async 引擎**——Alembic 不在事件循环里运行，`env.py` 必须切到 sync URL（`postgresql+asyncpg://` 换成 `postgresql://`，驱动用 psycopg2）
2. **down_revision 引用了链上不存在的 revision ID**——`alembic upgrade` 直接报 `Can't locate revision`
3. **只改了 ORM 模型，没生成迁移**——代码层看着对，表结构纹丝不动，线上第一次用到新字段就炸

三个坑依次对应「迁移跑不了」「链断了」「没生成迁移」，排查顺序也按这个来。

## 问题现象

三种表现，对应三个不同的坑：

**表现一：模型加字段后线上报错**

```
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedColumn) column "risk_threshold" does not exist
```

本地开发环境正常，生产环境第一次查询就挂。

**表现二：执行迁移命令直接失败**

```
Can't locate revision identified by '001_initial'
```

`alembic upgrade head` 根本走不到你的新迁移。

**表现三：autogenerate 说「没有变化」**

```
Generating migration ...  (no changes in schema detected)
```

你确定改了模型，它却说 schema 没变——多半是 `env.py` 没把模型 import 进来，或者连的不是目标库。

## 根因一：Alembic 用了 async engine

**Alembic 的迁移脚本不运行在 asyncio 事件循环里。** 应用层用 async SQLAlchemy（asyncpg 驱动）没问题，但 `alembic` 命令是同步执行的，`env.py` 里如果沿用应用的 async URL，要么直接报驱动错误，要么行为不可预期。

解法是让 `env.py` 单独用 sync 引擎：URL 从 `postgresql+asyncpg://` 替换成 `postgresql://`，并安装 psycopg2 驱动。

```bash
pip install psycopg2-binary
```

`alembic/env.py` 关键配置（在 `config` 对象就绪后、`engine_from_config` 之前）：

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

两个细节：

- `settings.database_url` 里的 async URL 替换成 sync URL 后，用 `config.set_main_option()` 覆盖 ini 里的配置，`alembic.ini` 里就不用维护第二份连接串
- `from app.models import *` 这行不能省——autogenerate 靠它把所有模型注册进 `Base.metadata`，漏了就是上面「no changes in schema detected」的表现三

依赖上，`psycopg2-binary` 装在运行 alembic 的那个环境里。CI 或容器里单独跑迁移时，这个依赖容易被漏掉。

## 根因二：down_revision 引用断链

Alembic 用 `revision` / `down_revision` 维护一条单向链，`upgrade head` 就是沿着这条链从当前版本走到链尾。**`down_revision` 必须逐字符引用链上真实存在的 revision 标识**，凭记忆填一个「差不多」的名字，链就断了。

一个真实仓库的版本链，`alembic/versions/` 下三个文件：

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

`alembic upgrade` 报 `Can't locate revision identified by 'xxx'`，就是某个 `down_revision` 指向的字符串在链上找不到——可能是手滑写了别的迁移的文件名，可能是抄了半截 ID。

排查动作固定两步：

```bash
# 1. 看真实链条（左列是 revision ID）
alembic history

# 2. 看数据库当前停在哪个版本
alembic current
```

把新迁移的 `down_revision` 改成 `alembic history` 输出里链尾的真实值，再 `alembic upgrade head`。Alembic 会从 `alembic_version` 表记录的位置续传，已执行过的迁移不会重跑。

`alembic history` 也建议用 `--verbose` 看：迁移一多，光靠文件名猜链路不可靠。

<InfoBox variant="warning" title="注意事项">

多个开发者并行建分支各写迁移，两条分支的 `down_revision` 指向同一个父节点时，`upgrade head` 会报 multiple heads。用 `alembic merge` 生成合并迁移解决——我们的仓库里就留着一个 merge 迁移文件，专门缝合两条并行分支。出现 multiple heads 不是异常，拖着不 merge 才是。

</InfoBox>

## 根因三：改了模型，没建迁移

最常见的误区：**ORM 模型是代码层的声明，它不会自己改数据库**。在模型类里加一个字段：

```python
class Agent(Base):
    __tablename__ = "agent_agents"
    # ...
    risk_threshold = Column(String, default="medium")  # 新加的
```

这只是改了 Python 对象的定义。数据库里的 `agent_agents` 表纹丝不动，第一次查询到这个字段就是 `column does not exist`。之所以本地常常「看着正常」，是因为开发环境可能用 `create_all()` 建过表、或者 SQLite 内存库每次重建——这些路径都绕过了迁移，掩盖了问题。模型层另一个容易踩的坑是 Pydantic v2 的 ORM 模式变更，迁移要点见 [Pydantic v2 ORM mode 迁移](/blog/pydantic-v2-orm-mode-migration)。

ORM 模型新增字段后的固定三步：

```bash
# 1. 生成迁移（autogenerate 对比模型与数据库的差异）
alembic revision --autogenerate -m "add risk_threshold to agent_agents"

# 2. 人工检查生成的迁移文件（autogenerate 会漏改列、误删表，必须过目）
#    alembic/versions/xxxx_add_risk_threshold_to_agent_agents.py

# 3. 应用到数据库
alembic upgrade head
```

第 2 步不能省。autogenerate 只做差异对比，服务器默认值、约束名这类信息它推断不全，直接 upgrade 有风险。

验证迁移生效，直接看表结构：

```bash
psql -c "\d agent_agents"   # 确认新字段存在
alembic current             # 确认版本停在链尾
```

## 排查顺序：三问快筛

「模型改了表没变」类问题（也叫字段不存在、列不存在），按这三个问题筛，一两分钟定位：

1. **迁移命令本身能跑吗？** 不能 → 坑二，查 `down_revision` 链
2. **能跑，但数据库里没这个字段？** → 坑三，确认 autogenerate 生成过、`upgrade head` 执行过、`alembic current` 停在链尾
3. **`alembic upgrade` 连接都连不上或驱动报错？** → 坑一，`env.py` 的 sync URL 配置

团队协作场景再多加一条纪律：**模型变更和迁移文件放在同一个 commit 里**。只提模型不提迁移，协作者拉下代码就是线上同款报错。

## 常见问题

### alembic 迁移数据库的命令是什么？

生成迁移用 `alembic revision --autogenerate -m "描述"`，应用到数据库用 `alembic upgrade head`，回滚一步用 `alembic downgrade -1`，查看版本链用 `alembic history`。改完 ORM 模型的标准动作就是 autogenerate 生成、upgrade head 应用这两步，缺一步表结构都不会变。

### SQLAlchemy 创建数据库和表后，改模型为什么不生效？

SQLAlchemy 模型只是代码层的声明，不会自动修改数据库，建表改表由 Alembic 迁移承担。即使本地用 `create_all()` 建过表，新字段也只存在于内存元数据里，生产 PostgreSQL 在第一次用到该字段时就报 `ProgrammingError: column does not exist`。模型变更必须同步生成迁移文件并执行 upgrade。

### alembic upgrade 报 Can't locate revision 怎么办？

这是 `down_revision` 引用了链上不存在的 revision 标识，常见于手写迁移时凭记忆填短名。先跑 `alembic history` 拿到真实 ID，把新迁移的 `down_revision` 改成链尾的真实值，再 `alembic upgrade head`。revision 与 down_revision 必须逐字符一致，差一个字符整条链就断。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
