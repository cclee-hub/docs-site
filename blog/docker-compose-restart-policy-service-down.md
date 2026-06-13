---
title: Docker Compose 服务重启后起不来？检查 restart 策略
description: "宿主重启或容器崩溃后服务不自动恢复、端口无监听，是因为 docker-compose.yml 没配 restart（默认 no）。生产服务应配 restart: always 或 unless-stopped。"
date: 2026-06-13
tags: [Docker, Docker Compose, devops, Bug修复]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "docker compose 的 restart 策略有哪些？"
    a: "四种：no（默认，不重启）、always（总是重启）、unless-stopped（除非手动停止）、on-failure[:N]（仅失败时重启，可限次数）。生产服务一般用 always。"
  - q: "如何让 docker 容器自动重启？"
    a: "docker-compose.yml 给服务加 restart: always（或 unless-stopped）；docker run 用 --restart always。容器崩溃或宿主重启后会自动拉起。"
  - q: "restart always 和 unless-stopped 有什么区别？"
    a: "always 即使手动 docker stop 后重启 Docker daemon 也会重新拉起；unless-stopped 尊重手动 stop，明确停止后不会在 daemon 重启时再拉起。"
---

> 在 RAG 知识库项目中排查依赖 Milvus 的服务启动失败，以下是完整排查过程。

## TL;DR

宿主机重启（或容器崩溃）后，一组服务没有自动恢复，应用端口无监听、`docker ps -a` 里容器全是 `Exited`。根因是 `docker-compose.yml` 没配 `restart` 策略（默认 `no`），容器挂了就永远躺着。解法：给所有生产服务加 `restart: always`，让基础设施在崩溃或重启后自愈。

{/* truncate */}

## 问题现象

整套 RAG 链路突然全挂：应用 3003 端口无监听，进程管理器里找不到该进程，前端浮窗、知识库检索、租户查询全部 404。

手动拉起应用复现：

```bash
$ uvicorn app.main:app
pymilvus.exceptions.MilvusException:
Fail connecting to server on localhost:19530, server unavailable
Application startup failed. Exiting.
```

应用启动时连依赖的向量库（19530），连不上就直接退出。回头看容器状态：

```bash
$ docker ps -a
CONTAINER ID   IMAGE                    STATUS
abc...         milvusdb/milvus:v2.4.11  Exited (255) 4 days ago
def...         minio/minio:...          Exited (255) 4 days ago
ghi...         quay.io/coreos/etcd:v3.5 Exited (255) 4 days ago
```

三个依赖容器 **4 天前**就 Exited 了，从未重启。应用每次启动都连不上、退出，进程管理器反复重启失败后干脆把它从列表里移除——于是表现为「进程神秘消失」。

## 根因

`docker-compose.yml` 里三个服务**都没配 `restart`**：

```yaml
# 出问题的写法：缺少 restart，默认是 no
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    # ❌ 没有 restart
  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    # ❌ 没有 restart
  milvus:
    image: milvusdb/milvus:v2.4.11
    # ❌ 没有 restart
```

Docker 的默认重启策略是 `no`——容器一旦退出（崩溃、OOM、宿主重启），就**永远不会被自动拉起**。这条默认值对开发够用，但对生产是定时炸弹：

- 宿主机重启 → 所有无 `restart` 策略的容器都停在 Exited
- 单个容器崩溃（如 OOM、依赖瞬时不可用）→ 不会自愈，连带拖垮所有依赖它的上游服务
- 依赖链级联：etcd/minio 挂了 → milvus 起不来 → 应用连不上 → 应用退出 → 进程管理器放弃

故障之所以隐蔽，是因为它**只在「重启 / 崩溃」事件后才暴露**，平时构建、部署一切正常。

## 解决方案

给所有生产服务加 `restart: always`：

```yaml
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    restart: always          # ✅ 崩溃或宿主重启后自愈
  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    restart: always          # ✅
  milvus:
    image: milvusdb/milvus:v2.4.11
    restart: always          # ✅
    depends_on:
      - etcd
      - minio
```

应用重启后，依赖容器随宿主启动自动恢复：

```bash
$ docker compose up -d        # 应用 restart 策略后，宿主重启会自动拉起
$ curl localhost:9091/healthz # 健康检查 200，依赖就绪
$ pm2 start ecosystem.config.js --only rag-service  # 应用拉起，链路恢复
```

四种 restart 策略对比：

| 策略 | 何时重启 | 适用场景 |
|------|---------|---------|
| `no`（默认） | 永不 | 临时容器、一次性任务 |
| `always` | 总是（含手动 stop 后 daemon 重启） | 生产基础设施、数据库 |
| `unless-stopped` | 除非你手动 stop | 多数生产服务（推荐） |
| `on-failure[:N]` | 仅非零退出码，可限次数 | 会正常退出的批处理 |

如果你也在低配服务器上排查 Docker 服务异常，先看容器状态和磁盘/CPU 占用，[Docker 资源黑洞的三步排查](/blog/docker-low-server-troubleshoot)记录了另一类资源耗尽导致服务假死的案例。

<InfoBox variant="warning" title="注意事项">

- `restart: always` 对 **正常退出（exit code 0）的容器也会重启**。如果你的服务是「跑完即退」的批处理，用 `on-failure` 或 `unless-stopped`，否则会陷入重启死循环。
- `depends_on` **不等服务「就绪」，只等「启动」**。Milvus 启动慢，应用可能在它就绪前就连接——需要应用侧加重试，或用 healthcheck + `depends_on.condition: service_healthy`。
- 验证策略是否生效：`docker inspect <container> | grep RestartPolicy`，`Name` 应为 `always`/`unless-stopped` 而非 `no`。

</InfoBox>

## 常见问题

### docker compose 的 restart 策略有哪些？

四种：`no`（默认，不重启）、`always`（总是重启）、`unless-stopped`（除非手动停止）、`on-failure[:N]`（仅失败时重启，可限次数）。生产服务一般用 `always` 或 `unless-stopped`。

### 如何让 docker 容器自动重启？

`docker-compose.yml` 给服务加 `restart: always`（或 `unless-stopped`）；`docker run` 用 `--restart always`。容器崩溃或宿主重启后会自动拉起。

### restart always 和 unless-stopped 有什么区别？

`always` 即使你手动 `docker stop` 后重启 Docker daemon 也会重新拉起该容器；`unless-stopped` 尊重手动 stop，明确停止后不会在 daemon 重启时再被拉起。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
