---
title: "wp eval 正常、REST 接口 500？WordPress 上下文差异的三个坑"
description: "同一个 PDF 生成逻辑，wp eval 跑通、线上 REST 端点 500——三层根因：vendor 未入库、REST 不加载 wp-admin/includes、mPDF 临时目录跨 UID 不可写，逐层定位与解法。"
date: 2026-11-05
tags: [WordPress, REST API, WP-CLI, mPDF, WooCommerce]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么 wp eval 能跑通、REST 端点却 500？"
    a: "wp eval 走 CLI 启动，加载完整 WordPress 含 wp-admin/includes/ 下的文件；REST 请求不加载这批 admin 文件，任何 admin-only 函数（如 wp_tempnam）都会 Call to undefined function。验证线上端点时用 wp eval-file 反射调用内部方法拿真实堆栈，而不是复用 wp eval 的成功当通过依据。"
  - q: "部署后怎么快速确认 vendor 库完整？"
    a: "一条冒烟命令即可：wp eval 'echo class_exists(\"Mpdf\\\\Mpdf\") ? \"OK\" : \"MISSING\";'——服务器不执行 composer install，CI/rsync 部署的插件 vendor 目录必须在 git 里，缺失时 autoload 后第一次 new 类就 Fatal。"
  - q: "mPDF 报临时目录不可写怎么处理？"
    a: "mPDF 默认用 vendor/mpdf/mpdf/tmp/ 当临时目录，容器化部署里 rsync 保留的属主 UID（实测 1001）与 PHP-FPM 运行用户 www-data（UID 82）不匹配，is_writable 返回 false；卷挂载文件系统连 chown 都会失败。构造时显式传 tempDir = sys_get_temp_dir() 下的专用子目录并用 wp_mkdir_p 创建，所有环境都可写。"
---

在开发 [CCLEE B2B](/docs/cclee-b2b-general) 时踩到 WordPress 插件的三层隐蔽行为——WooCommerce B2B 增强插件，覆盖企业用户管理、差异化定价、报价与批量下单。出事的入口是它的 PDF 目录下载：上线时线上点击返回通用致命错误页，而同一个生成逻辑在服务器上用 `wp eval` 跑通——修好第一层，第二层爆出来；修好第二层，还有第三层。三个根因分属部署、上下文、文件系统三层，合在一篇里记录。

## TL;DR

1. **部署层**：CI/rsync 部署不跑 `composer install`，插件 `vendor/` 若被多层 `.gitignore` 屏蔽（插件级 `/vendor/` + 仓库级 `vendor/`、`plugins/`）就不会进 git，服务器上 `require autoload` 后第一次 `new` 类即 Fatal。修复 = 移除屏蔽链、vendor 强制入库，部署后用 `class_exists` 冒烟。
2. **上下文层**：REST 请求不加载 `wp-admin/includes/`，`wp_tempnam()` 这类 admin-only 函数直接 undefined；`wp eval` 正常是因为 CLI 加载了完整 WordPress——「CLI 能跑」证明不了 REST 上下文能跑。修复 = `function_exists` 判断 + `tempnam(sys_get_temp_dir(), ...)` 兜底。
3. **文件系统层**：mPDF 默认临时目录在 `vendor/mpdf/mpdf/tmp/`，容器里 rsync 保留属主 UID 1001、PHP-FPM 以 www-data（UID 82）运行，`is_writable` 为 false 且卷挂载下 `chown` 失败。修复 = 构造时显式指定 `tempDir` 到系统临时目录。

<!-- truncate -->

## 问题现象：CLI 通过、线上 500，且修一层爆一层

第一轮现象是点击 PDF 下载按钮，页面显示 WordPress 通用致命错误。此时用 `wp eval` 在服务器上直接实例化 PDF 类——成功生成。按「代码逻辑没问题」的结论修掉部署层后，症状变成：REST 端点 `/wp-json/cclee-b2b/v1/pdf-catalog` 返回 HTTP 500，`wp eval` 依然正常。第三轮修复后，500 依旧，但异常点已经从「类不存在」挪到了「目录不可写」。

服务器 access log 里 500 响应的 body 只有 858 字节——通用致命错误页的体量，说明请求在 PHP 层抛了未捕获异常，而不是业务逻辑返回的错误。

「CLI 正常、REST 失败」这个组合是最强的误导信号：它证明代码逻辑本身正确，但证明的是错误的事——两个入口的运行上下文不同。三层根因的排查顺序，正好按「修掉一层才看得见下一层」展开。

## 根因一：部署层——vendor 被 gitignore 屏蔽链整体丢掉

CI/rsync 形态的部署不执行 composer install，vendor 被 .gitignore 屏蔽链挡在 git 之外，服务器上根本没有依赖库。PDF 生成依赖 composer 库 mPDF，链路每一段单独看都「正常」：

1. 插件自己的 `.gitignore` 含 `/vendor/`（不想入库）；
2. 仓库根 `.gitignore` 的 `vendor/` 和 `plugins/` 两条规则再屏蔽一次；
3. CI 用 `actions/checkout` 拉源码——未跟踪文件天然不存在；
4. rsync 按工作区现状部署 → 服务器上没有 `vendor/`；
5. 服务器上 `require vendor/autoload.php` 因文件缺失抛 Fatal，第一轮被当作「代码问题」排查 → `new \Mpdf\Mpdf()` 类未定义 → Fatal Error。

服务器不会执行 `composer install`——CI/rsync 形态的部署里，**vendor 必须进 git**。修复三步：删插件 `.gitignore` 的 `/vendor/`、仓库根加 `!wp/plugins/<插件>/vendor/` 例外、`git add -f` 入库。

部署后的冒烟验证一条命令：

```bash
docker exec wp_cli wp eval 'echo class_exists("Mpdf\\Mpdf") ? "OK" : "MISSING";' --allow-root
```

## 根因二：上下文层——REST 不加载 wp-admin/includes

REST 请求不加载 `wp-admin/includes/` 下的文件，admin-only 函数在该上下文直接 undefined；vendor 就位后 `wp eval` 依然通过、REST 依然 500，就是两处调用踩中了这一层：

| 调用 | 为什么 REST 下失败 |
|------|-------------------|
| `wp_tempnam()` | 定义在 `wp-admin/includes/file.php`，REST 请求不加载 admin 文件 → `Call to undefined function` |
| `WC()->shop_management->get_shop_name()` | `shop_management` 不是 WooCommerce 标准属性，属性不存在 → Fatal（fallback 分支触发） |

`wp eval` 不触发这两个雷的原因在启动路径：CLI 加载完整 WordPress（含 `wp-admin/includes/`），REST 请求只加载核心运行时。任何 admin-only 函数——`wp_tempnam`、`get_file_description` 等——在 REST 上下文都是地雷。

修复：

```php
// admin-only 函数：function_exists 判断 + 系统临时目录兜底
if ( ! function_exists( 'wp_tempnam' ) ) {
    $tmp = tempnam( sys_get_temp_dir(), 'pdf' );
} else {
    $tmp = wp_tempnam( $filename );
}

// 非标准全局对象属性：换公开 API
$shop_name = get_bloginfo( 'name' );
```

## 根因三：文件系统层——mPDF 默认临时目录跨 UID 不可写

mPDF 默认临时目录落在 vendor 包内部，容器化部署下跨 UID 不可写，构造函数直接抛异常。前两层修完 500 依旧，异常源就是它。链路：

1. mPDF 默认用 `vendor/mpdf/mpdf/tmp/` 当临时目录；
2. CI 部署 rsync `--copy-links` 同步 vendor，文件属主保留为 UID 1001；
3. 容器内 PHP-FPM 以 `www-data`（UID 82）运行，`is_writable()` 返回 false；
4. mPDF 构造时检查 tempDir → 抛异常 → REST 500；
5. 尝试 `chown` 修正——卷挂载的文件系统不允许，改属主这条路直接堵死。

修复在构造时显式指定临时目录，落到所有环境都可写的系统临时区：

```php
$mpdf_tmp = sys_get_temp_dir() . '/mpdf';
if ( ! is_dir( $mpdf_tmp ) ) {
    wp_mkdir_p( $mpdf_tmp );
}

$mpdf = new \Mpdf\Mpdf( array(
    'mode'    => 'utf-8',
    'format'  => 'A4',
    'tempDir' => $mpdf_tmp,
    // ...
) );
```

## 排查方法：绕过 REST 权限拿真实堆栈

三轮定位里最省时间的一步：不用浏览器点按钮复现，而是用 `wp eval-file` 反射调用内部方法，直接拿异常堆栈：

```php
<?php
$pdf = CCLEE_B2B_PDF_Catalog::get_instance();
$ref = new ReflectionMethod( $pdf, 'generate_pdf_to_file' );
$ref->setAccessible( true );
$result = $ref->invoke( $pdf, [ wc_get_product( 187 ) ], 'single' );
echo is_wp_error( $result ) ? $result->get_error_message() : 'OK: ' . filesize( $result ) . ' bytes';
```

```bash
docker exec -i wp_cli wp eval-file - --allow-root < check-pdf.php
```

反射绕过了 REST 的权限检查与上下文缺口，直接暴露「生成动作本身」的失败点——第三轮的目录不可写就是这么从堆栈里跳出来的。注意这个方法拿到的堆栈仍不包含 REST 上下文层的错误（函数 undefined 那类），两层要分开验。

## 边界与变体

- **CLI 正常 ≠ 端点正常**：这条经验反向也成立——在 CLI 里复现 REST 上下文的正确姿势是记着 REST 不加载哪些文件，而不是期望 CLI 替你发现它们。凡是 `wp-admin/includes/` 里的函数，REST 下先 `function_exists`。
- **第三方库的默认路径假设**：mPDF 不是唯一一个把可写路径默认到 vendor 内的库。凡 composer 库涉及磁盘写入（临时文件、缓存、日志），容器化部署前先确认默认路径的属主与运行 UID 是否一致，不一致就在构造/配置处显式改到 `sys_get_temp_dir()`。
- **rsync 属主保留**：`--copy-links` 会保留源文件属主。如果部署机与容器 UID 体系不一致，vendor 目录整体错属主是常态——与其逐目录修属主，不如让代码不依赖部署目录的可写性。

## 部署核对速查

三层核对各一条规则，上线前过一遍即可拦住本文全部三类故障：

- 部署后冒烟：`wp eval 'echo class_exists("Mpdf\\Mpdf") ? "OK" : "MISSING";' --allow-root`——vendor 缺失秒级暴露
- REST 代码：`wp-admin/includes/` 下的函数一律 `function_exists` 先行（`wp_tempnam`、`get_file_description` 等）
- composer 库涉及磁盘写入：默认路径属主 ≠ 运行 UID 时，构造处显式 `tempDir` 到 `sys_get_temp_dir()`

<InfoBox variant="warning" title="注意事项">

- 「wp eval 跑通」不是 REST 端点的验收依据，两者启动加载的文件集不同；验收要打真实端点。
- admin-only 函数清单要当成 REST 插件代码的固定检查项：`wp_tempnam`、`get_file_description` 等，REST 上下文一律 `function_exists` 先行。
- 容器内遇到 Permission denied，先确认文件系统是否允许 `chown`（卷挂载常常不允许），再决定修属主还是改代码里的路径假设。

</InfoBox>

## 常见问题

### 为什么 wp eval 能跑通、REST 端点却 500？

wp eval 走 CLI 启动，加载完整 WordPress 含 wp-admin/includes/ 下的文件；REST 请求不加载这批 admin 文件，任何 admin-only 函数（如 wp_tempnam）都会 Call to undefined function。验证线上端点时用 wp eval-file 反射调用内部方法拿真实堆栈，而不是复用 wp eval 的成功当通过依据。

### 部署后怎么快速确认 vendor 库完整？

一条冒烟命令即可：`wp eval 'echo class_exists("Mpdf\\Mpdf") ? "OK" : "MISSING";'`——服务器不执行 composer install，CI/rsync 部署的插件 vendor 目录必须在 git 里，缺失时 autoload 后第一次 new 类就 Fatal。

### mPDF 报临时目录不可写怎么处理？

mPDF 默认用 vendor/mpdf/mpdf/tmp/ 当临时目录，容器化部署里 rsync 保留的属主 UID（实测 1001）与 PHP-FPM 运行用户 www-data（UID 82）不匹配，is_writable 返回 false；卷挂载文件系统连 chown 都会失败。构造时显式传 tempDir = sys_get_temp_dir() 下的专用子目录并用 wp_mkdir_p 创建，所有环境都可写。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
