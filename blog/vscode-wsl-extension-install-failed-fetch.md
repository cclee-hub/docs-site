---
title: "VSCode WSL 扩展安装 Failed to fetch？vsix 下载后变 gzip 的排查与解决"
description: "VSCode 升级后扩展卡住无响应，卸载重装报 Failed to fetch。根因是 marketplace 返回 gzip 压缩内容，curl -L 未自动解压，vsix 变成 gzip 格式。解法是手动下载 + gunzip 解压 + code --install-extension 安装。"
date: 2026-05-31
tags: [VSCode, WSL2, curl]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "VSCode 扩展安装报 Failed to fetch 是代理的问题吗？"
    a: "不一定是代理。marketplace 服务器本身会返回 gzip 压缩内容（标准 HTTP 内容协商），curl -L 在跟随重定向时可能不会自动解压，导致保存的文件是 gzip 格式。手动下载并 gunzip 解压后安装即可。"
  - q: "VSCode 升级后 WSL 扩展卡住无响应怎么办？"
    a: "VSCode 大版本升级会重新初始化 WSL 远程扩展宿主，扩展可能卡住无响应。卸载后手动下载 vsix 文件，用 code --install-extension 安装即可恢复。"
  - q: "vsix 安装报 not a zip file 怎么办？"
    a: "文件是 gzip 格式而非 zip 格式。marketplace 服务器返回 gzip 压缩内容，curl -L 未自动解压。用 gunzip -c file.vsix.gz > file.vsix 解压后再安装，用 file 命令可以确认格式。"
---

在 VSCode 大版本升级后，Claude Code 扩展卡住长时间无响应，只能卸载重装，重装时遇到 `Failed to fetch`、vsix 文件格式错误等一系列安装问题。

## TL;DR

VSCode 升级后扩展可能卡住无响应，卸载重装时报 `Failed to fetch`，手动下载 vsix 又遇到格式错误。根因是 marketplace 服务器返回 gzip 压缩内容（标准 HTTP 内容协商），`curl -L` 跟随重定向时未自动解压，导致保存的文件是 gzip 格式而非 zip 格式。解法：手动 curl 下载 vsix → `gunzip` 解压 → `code --install-extension` 安装。

## 问题现象

升级 VSCode 后出现以下异常：

1. Claude Code 对话长时间无响应，提示 `Manifesting...` 卡住
2. 点击扩展图标半天无对话框窗口
3. 只能卸载后重装，重装时各种方式报错

卸载后尝试重装，所有安装方式都失败：

```bash
# VSCode UI 安装 → Failed to fetch
# 命令行安装 → 同样失败
code --install-extension anthropic.claude-code
# 安装扩展时出错: Failed to fetch
```

## 根因

三个因素叠加导致本次异常：

**VSCode 升级触发 WSL 扩展宿主重新初始化。** Claude Code 这类扩展必须在 WSL 侧安装才能运行（被定义为远程扩展主机运行），大版本升级后扩展可能卡住无响应，需要卸载重装。

**VSCode 扩展安装走内部网络栈，不读 WSL 的 `http_proxy`。** 即使 WSL 中配置了代理（如 `http://172.30.0.1:7897`），VSCode 的扩展下载流程使用自己的网络通道，不受系统代理变量影响。

**Marketplace 服务器返回 gzip 压缩内容，`curl -L` 未自动解压。** marketplace API 端点在 HTTP 内容协商中返回 gzip 压缩响应，这是标准行为。`curl -L` 跟随重定向时，在某些情况下不会自动解压 `Content-Encoding: gzip`，导致保存的文件是 gzip 格式而非预期的 zip 格式。用 `file` 命令检查会看到 `gzip compressed data` 而非 `Zip archive data`。

## 解决方案

### 1. 手动下载 vsix

在 WSL 终端中用 curl 下载：

```bash
curl -L "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/anthropic/vsextensions/claude-code/latest/vspackage" \
  -o ~/claude-code.vsix
```

### 2. 检查文件格式

```bash
file ~/claude-code.vsix
```

输出 `gzip compressed data` 说明文件是 gzip 格式，需要解压。输出 `Zip archive data` 则是原始格式，跳过下一步。

### 3. 解压还原 zip 格式

```bash
gunzip -c ~/claude-code.vsix > ~/claude-code-real.vsix
```

确认格式正确：

```bash
file ~/claude-code-real.vsix
# 输出：Zip archive data, at least v2.0 to extract
```

### 4. 确认版本（可选）

```bash
unzip -p ~/claude-code-real.vsix extension/package.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'])"
```

### 5. 安装

```bash
code --install-extension ~/claude-code-real.vsix
```

安装完成后重新加载 VSCode 窗口（`Ctrl+Shift+P` → `Reload Window`），扩展即可恢复正常。

WSL2 环境下这类环境问题不少见——如果你也遇到过 [Docker Desktop host 网络模式下容器端口从宿主机访问不到](/blog/docker-desktop-wsl2-host-network-unreachable) 的问题，同样跟 WSL2 的特殊架构有关。

<InfoBox variant="warning" title="注意事项">

- 此解法适用于所有通过 marketplace 下载 vsix 文件变成 gzip 格式的情况，不限于 Claude Code 扩展
- 手动安装的扩展不会自动更新，后续 VSCode 升级如果正常走更新通道则不需要再手动操作
- 下载时可尝试加 `--compressed` 参数让 curl 自动处理 gzip 解压，若无效再走手动 gunzip 流程

</InfoBox>

## 常见问题

### VSCode 扩展安装报 Failed to fetch 是代理的问题吗？

不一定是代理。marketplace 服务器本身会返回 gzip 压缩内容（标准 HTTP 内容协商），`curl -L` 在跟随重定向时可能不会自动解压，导致保存的文件是 gzip 格式。手动下载并 `gunzip` 解压后安装即可。

### VSCode 升级后 WSL 扩展卡住无响应怎么办？

VSCode 大版本升级会重新初始化 WSL 远程扩展宿主，扩展可能卡住无响应。卸载后手动下载 vsix 文件，用 `code --install-extension` 安装即可恢复。

### vsix 安装报 not a zip file 怎么办？

文件是 gzip 格式而非 zip 格式。marketplace 服务器返回 gzip 压缩内容，`curl -L` 未自动解压。用 `gunzip -c file.vsix.gz > file.vsix` 解压后再安装，用 `file` 命令可以确认格式。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
