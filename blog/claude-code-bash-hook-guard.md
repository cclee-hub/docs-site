---
title: "Claude Code Hook 误拦正常命令？拦截判据要锚定执行语义"
description: "Claude Code Hook 用关键字拦危险 SQL，pm2、grep 全被误伤——词边界救不了，判据要锚定执行语义：ssh 前缀、psql、关键字三条件齐备，附 17 行脚本与 22 个回归样例。"
date: 2026-09-28
tags: [Claude Code, Hooks, 数据库安全, DevOps]
authors: [cclee]
image: "/images/blog/claude-code-bash-hook-guard-architecture.webp"
schema: FAQPage
faqs:
  - q: "Claude Code Hook 怎么加？"
    a: "在 settings.json 的 hooks.PreToolUse 里配置 matcher 为 Bash 的 command hook，指向脚本绝对路径并加 timeout 5。脚本从 stdin 读取含 tool_name 和 tool_input.command 的 JSON，exit 2 阻断命令并把 stderr 反馈给模型，exit 0 放行。"
  - q: "Claude Code Hook 的作用是什么？"
    a: "在工具调用真正执行前做一道静默闸门，适合拦高危副作用操作，比如 AI 直连生产库写数据。它不能替代权限确认与代码审查——本文 22 个回归样例之外仍有 cd 前缀绕过、pg_restore 漏拦等残余面。"
  - q: "Claude Code Hook 的拦截机制是怎样的？"
    a: "PreToolUse 钩子在 Bash 执行前收到含完整命令文本的 JSON，脚本用退出码表态：exit 2 阻断执行、stderr 内容回传给模型作为拦截原因，exit 0 放行。本文判据为三条件齐备：ssh 生产机前缀 + 命令含 psql + 词边界写库关键字。"
  - q: "Hook 拦截误伤正常命令怎么办？"
    a: "把判据从「文本包含关键字」换成「执行语义齐备」。词边界救不了 shell 命令：sys.path.insert、--update-env 这类符号本身就是边界，v1 拦截照样误伤 8 类命令；加上「命令含 psql」这个执行者条件后误伤清零，再把每条判据固化成回归样例。"
---

在给 Claude Code 配 Bash 拦截 Hook 防止 AI 直写生产库时，`pm2 restart`、`grep`、Python 调试命令被接连误拦——该拦的 SQL 一条没跑掉，不该拦的运维命令也一片躺枪。这类问题在英文社区的讨论里常被叫做 hook overblocking 或 false positive。这篇文章记录判据从「关键字匹配」收窄到「执行语义」的完整过程。

在运维 [CCLee 服务器哨兵](/docs/server-sentinel) 背后的生产服务器时遇到此问题——Linux 服务器监控预警托管：性能、可用性、安全、备份四类监控，告警归并成结论并附处置指引。

## TL;DR

用「命令文本包含写库关键字」做 Hook 判据，注定误伤：`sys.path.insert`、`pm2 --update-env`、`grep 'UPDATE …'` 全都含整词关键字，`\b` 词边界一个也救不了。把判据收窄为三条件齐备——**ssh 生产机前缀 + 命令含 psql + 词边界关键字**——8 类误伤清零。同时把 SQL 写库的正路定为文件管道（关键字不进命令行），正路天然不触发。最后把判据表写成 22 个回归样例：改判据先改测试，口径不再靠记忆。

## 问题现象：pm2 restart 被拦，正常运维命令躺枪

v1 拦截 Hook 上线当天，`pm2 restart`、远端 `grep`、Python 调试命令接连被误拦——被拦的命令没有一条真的在写库。

背景先交代一句：我们的开发流程允许 Claude Code 直连生产库做**只读**排查——先查 `logs` 表定位 trace、时间、服务，形成假设再读代码。这条正路依赖一个前提：INSERT / UPDATE / DROP 这类**写操作**绝不能由 AI 直发。规则先写进了 CLAUDE.md，但规则是提示性的，模型在长会话高压下会忘。于是加了一层机制：PreToolUse Hook，凡是 `ssh` 到生产机的命令，文本里出现写库关键字就直接阻断，退出码 2。

误伤来得很快。以下命令全部被拦，没有一条在写库：

```bash
# 容器里调 Python 路径（sys.path.insert 含 "insert"）
ssh prod "docker exec app python3 -c 'import sys; sys.path.insert(0, \"/app/lib\")'"

# pm2 滚动更新环境变量（--update-env 含 "update"）
ssh prod "pm2 restart api --update-env"

# 重启服务（pm2 delete 含 "delete"）
ssh prod "cd /app && pm2 delete api 2>/dev/null; pm2 start ecosystem.config.js && pm2 save"

# 远端搜代码（grep 的参数含 "UPDATE"）
ssh prod "grep -rn 'UPDATE api_keys' /app/server/"

# 数日志里的报错次数
ssh prod "tail -5 error.log | grep -c UPDATE"

# 容器里跑 pandas（df.update 含 "update"）
ssh prod "docker exec airflow python3 -c 'df.update(other)'"
```

每一条被拦的命令，Claude 都得停下来换姿势绕路，排查链路被打断。误伤清单攒到 8 类（回归测试收录了其中 6 个代表样例），v1 判据宣告失败。

## 根因：关键字匹配命中的是文本，不是执行语义

词边界解决不了 shell 命令的误伤——v1 的正则里 `\b` 一直在，误伤照样发生：

```bash
grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'
```

但词边界解决不了 shell 命令的误伤，原因很反直觉：**编程语法里的标点本身就是单词边界**。`sys.path.insert` 的 `.`、`--update-env` 的 `-`、`df.update()` 的 `.` 和 `()`，在正则眼里都是非单词字符，`insert`、`update` 在这些位置全都构成「整词」。所以 v1 的词边界一个误伤都防不住。

往深一层看，根因是判据锚错了对象：关键字出现在命令文本里，**不等于**这条命令要执行该关键字的语义。`grep 'UPDATE api_keys'` 的语义是「搜索」，不是「更新」；`pm2 --update-env` 的语义是「重启」，不是「改数据」。文本层面的任何匹配技巧（词边界、大小写、上下文窗口）都无法区分这两者，因为区分它们的信息不在文本里，而在**执行者**上——真正危险的是「psql 收到一条写语句」，不是「命令里出现了 UPDATE 这个词」。

所以收窄方向不是细化匹配，而是换锚点：**锚定执行语义**。一条命令要构成写库风险，必须同时满足三件事：命令是发往生产机的 ssh、命令里真的调用了 psql、psql 要执行的文本里出现写库关键字。三者缺一，都不构成「内联写库」。

## Claude Code Hook 判定流：三条件齐备才拦

判定流如下图：三个条件串联成闸门，任何一路「否」都放行，只有三路全「是」才阻断。

![bash-guard 三条件判定流：ssh 生产机前缀、命令含 psql、词边界写库关键字齐备才阻断，SQL 走文件管道天然放行](/images/blog/claude-code-bash-hook-guard-architecture.webp)

v2 与 v1 的全部差异只有一行——在关键字判断前加了一个 psql 条件：

```bash
# v1：只看关键字（已废弃）
if echo "$CMD" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'; then

# v2：psql 存在 + 关键字，两条件同查
if echo "$CMD" | grep -qi 'psql' && echo "$CMD" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'; then
```

完整的 Hook 脚本（17 行，`prod` 换成你的生产机 ssh 别名）：

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ "$TOOL" != "Bash" ] && exit 0

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qi '^ssh prod'; then
    if echo "$CMD" | grep -qi 'psql' && echo "$CMD" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b'; then
        echo "检测到 psql 内联写库关键字，已阻断: $CMD" >&2
        exit 2
    fi
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"只读 ssh 命令"}}'
    exit 0
fi

exit 0
```

注册到 `settings.json`，matcher 限定 Bash 工具，timeout 5 秒防止脚本挂起拖住会话：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/path/to/bash-guard.sh", "timeout": 5 }
        ]
      }
    ]
  }
}
```

收窄只解决了一半问题——拦得准，还要放得开。写库的需求本身是存在的（schema 变更、数据修复），不能因为 Hook 存在就没了出路。我们把**正路**定为文件管道：SQL 落盘，stdin 进 psql，写库关键字从头到尾不进命令行：

```bash
cat x.sql | ssh prod "docker exec -i db psql -U app -d appdb"
# 或者
ssh prod "docker exec -i db psql -U app -d appdb" < x.sql
```

这个设计有个顺带的好处：正路**天然**不触发 Hook，不需要任何白名单或豁免逻辑。管道两侧的命令（`cat`、`ssh … psql` 不带 `-c`）不含关键字，判据和正路在结构上互斥，而不是靠枚举例外。真正该写进规则的是：禁止的不是「写库」，是「关键字内联进命令行」——这也让团队约定和 Hook 判据说同一句话。

## 判据表即测试：22 个回归样例锁住口径

Hook 是判据，判据就需要回归测试。我们把判据表直接写成了测试表——每行一个样例：命令、期望结果（2 = 拦，0 = 放），实跑只验证、不协商：

```bash
run_case 2 '内联 INSERT'   $'ssh prod "docker exec -i db psql -c \'INSERT INTO customers ...\'"'
run_case 0 'pm2 restart --update-env' $'ssh prod "pm2 restart api --update-env"'
run_case 0 '远端 grep 关键字' $'ssh prod "grep -rn \'UPDATE api_keys\' /app/server/"'
run_case 0 '文件管道 cat|' $'cat /tmp/x.sql | ssh prod "docker exec -i db psql"'
run_case 0 'cd && 前缀绕过（权限确认层兜底）' $'cd /x && ssh prod "psql -c \'DROP TABLE t\'"'
run_case 2 '只读查询字面含关键字（残余）' $'ssh prod "psql -c \'SELECT body FROM logs WHERE body LIKE \\'%UPDATE%\\'\'"'
```

22 个样例分四组：7 条真该拦、6 条 v1 误伤修复、6 条只读与正路、3 条已知残余面。测试表头部有一句注释：「期望列 = 已确认契约，实跑只验证不协商」——判据改动必须先改期望列再过测试，防止口头口径漂移。

这套测试很快还了一次人情。heredoc 的口径曾记录为「同样被拦」，同一天又被撤销，撤销的理由如今已不可考。口靠文档记忆会失忆，但现在口径有仲裁：本地 heredoc 落盘（`cat > x.sql <<'EOF'`，以 `cat` 开头，不进 ssh 前缀门）**不拦**；远端 heredoc（`ssh prod "… psql …" <<'EOF'`，SQL 全文进命令行）**拦**。两个样例都在测试表里，跑一遍就知道答案。

## 残余面：这道防线拦不住什么

<InfoBox variant="warning" title="注意事项">

Hook 拦截是纵深防御的**一层**，不是绝对安全。以下残余面是已知且接受的，放在这里供你评估自己的场景：

</InfoBox>

- **`cd x && ssh prod "…"` 前缀绕过**：判据锚定 `^ssh` 前缀，命令以 `cd` 开头就漏过。这层的兜底不在 Hook——Claude Code 对未在白名单的命令仍会弹权限确认，人还在环上。
- **只读查询字面含关键字仍误拦**：`SELECT body FROM logs WHERE body LIKE '%UPDATE%'` 会被拦。误拦率极低且方向安全（宁拦勿放），接受。
- **psql 子串误伤**：路径含 psql 且命令含关键字时会误拦，例如 `grep UPDATE /tmp/psql-dump.log`。
- **pg_restore 不在枚举内**：`pg_restore` 恢复备份不经 SQL 关键字，`ssh prod "pg_restore -d appdb snap.sql"` 会放行。枚举的是 SQL 写关键字，工具级的危险命令要另外覆盖。

为什么选 Hook 而不是只在 CLAUDE.md 里写规则？因为两者不是替代关系：规则是提示层，模型会忘；Hook 是机制层，忘了也拦得住；权限确认是人机层，Hook 漏掉的它兜底。三层各管一段，任何一层单独都不够。这套判据如果只记一句话：**拦「执行语义」，不拦「文本出现」**。

这已经是我们 Claude Code 工程化的第二次踩坑记录，第一次是 [VS Code 面板 500 与 GLM 多会话拒绝](/blog/claude-code-vscode-panel-500-glm-multisession)——两篇共同点都是症状指向「随机故障」，根因都在机制层。

## 常见问题

### Claude Code Hook 怎么加？

在 `settings.json` 的 `hooks.PreToolUse` 里配置 matcher 为 `Bash` 的 command hook，指向脚本绝对路径并加 `timeout: 5`。脚本从 stdin 读取含 `tool_name` 和 `tool_input.command` 的 JSON，exit 2 阻断命令并把 stderr 反馈给模型，exit 0 放行。

### Claude Code Hook 的作用是什么？

在工具调用真正执行前做一道静默闸门，适合拦高危副作用操作，比如 AI 直连生产库写数据。它不能替代权限确认与代码审查——本文 22 个回归样例之外仍有 `cd` 前缀绕过、`pg_restore` 漏拦等残余面。

### Claude Code Hook 的拦截机制是怎样的？

PreToolUse 钩子在 Bash 执行前收到含完整命令文本的 JSON，脚本用退出码表态：exit 2 阻断执行、stderr 内容回传给模型作为拦截原因，exit 0 放行。本文判据为三条件齐备：ssh 生产机前缀 + 命令含 psql + 词边界写库关键字。

### Hook 拦截误伤正常命令怎么办？

把判据从「文本包含关键字」换成「执行语义齐备」。词边界救不了 shell 命令：`sys.path.insert`、`--update-env` 这类符号本身就是边界，v1 拦截照样误伤 8 类命令；加上「命令含 psql」这个执行者条件后误伤清零，再把每条判据固化成回归样例。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
