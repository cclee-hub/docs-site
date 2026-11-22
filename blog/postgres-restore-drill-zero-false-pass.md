---
title: "PostgreSQL 备份恢复演练表数校验恒 0=0？库名不是 schema"
description: "恢复演练表数比对恒 0=0 还判通过？库名被当 table_schema 查、psql 又硬编码连 -d postgres 维护库，表实际在 public。附修复代码与 schema 语义差异。"
date: 2026-11-22
tags: [PostgreSQL, 数据库备份]
authors: [cclee]
image: "/images/blog/postgres-restore-drill-zero-false-pass-architecture.webp"
schema: FAQPage
faqs:
  - q: "数据库恢复演练怎么做的？"
    a: "定期把备份 dump 解压导入一个临时库，再对导入结果做校验。表数比对是最低线（源库与临时库表数一致），更完整的做法再加行数核对与业务表抽样查询；只确认备份文件存在不算验证。本篇所属的托管监控按月执行真实恢复演练。"
  - q: "PostgreSQL 怎么查询一个库里有几张表？"
    a: "先连到该库本身（psql -d 库名），再执行 SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'。table_schema 填的是命名空间名（默认 public），不是库名；在其他库里执行这条查询，数不到目标库的表。"
  - q: "MySQL 和 PostgreSQL 的 schema 有什么区别？"
    a: "MySQL 中 schema 就是数据库，information_schema.tables 全局可见，WHERE table_schema='库名' 天然有效；PostgreSQL 中 schema 是数据库内部的命名空间，表默认落在 public，跨库必须重新连接。同一句 SQL 在两边语义不同，这是迁移时最常见的静默坑。"
---

在给备份恢复演练脚本加表数比对时，源库和临时库查出来的表数都是 0，比对 0=0 判「通过」——而同一个库手动数有 25 张表。

在开发 [CCLee 服务器哨兵](/docs/server-sentinel) 时踩到 PostgreSQL 的一个隐蔽语义——Linux 服务器监控预警托管：性能、可用性、安全、备份四类监控，告警归并成结论并附处置指引，每月真实恢复演练验证备份可用。

## TL;DR

PostgreSQL 里 `information_schema.tables` 的 `table_schema` 是库内命名空间（表默认在 `public`），不是库名；数一个库的表必须先连到那个库（`psql -d 库名`）再数 `public`。演练脚本两处同时错——把库名当 schema 查、又硬编码连 `-d postgres` 维护库——计数恒为 0，两个 0 相等就永远「通过」。修复为连目标库数 public 后重跑真演练，25=25。

## 问题现象：表数比对恒 0=0，导入损坏也判通过

演练状态文件里 `per_db` 记为 `"app_db:0:0"`——源库 0 张表、临时库 0 张表，比对相等，`status` 判 `ok`。这是 2026-11-22 恢复演练脚本第一次真实跑出的结果。

矛盾在两天前就埋下了：2026-11-20 的手动演练里，同一个库导入临时库后数出 25 张表。也就是说，脚本侧的表数比对从未碰到过真值——哪怕 dump 导入时缺了一半的表，`0=0` 依然相等，校验照样通过。表数为 0 的比对是一条「永远绿灯」的校验线。

## 根因：table_schema 不是库名，psql 还连错了库

两个 bug 叠在一起，单独任何一个都会让计数出错，叠在一起则让源库和临时库**同错到一个值**——比对失去了发现差异的能力。

**第一处：把库名当 schema 查。** PostgreSQL 的层级是 database → schema（命名空间）→ table，业务表默认落在 `public` 这个命名空间里。`information_schema.tables` 的 `table_schema` 列存的是命名空间名。拿库名去匹配 `table_schema`，匹配的是「有没有一个叫 app_db 的命名空间」，结果必然是空集，`COUNT` 返回 0。

**第二处：连接硬编码到维护库。** 每个 PostgreSQL 实例都有一个默认维护库 `postgres`。旧代码把连接写死成 `-d postgres`，于是在维护库里执行上面的查询——`information_schema` 只能看到当前连接库的内容，就算真有叫 app_db 的命名空间，也是在维护库里找，而不是在目标库里找。

修复前的 `db_count`：

```bash
db_count(){  # $1=engine $2=container $3=user $4=schema → 表数（对正式库只读 COUNT，不改数据）
  local sql="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$4'"
  if [ -n "$2" ]; then
    case "$1" in
      postgres) docker exec "$2" psql -U "$3" -d postgres -t -A -c "$sql" ;;
      mysql)    docker exec "$2" mysql -u "$3" -N -B -e "$sql" ;;
    esac
  else
    mysql -N -B -e "$sql"
  fi
}
```

调用处对源库和临时库各调一次：

```bash
src=$(db_count "$engine" "$container" "$u" "$db")    # 源库表数
dst=$(db_count "$engine" "$container" "$u" "$tmp")   # 演练临时库表数
```

两次调用走同一个函数、犯同样的错，于是 `src=0`、`dst=0`，`0=0` 判通过。

## MySQL 为什么不踩这个坑

MySQL 的 schema 和数据库是同义词：`CREATE DATABASE` 和 `CREATE SCHEMA` 等价，`information_schema.tables` 对整个实例全局可见，`WHERE table_schema='库名'` 就是正确写法。这套脚本同时支持两种引擎，MySQL 侧的语义被无意识地搬到了 PostgreSQL 分支——同一个函数里，`$4` 在两边根本不是同一种东西。

修复后的写法按引擎分道：

```bash
db_count(){  # $4 在 postgres 语义是目标库名，在 mysql 语义是 schema（=库名）
  if [ -n "$2" ]; then
    case "$1" in
      postgres) docker exec "$2" psql -U "$3" -d "$4" -t -A -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" ;;
      mysql)    docker exec "$2" mysql -u "$3" -N -B -e \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$4'" ;;
    esac
  else
    mysql -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$4'"
  fi
}
```

postgres 分支改了两点：`-d "$4"` 连到目标库本身，`table_schema='public'` 数默认命名空间。MySQL 分支一字未动。

## 回归测试为什么全绿：stub 镜像了错误

这套脚本带 22 条断言的回归测试，改错之前测试一直是绿的——因为测试替身（stub）是**照着实现的错误语义写的**。旧 stub 收到 SQL 后，从里面抽出 `table_schema='...'` 的值当 key 去取数：实现怎么查，stub 就怎么应。实现把库名当 schema 用，stub 也把传入参数当 schema 用，两边共用同一个错误假设，测试自然发现不了。

```bash
# 修复前：stub 按调用方的查询语义取数——传入参数当 schema
sch=$(printf '%s' "$sql" | sed -E "s/.*table_schema='([^']*)'.*/\1/")
cat "$ST/count.$sch" 2>/dev/null || echo 0

# 修复后：stub 按 -d 目标库取数（与真实 psql 行为一致）
cat "$ST/count.$tgt" 2>/dev/null || echo 0
```

教训是：stub 应该模拟**外部系统的真实契约**（`psql -d 某库` 之后 `information_schema` 会返回什么），而不是复制调用方的查询代码。stub 复制实现的那一刻，测试就只剩下「实现和它自己的影子一致」这层保证。

## 修复：连到目标库数 public

修复动作两件事：改 `db_count` 的 postgres 分支（上面已给出），同步改测试 stub 的取数逻辑。改完 22 条断言全绿，然后在客户机重跑真实演练——这次 `per_db` 记为 `app_db:25:25`（drill_date=2026-11-21），表数比对第一次碰到了真值。

备份链上的静默坑不止这一个：备份文件本身可能导不出数据——PostgreSQL 的 FORCE RLS 连 owner 会话也会拦住 COPY，产出的备份「看起来完好」。这个坑和解法写在 [Postgres pg_dump 备份没有数据？FORCE RLS 连 owner 也拦](/blog/postgres-pg-dump-empty-backup-force-rls)。另外，`information_schema.tables` 也是清理迁移残留的工具，用法见 [PostgreSQL 数据库迁移后留下废弃空表？用 information_schema 审计 schema 残留](/blog/postgresql-information-schema-audit-orphan-tables)。

<InfoBox variant="warning" title="注意事项">

- `ON_ERROR_STOP=1` 只兜住导入期的报错；导入「无报错」不等于内容完好，表数比对只是最低线，行数核对与业务表抽样查询才覆盖数据损坏。
- 同类错误会换马甲重现：查 `pg_tables` 时拿库名当 `schemaname`、查 `pg_class` 时拿库名当命名空间过滤，同样得到空集。判断标准只有一条——PostgreSQL 里这些列的语义是**命名空间**，库名只能出现在 `-d`（连哪个库）里。

</InfoBox>

## 常见问题

### 数据库恢复演练怎么做的？

定期把备份 dump 解压导入一个临时库，再对导入结果做校验。表数比对是最低线（源库与临时库表数一致），更完整的做法再加行数核对与业务表抽样查询；只确认备份文件存在不算验证。本篇所属的托管监控按月执行真实恢复演练。

### PostgreSQL 怎么查询一个库里有几张表？

先连到该库本身（`psql -d 库名`），再执行 `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'`。`table_schema` 填的是命名空间名（默认 `public`），不是库名；在其他库里执行这条查询，数不到目标库的表。

### MySQL 和 PostgreSQL 的 schema 有什么区别？

MySQL 中 schema 就是数据库，`information_schema.tables` 全局可见，`WHERE table_schema='库名'` 天然有效；PostgreSQL 中 schema 是数据库内部的命名空间，表默认落在 `public`，跨库必须重新连接。同一句 SQL 在两边语义不同，这是迁移时最常见的静默坑。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
