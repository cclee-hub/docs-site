---
title: "WordPress 插件 PDF 下载 500？部署与 REST 上下文的三个坑"
description: "PDF 下载先报 critical error、修完又 500？三个坑排成一条链：vendor 未进 git、REST 不加载 wp-admin/includes、mPDF 临时目录不可写。逐坑给出根因与修复代码。"
date: 2026-10-10
tags: [WordPress, WooCommerce, mPDF, REST API, 容器化部署]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 wp eval 能跑、REST 端点却 500？"
    a: "CLI 环境加载完整 WordPress（含 wp-admin/includes/），REST 请求不加载这个目录。依赖 admin-only 函数（如 wp_tempnam）的代码在 wp eval 下一切正常，进 REST 就 Fatal Error——两个上下文装载的文件集不同。"
  - q: "怎么快速定位 REST 500 背后的具体异常？"
    a: "用 wp eval-file 直接调用插件的内部方法，绕过 REST 路由与权限检查，异常堆栈一步到位；比在 REST 响应里只看到一个 858 字节的 500 页面高效得多。"
  - q: "容器化部署 WordPress 插件要在服务器上跑 composer install 吗？"
    a: "不要指望它——CI + rsync 部署链路里服务器不会执行 composer install，vendor 目录必须进 git、随 rsync 落到服务器。插件自己的 .gitignore 若排除了 /vendor/，部署出的插件就是缺库的。"
  - q: "第三方库自带的临时目录为什么在容器里不可写？"
    a: "rsync 同步时保留源机器的属主 UID（如 1001），容器内 PHP-FPM 以另一身份运行（如 www-data 的 82），vendor 内的默认临时目录随之不可写；容器卷挂载的文件系统还常常不允许 chown。显式把 tempDir 指到 sys_get_temp_dir() 即可。"
---

在商品页点击 PDF 目录下载时，页面先弹出 WordPress 的 "There has been a critical error on this website"；把缺库问题修完，同一个端点又改报 HTTP 500——三个独立的坑，排成了同一条故障链。

在开发 [CCLEE B2B](/docs/cclee-b2b-general)（WooCommerce B2B 增强插件，覆盖企业用户管理、差异化定价、批量下单）的 PDF 目录下载功能时，三个坑挨个踩了一遍。

## TL;DR

| 坑 | 根因 | 修复 |
|----|------|------|
| critical error | vendor 未进 git，rsync 部署缺库 | .gitignore 例外 + 强制提交 vendor |
| REST 端点 500 | admin-only 函数在 REST 上下文不存在 | `function_exists` 判断 + `tempnam()` 兜底 |
| 修完仍 500 | mPDF 默认临时目录容器内不可写 | `tempDir` 显式指向 `sys_get_temp_dir()` |

三个坑共享一个背景：CI + rsync 的容器化部署链路。排完这条链的插件，在任何标准 LAMP 环境都不会复现——它们几乎全是容器化与 REST 上下文的组合产物。

## 场景一：下载报 "There has been a critical error"——vendor 没上服务器

**现象**：本地一切正常，部署后点下载即见 WordPress 通用致命错误页。

**根因**：`vendor/`（mPDF 库）没到服务器。链路是双重的：插件自己的 `.gitignore` 排除了 `/vendor/`；仓库根 `.gitignore` 又有 `vendor/` 与 `plugins/` 两条规则，即使文件被跟踪也会被顶层规则遮蔽。CI 的 checkout 跳过未跟踪文件，rsync 如实镜像了一个缺库目录，服务器上 `require_once vendor/autoload.php` 直接 Fatal。

**修复**：插件 `.gitignore` 移除 `/vendor/`，仓库根添加例外规则，再强制提交：

```bash
git add -f wp/plugins/cclee-b2b/vendor/
```

WordPress 插件走 CI + rsync 部署时，服务器不会执行 `composer install`——vendor 必须当作源码的一部分进 git。

## 场景二：wp eval 正常、REST 端点 500——admin 函数缺席

**现象**：vendor 齐了之后，`wp eval` 直接调 PDF 生成方法一切正常；REST 端点 `/wp-json/cclee-b2b/v1/pdf-catalog` 却返回 500。

**根因**：两处不兼容 REST 上下文的调用。`wp_tempnam()` 定义在 `wp-admin/includes/file.php`——REST 请求不加载这个目录，调用即 Fatal；`WC()->shop_management` 也非 WooCommerce 公开属性，fallback 路径一触发同样 Fatal。`wp eval` 不触发，恰恰因为 CLI 加载了包含 admin 文件的完整 WordPress。

**修复**：admin 函数加存在性判断并给原生兜底：

```php
$tmp = function_exists( 'wp_tempnam' )
	? wp_tempnam( $filename )
	: tempnam( sys_get_temp_dir(), 'pdf' );
```

店铺名改走公开 API：`get_bloginfo( 'name' )`。REST 上下文里，任何 `wp-admin/includes/` 下的函数都当不存在来写。

## 场景三：依赖齐了仍 500——mPDF 临时目录不可写

**现象**：类加载正常、代码不再 Fatal，REST 依然 500。服务器 access log 只留下一行 858 字节的响应。

**根因**：mPDF 默认用 `vendor/mpdf/mpdf/tmp/` 当临时目录；rsync 保留源机器属主 UID 1001，容器内 PHP-FPM 以 www-data（UID 82）运行，目录不可写，mPDF 构造函数抛异常。容器里想 `chown` 补救，卷挂载的文件系统又不允许。

**修复**：构造时显式指定临时目录到系统 `/tmp`：

```php
$mpdf_tmp = sys_get_temp_dir() . '/mpdf';
if ( ! is_dir( $mpdf_tmp ) ) {
	wp_mkdir_p( $mpdf_tmp );
}

$mpdf = new \Mpdf\Mpdf( array(
	'mode'    => 'utf-8',
	'format'  => 'A4',
	'tempDir' => $mpdf_tmp,
) );
```

排查这类 500 有个捷径：`wp eval-file` 直接调用内部方法，绕过 REST 路由与权限检查，异常堆栈一步到位。同类静默坑在 WooCommerce 定制里不止一处——[PPCP 按钮静默跳过](/blog/woocommerce-ppcp-buttons-not-rendering-form-cart)是另一例。

<InfoBox variant="warning" title="注意事项">

三个修复要按顺序验证：vendor 到位后再测 REST 上下文，最后才轮到临时目录——跳步验证会让 500 的归因错位。另外 `function_exists` 兜底不是长期形态，若插件支持非 admin 上下文运行，自定义的临时文件逻辑应完全不依赖 `wp-admin/includes/`。

</InfoBox>

## 常见问题

### 为什么 wp eval 能跑、REST 端点却 500？

CLI 环境加载完整 WordPress（含 `wp-admin/includes/`），REST 请求不加载这个目录。依赖 admin-only 函数（如 `wp_tempnam`）的代码在 `wp eval` 下一切正常，进 REST 就 Fatal Error——两个上下文装载的文件集不同。

### 怎么快速定位 REST 500 背后的具体异常？

用 `wp eval-file` 直接调用插件的内部方法，绕过 REST 路由与权限检查，异常堆栈一步到位；比在 REST 响应里只看到一个 858 字节的 500 页面高效得多。

### 容器化部署 WordPress 插件要在服务器上跑 composer install 吗？

不要指望它——CI + rsync 部署链路里服务器不会执行 `composer install`，vendor 目录必须进 git、随 rsync 落到服务器。插件自己的 `.gitignore` 若排除了 `/vendor/`，部署出的插件就是缺库的。

### 第三方库自带的临时目录为什么在容器里不可写？

rsync 同步时保留源机器的属主 UID（如 1001），容器内 PHP-FPM 以另一身份运行（如 www-data 的 82），vendor 内的默认临时目录随之不可写；容器卷挂载的文件系统还常常不允许 chown。显式把 `tempDir` 指到 `sys_get_temp_dir()` 即可。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
