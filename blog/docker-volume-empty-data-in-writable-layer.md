---
title: "Docker 卷挂载后是空的？etcd 数据全在可写层，容器重建即丢"
description: "docker ps -as 看容器可写层 385M，挂载的数据卷却只有 8K——volumes 写了 ≠ 应用在用。etcd 未设 data-dir 时数据写进容器层，recreate 即丢；在线快照迁移可零丢失修复。"
date: 2026-08-28
tags: [Docker, etcd, Milvus, 运维]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Docker 挂载卷后目录是空的怎么回事？"
    a: "两种常见原因：空卷挂载会遮盖镜像内原有目录；或应用自身的数据目录参数没指向挂载点，数据实际写进了容器可写层。用 du 对比卷目录与可写层大小即可分辨。"
  - q: "etcd 数据怎么安全迁移到新的 data-dir？"
    a: "用 etcdctl snapshot save 做在线一致快照，etcdctl snapshot restore --data-dir 生成目标目录，停容器后把数据放进新位置，再以新 data-dir 启动，最后 endpoint health 验证。"
  - q: "compose 里挂了卷为什么没生效？"
    a: "volumes 行只负责把卷挂到容器的某个路径；应用往哪写由它自己的配置决定（如 etcd 的 data-dir、postgres 的 PGDATA）。两者对不上，卷就是摆设。"
---

磁盘清理时用 `docker ps -as` 巡检各容器可写层，etcd 容器赫然 385M——而它挂载的数据卷 `etcd_data` 里只有 8K。当时磁盘清理没敢动它：一旦 recreate，Milvus 的全部元数据就随可写层一起蒸发。

在开发 [AI客服](/docs/customer-service) 时遇到此问题——7×24小时AI客服，快速解答产品使用问题；它的知识库检索跑在 Milvus 上，而 Milvus 的元数据全靠这个 etcd。

## TL;DR

compose 的 `volumes:` 只负责「把卷挂到容器某个路径」，**应用往哪写由它自己的参数决定**。etcd 没设 `data-dir` 时默认写到工作目录下的 `default.etcd`——挂载点 `/etcd` 它根本没用，385M 数据全在可写层，`docker compose up -d` 的任何一次重建都会把它带走。修复用 etcd 原生迁移路径：**在线快照 → restore → 停机换数据 → 补 `ETCD_DATA_DIR` → 带卷重建**，零丢失，全程停机不到两分钟。

## 问题现象

compose 里的 etcd 服务看起来是「正确」的——卷挂了：

```yaml
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_LISTEN_CLIENT_URLS=http://0.0.0.0:2379
      # ... 没有任何 data-dir 相关配置
    volumes:
      - etcd_data:/etcd
```

但两个数字对不上：

```text
$ docker ps -as --format "{{.Names}}\t{{.Size}}" | grep etcd
rag-service-etcd-1   385MB (virtual 199MB)     ← 可写层 385M

$ docker exec rag-service-etcd-1 du -sh /etcd
8K    /etcd                                     ← 挂载的卷是空的

$ docker exec rag-service-etcd-1 ls -la / | grep etcd
drwx------  3 root root 4096 default.etcd         ← 数据在这：容器根目录
```

## 根因

**挂载 ≠ 使用。** `volumes: etcd_data:/etcd` 只保证「卷被挂到 `/etcd` 这个路径」，至于 etcd 往哪写，由它自己的 `--data-dir` 参数决定。etcd 的缺省 data-dir 是**工作目录下的 `default.etcd`**——这份 compose 既没设 `ETCD_DATA_DIR` 环境变量，也没传 `--data-dir` 命令行参数，于是 etcd 在容器根目录自建了 `default.etcd`，把全部数据写进了可写层。挂载点 `/etcd` 从第一天起就是空的。

这类「卷是摆设」最阴险的地方在于**平时完全无症状**：服务正常跑、数据正常读写、监控全绿。只有当你需要 `docker compose up -d --force-recreate`（换配置、回收可写层、迁移宿主机）的那一刻，可写层被整体丢弃，数据才消失——而那通常是你在做紧急运维、最不需要第二起事故的时候。

## 解决方案

用 etcd 原生的快照迁移路径，在线快照保证一致性，短暂停机只出现在最后的数据切换。

### 步骤 1：在线一致性快照

```bash
docker exec rag-service-etcd-1 sh -c \
  'ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 snapshot save /tmp/etcd-snap.db'
docker cp rag-service-etcd-1:/tmp/etcd-snap.db /root/etcd-snap.db
```

`snapshot save` 对运行中的 etcd 是安全的（不走文件复制，走 Raft 后端快照），不停机、不锁写。

### 步骤 2：restore 成目标 data-dir 结构

```bash
docker run --rm -v /root:/host quay.io/coreos/etcd:v3.5.5 \
  etcdctl snapshot restore /host/etcd-snap.db --data-dir /host/etcd-restored
```

restore 会生成带完整 `member/` 结构的数据目录（快照本身不能直接当 data-dir 用）。

### 步骤 3：停机切换，数据入卷

```bash
docker stop rag-service-etcd-1
rm -rf /var/lib/docker/volumes/etcd_data/_data/*      # 卷是空的，清掉挂载残留
cp -a /root/etcd-restored/. /var/lib/docker/volumes/etcd_data/_data/
```

### 步骤 4：补上缺失的配置，带卷重建

```yaml
  etcd:
    environment:
      - ETCD_DATA_DIR=/etcd        # ← 缺的就是这一行
      # ...
    volumes:
      - etcd_data:/etcd
```

```bash
docker compose up -d etcd    # 配置变更触发 recreate，新容器以卷为 data-dir
```

### 步骤 5：验证

```bash
docker exec rag-service-etcd-1 etcdctl --endpoints=http://127.0.0.1:2379 endpoint health
du -sh /var/lib/docker/volumes/etcd_data/_data    # 数据应在卷里
docker ps -as | grep etcd                          # 可写层应回落到 KB 级
```

本次修复后：可写层 385M → 8KB，数据落卷 123M，上游 Milvus 自动重连、元数据读写正常。

<InfoBox variant="warning" title="注意事项">

- 给 stateful 容器（etcd/postgres/redis/minio）做巡检时，把「**可写层大小 vs 卷大小**」当固定对账项：`docker ps -as` 的 SIZE 一栏异常膨胀而卷很空，几乎必然是数据没落卷。
- 判断「数据在哪」要追**进程实际读写的路径**（`docker top` 看参数、进容器找数据目录），不能只看 compose 有没有 volumes 行——有挂载不等于被使用。
- 单节点 etcd 的快照 restore 会重建 member 元数据，只适用于单节点场景；多节点集群的迁移请走成员变更流程。
- 同类排查方法论见 [容器日志吃满服务器磁盘？docker system df 的 reclaimable 是误报](/blog/docker-writable-layer-logs-disk-full)——`docker ps -as` 可写层观察是同一把刀；挂载路径被覆盖的另一形态见 [Docker Volume 覆盖 Bind Mount](/blog/docker-volume-override-bind-mount)。

</InfoBox>

## 常见问题

### Docker 挂载卷后目录是空的怎么回事？

两种常见原因：一是空卷挂载遮盖了镜像内原有目录（Docker 的既有行为）；二是应用的数据目录参数根本没指向挂载点，数据写进了容器可写层——本文的 etcd 案例就是这种。用 `du` 分别看卷目录和容器可写层的大小，一眼可辨。

### etcd 数据怎么安全迁移到新的 data-dir？

`etcdctl snapshot save` 在线做一致性快照（不停机），`etcdctl snapshot restore --data-dir` 生成带 member 结构的目标目录，停容器后把数据放到新位置、以新 data-dir 启动，最后 `endpoint health` 加上游重连验证。全程停机只在切换那一段。

### compose 里挂了卷为什么没生效？

`volumes:` 只把卷挂到容器的某个路径；应用写哪里由它自己的配置决定——etcd 看 `data-dir`，postgres 看 `PGDATA`，redis 看配置文件里的 `dir`。挂载点和应用配置对不上，卷就只是个空目录，数据全在可写层，重建即丢。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
