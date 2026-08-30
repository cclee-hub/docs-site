---
title: Updates
description: Life changelog - version history and release notes
sidebar_position: 6
project: life
schema: Article
date: 2026-08-30
rag: true
rag_tags: ["Life", "Changelog"]
---

import StatusTag from '@site/src/components/StatusTag'

# Updates

## 2026-08 · Limited Beta Launch

<StatusTag type="info">First Release</StatusTag>

Web beta launched at [life.ccleeai.com](https://life.ccleeai.com), invitation-only sign-in.

### Core Features

- **Natural-language journaling**: expenses, mood, medication, and to-dos — log, query, edit, and delete in one sentence
- **Task mode + chat mode**: task operations come with confirmation cards; chat mode answers strictly from your real records
- **Batch operations**: batch logging and batch updating, with a preview of the affected scope before anything is applied
- **Disambiguation**: ambiguous phrasings produce candidates to pick from — no guessing
- **Corrections**: teach AI how you talk; it gets better the more you use it

### Money Features

- **Accounts**: multi-account balances, transfers, balance adjustments
- **Lending & borrowing**: a ledger per person, repayments auto-settled in order, outstanding balances always visible
- **Budgets**: per-category budgets vs. actual spending
- **Multi-currency**: CNY / USD / EUR / JPY / HKD / TWD — grouped per currency, never converted

### Privacy & Security

- Per-account key, sensitive fields encrypted at rest (AES-256-GCM)
- Self-service account deletion: data removal + key destruction, cryptographic erasure
- Sanitized system logs — business content never logged
- PHQ-9 / GAD-7 mood self-screening (not a medical diagnosis)
