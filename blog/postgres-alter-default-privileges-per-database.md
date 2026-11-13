---
title: "PostgreSQL 新表 permission denied？逐库设 DEFAULT PRIVILEGES"
description: "在 postgres 库执行过授权，业务库新表照样报 permission denied（42501）——ALTER DEFAULT PRIVILEGES 是「角色 × 库」级授权，逐库执行并在同库清 DROP OWNED 残留。"
date: 2026-11-13
tags: [PostgreSQL, SQL, debugging]
authors: [cclee]
image: "/images/blog/postgres-alter-default-privileges-per-database-architecture.webp"
schema: FAQPage
faqs:
  - q: "ALTER DEFAULT PRIVILEGES 是全局的吗？换了数据库还生效吗？"
    a: "不是。作用域是「执行角色 × 所在数据库」两个维度：在 postgres 库执行，只对 postgres 库之后新建的对象生效。每个业务库都要单独执行一遍，并用 FOR ROLE 指定实际建表的角色。"
  - q: "PostgreSQL 新建表报 permission denied（SQLSTATE 42501）怎么排查？"
    a: "先看是不是「老表能查、新表不行」——是，就是默认授权缺位。在业务库里跑 SELECT count(*) FROM pg_default_acl;，结果为 0 说明这个库没设过默认授权；补一遍逐库的 ALTER DEFAULT PRIVILEGES 后，新表自动带授权。"
  - q: "DROP ROLE 报 objects depend on it 怎么清理？"
    a: "依赖多来自残留的 default privileges 条目（报错 DETAIL 里能看到 privileges for default privileges 字样）。进相关库执行 DROP OWNED BY 该角色，确认该库 SELECT count(*) FROM pg_default_acl; 返回 0，角色即可删除。"
---

在用独立的 owner 角色给多租户系统建新表时，应用角色一查就报 permission denied for table——老表都正常，新迁移出来的表一张都查不了。

在一个 Node.js + PostgreSQL 的多租户系统（行级安全隔离租户数据）里踩到 PostgreSQL 的这个授权行为。

<!-- TODO 产品建立后回填来源说明：在开发 [产品名](产品文档链接) 时踩到 PostgreSQL 的一个权限行为——{业务价值} -->

## TL;DR

`ALTER DEFAULT PRIVILEGES`（默认授权）不是全局开关：它的作用域是「哪个角色授权 × 在哪个库里执行」两个维度。在 postgres 库执行一遍，业务库的新表不会有任何默认授权——应用角色查新表照样 42501。解法两句话：每个业务库单独执行一遍；删角色报依赖时，回残留的库里 `DROP OWNED BY` 清条目。

## 问题现象：老表能查，新表报 42501

新表一建出来应用角色就查不了，而同一角色的存量表查询一切正常——权限只对「迁移之后新建的表」失效，这个形状本身就是默认授权缺位的特征。如果你搜的是「postgres 新建表没有权限」「42501 insufficient privilege」「GRANT 过了还是 permission denied」，都是同一个问题。

```sql
-- owner 角色刚迁移建出的新表，应用角色查询
ERROR:  permission denied for table vendors
SQLSTATE: 42501
```

第二个症状更隐蔽，出现在想清理角色时：

```text
ERROR:  role "app_role" cannot be dropped because some objects depend on it
DETAIL:  privileges for default privileges in database appdb
```

DETAIL 一行才是关键：依赖的不是表、不是函数，是 default privileges（默认授权）的残留条目。

## 根因：ALTER DEFAULT PRIVILEGES 是「角色 × 库」两级作用域

**默认授权跟着「执行它的那个库」走，不跨库。** `ALTER DEFAULT PRIVILEGES` 记录的是一条规则——今后在这个库、由 FOR ROLE 指定的角色（缺省是当前角色）新建的对象，自动授予 TO 后面的角色。这条规则存在库本地的 `pg_default_acl` 目录里，所以：

- 在 **postgres 库**执行 → 只对 postgres 库未来新建的对象生效
- 业务库里没执行过 → 业务库的新表不带任何默认授权
- 换一个角色建表（没写 FOR ROLE）→ 同样不命中

排查时的实际顺序是：先按教程在 postgres 库里跑了一遍「全局」默认授权，然后才开始建业务库。前几张表恰好手工 GRANT 过，一切正常；直到迁移开始自动建表，42501 才批量冒出来。第一反应是 GRANT 语句漏了表，补了一轮没用；后来清理一个废弃角色，又被 DETAIL 里的 privileges for default privileges 提示点醒——授权条目确实存在，只是存在错误的库里。

PostgreSQL 把「在哪儿执行」当作行为边界的不止这一处：docker exec 进容器 psql 免密、跨容器 TCP 就要密码的 [fe_sendauth 报错](/blog/postgres-fe-sendauth-docker-cross-container)是同款逻辑——同一套命令，换个执行位置，判定规则完全不同。

![ALTER DEFAULT PRIVILEGES 的生效范围：一个角色 × 一个库](/images/blog/postgres-alter-default-privileges-per-database-architecture.webp)

## 解决方案：授权进业务库，清残留也进同一个库

三步，全部围绕「库」这个单位：

1. **盘点哪些库有默认授权**。在每个库分别执行，业务库结果为 0 就是漏网：

```sql
SELECT count(*) FROM pg_default_acl;
```

2. **逐库执行默认授权**。TABLES 和 SEQUENCES 各一条，FOR ROLE 写实际建表的角色：

```sql
-- psql -d <业务库> 执行，不是连着 postgres 库跑
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_role;
```

3. **清角色残留**。DROP ROLE 报依赖时，进 DETAIL 点名的库（涉及 default privileges 的每个库都要走一遍）：

```sql
DROP OWNED BY app_role;
DROP ROLE app_role;
```

新库初始化时把第 2 步固化进建库脚本——建库流程里所有授权语句都强制带 `-d <库名>` 逐库执行，从根上杜绝「连着 postgres 库一把梭」的写法。

存量表默认授权管不到（它只管「之后新建」的对象），已建出的表补一句一次性授权：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
```

<InfoBox variant="warning" title="注意事项">

- **FOR ROLE 不写就是当前角色**：用超级用户执行又不写 FOR ROLE，规则挂在超级用户名下——它自己建表才生效，业务迁移用 owner 角色建表时依旧落空。
- **DROP OWNED 会连对象一起删**：它回收该角色在这个库的授权，也删除该角色拥有的对象；只在清理「专属角色」时用，别对共享角色随手执行。
- **新建数据库是新的授权空窗**：默认授权不随建库继承，「建库 → 立刻设默认授权」应该是一个固定动作，固化在建库脚本里。

</InfoBox>

## 常见问题

### ALTER DEFAULT PRIVILEGES 是全局的吗？换了数据库还生效吗？

不是。作用域是「执行角色 × 所在数据库」两个维度：在 postgres 库执行，只对 postgres 库之后新建的对象生效。每个业务库都要单独执行一遍，并用 FOR ROLE 指定实际建表的角色。

### PostgreSQL 新建表报 permission denied（SQLSTATE 42501）怎么排查？

先看是不是「老表能查、新表不行」——是，就是默认授权缺位。在业务库里跑 `SELECT count(*) FROM pg_default_acl;`，结果为 0 说明这个库没设过默认授权；补一遍逐库的 ALTER DEFAULT PRIVILEGES 后，新表自动带授权。

### DROP ROLE 报 objects depend on it 怎么清理？

依赖多来自残留的 default privileges 条目（报错 DETAIL 里能看到 privileges for default privileges 字样）。进相关库执行 `DROP OWNED BY 该角色;`，确认该库 `SELECT count(*) FROM pg_default_acl;` 返回 0，角色即可删除。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
