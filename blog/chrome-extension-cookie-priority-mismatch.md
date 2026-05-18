---
title: "Chrome 扩展采集数据全是空值？Cookie 同名不同值导致映射失败"
description: "1688 采集插件从 Cookie 取 memberId，last_mid 和 unb 两个 Cookie 值格式不同，遍历顺序决定了拿到哪个——严格匹配导致映射失败、数据全零"
date: 2026-05-18
tags: [Chrome插件, JavaScript, ecommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Chrome 扩展从 Cookie 取用户 ID，为什么有时拿到错误值？"
    a: "同一域名下多个 Cookie 可能包含不同格式的用户 ID。遍历 Cookie 数组时，谁排在前面就先匹配谁，和预设的优先级无关。"
  - q: "怎么保证优先取到正确的 Cookie？"
    a: "把优先级列表放在外层循环、Cookie 数组放在内层循环——先遍历高优先级的 key，再在所有 Cookie 中查找。"
---

在为客户构建电商数据采集系统时遇到此问题，记录根因与解法。

## TL;DR

1688 平台 Cookie 中 `last_mid` 和 `unb` 都包含用户 ID，但格式不同（`b2b-xxx` vs 纯数字）。数据库存的是 `b2b-` 前缀格式。原代码遍历 Cookie 数组时先匹配到了 `unb`，导致严格等于比较失败，所有采集数据写入时关联不到店铺，结果全是零值。

**解法**：把 Cookie key 优先级列表放在外层循环，Cookie 数组放在内层循环，确保高优先级的 key 先被查找。

## 问题现象

1688 生意参谋日报采集后，数据库里看板数据全是 0，但询盘数据有值：

```
shop_id | report_date | reveal_cnt | uv | pay_amt | effective_inq_users
       2 | 2026-05-13  |          0 |  0 |    0.00 |                  56
       2 | 2026-05-14  |          0 |  0 |    0.00 |                  41
```

后端日志报错：`No shop found for memberId: 2214126315258`

但数据库里存的 `platform_account_id` 是 `b2b-2214126315258ad300`。

## 根因

### 同域名下存在两个不同格式的用户 ID Cookie

```
unb=2214126315258                          # 纯数字
last_mid=b2b-2214126315258ad300            # b2b- 前缀 + 后缀
```

数据库映射表 `shops.platform_account_id` 存的是 `b2b-` 前缀格式。代码做的是严格等于匹配：

```javascript
const match = mapping.find(m => m.platform_account_id === memberId);
// "2214126315258" !== "b2b-2214126315258ad300" → 匹配失败
```

### 遍历顺序陷阱

原代码的外层循环是 Cookie 数组、内层是 key 列表：

```javascript
// ❌ 错误：Cookie 数组在外层，key 优先级无效
var keys = ['last_mid', '__last_memberid__', 'unb'];
for (var i = 0; i < cookies.length; i++) {     // 外层：Cookie
    var pair = cookies[i].trim();
    for (var k = 0; k < keys.length; k++) {    // 内层：key
        if (pair.indexOf(keys[k] + '=') === 0) {
            return pair.substring(keys[k].length + 1);
        }
    }
}
```

`document.cookie` 的返回顺序不是固定的。如果 `unb` 的 Cookie 在数组中排在 `last_mid` 前面，就会先匹配到 `unb`，返回纯数字格式的 ID——`last_mid` 的优先级形同虚设。

## 解决方案

**交换循环层级**：key 优先级列表放在外层，Cookie 数组放在内层：

```javascript
// ✅ 正确：key 优先级列表在外层
var keys = ['last_mid', '__last_memberid__', 'unb'];
for (var k = 0; k < keys.length; k++) {         // 外层：按优先级遍历 key
    for (var i = 0; i < cookies.length; i++) {   // 内层：在所有 Cookie 中查找
        var pair = cookies[i].trim();
        if (pair.indexOf(keys[k] + '=') === 0) {
            return pair.substring(keys[k].length + 1);
        }
    }
}
```

key 列表按优先级在外层遍历，无论 `document.cookie` 返回顺序如何，始终先查找 `last_mid`，保证拿到和数据库格式一致的用户 ID，映射不会失败。

### 验证

```javascript
// 在浏览器控制台确认两个 Cookie 都存在
document.cookie.split(';')
  .filter(c => /last_mid|unb/.test(c.trim()))
  .map(c => c.trim())
// ['unb=2214126315258', 'last_mid=b2b-2214126315258ad300']
```

<InfoBox variant="warning" title="注意事项">

Chrome 扩展中使用 `chrome.cookies.get()` 读取 Cookie 时不存在此问题——它是按名称精确查询，天然支持优先级。但 `document.cookie` 字符串解析时务必注意循环层级。另外，如果你的扩展通过 `postMessage` 传递数据，也要注意 [postMessage targetOrigin 的安全风险](/blog/2026/05/18/chrome-extension-postmessage-targetorigin-star)；如果[热重载后消息被处理两次](/blog/wxt-hmr-duplicate-message-listeners)，需要手动管理监听器生命周期。

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
