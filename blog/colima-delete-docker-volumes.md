---
title: "colima delete 会删掉 Docker 数据卷吗？--data 才是真删除"
description: "colima delete 默认不删 Docker 数据卷：v0.9.0 起容器数据在独立 datadisk，colima delete --data 才会抹掉。0.10.3 实测两种删除语义、命名卷位置与备份方法。"
date: 2026-10-19
tags: [Docker, colima, macOS, 数据备份]
authors: [cclee]
image: "/images/blog/colima-delete-docker-volumes-architecture.webp"
schema: FAQPage
faqs:
  - q: "colima delete 之后 Docker 数据还能恢复吗？"
    a: "能，前提是没有加 --data。v0.9.0 起容器数据放在独立数据盘上，裸 colima delete 不动这块盘，下次 colima start 数据自动回来；colima delete --data 才会连数据盘一起删，且不可逆。"
  - q: "Docker 命名卷的数据到底存在 Mac 哪个位置？"
    a: "在 colima 虚拟机的数据盘镜像里：~/.colima/_lima/_disks/colima/datadisk，本机这块盘标称 100 GiB、是稀疏文件、实际占用约 1.2 GiB。虚拟机内的挂载点是 /var/lib/docker。备份卷内容用 tar 打包，比直接处理这个镜像文件稳妥。"
  - q: "Docker 占用磁盘太大怎么办？"
    a: "先分辨显示大小和真实占用：datadisk 显示 100 GiB，du 实测只有约 1.2 GiB。清理顺序：docker system prune 回收容器层；colima ssh -- sudo fstrim -a 让稀疏文件回落（v0.5.0 起重启也自动释放）；磁盘不够只能扩不能缩，改 colima.yaml 的 disk 值后 colima restart（v0.5.3+ 自动扩容）。"
  - q: "Docker 容器的数据卷怎么备份和恢复？"
    a: "任意卷用一次性 alpine 容器打包：docker run --rm -v 卷名:/data -v \"$PWD\":/backup alpine tar czf /backup/vol.tgz -C /data .，恢复时把 tar czf 换成 tar xzf。PostgreSQL 这类数据库建议优先 pg_dump 逻辑备份，比拷数据目录干净、跨版本稳定。"
---

在准备 `colima delete` 重置本地 Docker 环境时，`--help` 里的一句 "This deletes everything" 和官方 FAQ 里「容器数据会在下次 `colima start` 时回来」直接顶上了——同一个删除命令，两份官方口径，至少一份不准。

这次核实发生在维护本地 Docker 开发环境（macOS 上的 colima 0.10.3 + docker compose）时，环境里跑着一个共享 PostgreSQL 开发库。

## TL;DR

- colima **v0.9.0 起**，容器数据（镜像、容器、命名卷）放在一块独立数据盘上，裸 `colima delete` 不碰它，下次 `colima start` 数据自动回来。
- `colima delete --data` 才会连数据盘一起删——这才是不可逆的命令。
- 但 `--help` 至今仍写 "This deletes everything"，大量旧教程也停留在旧行为。以实际行为为准：先备份命名卷，再执行任何 delete。
- 命名卷的真实位置：`~/.colima/_lima/_disks/colima/datadisk`（100 GiB 稀疏文件，实测占用 1.2 GiB）。

## 问题现象：两份官方口径打架

colima delete 的两份官方口径互相矛盾：`--help` 说会删掉一切，官方 FAQ 说数据会回来——至少一份不准。

`colima delete --help` 的原文口气很重：

```console
$ colima delete --help
Delete and teardown Colima and all settings.

Use with caution. This deletes everything and a startup afterwards is like the
initial startup of Colima.

Flags:
  -d, --data   delete container runtime data
```

而官方 FAQ「How can I delete container data」一节是另一套说法：从 v0.9.0 起，容器运行时数据使用一块不同的磁盘，这块盘的存在是为了 "guards against accidental data loss after deletion"——防止删除后意外丢数据，数据会在 `colima start` 时回来；要彻底清除得用 `colima delete --data`。

带着「`colima delete` = 数据卷全没」的预期，人会卡在两个具体处境之一：想重置 VM（升级、排障），又不敢跑 delete；或者反过来，随手带上 `--data` 期望「清干净些」，事后才发现这个 flag 比想象中狠得多。搜索里问的都是同一件事的不同说法——「Docker 数据卷丢了」「volume 不见了」「colima delete 卷还能恢复吗」——答案取决于版本和 flag，不是一句 yes 或 no。

## 根因：v0.9.0 起容器数据在独立数据盘

colima 的虚拟机里有两块盘，`colima delete` 对它们的处置完全不同。

<img src="/images/blog/colima-delete-docker-volumes-architecture.webp" width="560" alt="colima 两块磁盘架构：delete 与 delete --data 的不同作用范围" loading="lazy" />

宿主机上能直接看到这两块盘的实体文件：

```console
# 系统盘：20 GiB 的 GPT 裸盘镜像，装 VM 系统本身
$ ls -lh ~/.colima/_lima/colima/disk
-rw-r--r--@ 1 cc  staff    20G Oct 19 20:57 /Users/cc/.colima/_lima/colima/disk
$ du -sh ~/.colima/_lima/colima/disk
1.4G	/Users/cc/.colima/_lima/colima/disk

# 数据盘：100 GiB 稀疏文件，实际占用随容器数据量走
$ ls -lh ~/.colima/_lima/_disks/colima/datadisk
-rw-r--r--@ 1 cc  staff   100G Oct 19 20:57 /Users/cc/.colima/_lima/_disks/colima/datadisk
$ du -sh ~/.colima/_lima/_disks/colima/datadisk
1.2G	/Users/cc/.colima/_lima/_disks/colima/datadisk
```

虚拟机内部，Docker 的数据根目录整块挂在这块数据盘上：

```console
$ docker info --format '{{.DockerRootDir}}'
/var/lib/docker
$ colima ssh -- df -h /var/lib/docker
Filesystem      Size  Used Avail Use% Mounted on
/dev/vdb1        98G  1.1G   92G   2% /var/lib/docker
$ docker volume ls
DRIVER    VOLUME NAME
local     dev-infra_dev-pg-data
```

那个 `dev-infra_dev-pg-data` 是本地共享 PostgreSQL 开发库的命名卷（compose 里挂到 `/var/lib/postgresql/data`）——它的每一个字节都在 `/dev/vdb1`，也就是宿主机的 `datadisk` 文件里。

源码层面（colima 0.10.3，`app/app.go` 的 `Delete`），`--data` 的作用范围一目了然：

```go
// delete runtime disk if disk in use and data deletion is requested
if diskInUse && data {
    log.Println("deleting container data")
    if err := limautil.DeleteDisk(); err != nil {
        return fmt.Errorf("error deleting container data: %w", err)
    }
    // ...
}
```

`data` 就是 `--data`。不带这个 flag 时这个分支不执行——被删掉的只是 VM 系统盘和配置，数据盘的实体文件留在原地。这也解释了 FAQ 的措辞为什么改：colima 自己的升级排障文档长期建议 `colima delete` + `colima start` 重建环境，v0.9.0 之前这条路会连数据一起没；v0.9.0 把「删环境」和「删数据」拆成了两个动作，FAQ 原文说新架构就是为 "guards against accidental data loss after deletion" 兜底的。

## colima delete 与 colima delete --data：两种删除语义

不带 `--data` 时只有系统盘被删，数据盘原地不动；带上 `--data` 则两块盘一起删。

| 命令 | 系统盘 `_lima/colima/disk` | 数据盘 `_disks/colima/datadisk` | 命名卷 |
|------|------|------|------|
| `colima delete` | 删除 | 保留 | 下次 `colima start` 回来* |
| `colima delete --data` | 删除 | 删除 | 不可恢复 |

还有一个藏在确认提示里的细节：源码只有在「数据盘不存在，或显式带了 `--data`」时，才会追加第二道确认——"this will delete ALL container data"。也就是说裸 `colima delete` 连这句狠话都不会出现，因为按设计它根本不碰你的数据。

\* 诚实标注：「默认 delete 后数据自动回来」来自官方 FAQ 明文加源码分支推断，本机 0.10.3 没有做全量 delete→start 实测——不拿在用的开发环境冒险验证。你要实测，先按下一节备份。

三种情况仍然会丢数据：

1. **colima 0.8.x 及更早**：没有独立数据盘，一切都在系统盘上，裸 delete 就是全删。旧教程里「colima delete 会清空数据」在这个版本区间是真的。
2. **带了 `--data`**，或手动执行过 `limactl disk delete`。
3. **没用 colima delete，而是 `rm -rf ~/.colima`**：数据盘实体文件就在这个目录里，比 `--data` 还彻底，连配置带数据全没。

## 解决方案：删之前把命名卷备份出来

通用打包法，任何卷、任何存储引擎都适用：

```bash
# 备份：把卷内容打包到当前目录
docker run --rm -v dev-infra_dev-pg-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/dev-pg-data-$(date +%F).tgz -C /data .

# 恢复：空卷可先由 compose 重建，再解包回去
docker run --rm -v dev-infra_dev-pg-data:/data -v "$PWD":/backup alpine \
  sh -c 'cd /data && tar xzf /backup/dev-pg-data-2026-10-19.tgz'
```

数据库优先逻辑备份，比拷数据目录干净，跨版本也稳：

```bash
# 备份（life 为本环境实际库名，替换成你的）
docker exec dev-pg pg_dump -U postgres -Fc life > life-$(date +%F).dump

# 恢复
docker exec -i dev-pg pg_restore -U postgres -d life < life-2026-10-19.dump
```

很多人的真实动机其实是「磁盘满了，想 delete 换空间」——这条路不需要 delete：

- 容器层回收：`docker system prune`
- 稀疏文件回落：`colima ssh -- sudo fstrim -a`（v0.5.0 起重启也会自动释放未用空间）
- 磁盘只能扩不能缩：编辑 `~/.colima/default/colima.yaml` 的 `disk:` 值后 `colima restart`（v0.5.3 起自动扩容）

删除前的四步检查：

1. `colima version` 确认 0.9.0 及以上——否则按旧架构处理，全量备份
2. 复核命令里有没有 `--data`
3. 命名卷备份落地并校验（`tar -t` 列表或 `pg_restore --list` 能读出内容）
4. 记下 compose 项目名——卷名前缀由它决定（`dev-infra_dev-pg-data` 的前缀来自 `dev-infra` 目录名）

顺带一提，本地 Docker 化数据库还有一类与删除无关的坑——端口被静默占用导致连错实例，排查过程见 [WSL2 + Docker 两个网络坑](/blog/2026/05/09/wsl-docker-postgresql-port-conflict)。

<InfoBox variant="warning" title="注意事项">

- `colima delete --data` 不可逆，没有回收站。
- colima 0.8.x 及更早版本上，裸 `colima delete` 同样不可逆。
- 别拿 `rm -rf ~/.colima` 当「重置」——在数据盘架构下它等效于 `--data` 还多删一份配置。

</InfoBox>

## 常见问题

### colima delete 之后 Docker 数据还能恢复吗？

能，前提是没有加 `--data`。v0.9.0 起容器数据放在独立数据盘上，裸 `colima delete` 不动这块盘，下次 `colima start` 数据自动回来；`colima delete --data` 才会连数据盘一起删，且不可逆。

### Docker 命名卷的数据到底存在 Mac 哪个位置？

在 colima 虚拟机的数据盘镜像里：`~/.colima/_lima/_disks/colima/datadisk`，本机这块盘标称 100 GiB、是稀疏文件、实际占用约 1.2 GiB。虚拟机内的挂载点是 `/var/lib/docker`。备份卷内容用 tar 打包，比直接处理这个镜像文件稳妥。

### Docker 占用磁盘太大怎么办？

先分辨显示大小和真实占用：`datadisk` 显示 100 GiB，`du` 实测只有约 1.2 GiB。清理顺序：`docker system prune` 回收容器层；`colima ssh -- sudo fstrim -a` 让稀疏文件回落（v0.5.0 起重启也自动释放）；磁盘不够只能扩不能缩，改 `colima.yaml` 的 `disk` 值后 `colima restart`（v0.5.3+ 自动扩容）。

### Docker 容器的数据卷怎么备份和恢复？

任意卷用一次性 alpine 容器打包：`docker run --rm -v 卷名:/data -v "$PWD":/backup alpine tar czf /backup/vol.tgz -C /data .`，恢复时把 `tar czf` 换成 `tar xzf`。PostgreSQL 这类数据库建议优先 `pg_dump` 逻辑备份，比拷数据目录干净、跨版本稳定。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
