---
title: 快速入门
slug: quick-start
sidebar_position: 2
schema: HowTo
rag: true
rag_tags: ["入门", "注册", "API Key", "Agent", "对话"]
---

本指南帮助您从注册到完成第一次对话。

---

## 本章内容

- [注册与登录](#1-注册与登录)
- [首次使用流程](#2-首次使用流程)
- [Dashboard 概览](#3-dashboard-概览)
- [API Key 管理](#4-api-key-管理)
- [创建与配置 Agent](#5-创建与配置-agent)
- [开始对话](#6-开始对话)

---

## 1. 注册与登录

1. 访问 [https://ai.ccleeai.com](https://ai.ccleeai.com)
2. 使用邮箱注册或第三方登录（Google/GitHub 登录）
3. 邮箱验证后，即可使用邮箱密码登录

---

## 2. 首次使用流程

登录后，请按以下顺序完成配置：

```
步骤 1: 添加 API Key → 步骤 2: 创建 Agent → 步骤 3: 开始对话
```

| 步骤 | 操作 | 入口位置 |
|------|------|----------|
| 1. 添加 API Key | 配置 LLM 供应商的 API Key | Settings → API Keys |
| 2. 创建 Agent | 创建你的第一个 AI 助手 | Dashboard → 创建 Agent |
| 3. 开始对话 | 点击 Agent 卡片进入聊天 | Dashboard → Agent 列表 |

> ⚠️ **重要**：必须先添加 API Key，否则 Agent 无法运行。

---

## 3. Dashboard 概览

Dashboard 是登录后的首页，包含以下区域：

### 3.1 快速统计

页面顶部显示：
- Agent 数量
- 最近任务数
- API Key 数量

### 3.2 最近任务

页面中部显示所有 Agent 的最近任务列表，方便快速了解活动情况。

### 3.3 Agent 列表

页面下部显示你创建的所有 Agent：
- 点击 Agent **卡片** → 进入聊天页面
- 点击卡片上的**设置图标** → 进入 Agent 设置
- 点击**删除** → 删除该 Agent

### 3.4 欢迎引导（新用户）

如果你是首次登录且没有 Agent，会显示欢迎引导：
- 显示快速开始步骤
- 提示先添加 API Key
- 提供"创建 Agent"快捷入口

---

## 4. API Key 管理

### 4.1 为什么需要 API Key？

Agent 需要调用 LLM（大语言模型）来响应你的请求。你需要提供对应供应商的 API Key 才能使用。

### 4.2 如何获取 API Key？

| 供应商 | 获取地址 |
|--------|----------|
| Anthropic | https://console.anthropic.com |
| OpenAI | https://platform.openai.com/api-keys |
| Google (Gemini) | https://aistudio.google.com/apikey |
| DeepSeek | https://platform.deepseek.com |
| Qwen (通义千问) | https://dashscope.console.aliyun.com |
| Zhipu (智谱) | https://open.bigmodel.cn |

### 4.3 添加 API Key

1. 点击左侧边栏「**Settings**」→「**API Keys**」
2. 点击「**Add Key**」按钮
3. 选择供应商，填入 API Key，添加标签（如"工作用"）
4. 点击保存，Key 会被加密存储

### 4.4 安全说明

- API Key 采用 Fernet 加密存储
- 永远不会以明文形式传输或显示
- 可随时添加/删除

---

## 5. 创建与配置 Agent

### 5.1 创建 Agent

1. 在 Dashboard 点击「**Create Agent**」按钮
2. 填写配置：
   - **名称**： Agent 的显示名称（必填）
   - **LLM 供应商**： 选择 AI 模型供应商
   - **模型**： 选择具体模型
   - **API Key**： 选择要使用的 API Key
   - **技能**： 绑定预定义技能（可选）
   - **风险等级**： 工具调用的确认级别
3. 点击「**Create Agent**」完成创建

### 5.2 可用的 LLM 供应商

| 供应商 | 模型示例 | 特点 |
|--------|----------|------|
| Anthropic | Claude 3.5/3.7/4 系列 | 推理能力强 |
| OpenAI | GPT-4o/4.1/4.5 | 通用性好 |
| Gemini | Gemini 1.5/2.0/2.5 | 多模态支持 |
| DeepSeek | DeepSeek-V3/DeepSeek-Reasoner | 性价比高 |
| Qwen | Qwen-Turbo/Plus | 中文优化 |
| Zhipu | GLM-4/Plus | 国产大模型 |

### 5.3 风险等级说明

| 等级 | 行为 | 适用场景 |
|------|------|----------|
| `low` | 自动执行所有工具 | 信任的工具环境 |
| `medium` | 中等及以上风险需确认 | 日常使用（推荐） |
| `high` | 所有工具需确认 | 谨慎操作场景 |

**自动确认低风险**：开启「Auto Confirm Low Risk」后，低风险工具将自动执行，无需手动确认。

### 5.4 修改 Agent 配置

1. 在 Dashboard 找到 Agent 卡片
2. 点击卡片上的**设置图标**（齿轮）
3. 修改配置后点击「**Save Changes**」

---

## 6. 开始对话

### 6.1 进入聊天页面

在 Dashboard 点击 Agent **卡片主体**（不是设置图标），即可进入聊天页面。

### 6.2 聊天界面布局

```
┌─────────────────────────────────────────────────────┐
│ 顶栏：Agent 名称 | Memory | Settings                 │
├─────────────────────────────────┬───────────────────┤
│                                 │                   │
│     消息区域                     │   任务历史侧边栏   │
│     （对话内容显示）              │   （最近任务）     │
│                                 │                   │
├─────────────────────────────────┴───────────────────┤
│ 输入框 + 发送/停止按钮                                │
└─────────────────────────────────────────────────────┘
```

### 6.3 发送消息

- 在底部输入框输入内容
- 按 `Enter` 或点击「**Send**」发送
- AI 会实时流式输出响应

### 6.4 停止生成

如需中断 AI 响应：
- 点击输入框右侧的红色「**Stop**」按钮
- AI 将停止生成，已输出的内容会保留

### 6.5 工具调用确认

当 Agent 希望调用风险等级较高的工具时：
1. 对话暂停，弹出确认框
2. 显示工具调用详情
3. 选择「**Confirm**」允许或「**Cancel**」拒绝

---

## 下一步

恭喜完成首次对话！接下来可以：

- 📖 [功能指南](../feature-guide) - 了解技能系统、记忆管理等高级功能
- ❓ [帮助与支持](../help-support) - 遇到问题？查看常见问题
