---
title: "终端里 grep -P 好好的，脚本里就挂？zsh 和 bash 不共用 PATH"
description: "终端里 grep -P 好好的，bash 脚本里就报 grep: invalid option——交互 zsh 和脚本 bash 走两条 PATH，GNU grep 只在交互环境。sed -nE 与 shasum 回退让脚本跨机可用。"
date: 2026-11-19
tags: [Shell, macOS, Bash, zsh]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "zsh 和 bash 有什么区别？为什么手动跑命令和跑脚本结果不一样？"
    a: "两者是不同的 shell，各自解析自己的 PATH；macOS 默认交互 shell 是 zsh，而脚本的 shebang 决定执行环境。如果你在交互 shell 里用 brew 装过 GNU 工具链，PATH 里有它们；bash 脚本继承的 PATH 未必包含同一路径，于是同一个命令名解析到两个不同二进制。手动跑=交互 shell 环境，跑脚本=另一套环境，结果自然不同。"
  - q: "grep -P 在 macOS 上为什么报 invalid option？"
    a: "macOS 自带的 /usr/bin/grep 是 BSD grep（FreeBSD 系），不支持 Perl 正则的 -P 旗标——GNU grep 才有。你的交互 shell PATH 里如果装了 GNU grep（如 brew install grep），手动测试能过；bash 脚本解析到系统 BSD grep 就报 grep: invalid option -- P。用 grep -E 或 sed -nE 改写正则即可跨环境。"
  - q: "怎么快速确认脚本实际用的是哪个 grep？"
    a: "在脚本里加一行 command -v grep 并打印，或临时 bash -x 跑脚本看展开后的命令路径。对比交互 shell 里 which -a grep 的输出：两条 PATH 解析到不同二进制（如 /opt/homebrew/bin/grep 与 /usr/bin/grep）即坐实。"
---

在 Mac 上跑一个此前在 WSL 里一直正常的发布脚本，第一处 `grep` 调用直接挂掉：`grep: invalid option -- P`。更迷惑的是排查动作本身——在终端里手敲同一条 `grep -oP '…'`，**测试通过**。同一个命令、同一台机器，终端里能用，脚本里就报错。

## TL;DR

1. 报错与「脚本写错」无关：交互 zsh 和 bash 脚本解析到**两条不同的 PATH**——交互环境里 `grep` 命中 brew 装的 GNU grep（支持 `-P`），脚本环境命中系统自带的 `/usr/bin/grep`（BSD grep，无 `-P`）。
2. 同族风险不止 grep：`sha256sum` 等依赖 homebrew coreutils 的工具同样只在交互 PATH 里存在，脚本里一样会挂。
3. 收口三条：`grep -oP` 全部改写为 `sed -nE` 等价提取；`sha256sum` 加 `shasum -a 256` 回退；硬编码路径改为运行时自探测。脚本从此不依赖「哪台机器、哪个 shell」。

<!-- truncate -->

这个脚本来自 [CCLEE OSS](/docs/cclee-oss) 的发布管线——WordPress 阿里云 OSS 插件的 license 仓用它读取插件头部的 `Version:`、计算 zip 的 sha256 并写入发布清单。在 WSL 上它跑了很久都没事，迁到 Mac 当天就翻车。

## 问题现象：手测通过，脚本报错

同一个命令、两个上下文，一过一挂——而挂掉的那一侧，才是脚本真实的运行环境：

| 上下文 | 命令 | 结果 |
|--------|------|------|
| 交互终端（zsh） | `grep -oP '(?<=Version: ).+' file` | 正常输出 |
| `bash script.sh` 内部同一调用 | 同上 | `grep: invalid option -- P` |

本机实测锚点（macOS，Apple Silicon）：`/bin/bash --version` 为 GNU bash 3.2.57；`/usr/bin/grep --version` 为 `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`；把这条 grep 塞进 `/bin/bash -c` 直接复现 `grep: invalid option -- P`。

## 根因：同一个命令名，两个不同二进制

**事实一：macOS 自带的是 BSD grep，没有 `-P`。** `-P`（Perl 正则）是 GNU grep 的扩展；BSD grep 从未实现它。系统 grep 恒在 `/usr/bin/grep`，任何脚本环境最终都兜底到这里。

**事实二：交互 zsh 的 PATH 里有一份 GNU grep。** 通过 brew 装的 GNU grep 落在 `/opt/homebrew/bin/grep`，只因为你交互 shell 的 PATH 里包含 homebrew 前缀，手动测试才通过。**这条 PATH 不是脚本继承的 PATH**——bash 非交互执行时按自己的解析顺序走，解析不到 brew 前缀，就落到 `/usr/bin/grep`。

**事实三：sha256sum 是同一个坑的另一种死法。** GNU coreutils 的 `sha256sum` 在 macOS 上不存在系统级实现（系统只有 `shasum`），它同样只在交互 PATH 里活着。grep 修好之后脚本会在下一步以 `command not found` 的形式再挂一次。

<InfoBox variant="warning" title="弯路：手测通过带偏了排查方向">
第一反应是「脚本是不是写错了」——毕竟同一台机器上手敲同样的命令是好的。绕了一圈环境变量、引号转义，才回到最朴素的验证：在交互 shell 和脚本里各跑一次 `command -v grep`，输出一个是 `/opt/homebrew/bin/grep`、一个是 `/usr/bin/grep`，两个二进制对不上。教训：**「命令在终端里能用」验证的是交互 shell，不是脚本环境**；跨上下文排查第一步先 diff 两边的 `command -v`。
</InfoBox>

## 解法：把脚本改成不依赖环境

思路不是「把 PATH 配对齐」——那只是把坑挪到下一台机器。脚本要在 WSL 和 Mac 两类机器上跑，就让它不依赖任何一台机器的工具链假设：

```bash
# ① grep -P 全部改写为 sed -nE 等价提取（BSD/GNU sed 都支持 -E）
# 原：grep -oP '(?<=Version: ).+' file | head -n1
VER=$(sed -nE 's/.*Version:[[:space:]]*([^[:space:]]+).*/\1/p' "$F" | head -n1)

# ② sha256sum 加 shasum -a 256 回退（macOS 自带 shasum）
SHA=$( (sha256sum "$ZIP" 2>/dev/null || shasum -a 256 "$ZIP") | awk '{print $1}')

# ③ 路径自探测，替代「换台机器改一次」的硬编码
[ -d "$PLUGIN_SRC" ] || PLUGIN_SRC="$HOME/workspace/wordpress/wp/plugins/cclee-oss"
```

`sed -nE` 的改写要点：`grep -oP` 的 lookbehind `(?<=Version: )` 换成「贪心匹配整行 + 捕获组 + `\p` 打印命中行」的组合（`s/.*前缀(捕获).*/\1/p`），语义等价且 BSD/GNU 双实现通用。

验证：`bash -n` 语法检查通过后实跑一次发布，Version 提取、sha256 写入、清单更新全链路正常——0.6.1 的 zip 就是这套修改后发出的。

## 注意事项

<InfoBox variant="warning" title="这是一族问题，不是 grep 一个命令">
任何「交互 shell 有、脚本环境没有」的工具都同族：GNU grep -P、coreutils 的 sha256sum/readlink -f、GNU sed 的部分旗标、jq 的版本差异。跨机脚本的两种生存策略：**收敛环境**（脚本开头显式注入 PATH、shebang 指向固定 bash）或**环境无关**（本文做法：只用双实现共有的旗标 + 回退链）。前者维护成本低但每台机器都要先配一次；后者一次性改完，代价是写法上回避各家扩展。工具链单一的仓库选前者，要跨 WSL/Mac 双端跑的选后者。
</InfoBox>

## 常见问题

### zsh 和 bash 有什么区别？为什么手动跑命令和跑脚本结果不一样？

两者是不同的 shell，各自解析自己的 PATH；macOS 默认交互 shell 是 zsh，而脚本的 shebang 决定执行环境。如果你在交互 shell 里用 brew 装过 GNU 工具链，PATH 里有它们；bash 脚本继承的 PATH 未必包含同一路径，于是同一个命令名解析到两个不同二进制。手动跑=交互 shell 环境，跑脚本=另一套环境，结果自然不同。

### grep -P 在 macOS 上为什么报 invalid option？

macOS 自带的 `/usr/bin/grep` 是 BSD grep（FreeBSD 系），不支持 Perl 正则的 `-P` 旗标——GNU grep 才有。你的交互 shell PATH 里如果装了 GNU grep（如 brew install grep），手动测试能过；bash 脚本解析到系统 BSD grep 就报 `grep: invalid option -- P`。用 `grep -E` 或 `sed -nE` 改写正则即可跨环境。

### 怎么快速确认脚本实际用的是哪个 grep？

在脚本里加一行 `command -v grep` 并打印，或临时 `bash -x` 跑脚本看展开后的命令路径。对比交互 shell 里 `which -a grep` 的输出：两条 PATH 解析到不同二进制（如 `/opt/homebrew/bin/grep` 与 `/usr/bin/grep`）即坐实。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
