---
title: "GitHub Actions 部署失败却上线成功？pm2 竞争与 lockfile 漂移"
description: "GitHub Actions 部署失败但服务已更新，或本地全绿 CI 必挂？两类部署链路假故障：pm2 restart 并发竞争误报与 pnpm 错目录执行致 lockfile 漂移，附识别特征与修法。"
date: 2026-09-13
tags: [GitHub Actions, PM2, pnpm, 前端部署]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "pm2 restart 会加载最新代码吗？"
    a: "会。pm2 restart 以磁盘上当前代码重启进程，所以竞争误报时服务器代码已经是最新。判断真假失败不看重启输出，而看 pm2.log 与健康检查：同一秒内同时出现成功重启记录和 process already online 报错，即竞争误报。"
  - q: "GitHub Actions 显示部署失败，怎么判断是不是误报？"
    a: "核对 3 项：服务器代码是否最新、pm2 list 进程是否 online、健康检查是否返回 200。三项都正常而失败点恰在 pm2 restart 步骤，基本可断定是并发竞争误报；把部署收敛到唯一通道后误报即消失。"
  - q: "pnpm install 本地成功，CI 报 ERR_PNPM_OUTDATED_LOCKFILE 怎么办？"
    a: "根因是 pnpm-lock.yaml 与 package.json 不同步：在子目录执行 pnpm add 只改了子包声明，根 lockfile 没有更新入库。回到工作区根执行 1 次 pnpm install 重新生成 lockfile 并提交即可；CI 日志里的 specifiers diff 会指出哪个包的依赖变了。"
---

在 push 代码触发自动部署时，GitHub Actions 的 Deploy 步骤标红退出，登服务器一看服务却已经是最新版本；另一天则反过来——本地一切正常，CI 的 `pnpm install --frozen-lockfile` 每次必挂。这两个方向相反的信号失真，都出在部署链路本身，而不是代码。

在为客户开发[电商自动化数据采集工具](/cases/ecommerce-data-collection-tool)时遇到此类问题——批量抓取商品图片、SKU、价格与评价，清洗后导出结构化数据，支撑库存管理与竞品分析。该工具的服务端走 PM2 + GitHub Actions 部署，下面两类假故障都在这条链路上踩过。

## TL;DR

- **CI 红但部署实际生效**：两条部署通道并发执行 `pm2 restart`，一方在重启瞬间查不到进程而误报失败。识别特征是 pm2.log 同一秒内既有成功重启记录、又有 `process already online` 报错。修法：部署收敛到唯一通道。
- **本地绿但 CI 必挂**：`pnpm add` 在子目录执行，只改了子包 `package.json`，根 `pnpm-lock.yaml` 没同步入库。修法：回到工作区根执行 `pnpm install` 重新生成 lockfile 并提交。

## 场景一：本地全绿，CI 必挂——pnpm lockfile 漂移

这类失败与代码质量无关，纯粹是 pnpm-lock.yaml 与 package.json 失去同步——而 CI 是唯一会严格核对两者的环境。

### 现象

CI 的 `pnpm install --frozen-lockfile` 每次都失败，报错固定：

```text
ERR_PNPM_OUTDATED_LOCKFILE
```

而本地执行 install、build、测试全部通过。这种「本地构建正常但 CI 挂了」的组合很容易让人先怀疑 CI 缓存或 Node 版本，实际都无关。

### 根因：pnpm add 跑在了错误的目录

这个项目是 pnpm workspace monorepo，lockfile 只有一份、位于工作区根。当时为了装一个依赖，执行了：

```bash
# 在 client/ 子目录里执行
pnpm --filter @ccl-ext/client add <pkg>
```

结果 `client/package.json` 更新了，但根目录的 `pnpm-lock.yaml` 没有同步重新生成——也就是没有入库。提交后，CI 拿到的 lockfile 与 package.json 不一致，`--frozen-lockfile` 校验直接拒绝安装。

本地测不出来的原因很直接：node_modules 已经物理装好了包，本地 install 直接复用现有产物，不会走到 frozen 校验；CI 是全新环境，每一次都严格比对 lockfile。

还有一个伴随症状可以当证据用：在错误的 cwd 下执行 pnpm 命令，还会在子目录生成一个游离的 `client/pnpm-lock.yaml`。看到这个文件出现，基本就是又跑错目录了。

### 修法

两步：

1. 回到工作区根，执行 `pnpm install` 重新生成根 lockfile，随代码一起提交；
2. 今后 `pnpm add` / `pnpm remove` 一律在工作区根执行，不在子目录里跑。

CI 日志里失败原因的 specifiers diff（依赖声明差异对比）会明确指出哪个包的依赖范围变了，可以用来确认修的就是这一处。

多包工作区里还有一类相似的「归因错位」问题，见这篇：[npm audit 报警归因错目录？多包部署先按 audited N 对包树](/blog/npm-audit-multi-package-deploy-attribution)。

## 场景二：GitHub Actions 报失败，部署实际成功——pm2 restart 并发竞争

部署本身没有失败，失败的是并发撞车的第二次 restart——PM2 把这场竞争误报成了部署错误。

### 现象

push 后 GitHub Actions 的「Deploy Server」失败在 pm2 restart 步骤：

```text
[PM2][ERROR] Process 3 not found → exit 1
```

但登服务器核对：代码是最新、`pm2 list` 显示进程 online、健康检查返回 200。部署三要素全部正常，只有 Actions 认为自己失败了。

### 根因：两条部署通道同时 restart 同一个进程

当时部署有两条触发路径：

1. `deploy.yml` 的 push 自动触发；
2. 本地的 `/deploy` 部署脚本（deploy.sh）。

同一次 push 会让两条路径各执行一次 `pm2 restart ccl-ext-api`。两个 restart 并发撞车时，一方恰好在另一方重启的瞬间去查询进程，查不到就报 `Process not found` 并以 exit 1 退出——PM2 把这次竞争当成了失败。

### 验证过程：pm2.log 里的同一秒

判断是不是竞争，pm2.log 是最硬的证据。翻开日志，同一秒内能看到两类记录并存：

```text
# 一边：重启完整走完，进程上线
Stopping → starting → online

# 另一边：撞车的那个 restart 查不到进程
PM2 error: process already online
```

一次重启「正在进行中」与另一次「查询进程」交错在同 1 秒内，就是竞争特征。加上代码最新、进程 online、健康检查 200 三项核对，可以确定部署实际生效，Actions 的失败是误报。

### 修法：移除 push 触发，部署收敛到唯一通道

改法是删掉 `deploy.yml` 的 push 自动触发，只保留 `workflow_dispatch` 手动触发作为兜底：

```yaml
on:
  workflow_dispatch:
```

两个方案里选收敛通道而不是加并发锁，因为加锁只是让两条通道排队，部署路径依然有两条；而部署本来就应该只有一个入口，谁在什么时间部署了什么，只从一处发生。收敛后这类误报再没出现过。

部署后如何确认线上真的更新了（而不是构建缓存作祟），这篇有另一组排查思路：[排查前端部署后线上未更新的问题](/blog/frontend-deploy-build-outdated)。

<InfoBox variant="warning" title="注意事项">

- 保留的 `workflow_dispatch` 手动触发同样会与本地部署竞争，只在确认当前没有本地部署进行时使用。
- 竞争窗口极短（重启的 1 秒内），但只要两条通道并存，push 频率越高撞上的概率越大，不是「偶发」而是「必现只是难复现」。
- 判断假失败的顺序：先核对服务器三要素（代码、进程、健康检查），再看 pm2.log 有无同秒双记录，最后才考虑重跑。

</InfoBox>

## 根因对照：两类假故障的共同点是信号源被污染

把两个场景放在一起看，共同点立刻浮现：出问题的都不是部署结果，而是产生信号的链路本身。

| | 场景一 | 场景二 |
|---|---|---|
| 表面信号 | CI 必挂，本地全绿 | Actions 失败，服务器已更新 |
| 真实状态 | lockfile 确实不同步 | 部署已完成 |
| 污染源 | 错误 cwd 的 pnpm 操作 | 并发的第二条部署通道 |
| 硬证据 | specifiers diff + 游离子 lockfile | pm2.log 同秒双记录 |

CI 的红与绿只是部署链路的输出，链路本身被污染（两份 lockfile、两条通道）时，信号就不再可信。先修链路，再看信号。

## 常见问题

### pm2 restart 会加载最新代码吗？

会。pm2 restart 以磁盘上当前代码重启进程，所以竞争误报时服务器代码已经是最新。判断真假失败不看重启输出，而看 pm2.log 与健康检查：同一秒内同时出现成功重启记录和 process already online 报错，即竞争误报。

### GitHub Actions 显示部署失败，怎么判断是不是误报？

核对 3 项：服务器代码是否最新、pm2 list 进程是否 online、健康检查是否返回 200。三项都正常而失败点恰在 pm2 restart 步骤，基本可断定是并发竞争误报；把部署收敛到唯一通道后误报即消失。

### pnpm install 本地成功，CI 报 ERR_PNPM_OUTDATED_LOCKFILE 怎么办？

根因是 pnpm-lock.yaml 与 package.json 不同步：在子目录执行 pnpm add 只改了子包声明，根 lockfile 没有更新入库。回到工作区根执行 1 次 pnpm install 重新生成 lockfile 并提交即可；CI 日志里的 specifiers diff 会指出哪个包的依赖变了。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
