---
title: "容器日志吃满服务器磁盘？docker system df 的 reclaimable 是误报"
description: "磁盘 81% 告警但业务数据不大？docker system df 显示 images 100% reclaimable 却全是运行中镜像。用 du -xh 逐层定位：容器可写层里的 task 日志、npm/pnpm 缓存、只增不删的备份脚本才是大头。"
date: 2026-08-28
tags: [Docker, DevOps, Airflow, 运维]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "docker system df 的 RECLAIMABLE 显示 100% 能直接删吗？"
    a: "不能。RECLAIMABLE 是「当前无容器引用」空间的估算口径，运行中的 active 镜像也可能被标 100% reclaimable（实测 7 个镜像全在用仍如此显示）。清理依据用 du + docker ps -as 实测，别按这个数字动手。"
  - q: "docker ps 的 SIZE 和 docker system df 的 SIZE 有什么区别？"
    a: "docker ps -as 的 SIZE 是该容器可写层的大小；docker system df 是镜像/容器/卷/缓存的分类汇总。容器内日志无限累积只体现在可写层，不体现在任何 image size 上。"
  - q: "Docker 服务器磁盘满了怎么清理？"
    a: "分三类处理：包管理缓存直删（npm cache clean、pnpm store prune）；容器可写层用 compose force-recreate 回收（会重启服务）；备份与日志类加 TTL 定期剪枝。清理前先用 du -xh -d1 定位大头。"
---

告警邮件：生产服务器根分区用到 81%（30G/40G，超过 80% 红线）。第一反应是查 `docker system df`——它显示 images 一栏 `RECLAIMABLE 100% (7)`，看起来删掉镜像就能回血；但这 7 个镜像全在运行，真按提示 `docker image prune -a` 就是生产事故。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析平台，自动洞察市场趋势、用户行为与销售数据；出问题的是跑它 Airflow 数据管道的 Docker 服务器。

## TL;DR

磁盘超红线时**别信 `docker system df` 的 RECLAIMABLE**——它是「无容器引用空间」的估算口径，active 镜像照样标 100%。正确姿势：`sudo du -xh -d1 /` 逐层找大头。这次的三大隐形消耗都不在业务数据里：**容器可写层里无限累积的 task 日志**（Dockerfile 没给日志配卷）、**包管理器缓存**（npm + pnpm 共 ~4G）、**只增不删的备份脚本**（每次全量克隆从不清理）。对应清理：缓存直删、可写层 `force-recreate` 回收、备份脚本加 TTL 剪枝——81% 回落到 64%。

## 问题现象

```text
$ df -h /
Filesystem      Size  Used Use% Mounted on
/dev/vda1        40G   30G  81% /

$ docker system df
TYPE        TOTAL   ACTIVE   SIZE     RECLAIMABLE
Images      7       7        4.2GB    100% (7)    ← 全是运行中镜像
Containers  5       5        810MB    0%
```

按 `docker system df` 的提示去做文章（清理镜像）无从下手——RECLAIMABLE 100% 但 ACTIVE 也是 7/7。真正的空间去哪了，`docker system df` 完全没体现：

```text
sudo du -xh -d1 / | sort -rh | head
# 部分输出：
# 2.7G    /root/.npm              ← npm 缓存
# 1.1G    /root/.local/share/pnpm ← pnpm store
# 857M    /root/backups-git       ← 备份工作区，只增不删
# （overlay2 内藏：airflow scheduler 可写层 468M + dag-processor 257M）
```

## 根因

三类消耗在「业务数据」视角里全部隐形。

**容器可写层吃日志。** Airflow 的 task 日志写在容器内部、没挂外置卷——scheduler 可写层 468M、dag-processor 257M，约两周累积 780M，随时间单调增长。镜像层不变，变的都是可写层；`docker system df` 把它归在 Containers 的 SIZE 里，混在 810M 的总数里毫无存在感。

**包管理器缓存只进不出。** 频繁部署/构建的服务器上，`~/.npm`（2.7G）和 pnpm store（1.1G）持续累积，没有人会主动去清。

**备份脚本只增不删。** 备份脚本每次全量克隆仓库工作区推 GitHub，旧的克隆目录从不剪枝——857M 里大部分是历史重复。更隐蔽的是孤本：某些备份目录对应的分支从未推送成功，直接删有风险，需要先核对。

而 `docker system df` 的 RECLAIMABLE 是按「没有运行容器引用」估算的统计口径，active 镜像也可能显示 100% reclaimable（本次 7/7 全如此）——它是误报来源，不是清理依据。

## 解决方案

### 步骤 1：du 逐层定位，先看再删

```bash
sudo du -xh -d1 / | sort -rh | head        # 根分区逐层
sudo du -xh -d1 /var/lib/docker | sort -rh | head   # Docker 目录下钻
docker ps -as --format "table {{.Names}}\t{{.Size}}"  # 各容器可写层
```

`du -x` 不跨文件系统，避开 proc/sys 噪音和 overlay 混淆；`docker ps -as` 的 SIZE 列直接暴露每个容器的可写层大小——这是定位「日志写进容器」类问题的关键一条。

### 步骤 2：缓存直删

```bash
npm cache clean --force        # 或直接 rm -rf ~/.npm/_cacache
pnpm store prune               # 只清未引用的包
```

缓存类共回收 ~5.1G，无风险、可随时重下。

### 步骤 3：可写层 force-recreate 回收

```bash
docker compose up -d --force-recreate   # 可写层随旧容器删除而回收
```

本次回收 ~780M。两个前提：选低峰期（服务会重启）；**容器内还有用要先捞出来**——比如 `docker cp` 把 task 日志拷出，否则随容器一起没了。

### 步骤 4：备份脚本加 TTL，防复发

```bash
# 备份目录保留 7 天，超过自动剪
find /root/backups-git -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

把剪枝加进备份脚本尾部（本例 github-backup-push.sh 已部署）；删除前核对未推送的孤本分支（`git ls-remote` 对比），确认无独有提交再删——本次 325M 孤本经确认后清理。

清理完成后：81% → 64%，缓存/剪枝/可写层三处合计回收 ~6.7G。

<InfoBox variant="warning" title="注意事项">

- `docker system df` 的 RECLAIMABLE ≠ 可删空间：active 镜像也可能标 100%（本次 7 个全在用）。清理决策以 `du` + `docker ps -as` 实测为准。
- `force-recreate` 会重启服务且回收可写层——需要留存的日志先 `docker cp` 出来；根治是给日志配外置卷 + 保留期轮转，可写层回收只是这一次的止血。
- 删备份目录前必核对：有没有从未推送成功的孤本分支，删之前 `git ls-remote` 确认。
- 磁盘红线告警要配「定位命令」一起给，收到告警的人第一件事是 `du -xh -d1 /`，而不是猜。
- 同一台服务器更早的「磁盘 93% + CPU 160%」排查复盘见 [2 核 7G 服务器 Docker 资源黑洞三步排查](/blog/docker-low-server-troubleshoot)。

</InfoBox>

## 常见问题

### docker system df 的 RECLAIMABLE 显示 100% 能直接删吗？

不能。RECLAIMABLE 是「当前无容器引用」空间的估算口径，运行中的 active 镜像也可能被标 100% reclaimable——实测 7 个镜像全在用仍显示如此。它回答的是「理论上有多少未被引用」，不回答「能不能删」。动手前用 `du -xh -d1` 和 `docker ps -as` 实测定位。

### docker ps 的 SIZE 和 docker system df 的 SIZE 有什么区别？

`docker ps -as` 的 SIZE 是单个容器可写层的大小；`docker system df` 是镜像/容器/卷/缓存的分类汇总。容器内日志无限累积只体现在可写层（`docker ps -as` 能看到），不会体现在任何 image size 上——这就是「镜像看起来不大、磁盘却在涨」的原因。

### Docker 服务器磁盘满了怎么清理？

分三类：包管理缓存直删（`npm cache clean --force`、`pnpm store prune`），无风险；容器可写层用 `docker compose up -d --force-recreate` 回收（会重启服务，日志先备份）；备份、日志、克隆目录这类加 TTL 定期剪枝防复发。任何删除动作前，先用 `du -xh -d1 /` 确认大头位置。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
