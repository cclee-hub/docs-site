---
title: AI Agent Platform
description: 自然语言驱动的 AI Agent 平台 - 说出来就能做到，不用找开发者
sidebar_position: 1
project: agntc
schema: Article
date: 2026-03-16
rag: true
rag_tags: ["AI Agent", "BYOK", "自然语言", "自动化", "无代码"]
---

import { RocketIcon, ZapIcon, ShieldIcon, BrainIcon, EyeIcon, KeyIcon, LightbulbIcon, MessageCircleIcon } from '@site/src/components/Icons'
import StatusTag from '@site/src/components/StatusTag'

# <RocketIcon size={28} /> AI Agent Platform

说出来就能做到，不用找开发者

<div className="text-center my-6">
  <a href="https://ai.ccleeai.com"
     className="button button--primary button--lg"
     target="_blank"
     rel="noopener noreferrer">
    <ZapIcon size={16} />
    立即体验
  </a>
</div>

## 核心功能

### <MessageCircleIcon size={20} /> 自然语言驱动

- **对话即操作**：用日常语言描述需求，Agent 自动理解并执行
- **零代码门槛**：无需技术背景，非技术业务方也能轻松使用
- **智能纠错**：说错了？直接对话纠正，Agent 实时调整

### <EyeIcon size={20} /> 执行透明

- **实时进度**：每一步执行都实时可见，SSE 流式推送
- **随时叫停**：发现不对劲？一键暂停，完全可控
- **完整日志**：所有操作记录可追溯，便于审计和复盘

### <KeyIcon size={20} /> BYOK（自带 API Key）

- **数据自主**：你的 API Key，你的数据，不经平台服务器
- **成本透明**：直接调用模型，无隐藏费用，用多少付多少
- **多模型支持**：Claude、GPT-4o、DeepSeek、Gemini 随你选

### <ShieldIcon size={20} /> 沙箱安全

- **三层防护**：代码审核 + 运行时沙箱 + 用户授权
- **隔离执行**：插件在独立环境运行，无法访问其他数据
- **权限透明**：安装时明确列出权限，随时可撤销

### <BrainIcon size={20} /> 智能记忆

- **越用越懂你**：自动记住你的偏好和习惯，不用重复交代
- **三层记忆**：会话记忆、短期记忆、长期记忆，按需保留
- **一键清除**：随时查看和删除记忆，数据完全由你掌控

## 为什么选择 AI Agent Platform

### 常见痛点

| 痛点 | 我们的方案 |
|------|-----------|
| 黑盒执行，不知道 Agent 在做什么 | 每一步实时可见，随时叫停 |
| 数据经第三方服务器，不放心 | 你自带 Key，数据不经我们 |
| 计费不透明，月底账单吓一跳 | BYOK，用多少付多少 |
| 配置复杂，需要技术背景 | Chat UI，零门槛 |
| 每次改需求都要找人 | 自己对话就能改 |

**核心价值**：之前每次改需求要花 $300-800 找人，现在 $15/月 自己对话搞定。

## 使用方式

### 快速开始

1. **访问平台**：打开 [ai.ccleeai.com](https://ai.ccleeai.com)
2. **配置 API Key**：在设置中添加你的 API Key（支持 Claude、GPT-4o 等）
3. **开始对话**：用自然语言描述你想做的事
4. **实时查看**：观察 Agent 执行每一步，随时纠正

### 适用场景

- **自动化任务**：数据采集、报表生成、邮件处理
- **业务流程**：审批流程、客户跟进、订单处理
- **数据分析**：市场调研、竞品分析、趋势预测
- **内容创作**：文案生成、翻译、摘要

## 定价

### MVP 阶段

| 方案 | 价格 | 说明 |
|------|------|------|
| Free | $0 | MVP 期间免费使用 |
| BYOK | 自付 | 使用自己的 API Key，按实际调用付费 |

### 后续规划

| 方案 | 价格 | 说明 |
|------|------|------|
| Pro | $12-20/月 | 解锁高级功能，详见后续公告 |

## 常见问题

### 需要技术背景吗？

<StatusTag type="success">不需要</StatusTag>

AI Agent Platform 专为非技术用户设计。你只需要用日常语言描述需求，Agent 会自动理解并执行。

### 我的数据安全吗？

<StatusTag type="success">完全自主</StatusTag>

采用 BYOK 模式，你自带 API Key，数据直接发送到模型提供商，不经过我们的服务器。你可以随时查看、删除自己的数据。

### 支持哪些模型？

<StatusTag type="info">多模型支持</StatusTag>

- Claude（Anthropic）
- GPT-4o（OpenAI）
- DeepSeek
- Gemini（Google）
- 通义千问（阿里云）
- GLM（智谱）

### 与其他 Agent 产品有什么区别？

| 特性 | 本产品 |
|------|--------|
| 执行方式 | 每一步实时可见，随时叫停 |
| 数据路径 | 自带 Key，不经平台 |
| 计费模式 | BYOK，用多少付多少 |
| 使用门槛 | Chat UI，零代码 |
| 修改需求 | 自己对话就能改 |

### 出问题了怎么办？

<StatusTag type="warning">MVP 阶段</StatusTag>

MVP 阶段暂无在线客服，可通过以下方式获取帮助：
- 查看本文档的更新日志
- 发送邮件至技术支持

## 更新日志

详见 [AI Agent 更新日志](/docs/agntc/updates)

---

*AI Agent Platform · 说出来就能做到*
