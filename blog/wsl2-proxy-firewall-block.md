---
title: 修复 WSL2 无法访问 Windows 宿主机代理 — 三个隐形坑
description: WSL2 无法访问宿主机代理，根因包括防火墙隐形拦截、动态 IP 变化、配置残留缓存 key。完整排查步骤与解决方案。
date: 2026-04-02
tags: [WSL2, Windows防火墙, 网络代理, 开发环境, VSCode, Claude-Code, Roo]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "WSL2 里 curl 能直连外网，但走代理就 ConnectionRefused，为什么？"
    a: "三个可能原因：(1) 防火墙拦截 vEthernet(WSL) 接口，(2) WSL 重启后代理环境变量失效，(3) 配置文件中缓存了旧的 API key。"
  - q: "为什么加了防火墙端口入站规则还是不通？"
    a: "入站规则绑定到 Profile（Domain/Private/Public），vEthernet(WSL) 不属于任何 Profile，规则根本不会对这个接口生效。"
  - q: "代理在 WSL2 里能用，但 Windows 重启后就断了，怎么解决？"
    a: "vEthernet(WSL) 的 IP 每次启动都变。在 .bashrc 中动态获取宿主机 IP，不要硬编码。"
  - q: "一条命令修复防火墙会有安全隐患吗？"
    a: "Set-NetFirewallProfile -DisabledInterfaceAliases 'vEthernet (WSL)' 仅对 WSL 虚拟网卡禁用防火墙，其他物理网卡不受影响，设置重启保留。"
  - q: "Claude Code/GLM 模式切换后报 Auth conflict 怎么排查？"
    a: "检查环境变量 `echo $ANTHROPIC_API_KEY $ANTHROPIC_AUTH_TOKEN`，清理 ~/.claude.json 缓存，删除 ~/.claude/settings.json 里的硬编码值。"
---

在 WSL2 环境下使用 Claude Code、Roo 等 AI 编程工具时，工具需要通过 Windows 宿主机代理访问 API，却反复报 `ConnectionRefused`。解决防火墙问题后，又遇到两个隐藏坑。记录完整排查过程。

## TL;DR

WSL2 的 `vEthernet (WSL)` 虚拟网卡每次启动重建，Windows 防火墙无法为其分配 Network Profile，导致**所有入站规则对这个接口都不生效**（`EnforcementStatus: NotApplicable`）。不需要加规则，直接对接口禁用防火墙即可：

```powershell
# 在 Windows PowerShell (管理员) 中执行
Set-NetFirewallProfile -DisabledInterfaceAliases "vEthernet (WSL)"
```

此外，修复防火墙后，还可能遇到**两个额外坑**：
1. **动态 IP 问题**：宿主机 IP 在 WSL/Windows 重启后变化
2. **配置缓存问题**：`~/.claude.json` 和 `~/.claude/settings.json` 里缓存了旧 API key 导致认证冲突


<!-- truncate -->
## 问题现象

环境：Windows 10 21H2 + WSL2 2.5.10.0（NAT 模式），宿主机 Clash Verge（端口 7897，Allow LAN 已开启）。

症状：

```bash
# 从 WSL ping 宿主机 — 无响应
ping 172.22.80.1

# 测试代理端口 — 无响应
nc -zv 172.22.80.1 7897

# Claude Code / Roo 报错
# API Error: ConnectionRefused

# 但直接访问外网正常
curl https://example.com  # OK
```

Windows 侧 Clash 健康运行： `netstat` 显示 `0.0.0.0:7897` 监听中，`Test-NetConnection localhost 7897` 成功。

## 根因一：防火墙隐形拦截

**`vEthernet (WSL)` 是 WSL2 每次启动时动态创建的虚拟网卡。** Windows 防火墙的 Network Profile（域/专用/公用）无法关联到这个接口。

这意味着：

1. 鯿火墙入站规则绑定到 Profile
2. vEthernet(WSL) 不属于任何 Profile
3. 所有入站规则对这个接口显示 `EnforcementStatus: NotApplicable`
4. **规则被直接跳过** — 不是拒绝，是根本不评估

无论加多少条端口规则或 InterfaceAlias 绑定都没用，因为规则根本不会对这个接口执行。

## 解决方案一：一条命令修复防火墙

### 第一步：确认根因

在 Windows PowerShell（管理员）中：

```powershell
# 查看虚拟网卡接口
Get-NetAdapter | Where-Object { $_.Name -like "*WSL*" }

# 查看入站规则的 EnforcementStatus
Get-NetFirewallRule -DisplayName "*7897*" |
  Get-NetFirewallInterfaceFilter |
  Get-NetFirewallPortFilter |
  Format-Table -Property * -AutoSize
```

如果规则存在但 WSL 仍不通，说明 Profile enforcement 是问题所在。

### 第二步：一条命令修复

```powershell
# 直接对 vEthernet(WSL) 禁用防火墙
Set-NetFirewallProfile -DisabledInterfaceAliases "vEthernet (WSL)"
```

这条命令的效果：
- 仅对 `vEthernet (WSL)` 这个虚拟网卡接口生效
- 物理网卡（Wi-Fi、以太网）的防火墙规则完全不受影响
- 设置持久化，重启后保留

### 第三步：验证

```bash
# WSL 内测试连通性
nc -zv 172.22.80.1 7897
# 输出: Connection to 172.22.80.1 7897 port [tcp/*] succeeded!

# 测试代理
curl -x http://172.22.80.1:7897 https://api.anthropic.com
```

## 根因二：动态 IP 变化

修复防火墙后，代理可能仍然失败。为什么？`vEthernet (WSL)` 的 IP 每次启动都会变。

如果在 `.bashrc` 里硬编码了 IP：
```bash
export http_proxy=http://172.22.80.1:7897  # 这个 IP 可能变了！
```

**修复**：在 `.bashrc` 中动态获取宿主机 IP：

```bash
# 从 DNS 服务器自动获取宿主机 IP
export WINDOWS_IP=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}')
export http_proxy="http://${WINDOWS_IP}:7897"
export https_proxy="http://${WINDOWS_IP}:7897"
```

## 根因三：配置文件残留缓存

修复防火墙和动态 IP 后，Claude Code/GLM 可能仍报认证冲突。为什么？缓存的 key 存在于：

1. `~/.bashrc` 顶部全局 `export ANTHROPIC_API_KEY=sk-ant-...`
2. `~/.claude.json` 里 `customApiKeyResponses.approved` 存了之前用过的 Anthropic key
3. `~/.claude/settings.json` 的 `env` 字段可能有硬编码的环境变量

切换到 GLM 模式时，`unset ANTHROPIC_API_KEY` 临时有效，但 bashrc 重新加载后又 export 了。Claude Code 读取这三个来源，发现冲突。

### 解决方案三：清理缓存 Key

```bash
# 1. 检查是否冲突
echo $ANTHROPIC_API_KEY $ANTHROPIC_AUTH_TOKEN

# 2. 清理 ~/.claude.json 缓存
cat ~/.claude.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('customApiKeyResponses', {}))"

# 3. 检查 ~/.claude/settings.json
cat ~/.claude/settings.json | grep -A2 '"env"'
```

**修复**：删除 `settings.json` 里的硬编码值：

```bash
python3 -c "
import json
with open('/home/aptop/.claude/settings.json') as f:
    d = json.load(f)
d['env'].pop('ANTHROPIC_API_KEY', None)
d['env'].pop('HTTPS_PROXY', None)
d['env'].pop('HTTP_PROXY', None)
with open('/home/aptop/.claude/settings.json', 'w') as f:
    json.dump(d, f, indent=2)
"
```

对于 `~/.claude.json`，手动编辑文件，从 `customApiKeyResponses.approved` 数组中删除过时的 key。

<InfoBox variant="warning" title="注意事项">

- **代理端口**
  - 如果你的 Clash 端口不是 7897，替换成实际端口即可，关键是修复防火墙接口而非端口
  - WSL 更新时 Windows 大版本更新可能重置虚拟网卡配置，复发时重新执行同一条命令
  - Windows 10 不支持 WSL2 的 `mirrored` 网络模式（仅 Windows 11 23H2+），不要尝试这个方向
- **动态 IP**
  - 始终在 `.bashrc` 中使用动态获取 IP，不要硬编码宿主机 IP
  - `/etc/resolv.conf` 里的 DNS 服务器 IP 在 WSL 重启后是稳定的
- **配置缓存**
  - 清理缓存 key 后需重启 Claude Code 才能生效
  - 如果认证仍然失败，按顺序检查三个来源：环境变量、`~/.claude.json`、`~/.claude/settings.json`

</InfoBox>

## 排查顺序（下次参考）

1. `echo $ANTHROPIC_API_KEY $ANTHROPIC_AUTH_TOKEN` — 确认是否冲突
2. `cat ~/.claude.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('customApiKeyResponses', {}))"` — 确认缓存 key
3. `cat ~/.claude/settings.json | grep -A2 '"env"'` — 确认 settings 里有无硬编码
4. `curl https://open.bigmodel.cn` — 确认 GLM 可达

## 死路：5 个已排除的方向

| # | 方向 | 结果 | 原因 |
|---|-----------|--------|--------|
| 1 | 代理环境变量 | 排除 | `.bashrc` unset/export 模式是设计用于模型切换 |
| 2 | Clash Allow LAN 未开启 | 排除 | Allow LAN 已开启，监听 `0.0.0.0:7897`，localhost 测试通过 |
| 3 | 防火墙端口规则 | 排除 | 添加端口 7897 入站规则后仍不通 — NotApplicable |
| 4 | 绑定规则到 InterfaceAlias | 排除 | `Set-NetFirewallRule -InterfaceAlias "vEthernet (WSL)"` 无效 |
| 5 | Mirrored 网络模式 | 排除 | Windows 10 不支持 |

核心洞察：**我们一直尝试添加规则，但问题不是缺少规则 — 而是规则对这个接口根本不生效。**

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
