---
title: "WordPress 上传同名图片，历史文章旧图被顶掉？上传去重只查磁盘"
description: "媒体库 offload 到 OSS 后删本地，同名再传直接覆盖云端旧对象，历史文章配图集体被换。根因是 wp_unique_filename 只查磁盘，解法是补磁盘、数据库、桶三面查重。"
date: 2026-11-19
tags: [WordPress, 阿里云OSS, 对象存储, CDN]
authors: [cclee]
image: "/images/blog/wordpress-offload-same-name-overwrite.webp"
schema: FAQPage
faqs:
  - q: "对象存储里被同名覆盖的旧文件还能恢复吗？"
    a: "默认不能。对象存储按 key 平铺，同名上传就是同 key 写入，旧内容被原地替换；没开版本控制（OSS 的 versioning）时旧内容不保留。我们生产站实测：同名再传后旧 key 的 ETag 变为新文件 md5，历史文章引用的 URL 不变、内容已换。"
  - q: "同名上传后，旧文件去哪里了？"
    a: "哪里也没去——它被覆盖了。对象存储没有「同名文件夹」概念，key 相同即同一对象。这正是危害隐蔽的原因：媒体库里看是两张图（WordPress 层面附件 ID 不同），云端实际只有一个对象，旧图的内容已经不存在。"
  - q: "怎么判断我的站点有没有中招？"
    a: "两个条件同时满足就是高危：媒体库 offload 且本地已删文件（纯云模式），加上历史上传过同名文件。抽查方法：对可疑图片取媒体库附件的 _wp_attached_file 作为 key，用 ossutil stat 看 LastModified 是否晚于对应文章发布时间——晚于即被覆盖过。"
  - q: "keep=0 是什么？为什么删本地会放大这个坑？"
    a: "keep=0 指纯云模式：上传同步到对象存储后删除本地文件，只留云端一份。WordPress 核心的同名去重（wp_unique_filename）只扫本地目录，本地为空时它永远判定「文件名可用」，同名再传便复用同一个 key 直接覆盖云端对象；keep=1 保留本地文件时磁盘去重恰好兜底，掩盖了这个缺口。"
---

在一个把媒体库 offload 到阿里云 OSS、启用纯云模式（keep=0）的生产站，运营重新上传了一张与历史图片同名的封面图——没有任何报错，上传成功。当天下午主题服务商报告：站里一批历史文章的配图悄悄变成了这张新图。媒体库里两张图都在，附件 ID 各自独立，看不出任何异常；只有文章页的读者知道，图已经不是原来那张。

## TL;DR

1. WordPress 核心的同名去重 `wp_unique_filename()` 只扫本地磁盘目录，**从不查数据库、更不查云端**（函数内零 `$wpdb` 调用）。媒体库 offload 且删本地后，磁盘为空 → 去重永远判定「文件名可用」→ 同名再传复用同一个对象 key → `putObject` 直接覆盖云端旧对象。
2. 收口：在 `wp_unique_filename` 过滤器（优先级 999）补三面查重——磁盘目录家族名扫描、数据库 `_wp_attached_file` 家族前缀匹配、云存储桶逐键 HEAD（原名/`-scaled`/`-rotated` × 扩展名集）；任一面占用即按 WordPress 原生 `-N` 递增改名，递增上限 20 轮，查重源出错降级随机后缀照常上传。
3. 一个容易复刻的坑：对象 key ≡ uploads 相对路径，查重键集必须带目录前缀。我们第一版用裸 basename 拼 key，单测直接抓出「子目录上传桶面全漏检」——带 `2026/11/` 前缀和裸 `hero.jpg` 是两个不同的 key。

<!-- truncate -->

这是 [CCLEE OSS](/docs/cclee-oss) 的一个真实缺陷修复（0.6.1）——WordPress 阿里云 OSS 插件，媒体库自动同步自有 Bucket、URL 重写为 OSS/CDN 域名。出问题的不是插件特有的逻辑，而是 WordPress 核心一个存在了十几年的去重边界：`wp_unique_filename()` 的设计前提是「本地磁盘是唯一的文件名真相源」，offload 架构把这个前提抽掉了。

## 问题现象：媒体库两张图，云端只剩一张

复现路径固定且无噪音：

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 早期上传 `2026/11/old.jpg`，同步 OSS，keep=0 删本地 | 正常，历史文章引用该 URL |
| 2 | 数月后重新上传同名 `old.jpg` | WP 未改名，附件 ID 是新的，URL 相同 |
| 3 | 推送层 `putObject` 同 key 写入 | 云端旧对象被静默覆盖 |
| 4 | 打开任何引用该 URL 的历史文章 | 显示的是新图 |

全程零报错、零日志告警。危害的隐蔽性来自三层叠加：URL 不变（引用无需更新）、媒体库显示正常（WordPress 层面是两个独立附件）、旧内容无痕消失（对象存储同 key 覆盖不留版本）。我们在实测站（1.3 万文件、2.2GB 媒体的存量规模）验证：同名再传后旧 key 的 ETag 立即变为新文件 md5。

## 根因：wp_unique_filename 只查磁盘

`wp_unique_filename()` 的占用判定只扫本地磁盘，全函数没有一次数据库查询——「历史上传过什么」从不参与决策。核心源码（`wp-includes/functions.php`，WP 6.x）里的去重循环（[functions.php:2589](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-includes/functions.php#L2589)）是这样的：

```php
// wp-includes/functions.php — 去重主循环
while ( file_exists( $_dir . $filename ) || ( $lc_filename && file_exists( $_dir . $lc_filename ) ) ) {
    $filename = str_replace( "$number$ext", "$new_number$ext", $filename );
    // ...递增 -N 继续
}
```

三个事实决定了它在 offload 架构下必然失守：

**事实一：唯一判定依据是 `file_exists()`。** 这个 `while` 循环扫的是本地目录，函数体内没有一处 `$wpdb` 调用——数据库里存着的全站附件 key（`_wp_attached_file`）从不参与判定。本地有 `old.jpg` 就改名，没有就放行，「历史上传过什么」完全不进入决策。

**事实二：offload 删本地后，磁盘恰好永远是空的。** 纯云模式把本地副本删掉，`file_exists()` 恒为 false。核心去重于是恒定输出「此名可用」——它不是失效，而是认真地、正确地回答了一个已经不成立的问题：「本地磁盘上有没有这个文件？」

**事实三：推送层无条件上传。** 同步插件拿到「核心已去重」的文件名后按 key 推送云端。对象存储按 key 平铺、同 key 即覆盖，于是在 `add_attachment` 到 `wp_update_attachment_metadata` 的正常钩子链里，覆盖就这样发生了——没有一个环节觉得自己在做坏事。

派生键还有第二个入口：大图缩放 `-scaled`（[image.php:336](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-admin/includes/image.php#L336)）与 EXIF 旋转 `-rotated`（[image.php:374](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-admin/includes/image.php#L374)）的派生命名不经过去重循环，上传 `hero.jpg`（≥2560px）时核心直接产出 `hero-scaled.jpg`——如果云端恰好有这个名字，同样命中覆盖。

顺带一提排查时的干扰项：keep=1 站点（本地保留文件）磁盘去重恰好兜底，同类上传不触发——这也是大量 offload 站点长期带着这个缺口无症状运行的原因，缺口只在「删本地」之后暴露。

## 解决方案：上传时补三面查重

思路直接：把去重面从「磁盘」扩回「磁盘 + 全站附件键 + 云端桶」。挂进 `wp_unique_filename` 过滤器（核心在 [functions.php:2832](https://github.com/WordPress/wordpress-develop/blob/6.8/src/wp-includes/functions.php#L2832) 输出最终名字前触发），优先级给到 999，防第三方晚挂的过滤器把查重结果再改掉：

```php
add_filter( 'wp_unique_filename', 'cclee_oss_upload_unique_guard', 999, 6 );

function cclee_oss_upload_unique_guard( $filename, $ext, $dir, $callback, $alt_filenames, $number ) {
    // 作用域门：只处理 uploads 目录内的命名，其他目录原样放行
    $upload = wp_get_upload_dir();
    if ( 0 !== strpos( $dir, trailingslashit( $upload['basedir'] ) ) ) {
        return $filename;
    }
    // 逐候选名做三面占用测试，占用则递增 -N；实现见下文三面
    return cclee_dedupe_loop( $filename, $ext, $dir );
}
```

三面各自的查法与理由：

**磁盘面——扫目录家族名，不是只查精确名。** 递增改名发生在核心循环跑完之后，核心不会再扫一遍目录；沿用 `scandir()` 取目录内全部名字做「家族根」比对（`hero-scaled-150x150` 连剥尾部 `-(WxH|scaled|rotated)` 得家族根 `hero-scaled`），才能拦住「上传 `hero.jpg` 会派生出已存在的 `hero-scaled.jpg`」这类维度后缀碰撞。

**数据库面——一条前缀 LIKE 覆盖整个递增循环。** 全站附件 key 存在 `_wp_attached_file`，格式与「uploads 相对路径」完全一致：

```php
$prefix = $relative_dir . '/' . $family_root; // 家族根，如 hero
$likes  = $wpdb->get_col( $wpdb->prepare(
    "SELECT meta_value FROM {$wpdb->postmeta}
     WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s",
    $wpdb->esc_like( $prefix ) . '%'
) );
```

前缀取**家族根**而非原始文件名：根是名字的前缀缩短形，`-N` 递增的所有候选都以它为前缀，一条查询覆盖整个循环；按原始名做前缀会漏掉「候选 `hero-scaled` → 家族根 `hero` → 库里有 `hero.jpg`」的形态。目录前缀预过滤同时防两个问题：几十万附件站的全表扫描，以及历史遗留的绝对路径脏数据混入比对。

**桶面——逐键 HEAD，键集必须带目录前缀。** 键集 = `{家族根}.{ext∈E}` + `{家族根}-scaled.{ext∈E}` + `{家族根}-rotated.{ext∈E}`，扩展名集并入输出格式转换的备选（如站点开 JPEG→WebP 自动转换时，`hero.jpg` 的写入面还包括 `hero.webp`）。这里是我们踩的弯路：

<InfoBox variant="warning" title="弯路：裸 basename 拼出的 key 查了个寂寞">
第一版桶面查重用裸文件名拼 key——HEAD 的是 `hero.jpg`，而真实对象 key 是 `2026/11/hero.jpg`。对象存储的 key 是含目录的完整路径，两个字符串毫无关系。结果单测全绿（测试夹具恰好没带子目录），一次全量回归用子目录夹具当场抓出「子目录上传桶面全漏检」。所有 key 比对必须以「uploads 相对路径」为唯一口径，我们为此在套件里固化了断言：HEAD 次数、首个 HEAD 的 key 全键匹配。
</InfoBox>

**占用判定与递增。** 「占用」定义为任一面存在家族根相等且扩展名集相交的名字（扩展名字节精确比较）。占用则按 WordPress 原生形态递增 `hero-1.jpg`、`hero-2.jpg`，每个候选重跑完整三面测试；递增上限 20 轮封顶（防云端存在 `hero-1` 到 `hero-N` 长带时 HEAD 次数失控），超限与「查重源出错」（数据库异常、桶 403/网络故障）统一降级：拼 8 位十六进制随机后缀，只对**仍然可用的面**验证后放行，上传不阻断——随机串不含字母 `x`，不会被误认成 `-WxH` 尺寸后缀。

**HEAD 404 的判断细节。** 对象存储 SDK 对 HEAD 404 的响应体是空的，错误对象里 code/message 都是空串，**HTTP 状态码是唯一可靠判据**（我们读的是 vendored aliyun oss-sdk-php 源码：`getObjectMeta` 非 2xx 时抛数组型异常，details 里只有 status 可用）。另一个陷阱：网络层错误被包装成无 status 的字符串异常，异常类型本身才是「网络/权限故障」与「键不存在」的分界——把 generic 异常一律当「键自由」会漏检，当「键占用」会让全站上传静默改名。

## 验证过程

修复（0.6.1）走三层验证，全部可复跑：

1. **纯桩单测 64 checks**：三面占用（桶面断言「零 PUT + HEAD key 全键」）、家族根判据（webp 转换、`-WxH` 孤儿、保守改名）、四类错误注入（DB 错误 / scandir 失败 / 桶 403 / 网络异常）→ 随机后缀 + 计数留痕、递增上限、回调路径形态。
2. **本地栈端到端（keep=0）**：桶内预置 `2026/11/old.jpg` → 同名再传落 `old-1.jpg`，旧对象 md5 前后不变；注入 HEAD 故障 → 文件名变 `bar-4dace4d3.jpg` 随机后缀，上传成功、计数行 +1。
3. **十套件回归**：既有 119 纯函数、36 SDK 契约、闸门/CLI/出口等十套全绿——三面查重对既有删除、重写、URL 替换行为零扰动。

## 注意事项

<InfoBox variant="warning" title="三面查重管不到的三个口子">
并发同名上传仍是竞态：两个请求的查重都发生在对方推送之前，检查时点桶里都查不到对方（核心磁盘检查有同样竞态，删本地后损害持久且难发现）。绕过 `wp_handle_upload` 的直写（解包导入、FTP/对象直传）不经 `wp_unique_filename`，天然不受保护。另外 keep=1 站点每次上传会多 3 次只读 HEAD 请求——换来的是派生键向量一并封死，这个代价我们认为值得。
</InfoBox>

## 常见问题

### 对象存储里被同名覆盖的旧文件还能恢复吗？

默认不能。对象存储按 key 平铺，同名上传就是同 key 写入，旧内容被原地替换；没开版本控制（OSS 的 versioning）时旧内容不保留。我们生产站实测：同名再传后旧 key 的 ETag 变为新文件 md5，历史文章引用的 URL 不变、内容已换。

### 同名上传后，旧文件去哪里了？

哪里也没去——它被覆盖了。对象存储没有「同名文件夹」概念，key 相同即同一对象。这正是危害隐蔽的原因：媒体库里看是两张图（WordPress 层面附件 ID 不同），云端实际只有一个对象，旧图的内容已经不存在。

### 怎么判断我的站点有没有中招？

两个条件同时满足就是高危：媒体库 offload 且本地已删文件（纯云模式），加上历史上传过同名文件。抽查方法：对可疑图片取媒体库附件的 `_wp_attached_file` 作为 key，用 ossutil stat 看 LastModified 是否晚于对应文章发布时间——晚于即被覆盖过。

### keep=0 是什么？为什么删本地会放大这个坑？

keep=0 指纯云模式：上传同步到对象存储后删除本地文件，只留云端一份。WordPress 核心的同名去重（`wp_unique_filename`）只扫本地目录，本地为空时它永远判定「文件名可用」，同名再传便复用同一个 key 直接覆盖云端对象；keep=1 保留本地文件时磁盘去重恰好兜底，掩盖了这个缺口。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
