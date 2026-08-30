---
title: Privacy & Data Security
description: How Life protects your data - per-account key encryption, cryptographic erasure on deletion, sanitized logs
sidebar_position: 4
project: life
schema: Article
date: 2026-08-30
rag: true
rag_tags: ["Life", "Privacy", "Data Security", "Encryption", "Account Deletion"]
---

import InfoBox from '@site/src/components/InfoBox'

# Privacy & Data Security

Life holds financial and health data — the most personal kind. We treat protecting it as a design constraint, not a feature.

## What We Store

- **Account info**: your phone number (for sign-in verification)
- **What you type**: expense/income records, mood and screenings, medication, to-dos, accounts and contacts, conversations with AI

Nothing else. No ad tracking.

## Encrypted Storage

- Every account has its own **unique data key**. Sensitive fields (notes, mood entries, medication, conversation text) are encrypted with that key before being written to the database
- The database holds only ciphertext: even if the data files leaked, nothing can be read without your key
- Encryption uses the industry-standard AES-256-GCM

<InfoBox variant="info" title="About AI Processing">

Life uses AI to understand your natural-language input. Processing "this one input" requires sending the relevant text to the AI model. Beyond that, your data is never used for training or shared with third parties for any other purpose.

</InfoBox>

## Deleting Your Account = Cryptographic Erasure

You can delete your account yourself from the "Danger Zone" in settings:

1. Confirm your identity with an SMS code
2. All your data is deleted — every record, conversation, and key
3. Once the key is destroyed, any ciphertext left in backups is **permanently undecryptable**

Deletion is irreversible. Please be sure before you proceed.

## Sanitized Logs

Operational logs keep only technical metadata (timestamps, request IDs). **Your content and amounts are never logged** — we don't need to see your private data to debug.

## Limits of Screening

- Screenings (PHQ-9 / GAD-7) are reference self-assessment tools, meant to help you understand your own state
- **They are not a medical diagnosis or advice**; if you need help, please consult a professional

## Questions?

- Account and data operations: [FAQ](../faq)
- Feature usage: [Feature Guide](../feature-guide)
