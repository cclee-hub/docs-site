---
title: Life — AI Money & Mood Journal
description: Journal by just saying it - track expenses, mood, and medication in one chat-style input, with end-to-end encryption
sidebar_position: 1
project: life
schema: Article
date: 2026-08-30
rag: true
rag_tags: ["Life", "Money Journal", "Natural Language Tracking", "Personal Finance", "Mood Journal", "Medication Log", "Privacy"]
---

import { ZapIcon, ShieldIcon, MessageCircleIcon } from '@site/src/components/Icons'
import InfoBox from '@site/src/components/InfoBox'

# Life — AI Money & Mood Journal

Life is a journaling app where you just say it: expenses, mood, medication, and to-dos all go into one chat-style input. AI understands what you say and turns it into structured records — no forms, no spreadsheets.

<InfoBox variant="info" title="Current Status">

Life is in a **limited beta** (invitation only), web only, at [life.ccleeai.com](https://life.ccleeai.com). An international edition is planned.

</InfoBox>

## What It Does

| Area | Description |
|------|-------------|
| Expenses & Budget | Log income/expenses in one sentence — AI extracts amount, date, category, and account; budgets supported |
| Accounts & Transfers | Balances across accounts at a glance, transfers between accounts, balance adjustments |
| Lending & Borrowing | A ledger per person; repayments are auto-settled, outstanding balances always visible |
| Mood Journal | Record daily mood and physical state, with optional PHQ-9 / GAD-7 self-screening |
| Medication Log | Track medication over time |
| To-dos | Jot down things to do without leaving the chat |

Also included:

- **Multi-currency**: CNY / USD / EUR / JPY / HKD / TWD — recorded in the currency you mention, stats grouped per currency, **no exchange-rate conversion**
- **Batch operations**: log or update many records in one sentence, with a preview before anything is applied
- **Chat mode**: beyond bookkeeping — ask "how much did I spend this month?", or talk through spending and mood topics

## Why You Can Trust Life With Your Data

<InfoBox variant="success" title="Privacy by Design">

- Sensitive fields (notes, mood entries, medication, conversations) are encrypted with a **unique per-account key** before they ever touch the database — only ciphertext is stored
- Deleting your account = **cryptographic erasure**: the key is destroyed too, so nothing can ever be decrypted again
- System logs are sanitized and never contain your content

</InfoBox>

See [Privacy & Data Security](./privacy-security).

## Documentation

- [Quick Start](./quick-start): sign in and log your first entry
- [Feature Guide](./feature-guide): detailed usage for every area
- [Privacy & Data Security](./privacy-security)
- [FAQ](./faq)
- [Updates](./updates)
