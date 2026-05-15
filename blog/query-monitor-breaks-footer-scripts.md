---
title: 停用插件后主题 JS 失效？检查 Query Monitor 的 footer scripts 回调
description: 排查 WordPress 主题因 Query Monitor 插件导致 theme.js 无法加载的问题，通过分析 hook 优先级定位根因并给出解决方案
date: 2026-04-04
tags: [wordpress, debugging, query-monitor, bug-fixing]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么停用 WooCommerce 后导航滚动变色失效？"
    a: "Query Monitor 的 footer scripts 回调优先级异常，阻止了主题 theme.js 加载。删除该插件即可恢复。"
  - q: "如何排查 WordPress 脚本加载问题？"
    a: "检查 HTML 是否有 </body> 标签、对比页面大小差异、用 curl 或 Playwright 验证 JS 文件是否加载。"
  - q: "Query Monitor 为什么会影响其他插件？"
    a: "Query Monitor 注册了极低优先级的 wp_print_footer_scripts 回调，可能提前终止后续脚本输出。"
---

在为客户开发 WordPress 主题时遇到此问题，记录根因与解法。

## TL;DR

WordPress 主题的导航滚动变色功能（`.is-scrolled` 类）在停用 WooCommerce 插件后失效。排查发现是 Query Monitor 插件的 `action_print_footer_scripts` 回调优先级 9999 太低，提前执行并终止了所有 footer scripts 输出。删除 Query Monitor 后问题解决。


<!-- truncate -->
## 问题现象

WordPress 主题实现了导航滚动变色功能：用户向下滚动页面时，header 添加 `.is-scrolled` 类，触发毛玻璃效果和阴影。

测试时发现：
- WooCommerce 激活时：滚动变色功能正常，页面大小 144KB
- WooCommerce 停用时：滚动变色失效，页面大小仅 94KB

通过 Playwright 测试确认：
- WooCommerce 激活时：`theme.js` 正常加载，`.is-scrolled` 类正常添加/移除
- WooCommerce 停用时：`theme.js` 未加载。页面 HTML 在 `</footer>` 后直接结束，缺少 `</body></html>`，所有 footer scripts 都没有输出

## 根因

### 排查过程

1. **检查主题 JS 入队条件**：`inc/setup.php` 第 44-50 行的 `wp_enqueue_script` 是无条件执行的，没有 WooCommerce 依赖

2. **检查页面脚本输出**：使用 `curl` 获取页面 HTML，发现 WooCommerce 停用时页面只有 2 个 script 标签（importmap, speculationrules），没有任何主题或 WordPress 核心脚本

3. **检查页面完整性**：页面 HTML 在 footer 后直接结束，缺少 `</body></html>` 标签

4. **搜索 wp_print_footer_scripts 回调**：在 `query-monitor/collectors/assets.php:55` 发现：

```php
add_action( 'wp_print_footer_scripts', array( $this, 'action_print_footer_scripts' ), 9999 );
```

### 关键发现

**优先级 9999 极低**：在 WordPress hook 系统中，数字越大优先级越低。这个回调会在所有正常脚本输出之后执行，但其内部逻辑可能提前终止了输出流程。

**无配置文件时仍激活**：Query Monitor 在没有 `query-monitor.php` 配置文件时仍会注册这个回调。

**回调行为**：`action_print_footer_scripts` 方法输出空内容并终止了后续所有脚本输出。

### 影响范围

任何依赖 `wp_print_footer_scripts` 或 `wp_footer` hook 输出的脚本都会受影响，包括：
- 主题 JavaScript（`theme.js`）
- WordPress 核心 scripts
- 其他插件的 footer scripts

## 解决方案

### 方案一：删除 Query Monitor 插件（推荐）

```bash
# 在容器内删除
docker exec -it wordpress_container rm -rf /var/www/html/wp-content/plugins/query-monitor

# 或使用 WP-CLI
wp plugin delete query-monitor
```

### 方案二：修改回调优先级

如果需要保留 Query Monitor，修改 `query-monitor/collectors/assets.php:55`：

```php
// 原代码（优先级 9999 - 太低）
add_action( 'wp_print_footer_scripts', array( $this, 'action_print_footer_scripts' ), 9999 );

// 修改为（优先级 999 - 正常范围）
add_action( 'wp_print_footer_scripts', array( $this, 'action_print_footer_scripts' ), 999 );
```

### 验证修复

```bash
# 重新测试页面大小
curl -s http://localhost:8080 | wc -c
# 应该恢复到 144KB 左右

# 检查 theme.js 是否加载
curl -s http://localhost:8080 | grep -o "theme.js"
# 应该能看到 theme.js 的 script 标签
```

<InfoBox variant="warning" title="注意事项">

排查过程中发现，Query Monitor 在某些配置下会干扰正常的 WordPress 脚本输出流程。建议仅在开发环境使用该插件，生产环境应禁用或删除。

**排查技巧总结**：
1. 页面大小对比：正常页面与异常页面大小差异明显（144KB vs 94KB）
2. HTML 完整性检查：检查是否有 `</body></html>` 结束标签
3. 脚本加载检查：使用 Playwright 或 curl 检查特定 JS 文件是否加载
4. Hook 优先级分析：搜索 `wp_print_footer_scripts` 和 `9999` 等低优先级回调
5. 插件隔离：逐个停用插件排查冲突源

</InfoBox>

---

<div className="text-center my-8">
  <a href="/about" className="button button--primary button--lg">联系合作</a>
</div>
