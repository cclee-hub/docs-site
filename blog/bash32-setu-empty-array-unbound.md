---
title: "bash 3.2 set -u 空数组崩？本机炸线上不炸的三个炸点"
description: "同一脚本线上正常、本机崩报 unbound variable？bash 3.2 与 5.x 对空数组与未定义变量炸点不同，实测六组合给全矩阵，${arr[@]+…} 与 set +u 包算术各管一处。"
date: 2026-11-22
tags: [bash, macOS]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "bash 空数组在 set -u 下报 unbound variable 怎么防护？"
    a: "词展开处写成 ${arr[@]+\"${arr[@]}\"}：数组有定义才展开，没定义展开为空。这一形态在 bash 3.2 与 5.x 都不炸；算术处的 ${#arr[@]} 另需 set +u 包裹，见下一篇问答。"
  - q: "为什么同一个脚本 macOS 上崩、Linux 上不崩？"
    a: "macOS 系统自带的 /bin/bash 是 3.2.57（2007 年的版本），空数组的词展开在 set -u 下报 unbound variable；bash 4.4 起放开了这一行为，现代 Linux 的 bash 不炸。brew install bash 换 5.x 后行为与 Linux 一致。"
  - q: "set -u 下算术表达式里的数组长度为什么也要防护？"
    a: "${#undef[@]} 引用未定义变量时，bash 3.2 与 5.x 都报 unbound variable——这是唯一跨版本通杀的炸点。把算式包进 $( set +u; echo $(( … )) )，既防未定义又对版本免疫。"
---

同一个备份恢复演练脚本，线上服务器每天定时跑得好好的，本机一跑回归测试就崩死在一行算术上，只留一句 `unbound variable`，状态文件没写出来，日志也没有。

在开发 [CCLee 服务器哨兵](/docs/server-sentinel) 时踩到 macOS 自带 bash 3.2 的一个隐蔽行为——Linux 服务器监控预警托管：性能、可用性、安全、备份四类监控，告警归并成结论并附处置指引，每月真实恢复演练验证备份可用。

## TL;DR

bash 3.2（macOS 系统自带的 `/bin/bash`）在 `set -u` 下，对**空数组**和**未定义变量**的报错位置与 bash 5.x 不同——三个炸点里只有一个跨版本通杀。本文在 bash 3.2.57 与 5.3.20 上实测六个组合，完整矩阵如下：

| 表达式 | bash 3.2（macOS 系统自带） | bash 5.x（brew / 现代 Linux） |
|---|---|---|
| 空数组词展开 `${arr[@]}`（带不带引号） | **炸** unbound | 不炸 |
| 空数组算术 `$(( ${#arr[@]} ))` | 不炸（值为 0） | 不炸 |
| 未定义变量算术 `$(( ${#undef[@]} ))` | **炸** | **炸** |

防护两件套，各管一处：词展开写成 `${arr[@]+"${arr[@]}"}`（管 3.2 的空数组炸点），算术包进 `$( set +u; echo $(( … )) )`（管跨版本通杀的未定义炸点）。

## 问题现象：死在算术行，无状态文件无日志

脚本用 `set -u` 开严格模式，首行统计本轮演练对象数：

```bash
# 修复前的写法（示意结构，与现场一致）
EXPECTED=$(( ${#DRILL_DUMPS[@]} + ${#TAR_FILES[@]} ))
```

`DRILL_DUMPS` / `TAR_FILES` 是配置渲染器的产物：清单里有对应段就渲染出数组赋值，没有就不渲染。本机回归用的 conf 恰好缺段，这两个变量有一个根本不存在——脚本走到这一行直接退出，报 `unbound variable`。演练状态 JSON 没写、错误也没进日志，回归 22 条断言近乎全 FAIL 且零输出，第一眼像是被测脚本坏了。

疑点在于：同一份脚本在线上 TencentOS 每天正常出结果。「线上不炸本机炸」——差异不在脚本，在本机的 bash 版本。

## 根因：bash 3.2 和 5.x 的炸点分布不同

macOS 系统自带的 `/bin/bash` 停在 3.2.57（2007 年 GPLv2 版本），而 brew 装的与现代 Linux 发行版的是 5.x。`set -u`（nounset）对「未定义就引用」报错，但哪些展开算「未定义」、哪些算「空」，两代 bash 的判定不一样。以下全部为实机输出：

```console
$ /bin/bash --version | head -1
GNU bash, version 3.2.57(1)-release (arm64-apple-darwin26)

$ /bin/bash -uc 'arr=(); for x in ${arr[@]}; do echo $x; done'
bash: arr[@]: unbound variable

$ /bin/bash -uc 'arr=(); for x in "${arr[@]}"; do echo $x; done'    # 加引号一样炸
bash: arr[@]: unbound variable

$ /bin/bash -uc 'arr=(); echo $(( ${#arr[@]} ))'                    # 算术长度不炸
0

$ /bin/bash -uc 'echo $(( ${#undef[@]} ))'                          # 未定义：算术处炸
bash: undef: unbound variable

$ /opt/homebrew/bin/bash -uc 'arr=(); for x in ${arr[@]}; do echo $x; done; echo done'
done                                                                # 5.3：空数组词展开不炸

$ /opt/homebrew/bin/bash -uc 'echo $(( ${#undef[@]} ))'
bash: undef: unbound variable                                       # 未定义：5.3 照样炸
```

注意第二行：**加引号不豁免**。常见的误解是 `"${arr[@]}"` 是安全形态——在 3.2 的 `set -u` 下照样报 unbound。而「空数组算术长度」在两代 bash 里都不炸，真正两代通杀的炸点只有一个：**未定义变量**的算术引用（`bash: undef: unbound variable`，注意报错名连 `[@]` 都没有）。

排查弯路也值得记一笔：先怀疑被测脚本逻辑坏了，改了业务逻辑没用；后来对着「线上正常」这个反差才转向版本差异——同一个变量引用，本机 3.2 认定为 unbound，线上 5.x 认定为空。

## 防护：惯例写法各管一处

**词展开处**——`${arr[@]+"${arr[@]}"}` 的含义是「数组有定义才展开成元素列表，没定义就展开为空」。这是参数展开的 `+` 探测形态，先测试再展开，所以 3.2 不报 unbound。演练脚本里所有数组遍历都是这个形态：

```bash
for pair in ${DRILL_DUMPS[@]+"${DRILL_DUMPS[@]}"}; do
```

**算术处**——`${#arr[@]}` 这种长度形式没法套用 `+` 探测，而未定义炸点两代 bash 通杀，所以把算式包进子 shell 局部关掉 `-u`：

```bash
EXPECTED=$( set +u; echo $(( ${#DRILL_DUMPS[@]} + ${#TAR_FILES[@]} )) )   # set +u：bash3.2 空数组保护
```

子 shell 里的 `set +u` 只作用于这一行，不污染脚本其余部分的严格模式。未定义变量在算术里被当作 0 参与——对本场景（统计对象数）恰好是正确语义；若你的算式对「未定义」和「0」必须区分，这一层防护就不适用，得显式判空。

同类问题在脚本环境差异上还有一个变体，见 [终端里 grep -P 好好的，脚本里就挂？zsh 和 bash 不共用 PATH](/blog/zsh-bash-script-grep-p-invalid-option)——同样是「终端里好好的、脚本里就挂」的症状族，根因是交互 shell 与脚本的两条 PATH。

<InfoBox variant="warning" title="注意事项">

- **stub 环境同族两坑**：macOS 的 `date` 在 `/bin/date`，`/usr/bin/date` 不存在——写死 `/usr/bin/date` 的工具链在本机直接找不到命令。
- **`printf '%d'` 对空值静默输出 0**：实测 bash 3.2.57 下 `printf '%d\n' ""` 输出 `0` 且退出码 0，**无任何报错**。断言 `last_ok_epoch`、`epoch` 这类数值字段时，0 可能是空值被 printf 吃掉的结果，不是真实值——数值断言要看真实来源。
- 回归环境与生产环境的 bash 版本不同时，「测试过」不等于「生产行为」；要么防护写全，要么用 `bash --version` 先对齐事实。

</InfoBox>

## 常见问题

### bash 空数组在 set -u 下报 unbound variable 怎么防护？

词展开处写成 `${arr[@]+"${arr[@]}"}`：数组有定义才展开，没定义展开为空。这一形态在 bash 3.2 与 5.x 都不炸；算术处的 `${#arr[@]}` 另需 `set +u` 包裹，见下一条。

### 为什么同一个脚本 macOS 上崩、Linux 上不崩？

macOS 系统自带的 `/bin/bash` 是 3.2.57（2007 年的版本），空数组的词展开在 `set -u` 下报 unbound variable；bash 4.4 起放开了这一行为，现代 Linux 的 bash 不炸。`brew install bash` 换 5.x 后行为与 Linux 一致。

### set -u 下算术表达式里的数组长度为什么也要防护？

`${#undef[@]}` 引用未定义变量时，bash 3.2 与 5.x 都报 unbound variable——这是唯一跨版本通杀的炸点。把算式包进 `$( set +u; echo $(( … )) )`，既防未定义又对版本免疫。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
