---
title: "coscli 没有 upload？v1 用 cp/rm/sync，LHCOS 桶 HEAD 判存在"
description: "coscli v1 没有 upload/delete：上传用 cp、递归加 -r、地域走 -e。LHCOS 桶不进 GET Service 列表，HEAD 桶名才是存在性判据，建删桶只能去控制台。"
date: 2026-11-13
tags: [Tencent COS, CLI, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "coscli 常用命令有哪些？"
    a: "v1 高频就三个动词：cp（上传/下载，目录加 -r 递归）、sync（目录同步）、rm（删除，递归加 -r）。脚本非交互调用统一带 --init-skip=true 跳过配置向导，地域用 -e 指定 cos.<region>.myqcloud.com，密钥用 -i/-k 提供。"
  - q: "coscli 上传报子命令不存在怎么办？"
    a: "v1（如 1.0.9）没有 upload 这个动词，用 cp 替代：coscli cp -r 本地路径 cos://桶/前缀/ -e cos.<region>.myqcloud.com。教程里的 upload/delete 是别的 CLI 的动词表，先确认装的是哪套工具再抄命令。"
  - q: "LHCOS 桶在 coscli 里看不到怎么办？"
    a: "这是目录可见性怪癖，不是桶丢了：GET Service（列全部桶）对 LHCOS 桶返回 0 个，直接 HEAD 具体桶名才是存在性判据。文件的读写删 API 一切正常，只有建桶删桶要去控制台。"
---

在给 PostgreSQL 备份配异地上传时，脚本里第一行写的就是直觉命令 `coscli upload backup.sql.gz cos://…`，回车直接报子命令不存在。

在一套 PostgreSQL 备份异地化链路（shell 脚本 + 腾讯云 coscli，v1.0.9）里踩到。

<!-- TODO 产品建立后回填来源说明：在开发 [产品名](产品文档链接) 时踩到 coscli 的命令怪癖——{业务价值} -->

## TL;DR

v1 没有 upload/delete 这类动词：上传/下载用 `cp`，目录同步用 `sync`，删除用 `rm`，递归一律加 `-r`；地域不写配置文件就用 `-e` 指定。LHCOS（轻量应用服务器配套的对象存储）桶还有一个怪癖：它们不进主账号 COS 的全局桶列表——GET Service 返回 0 个桶，HEAD 具体桶名才是存在性判据；建桶删桶只能去控制台，文件的读写删 API 一切正常。

## 问题现象：命令不存在、参数个数不对、列桶列表是空的

三个现象像三件不相干的事——找不到命令（如果你搜的是「coscli command not found」「COS 命令行上传报错」）、`-r` 报 accepts 2 args、GET Service 列出 0 个桶——实际是两套规则叠加：v1 的动词表，和 LHCOS 桶的目录可见性。

第一坑，直觉动词不存在。`upload`、`delete` 敲进去都报子命令不存在，帮助列表里根本没有这两个词。

第二坑，递归标志当命令用。`-r` 摆错位置或缺了必要参数时，报 `accepts 2 args`——它不是独立命令，只是 cp/sync 的递归标志，位置参数按 cp 的签名来。

第三坑最迷惑：想用列桶接口（GET Service，列出账号下全部桶）确认桶在不在，返回 0 个桶。而备份任务一直写得进、读得出——桶好好的，只是不在这份列表里。

## 根因：coscli v1 的动词表，加 LHCOS 不并入全局桶列表

**v1 的动作语义是「对象操作」，不是「资源管理」。** coscli v1 的动词就三个：cp（上传/下载）、sync（目录同步）、rm（删除）。教程里常见的 upload/delete 是别的工具或更新版本 CLI 的动词；递归不是独立命令而是 `-r` 标志，所以「命令 + -r + 源 + 目标」少一个位置参数就报 accepts 2 args。腾讯云还有一套更早的 Python 工具 coscmd，动词表又是一套——搜出来的教程先看清是哪套工具再抄。

**LHCOS 桶是独立命名空间，不并入主账号 COS 的全局列表。** GET Service 只返回 COS 产品线的桶，LHCOS 桶永远不在结果里，返回 0 个不代表桶不存在。存在性判据只有 HEAD 具体桶名。文件级 API（上传/下载/删除）按桶名直连，一切正常；只有桶的创建/删除是控制台专属操作。

## 解决方案：脚本固定姿势，存在性用 HEAD 判

1. **非交互固定姿势**。`--init-skip=true` 跳过首次配置向导，`-i/-k` 给密钥，`-e` 指定地域 endpoint——三个一起构成 cron/脚本里可用的形态：

```bash
# 上传单个文件；目录加 -r
coscli --init-skip=true cp backup.sql.gz cos://examplebucket-1250000000/backup/ \
  -e cos.ap-guangzhou.myqcloud.com -i "$SECRET_ID" -k "$SECRET_KEY"

# 目录同步
coscli --init-skip=true sync ./dump/ cos://examplebucket-1250000000/backup/ \
  -e cos.ap-guangzhou.myqcloud.com -i "$SECRET_ID" -k "$SECRET_KEY"

# 删除（递归加 -r）
coscli --init-skip=true rm -r cos://examplebucket-1250000000/backup/old/ \
  -e cos.ap-guangzhou.myqcloud.com -i "$SECRET_ID" -k "$SECRET_KEY"
```

桶名带 APPID 后缀（示例里的 1250000000），广州地域的 endpoint 形如 `cos.ap-guangzhou.myqcloud.com`。

2. **存在性判断不走列桶**。排查「桶到底在不在」时直接 HEAD 具体桶名，或在控制台确认——GET Service 的空列表不作数。

3. **一次性操作走控制台**。建桶、删桶、改桶权限都是控制台动作，脚本里不碰。

| 意图 | v1 写法 |
|------|--------|
| 上传单个文件 | `cp <本地文件> cos://桶/路径/` |
| 上传目录 | `cp -r <目录> cos://桶/路径/` |
| 目录同步 | `sync <目录> cos://桶/路径/` |
| 删除 | `rm [-r] cos://桶/路径/` |

<InfoBox variant="warning" title="注意事项">

- **`-i/-k` 直接传值会留在 shell 历史与进程列表里**。cron 场景从 600 权限的凭据文件 source 注入更稳；子账号按「仅目标桶读写」最小授权。
- **LHCOS 与 COS 是两条产品线**，计费与容量口径分开，别拿 COS 的桶列表当 LHCOS 的盘点依据。
- **报错先看动词表**：coscli v1、v2、coscmd 三套工具动词不通用，先 `--version` 确认装的哪套，再对教程。

</InfoBox>

## 常见问题

### coscli 常用命令有哪些？

v1 高频就三个动词：cp（上传/下载，目录加 -r 递归）、sync（目录同步）、rm（删除，递归加 -r）。脚本非交互调用统一带 `--init-skip=true` 跳过配置向导，地域用 `-e` 指定 `cos.<region>.myqcloud.com`，密钥用 `-i/-k` 提供。

### coscli 上传报子命令不存在怎么办？

v1（如 1.0.9）没有 upload 这个动词，用 cp 替代：`coscli cp -r 本地路径 cos://桶/前缀/ -e cos.<region>.myqcloud.com`。教程里的 upload/delete 是别的 CLI 的动词表，先确认装的是哪套工具再抄命令。

### LHCOS 桶在 coscli 里看不到怎么办？

这是目录可见性怪癖，不是桶丢了：GET Service（列全部桶）对 LHCOS 桶返回 0 个，直接 HEAD 具体桶名才是存在性判据。文件的读写删 API 一切正常，只有建桶删桶要去控制台。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
