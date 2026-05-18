---
title: "WSL2 + Docker 两个网络坑：端口被静默占用 & host 模式 localhost 不通"
description: "Docker Desktop 在 WSL2 中静默占用端口导致连错数据库，host 网络模式下 localhost 连不上容器——两个常见坑的诊断与解决方案"
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
  - q: "WSL2 里 curl localhost 连不上 Docker 容器，但 docker ps 显示运行正常？"
    a: "Docker Desktop 的 host 模式共享的是 Hyper-V 工具 VM 的网络栈，不是 WSL2 的。改用 bridge 网络加端口映射（-p）解决。"
---

## TL;DR

WSL2 + Docker Desktop 有两个常见的网络坑：

1. **端口被静默占用**：Docker 容器映射 5432 后，SSH 隧道 `localhost:5432` 连到的是容器内的 PostgreSQL 而非远程服务器——密码没错，连的实例错了
2. **host 模式 localhost 不通**：`network_mode: host` 共享的是 Docker 工具 VM 网络，不是 WSL2 网络——`curl localhost:8080` 失败


<!-- truncate -->
---

## 场景一：Docker 静默占用端口，SSH 隧道连错数据库

### 问题现象

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

### 根因

WSL2 网络架构中，Docker Desktop 会在 WSL2 内部创建虚拟网络接口。当 Docker 容器映射了 `5432:5432` 时，Docker 在 WSL2 网络层监听 5432 端口。

SSH 隧道 `-L 5432:localhost:5432` 的含义是：将本地 5432 端口转发到远程服务器的 5432。但本地 5432 已被 Docker 占用，隧道的绑定静默失败——连接直接被 Docker 拦截。

结果：`localhost:5432` 实际连接到 Docker 容器内的 PostgreSQL。该实例有不同的用户密码配置，因此报 `password authentication failed`。

**这个错误的迷惑性**：报错信息是"密码错误"，不是"端口被占用"或"隧道失败"。开发者会反复确认密码，而真正的问题是连错了机器。

### 解决方案

**Step 1：确认端口冲突**

```bash
# WSL2 内检查
ss -tlnp | grep 5432
```

WSL 内可能查不到（Docker 端口从 Windows 侧映射），去 Windows PowerShell 交叉验证：

```powershell
netstat -ano | findstr :5432
```

看到 `docker-proxy` 进程占用 5432，冲突确认。

**Step 2：改用其他本地端口建隧道**

```bash
# Before: 本地 5432（与 Docker 冲突）
ssh -L 5432:localhost:5432 user@server -N &

# After: 本地 5433（无冲突）
ssh -L 5433:localhost:5432 user@server -N &
```

`-L` 格式是 `本地端口:远程主机:远程端口`。只改本地端口，远程不受影响。

**Step 3：创建 .env.local 隔离开发配置**

```bash
# server/.env.local（加入 .gitignore）
DATABASE_URL=postgresql://postgres:your_password@localhost:5433/your_db
```

**Step 4：dotenv 优先加载 .env.local**

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

## 场景二：Docker host 网络模式，WSL2 里 localhost 不通容器

### 问题现象

在 WSL2 中使用 `network_mode: host` 启动容器：

```yaml
services:
  airflow-webserver:
    network_mode: host
    environment:
      - AIRFLOW__WEBSERVER__WEB_SERVER_PORT=8080
```

```bash
# 容器正常运行
$ docker ps
STATUS          PORTS
Up 5 minutes    # 无端口映射（host 模式不需要）

# 但从 WSL2 终端连不上
$ curl localhost:8080
curl: (7) Failed to connect to localhost port 8080: Connection refused

# 容器内部是正常的
$ docker exec airflow-webserver curl localhost:8080
# 返回 200 OK
```

### 根因

Docker Desktop for Windows 的网络架构：

```
┌─────────────────────────────────────────────┐
│  Windows Host                               │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │  WSL2 VM     │  │  Docker Desktop VM  │  │
│  │  (你的终端)   │  │  (工具 VM)          │  │
│  │  localhost ──✗──│  host 网络 ──── 容器  │  │
│  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

`network_mode: host` 让容器共享 Docker Desktop **工具 VM** 的网络栈。但 WSL2 是一个**独立的 VM**，它的 `localhost` 和 Docker Desktop VM 的 `localhost` 是两个不同的网络命名空间。

Linux 原生 Docker 中 host 模式直接共享宿主机网络，所以 `localhost` 通。Docker Desktop for Windows 多了一层 VM，网络不通了。

### 解决方案

用 `docker-compose.override.yml` 切换到 bridge 网络：

```yaml
# docker-compose.override.yml
services:
  airflow-webserver:
    # 重置 host 模式（必须写在每个服务定义里，不能放 YAML anchor）
    network_mode: !reset null
    networks:
      - containers_default
    ports:
      - "8082:8082"  # 避免与本地 pgAdmin 的 8080 冲突
    environment:
      - AIRFLOW__WEBSERVER__WEB_SERVER_PORT=8082

  airflow-scheduler:
    network_mode: !reset null
    networks:
      - containers_default

networks:
  containers_default:
    external: true  # 复用本地已有的 Docker 网络
```

验证：

```bash
docker compose down && docker compose up -d
curl localhost:8082  # 返回 200 OK
```

---

## 注意事项

<InfoBox variant="warning" title="报错信息可能误导你">
  `password authentication failed` 不一定代表密码错误。连到错误的实例（如 Docker 内的 PostgreSQL），该实例没有对应账户，同样报这个错。密码确认无误但仍失败时，优先排查连接目标。如果数据写入后全是零值，可能是 [Drizzle sql 模板参数化问题](/blog/2026/05/18/drizzle-raw-sql-expression-as-parameter)而非连接问题。
</InfoBox>

<InfoBox variant="warning" title="不要改应用代码中的默认端口">
  在隧道层面换本地端口，配合 `.env.local` 管理配置。不要把代码里的默认端口改成 5433——那会影响生产和容器内连接。环境差异通过环境变量解决。
</InfoBox>

<InfoBox variant="warning" title="WSL 端口排查要查 Windows 侧">
  Docker Desktop 在 WSL2 模式下的容器端口映射直接出现在 Windows 网络层，WSL 内 `ss`、`lsof` 查不到 PID。遇到莫名端口占用，去 Windows 侧 `netstat -ano` 定位。
</InfoBox>

<InfoBox variant="warning" title="docker-compose !reset 不能放在 YAML anchor 里">
  `!reset` 必须写在每个服务定义里，放在 `&common` anchor 内不生效。生产环境（Linux 服务器）继续用 `host` 模式没问题，只有 Docker Desktop + WSL2 环境需要 override。
</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
