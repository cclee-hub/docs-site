---
title: "2 核 7G 服务器磁盘 93%、CPU 160%？三步排查 Docker 资源黑洞"
description: "低配服务器磁盘和 CPU 被占满的排查实战：Milvus 容器日志 13G 膨胀、Airflow 32 个 worker 空转、docker compose restart 不加载 .env 的完整诊断过程"
date: 2026-05-24
tags: [docker, devops, airflow, milvus, troubleshooting]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "如何限制 Docker 容器日志大小？"
    a: "在 docker-compose 中为服务添加 logging 配置：driver 设为 json-file，options 设置 max-size 和 max-file。建议 max-size: 100m，max-file: 3，防止日志无限膨胀。"
  - q: "docker compose .env 不生效怎么办？"
    a: "docker compose restart 只重启容器，不会重新加载 .env 文件。需要用 docker compose up -d 重建容器，环境变量才会更新。"
  - q: "Docker 磁盘满了怎么清理？"
    a: "先用 docker system df 查看占用分布，再用 docker system prune -a 清理未使用的镜像和缓存。更关键的是用 du -h /var/lib/docker/containers 检查是否有容器日志膨胀问题。"
  - q: "Airflow scheduler CPU 100% 怎么排查？"
    a: "用 docker top 查看容器内进程数，如果 LocalExecutor 启动了大量 worker（默认 32 个），在低核机器上会空转吃满 CPU。设置 AIRFLOW__CORE__PARALLELISM 匹配机器核数即可。"
---

在为客户维护一台 2 核 7G 的云服务器时，发现磁盘使用率 93%（仅剩 3G），Airflow scheduler 持续占用 160% CPU。以下是完整的诊断和修复过程。

<!-- truncate -->

## TL;DR

三个独立问题叠加导致服务器资源耗尽：
1. **Milvus 容器日志无大小限制**，单文件膨胀到 13G
2. **Airflow LocalExecutor 默认启动 32 个 worker**，在 2 核机器上空转
3. **`docker compose restart` 不重新加载 .env**，配置修改后需用 `up -d` 重建

## 场景一：磁盘 93%，只剩 3G 可用

### 问题现象

```bash
$ df -h /
/dev/vda3        40G   35G  3.0G  93% /
```

`docker system df` 显示可回收空间有 10G+，但 `docker system prune -a` 只清出 2.4G。

### 根因

逐层排查 `/var` 目录：

```bash
$ du -h /var/lib/docker --max-depth=2 | sort -rh | head -5
19G    /var/lib/docker
13G    /var/lib/docker/containers/ee487bb...
```

单个容器目录占了 13G。确认是日志文件：

```bash
$ ls -lh /var/lib/docker/containers/ee487bb*/ee487bb*-json.log
-rw-r----- 1 root root 13G May 24 22:43 ee487bb...-json.log
```

Milvus 向量数据库容器（`rag-service-milvus-1`）的 stdout/stderr 日志没有任何大小限制，持续写入直到占满磁盘。

### 解决方案

**第一步：截断日志文件**

```bash
truncate -s 0 /var/lib/docker/containers/ee487bb*/ee487bb*-json.log
```

**第二步：在 docker-compose.yml 中加日志轮转**

```yaml
services:
  milvus:
    # ... 其他配置
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
```

**第三步：重建容器使配置生效**

```bash
docker compose up -d milvus
```

> 如果你也遇到了 Docker 日志膨胀的问题，可以参考 [Docker Desktop WSL2 host 网络不通的解决方案](/blog/docker-desktop-wsl2-host-network-unreachable)。

效果：磁盘使用率从 **93% 降到 53%**，释放约 13G。

<InfoBox variant="warning" title="注意事项">

`truncate` 不需要停止容器，可以在线执行。但长期方案是为**所有** Docker 服务加上 `logging` 配置，不只是出问题的那个。Docker 默认不会轮转容器日志，这是很多人忽略的配置。

</InfoBox>

## 场景二：Airflow Scheduler 持续 160% CPU

### 问题现象

```bash
$ docker stats --no-stream
CONTAINER ID   NAME                          CPU %
9d4b3d60449e   deploy-airflow-scheduler-1    161.92%
```

Airflow scheduler 没有任何活跃的 DAG Run（0 条 running、0 条 queued），但 CPU 持续 160%+。

### 根因

从宿主机查看容器内进程：

```bash
$ docker top deploy-airflow-scheduler-1
CMD
airflow scheduler                    # 主进程 x1
airflow executor -- LocalExecutor    # 执行器 x1
airflow worker -- LocalExecutor      # Worker x32
airflow scheduler -- DagFileProcessorManager  # DAG 解析 x1
gunicorn: worker                     # 内置服务 x2
```

**总计 37 个进程**，其中 LocalExecutor Worker 占了 32 个。Airflow 的 `LocalExecutor` 默认 `parallelism=32`，即使没有任何任务在跑，这 32 个 worker 进程也在持续轮询。在 2 核机器上，光是进程调度开销就吃掉了 160% CPU。

### 解决方案

在 Airflow 的 `.env` 中设置：

```bash
AIRFLOW__CORE__PARALLELISM=2
```

值应与机器 CPU 核数一致。

## 场景三：docker compose restart 不加载 .env

### 问题现象

修改了 `.env` 文件中的 `AIRFLOW__SCHEDULER__SCHEDULER_HEARTBEAT_SEC`，执行：

```bash
docker compose restart airflow-scheduler
```

进入容器检查配置，发现值没有变化。

### 根因

`docker compose restart` 只是停止并启动现有容器，不会重新读取 `.env` 文件。环境变量在容器创建时注入，restart 不会触发重新创建。

验证方法：

```bash
# restart 后检查（值未更新）
$ docker exec airflow-scheduler airflow config get-value scheduler scheduler_heartbeat_sec
5

# up -d 重建后检查（值已更新）
$ docker exec airflow-scheduler airflow config get-value scheduler scheduler_heartbeat_sec
60
```

### 解决方案

修改 `.env` 后，用 `up -d` 替代 `restart`：

```bash
docker compose up -d airflow-scheduler
```

`up -d` 会检测配置变更并重建容器，新环境变量才会生效。

<InfoBox variant="warning" title="注意事项">

这一条不仅适用于 Airflow，任何通过 `.env` 或 `environment` 注入配置的 Docker Compose 服务都一样。记住这个规则：**`restart` = 重启，`up -d` = 重建**。如果你之前遇到过类似问题，可以参考 [Docker Volume 和 Bind Mount 的覆盖行为](/blog/docker-volume-override-bind-mount)。

</InfoBox>

## 排查命令速查

遇到低配服务器资源异常时，按这个顺序排查：

```bash
# 1. 资源总览
free -h && df -h && nproc
docker stats --no-stream

# 2. 磁盘大头定位
du -h /var --max-depth=2 | sort -rh | head -20

# 3. Docker 磁盘分布
docker system df

# 4. 容器日志检查（替换为你的容器 ID）
ls -lh /var/lib/docker/containers/*/*-json.log

# 5. 容器内进程数
docker top <container_name>

# 6. 环境变量是否生效
docker exec <container> env | grep <KEY>
```

## 常见问题

### 如何限制 Docker 容器日志大小？

在 `docker-compose.yml` 中为服务添加 `logging` 配置：

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "3"
```

这样每个容器最多保留 3 个日志文件，每个 100MB，总共不超过 300MB。修改后需要 `docker compose up -d` 重建容器才能生效。

### docker compose .env 不生效怎么办？

`docker compose restart` 只重启容器，不会重新加载 `.env` 文件。需要用 `docker compose up -d` 重建容器，环境变量才会更新。

### Docker 磁盘满了怎么清理？

先用 `docker system df` 查看占用分布，再用 `docker system prune -a` 清理未使用的镜像和缓存。更关键的是用 `du -h /var/lib/docker/containers` 检查是否有容器日志膨胀问题——这是很多人忽略的隐藏磁盘杀手。

### Airflow scheduler CPU 100% 怎么排查？

用 `docker top` 查看容器内进程数，如果 LocalExecutor 启动了大量 worker（默认 32 个），在低核机器上会空转吃满 CPU。设置 `AIRFLOW__CORE__PARALLELISM` 匹配机器核数即可，2 核机器设为 2。

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-3">正在维护 Docker 生产环境？</p>
  <a href="https://ai.ccleeai.com" className="button button--primary button--lg"
     target="_blank" rel="noopener noreferrer">了解 CCLHub AI 数据分析平台</a>
</div>
