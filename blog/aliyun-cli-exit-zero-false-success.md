---
title: "aliyun CLI exit 0 假成功？错误走 stderr，jq 兜底遮住报错"
description: "aliyun CLI 的 API 错误走 stderr 且 exit 0，jq 兜底默认值把失败伪装成空结果致误判重建。调用一律 2>&1 捕获原文判读；DescribeInvocationResults 只认 CommandId。"
date: 2026-11-23
tags: [阿里云, CLI, Shell, 运维]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "jq 解析 aliyun CLI 输出要注意什么？"
    a: "最大的坑是兜底默认值：jq -r '.TotalCount // 0' 在错误响应上会输出 0 而不是报错——错误 JSON 走 stderr 且进程 exit 0，缺 TotalCount 字段时默认值把失败洗成合法的「空结果」。判读 aliyun 调用先用 2>&1 捕获原始响应看原文，确认结构后再上 jq，且禁用 // 默认值当失败探针。"
  - q: "aliyun CLI 报错了为什么命令还返回成功？"
    a: "aliyun CLI 把 API 层错误 JSON 打到 stderr，进程退出码仍是 0——set -e 与 || exit 都拦不住。失败判定必须基于响应内容（错误码/错误消息字段），不能基于 exit code。"
  - q: "DescribeInvocationResults 为什么读不出结果？"
    a: "两个高频原因：层级取错——结果是对象内嵌对象，正确路径是 .Invocation.InvocationResults.InvocationResult[0]，用 .InvocationResults[0] 数组直取会报 Cannot index object with number，其实结果已经在响应里；ID 混用——DescribeInvocationResults 只认 CommandId（c- 前缀），手里只有 InvokeId（t- 前缀）时先 DescribeInvocations --InvokeId 换取。"
---

自动化脚本用 `DescribeCommands` 探测云助手命令是否存在，`jq -r '.TotalCount // 0'` 兜底判读——API 明明报了错，脚本却读到 TotalCount=0，判定「命令不存在」，转身重建了一条重复命令。

在为客户提供 [行业龙头制造企业中国全托管](/cases/waterpark-china-hosting-migration) 时踩到 aliyun CLI 的这组判读坑——云助手自动化是那台服务器巡检与运维的下发通道。

## TL;DR

两层坑叠出同一个假象。第一层：aliyun CLI 的 API 错误 JSON 走 stderr 且进程 exit 0，`set -e` 拦不住；第二层：`jq -r '.TotalCount // 0'` 的兜底默认值把没有 `TotalCount` 字段的错误响应洗成 `0`——「查询失败」被伪装成「查询成功但为空」。收场规则：调用一律 `2>&1` 捕获、先看原始响应原文，禁用 jq 默认值当失败探针；另外 `DescribeCommands` 的参数是单数 `--CommandId`（数组式 `--CommandId.1` 是 `InvokeCommand` 的习惯，搬过来就是参数错误），读结果时 `DescribeInvocationResults` 只认 `CommandId`，层级是对象内嵌对象。

## 问题现象：命令明明创建过，脚本却说它不存在

背景流程是云助手三段式：`CreateCommand` 创建命令拿 `CommandId`，`InvokeCommand` 下发，`DescribeInvocationResults` 回读。脚本在 invoke 前先探测命令对象是否还在：

```bash
# 探测「命令是否存在」的写法（有坑）
resp=$(aliyun ecs DescribeCommands --CommandId.1 "c-xxx" 2>&1)
count=$(echo "$resp" | jq -r '.TotalCount // 0')
[ "$count" -eq 0 ] && aliyun ecs CreateCommand ...   # 判定不存在 → 重建
```

实际运行时这段脚本稳定地走进重建分支：命令上一轮刚创建过，这一轮仍被判「不存在」。而真正拿这个重建出的 `CommandId` 去 invoke 时，还可能撞上 `InvalidCmdId.NotFound`——新命令对象尚未就绪，探测与重建都白做。判读不修，这个循环每周都在烧配额。

## 根因：错误响应 exit 0，jq 默认值把报错洗成空结果

两个独立事实叠加。第一个在 aliyun CLI 侧：API 层出错时，错误 JSON 打印到 **stderr**，进程退出码仍是 **0**——`set -e` 与 `|| exit` 这类基于退出码的防线的不到任何信号。第二个在 jq 侧：`2>&1` 确实把错误 JSON 带进了管道，但它没有 `TotalCount` 字段，`// 0` 兜底便顺势输出 `0`。「API 调用失败」就此被洗成「调用成功、命令数为零」。

`--CommandId.1` 则是第三个独立小坑：数组式参数（`.1` 后缀）是 `InvokeCommand --InstanceId.1` 的写法习惯，`DescribeCommands` 要的是单数 `--CommandId`。参数写错又产生一类新错误响应，继续被同一套兜底判读掩盖。

## 解决方案：先看原文，再上 jq，禁兜底当探针

判读原则就一句：先确认「响应是什么」，再回答「字段是多少」。落地写法是把「无 TotalCount 字段」当成失败，而不是当成零：

```bash
resp=$(aliyun ecs DescribeCommands --CommandId "c-xxx" 2>&1)  # 单数参数，2>&1 捕获

# 无 TotalCount 字段 = API 层失败：打印原文并中止，不用默认值顶替
echo "$resp" | jq -e '.TotalCount' >/dev/null 2>&1 \
  || { echo "API 调用失败：$resp"; exit 1; }

count=$(echo "$resp" | jq -r '.TotalCount')
[ "$count" -eq 0 ] && aliyun ecs CreateCommand ...   # 到这里才是可信的「不存在」
```

`jq -e '.TotalCount'` 在字段缺失时非零退出——它替代 `// 0`，把「读不到字段」升格为显式失败。原始响应 `$resp` 随错误一起打出来，人看一眼就知道是参数错还是服务端错。

补充一条边界：`CreateCommand` 返回 `CommandId` 不代表对象已可用，invoke 可能报 `InvalidCmdId.NotFound` 而 `DescribeCommands` 查到的 `TotalCount` 已是 1。所以重建之后先验存在再 invoke，NotFound 就重建——探测本身用上面的原文判读，别再叠一层兜底。

## 读结果的第二坑：层级取错与两个 ID

回读侧同样有静默失败。`DescribeInvocationResults` 的结果是对象内嵌对象，正确路径是：

```bash
jq -r '.Invocation.InvocationResults.InvocationResult[0].Output' \
  <<< "$resp" | base64 -d
```

用数组直觉去写 `.InvocationResults[0]` 会报 `Cannot index object with number`——报错出现在读法上，结果实际已经在响应里。另一个混淆源是 ID 体系：`InvokeCommand` 返回的是 `InvokeId`（`t-` 前缀），`DescribeInvocationResults` 只认 `CommandId`（`c-` 前缀）；手里只剩 InvokeId 时，先 `DescribeInvocations --InvokeId` 换取。轮询回读时，终态只匹配 `Success` 与 `Failed` 两态，下发后留 ~10 秒再取。

云助手的坑是成套的：下发内容会被损坏（heredoc 拼装）、后台任务会被清杀（nohup），分别见 [阿里云云助手下发文件损坏？RunCommand 别用 heredoc 拼代码](/blog/aliyun-runcommand-heredoc-parse-error) 与 [阿里云云助手后台任务被清杀？nohup 不够，要 setsid 脱离会话](/blog/aliyun-cloud-assistant-nohup-setsid)。

<InfoBox variant="warning" title="注意事项">

- aliyun CLI 调用一律 `2>&1` 捕获后判读，退出码不可信（错误也 exit 0）。
- jq 禁用 `// 默认值` 当失败探针——字段缺失应显式失败，不是默认成零。
- `DescribeCommands` 用单数 `--CommandId`；数组式 `.1` 后缀属于 `InvokeCommand` 的参数习惯。
- `DescribeInvocationResults` 只认 `CommandId`；层级是 `.Invocation.InvocationResults.InvocationResult[0]`。

</InfoBox>

## 常见问题

### jq 解析 aliyun CLI 输出要注意什么？

最大的坑是兜底默认值：jq -r '.TotalCount // 0' 在错误响应上会输出 0 而不是报错——错误 JSON 走 stderr 且进程 exit 0，缺 TotalCount 字段时默认值把失败洗成合法的「空结果」。判读 aliyun 调用先用 2>&1 捕获原始响应看原文，确认结构后再上 jq，且禁用 // 默认值当失败探针。

### aliyun CLI 报错了为什么命令还返回成功？

aliyun CLI 把 API 层错误 JSON 打到 stderr，进程退出码仍是 0——set -e 与 || exit 都拦不住。失败判定必须基于响应内容（错误码/错误消息字段），不能基于 exit code。

### DescribeInvocationResults 为什么读不出结果？

两个高频原因：层级取错——结果是对象内嵌对象，正确路径是 .Invocation.InvocationResults.InvocationResult[0]，用 .InvocationResults[0] 数组直取会报 Cannot index object with number，其实结果已经在响应里；ID 混用——DescribeInvocationResults 只认 CommandId（c- 前缀），手里只有 InvokeId（t- 前缀）时先 DescribeInvocations --InvokeId 换取。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
