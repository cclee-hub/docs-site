---
title: "Yoast og:image 不跟随 CDN 域名？indexable 缓存绕过附件 API"
description: "WordPress 图片已切 CDN，分享卡片的 og:image 却仍输出旧域名 404。根因是 Yoast 从 indexable 表缓存字符串直出 meta、绕过附件 API，出口过滤器换域加重跑索引收口。"
date: 2026-11-05
tags: [WordPress, Yoast, CDN, SEO]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "为什么全站图片都换到 CDN 了，og:image 还是旧域名？"
    a: "Yoast SEO（实测 28.2）生成 og:image 时按分支序先读 indexable 表的 open_graph_image_meta 缓存字符串，命中即原样直出，全程不触碰 WP 附件 API——附件层的换域重写拦不到它。必须在 og:image 输出通道单独过滤，或清理 indexable 缓存后重跑索引。"
  - q: "WordPress 用 CDN 后社交分享卡片图不更新怎么排查？"
    a: "先抓渲染页核对 meta 源头：curl 页面后 grep og:image，确认输出的是旧域名还是 CDN 域名。我们用全量扫描 233 个页面定位到 95 处 og:image 漏网文件，而同页面的 twitter:image 与 JSON-LD 图片已是 CDN 域——og:image 旧域不代表全站重写失败，先分通道核对再动手。"
  - q: "重跑 wp yoast index --reindex 卡在确认提示怎么办？"
    a: "--reindex 的确认提示没有 --yes 选项，用管道喂 y：echo y | wp yoast index --reindex。跑完后核对 indexable 表陈旧计数归零（我们环境里 og 图片计数 186→0、meta 计数 174→0）。"
---

在为客户站点做 CDN 换域收尾验证时，全量抓取 233 个页面发现：95 个文件的 `og:image` 仍指向迁移前主域、访问 404——而同一页面的 `twitter:image` 和 JSON-LD 图片早已是 CDN 域名。换域管线明明覆盖了附件输出，分享卡片的图却单独漏网。这篇记录定位过程与收口方案。

## TL;DR

1. Yoast SEO（实测 28.2）的 `og:image` 按 `add_from_indexable` 的分支序优先消费 indexable 表里的 `open_graph_image_meta` 缓存字符串——旧域名内嵌在这段缓存里，命中即原样直出，**全程不触碰 WP 附件 API**，所以覆盖附件通道的换域重写拦不到它。
2. 收口两步：出口对 `wpseo_opengraph_image` 过滤器挂换域回调（`0.5.0` 已随插件发布部署两站），再 `echo y | wp yoast index --reindex` 清 indexable 缓存。验证 95 个文件全量抓 95/95 返回 200，233 页 og/twitter 主域引用清零。

<!-- truncate -->

这项工作发生在 [制造企业中国站全托管](/cases/waterpark-china-hosting-migration) 案例的 CDN 加速收尾阶段——该案例把客户两处中国站点整体迁入本地托管体系并完成图片加速上云，本文的漏网正是上云后验证环节抓出来的。这套 WordPress 技术栈也是 [CCLEE Theme](/cclee-theme) 的底座——Yoast 这一行为属于文档未记载的分支序设计，它直接决定换域工具挂在哪一层才有效。

## 问题现象：95 个 og:image 的选择性 404

233 页全量扫描中，95 个文件的 `og:image` 仍指向迁移前主域并返回 404，而同页的 `twitter:image` 与 JSON-LD 图片已全部是 CDN 域名。站点全站图片已完成换域：数据库替换与出口重写双通道上线后，页面可见的 `src`/`srcset` 主域引用为 0。收尾扫描时出现这组对比：

| 通道 | 主域残留 |
|------|----------|
| 页面可见 `src`/`srcset` | 0 |
| JSON-LD `primaryimage` | 0 |
| `twitter:image` | 0 |
| `og:image` | **95 个文件，全部 404** |

```html
<!-- 漏网页面的 head 输出：同页两个 meta，一旧一新 -->
<meta property="og:image" content="https://old-domain.example/wp-content/uploads/2026/03/hero.jpg" />
<meta name="twitter:image" content="https://cdn.example/wp-content/uploads/2026/03/hero.jpg" />
```

「选择性漏网」是定位起点：如果整站重写失效，四个通道应该一起残留；只有 og:image 漏，说明它走的输出通道和其他三个不同。

## 根因：Yoast indexable 缓存字符串绕过附件 API

Yoast 出于性能考虑不实时生成社交图片 URL，而是读 `wp_yoast_indexable` 表的缓存。实测 Yoast SEO 28.2，`Open_Graph_Image_Generator::add_from_indexable` 按这个分支序取图（简化示意）：

```php
// Yoast SEO 28.2 add_from_indexable 分支序（按实测行为整理的简化示意）
if ( ! empty( $indexable->open_graph_image_meta ) ) {
    // ① 图片 meta JSON：内嵌完整 URL，命中即原样直出——不触碰附件 API
    return $indexable->open_graph_image_meta;
}
if ( ! empty( $indexable->open_graph_image_id ) ) {
    // ② 附件 ID：才走 WP 附件 API
    return $this->image->generate_from_attachment_id( $indexable->open_graph_image_id );
}
// ③ 其后才是其他缓存字段兜底
```

漏网的机制就在分支 ①：站点迁移前的历史图片把完整主域 URL 存进了 `open_graph_image_meta` 这段缓存字符串。Yoast 命中它后原样输出，后续既不查附件库、也不经过任何 `wp_get_attachment_image` 类的附件 API——而换域管线挂的重写点都在附件 API 一侧。缓存字符串里的旧域名就这样绕过了所有重写通道，直到 indexable 重建前一直直出 404 的 URL。

排查中的一条弯路：部分页面的 `twitter:image` tag 整个缺席，第一反应是「twitter 通道也漏了」。读源码后确认是设计行为——`generate_twitter_image` 只在 `twitter_image_source` 为 `set-by-user` 时输出 tag；featured image 且 OG 启用的组合下它返回空串，`Abstract_Indexable_Tag_Presenter::present` 对空值直接跳过。**twitter tag 缺失 ≠ 重写失败**，别把它算进漏网清单。

## 解决方案：出口过滤 + 重跑索引

收口分两层：过滤器兜住实时输出，重跑索引清掉缓存里的旧域名。

**第一层：出口换域过滤器。** Yoast 提供 `wpseo_opengraph_image` 过滤器，og:image 输出前必经。挂一个换域回调：

```php
add_filter( 'wpseo_opengraph_image', function ( $image ) {
    if ( ! is_string( $image ) || false === strpos( $image, 'https://old-domain.example' ) ) {
        return $image;
    }
    return str_replace( 'https://old-domain.example', 'https://cdn.example', $image );
} );
```

注意分支 ① 直出的是「图片 meta JSON」字符串形态，若你的 `open_graph_image_meta` 里存的是 JSON 数组而非纯 URL，回调里要先解析再换域、输出前还原结构。纯 URL 缓存（我们的场景）用上面的写法即可。

**第二层：重建 indexable 缓存。** 过滤器只保证输出正确，缓存里的旧域名还在。Yoast CLI 重建索引：

```bash
# --reindex 的确认提示没有 --yes 选项（实测 Yoast 28.2），用管道喂 y
echo y | wp yoast index --reindex
```

这个 `--yes` 未注册是文档没写的坑，直接加 `--yes` 参数会报选项不存在，交互提示则卡住 cron 场景下的自动执行——管道喂 `y` 是唯一非交互路径。

**验证结果**：

- indexable 陈旧计数归零：og 图片相关计数 186→0、meta 计数 174→0
- 95 个漏网文件全量抓取：**95/95 返回 200**
- 233 页复扫：`og:image` 与 `twitter:image` 主域引用均为 0，与扫描前的通道分布一致

这套过滤器 + 索引重建的组合已随插件 `0.5.0` 发布并部署到两站（发布包 sha256 与本地 zip 对表核对，diff 为纯增量）。

## 边界与变体

- **schema 图片通道现状**：JSON-LD `@graph` 里的 `Main_Image` 走附件 API，已被现有换域挂载覆盖——全量 refscan 反查 0 断链。早前一轮扫描曾报 schema 断链，反查后勘误：是扫描脚本把非图片引用计入，主图通道实际无残留。若未来 Yoast 版本把 schema 图片也改成 indexable 字符串直出，需同样挂 `wpseo_schema_graph` 过滤器收口。
- **新上传内容不受影响**：换域后新上传的图片从附件库读 URL，不经过历史缓存，天然是 CDN 域名。漏网只在「迁移前已生成 indexable 缓存」的历史内容上。
- **同域问题的另一面**：CDN 接管后的隐蔽行为不止缓存直出一处，此前还遇到过 Hostinger CDN 直接拦截 [WordPress REST API 媒体上传返回 405](/blog/2026/05/26/hostinger-cdn-blocks-wp-rest-api-media-upload) 的案例——排查思路同源：先确认请求/输出真正走到哪一层，再判断是谁拦的。

<InfoBox variant="warning" title="注意事项">

- og:image 旧域 ≠ 全站重写失败：先分通道核对（src/srcset、JSON-LD、twitter、og），选择漏网本身就是定位根因的线索。
- twitter tag 缺席在 Yoast 的 featured image + OG 组合下是设计行为，不要误判为重写失败。
- `wp yoast index --reindex` 写进 cron 或自动化脚本时必须用 `echo y |` 管道，交互提示会让无终端的执行环境挂起。

</InfoBox>

## 常见问题

### 为什么全站图片都换到 CDN 了，og:image 还是旧域名？

Yoast SEO（实测 28.2）生成 og:image 时按分支序先读 indexable 表的 `open_graph_image_meta` 缓存字符串，命中即原样直出，全程不触碰 WP 附件 API——附件层的换域重写拦不到它。必须在 og:image 输出通道单独过滤，或清理 indexable 缓存后重跑索引。

### WordPress 用 CDN 后社交分享卡片图不更新怎么排查？

先抓渲染页核对 meta 源头：curl 页面后 grep og:image，确认输出的是旧域名还是 CDN 域名。我们用全量扫描 233 个页面定位到 95 处 og:image 漏网文件，而同页面的 twitter:image 与 JSON-LD 图片已是 CDN 域——og:image 旧域不代表全站重写失败，先分通道核对再动手。

### 重跑 wp yoast index --reindex 卡在确认提示怎么办？

`--reindex` 的确认提示没有 `--yes` 选项，用管道喂 y：`echo y | wp yoast index --reindex`。跑完后核对 indexable 表陈旧计数归零（我们环境里 og 图片计数 186→0、meta 计数 174→0）。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
