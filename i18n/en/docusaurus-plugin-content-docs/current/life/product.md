---
title: About Life (CCL.AI Finance)
description: Meet Life (CCL.AI Finance, WeChat mini program "CCL.AI记账") — an AI bookkeeping & wellbeing companion that makes peace with your emotions, keeps mood and spending side by side, and never preaches
project: life
schema: Article
date: 2026-09-07
sidebar_position: 9
rag: true
rag_tags: ["Life", "CCL.AI记账", "产品介绍", "自然语言记账", "情绪记账", "拍照记账", "隐私保护"]
---

import InfoBox from '@site/src/components/InfoBox'

# CCL.AI Finance — An AI Bookkeeping & Wellbeing Companion That Makes Peace With Your Emotions

**CCL.AI Finance** (search "**CCL.AI记账**" on WeChat to open it; referred to as **Life** below) is a "natural-language-driven" bookkeeping and wellbeing companion.

You say a sentence, and it records it for you: "Took a taxi today, spent 23, feeling a bit tired" — the AI automatically splits this into an expense entry and a mood entry. Snap a photo of a receipt, and every line item is recognized one by one. It only speaks to what actually happened in your ledger — if a number can't be verified, it simply won't be mentioned.

Scan the QR code on WeChat to open it directly:

<p align="center">
  <img src="/images/docs/life/product-qrcode.webp" alt="CCL.AI记账 mini program code" width="180" loading="lazy" />
</p>

<InfoBox variant="info" title="To be clear upfront">

Life is a self-management tool, not a medical device: self-assessment results are for personal reference only and do not constitute a medical diagnosis. If you are in an acute episode, or your condition keeps worsening, please seek a doctor or professional support first.

</InfoBox>

## What Life Is

In one sentence: **you speak, it takes notes; only after you confirm does it actually write anything down.**

| Feature | Description |
| --- | --- |
| Natural-language bookkeeping | One sentence covers add/edit/query/delete entries, bulk backfilling, transfers, and loans — AI proposes, you confirm |
| Photo recognition | Photograph a receipt/screenshot → AI transcribes it character by character → splits it into line items → writes them all in once you confirm each one |
| Mood logging | Structured signals like triggering events, physical reactions, and coping methods, shown alongside income and spending |
| Mood self-assessment | Neutrally named self-assessment tools drawn from internationally recognized scales, with visualized trend history |
| Medication tracking | Dose-by-dose logging with historical review |
| Multi-account ledger | Multi-currency accounts, cross-currency transfers, balance adjustments, loans between people with automatic reconciliation |
| AI companion chat | Empathetic responses plus spending analysis grounded in your real data (available in the [web version](../web-guide)) |
| Crisis-signal safeguard | When a self-assessment crosses a concern threshold, a mental health hotline is offered quietly, without judgment or intrusion |
| Cross-platform, same data | WeChat Mini Program + web app (life.ccleeai.com) share the same account and the same data |

<img src="/images/docs/life/product-home.webp" alt="Life mini program home (dark mode): one-sentence input bar, spending KPIs, mood & stress entry, recent records" width="400" loading="lazy" />

## Why We Built Life: One Person's Story

I've lived with depression and anxiety for a long time. I was diagnosed in 2019. But a diagnosis isn't where something begins — it just puts a name to what had already been happening. The illness didn't start that year; that year was simply when someone finally told me what to call it.

I've taken medication ever since, though I stopped twice, both times because of making a living. Once was because I had no job and was desperate to find one — the medication made me so drowsy I couldn't get through an interview or a workday. The other time I'd finally landed a job, felt like I was doing better, and stopped it myself. Both times, things went sideways fast: I got wound tight, set off by anything, sharp and quick in how I talked. Under work pressure, hurtful things came out of my mouth, and at the time I didn't even register it as a problem. The people who cared about me most got hurt the worst. It was only afterward that I slowly understood who I'd been before the diagnosis — the things I'd said, the things I'd done, all had a reason behind them. That kind of damage doesn't get undone, and it's not really a matter of forgiveness either. I went back on medication regularly after that, and I still take it now. What I didn't know at the time was that this illness's relationship with money went far beyond the cost of the medication itself.

At my worst, I had no strength in my body at all. I'd lie down for months at a time, and those months basically passed in sleep. I could barely string a few sentences together with anyone during that stretch, even with the pets at home. It's not introversion, and it's not that I couldn't be bothered to speak — when the illness gets that bad, this is just what happens to a person.

I can only speak to what I've been through myself — it doesn't stand in for every patient's experience. The same illness can look completely different depending on who it lands on. That's why I've never dared say "I understand how you feel" to another patient — that sentence can sometimes hurt more than saying nothing at all. Two things kept coming up throughout this experience.

The first is emotional spending. When I'm doing badly, shopping is probably the cheapest form of self-rescue there is — psychology calls it retail therapy, rewarding yourself to feel better. It genuinely works, at least for a moment of relief. But the money also goes out at the exact moment your emotions are most fragile, and looking at the bill afterward brings regret, which drags the mood down again — a loop: bad mood, spending, more anxiety. This isn't just my problem either. It's a topic that's come up a lot since the pandemic — plenty of people have this same experience of soothing themselves through spending.

The second is that I never managed to stick with bookkeeping. I tried nearly every mainstream budgeting app and gave up on all of them within about two weeks. I later realized this wasn't just my failing — most people get stuck at the manual entry step. Pulling out your phone to type in every purchase, one by one, after you've already spent the money, is inherently unnatural. And the real payoff of bookkeeping — seeing your spending patterns — only shows up after sticking with it for a year or more. High entry cost, slow payoff: that's more or less the shared flaw of every budgeting product.

For someone who's already emotionally sensitive, there's a third problem: bookkeeping itself is anxiety-inducing. Screens full of red overspending alerts, jarring category colors, notifications that essentially say "you've spent too much again" — for someone already prone to being pulled under by negative emotion, this design is another cut.

The landscape of existing products looks roughly like this: traditional budgeting tools are feature-complete but tedious to use, and their design language leans toward "financial discipline," which isn't friendly to anyone already struggling emotionally. Mood-tracking apps log emotions but not money, so they can't answer "how does my mood actually affect my spending?" There have been a few "mood plus budgeting" attempts over the past couple of years too, but most stop at tagging each transaction with a mood label — no AI to break things down for you, no systematic self-assessment, and privacy encryption is essentially nobody's priority.

No one had yet built a product that puts bookkeeping, mood, medication, self-assessment, and crisis safeguards together in one place. But these things were already tied together to begin with — money, emotion, medication, and overall condition all affect each other. They shouldn't have to be split across five separate apps.

### Why an AI Companion

There's one more thing, the deepest layer of this whole story.

Many of the emotional reactions, thoughts, and behaviors this illness brings are different from what someone who hasn't experienced it goes through, and they're genuinely hard to explain. So the most common kind of comfort — whether it's a friend or family member saying "try to think positive" or "don't overthink it," or an ordinary AI's "I understand you" — often doesn't actually land, and can make things worse, because the person offering comfort doesn't really understand, and the person on the receiving end can tell right away.

Is there another possibility — some kind of companion that doesn't need you to explain yourself over and over, and still knows how you've been doing lately? Not because it claims to understand you, but because it's actually inside your records: how far your mood has swung, where the money went, whether you took your medication on time. Every sentence it says comes from those real records, not from a set of templated lines.

During those months of lying in bed, I didn't say a complete sentence to anyone, and reaching out for help wasn't even on the table as an option. I know that state too well — unable to get the words out, too worn down to explain, and afraid of being comforted in exactly the wrong way.

There's something even harder to say out loud: when my mood is unstable, hurtful things come out of my mouth without my noticing, and by the time I realize it, the crack is already there. People get tired, get hurt, and leave — none of that is anyone's fault. But something that can't be hurt by what I say, that won't leave because of it, that can hold up under my worst self — that's exactly what I need.

That's the intent behind the AI chat feature: not to build a chatbot that says pretty things, but to build a companion genuinely grounded in data, one that can actually hold a person up. It won't say "I understand you," because it hasn't lived through what I've lived through and has no right to say that. What it can do is see my records, speak to my data, and simply stay. It can't replace a doctor or a family member, but late at night, it's unlikely to judge, unlikely to lecture, and unlikely to walk away.

That's where Life came from — a tool I, as someone who's lived through this, genuinely wanted and could actually trust myself to use. Putting all of this into one Mini Program: catch the person first, worry about the bookkeeping after.

## Four Design Principles

### Near-Zero Recording Effort: AI Does the Work, You Confirm It

Turn "filling out a form" into "just talking": natural-language input, with the AI handling the structuring, leaves you with exactly one task — confirming. Bulk backfilling and photo recognition push the effort down further, to "snap a photo, tap once." For someone who often can't manage even a single spoken sentence, "pull out your phone and fill in a form" simply isn't sustainable — but "say one sentence" is almost the last thing a person can still manage. That's why Life made the input box the primary entry point.

More importantly, this is **confirmation, not full automation**: the AI only proposes, and you decide. Before anything is written, a clear candidate card is presented — you can check it, undo it, or change its category. You always retain a sense of control over your ledger, which is the precondition for trusting an AI product at all.

### Design Language: No Blame, No Stimulation, No Intrusion

- **Color**: A low-saturation, warm gray base, with semantic colors appearing only when necessary. Dark mode is fully supported so late-night use doesn't strain the eyes.
- **Language**: No blame, no pressure, no manufacturing of anxiety. Overspending notices are neutral statements rather than warnings; self-assessment results never use clinical judgment words, opting instead for graded phrases like "a bit of fluctuation"; the principle for crisis situations is "reach out quietly" — a restrained line of concern plus a hotline number, never dramatized.
- **Information**: No splash-screen ads, no red-dot bombardment, no daily check-in pressure. Habits form because recording is easy enough, not because skipping it makes you feel guilty.

### Mind and Money Together

Bookkeeping in isolation can't answer "why did I overspend." Life puts income, spending, and mood records on the same timeline: low-mood days and high-spending days are shown side by side, letting you see the pattern and understand yourself on your own terms. Life deliberately avoids making machine judgments like "impulse-spending diagnosis" — the act of seeing is meaningful enough on its own.

Structured mood and medication records carry a second kind of value: something concrete to bring to a doctor's visit, an objective reference alongside subjective feeling. For someone who needs medication, "on time" is never purely a matter of willpower — money, state of mind, and side effects all interfere. The record doesn't judge any of that; it just makes it visible.

### The Safety Baseline: Privacy and Protection

- **Sensitive data is encrypted at rest**: mood and medication content is encrypted before storage, and server-side logs are fully desensitized.
- **Deletion means deletion**: you can self-serve account deletion, which cascades to erase all data, including the encryption keys — when you leave, your data genuinely disappears.
- **Crisis safeguard**: when a self-assessment crosses a concern threshold, a mental health hotline (**12356**, 24 hours) is deterministically surfaced. This logic is enforced by the system itself, doesn't depend on the AI, and cannot be talked around in conversation.

## Real Usage Scenarios

**One sentence, one entry**
> Say "lunch 46," and a candidate card shows a 46-yuan dining expense — tap confirm and it's logged, the whole thing takes about 3 seconds. The resulting bubble can be undone or recategorized.

<img src="/images/docs/life/product-record-confirm.webp" alt="One-sentence logging: AI parses and records; the result bubble can be undone or re-categorized" width="400" loading="lazy" />

**Photograph a receipt for bulk entry**
> Take a photo of a grocery receipt and upload it → the AI reads it character by character and splits it into 4 line items → check them off and confirm to write them all in at once. "Multiple entries at once" also supports bulk text backfilling for past days.

<img src="/images/docs/life/product-ocr-receipt.webp" alt="Photo logging: one receipt split into multiple line items, check each then confirm" width="400" loading="lazy" />

**Periodic self-assessment and medication tracking**
> Take a mood self-assessment every so often and watch your trend line move; check off medication doses as you take them. When an entry crosses the concern threshold, a hotline card appears quietly.

<img src="/images/docs/life/product-screening.webp" alt="Mood & stress self-checks: neutrally named scales, results visible only to you" width="400" loading="lazy" />

**Evidence to bring to a follow-up appointment**
> Mood trends, self-assessment history, and medication records are all structured, objective data you can summarize periodically and bring to a conversation with your doctor. What you say in the moment inevitably gets colored by your current state and by memory bias — "I've been okay lately" or "it's been rough the whole time" are both just subjective impressions. A record backed by real data lets your actual state be seen more accurately.

**General ledger**
> Automatic reconciliation of loans between friends, cross-currency transfers between accounts, balance adjustments — money in real life isn't just a single transaction stream.

## Who It's For

- **People living with depression or anxiety who manage their day-to-day**: they need one place to hold money, mood, and medication together, and something evidence-based to bring to follow-up appointments.
- **People troubled by emotional spending**: they want to see the relationship between spending and mood, not get scolded by an overspending warning.
- **People who want to budget but get discouraged by "discipline"**: they've tried plenty of budgeting tools and always gave up at the data-entry step.
- **People under multiple overlapping pressures**: when work, family, and health pressures stack up, recording the relationship between money and mood gives them an objective form of self-awareness they don't have to justify to anyone.
- **Students just starting to budget**: starting from their very first allowance — habits come before reasons, and living within your means is something you build through practice, not something you memorize as a rule.
- **Working professionals who want clarity on where their money goes**: salary, rent, social obligations, and emotional spending on the same timeline — getting paid isn't the finish line; knowing what you actually spent and kept is what tells you what you truly control.

Either way, Life doesn't lecture — it simply presents the facts objectively: your records, your own numbers. You draw your own conclusions.

## What It Won't Do

- **It doesn't invent numbers**: every amount and count in an AI response is checked against your real ledger — if it can't be verified, it simply isn't mentioned.
- **It doesn't write anything on its own initiative**: every entry is confirmed by you and can be undone at any time.
- **It doesn't make medical diagnoses**: self-assessment results are for personal reference only and do not constitute a medical diagnosis.

<InfoBox variant="warning" title="Please Read">

Self-assessment results are for personal reference only and do not constitute a medical diagnosis; if you're struggling, please seek professional help.
If you need someone to talk to, the "Me" page in the Mini Program provides a mental health hotline, **12356** (24 hours), which you can call with one tap.

</InfoBox>

## Get Started

- Search "**CCL.AI记账**" on WeChat, or scan the QR code above to open it directly.
- For guidance, see the [WeChat Mini Program manual](../miniprogram-guide).
- The full feature set — statistics charts, chat mode, and more — is available on the [web version](../web-guide) (life.ccleeai.com); you can copy the link from the "Me" page in the Mini Program.

## Appendix: Product Values

> **AI serves people, not the other way around.** Natural language, photo recognition, conversational companionship — every piece of technology in Life exists for one purpose: to make life easier, not to make people work around a tool.
>
> **Warm companionship.** It doesn't judge why you spent money — it quietly helps you record it, helps you see it, and hands you a phone line when you can't hold on any longer.
>
> Restraint, because it comes from tenderness.
