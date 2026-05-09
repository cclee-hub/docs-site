---
title: 容器端口在 WSL2 里访问不到？Docker Desktop 的 network_mode:host 陷阱
description: Docker Desktop WSL2 环境下 network_mode:host 容器端口无法从宿主机访问，根因是 host 模式共享的是工具 VM 网络，不是 WSL2 网络。解法是用 bridge 模式 + external network + 端口映射。
date: 2026-05-09
tags: [Docker, WSL2, Docker Compose]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Docker Desktop WSL2 下 network_mode:host 容器端口为什么 curl 不通？"
    a: "Docker Desktop 的 host 模式共享的是内部工具 VM 的网络命名空间，不是 WSL2 宿主机。容器内监听端口，WSL2 的 ss 看不到，curl 自然不通。"
  - q: "docker-compose override 怎么移除 base 里的 network_mode:host？"
    a: "用 network_mode: !reset 语法（Compose v2.24+）。注意 !reset 必须写在每个服务定义里，写在 YAML anchor 内不生效。"
---

在为客户搭建 AI 数据分析平台（Airflow + PostgreSQL）的本地开发环境时遇到此问题，记录根因与解法。

## TL;DR

Docker Desktop for Windows (WSL2 backend) 下，`network_mode: host` 的容器端口无法从 WSL2 宿主机访问。容器内 `ss` 显示端口在监听，但宿主机 `curl localhost:PORT` connection refused。原因是 host 模式共享的是 Docker 内部工具 VM 的网络，不是 WSL2 的网络。解法：override 文件中用 `network_mode: !reset` 移除 host 模式，改用 bridge + external network + 端口映射。

## 问题现象

项目使用 `docker-compose.yml` 部署 Airflow，base 配置：

```yaml
x-airflow-common:
  &airflow-common
  image: airflow-ai-dag:latest
  network_mode: host  # 服务器上正常，WSL2 上出问题
  volumes:
    - ..:/opt/airflow/project

services:
  airflow-webserver:
    <<: *airflow-common
    command: webserver
    environment:
      - AIRFLOW__WEBSERVER__WEB_SERVER_PORT=8082
```

容器启动正常，日志确认端口监听：

```
[INFO] Listening at: http://0.0.0.0:8082
```

但宿主机完全不可达：

```bash
$ ss -tlnp | grep 8082
# 空，无监听

$ curl localhost:8082/health
curl: (7) Failed to connect to localhost port 8082
```

而同一环境下，pgAdmin 容器用 `-p 8080:80` 端口映射，`localhost:8080` 正常访问。

## 根因

**Docker Desktop for Windows 的网络架构与 Linux 原生 Docker 不同：**

```
Windows 浏览器
    ↕
WSL2 宿主机（你操作的终端）
    ↕ Docker Desktop 管道
Docker Desktop 工具 VM  ← network_mode: host 的 "host" 是这里
    ↕
容器
```

Linux 服务器上 `network_mode: host` 直接共享宿主机网络，容器端口 = 宿主机端口。但在 Docker Desktop WSL2 环境下：

- **host 模式的 "host"** = Docker Desktop 工具 VM，不是 WSL2
- 容器内 `/proc/net/tcp` 有端口监听记录
- WSL2 宿主机的 `/proc/net/tcp` 没有对应记录
- `-p` 端口映射的容器不受影响（Docker Desktop 会自动转发）

**验证方法：** 对比容器内外网络命名空间：

```bash
# 容器内：8082 (hex 1F92) 在监听
$ docker exec webserver grep '1F92' /proc/net/tcp
4: 00000000:1F92 00000000:0000 0A ...

# WSL2 宿主机：8082 不存在
$ grep '1F92' /proc/net/tcp
# 无输出
```

## 解决方案

### 步骤 1：创建 docker-compose.override.yml

用 `!reset` 移除 base 的 `network_mode: host`（需要 Compose v2.24+）：

```yaml
# docker-compose.override.yml
services:
  airflow-webserver:
    network_mode: !reset        # 移除 base 的 host 模式
    networks:
      - app_network             # 加入外部网络
    ports:
      - "8082:8082"             # 端口映射
    environment:
      - DB_HOST=postgres-db     # 用容器名连接数据库

  airflow-scheduler:
    network_mode: !reset
    networks:
      - app_network
    environment:
      - DB_HOST=postgres-db

networks:
  app_network:
    external: true              # 引用已存在的外部网络
```

### 步骤 2：确保数据库容器在同一网络

```bash
# 查看数据库容器所在网络
$ docker inspect postgres-db --format '{{json .NetworkSettings.Networks}}'
# {"app_network": {...}}

# 确认外部网络存在（不存在则创建）
$ docker network create app_network   # 或已存在则跳过
```

### 步骤 3：重启生效

```bash
$ docker compose down
$ docker compose up -d
```

验证：

```bash
$ ss -tlnp | grep 8082
LISTEN 0 4096 *:8082 *:*

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:8082/health
200
```

### 关键点：`!reset` 必须放在服务定义里

以下写法**不生效**：

```yaml
# ❌ 错误：放在 anchor 内
x-airflow-local:
  &airflow-local
  network_mode: !reset    # 不生效！
  networks:
    - app_network

services:
  airflow-webserver:
    <<: *airflow-local    # merge 时 base 的 network_mode:host 仍在
```

正确写法：

```yaml
# ✅ 正确：每个服务单独写
services:
  airflow-webserver:
    network_mode: !reset  # 必须在这里
    networks:
      - app_network
```

<InfoBox variant="warning" title="注意事项">

- `network_mode: !reset` 需要 Docker Compose v2.24+，用 `docker compose version` 确认
- `!reset` 只能移除标量字段（如 `network_mode`），列表和字典字段不支持
- 如果 base 使用了 YAML anchor（`<<: *anchor`），`!reset` 必须写在服务定义层，不能写在另一个 anchor 里
- 改为 bridge 模式后，容器间不能用 `localhost` 互相访问，必须用容器名或加入同一 Docker network
- `network_mode` 和 `networks` 互斥，同时存在会报 `mutually exclusive` 错误

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
