---
title: "cPanel 安装踩坑：MariaDB 缺失、建户报错、国内拉包慢"
description: "全新服务器装 cPanel 的三类故障：安装器报完成但 MariaDB 静默缺失、建户遭 wwwacct.conf 连环拦截、国内拉包只有 50 KB/s。附装机验收三件套命令。"
date: 2026-09-12
tags: [cPanel, WHM, MariaDB, 服务器装机]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "cPanel 安装包在国内下载要多久？"
    a: "国内云服务器直连 httpupdate.cpanel.net 的全部镜像 IP 实测只有约 50 KB/s，安装器下载 MariaDB 这类 RPM 时可能直接超时失败；同样的源在家宽环境实测 1.8-6 MB/s。可行的加速是用本地线路建反向 SOCKS 隧道配合 proxychains 代理安装器，实测可提到约 708 KB/s（约 14 倍），装完即拆、不在服务器留任何加速配置。"
  - q: "cPanel 面板安装完成后要验证哪些组件？"
    a: "至少三件套：rpm -qa | grep -i maria 确认 MariaDB 全套装齐、systemctl is-active mysql 确认服务在跑、mysql -N -e \"select version()\" 确认能连。同时翻安装日志尾部搜 FATAL——安装器某阶段失败会照常跑完后续并报完成，日志是唯一能暴露缺口的地方。"
  - q: "cPanel 创建账户连环报 Missing 是什么原因？"
    a: "全新 WHM 没跑过 Basic Setup 向导时 /etc/wwwacct.conf 是空文件，而账户创建会强校验它。这个文件的缺失键每轮只报一个，逐个补要试五轮以上；正确做法是一次写全标准键集（ADDR、HOMEDIR、DEFMOD、LOGSTYLE、SCRIPTALIAS、NS/NS2 等），nameserver 键还要用单数形式。"
---

在全新服务器上装 cPanel，安装器跑完报「完成」，建户、装站却接连出问题——这类故障的共同点是：报错的地方不是坏的地方。

在为客户执行 [水上乐园设备商中国合规托管](/cases/waterpark-china-hosting-migration) 项目时遇到此问题——在阿里云中国区从零搭建 cPanel/WHM 托管环境，装机阶段的三类故障在同一台机器上接连出现，逐一排掉后才进入站点迁移。

## TL;DR

全新装机阶段有三类高频故障，共同特征是「表面成功、实际残缺」：安装器某阶段失败不回滚、报完成但 MariaDB 没装上；未跑 Basic Setup 向导时 wwwacct.conf 为空，建户被连环拦截；国内机器拉 httpupdate.cpanel.net 只有约 50 KB/s，RPM 下载超时还会反过来造成第一类故障。验收装机只看「三件套」：MariaDB RPM 齐全、mysql 服务在跑、客户端能连上库。

## 场景一：安装报完成，MariaDB 却没装上

WordPress 报 Database Error，服务器上 `mysql` 命令不存在，`systemctl is-active mysql` 返回 inactive——而 cPanel 安装器明明显示安装成功，面板也打得开。

翻安装日志的尾部，真凶藏在那里：

```
(FATAL): The background process "SQL Databases and dependent apps" failed ... error number 127
```

SQL 阶段的 MariaDB RPM 事务因为下载失败没有装上，但安装器的后续阶段照常执行、照常收尾，最终界面依然显示「完成」。**安装「成功」不等于组件齐全**——安装器不会因为一个阶段失败而回滚或阻断全局。

修复顺序：

1. 核实缺口：`rpm -q MariaDB-server`，大概率报未安装
2. 补装全套 RPM：MariaDB-server、MariaDB-client、MariaDB-devel、MariaDB-shared、MariaDB-common 一个不能少
3. 补完 RPM 还没完——`/usr/local/cpanel/scripts/securemysql` 不足以让恢复工具连上库，restorepkg 会报 `Missing: admin_mysql_password`。需要生成 `/root/.my.cnf`（含 client 段密码）并对 root@localhost 执行 `SET PASSWORD`

装机验收别信安装器退出码，跑三件套：

```bash
rpm -qa | grep -i maria
systemctl is-active mysql
mysql -N -e "select version()"
```

三条全绿，SQL 阶段才算真的完成。

## 场景二：首次建户，wwwacct.conf 连环报错

restorepkg 或手动建户，每轮被一个缺失键拦下，按顺序分别是：`Please setup a nameserver` → `Missing HOMEDIR` → `Missing DEFMOD` → `Missing LOGSTYLE` → `Missing SCRIPTALIAS`。

根因很直接：全新 WHM 没跑过 Basic Setup 向导时，`/etc/wwwacct.conf` 是空文件，而账户创建强校验它。坑在于这个文件的报错机制——**每轮只报一个缺失键**，逐个补要试五轮以上。

正确做法是一次写全标准键集：

```bash
cat > /etc/wwwacct.conf <<'EOF'
ADDR 172.28.100.10
CLUSTERED_DNS disabled
DEFMOD default
ETHDEV eth0
FTPHOMEDIR 0
HOMEDIR /home
HOMEMATCH home
LANG english
LOGSTYLE semicolon
MINUID 500
NS ns1.example-ns.com
NS2 ns2.example-ns.com
SCRIPT x3
SCRIPT x3parked
SCRIPT x3addon
SCRIPTALIAS y
EOF
```

三个细节：

- `ADDR` 写私网 IP 而不是公网——NAT 架构下公网 IP 不在本机网卡上，绑错的后果在 [cPanel 网站全跳默认页？阿里云 ECS 上 vhost 绑公网 IP 不生效](/blog/cpanel-aliyun-nat-default-page) 一篇里完整拆过
- `whmapi1 set_nameserver` 的参数名是**单数** `nameserver`（值 bind/powerdns/disabled），与 `get_nameserver_config` 返回的复数字段不同；且 NS 校验读取的是 wwwacct.conf 的 NS/NS2，不是 cpanel.config 里的 ns1/ns2
- 真实 DNS 在云 DNS 时，NS 填名义值即可，`CLUSTERED_DNS disabled` 配合使用

建户失败时，详情在 `/var/cpanel/transfer_sessions/<会话>/master.log` 的 JSON 里（搜 `failure`）；注意 `view_transfer` 命令本身会 tail 阻塞，排查时别被挂住。

## 场景三：国内服务器拉 cpanel.net 只有 50 KB/s

场景一的 RPM 下载失败，根源往往在这里：阿里云上海 ECS 到 httpupdate.cpanel.net 的全部镜像 IP 实测只有约 50 KB/s（国际站同区同速，排除代理中转的价值）；同一个源，家庭宽带实测 1.8-6 MB/s。

加速方案是让服务器借用本地线路：本地机器开远程动态 SOCKS，服务器装 proxychains-ng 走隧道执行安装命令：

```bash
# 本地机器：开远程动态 SOCKS
ssh -N -R 1080 root@<服务器IP>

# 服务器：装 proxychains-ng 后，让安装器走隧道
proxychains4 -q sh latest
```

实测从 50 KB/s 提到 708 KB/s，约 14 倍。但三个坑必须绕开：

- **proxychains 配置必须加 `localnet` 豁免内网段**（10/8、172.16/12、100.64/10 等），并且**去掉 proxy_dns**——否则阿里云内网镜像域名（mirrors.cloud.aliyuncs.com）被送进隧道直接失败
- **tinyproxy 与 httpupdate.cpanel.net 不兼容**，稳定返回 404，别用它做隧道出口
- **清理安装进程别用 `pkill -f "sh latest"`**——它会匹配到自己 ssh 会话的命令行，把连接自己杀掉（ssh 退出码 255 的元凶），改用 PID 精确清理

装完即拆：隧道生命周期等于本地 ssh 进程，服务器上的 proxychains-ng 与配置文件用完即卸，不留加速配置。若安装中断已造成 RPM 缺失，cPanel 自愈用 `/usr/local/cpanel/scripts/sysup` 补齐——本例中 splitlogs 缺失导致 httpd 起不来，就是 sysup 加手动补 RPM 修好的。

<InfoBox variant="warning" title="注意事项">

- 三类故障会连锁：拉包慢导致 RPM 下载失败，安装器不回滚报「完成」，缺组件又在建户或装站时爆发。排障从网络层往上看，别停留在报错的那一层。
- wwwacct.conf 的报错每轮只有一个，写一半就去试只会浪费时间，一次写全。
- 隧道加速属临时手段，服务器不留常驻代理配置；RPM 补齐后用 sysup 做一次全量校验。

</InfoBox>

## 常见问题

### cPanel 安装包在国内下载要多久？

国内云服务器直连 httpupdate.cpanel.net 的全部镜像 IP 实测只有约 50 KB/s，安装器下载 MariaDB 这类 RPM 时可能直接超时失败；同样的源在家宽环境实测 1.8-6 MB/s。可行的加速是用本地线路建反向 SOCKS 隧道配合 proxychains 代理安装器，实测可提到约 708 KB/s（约 14 倍），装完即拆、不在服务器留任何加速配置。

### cPanel 面板安装完成后要验证哪些组件？

至少三件套：`rpm -qa | grep -i maria` 确认 MariaDB 全套装齐、`systemctl is-active mysql` 确认服务在跑、`mysql -N -e "select version()"` 确认能连。同时翻安装日志尾部搜 FATAL——安装器某阶段失败会照常跑完后续并报完成，日志是唯一能暴露缺口的地方。

### cPanel 创建账户连环报 Missing 是什么原因？

全新 WHM 没跑过 Basic Setup 向导时 `/etc/wwwacct.conf` 是空文件，而账户创建会强校验它。这个文件的缺失键每轮只报一个，逐个补要试五轮以上；正确做法是一次写全标准键集（ADDR、HOMEDIR、DEFMOD、LOGSTYLE、SCRIPTALIAS、NS/NS2 等），nameserver 键还要用单数形式。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
