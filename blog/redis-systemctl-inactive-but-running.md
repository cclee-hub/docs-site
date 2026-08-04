---
title: "systemctl 显示 inactive 进程却在跑？裸进程探活的 false negative"
description: "systemctl is-active 返回 inactive（exit 3）但进程实际在运行，原因是服务非 systemd 管理。用 pgrep/ss 降级链可靠探活。"
date: 2026-08-05
tags: [Linux, systemd, Redis, Node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 systemctl is-active 显示 inactive 但进程实际在运行？"
    a: "systemctl 只能查询 systemd 通过 unit file 管理的服务。若进程是用 nohup 或直接命令启动的裸进程，没有对应 unit，systemctl 就查不到状态，直接返回 inactive。"
  - q: "怎么可靠检测一个进程是否在运行？"
    a: "不要只依赖 systemctl。用 pgrep <进程名> 查 PID，或 ss -lntp | grep <端口> 确认端口监听，应用层再辅以 redis-cli ping 之类的健康检查。"
---

在编写服务器监控探活时，`systemctl is-active redis-server` 返回 `inactive`，但 Redis 实际正在正常服务请求。

在开发 [AI 运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。监控面板需要准确实时反映各基础组件状态，而 Redis 的状态判断一开始就给出了错误信号。

## TL;DR

`systemctl is-active` 只对 **systemd 通过 unit file 管理的服务** 有效。如果 Redis（或任何服务）是裸进程启动，没有对应 `.service` unit，`systemctl` 永远查不到它的真实状态，返回 `inactive`（退出码 3）。可靠探活要绕开 systemctl，直接用 `pgrep` 查进程或 `ss` 查端口监听。

## 问题现象

探活接口对 Nginx 和 Redis 同时调用 `systemctl is-active`：

```bash
$ systemctl is-active nginx
active            # ✅ 正常

$ systemctl is-active redis-server
inactive          # ❌ 看似 Redis 没跑
$ echo $?
3                 # exit code 3 = inactive
```

但所有业务接口都能正常读写 Redis，`/api/v1/server-monitor/status` 却报告 Redis 宕机。

## 根因

systemd 是一个进程管理器，**它只能感知自己启动和托管的单元**（unit）。当你用 `systemctl start redis-server` 或让 systemd 读 `redis-server.service` 启动时，systemd 记录了该单元的状态，`is-active` 才能返回 `active`。

而这台服务器上的 Redis 是**以裸进程方式启动**的——直接运行 `redis-server` 或通过 nohup/自定义脚本拉起，并没有注册为 systemd 服务。于是：

- systemd 的单元列表里根本没有 `redis-server.service`；
- `systemctl is-active redis-server` 找不到该单元，按 inactive 处理，返回 exit 3；
- Nginx 相反，是标准的 systemd 服务，所以 `is-active` 正常命中 `active`。

一句话：**`is-active` 查的是 systemd 视图，不是系统进程视图**。进程在跑和 systemd 知道它在跑，是两回事。

## 解决方案

探活逻辑改为「systemctl 主判断 → 进程/端口降级」的链式检测。systemctl 命中则直接采用；失败时用 `pgrep` 或 `ss` 兜底确认进程真实存活。用 `execFileSync`（不经过 shell、参数以数组传递）避免命令注入：

```ts
import { execFileSync } from "node:child_process";

/** 安全执行单条命令（不经过 shell），非零退出统一返回 null */
function sh(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
  } catch {
    return null; // inactive / 进程不存在 / 超时 都走这里
  }
}

/**
 * 探活某服务是否在运行：systemctl 主判断，裸进程降级。
 * @param unit   systemd 单元名（如 "nginx"）
 * @param proc   进程名（如 "redis"），用于 pgrep 降级
 * @param port   监听端口（如 6379），用于 ss 降级
 */
function isServiceUp(unit: string, proc?: string, port?: number): boolean {
  // 1. 先走 systemctl（标准 systemd 服务）
  const st = sh("systemctl", ["is-active", unit]);
  if (st && st !== "inactive" && st !== "unknown") {
    return true; // active 或 activating/reloading 等中间态
  }

  // 2. 降级 A：pgrep 按进程名找 PID
  if (proc && sh("pgrep", ["-f", proc])) return true;

  // 3. 降级 B：ss 按端口确认监听
  if (port) {
    const listening = sh("ss", ["-lnt"]);
    if (listening && listening.includes(`:${port} `)) return true;
  }

  return false;
}

// Nginx：标准 systemd 服务，systemctl 直接命中
const nginxUp = isServiceUp("nginx");

// Redis：可能是裸进程，传进程名 + 端口兜底
const redisUp = isServiceUp("redis-server", "redis", 6379);
```

对应用层而言，更稳的最终确认是**让服务自己回答**——Redis 的 `PING` 命令、PostgreSQL 的 `SELECT 1`、HTTP 服务的健康检查端点。端口监听只能证明"进程起来了"，不能证明"服务 ready"，所以关键路径上建议再加一层应用层探活：

```bash
$ redis-cli ping
PONG    # 进程在跑 + 能响应 = 真正存活
```

## 常见问题

### 为什么 systemctl is-active 显示 inactive 但进程实际在运行？

`systemctl` 只查询 systemd 通过 unit file 管理的服务。如果进程是用 `nohup` 或直接命令启动的裸进程，没有对应 `.service` unit，systemd 既不认识它、也不追踪它，`is-active` 就只能返回 `inactive`（exit 3）。这是 systemd 视角的盲区，不是进程真的挂了。

### 怎么可靠检测一个进程是否在运行？

不要只依赖 systemctl。用 `pgrep <进程名>` 查 PID，或 `ss -lntp | grep <端口>` 确认端口监听；这些命令查的是系统进程/网络栈，与是否被 systemd 管理无关。对关键服务，再加一层应用层探活（如 `redis-cli ping`），既验证进程存在又验证服务可响应。

<InfoBox variant="warning" title="注意事项">

- **单元名 ≠ 进程名**：`systemctl is-active redis-server` 里的 `redis-server` 是 unit 名，可能与实际进程名（`redis-server` 或 `redis`）不同，别混用。
- **生产环境注意超时**：探活命令应设置短超时（如上例的 2s）并捕获异常，避免某个命令卡住拖垮整个监控接口。
- **容器化服务另说**：跑在 Docker 里的服务在宿主机 `systemctl` 看不到，应直接用 `docker inspect` 或容器健康检查 API，不要套用本文的 pgrep 降级。
- **治本方案**：把裸进程迁到 systemd unit（配 `Type=`、`Restart=always`），既能让 `is-active` 准确，又能享受 systemd 的自动拉起能力。

</InfoBox>

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
