---
title: "Alibaba Cloud RAM Setup for CCLEE OSS (Minimal AccessKey)"
description: "Create a minimal-permission RAM user for CCLEE OSS on Alibaba Cloud International: a bucket-scoped policy JSON, an AccessKey and a grant."
project: cclee-oss
sidebar_label: RAM User Setup
schema: HowTo
steps:
  - name: Create a policy
    text: Use the JSON editor, paste the policy and replace the bucket name
  - name: Create a user
    text: OpenAPI access only; save the AccessKey immediately
  - name: Grant the permission
    text: Attach the custom policy cclee-oss-minimal
  - name: Fill in the plugin
    text: Enter the keys and bucket under Settings → CCLEE OSS
rag: true
rag_tags: ["WordPress", "Alibaba Cloud OSS", "RAM", "AccessKey", "Least Privilege"]
---

# Alibaba Cloud RAM Setup for CCLEE OSS

> For site admins | About 10 minutes
> Least privilege: the policy only allows writing/deleting objects in one bucket — nothing else in the account is touched

This guide is written for **Alibaba Cloud International** accounts (alibabacloud.com). On a China-site account (aliyun.com)? The steps are identical — use ram.console.aliyun.com (Chinese UI) instead.

## Before You Start

1. An existing bucket. If you don't have one, create it in the OSS console and set read/write permission to **public-read**; note the bucket name and region
2. Access to the RAM console at ram.console.alibabacloud.com

## Step 1: Create a Policy

RAM console → **Permissions → Policies → Create Policy** → switch to the **JSON** tab, paste the JSON below, and replace both `<bucket>` placeholders with your bucket name:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:PutObject", "oss:DeleteObject"],
      "Resource": [
        "acs:oss:*:*:<bucket>",
        "acs:oss:*:*:<bucket>/*"
      ]
    }
  ]
}
```

Click through to the basic info screen, name it `cclee-oss-minimal`, and save.

> If a "policy optimization" prompt appears, don't worry: the JSON may look different, the permissions are unchanged.
> Prefer a visual editor? Select Object Storage OSS as the service, check the PutObject and DeleteObject actions, and add the two ARNs above as resources — everything else is the same.

## Step 2: Create a User and Generate an AccessKey

1. RAM console → **Identities → Users → Create User**
2. Logon name: `cclee-oss`; for access mode select **OpenAPI only** (no console sign-in)
3. **Save the AccessKey ID and Secret immediately** after creation — the Secret is shown only once

## Step 3: Grant the Permission

Users list → find `cclee-oss` → **Add Permissions** in the actions column → scope **Alibaba Cloud account** → **Custom Policy** tab → check `cclee-oss-minimal` → confirm.

## Step 4: Fill in the Plugin

WordPress admin → **Settings → CCLEE OSS**, fill in:

| Setting | Value |
|---------|-------|
| Access Key ID / Secret | The keys saved in Step 2 |
| Bucket | Your bucket name |
| Endpoint | The public endpoint of the bucket's region, e.g. `oss-ap-southeast-1.aliyuncs.com` (Singapore) |
| CDN Domain | Optional; leave empty to use the bucket's public domain |

Save, then upload a test image — if the frontend image URL points to your OSS domain, everything works.
