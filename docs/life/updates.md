---
title: 更新日志
description: Life 记账助手版本更新记录
sidebar_position: 6
project: life
schema: Article
date: 2026-08-30
rag: true
rag_tags: ["Life", "更新日志"]
---

import StatusTag from '@site/src/components/StatusTag'

# 更新日志

## 2026-08 · 限量内测上线

<StatusTag type="info">首次发布</StatusTag>

Web 端（[life.ccleeai.com](https://life.ccleeai.com)）限量内测，邀请制登录。

### 核心功能

- **自然语言记录**：收支、情绪、服药、待办四域，一句话完成记录、查询、修改、删除
- **任务模式 + 聊天模式**：任务操作有确认卡片；聊天模式基于真实数据对话，不编造
- **批量操作**：批量记账、批量修改，执行前预览影响范围
- **歧义确认**：说法模糊时给出候选，不瞎猜
- **纠正示例**：教 AI 你的表达习惯，越用越准

### 账务维度

- **账户**：多账户余额、账户间转账、余额调整
- **借贷往来**：往来对象台账，还款按时间顺序自动核销，未结金额实时可见
- **预算**：类目预算与收支对比
- **多币种**：CNY / USD / EUR / JPY / HKD / TWD，按币种分组、不换汇

### 隐私与安全

- 每账号独立密钥，敏感字段加密存储（AES-256-GCM）
- 自助注销：数据删除 + 密钥销毁，密码学擦除不可恢复
- 系统日志脱敏，不记录业务原文
- PHQ-9 / GAD-7 情绪自评筛查（不构成医疗诊断）
