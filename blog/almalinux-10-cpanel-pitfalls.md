---
title: "AlmaLinux 10 装 cPanel：TFA 不生效、资源 404、域名挂载被拒"
description: "AlmaLinux 10 跑 cPanel 138 的三类新机收尾坑：TFA 不生效、面板共享库「缺失」误判、Park 域名被 NS 归属校验拒绝。含 sshd drop-in 首值规则与 manifest 判定法。"
date: 2026-09-12
tags: [cPanel, AlmaLinux, WHM, 服务器安全]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "sshd 配置了 PermitRootLogin no 为什么 root 还能登录？"
    a: "AlmaLinux 主 sshd_config 的 Include 指令在文件顶部，sshd_config.d/ 下的 drop-in 先于主文件正文解析，而 sshd 对同名配置项取首个出现的值——所以 drop-in 能压过主文件，反之若主文件里有更早生效的值就以它为准。drop-in 之间按文件名字典序排序。改完必跑 sshd -t 语法检查，再用 sshd -T | grep permitrootlogin 确认最终生效值。"
  - q: "WHM 登录时的两步验证要怎么开启？"
    a: "先用 twofactorauth_enable_policy 打开策略总开关——策略未启用时，即使用户已写入 TOTP secret，登录表单也不会出现动态码输入步骤，登录退化为仅密码。给用户配置 secret 用 twofactorauth_set_tfa_config，注意验证码参数名是 tfa_token 而不是 code，且 TOTP 码必须用服务器时钟计算，两端时钟差 20 多秒就会跨窗口导致验证码被拒。"
  - q: "cPanel 服务器文件缺失怎么判断是不是真的缺了？"
    a: "不要看单一路径下结论，先拉 cPanel 官方 manifest 对比：httpupdate.cpanel.net 的 cpanelsync 路径下每个版本每个树都有 .cpanelsync.bz2 清单，bzgrep 检索目标路径即可确认上游是否存在该文件。同时注意 base/ 目录不全是 cpanelsync 分发——bootstrap5、sortablejs 这类库由 RPM 安装，要用 rpm -V 验证。两侧都查过才能判定真缺失。"
---

cPanel 138 装在 AlmaLinux 10 上，安装顺利、面板能开——真正的坑集中在新机收尾阶段：安全硬化、面板资源修复、域名挂载，每一步都有反直觉的行为在等着。

在为客户执行 [中国合规托管与站点迁移](/cases/waterpark-china-hosting-migration) 项目时遇到此问题——新生产机按硬化标准交付，收尾阶段三类故障在同一台 AlmaLinux 10 上集齐，本文按场景拆解。

## TL;DR

三个场景各有「表面正确、实际无效」的陷阱：TFA 给用户写完 secret 登录却不出验证码步骤——策略总开关没开，所有用户级配置不生效；前端库「缺失」要先用官方 manifest 判真伪——一部分文件上游本就不在那条 cpanelsync 树里，一部分是 digest 缓存污染让 upcp 假装成功；Park 域名被 NS 归属校验拒绝——DNS 在云上时走 userdata include 注入 ServerAlias 才是正路。

## 场景一：WHM 前端共享库「缺失」，先判真伪再修复

排查面板异常时发现 `/usr/local/cpanel/base/libraries` 不存在——先别急着当缺陷修。cPanel 138 上游本就没有这个路径，前端共享库的真实位置在别处：

- `base/frontend/jupiter/libraries/`——符号链接农场，链接指向 `../../../../3rdparty/share/<lib>`，由 jupiter 独立的 cpanelsync 树分发（含 sortablejs、ui-fonts、fontawesome、cldr）
- `base/unprotected/libraries/`——同机制，托管旧库

判定文件是否真缺失，不要看单一路径，拉官方 manifest 对比：

```bash
curl -sO http://httpupdate.cpanel.net/cpanelsync/138/<树>/.cpanelsync.bz2
bzcat .cpanelsync.bz2 | grep <目标路径>
# 条目格式：d===./路径===755 （目录）
#           l===./链接名===777===目标 （符号链接）
```

第二条铁律：`base/` 不全是 cpanelsync 分发。v138 的 `cpanel-*` RPM（bootstrap5、ace-editor、sortablejs 等）直接把库装进 `/usr/local/cpanel/3rdparty/share/<lib>/<版本>`，cpanelsync 只负责把符号链接铺进主题树。**RPM 侧用 `rpm -V <包名>` 验，cpanelsync 侧用 manifest 验，两边都要查。**

如果确认缺失、跑 `upcp --sync` 却报成功而文件没回来，检查 digest 缓存：`/usr/local/cpanel/.cpanelsync.digest` 及主题树各自的 `.cpanelsync.digest` 被中断的更新污染后，--sync 会跳过缺失文件且退出码为 0。删掉对应 digest 文件再跑 `upcp --force` 强制全量校验，缺什么补什么。

**`--sync` 报成功不等于文件齐全，最终以页面实际加载为准**——用 headless Chromium 收集 console error 与 4xx 以上请求，比任何退出码都诚实。

这个场景在硬化机上还有两个运维坑：

- root 通路首选云助手 `aliyun ecs RunCommand`（带外、免 SSH、自带审计）；`--InstanceId.1` 传实例 ID，`CommandContent` 传原始脚本而非 base64。临时提权的 sudoers 文件必须配 `/etc/cron.d` 自清理行，回收后用 `sudo -n whoami` 验证——应报 `a password is required` 才算收干净
- 批量探测 cpsrvd 会被限流：shell 循环逐条 curl 几十次后全部返回 000，误判成大面积 404。改单 curl 进程多 URL（keepalive 复用连接）即正常。另外 `pkill -f` 会匹配到自己 bash -c 的命令行，匹配串务必加 `[]` 技巧或直接用 PID

WHM 页面返回 200 也不代表登录态有效——登录页同样是 200。要抓 `<title>` 或 body 特征文本（如 Two-Factor Authentication 页的标题）做判断。

## 场景二：root 硬化连环坑

硬化目标：root 不走 SSH、面板加 TFA、sudo 最小白名单。每一步都有前置条件。

**TFA 策略总开关是前置条件。** `twofactorauth_set_tfa_config` 给用户写入 secret 后，登录表单并不一定出现动态码步骤——`twofactorauth_policy_status` 的 `is_enabled` 必须为 1（用 `twofactorauth_enable_policy` 开启），否则 WHM 登录只验密码。浏览器实测：开策略前密码直进，开后出现「Enter the security code」页。

CLI 配置 TFA 还有两个细节：`twofactorauth_set_tfa_config` 的验证码参数是 **`tfa_token`** 不是 `code`（传 code 被静默忽略，报「security code is invalid」）；TOTP 码必须用**服务器时钟**计算——两端时钟差 23 秒就跨窗口，本地算的码必拒。secret 落盘在 `/var/cpanel/authn/twofactor_auth/tfa_userdata.json`。

**无 root SSH 时跑 API 的正路是会话 + cpsess 路径。** `create_user_session` 拿到链接、curl cookie-jar 登录后，API 调用必须带 cpsess 前缀：`https://host:2087/cpsessNNN/json-api/<function>`，直接打 `/json-api/` 报 "Token denied"。`create_user_session` 的 service 参数是 `whostmgrd`（带 d），`whostmgr`/`cpanel` 都报参数无效，合法值只有 `cpaneld`/`webmaild`/`whostmgrd` 三个。

**sudoers 是全序列精确匹配。** 白名单条目里连 `--output=json` 的位置和参数顺序都被锁定，调用命令任何增删改都会被静默降级为密码认证——而 opsuser 密码锁定时就是直接拒绝。改命令必须同步改 `/etc/sudoers.d/` 对应文件。

**whmapi1 三个易踩点：** 真实路径 `/usr/local/cpanel/bin/whmapi1`（统一写真实路径，软链路径匹配性存疑）；默认输出 YAML，喂 jq 前必须 `--output=json`；`sethostname` 的参数名是 `hostname` 不是 `domain`——写 `domain=` 会静默传空直接空跑，且 cPanel 拒绝 `whm.`/`cpanel.`/`webmail.` 等自动前缀做 hostname。NS 角色禁用的机器上 sethostname 收尾报 dnsadmin socket「Connection refused」属预期，不影响切换；切换后 `create_user_session` 返回的 URL 主机名自动更新，cpsrvd 证书由 AutoSSL 机制约 1 分钟内自动签发。

**sshd drop-in 首值生效。** AlmaLinux 主 sshd_config 的 `Include sshd_config.d/*.conf` 在文件顶部，drop-in 先于主文件正文解析，而 sshd 取首个出现的值——所以 drop-in 能压过主文件正文；drop-in 之间按文件名字典序（`000-` 排在 `00-` 前）。改完必跑 `sshd -t` 加 `sshd -T | grep -E 'permitrootlogin|passwordauthentication|allowusers'` 确认最终生效值再 reload。

**Host Access Control 在这套组合上无效。** cPanel 138 + AlmaLinux 10 的 cpsrvd 不链接 libwrap（tcp_wrappers 已从 RHEL 系移除），写 `/etc/hosts.allow` 规则并重启 cpsrvd 后实测照样放行。应用层白名单交给 firewalld rich rules；hosts.allow 留着无害，未来版本若恢复 libwrap 会自动生效。

**AlmaLinux 10 的三个验证盲区：** `last` 恒空——systemd 256 弃用 wtmp，登录记录只在 journal（root 可 `journalctl -u sshd`）；opsuser 执行 `/usr/bin/su` 报 Permission denied（exec 层被限），root 密码有效性只能经 WHM 表单或 VNC 验证；`/etc/ssh/sshd_config.d/`、`/etc/cron.d/*`（600 权限）、`/var/cpanel/authn/` 对 opsuser 不可读，硬化复核须在 WHM Terminal 或 VNC 完成。

## 场景三：域名 NS 不在本机，别名挂载被拒

`uapi Park park domain=test.xxx` 被拒：域名的 NS（托管在阿里云）"not associated with this server"——cPanel 会校验域名权威 NS 是否指向本机，而国内实践中 DNS 常年托管在云 DNS，这条校验天然过不去。

不改域名 NS 的官方正路是 userdata include 注入 ServerAlias：

```bash
# http 与 https 各放一份
/etc/apache2/conf.d/userdata/std/2_4/<user>/<domain>/alias.conf
/etc/apache2/conf.d/userdata/sssl/2_4/<user>/<domain>/alias.conf
```

注意 ssl 侧目录是 `sssl/2_4`（部分版本写作 `ssl/2_4`，以 httpd.conf 中未注释的 include 行为准）。内容一行：

```apache
ServerAlias test.xxx
```

然后 `/scripts/rebuildhttpdconf` 重建。**目录名写错时 include 行会保持注释状态、静默不生效**——验证方法是看 httpd.conf 里 `Include "...userdata..."` 行有没有注释前缀。

命中验证：`httpd -S` 看别名落在哪个 vhost，再对比各 vhost 的 domlog 是否进了请求。

一个衔接提醒：用 ServerAlias 挂进来的域名不归 AutoSSL 管理，证书不会自动签发——处理方式见 [cPanel AutoSSL 不签发证书？排除列表与 vhost 证书路径](/blog/cpanel-autossl-not-issuing)。

<InfoBox variant="warning" title="注意事项">

- 硬化动作有顺序依赖：先开 TFA 策略总开关，再配用户 secret；先确认 sudoers 白名单命令可用，再禁 root SSH——顺序颠倒会把自己锁在门外。
- 判定「文件缺失」永远先对比官方 manifest，再看 RPM 侧；两个分发通道各查一遍。
- drop-in 配置改完必须用 sshd -T 看最终生效值，配置文件内容不等于运行时行为。

</InfoBox>

## 常见问题

### sshd 配置了 PermitRootLogin no 为什么 root 还能登录？

AlmaLinux 主 sshd_config 的 Include 指令在文件顶部，sshd_config.d/ 下的 drop-in 先于主文件正文解析，而 sshd 对同名配置项取首个出现的值——所以 drop-in 能压过主文件，反之若主文件里有更早生效的值就以它为准。drop-in 之间按文件名字典序排序。改完必跑 sshd -t 语法检查，再用 sshd -T | grep permitrootlogin 确认最终生效值。

### WHM 登录时的两步验证要怎么开启？

先用 twofactorauth_enable_policy 打开策略总开关——策略未启用时，即使用户已写入 TOTP secret，登录表单也不会出现动态码输入步骤，登录退化为仅密码。给用户配置 secret 用 twofactorauth_set_tfa_config，注意验证码参数名是 tfa_token 而不是 code，且 TOTP 码必须用服务器时钟计算，两端时钟差 20 多秒就会跨窗口导致验证码被拒。

### cPanel 服务器文件缺失怎么判断是不是真的缺了？

不要看单一路径下结论，先拉 cPanel 官方 manifest 对比：httpupdate.cpanel.net 的 cpanelsync 路径下每个版本每个树都有 .cpanelsync.bz2 清单，bzgrep 检索目标路径即可确认上游是否存在该文件。同时注意 base/ 目录不全是 cpanelsync 分发——bootstrap5、sortablejs 这类库由 RPM 安装，要用 rpm -V 验证。两侧都查过才能判定真缺失。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
