---
title: "Airflow 3 密码改了不生效？真源是 passwords.json 而非数据库"
description: "Airflow 3 改完密码 /auth/token 仍 401：ab_user 是遗留表，真源是 SimpleAuthManager 的 passwords.json——仅启动时读取，改完必须重建 api-server 容器。"
date: 2026-09-28
tags: [Airflow, Docker, DevOps, debugging]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Airflow 2 升级到 3 后重置密码的命令为什么报错？"
    a: "3.x 部署若使用 SimpleAuthManager，FAB 的 airflow users 系列 CLI 不再可用（实测报 AttributeError: AirflowSecurityManagerV2 has no attribute find_user）。先跑 airflow config get-value core auth_manager 确认实际认证管理器，再决定改哪里。"
  - q: "SimpleAuthManager 的用户密码存在哪？"
    a: "存在 passwords.json 文件里（flat JSON，形如 {\"用户名\": \"密码\"}），路径由 AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE 指定。文件仅容器启动时读取，改完必须 docker compose up -d --force-recreate airflow-api-server 才生效。"
  - q: "为什么直接更新 ab_user 表的密码哈希不生效？"
    a: "ab_user 是 FAB 认证管理器的用户表。从 2.x 升级到 SimpleAuthManager 的部署里它是遗留数据，认证流程根本不读它——实测 rowcount=1 写入 scrypt 哈希成功，/auth/token 照旧返回 401。"
---

在 Airflow 3 上把用户密码更新之后，用新密码请求 `/auth/token` 仍返回 401——而数据库里的密码哈希确实已经改成了新值。

在开发 [AI运营](/docs/ai-analytics) 时遇到此问题——基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。平台的 DAG 触发链路依赖这套 Airflow 的 JWT 鉴权，密码轮换卡住，管道授权跟着停摆。

## 问题现象：密码改了，/auth/token 还认旧密码

新密码请求 `/auth/token` 返回 401、旧密码仍返回 201——修改动作每一步都「成功」，实际生效的始终是旧密码。这次轮换的场景是安全处置：旧密码已泄露，必须立刻换掉，所以「改了但没生效」的每一分钟都在裸奔。

第一反应是用官方 CLI 重置：

```text
$ airflow users reset-password -u apiuser -p <new>
AttributeError: 'AirflowSecurityManagerV2' object has no attribute 'find_user'
```

报错指向 FAB（Flask-AppBuilder）认证体系的安全管理器，看起来像 3.x 的版本 bug。既然 CLI 坏了，那就绕过它直接改数据库——这步走岔了，为后面更深的迷惑埋了伏笔。

## 根因：SimpleAuthManager 不读数据库，密码在 passwords.json

这套部署的认证管理器不是报错里暗示的 FAB，而是 **SimpleAuthManager**——用一条命令就能看到真相：

```bash
airflow config get-value core auth_manager
# airflow.api_fastapi.auth.managers.simple.simple_auth_manager.SimpleAuthManager
```

理清这三层，现象就完全解释得通了：

- **CLI 报错是假导**。`airflow users` 系列 CLI 属于 FAB 认证体系；SimpleAuthManager 部署上跑它，内部代码路径直接撞上 `AttributeError`。报错里的 `AirflowSecurityManagerV2` 类确实存在（作为遗留组件），但跟当前生效的认证管理器无关。
- **`ab_user` 表是遗留数据**。从 Airflow 2.x 升级上来的部署，库里留着 FAB 时代的用户表。用 SQLAlchemy 直写 `UPDATE ab_user SET password=... `（werkzeug `generate_password_hash` 生成 scrypt 哈希），返回 rowcount=1，再用 `check_password_hash` 验证——新密码与库里的哈希完全匹配。可 `/auth/token` 照旧 401：**表是真改了，只是认证流程根本不读它**。
- **真源是一个 JSON 文件**。SimpleAuthManager 的用户密码来自 `AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE` 指向的 passwords.json，内容就是扁平映射：

```json
{
  "apiuser": "<密码>",
  "admin": "<密码>"
}
```

用户-角色对应关系则由 `AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_USERS`（形如 `apiuser:admin,admin:admin`）声明。排查这类问题的第一步应该是确认「谁在管认证」，而不是急着修「认证坏了」的表象。

## 解决方案：改 passwords.json 后必须 force-recreate 容器

三步：

1. 改宿主机上的 passwords.json（compose 挂载进容器的那个源文件）：

```bash
python3 - <<'EOF'
import json
d = json.load(open('/root/workspace/ai_dag/deploy/passwords.json'))
d['apiuser'] = '<新密码>'
json.dump(d, open('/root/workspace/ai_dag/deploy/passwords.json', 'w'), indent=2)
EOF
```

2. 重建 api-server 容器。这一步不可省——密码文件**仅启动时读取**，改文件对运行中的进程没有任何影响：

```bash
cd /root/workspace/ai_dag/deploy
docker compose up -d --force-recreate airflow-api-server
```

3. 等服务就绪后双向验证——新密码必须通过、旧密码必须失效，两个断言缺一不可：

```bash
# 探活：重建后约半分钟内恢复 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/v2/monitor/health

# 新密码 → 期望 201
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"apiuser","password":"<新密码>"}'

# 旧密码 → 期望 401
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"apiuser","password":"<旧密码>"}'
```

实测结果：新密码 201、旧密码 401，轮换闭环。只验「新密码能用」不验「旧密码失效」是这类操作最常见的收尾漏洞。

<InfoBox variant="warning" title="注意事项">

- **先确认认证管理器再动手**：`airflow config get-value core auth_manager` 的输出决定密码改在哪——FAB 在数据库，SimpleAuthManager 在文件，两者路径完全不同。
- **改密码文件必须重建容器**：文件仅启动时读取，`docker compose restart` 不会让它重新加载。
- **依赖该认证的服务要同步换新密码**并重启加载，否则管道在「旧密码 401、新密码未接线」的窗口里全断。
- **重建 api-server 有秒级到半分钟的服务中断**，挑低峰执行，探活循环等 health 回 200 再做验证。

</InfoBox>

## 常见问题

### Airflow 2 升级到 3 后重置密码的命令为什么报错？

3.x 部署若使用 SimpleAuthManager，FAB 的 `airflow users` 系列 CLI 不再可用（实测报 `AttributeError: 'AirflowSecurityManagerV2' object has no attribute 'find_user'`）。先跑 `airflow config get-value core auth_manager` 确认实际认证管理器，再决定改数据库还是改文件。

### SimpleAuthManager 的用户密码存在哪？

存在 passwords.json 文件里（flat JSON，形如 `{"用户名": "密码"}`），路径由 `AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE` 指定。文件仅容器启动时读取，改完必须 `docker compose up -d --force-recreate airflow-api-server` 才生效。

### 为什么直接更新 ab_user 表的密码哈希不生效？

`ab_user` 是 FAB 认证管理器的用户表。从 2.x 升级到 SimpleAuthManager 的部署里它是遗留数据，认证流程根本不读它——实测 rowcount=1 写入 scrypt 哈希成功，`/auth/token` 照旧返回 401。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
