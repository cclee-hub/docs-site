---
title: "cPanel AutoSSL 不签发证书？排除列表与 vhost 证书路径"
description: "cPanel 网站证书一直自签、浏览器报不安全？两处根因：AutoSSL 域名排除列表挡住签发，或自定义 vhost 写死证书路径。附排查命令与立即签发方法，90 天证书自动续期。"
date: 2026-09-12
tags: [cPanel, AutoSSL, SSL证书, 服务器运维]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "网站证书有问题是什么原因？"
    a: "用 openssl 查看证书：issuer 与 subject 相同、CN 不含你的域名，说明站点在用自签证书，正式证书从未签发。最常见的两处根因是域名被加进 AutoSSL 排除列表、自定义 vhost 写死了证书路径。Let's Encrypt 证书有效期 90 天，排除障碍签发一次后由 AutoSSL 每日任务自动续期。"
  - q: "AutoSSL 显示 already optimal 但证书还是自签的，怎么办？"
    a: "already optimal 只表示该账户无需补签，不等于覆盖完整。先查排除列表（get_autossl_user_excluded_domains）——哪怕从没手动排除过，cpmove 迁移会带走旧机状态、新建子域也会被自动加进列表（本例单账户 9 个域名全部在列）；清掉后用 start_autossl_check_for_one_user 立即触发签发，别等每日调度。"
  - q: "网站证书不可信怎么办？"
    a: "分两步：先在服务器外的机器用 openssl s_client 确认公网实际拿到的证书；再到 /var/cpanel/logs/autossl/ 按时间戳翻签发日志定位卡点。注意本机验证要连实际业务 IP，连 127.0.0.1 会命中默认 vhost 造成误判。签发链路打通后，90 天有效期的证书由每日任务自动续期，不需要人工干预。"
---

在 cPanel 服务器上照常打开自己的网站，浏览器却报「您的连接不是私密连接」——点开证书详情，发行者是一串 cPanel 安装时生成的临时主机名，与站点域名毫无关系。

在为客户执行 [中国合规托管与站点迁移](/cases/waterpark-china-hosting-migration) 项目时遇到此问题——海外客户的两个中国站点迁入合规托管环境，「证书长期失效、访客浏览器报不安全」正是迁移前的主要遗留问题之一，最终定位为本文所述的两处根因叠加。

## TL;DR

浏览器报证书不安全、证书为自签，多数情况不是 CA 故障，而是 Let's Encrypt 正式证书从未成功签发。按顺序排查两处：先查 AutoSSL 域名排除列表（`whmapi1 get_autossl_user_excluded_domains`），清掉后用 `start_autossl_check_for_one_user` 立即触发签发；若签发成功但公网拿到的仍是自签证书，则查自定义 vhost 是否写死了 `SSLCertificateFile`。面板显示 `already optimal` 不等于覆盖完整，一切以公网实际拿到的证书 SAN 为准。

## 问题现象

外部机器对站点域名做一次证书检查：

```bash
$ openssl s_client -connect example.cn:443 -servername example.cn </dev/null 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates
subject=C = US, O = cPanel, L = Houston, ST = TX, OU = SSL Support, CN = 203-0-113-10.cprapid.com
issuer=C = US, O = cPanel, L = Houston, ST = TX, OU = SSL Support, CN = 203-0-113-10.cprapid.com
notBefore=May 21 00:00:00 2026 GMT
notAfter=Aug 19 00:00:00 2026 GMT
```

三个信号叠在一起：`issuer` 与 `subject` 完全相同（自签）、CN 是 cPanel 安装时生成的 cprapid 临时主机名（与站点域名无关）、有效期对应 cPanel 服务证书。也就是说，访客拿到的是 cPanel 的自签服务证书，Let's Encrypt 正式证书从未出现在公网。

更迷惑的是 WHM 里的 AutoSSL 状态一切正常：provider 是 Let's Encrypt、每日任务照常运行、没有任何报错。翻 AutoSSL 日志才能看到真实原因：

```
User-excluded domains: 9 (mail.example.cn, webmail.example.cn, ...)
```

账户下全部 9 个域名都在排除列表里——AutoSSL 认为这是用户意愿，每天跑到这一步就跳过，然后报一句「already optimal」收工。

## 根因

**根因一：域名排除列表挡住了签发（主因）。** AutoSSL 为每个 cPanel 账户维护一份排除域名列表，列表内的域名不参与签发。它不报错、不告警，每日任务照常执行——所以面板上看起来一切正常。排除列表有三个常见来源：

- 早期手动排除过：当时域名可能 DNS 未就绪或还在测试，排除之后忘了清
- cpmove 整包迁移原样带走：从归档恢复时，旧机的排除状态和旧证书一起落到新机
- 新建子域自动加入：cPanel 创建子域时，默认把它连同 www.* 一起写进排除列表

**根因二：自定义 vhost 写死了证书路径。** 清完排除列表、日志确认签发成功之后，外部验证拿到的仍然是自签证书——签发了，但没生效。这台服务器曾为公网 IP 路由加过一段自定义 Apache 配置（镜像 vhost），其中 `SSLCertificateFile` 写死为 `/var/cpanel/ssl/cpanel/cpanel.pem`（cPanel 自签服务证书）。cPanel 标准 httpd.conf 里的 vhost 只绑主 IP，公网流量全部命中镜像 vhost，AutoSSL 的签发结果自然永远看不见。

两处根因是叠加关系：只清排除列表，签发成功但公网看不到；只改 vhost，镜像层指向了正式证书路径，可 AutoSSL 根本没签出来。先修一、再修二，缺一不可。

## 解决方案

**1. 外部定位。** 在服务器之外的机器上跑证书检查（不要在服务器本机验证，见文末注意事项），确认 issuer 与 subject 相同后，到 WHM 服务器查排除列表：

```bash
whmapi1 get_autossl_user_excluded_domains username=example
```

**2. 清理排除列表。** `domain` 参数可以重复传多个，一次放行所有需要签发的域名：

```bash
whmapi1 remove_autossl_user_excluded_domains \
  username=example domain=example.cn domain=www.example.cn
```

mail、webmail 这类服务子域如果没有 DNS 解析或不需要证书，保留排除是合理取舍——清掉只会让每轮 DCV 验证报错刷日志，并签不出任何证书。

**3. 立即触发签发。** AutoSSL 每日任务要等调度，手动触发立刻执行：

```bash
whmapi1 start_autossl_check_for_one_user username=example
```

两个函数名细节：这个函数没有不带 `_for_one_user` 的短版本；参数名是 `username` 不是 `user`。拿不准函数名时直接翻模块源码：

```bash
grep -i autossl /usr/local/cpanel/Whostmgr/API/1/SSL.pm
```

命令行等价物是 `/usr/local/cpanel/bin/autossl_check --user=example`。签发过程看日志：`/var/cpanel/logs/autossl/` 下按时间戳建目录，日志混有二进制字符，用 `grep -a` 或 `strings` 过滤后再读。

**4. 签发成功但公网仍旧证书，查自定义 vhost。** 日志里 ACME 请求成功、证书已经落盘，公网拿到的却还是旧证书，说明流量没走标准 vhost。检索自定义配置里的写死路径：

```bash
grep -rn "SSLCertificateFile" /etc/apache2/conf.d/includes/post_virtualhost_global.conf
```

把写死的 cpanel.pem 换成按域名管理的证书路径：

```apache
SSLCertificateFile /var/cpanel/ssl/apache_tls/example.cn/combined
```

改完执行 `/scripts/restartsrv_httpd` 重启。这个 include 文件是自定义配置，cPanel 重建 httpd.conf 不会覆盖它，后续续期自动生效，改一次即可。

**5. 最终验证。** 回到外部机器重跑第 1 步的命令：issuer 应变成 Let's Encrypt 的中间证书（R3/R10/R11，随 LE 轮换），SAN 应包含站点域名。Let's Encrypt 证书有效期 90 天，此后 AutoSSL 每日任务自动续期，无需再管。

## 迁移与子域场景的变体

- **cpmove 迁移后**：排除列表和旧证书状态会原样带到新机，旧 LE 证书的 SAN 往往只有主域和 www。恢复完成后主动清一次排除列表、触发一次签发，别等每日任务。
- **新建子域**：cPanel 会自动把它连同 www.test.* 加进排除列表，建完需要再移除一次；没有 DNS 解析的 www.test.* 建议保持排除，避免每轮 DCV 验证报错。
- **ServerAlias 方式挂载的域名**：通过 userdata include 注入的别名不归 AutoSSL 管，手工编辑 userdata 的 parked_domains 再跑 updateuserdomains 也会被静默丢弃。正路是用官方 API 建子域：

```bash
uapi --user=example SubDomain addsubdomain domain=test rootdomain=example.cn dir=/home/example/public_html
```

注意参数名是 `rootdomain`，写成 `parentdomain` 会被静默忽略并报「You must specify a main domain」。

<InfoBox variant="warning" title="注意事项">

- 不要在服务器本机用 127.0.0.1 或主 IP 验证证书——会命中默认 vhost 拿到误判结果；最终结论以外部 `openssl s_client` 为准。
- whmapi1 默认输出 YAML，喂给 jq 前必须加 `--output=json`。
- 面板显示的「already optimal」只表示该账户无需补签，不代表证书覆盖完整；核对实际证书 SAN 才算数。

</InfoBox>

## 常见问题

### 网站证书有问题是什么原因？

用 openssl 查看证书：issuer 与 subject 相同、CN 不含你的域名，说明站点在用自签证书，正式证书从未签发。最常见的两处根因是域名被加进 AutoSSL 排除列表、自定义 vhost 写死了证书路径。Let's Encrypt 证书有效期 90 天，排除障碍签发一次后由 AutoSSL 每日任务自动续期。

### AutoSSL 显示 already optimal 但证书还是自签的，怎么办？

already optimal 只表示该账户无需补签，不等于覆盖完整。先查排除列表（`get_autossl_user_excluded_domains`）——哪怕从没手动排除过，cpmove 迁移会带走旧机状态、新建子域也会被自动加进列表（本例单账户 9 个域名全部在列）；清掉后用 `start_autossl_check_for_one_user` 立即触发签发，别等每日调度。

### 网站证书不可信怎么办？

分两步：先在服务器外的机器用 openssl s_client 确认公网实际拿到的证书；再到 `/var/cpanel/logs/autossl/` 按时间戳翻签发日志定位卡点。注意本机验证要连实际业务 IP，连 127.0.0.1 会命中默认 vhost 造成误判。签发链路打通后，90 天有效期的证书由每日任务自动续期，不需要人工干预。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
