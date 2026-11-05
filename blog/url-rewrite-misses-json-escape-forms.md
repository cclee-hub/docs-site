---
title: "WordPress 换域后轮播大图仍回源主域？URL 重写不认 JSON 转义"
description: "全站换域后轮播图与视频仍回源主域：URL 藏在 JSON 转义字节流里，明文 str_replace 也失配。三态转义对照、三态替换做法与保存回写 fixpoint 验证。"
date: 2026-11-05
tags: [WordPress, CDN, Slider Revolution, JSON]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "JSON 转义过的 URL 为什么明文替换都匹配不到？"
    a: "同一个 URL 在字节流里有明文、单转义（https:\\/\\/）、双转义（https:\\\\/\\\\/）三种形态。单转义形态里不存在连续的 https:// 前缀——斜杠被 \\/ 打断，任何只找明文的 str_replace 都会静默失配。替换前先抓库确认目标字段处于哪种形态，按形态逐态替换。"
  - q: "数据库换域替换命令对 JSON 和序列化字段有什么注意事项？"
    a: "PHP serialized 字段带 s:长度: 前缀，URL 变长后裸 str_replace 会破坏结构，必须走 unserialize/serialize 或长度安全的替换工具；JSON 字段没有长度前缀，按转义形态做字节流替换即可。我们把 RevSlider 的 slides、sliders7、slides7 三张表按三态替换收口 204 处，替换前后结构完好。"
  - q: "替换落库后，后台保存会不会把旧域名写回去？"
    a: "用两跳 fixpoint 验证：保存一次→抓库比对字节流→再保存一次→再比对，连续两跳落库内容不变即可确认无回写。我们对 Slider Revolution 的保存路径实测两跳均原样落库，旧域不会被写回。"
---

在为客户站点做 CDN 换域收尾验证时，首页轮播的大图与一段 47MB 背景视频仍回源主域，占着 5Mbps 的共享出口管道；奇怪的是同一元素 `noscript` 回退里的图片地址已经是 CDN 域——同一段 HTML 里，一半换了一半没换。

## TL;DR

1. URL 不只在 `src="..."` 里。轮播插件把图片地址存在内联 JSON（`"src":"..."` 冒号形态）里，还可能被二次转义成 `https:\/\/` 字节流——属性语法匹配面（`src=`/`srcset=`/`href=`，且属性名前须空白符）对这三处全部失配，明文 `str_replace` 对单转义形态也失配。
2. 收口走存储侧三态替换：先抓库确认字段形态，再按明文/单转义/双转义逐态替换。RevSlider 的 `slides`、`slides7` 两类三张表按此收口 204 处；PHP serialized 字段必须走序列化引擎，JSON 字段可直接字节流替换。
3. 落库后跑两跳保存 fixpoint：连续两次保存后库内字节流不变，确认编辑器保存不会把旧域名写回。

<!-- truncate -->

这是 [制造企业中国站全托管](/cases/waterpark-china-hosting-migration) 案例的第二篇踩坑记录——同一轮 CDN 加速上云，上一篇写 og:image 缓存通道漏网，本篇写轮播插件 JSON 存储的漏网。案例整体把客户两处中国站点迁入本地托管体系并完成图片加速上云，本篇的漏网是换域管线在「最重的那张首页」上被抓出来的。

## 问题现象：一半换域、一半回源的首页

首页同一段 HTML 里，`noscript` 回退图已是 CDN 域，内联 JSON 里的轮播大图与 47MB 视频仍指向主域。换域管线上线后常规通道全部干净——页面可见 `src`/`srcset` 零主域引用，数据库替换与出口重写双通道都在，收尾抓首页时出现这组对比：

| 位置 | 域名 |
|------|------|
| 同一元素的 `noscript` 回退图片 | ✅ CDN 域 |
| 内联 JSON 里的 slide 背景图、图片组、缩略图 | ❌ 主域明文 |
| 内联 JSON 里的背景视频层（47MB） | ❌ 主域明文 |

后果直接挂在出口带宽上：47MB 的 hero 视频每次播放都回源主域，5Mbps 共享管道被单个访客占满，其他静态资源全部排队。

定位线索就是「一半换了一半没换」：`noscript` 回退走的是常规 HTML 属性输出（重写引擎覆盖），漏网的全部藏在同一段 HTML 的内联 JSON 里——这指向匹配面问题，而不是管线没跑。

## 根因：属性语法的匹配面接不到 JSON 形态

换域重写引擎的匹配对象是 HTML 属性语法：`src=`、`srcset=`、`href=`、`poster=`，且属性名前必须有空白符。这个匹配面有三处接不到轮播插件存储 URL 的真实形态：

```html
<!-- 引擎认的形态：属性等号 + 空白符前缀 -->
<img src="https://old.example/hero.jpg" data-src="https://old.example/2.jpg" />

<!-- 插件实际存的形态：内联 JSON，冒号不是等号 -->
SR7_14_2({"bg":{"image":{"src":"https:\/\/old.example\/hero.jpg"}}})
```

逐条对照：

| 盲区 | 形态 | 为什么失配 |
|------|------|-----------|
| 冒号 vs 等号 | JSON `"src":"..."` | 引擎匹配 `src=`，JSON 里是 `src":`，没有等号 |
| 空白符前缀 | `"src":` 前是引号/逗号 | 属性名前须空白符的约束把 JSON 形态整体排除在外 |
| 连字符属性 | `data-src=` | 前缀是 `data-` 连字符而非空白符，同样接不到 |
| 转义字节流 | `https:\/\/old.example` | 字节流里根本没有连续的 `https://`——连「明文前缀」的 str_replace 都失配 |

最后一行是关键：很多替换方案的第一反应是「DB 里跑一把明文 str_replace 就行」。但单转义形态下，库里存的是 `https:\/\/old.example`——`https:` 后面跟着反斜杠，没有连续的 `https://` 字符串可找。同一个 URL 在字节流里有三种形态：

```
明文:   https://old.example/hero.jpg
单转义: https:\/\/old.example\/hero.jpg        ← JSON.stringify 一次后的字节流
双转义: https:\\/\\/old.example\\/hero.jpg      ← 再经过一次字符串层转义
```

不确认形态就替换，结果是「跑了替换、零命中、无报错」——比失败更难察觉。

## 解决方案：三态替换 + fixpoint 验证

**第一步：抓库定形态。** 先看目标字段处于哪种转义形态，再决定替换策略：

```bash
# 抓库检查目标字段是否含转义形态（按需换表名字段名）
wp db query "SELECT ID FROM wp_revslider_slides WHERE layers LIKE '%https:\\\\/%' LIMIT 5"
```

**第二步：按形态替换。** 两类字段的替换规则不同：

```php
// JSON 字段（无长度前缀）：三种形态各替换一遍，键顺序无所谓
foreach ( $fields as $field ) {
    foreach ( $rows as $row ) {
        $v = $row[ $field ];
        $v = str_replace( 'https:\\/\\/old.example', 'https:\\/\\/cdn.example', $v ); // 单转义
        $v = str_replace( 'https:\\\\/\\\\/old.example', 'https:\\\\/\\\\/cdn.example', $v ); // 双转义
        $v = str_replace( 'https://old.example', 'https://cdn.example', $v ); // 明文
        // ...写回
    }
}
```

```php
// PHP serialized 字段：URL 变长会毁掉 s:长度: 前缀——必须走序列化引擎
$data = unserialize( $raw );
// ...遍历替换明文 URL...
$raw = serialize( $data );
```

我们的收口对象是 RevSlider 的 `slides`、`sliders7`、`slides7` 三张表——插件的图层与背景数据以 JSON/转义形态存表，按三态替换共处理 204 处，替换后表结构完好、前端渲染正常。如果用的是同类插件，先确认它把图层存哪张表再动手。

**第三步：两跳保存 fixpoint，确认不回写。** 存储侧替换最怕「编辑器一保存又把旧域名写回去」。验证方法：

1. 后台打开收口的轮播，保存一次；
2. 抓库比对保存前后该行字节流是否一致；
3. 再保存一次，再比对一次。

连续两跳落库内容不变，即确认保存路径原样落库、无旧域回写。我们对 RevSlider 的保存路径实测两跳均原样落库——替换是一次性的，不需要反复盯。

## 边界与变体

- **一条勘误**：收口后复核时一度认为「posts 正文还残留一个 47MB 视频」。反查后勘误：那个视频就是首页轮播的 hero 背景视频层（存在轮播表里），已随三表替换收口；posts 正文对该视频零引用，残留的只有 KB 级小图。教训是「按 URL 找归属」要先确认载体，别按第一次看到的页面位置归档。
- **出口侧能力**：存储侧替换是当下收口；换域重写引擎的公共文本入口已原生支持三态转义形态（含单测覆盖），后续若其他站遇到同类插件，可按需挂插件适配器，把 JSON 形态纳入出口重写而不是每次都动库。
- **批量声明的扩展点**：同类替换若要走数据库替换通道，可通过插件的 `cclee_oss_url_replace_tables` 过滤器把目标表声明进替换范围，避免手工逐表操作。
- **跨域前置**：背景视频/图片换成 CDN 域后，若播放器以跨域方式加载，CDN 侧需加 ACAO 响应头（值收窄为站点 origin），否则换域完成、播放报跨域错。
- **另一条独立漏网通道**：`og:image` 的 indexable 缓存直出是同一案例里抓到的另一个漏网，机制完全不同，见 [Yoast og:image 不跟随 CDN 域名](/blog/yoast-og-image-indexable-cache-cdn-domain)。

<InfoBox variant="warning" title="注意事项">

- 替换前必须抓库确认转义形态——「跑了替换零命中无报错」是最难察觉的失败态。
- PHP serialized 字段禁裸 `str_replace`（URL 变长毁 `s:长度:` 前缀）；JSON 字段可按字节流逐态替换。
- 换域完成的判定不是「替换命令跑过」，而是出口抓包零主域引用——按通道分别验收（可见图、JSON、og:image、schema）。

</InfoBox>

## 常见问题

### JSON 转义过的 URL 为什么明文替换都匹配不到？

同一个 URL 在字节流里有明文、单转义（`https:\/\/`）、双转义（`https:\\/\\/`）三种形态。单转义形态里不存在连续的 https:// 前缀——斜杠被 `\/` 打断，任何只找明文的 str_replace 都会静默失配。替换前先抓库确认目标字段处于哪种形态，按形态逐态替换。

### 数据库换域替换命令对 JSON 和序列化字段有什么注意事项？

PHP serialized 字段带 `s:长度:` 前缀，URL 变长后裸 str_replace 会破坏结构，必须走 unserialize/serialize 或长度安全的替换工具；JSON 字段没有长度前缀，按转义形态做字节流替换即可。我们把 RevSlider 的 slides、sliders7、slides7 三张表按三态替换收口 204 处，替换前后结构完好。

### 替换落库后，后台保存会不会把旧域名写回去？

用两跳 fixpoint 验证：保存一次→抓库比对字节流→再保存一次→再比对，连续两跳落库内容不变即可确认无回写。我们对 Slider Revolution 的保存路径实测两跳均原样落库，旧域不会被写回。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
