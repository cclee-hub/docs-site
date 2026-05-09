---
title: "Task Stack — A Task Context Stack for Solo Multi-Project Work"
description: "A session-persistent task stack tool — push/pop to track progress, integrates with Claude Code, built for solo developers juggling multiple projects"
project: task-stack
schema: Article
date: 2026-05-10
rag: true
rag_tags: ["task stack", "task-stack", "task management", "Claude Code", "developer tools"]
---

# Task Stack

A task context stack for solo developers juggling multiple projects. When you switch contexts frequently, it remembers where you are, where you came from, and where you need to go back to.

## Why You Need It

Working on multiple projects alone, you've probably hit these problems:

- You switch to Project B for an urgent fix, then can't remember where you left off in Project A
- You close your terminal and lose all context
- Juggling multiple projects in your head gets exhausting

Task Stack externalizes that mental stack into a CLI tool — `push` to enter a task, `pop` to return, `note` to jot things down. Data persists to a local file, surviving across sessions.

## Installation

```bash
npm install -g @cclee/task-stack
```

The `task` command is now available globally.

## Core Commands

### push — Enter a new task

```bash
task push "build login page"
```

Your current task is suspended, and the new task becomes the top of the stack. Ideal for temporarily jumping into something new.

### pop — Finish current task, return to previous

```bash
task pop
```

Pops the top task off the stack and restores the previous task's context.

### note — Append a note to current task

```bash
task note "need API change for auth"
```

Capture key details so you see them instantly when you return to this task.

### stack — View the full task chain

```bash
task stack
```

Shows all tasks from bottom to top — see at a glance how deep you're nested.

### log — View completed tasks

```bash
task log
```

Look back at what you've accomplished.

### projects — Manage project list

```bash
task projects            # List all projects
task projects add my-app # Add a project
```

### clear — Clear the stack

```bash
task clear
```

Wipe all pending tasks in one go.

## Claude Code Integration

Task Stack is registered as a Claude Code skill, supporting natural language invocation:

> "task push build login page"

Just say it in a Claude Code session — no need to type commands manually.

<InfoBox variant="info" title="Pairing with TodoWrite">

| Scenario | Use |
|----------|-----|
| Track "which project, which task" across sessions | Task Stack |
| Manage step-by-step execution within a single session | Claude Code's built-in TodoWrite |

Each tool handles one layer: Task Stack for the big picture (cross-session), TodoWrite for the details (single session).

</InfoBox>

## Data Storage

All data is stored in `~/.task-stack.json`. No database setup needed — delete the file to clean up.
