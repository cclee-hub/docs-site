---
title: FAQ
description: Life FAQ - data security, registration, supported currencies, screening limits, data deletion, international edition
sidebar_position: 5
project: life
schema: FAQPage
faqs:
  - q: Is my data safe with Life?
    a: Yes. Sensitive fields (notes, mood, medication, conversations) are encrypted with a unique per-account key before storage — the database holds only ciphertext. Deleting your account destroys the data and the key together, so no leftover ciphertext can ever be decrypted.
  - q: How do I register?
    a: Life is in a limited beta (invitation only). Your phone number must be on the invite list to sign in; public registration is not open yet.
  - q: Which currencies are supported? Do you convert exchange rates?
    a: CNY, USD, EUR, JPY, HKD, and TWD. Amounts are recorded in the currency you mention, never converted; stats and budgets are grouped per currency.
  - q: Is the mood screening a diagnosis?
    a: No. PHQ-9 / GAD-7 screenings are reference self-assessment tools only — not medical diagnosis or advice. If you are struggling, please seek professional help.
  - q: How do I delete all my data?
    a: 'Use "Danger Zone" in settings to delete your account: after SMS verification, all data is deleted and the key destroyed. This is irreversible.'
  - q: Is there a mobile app?
    a: Not yet — Life is web-only at life.ccleeai.com and works well in mobile browsers. An app is planned.
  - q: Is English supported?
    a: The product interface is currently Chinese; an international (English) edition is planned.
rag: true
rag_tags: ["Life", "FAQ", "Data Security", "Registration", "Multi-currency"]
---

import InfoBox from '@site/src/components/InfoBox'

# FAQ

## Is my data safe with Life?

Yes. Sensitive fields (notes, mood, medication, conversations) are encrypted with a unique per-account key before storage — the database holds only ciphertext. Deleting your account destroys the data and the key together, so no leftover ciphertext can ever be decrypted. See [Privacy & Data Security](../privacy-security).

## How do I register?

Life is in a **limited beta** (invitation only). Your phone number must be on the invite list to sign in; public registration is not open yet.

## Which currencies are supported? Do you convert exchange rates?

Six currencies: CNY, USD, EUR, JPY, HKD, and TWD. Amounts are recorded in the currency you mention, **never converted**; stats and budgets are grouped per currency.

## Is the mood screening a diagnosis?

No. PHQ-9 / GAD-7 screenings are reference self-assessment tools that help you understand your own state. **They are not a medical diagnosis or advice.**

<InfoBox variant="warning" title="If You Are Struggling">

Please consider reaching out for professional help — a doctor, counselor, or a local support line.

</InfoBox>

## How do I delete all my data?

Use "Danger Zone" in settings to delete your account: confirm with an SMS code, and the system deletes all your data and destroys the key. Irreversible.

## Is there a mobile app?

Not yet — Life is web-only at [life.ccleeai.com](https://life.ccleeai.com) and works well in mobile browsers. An app is planned.

## Is English supported?

The product interface is currently Chinese; an international (English) edition is planned.

## More

- Feature usage: [Feature Guide](../feature-guide)
- First steps: [Quick Start](../quick-start)
