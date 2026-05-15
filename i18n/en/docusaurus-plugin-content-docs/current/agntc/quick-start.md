---
title: Quick Start
slug: quick-start
sidebar_position: 2
schema: HowTo
rag: true
rag_tags: ["Getting Started", "Register", "API Key", "Agent", "Chat"]
---

This guide helps you go from registration to your first conversation.

---

## In This Guide

- [Register & Login](#1-register--login)
- [First-time Setup](#2-first-time-setup)
- [Dashboard Overview](#3-dashboard-overview)
- [API Key Management](#4-api-key-management)
- [Create & Configure Agent](#5-create--configure-agent)
- [Start Chatting](#6-start-chatting)

---

## 1. Register & Login

1. Visit [https://ai.ccleeai.com](https://ai.ccleeai.com)
2. Register with email or third-party login (Google/GitHub)
3. After email verification, login with your email and password

---

## 2. First-time Setup

After logging in, complete the setup in this order:

```
Step 1: Add API Key → Step 2: Create Agent → Step 3: Start Chatting
```

| Step | Action | Entry Point |
|------|--------|-------------|
| 1. Add API Key | Configure LLM provider's API Key | Settings → API Keys |
| 2. Create Agent | Create your first AI assistant | Dashboard → Create Agent |
| 3. Start Chatting | Click Agent card to enter chat | Dashboard → Agent list |

> ⚠️ **Important**: You must add an API Key first, otherwise Agent cannot run.

---

## 3. Dashboard Overview

Dashboard is the homepage after login, containing these areas:

### 3.1 Quick Stats

Top of page shows:
- Number of Agents
- Recent tasks
- Number of API Keys

### 3.2 Recent Tasks

Middle of page shows recent task list for all Agents, for quick overview of activity.

### 3.3 Agent List

Bottom of page shows all your Agents:
- Click Agent **card** → Enter chat page
- Click **settings icon** on card → Enter Agent settings
- Click **delete** → Delete the Agent

### 3.4 Welcome Guide (New Users)

If you're logging in for the first time with no Agents, a welcome guide appears:
- Shows quick start steps
- Prompts to add API Key first
- Provides "Create Agent" shortcut

---

## 4. API Key Management

### 4.1 Why Do I Need an API Key?

Agents need to call LLM (Large Language Models) to respond to your requests. You need to provide the corresponding provider's API Key to use them.

### 4.2 How to Get an API Key?

| Provider | Get URL |
|----------|---------|
| Anthropic | https://console.anthropic.com |
| OpenAI | https://platform.openai.com/api-keys |
| Google (Gemini) | https://aistudio.google.com/apikey |
| DeepSeek | https://platform.deepseek.com |
| Qwen | https://dashscope.console.aliyun.com |
| Zhipu | https://open.bigmodel.cn |

### 4.3 Add API Key

1. Click "**Settings**" → "**API Keys**" in left sidebar
2. Click "**Add Key**" button
3. Select provider, enter API Key, add label (e.g., "for work")
4. Click save, Key will be encrypted and stored

### 4.4 Security Notes

- API Keys are encrypted with Fernet
- Never transmitted or displayed in plain text
- Can be added/deleted anytime

---

## 5. Create & Configure Agent

### 5.1 Create Agent

1. Click "**Create Agent**" button on Dashboard
2. Fill in configuration:
   - **Name**: Agent display name (required)
   - **LLM Provider**: Select AI model provider
   - **Model**: Select specific model
   - **API Key**: Select API Key to use
   - **Skills**: Bind predefined skills (optional)
   - **Risk Level**: Confirmation level for tool calls
3. Click "**Create Agent**" to complete

### 5.2 Available LLM Providers

| Provider | Model Examples | Features |
|----------|----------------|----------|
| Anthropic | Claude 3.5/3.7/4 series | Strong reasoning |
| OpenAI | GPT-4o/4.1/4.5 | Good versatility |
| Gemini | Gemini 1.5/2.0/2.5 | Multimodal support |
| DeepSeek | DeepSeek-V3/DeepSeek-Reasoner | Cost-effective |
| Qwen | Qwen-Turbo/Plus | Chinese optimized |
| Zhipu | GLM-4/Plus | Domestic LLM |

### 5.3 Risk Level Explanation

| Level | Behavior | Use Case |
|-------|----------|----------|
| `low` | Auto-execute all tools | Trusted tool environment |
| `medium` | Medium+ risk requires confirmation | Daily use (recommended) |
| `high` | All tools require confirmation | Cautious operation scenarios |

**Auto Confirm Low Risk**: After enabling "Auto Confirm Low Risk", low-risk tools will execute automatically without manual confirmation.

### 5.4 Modify Agent Configuration

1. Find Agent card on Dashboard
2. Click **settings icon** (gear) on card
3. Modify configuration and click "**Save Changes**"

---

## 6. Start Chatting

### 6.1 Enter Chat Page

Click Agent **card body** (not settings icon) on Dashboard to enter chat page.

### 6.2 Chat Interface Layout

```
┌─────────────────────────────────────────────────────┐
│ Top bar: Agent Name | Memory | Settings             │
├─────────────────────────────────┬───────────────────┤
│                                 │                   │
│     Message area                │   Task history    │
│     (conversation display)      │   sidebar         │
│                                 │                   │
├─────────────────────────────────┴───────────────────┤
│ Input box + Send/Stop buttons                       │
└─────────────────────────────────────────────────────┘
```

### 6.3 Send Message

- Enter content in bottom input box
- Press `Enter` or click "**Send**" to send
- AI will stream response in real-time

### 6.4 Stop Generation

To interrupt AI response:
- Click red "**Stop**" button on right side of input box
- AI will stop generating, output content is preserved

### 6.5 Tool Call Confirmation

When Agent wants to call a higher-risk tool:
1. Conversation pauses, confirmation popup appears
2. Shows tool call details
3. Choose "**Confirm**" to allow or "**Cancel**" to reject

---

## Next Steps

Congratulations on completing your first conversation! Next you can:

- 📖 [Feature Guide](../feature-guide) - Learn about skills system, memory management, and other advanced features
- ❓ [Help & Support](../help-support) - Having issues? Check the FAQ
