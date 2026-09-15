---
title: "CCLEE OSS 阿里云 RAM 子账号配置指南：最小权限 AccessKey"
description: "CCLEE OSS 插件阿里云 RAM 子账号最小权限配置指南：创建仅限指定 Bucket 写入删除的策略并生成 AccessKey，全程约 10 分钟，附策略 JSON 与插件填写对照表。"
project: cclee-oss
schema: HowTo
steps:
  - name: 创建权限策略
    text: 脚本编辑粘贴 JSON，替换为你的 Bucket 名
  - name: 创建用户并生成 AccessKey
    text: 仅勾 OpenAPI 调用访问，立即保存密钥
  - name: 给用户授权
    text: 添加自定义策略 cclee-oss-minimal
  - name: 填入插件
    text: 在 设置 → CCLEE OSS 填入密钥与 Bucket 信息
rag: true
rag_tags: ["WordPress", "阿里云OSS", "RAM 子账号", "AccessKey", "最小权限"]
---

# cclee-oss 阿里云 RAM 子账号配置指南

> 适用：站点管理员 ｜ 全程约 10 分钟
> 策略为最小权限：仅允许向你的一个 Bucket 写入/删除对象，不涉及账号下其他资源

## 开始前

1. 已有 Bucket。没有就在 OSS 控制台创建一个，**读写权限选「公共读」**，记下 Bucket 名和地域
2. 能登录 ram.console.aliyun.com 的账号

## 第一步：创建权限策略

RAM 控制台 → **权限管理 → 权限策略 → 创建权限策略** → 页签切到「**脚本编辑**」，粘贴下方 JSON，把两处 `<bucket>` 替换为你的 Bucket 名：

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

单击「继续编辑基本信息」→ 名称填 `cclee-oss-minimal` → 「确定」。

> 点了「高级策略优化」不必担心：JSON 样子会变，权限不变。
> 不想粘 JSON 也可用「可视化编辑」：服务选对象存储 OSS，勾选 PutObject、DeleteObject 两个操作，资源逐条添加上面两条 ARN，其余相同。

## 第二步：创建用户并生成 AccessKey

1. RAM 控制台 → **身份管理 → 用户 → 创建用户**
2. 登录名称填 `cclee-oss`；访问方式**只勾「OpenAPI 调用访问」**
3. 创建完成后**立即保存 AccessKey ID 和 Secret**（Secret 只显示这一次）

## 第三步：给用户授权

用户列表 → 找到 `cclee-oss` → 操作列「**添加权限**」→ 资源范围「账号级别」→ 「自定义策略」页签勾选 `cclee-oss-minimal` → 确定。

## 第四步：填入插件

WordPress 后台 → **设置 → CCLEE OSS**，填入：

| 设置项 | 内容 |
|--------|------|
| Access Key ID / Secret | 第二步保存的密钥 |
| Bucket | 你的 Bucket 名 |
| Endpoint | Bucket 的公网 endpoint，如 `oss-cn-hangzhou.aliyuncs.com` |
| CDN 域名 | 可选，留空则用 Bucket 公网域名 |

保存后上传一张测试图片，前台图片 URL 已指向 OSS 域名即为成功。
