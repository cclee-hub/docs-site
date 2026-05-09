---
title: "Task Stack — 单人多项目任务上下文栈"
description: "跨会话持久化的任务栈工具，push/pop 追踪当前进度，与 Claude Code 深度集成，适合单人多项目开发者"
project: task-stack
schema: Article
date: 2026-05-10
rag: true
rag_tags: ["任务栈", "task-stack", "任务管理", "Claude Code", "开发者工具"]
---

# Task Stack

单人多项目工作者的任务上下文栈。频繁切换项目时，帮你记住"当前在哪、从哪来、该回到哪"。

## 为什么需要它

一个人同时推进多个项目，经常遇到这些问题：

- 切到项目 B 做了个紧急修复，回来忘了项目 A 做到哪
- 关掉终端，上下文全部丢失
- 多个项目并行，脑子里维护一个心理栈，越来越累

Task Stack 把这个"心理栈"外化成命令行工具——`push` 压栈、`pop` 弹栈、`note` 记笔记，数据持久化到本地文件，跨会话不丢失。

## 安装

```bash
npm install -g @cclee/task-stack
```

安装后全局可用 `task` 命令。

## 核心用法

### push — 压入新任务

```bash
task push "build login page"
```

当前任务自动挂起，新任务成为栈顶。适合临时切入一个新任务。

### pop — 完成当前任务，回到上一个

```bash
task pop
```

弹出栈顶任务，自动恢复到前一个任务的上下文。

### note — 给当前任务追加笔记

```bash
task note "need API change for auth"
```

记录关键信息，下次回到这个任务时一眼看到。

### stack — 查看完整任务链

```bash
task stack
```

显示从栈底到栈顶的所有任务，一目了然当前的嵌套深度。

### log — 查看已完成任务

```bash
task log
```

回溯历史，看看完成了哪些任务。

### projects — 管理项目列表

```bash
task projects            # 查看所有项目
task projects add my-app # 添加项目
```

### clear — 清空栈

```bash
task clear
```

一键清空当前所有挂起的任务。

## Claude Code 集成

Task Stack 已注册为 Claude Code 技能，支持自然语言调用：

> "task push build login page"

在 Claude Code 会话中直接说就行，不用手动敲命令。

<InfoBox variant="info" title="与 TodoWrite 搭配使用">

| 场景 | 用什么 |
|------|--------|
| 跨会话追踪"我在哪个项目的哪个任务" | Task Stack |
| 单次会话内的多步骤执行计划 | Claude Code 内置 TodoWrite |

两者各管一层：Task Stack 管大图（跨会话），TodoWrite 管细节（单次会话）。

</InfoBox>

## 数据存储

所有数据存储在 `~/.task-stack.json`，无需配置数据库，卸载即删。
