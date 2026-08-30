---
title: Life 记账助手
description: 自然语言记账健康助手 - 说人话就能记，收支、情绪、服药一起管，端到端加密保护隐私
sidebar_position: 1
project: life
schema: Article
date: 2026-08-30
rag: true
rag_tags: ["Life", "记账", "自然语言记账", "个人财务", "情绪记录", "服药记录", "隐私加密"]
---

import { ZapIcon, ShieldIcon, MessageCircleIcon } from '@site/src/components/Icons'
import InfoBox from '@site/src/components/InfoBox'

# Life 记账助手

Life 是一款「说人话就能记」的记账健康助手：把收支、情绪、服药、待办放进同一个对话式输入框，AI 自动理解并结构化记录——你只需要像发消息一样，说出发生了什么。

<InfoBox variant="info" title="当前状态">

Life 目前为**限量内测**阶段（邀请制），仅提供 Web 端，访问 [life.ccleeai.com](https://life.ccleeai.com)。国际版在计划中。

</InfoBox>

## 它能做什么

| 维度 | 说明 |
|------|------|
| 收支与预算 | 一句话记一笔收入/支出，AI 自动抽取金额、时间、类目、账户；支持预算管理 |
| 账户与转账 | 多账户余额一目了然，账户间转账、余额调整 |
| 借贷往来 | 往来对象台账，借款、还款自动核销，随时查看未结金额 |
| 情绪记录 | 记录情绪与身体状态，可选 PHQ-9 / GAD-7 自评筛查 |
| 服药记录 | 记录服药情况，长期追踪 |
| 待办 | 顺手记下要做的事 |

其他能力：

- **多币种**：支持 CNY / USD / EUR / JPY / HKD / TWD，按原话币种记录，统计按币种分组、不做汇率换算
- **批量操作**：一句话批量记账、批量修改，执行前先预览影响范围
- **聊天模式**：不只记账，还能问「这个月花了多少」，或聊聊收支、情绪方面的话题

## 为什么放心把数据交给 Life

<InfoBox variant="success" title="隐私设计">

- 敏感字段（收支备注、情绪内容、服药、对话等）使用**每个账号独立的数据密钥**加密后再存储，数据库中只有密文
- 注销账号 = 数据的**密码学擦除**，密钥一并销毁，不可恢复
- 系统日志全程脱敏，不记录你的原文

</InfoBox>

详见[隐私与数据安全](./privacy-security)。

## 文档导航

- [快速开始](./quick-start)：注册登录、记下第一笔
- [功能指南](./feature-guide)：各维度功能的详细用法
- [隐私与数据安全](./privacy-security)
- [常见问题](./faq)
- [更新日志](./updates)
