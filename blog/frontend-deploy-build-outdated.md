---
title: 排查前端部署后线上未更新的问题
description: 新功能本地正常但线上看不到？通过对比构建产物时间戳快速定位服务器构建产物未更新的根因
date: 2026-03-07
tags: [前端部署, Nginx, Vite, Bug修复]
authors: [cclee]
schema: Article
---

## TL;DR

前端代码已推送到 Git，但线上看不到新功能？根因通常是**服务器构建产物未更新**。通过对比本地和服务器的 `dist/` 目录时间戳即可确认，解决方案是在服务器上重新运行 `npm run build`。


<!-- truncate -->
## 问题现象

新开发的按钮/功能在本地 (`npm run dev`) 正常显示，但部署后线上看不到：

- 浏览器刷新无效
- 清除浏览器缓存无效
- 检查代码逻辑没问题
- Git 确认代码已推送

## 根因

前端静态文件通常由 Nginx 直接服务，流程如下：

```
Git Push → 服务器 git pull → 服务器 npm run build → Nginx 服务 dist/
```

**问题出在第二步到第三步之间**：代码已 `git pull`，但 `npm run build` 未执行或执行失败。

典型场景：
1. 自动部署脚本只同步代码，未触发构建
2. 手动部署时忘记运行构建命令
3. 构建命令执行了但输出到错误目录

## 解决方案

### 步骤 1：对比构建产物时间戳

```bash
# 本地
ls -la dist/assets/ | head -5

# 服务器
ssh user@server "ls -la /path/to/project/dist/assets/ | head -5"
```

输出对比：

```
# 本地（最新构建）
Mar  7 22:55 index-28dFGXhX.js   ← 包含新功能

# 服务器（旧构建）
Mar  7 20:18 index-DsFdnylh.js   ← 不包含新功能
```

文件名不同（hash 变化）说明内容有变化，时间戳不同说明构建未同步。

### 步骤 2：在服务器上重新构建

```bash
ssh user@server "cd /path/to/project && npm run build"
```

### 步骤 3：验证构建产物已更新

```bash
ssh user@server "ls -la /path/to/project/dist/assets/"
```

确认时间戳和文件名与本地一致。

### 步骤 4：刷新页面

由于 Vite/Webpack 构建会生成带 hash 的新文件名（如 `index-28dFGXhX.js`），`index.html` 会引用新文件，用户只需正常刷新即可，无需强制清除缓存。

## 完整排查命令

```bash
#!/bin/bash
# 保存为 check-deploy.sh

SERVER="user@server"
PROJECT_PATH="/path/to/project"

echo "=== 本地最新提交 ==="
git log --oneline -1

echo -e "\n=== 服务器最新提交 ==="
ssh $SERVER "cd $PROJECT_PATH && git log --oneline -1"

echo -e "\n=== 本地构建时间 ==="
ls -la dist/assets/ | head -3

echo -e "\n=== 服务器构建时间 ==="
ssh $SERVER "ls -la $PROJECT_PATH/dist/assets/ | head -3"

echo -e "\n=== 服务器与远程差异 ==="
ssh $SERVER "cd $PROJECT_PATH && git fetch origin && git log HEAD..origin/main --oneline"
```

## FAQ

### Q: 为什么 Git 已推送但线上还是旧代码？

A: Git 推送只更新了源代码，前端需要 `npm run build` 生成静态文件。如果部署流程没有自动触发构建，服务器上的 `dist/` 目录仍是旧版本。Nginx 直接服务静态文件，不会自动执行构建。

### Q: 清除浏览器缓存为什么无效？

A: 问题不在浏览器缓存，而在服务器上的静态文件本身是旧的。即使强制刷新，Nginx 返回的仍是旧的 JS/CSS 文件。正确做法是更新服务器上的构建产物。

### Q: 如何避免忘记重新构建？

A: 两种方案：1) 配置 CI/CD 自动构建（如 GitHub Actions）；2) 在服务器上使用 git hooks，`git pull` 后自动执行 `npm run build`。

### Q: Vite 构建为什么文件名带 hash？

A: Vite 默认给打包文件添加 content hash（如 `index-28dFGXhX.js`），文件内容变化时 hash 变化。这是缓存破坏策略，确保用户总能获取最新版本，同时保留长期缓存能力。
