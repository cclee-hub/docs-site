---
title: CCLEE Theme
description: 轻量级 WordPress FSE 区块主题 - 安装配置、页面模板、导航菜单、WooCommerce 商店、区块模式使用指南
project: cclee-theme
schema: Article
date: 2026-03-23
rag: true
rag_tags: ["WordPress", "FSE主题", "区块主题", "网站建设", "开源主题", "免费主题", "WooCommerce"]
---

import { RocketIcon, ZapIcon, CheckIcon, LightbulbIcon, GithubIcon, GlobeIcon, FileIcon } from '@site/src/components/Icons'
import StatusTag from '@site/src/components/StatusTag'

# <RocketIcon size={28} /> CCLEE Theme

轻量级 FSE 区块主题，为开发者打造。干净架构、可定制设计令牌、SEO 友好。

<div className="flex gap-4 my-6 justify-center flex-wrap">
  <a href="https://github.com/cclee-hub/cclee-theme"
     className="button button--primary button--lg"
     target="_blank">
    <GithubIcon size={16} />
    GitHub 下载
  </a>
  <a href="https://ai.ccleeai.com"
     className="button button--secondary button--lg"
     target="_blank">
    <GlobeIcon size={16} />
    在线 Demo
  </a>
</div>

---

## 基本信息

| 项目 | 说明 |
|------|------|
| Requires WP | 6.4+ |
| Tested up to | 6.7 |
| Requires PHP | 8.0+ |
| License | GPLv2 or later |

---

## 核心特性

### <ZapIcon size={20} /> 全站编辑 (FSE)

- theme.json 设计系统，一处改全站变
- 20+ 区块模式（Hero、特性、CTA、证言、定价等）
- 5 种风格变体（商业、工业、专业、自然、科技）
- 响应式布局，可配置断点

### <CheckIcon size={20} /> WooCommerce 兼容

- CSS-only 样式，零模板覆盖
- 支持商店页、产品页、购物车、结账页

### <LightbulbIcon size={20} /> 设计令牌

- 颜色、字体、间距、阴影全面可定制
- 子主题友好，升级不丢失定制

---

## 模板清单

### 页面模板

| 模板 | 用途 |
|------|------|
| `index` | 默认归档 |
| `single` | 文章详情 |
| `page` | 普通页面 |
| `archive` | 归档列表 |
| `search` | 搜索结果 |
| `404` | 未找到页面 |
| `front-page` | 首页 |
| `home` | 博客首页 |
| `page-no-sidebar` | 无侧边栏页面 |
| `page-landing` | 落地页 |
| `author` | 作者归档 |
| `page-about-us` | 关于我们 |
| `page-contact` | 联系页面 |

### WooCommerce 模板

| 模板 | 用途 |
|------|------|
| `archive-product` | 产品列表 |
| `single-product` | 产品详情 |
| `cart` | 购物车 |
| `checkout` | 结账页 |

### 模板部件

- `header` - 页头
- `footer` - 页脚
- `sidebar` - 侧边栏

---

## 安装方式

### 手动上传

1. 下载主题 ZIP 文件
2. 进入 WordPress 后台 > 外观 > 主题 > 添加 > 上传主题
3. 启用主题

### WP-CLI

```bash
wp theme install /path/to/cclee-theme --activate
```

---

## 使用指南

本节帮助你在 WordPress 后台完成 CCLEE Theme 的完整站点搭建。所有操作均在浏览器中完成，无需命令行。

### 基本设置

启用主题后，先完成以下基础配置：

1. 进入 **设置 → 常规**，填写站点标题和副标题
2. 进入 **设置 → 固定链接**，选择「文章名」(`/%postname%/`)，点击保存
3. 进入 **设置 → 时区**，选择你所在的城市（如「上海」）

### 创建页面

CCLEE Theme 为不同用途提供了专用模板。创建页面时选择对应模板即可获得最佳布局。

#### 可用页面模板

| 页面用途 | 推荐模板 | 说明 |
|---------|---------|------|
| 首页 | `front-page` | 透明页头、Hero、特性展示、CTA |
| 关于我们 | `page-about-us` | 公司介绍、数据统计、时间线、团队 |
| 联系我们 | `page-contact` | 联系表单、地图区域 |
| 全宽页面 | `page-full-width` | 无侧边栏全宽内容 |
| 落地页 | `page-landing` | 视频 Hero 营销页 |
| 普通页面 | `page`（默认） | 标准页头页脚布局 |
| 博客列表 | `home`（自动） | 设置博客页后自动使用 |
| 商品列表 | `archive-product`（自动） | WooCommerce 安装后自动使用 |
| 购物车 | `cart`（自动） | WooCommerce 自动分配 |
| 结账页 | `checkout`（自动） | WooCommerce 自动分配 |
| 我的账户 | `my-account`（手动） | ⚠️ 需要手动指定此模板 |
| 搜索结果 | `search`（自动） | 自动使用 |
| 404 页面 | `404`（自动） | 自动使用 |

> 标注「自动」的模板由 WordPress 或 WooCommerce 自动匹配，无需手动指定。

#### 创建页面步骤

1. 进入 **页面 → 新建页面**
2. 输入页面标题（如「关于我们」）
3. 在右侧面板找到 **模板** 选项，从下拉菜单选择对应模板
4. 点击 **发布**
5. 对每个需要的页面重复以上步骤

### 设置首页和博客页

创建好页面后，需要告诉 WordPress 哪个是首页、哪个显示博客文章：

1. 进入 **设置 → 阅读**
2. 「首页显示」选择 **一个静态页面**
3. 「首页」下拉选择你创建的首页
4. 「文章页」下拉选择你创建的博客页
5. 点击 **保存更改**

### 配置导航菜单

CCLEE Theme 使用 WordPress 全站编辑（FSE）的导航区块，菜单在站点编辑器中管理。

1. 进入 **外观 → 编辑器**
2. 点击左侧 **模板部件** → 选择 **Header**
3. 点击页面中的导航区块进行编辑：
   - 添加页面链接：点击 **+** → 选择你创建的页面
   - 添加自定义链接：输入 URL 和标签文字
   - 拖拽调整顺序
4. 点击 **保存**

> CCLEE Theme 提供两种页头：**Header**（实心背景）和 **Header Transparent**（透明，用于首页 Hero）。建议两个都配置导航。

### 安装 WooCommerce

如果你的站点需要在线商店功能：

1. 进入 **插件 → 安装插件**，搜索「WooCommerce」
2. 点击 **现在安装**，安装完成后点击 **启用**
3. 按照 WooCommerce 设置向导填写商店信息（地址、货币等）
4. 在 **WooCommerce → 设置** 中确认以下页面绑定正确：
   - 商店页 → 你的商品列表页
   - 购物车 → 你的购物车页
   - 结账页 → 你的结账页
   - 我的账户 → 你的账户页

> ⚠️ 「我的账户」页需要手动指定 `my-account` 模板：编辑该页面 → 右侧模板 → 选择 `my-account`。

### 使用区块模式（Patterns）

CCLEE Theme 内置 20+ 区块模式，可在编辑页面时直接插入：

1. 编辑任意页面，点击 **+** 按钮
2. 切换到 **模式** 标签页
3. 在 **CCLEE** 分类下浏览所有可用模式
4. 点击任意模式即可插入到页面中

#### 可用模式一览

**页面头部**

| 模式 | 说明 |
|------|------|
| `hero-centered` | 居中 Hero，含标题、描述、按钮 |
| `hero-simple` | 简约侧文字 Hero |
| `hero-about` | 关于页 Hero |
| `hero-contact` | 联系页 Hero |
| `hero-blog` | 博客页 Hero |
| `landing-video-hero` | 视频背景 Hero |

**内容区块**

| 模式 | 说明 |
|------|------|
| `features-grid` | 特性卡片网格 |
| `services` | 服务列表 |
| `stats` | 数据统计 |
| `timeline` | 公司历程/时间线 |
| `team` | 团队成员卡片 |
| `testimonial` | 客户评价 |
| `faq` | FAQ 折叠面板 |
| `pricing` | 定价表 |
| `portfolio` | 作品集/画廊 |
| `logo-cloud` | 客户/合作伙伴 Logo 墙 |

**CTA 与工具**

| 模式 | 说明 |
|------|------|
| `cta-banner` | 行动号召横幅 |
| `contact` | 联系表单区域 |
| `page-header` | 通用页面头部 |
| `page-header-products` | 商品页头部 |
| `breadcrumb` | 面包屑导航 |

**WooCommerce**

| 模式 | 说明 |
|------|------|
| `view-toggle` | 网格/列表视图切换 |
| `woo-trust-badges` | 信任徽章 |
| `woo-progress-steps` | 订单进度条 |
| `woo-account-nav` | 账户侧边栏导航 |
| `woo-account-user-info` | 账户用户信息卡 |

**页头/页脚变体**

| 部件 | 说明 |
|------|------|
| `header` | 实心背景页头（导航、购物车、CTA 按钮） |
| `header-transparent` | 透明页头（用于 Hero 页面） |
| `header-centered` | 居中 Logo 页头 |
| `footer-columns` | 多列页脚（导航、社交、版权） |
| `footer-simple` | 简约页脚 |
| `footer-newsletter` | 含邮件订阅的页脚 |

### 自定义样式

CCLEE Theme 支持通过站点编辑器自定义全局样式：

1. 进入 **外观 → 编辑器**
2. 点击右侧 **样式** 面板（画笔图标）
3. 可以调整：
   - **颜色**：全局配色、各元素颜色
   - **排版**：字体、字号、行高
   - **布局**：间距、容器宽度
4. 点击 **保存** 即可全站生效

> 更深度的定制建议创建子主题，升级主题时不会丢失你的修改。

### 法律页面

建议创建以下法律相关页面（使用默认 `page` 模板即可）：

- 隐私政策
- 条款与条件
- 退款与退货政策

---

## 常见问题

### 页面显示不正确怎么办？

检查页面是否选择了正确的模板。编辑页面 → 右侧面板 → 确认「模板」选项与页面用途匹配。

### 导航菜单不显示？

CCLEE Theme 使用 FSE 导航区块，不是传统菜单。请通过 **外观 → 编辑器** → 编辑 Header 模板部件来管理导航。

### WooCommerce 页面布局异常？

确认 WooCommerce 设置中的页面绑定正确（商店、购物车、结账、我的账户）。「我的账户」页需手动指定 `my-account` 模板。

### 需要安装插件吗？

<StatusTag type="info">不需要</StatusTag> CCLEE 开箱即用。WooCommerce 支持是可选的。

### 可以商用吗？

<StatusTag type="success">可以</StatusTag> CCLEE 采用 GPLv2 或更高版本协议，商用免费。

### 如何自定义颜色和字体？

使用站点编辑器（外观 > 编辑器），或创建子主题自定义 theme.json。

### 为什么 WooCommerce 显示"产品"而不是"商店"？

CCLEE 默认使用 B2B 友好的术语。"商店"标签替换为"产品"更适合面向企业的网站。这只是文本显示偏好，不修改 WooCommerce 功能。如需恢复，可在子主题中移除过滤器。

---

## 更新日志

### v1.1.1

- 新增作者归档模板和文章布局模式
- 新增 WooCommerce 购物车/结账页模板

### v1.1.0

- 新增 5 种风格变体
- 新增落地页模式
- 新增 WooCommerce 进度条和信任徽章模式

### v1.0.0

- 初始发布

---

## 资源致谢

| 资源 | 协议 |
|------|------|
| [DM Serif Display](https://fonts.google.com/specimen/DM+Serif+Display) | SIL Open Font License |
| [Inter](https://fonts.google.com/specimen/Inter) | SIL Open Font License |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | SIL Open Font License |

---

## 技术标签

`full-site-editing` `block-themes` `one-column` `two-columns` `custom-colors` `custom-menu` `custom-logo` `featured-images` `sticky-post` `threaded-comments` `translation-ready`

---

<div className="text-center my-8">
  <a href="https://github.com/cclee-hub/cclee-theme"
     className="button button--primary button--lg"
     target="_blank">
    <GithubIcon size={18} />
    <span className="ml-2">GitHub 获取源码</span>
  </a>
</div>

:::tip 提示

CCLEE Theme 完全免费开源，基于 GPLv2 协议。欢迎 Star、Fork、提交 PR！

:::
