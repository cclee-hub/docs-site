---
title: Docker 容器读不到宿主机文件？匿名 Volume 覆盖 Bind Mount
description: docker-compose.yml 配置了 bind mount，容器内却看不到宿主机文件。WordPress 官方镜像的 VOLUME 声明会创建匿名卷，覆盖你的挂载配置。
date: 2026-04-04
tags: [Docker, WordPress, 容器化部署]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "docker-compose.yml 配置了 volumes 挂载，为什么容器内看不到宿主机文件？"
    a: "镜像 Dockerfile 中的 VOLUME 声明会创建匿名卷，挂载优先级高于 docker-compose.yml 的 bind mount。"
  - q: "如何确认是否存在匿名卷覆盖问题？"
    a: "运行 docker inspect <container> 查看Mounts 字段，如果看到 Type 为 volume 且 Source 是 Docker 管理的路径，就是匿名卷。"
---

在为客户部署 WordPress 站点时遇到此问题，记录根因与解法。

## TL;DR

镜像 Dockerfile 中的 `VOLUME` 声明会创建匿名卷，挂载优先级高于 docker-compose.yml 的 bind mount。解决方案：停止容器 → 删除匿名卷 → 重启。


<!-- truncate -->
## 问题现象

CI 部署后，新增的静态文件或 PHP 代码在容器内不存在：

- `assets/images/logo.png` 宿主机存在，容器内无 → Logo 不显示
- `inc/setup.php` 新增 filter 代码，容器内是旧版本 → Filter 不生效
- `git pull` 后文件已更新，容器内仍是旧内容

## 根因

WordPress 官方镜像的 Dockerfile 包含：

```dockerfile
VOLUME /var/www/html
```

即使你的 docker-compose.yml 配置了 bind mount：

```yaml
volumes:
  - ./wordpress/wp-content:/var/www/html/wp-content
```

Docker 仍会为 `VOLUME` 声明的路径创建匿名卷，**匿名卷的挂载优先级高于 bind mount**，导致：

1. `/var/www/html` 被匿名卷接管
2. 你的 bind mount 只挂载到 `/var/www/html/wp-content`
3. 但匿名卷已经"占领"了父目录，bind mount 实际上被覆盖

用 `docker inspect` 验证：

```bash
docker inspect prod_wordpress --format '{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

输出类似：

```
volume: /var/lib/docker/volumes/wp-prod_wp_html/_data -> /var/www/html# 匿名卷！
bind:/var/www/wp-prod/wordpress/wp-content -> /var/www/html/wp-content
```

## 解决方案

```bash
# 1. 停止容器
cd /var/www/wp-prod && docker compose down

# 2. 删除匿名卷
docker volume rm wp-prod_wp_html

# 3. 重启
docker compose up -d
```

### 验证

```bash
docker inspect prod_wordpress --format '{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

应只显示 bind mount，无匿名 volume：

```
bind: /var/www/wp-prod/wordpress/wp-content -> /var/www/html/wp-content
```

## 预防

使用 bind mount 部署时，检查镜像是否声明了 `VOLUME`。如果声明了：

1. 首次启动前，确认没有残留的匿名卷
2. 或者修改 docker-compose.yml，让 bind mount 路径与 VOLUME 路径一致（挂载到同一层级）

修复后，`git pull` 更新代码时容器自动读取新文件，无需 `docker cp` 或重启容器。

<InfoBox variant="warning" title="注意事项">

- 删除匿名卷前确保数据已备份或可通过git pull 恢复
- 生产环境操作前先在测试环境验证
- 如果容器内有关键数据，先用 `docker cp` 备份

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
