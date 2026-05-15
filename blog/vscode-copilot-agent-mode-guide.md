---
title: 启用 VSCode Copilot Agent Mode 实现自动化编程
description: 详解 VSCode Copilot Agent Mode 的启用方法、工作原理与最佳实践，让 AI 自动执行多步骤编程任务
date: 2026-03-15
tags: [VSCode, Copilot, Agent, AI编程]
authors: [cclee]
schema: Article
---

## TL;DR

VSCode Copilot Agent Mode 是实验性功能，能让 AI 自动执行多步骤任务（包括编辑文件、运行终端命令）。在 `settings.json` 中添加 `"github.copilot.chat.agent.enabled": true` 即可启用，适合处理重复性重构、批量文件修改等场景。


<!-- truncate -->
## 问题现象

传统 Copilot Chat 只能建议代码片段，每次都要：
1. 手动复制代码
2. 切换到目标文件
3. 粘贴并调整
4. 重复以上步骤

遇到需要修改多个文件的任务时，这种模式效率极低。

## 根因

Copilot 的 **Ask Mode** 设计为「建议者」角色：只输出代码，不执行操作。这是安全设计，但对于信任 AI 的开发者来说，增加了大量手动操作。

**Agent Mode** 则是「执行者」角色：AI 可以直接编辑文件、运行命令，实现真正的自动化编程。

## 解决方案

### 1. 启用 Agent Mode

在 VSCode `settings.json` 中添加：

```json
{
  "github.copilot.chat.agent.enabled": true
}
```

或在设置界面搜索 `@id:github.copilot.chat.agent.enabled` 勾选启用。

### 2. 切换到 Agent Mode

在 Copilot Chat 面板中，点击模式下拉框，从「Ask」切换到「Agent」：

```
┌─────────────────────────────┐
│  Ask ▼  │  Agent ▼  │  Edit │
└─────────────────────────────┘
```

### 3. 使用示例

**场景：批量重命名函数**

```
将 src/utils 目录下所有文件中的 getUserName 改为 fetchUserProfile
```

Agent Mode 会自动：
1. 扫描 `src/utils` 目录
2. 找到所有包含 `getUserName` 的文件
3. 逐个修改并保存

**场景：添加 TypeScript 类型**

```
为 src/api/*.ts 中所有导出的函数添加返回类型注解
```

### 4. 工具权限控制

Agent Mode 执行敏感操作前会请求确认。可在设置中调整：

```json
{
  "github.copilot.chat.agent.autoToolConfirmation": {
    "readFile": true,      // 自动允许读文件
    "editFile": false,     // 编辑文件需确认
    "runInTerminal": false // 运行命令需确认
  }
}
```

### 5. 可用工具列表

Agent Mode 可调用以下工具：

| 工具 | 功能 |
|------|------|
| `readFile` | 读取文件内容 |
| `editFile` | 编辑文件 |
| `createFile` | 创建新文件 |
| `deleteFile` | 删除文件 |
| `runInTerminal` | 执行终端命令 |
| `listDirectory` | 列出目录内容 |
| `search` | 搜索代码 |

## FAQ

### Q: Agent Mode 和 Ask Mode 有什么区别？

Ask Mode 只建议代码，需要手动复制粘贴；Agent Mode 可以直接执行文件编辑和终端命令，实现自动化。

### Q: Agent Mode 安全吗？

Agent Mode 在执行敏感操作（如删除文件、运行命令）前会请求确认。建议在版本控制的仓库中使用，便于回滚。

### Q: 为什么找不到 Agent Mode 选项？

确保已安装最新版 Copilot Chat 扩展（v0.15+），并在设置中启用 `github.copilot.chat.agent.enabled`。

### Q: Agent Mode 能执行哪些终端命令？

理论上可以执行任何命令，但建议用于安全的开发命令（如 `npm install`、`npm run build`），避免执行删除、部署等高风险操作。
