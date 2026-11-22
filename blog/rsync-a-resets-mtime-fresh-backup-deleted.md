---
title: "rsync -a 拉完的备份就被清理删掉？-a 会重置目标 mtime"
description: "cron 用 rsync -a 拉备份，快照拉好即被删（files=0）。根因：-a 把源站停更的 mtime 带到目标，find -mtime +7 判 7 天前删掉。保留期按目录名日期判，完成时刻记标记。"
date: 2026-11-23
tags: [rsync, Linux, 运维]
authors: [cclee]
image: "/images/blog/rsync-a-resets-mtime-fresh-backup-deleted.webp"
schema: FAQPage
faqs:
  - q: "find 删除 7 天前的文件，为什么把刚拉好的备份也删了？"
    a: "find -mtime +7 判的是 mtime，即内容最后一次被修改的时间。rsync -a 会把源端的目录 mtime 原样带到目标端，源站顶层目录又长期停更，这个值一直停在 20 多天前——mtime 旧不代表本轮备份旧。保留期改按目录名日期比较，不要用 mtime。"
  - q: "rsync -a 会保留目录的修改时间吗？"
    a: "会。-a 等价于 -rlptgoD 六个旗标，其中 -t 保留 mtime、-r 递归，目录的修改时间同样按源端原样保留。所以目标目录的 mtime 是「源站目录最后修改时间」，不是「拉取完成时刻」——后者要用标记文件自己记录。"
  - q: "拉取脚本手动跑必成、挂到 cron 就拉空，是权限问题吗？"
    a: "这次不是。strace 显示败轮传输完整（目录树、jpg 全落盘），CRLF、flock、磁盘、环境变量逐一排除全阴性，真因是清理行删掉了刚拉好的快照，连续三轮 files=0。先查脚本每一行的副作用，再怀疑执行形态。"
  - q: "备份快照的保留期判据应该用什么？"
    a: "目录名日期或完成标记文件的 mtime：拉取完成后 touch 一个 .pull-complete，保留期与「卡没卡住」的判断都读这个标记。两者都不会被 rsync -a 重置；行数核对类判据同理，不依赖会被传输改写的字段。"
---

在一条「cron 定时拉取源站附件、按目录名留 7 天快照」的备份链路里，拉取脚本手动跑次次正常，挂上 cron 后快照目录连续三轮 `files=0`——文件明明拉到位，转头就被清掉了。

## TL;DR

`rsync -a` 的 a（archive）会把源端的 mtime **原样带到目标端，目录也不例外**——目标目录的修改时间是「源站对应目录的修改时间」，不是「这一轮拉取完成」的时刻。源站顶层目录长期停更（新附件只进深层子目录）时，这个值一直停在过去；脚本尾部按 `find -mtime +7` 清理时，当轮刚拉好的快照被判成「7 天前」整目录删掉。「手动必成、cron 必败」是假相关：手动测试只跑 rsync 行，从不跑清理行。解法：**保留期判据禁用 mtime，按目录名日期比较；「拉取完成时刻」用标记文件的 mtime 记录。**

## 问题现象

定时链路的表现是「拉好即删」：cron 轮的快照目录存在、传输日志无异常，但目录里 `files=0`；同一脚本手动执行，文件全在。连续三轮如此。

先按常规嫌疑逐个排除：CRLF 行尾、flock 的 fd 占用、磁盘空间、cron 与终端的环境差异、执行形态（内联 heredoc 精简版 vs 脚本文件）——全部阴性。期间形成一个强假相关：**「脚本必败、内联精简版必成」**，排查被引向执行形态，绕了两圈。

转折在 strace：败轮的传输其实是完整的——目录树 mkdir、jpg 数据落盘全都有记录。也就是说 rsync 干完了活，文件是**之后**消失的。把视线从「传输」挪到「传输之后还有哪行」，才注意到脚本尾部的清理行。

> 这套链路在数据库侧有个姊妹坑：[pg_dump 备份没有数据？FORCE RLS 连 owner 也拦](/blog/postgres-pg-dump-empty-backup-force-rls)——同样是「命令退出正常，内容是空的」。

## 根因：rsync -a 重置了目标目录的 mtime

清理行删的不是「没拉到的文件」，是「被判旧的目录」——判据用错了时间源。三环叠加，缺一环都不会发作：

**第一环：`-a` 保留源端时间戳，目录也不例外。** `-a` 等价于 `-rlptgoD` 六个旗标，其中 `-t` 保留 mtime、`-r` 递归。同步完成后，目标目录树的 mtime = 源站对应目录的 mtime，「拉取完成」这个时刻不被记录在任何被同步的路径上。

**第二环：源站顶层目录的 mtime 停更。** 新附件全部落在深层子目录里，顶层目录 `uploads/` 自身的 mtime 停在上次顶层变化（本例是 10-30）。于是每轮快照的顶层 mtime 都继承到同一个旧值。

**第三环：清理判据 `find -mtime +7`。** 今天是 11-23，快照顶层 mtime 是 10-30，相差 24 天，大于保留期 7 天——`-mtime +7` 命中，整目录删除。每轮都如此：**拉好即删**。

![根因链路：rsync -a 把源站冻结的 mtime 带到目标，find -mtime +7 把当轮快照判旧删除](/images/blog/rsync-a-resets-mtime-fresh-backup-deleted.webp)

「内联必成」也顺带解开：内联测试只跑传输行、从不跑清理行，所以怎么测都「必成」——它和脚本的本质差异不是执行形态，是**有没有跑 find 那一行**。

最小复现，几条命令就能看到 mtime 被谁决定：

```bash
mkdir -p /tmp/demo/src/uploads/2026-11-23
echo x > /tmp/demo/src/uploads/2026-11-23/a.jpg
touch -d '2026-10-30' /tmp/demo/src/uploads          # 模拟顶层长期停更

mkdir -p /tmp/demo/dst
rsync -a /tmp/demo/src/uploads /tmp/demo/dst/snap

stat -c '%y %n' /tmp/demo/dst/snap                   # 2026-10-30 ← 继承自源站
find /tmp/demo/dst -maxdepth 1 -type d -mtime +7 -print
# → /tmp/demo/dst/snap   ← 清理行删的就是它
```

## 解法：保留期按目录名日期判，完成时刻记标记

结论先行：**清理判据换掉时间源**——保留期不用 mtime，用目录名里的日期；「拉取完成时刻」单独记录在一个不被同步的标记文件上。

```bash
# 保留期：按目录名日期比较（ISO 格式字典序即可比较）
cutoff=$(date -d '7 days ago' +%Y-%m-%d)
for d in /data/snapshots/20*-*-*; do
  name=$(basename "$d")
  [[ "$name" < "$cutoff" ]] && rm -rf "$d"
done

# 完成时刻：拉取完成后 touch 标记，后续判断读标记的 mtime
rsync -a "$SRC_HOST:uploads/" "$SNAP_DIR/"
touch "$SNAP_DIR/.pull-complete"
# 判断距完成多久：stat -c %Y "$SNAP_DIR/.pull-complete"
```

两类判据的分工：**目录名日期**回答「这轮快照该不该留」，**标记文件 mtime** 回答「这轮拉了多久、有没有卡住」。两处都避开「被 rsync 写进来的 mtime」，因为那个字段的语义是「源站什么时候改的」，不是「我什么时候拉的」。

修复落在上面两处后，cron 轮不再出现 `files=0`。

## 场景 2：root 在 /tmp 建锁文件报 Permission denied？fs.protected_regular 在管

root 也会被拒：同一台机器排障期间，root 在 `/tmp` 对**他人已有的**锁文件 `open(O_CREAT)` 报 `EACCES`。Ubuntu 的 `fs.protected_regular` 对 sticky 目录（`/tmp`）生效，root 不豁免。解法：锁文件、交换文件放 `/run`，不放 `/tmp`。

## 场景 3：rsync 只读限制「查不到」？限制挂在专用传输用户上

常用登录用户上怎么查都没有——限制在专用传输用户的 `authorized_keys` `command=` 选项里（rrsync）。排查 ssh 限制先分清 key 归属哪个用户，再查对应用户的 `authorized_keys`。

## 场景 4：--link-dest 指向不存在的目录，rsync 照样退出 0？硬链接悄悄失效

rsync 3.2.7 上，`--link-dest` 指向不存在的路径只给 warning、退出码仍是 0——不致败，但硬链接的省空间机制整轮失效。解法：跑之前确认 link-dest 目标存在，或对 warning 告警。

## 场景 5：ssh 远程命令里 grep $'\r' 恒命中？多层引号下的假阳性

远端检测 CRLF 用 `grep -c $'\r'`，多层引号传到远端后 `$'\r'` 被远端 shell 当普通模式展开，恒命中、假阳性。CR 检测改用 `awk '/\r/'` 判定。

<InfoBox variant="warning" title="注意事项">

- 一切「保留期 / 清理 / 冷却」类判据，避开会被传输工具改写的字段：目录 mtime 会被 `-a` 重置，按目录名日期或完成标记判。
- 手写清理先用 `-print` 跑几轮确认命中集，再换 `-delete`。
- `--link-dest` 的目标目录须存在；3.2.7 对悬空目标只 warning、退出码 0。
- 锁文件与交换文件放 `/run`，避开 `/tmp` 的 `fs.protected_regular` 限制。

</InfoBox>

## 常见问题

### find 删除 7 天前的文件，为什么把刚拉好的备份也删了？

find `-mtime +7` 判的是 mtime——内容最后一次被修改的时间。`rsync -a` 把源端的目录 mtime 原样带到目标端，源站顶层目录又长期停更，这个值一直停在 20 多天前；mtime 旧不代表本轮备份旧。备份保留期改按目录名日期比较，不用 mtime。

### rsync -a 会保留目录的修改时间吗？

会。`-a` 等价于 `-rlptgoD` 六个旗标，`-t` 保留 mtime、`-r` 递归，目录的修改时间同样按源端保留。所以目标目录的 mtime 是「源站目录最后修改时间」，不是「拉取完成时刻」——后者要用标记文件自己记录。

### 拉取脚本手动跑必成、挂到 cron 就拉空，是权限问题吗？

这次不是。strace 显示败轮传输完整，CRLF、flock、磁盘、环境变量逐一排除全阴性，真因是清理行删掉了刚拉好的快照（连续三轮 `files=0`）。手动必成、定时必败，先查脚本每一行的副作用，再怀疑执行形态。

### 备份快照的保留期判据应该用什么？

目录名日期或完成标记文件的 mtime：拉取完成后 `touch` 一个 `.pull-complete`，保留期与「卡没卡住」的判断都读这个标记。两者都不会被 `rsync -a` 重置；与备份类似的行数核对类判据同理，不依赖会被传输改写的字段。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
