---
title: Enable VSCode Copilot Agent Mode for Automated Programming
description: A practical guide to VSCode Copilot Agent Mode - how to enable it, how it works, and best practices for automating multi-step coding tasks
date: 2026-03-15
tags: [VSCode, Copilot, Agent, AI Coding]
schema: Article
---

## TL;DR

VSCode Copilot Agent Mode is an experimental feature that lets AI automatically execute multi-step tasks (including editing files and running terminal commands). Enable it by adding `"github.copilot.chat.agent.enabled": true` to your `settings.json`. Perfect for repetitive refactoring and batch file modifications.


<!-- truncate -->
## Problem

Traditional Copilot Chat only suggests code snippets, requiring you to:
1. Manually copy the code
2. Switch to the target file
3. Paste and adjust
4. Repeat for each change

This workflow becomes extremely inefficient when modifying multiple files.

## Root Cause

Copilot's **Ask Mode** is designed as a "suggester": it outputs code but doesn't execute actions. This is a safety feature, but for developers who trust AI, it adds significant manual overhead.

**Agent Mode** acts as an "executor": AI can directly edit files and run commands, enabling true automated programming.

## Solution

### 1. Enable Agent Mode

Add to VSCode `settings.json`:

```json
{
  "github.copilot.chat.agent.enabled": true
}
```

Or search for `@id:github.copilot.chat.agent.enabled` in Settings and check the box.

### 2. Switch to Agent Mode

In the Copilot Chat panel, click the mode dropdown and switch from "Ask" to "Agent":

```
┌─────────────────────────────┐
│  Ask ▼  │  Agent ▼  │  Edit │
└─────────────────────────────┘
```

### 3. Usage Examples

**Scenario: Batch Rename Function**

```
Rename getUserName to fetchUserProfile in all files under src/utils
```

Agent Mode will automatically:
1. Scan the `src/utils` directory
2. Find all files containing `getUserName`
3. Modify each file and save

**Scenario: Add TypeScript Types**

```
Add return type annotations to all exported functions in src/api/*.ts
```

### 4. Tool Permission Control

Agent Mode requests confirmation before executing sensitive operations. Adjust in settings:

```json
{
  "github.copilot.chat.agent.autoToolConfirmation": {
    "readFile": true,      // Auto-allow file reading
    "editFile": false,     // Require confirmation for edits
    "runInTerminal": false // Require confirmation for commands
  }
}
```

### 5. Available Tools

Agent Mode can call these tools:

| Tool | Function |
|------|----------|
| `readFile` | Read file contents |
| `editFile` | Edit files |
| `createFile` | Create new files |
| `deleteFile` | Delete files |
| `runInTerminal` | Execute terminal commands |
| `listDirectory` | List directory contents |
| `search` | Search code |

## FAQ

### Q: What's the difference between Agent Mode and Ask Mode?

Ask Mode only suggests code, requiring manual copy-paste; Agent Mode can directly execute file edits and terminal commands for automation.

### Q: Is Agent Mode safe?

Agent Mode requests confirmation before sensitive operations (like deleting files or running commands). Always use it in version-controlled repositories for easy rollback.

### Q: Why can't I find the Agent Mode option?

Ensure you have the latest Copilot Chat extension (v0.15+) and enable `github.copilot.chat.agent.enabled` in settings.

### Q: What terminal commands can Agent Mode execute?

Theoretically any command, but stick to safe development commands (like `npm install`, `npm run build`). Avoid high-risk operations like deletions or deployments.
