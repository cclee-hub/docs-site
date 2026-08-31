---
title: "Life Enters Limited Beta: A Money & Mood Journal You Just Talk To"
description: "Bookkeeping shouldn't feel like paperwork. Life puts expenses, mood, medication, and to-dos into one chat-style input — say it in a sentence and it's logged. Sensitive data is encrypted with a unique key per account; deleting your account means cryptographic erasure. Limited beta, web only."
date: 2026-08-30
tags: [Product Launch, AI App, Natural Language, Privacy]
authors: [cclee]
schema: Article
---

Anyone who has kept a journal of expenses knows: the hard part isn't logging, it's sticking with it. Open the app, find the form, pick a category, type the amount, save — every step talks you out of it. Mood and medication notes are even more scattered: by the time you remember, the moment has passed.

Life's answer: **just say it, like a text message**.

- "lunch cost me 32 today" → a Food expense with amount, date, and category already in place
- "lent Li 2,000 last month, they paid back 500 today" → a ledger entry, outstanding 1,500 computed for you
- "how much did I spend on food this month?" → no list-digging, just ask

👉 **Try Life**: [life.ccleeai.com](https://life.ccleeai.com) ｜ **Documentation**: [aidevhub.ai/docs/life](/docs/life)

<!-- truncate -->

## What It Covers

| Area | Capability |
|------|------------|
| Expenses & Budget | One-sentence logging, category budgets vs. actuals |
| Accounts & Transfers | Multi-account balances, transfers, balance adjustments |
| Lending & Borrowing | A ledger per person, repayments auto-settled (FIFO), live outstanding balances |
| Mood Journal | Mood and physical state, mood curve, optional PHQ-9 / GAD-7 self-screening |
| Medication Log | Long-term tracking |
| To-dos | Jotted down mid-conversation |

Multi-currency (CNY / USD / EUR / JPY / HKD / TWD) is recorded in the currency you mention — "spent 200 HKD" and "paid $20" are kept as-is and grouped per currency, **never converted**. The ledger stays honest.

## Design Decisions Worth Mentioning

**Natural language → structure: offer candidates, never decide for you.** Intent routing with confirmation cards: parsed results are shown for your review; ambiguous phrasings produce candidates to pick from instead of a guess silently written into your ledger. When it gets it wrong, you can teach it — corrections accumulate into your personal phrasing habits, and it gets better over time.

**Batch operations preview before they act.** "Change all last week's taxi rides to 20" first tells you which records will be affected and how many; nothing changes until you confirm, and every batch is audit-logged.

**Chat mode is grounded.** When you talk through spending or mood, answers come strictly from your real records — if it's not in there, it says so, never makes things up.

**Privacy is a design constraint, not a toggle.** Every account gets its own data key; sensitive fields (notes, mood, medication, conversations) are encrypted with AES-256-GCM before they touch the database — only ciphertext is stored. Deleting your account destroys the data and the key together: ciphertext left in any backup becomes permanently undecryptable. System logs are sanitized and never contain your content.

## Limited Beta

Life is currently in an **invitation-only beta**: your phone number must be on the invite list to sign in; public registration isn't open yet. Web only for now — an app and an international (English) edition are planned.

- Product: [life.ccleeai.com](https://life.ccleeai.com)
- Docs: [Quick Start](/docs/life/quick-start) ｜ [Feature Guide](/docs/life/feature-guide) ｜ [Privacy & Data Security](/docs/life/privacy-security) ｜ [FAQ](/docs/life/faq)

> Mood screening is a reference self-assessment tool only — not a medical diagnosis or advice. If you are struggling, please seek professional help.
