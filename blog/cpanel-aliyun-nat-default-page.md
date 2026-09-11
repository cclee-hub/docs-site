---
title: "cPanel 网站全跳默认页？阿里云 ECS 上 vhost 绑公网 IP 不生效"
description: "cPanel 备份恢复成功、公网访问却全落默认页？阿里云 ECS 公网 IP 是边缘 NAT 不在网卡上，vhost 绑了旧 IP 永不匹配。三处 IP 配置一起改加 rebuildhttpdconf。"
date: 2026-09-12
tags: [cPanel, 阿里云, NAT, 服务器迁移]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "网站访问跳到默认页面怎么办？"
    a: "先确认命中了哪个 vhost：主站域名日志（domlog）恒为空、请求真实存在的静态文件返回 404 且错误页样式来自默认站点目录，就是命中了默认 vhost。再用 httpd -S 对照 hostname -I，看 vhost 绑定的地址是否真的在本机网卡上——云服务器 NAT 架构下公网 IP 不在网卡，绑了就永不匹配。"
  - q: "网站访问跳到默认页面为什么打不开？"
    a: "根因是地址不匹配：阿里云 ECS 网卡上只有私网 IP，公网 IP 由边缘网关 NAT 转发、不落在本机；从旧服务器恢复的 vhost 绑定了那个本机不存在的公网地址，Apache 运行时按 IP:Port 匹配 vhost，永不命中，所有流量落进通配默认 vhost。把三处 IP 配置改成私网 IP 并重建 httpd.conf 即可恢复。"
  - q: "cPanel 账户迁移到阿里云后要改哪些 IP 配置？"
    a: "三处一起改：/etc/wwwacct.conf 的 ADDR（全局默认）、/var/cpanel/users/ 下账户文件的 IP=、/var/cpanel/userdata/ 下所有文件的 ip: 字段，改完执行 /scripts/rebuildhttpdconf 并重启 httpd。新建账户的默认 IP 由 /etc/mainip 决定，迁移前先写好私网 IP 可从源头避免复发。"
---

在阿里云 ECS 上用 cpmove 归档恢复 cPanel 账户，restorepkg 报成功、`httpd -S` 里 namevhost 一目了然——浏览器打开域名，看到的却是服务器的默认页。

在为客户执行 [中国合规托管与站点迁移](/cases/waterpark-china-hosting-migration) 项目时遇到此问题——两个中国站点整体搬迁到阿里云中国区的 cPanel 环境，恢复完成后第一次公网验证就命中了这道云架构题。

## TL;DR

阿里云 ECS 的网卡上只有私网 IP，公网 IP 是边缘 NAT、不落在本机。从旧服务器迁来的 vhost 绑定了那个本机不存在的公网地址，运行时永不匹配，所有流量落进通配默认 vhost。解法是把三处 IP 记录一起改掉（`/etc/wwwacct.conf`、`/var/cpanel/users/`、`/var/cpanel/userdata/`）再重建 httpd.conf；新账户的默认 IP 写进 `/etc/mainip`，从源头避免复发。

## 问题现象

迁移每一步看起来都成功：restorepkg 无报错，Apache 配置里 namevhost 也在。但公网验证全部落空——任何域名都指向同一个 defaultwebpage 跳转页，主站的 domlog 恒为空。

铁证是一条静态文件请求：挑一个真实存在、从未改动过的文件（如 `/some-real-page.html`）直接访问，返回 404，而且 404 错误页的样式来自 `/var/www/html/*.shtml`——那是 cPanel 默认站点的目录。自己的站点目录根本没接到请求。

```bash
$ httpd -S | grep example.cn
203.0.113.10:80                   example.cn ...
```

vhost 绑的是 `203.0.113.10`——旧服务器的公网 IP。而这台新机器的网卡上，根本没有这个地址。

## 根因

**公网 IP 不在本机。** `hostname -I` 只返回 `172.28.100.10` 这样的私网地址。阿里云 ECS 的公网 IP 是边缘 NAT：流量先到阿里云网关，再转发到实例的私网地址，公网 IP 从头到尾不出现在网卡上。

**恢复归档原样继承了旧 IP。** 旧服务器是公网 IP 直落网卡的传统 VPS，vhost 里记录的就是公网地址。cpmove 把这套配置原样搬来，vhost 的 `Address` 指向一个本机不存在的地址。

Apache 运行时按 IP:Port 匹配 vhost：请求进来，目标地址对不上任何 namevhost，于是全部落进 `*:80` 的默认 vhost（DocumentRoot 指向 `/var/www/html`）。这就是默认页、domlog 为空、404 样式对不上号三个现象的共同源头。

## 解决方案

**1. 坐实 NAT 环境。** 一条命令：

```bash
hostname -I
# 172.28.100.10   ← 只有私网段即坐实
```

**2. 三处 IP 记录一起改，缺一不可。** cPanel 的 IP 信息存了三份，各自服务不同流程——只改 userdata 能让 rebuild 出正确 vhost，但 `wwwacct.conf` 不改的话，下次创建账户又会写错。

```bash
# 2a. 全局默认（新建账户向导读取）
sed -i 's/^ADDR=.*/ADDR=172.28.100.10/' /etc/wwwacct.conf

# 新账户的默认 IP，一并写好
echo 172.28.100.10 > /etc/mainip

# 2b. 账户级记录
sed -i 's/^IP=.*/IP=172.28.100.10/' /var/cpanel/users/example

# 2c. userdata 全量替换——rebuildhttpdconf 只认这里
cd /var/cpanel/userdata/example
for f in *; do
  [ -f "$f" ] && sed -i 's/^ip: .*/ip: 172.28.100.10/' "$f"
done
```

2c 里的 `[ -f "$f" ]` 不是多余：userdata 目录里混有 `scope` 这类 socket 文件，不加判断 sed 会直接报错。

**3. 重建并重启。**

```bash
/scripts/rebuildhttpdconf
/scripts/restartsrv_httpd
```

**4. 验证。** `httpd -S` 里 namevhost 的地址应变成私网 IP；服务器上可用带 Host 头的请求自测命中哪个 vhost：

```bash
curl -s -H "Host: example.cn" http://172.28.100.10/some-real-page.html -o /dev/null -w "%{http_code}\n"
# 200 ← 不再是默认 vhost 的 404
```

最后从外部机器访问域名确认页面正常，domlog 开始进请求。

## 边界与变体

- **全新装机场景**：先写好 `/etc/wwwacct.conf` 的 ADDR 和 `/etc/mainip` 再建账户，从源头避免 vhost 绑错地址；本例是恢复迁移踩的坑，全新建户同样适用。
- **不止阿里云**：AWS 弹性 IP 等云厂商的 NAT 化公网 IP 机制相同，凡是「公网 IP 不出现在 hostname -I 里」的环境，cPanel 的 IP 配置都要按私网写。
- **本机验证盲区**：在服务器上用 127.0.0.1 或公网地址自测都会命中默认 vhost 造成误判，要连私网 IP 并带 Host 头。

<InfoBox variant="warning" title="注意事项">

- 三处 IP 记录是缓存关系不是备份关系：`/etc/wwwacct.conf` 管新建账户、`/var/cpanel/users/` 管账户元数据、userdata 管 vhost 生成，一起改才算修完。
- sed 批量替换 userdata 前先备份目录；`scope` 等 socket 文件必须跳过。
- 判断「命中默认 vhost」别只看返回 404——要同时核对 domlog 为空与错误页样式来源，两个证据齐了才算坐实。

</InfoBox>

## 常见问题

### 网站访问跳到默认页面怎么办？

先确认命中了哪个 vhost：主站域名日志（domlog）恒为空、请求真实存在的静态文件返回 404 且错误页样式来自默认站点目录，就是命中了默认 vhost。再用 `httpd -S` 对照 `hostname -I`，看 vhost 绑定的地址是否真的在本机网卡上——云服务器 NAT 架构下公网 IP 不在网卡，绑了就永不匹配。

### 网站访问跳到默认页面为什么打不开？

根因是地址不匹配：阿里云 ECS 网卡上只有私网 IP，公网 IP 由边缘网关 NAT 转发、不落在本机；从旧服务器恢复的 vhost 绑定了那个本机不存在的公网地址，Apache 运行时按 IP:Port 匹配 vhost，永不命中，所有流量落进通配默认 vhost。把三处 IP 配置改成私网 IP 并重建 httpd.conf 即可恢复。

### cPanel 账户迁移到阿里云后要改哪些 IP 配置？

三处一起改：`/etc/wwwacct.conf` 的 ADDR（全局默认）、`/var/cpanel/users/` 下账户文件的 IP=、`/var/cpanel/userdata/` 下所有文件的 ip: 字段，改完执行 `/scripts/rebuildhttpdconf` 并重启 httpd。新建账户的默认 IP 由 `/etc/mainip` 决定，迁移前先写好私网 IP 可从源头避免复发。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
