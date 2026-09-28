---
title: "Docusaurus 页面 hreflang 重复？内置 i18n 已自动生成"
description: "Docusaurus 内置 i18n 会自动生成 hreflang alternates，插件再注入一套就重复，搜索引擎会忽略冲突标签。修复：移除自定义 hreflang 注入，实测两站各标签恰好一次。"
date: 2026-09-28
tags: [Docusaurus, SEO, i18n]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "hreflang 标签是什么？"
    a: "它告诉搜索引擎页面有哪些语言/区域变体、分别对应哪个 URL，用于多语言站点的区域定向。形式为 <link rel=\"alternate\" hreflang=\"zh-CN\" href=\"...\">。"
  - q: "hreflang 标签重复有什么影响？"
    a: "同一页面出现两套 hreflang（尤其 URL 或语言码冲突时），搜索引擎会忽略冲突的标注，区域定向随之失效——等于白配。实测重复场景：内置 i18n 已生成一套，自定义插件又注入一套。"
  - q: "Docusaurus 怎么生成 hreflang？"
    a: "开箱即用：配置 i18n 的 locales 后，Docusaurus 自动为每个页面输出全部 locale 的 alternates 与 x-default，无需任何插件。自查方法：curl 页面源码 grep hreflang 逐条计数。"
---

多语言站点做 SEO 检查，翻页面源码发现 `<link rel="alternate" hreflang="...">` 每个标签出现了两次——两套 hreflang 并存，语言码还互相重叠。

在开发 [CCLEE Docusaurus Theme](/docs/cclee-docusaurus-theme) 时遇到此问题——基于 Docusaurus 3.x 的文档主题，内置多语言与 SEO 基础设施，hreflang 属于它必须原生做对的部份。

## 问题现象：head 里两套 hreflang 并存

页面 head 中，同一 locale 的 alternate 链接出现两份——一套来自 Docusaurus 内置 i18n，一套来自某个自定义注入。单看每一套都对，合在一起就是冲突。自查一行命令：

```bash
curl -s https://your-site.com/ | grep -o 'hreflang="[^"]*"' | sort | uniq -c
```

每个语言码（含 `x-default`）出现超过一次即为重复。如果你搜的是「hreflang 重复」「duplicate hreflang」「Docusaurus hreflang 两个」，都是同一类问题。

## 根因：内置 i18n 已生成，插件再注入一套

Docusaurus 配置好 `i18n.locales` 之后，**内置 i18n 会自动为每个页面生成完整的 hreflang alternates（含 x-default）**——这件事开箱即用，不需要任何插件参与。而站点此前的自定义 SEO 插件里，也写了一段 hreflang 注入逻辑，于是每个页面拿到两套：

- 内置 i18n：按 locales 配置生成，随页面渲染输出；
- 自定义插件：注入到 head 的另一套，语言码与内置生成的高度重叠。

hreflang 的语义是「声明」，不是「叠加」：两套声明只要有一条对不上（比如某 locale 的 URL 不同），对搜索引擎来说就是冲突标注。

## 解决方案：移除自定义注入，依赖内置 i18n

修法是做减法——把自定义插件里的 hreflang 注入整段移除，只留 Docusaurus 内置生成的：

```diff
// 自定义 SEO 插件
- const links = locales.map((locale) => ({
-   rel: 'alternate',
-   hreflang: locale,
-   href: urlFor(locale),
- }));
- // 注入 head ...
```

修复后的线上实测（两站首页）：`en-US`、`zh-CN`、`x-default` 各恰好出现 1 次——干净的一套声明。改完跑一遍上面的 grep 自查，确认「每个语言码恰好一次」再收工。

## 边界与变体

- **什么时候才需要手动注入 hreflang**：只有「非 Docusaurus 生成的页面」或「变体 URL 不遵循 i18n 路由规则」时才需要自定义；即便如此，也应先 grep 现状，确认内置没有覆盖你要声明的对。
- **重复不只来自自家插件**：多个 SEO 类插件叠加、主题自带 + 插件再来一份，都是常见来源；排查时按「每个 head 标签只有一个来源」的思路逐个禁用验证。
- **hreflang 与 canonical 的分工**：canonical 解决「同语言重复内容」，hreflang 解决「跨语言变体」，二者不互相替代，也别让自定义逻辑把两者搅在一起。

<InfoBox variant="warning" title="注意事项">

- **内置能力先于自定义**：Docusaurus 的 i18n、sitemap、meta 描述等 SEO 基建开箱即用，写注入逻辑前先确认内置是否已覆盖，否则就是在制造重复。
- **发布前把 grep 自查纳入流程**：一行命令的成本，拦住整类 head 标签冲突。
- **搜索引擎对冲突 hreflang 的处理是忽略**，不会报错提醒——静默失效，和 dotenv 截断是同一类「静默不报警」问题。

</InfoBox>

## 常见问题

### hreflang 标签是什么？

它告诉搜索引擎页面有哪些语言/区域变体、分别对应哪个 URL，用于多语言站点的区域定向。形式为 `<link rel="alternate" hreflang="zh-CN" href="...">`。

### hreflang 标签重复有什么影响？

同一页面出现两套 hreflang（尤其 URL 或语言码冲突时），搜索引擎会忽略冲突的标注，区域定向随之失效——等于白配。实测重复场景：内置 i18n 已生成一套，自定义插件又注入一套。

### Docusaurus 怎么生成 hreflang？

开箱即用：配置 i18n 的 locales 后，Docusaurus 自动为每个页面输出全部 locale 的 alternates 与 x-default，无需任何插件。自查方法：curl 页面源码 grep hreflang 逐条计数。

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">独立开发者，24年电商行业实战经验，专注将AI能力落地于真实商业场景。</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">合作咨询</a>
</div>
