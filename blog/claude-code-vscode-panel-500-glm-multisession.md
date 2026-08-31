---
title: "VS Code 里 Claude Code 面板无响应或报 500？GLM 多会话拒绝的排查与解法"
description: "Claude Code 的 VS Code 扩展面板发消息无响应、报 500 overloaded_error 1234，终端却正常——根因是扩展激活后只有第一个会话被网关放行，附排查方法与解法"
date: 2026-08-31
tags: [Claude Code, VS Code, GLM, WSL]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 Claude Code 的 VS Code 扩展面板发消息一直无响应？"
    a: "扩展每次激活后只有第一个后端会话被网关正常放行，之后新建的会话请求会被拒绝。Reload Window 后只用第一个对话即可恢复。"
  - q: "GLM 接入 Claude Code 后终端正常、VS Code 面板报 500 是什么原因？"
    a: "不是配置问题。GLM 网关用 500 overloaded_error(code 1234) 拒绝扩展的非首个会话请求，同一账号终端请求不受影响。"
  - q: "500 [1234] 网络错误是 GLM Coding Plan 限流吗？"
    a: "不是。终端同时段能正常调用说明额度正常，这是扩展多会话请求被网关按过载码拒绝，等待官方修复即可。"
---

在 VS Code 扩展面板给 Claude Code 发消息时，面板长时间转圈无响应，最终报 `API Error: 500 [1234][网络错误，请稍后重试]`——而同一时刻终端里的 `claude` 完全正常。这篇文章记录这次排查的完整过程和结论。

<!-- truncate -->

## TL;DR

这是 Claude Code VS Code 扩展的多会话 bug（[anthropics/claude-code#82197](https://github.com/anthropics/claude-code/issues/82197)）：**扩展每次激活后只有第一个后端会话正常，之后新建的会话请求会被 GLM 网关以 `overloaded_error`(code 1234) 拒绝**。

立即恢复：`Ctrl+Shift+P` → **Reload Window** → 只用恢复出来的第一个对话。配置层建议顺手做两个加固：把 API 域名加入 `no_proxy` 直连、模型名按官方要求带 `[1m]` 后缀。

## 问题现象

- VS Code 面板发消息后长时间转圈（实测最长卡 8 分钟），最终报错：

```
API Error: 500 [1234][网络错误，错误id 202608310410420a8514a2344940e8，请稍后重试。]
This is a server-side issue, usually temporary — try again in a moment.
```

- 同一账号、同一分钟，终端里运行 `claude` 一切正常
- 新建对话、重发消息都无法恢复，且再次发送的消息只是被排队进已卡死的会话
- 环境背景：WSL2 + VS Code Remote-WSL + Claude Code 扩展 + GLM Coding Plan（`open.bigmodel.cn/api/anthropic`）

## 排查过程

按「先网络、再配置、后请求本身」的顺序减项，每一步都做了对照实验：

1. **网络层**：WSL 内分别用直连和走代理 curl 网关，均 0.16 秒通——网络、防火墙、代理全部排除
2. **模型名**：`glm-5.3-flash`、`glm-5.1`、`glm-5-turbo` 三个名字分别 curl，全部 200——模型配置排除
3. **引擎版本**：扩展自带的 2.1.251 引擎二进制拿到终端里用 `-p` 跑最小对话，正常返回——引擎和工作区上下文排除
4. **真实错误**：读扩展宿主日志（`~/.vscode-server/data/logs/<窗口>/exthost*/Anthropic.claude-code/`），看到连续 11 次重试全部是 `500 overloaded_error`——请求确实到达网关，是被明确拒绝而非网络中断
5. **并发排除**：交叉比对时间线，在没有其他任何会话占用的时间段，面板请求依然被拒
6. **定位分叉点**：同一个窗口里，激活后的**第一个**面板会话全程健康（130 条响应 0 错误），**第二个**会话 11/11 全灭——命中 [#82197](https://github.com/anthropics/claude-code/issues/82197)

排除了本地所有变量之后，结论只剩一个：网关对「扩展非首个会话构造的请求」做了拒绝，并把拒绝码包装成了 `overloaded_error`。

## 根因

Claude Code 的 VS Code 扩展每次激活后会为会话拉起独立的引擎进程。[#82197](https://github.com/anthropics/claude-code/issues/82197) 描述的 bug 是：**只有激活后的第一个后端会话工作正常**。后续会话产生的请求在网关侧被拒，而 GLM 网关把这类拒绝统一返回为 HTTP 500 + `overloaded_error`（Anthropic 语义里的 529 过载码），报错文案却是「网络错误，请稍后重试」——具有很强的误导性，让人以为是临时故障反复重试。

终端为什么正常？终端里每次启动 `claude` 都是一个全新的单会话进程，等价于「激活后的第一个会话」，所以始终能被放行。这也解释了为什么这个问题容易误判成限流或网络问题——**判断方法是看同一账号的终端是否同时正常**。如果你在 WSL2 里开发，网络层的坑不止这一个，之前还记录过 [WSL2 + Docker 的端口静默占用与 host 模式问题](/blog/2026/05/09/wsl-docker-postgresql-port-conflict)。

## 解决方案

### 第一步：立即恢复面板

```text
Ctrl+Shift+P → Reload Window
→ 面板恢复后只用第一个对话，不要同时开多个对话
```

面板再次异常时，重复这个操作。在官方修复前，这是唯一可靠的恢复方式。

### 第二步：配置加固

在 `~/.claude/settings.json` 的 `env` 中做两处修改：

```json
{
  "env": {
    "no_proxy": "localhost,127.0.0.1,::1,.bigmodel.cn",
    "NO_PROXY": "localhost,127.0.0.1,::1,.bigmodel.cn",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.3-flash[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5.3-flash[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.3-flash[1m]",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000"
  }
}
```

两处改动的作用：

1. **API 域名直连**：如果你和我一样在代理环境（Clash 等）下开发，把 `open.bigmodel.cn` 加入 `no_proxy` 让 API 请求绕过代理隧道。国内直连这个域名本就比走代理快且稳
2. **模型名对齐官方**：按 [GLM 官方文档](https://docs.bigmodel.cn/cn/coding-plan/latest-model)，开启 1M 上下文需要在模型名后加 `[1m]` 后缀，旧写法属于遗留配置

### 第三步：诊断方法（下次出问题先看这里）

```bash
# 扩展引擎的真实报错（From claude: 开头的行是引擎 stderr）
tail -f ~/.vscode-server/data/logs/*/exthost*/Anthropic.claude-code/Claude\ VSCode.log

# 会话历史（排查请求被拒时哪条消息触发）
ls -lat ~/.claude/projects/<工作区目录slug>/*.jsonl
```

日志里看到 `API error (attempt N/11): 500 overloaded_error` 连续出现，就是本文的这个问题；记录错误里的 `错误id`（即 request_id），提交工单时是对方排查的直接凭证。

<InfoBox variant="warning" title="注意事项">

- `API_TIMEOUT_MS` 若设为很大值（如 3000000 = 50 分钟），卡住的请求会长时间转圈而不是报错，排障时容易被误导为"无响应"而非"被拒绝"
- 卡死的面板会话会持续接收新消息但只做排队，**不要在原会话里反复重发**，直接 Reload Window
- 用脚本切换模型时注意保留模型名的 `[1m]` 后缀和 `no_proxy` 配置，避免被覆写回旧值

</InfoBox>

## 常见问题

### 为什么 Claude Code 的 VS Code 扩展面板发消息一直无响应？

扩展每次激活后只有第一个后端会话被网关正常放行，之后新建的会话请求会被拒绝。Reload Window 后只用第一个对话即可恢复。

### GLM 接入 Claude Code 后终端正常、VS Code 面板报 500 是什么原因？

不是配置问题。GLM 网关用 500 overloaded_error(code 1234) 拒绝扩展的非首个会话请求，同一账号终端请求不受影响。

### 500 [1234] 网络错误是 GLM Coding Plan 限流吗？

不是。终端同时段能正常调用说明额度正常，这是扩展多会话请求被网关按过载码拒绝，等待官方修复即可。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
