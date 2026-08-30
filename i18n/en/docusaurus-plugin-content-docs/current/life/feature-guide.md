---
title: Feature Guide
description: Life features in detail - natural language journaling, batch operations, accounts and transfers, lending, mood screening, medication
sidebar_position: 3
project: life
schema: Article
date: 2026-08-30
rag: true
rag_tags: ["Life", "Feature Guide", "Natural Language Tracking", "Batch Operations", "Lending", "Mood Screening", "Multi-currency"]
---

import InfoBox from '@site/src/components/InfoBox'

# Feature Guide

Life's core idea is "just say it": you describe, AI records, queries, and summarizes. This page covers every area in detail.

## Natural Language Journaling

Describe it in the home input box — AI extracts the amount, date, category, and account into a confirmation card:

| You say | Life records |
|---------|--------------|
| lunch cost me 32 today | Expense 32 · Food · today |
| paid $20 for lunch | Expense $20 · Food |
| got paid, salary 12,000 | Income 12,000 · Salary |

- **Dates**: colloquial time words like "yesterday", "last Friday"
- **Categories**: auto-assigned, editable on the confirmation card
- **Multi-currency**: recorded in the currency you mention — "spent 200 HKD" and "paid $20" are stored as HKD and USD. Stats are grouped per currency, **never converted** (CNY / USD / EUR / JPY / HKD / TWD)

## Batch Operations

- **Batch logging**: "lunch 30 every weekday last week" creates all entries at once
- **Batch updating**: "change all last week's taxi rides to 20" — Life first shows you exactly which records will be affected and how many; nothing changes until you confirm, and every batch is audit-logged

## Query, List & Filter

- Just ask: "how much did I spend this month?", "how much on food last month?", "what did I buy last week?"
- The list pages support browsing and filtering by time range, keyword, and category
- When your phrasing is ambiguous, AI shows candidates to pick from instead of guessing

## Edit & Delete

- "change yesterday's lunch to 35", "delete the entry I just made"
- When several records look similar, AI lists candidates for you to confirm — no accidental deletions

## Accounts & Transfers

- Maintain accounts in settings (WeChat, Alipay, bank cards); mention one while logging — "paid with Alipay" — and it's linked
- Transfers: "moved 5,000 from my bank card to Alipay" — transfers don't count as income or expense
- Balance adjustments: correct an account to its real balance, adjustment history preserved
- If you don't mention an account, the most recently used one is applied

## Lending & Borrowing

- Keep a ledger per person (family, friends, colleagues); record loans and repayments
- Repayments are settled against the oldest outstanding loan automatically (FIFO), and each person's **outstanding balance** is always visible
- "lent Li 2,000 last month, they paid back 500 today" — two entries, remaining balance computed for you

## Budgets

- Set budgets per category and compare against actual spending
- Overruns are immediately visible on the stats page

## Mood Journal & Screening

- Record daily mood and physical state; over time this builds your mood curve
- Optional **PHQ-9 / GAD-7 self-screening** (from the home page), with results shown by severity level

<InfoBox variant="warning" title="Important">

Screening is a reference self-assessment tool only. **It is not a medical diagnosis or advice.** If you are struggling, please seek professional help.

</InfoBox>

## Medication Log

- Track medication over time
- Mood and medication data are sensitive and stored encrypted (see [Privacy & Data Security](../privacy-security))

## To-dos

- Jot down to-dos mid-conversation; manage them all from the list page

## Corrections

AI won't always guess your habits right. When it misunderstands:

1. Fix the field directly on the record, or
2. Teach it with a correction — tell it what you actually meant

Life remembers your corrections and applies them to similar phrasings later — it gets better the more you use it.

## Two Modes: Task & Chat

| Mode | Purpose |
|------|---------|
| Task mode (default) | Log, query, edit, delete — every operation has a clear confirmation card and result |
| Chat mode | Open conversation about spending, mood, and medication — grounded strictly in your real records, never made up |

## Next Steps

- [Quick Start](../quick-start): haven't logged your first entry yet? Start here
- [Privacy & Data Security](../privacy-security)
- [FAQ](../faq)
