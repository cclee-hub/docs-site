---
title: 在 Docker WordPress 容器中安装 WP-CLI
description: 解决 WordPress 官方 Docker 镜像不包含 WP-CLI 的问题，通过 docker-compose command 自动安装，实现容器内 wp 命令可用。
date: 2026-03-20
tags: [Docker, WordPress, WP-CLI]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Docker WordPress 容器里为什么没有 wp 命令？"
    a: "官方 WordPress Docker 镜像为精简体积，默认不包含 WP-CLI 工具，需要手动安装。"
  - q: "如何在 docker-compose 中自动安装 WP-CLI？"
    a: "在 wordpress 服务的 command 中添加下载和安装 wp-cli.phar 的脚本，容器启动时自动完成安装。"
---

## TL;DR

官方 WordPress Docker 镜像不含 WP-CLI。在 `docker-compose.yml` 中添加 command 配置，容器启动时自动下载安装 WP-CLI，无需手动进入容器操作。

## 问题现象

在 WordPress Docker 容器内执行 `wp` 命令：

```bash
docker exec -it wordpress_container wp --version
```

报错：

```
bash: wp: command not found
```

## 根因

WordPress 官方 Docker 镜像基于 `php:apache` 构建，设计目标是保持镜像精简。WP-CLI 是独立的命令行工具，需要额外安装，不在默认镜像中。

## 解决方案

在 `docker-compose.yml` 的 WordPress 服务中添加 `command`，容器启动时自动安装 WP-CLI：

```yaml
services:
  wordpress:
    image: wordpress:latest
    volumes:
      - ./wordpress:/var/www/html
    command: >
      bash -c "curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar &&
               chmod +x wp-cli.phar &&
               mv wp-cli.phar /usr/local/bin/wp &&
               docker-entrypoint.sh apache2-foreground"
```

**关键点：**

1. `curl -sO` - 静默下载 WP-CLI phar 包
2. `chmod +x` - 添加执行权限
3. `mv ... /usr/local/bin/wp` - 移动到 PATH 目录，使命令全局可用
4. `docker-entrypoint.sh apache2-foreground` - 执行原镜像的默认入口点，启动 Apache

重启容器后验证：

```bash
docker-compose down
docker-compose up -d
docker exec -it wordpress_container wp --version
# 输出: WP-CLI 2.x.x
```

---
**对类似需求感兴趣？[联系合作](/about)**
