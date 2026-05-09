---
title: 数据库认证失败？WSL 下 Docker 静默占用了你的端口
description: WSL2 中 Docker Desktop 静默占用 5432 端口导致 SSH 隧道连错 PostgreSQL 实例，改用 5433 端口 + .env.local 解决。
date: 2026-05-09
tags: [WSL, Docker, PostgreSQL]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WSL2 里 SSH 隧道连 PostgreSQL 报 password authentication failed 怎么排查？"
    a: "先检查 5432 端口是否被 Docker 占用，再换用其他本地端口建隧道。"
  - q: "Docker Desktop 会在 WSL2 中自动占用 5432 端口吗？"
    a: "会。容器映射 5432 后 Docker 在 WSL2 网络层监听该端口，SSH 隧道会静默连接到容器实例。"
  - q: "怎么让开发环境用不同端口连 PostgreSQL？"
    a: "创建 .env.local 配置 DATABASE_URL 指向新端口，代码中优先加载 .env.local。"
---

## TL;DR

WSL2 环境下 Docker Desktop 静默占用 5432 端口。SSH 隧道 `localhost:5432` 实际连接的是 Docker 容器内的 PostgreSQL，而非远程服务器。密码认证失败的报错具有误导性——密码没错，连的实例错了。解决方案：隧道改用本地 5433 端口，配合 `.env.local` 隔离开发配置。

---

## 问题现象

通过 SSH 隧道连接远程 PostgreSQL 时报错：

```
PostgresError: password authentication failed for user "postgres"
  severity: 'FATAL'
  code: '28P01'
  file: 'auth.c'
  line: '329'
  routine: 'auth_failed'
```

隧道命令看起来正常建立：

```bash
ssh -L 5432:localhost:5432 -L 3003:localhost:3003 user@server -N &
```

隧道没有报错，但连接后始终提示密码错误。确认密码完全正确，远程服务器上直接登录没有问题。

---

## 根因

WSL2 网络架构中，Docker Desktop 会在 WSL2 内部创建虚拟网络接口。当 Docker 容器映射了 `5432:5432` 时，Docker 在 WSL2 网络层监听 5432 端口。

SSH 隧道 `-L 5432:localhost:5432` 的含义是：将本地 5432 端口转发到远程服务器的 5432。但本地 5432 已被 Docker 占用，隧道的绑定静默失败——连接直接被 Docker 拦截。

结果：`localhost:5432` 实际连接到 Docker 容器内的 PostgreSQL。该实例有不同的用户密码配置，因此报 `password authentication failed`。

**这个错误的迷惑性**：报错信息是"密码错误"，不是"端口被占用"或"隧道失败"。开发者会反复确认密码，而真正的问题是连错了机器。

---

## 解决方案

### Step 1：确认端口冲突

```bash
# WSL2 内检查
ss -tlnp | grep 5432
```

WSL 内可能查不到（Docker 端口从 Windows 侧映射），去 Windows PowerShell 交叉验证：

```powershell
netstat -ano | findstr :5432
```

看到 `docker-proxy` 进程占用 5432，冲突确认。

### Step 2：改用其他本地端口建隧道

```bash
# Before: 本地 5432（与 Docker 冲突）
ssh -L 5432:localhost:5432 user@server -N &

# After: 本地 5433（无冲突）
ssh -L 5433:localhost:5432 user@server -N &
```

`-L` 格式是 `本地端口:远程主机:远程端口`。只改本地端口，远程不受影响。

### Step 3：创建 .env.local 隔离开发配置

```bash
# server/.env.local（加入 .gitignore）
DATABASE_URL=postgresql://postgres:your_password@localhost:5433/your_db
```

### Step 4：dotenv 优先加载 .env.local

```typescript
// Before:
import 'dotenv/config';

// After:
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

if (existsSync(resolve(__dirname, '../.env.local'))) {
  dotenv.config({ path: resolve(__dirname, '../.env.local') });
} else {
  dotenv.config();
}
```

开发环境用 `.env.local`（5433），生产继续用 `.env`（5432），互不干扰。

---

## 注意事项

<InfoBox variant="warning" title="报错信息可能误导你">
  `password authentication failed` 不一定代表密码错误。连到错误的实例（如 Docker 内的 PostgreSQL），该实例没有对应账户，同样报这个错。密码确认无误但仍失败时，优先排查连接目标。
</InfoBox>

<InfoBox variant="warning" title="不要改应用代码中的默认端口">
  在隧道层面换本地端口，配合 `.env.local` 管理配置。不要把代码里的默认端口改成 5433——那会影响生产和容器内连接。环境差异通过环境变量解决。
</InfoBox>

<InfoBox variant="warning" title="WSL 端口排查要查 Windows 侧">
  Docker Desktop 在 WSL2 模式下的容器端口映射直接出现在 Windows 网络层，WSL 内 `ss`、`lsof` 查不到 PID。遇到莫名端口占用，去 Windows 侧 `netstat -ano` 定位。
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
