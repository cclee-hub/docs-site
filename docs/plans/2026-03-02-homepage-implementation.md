# 首页改版实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将首页从产品导向改为服务导向，展示 AI 工具开发、中国出海、外企入华三条服务线

**Architecture:** 重写 src/pages/index.tsx，保留 Hero 区和服务卡片样式，删除统计数据和产品截图，新增简介区和案例精选

**Tech Stack:** Docusaurus 3.9 + TypeScript + TailwindCSS + i18n

---

## Task 1: 更新 i18n 翻译文件

**Files:**
- Modify: `i18n/en/code.json`

**Step 1: 添加首页新文案翻译**

在 `i18n/en/code.json` 中添加以下内容：

```json
{
  "homepage.hero.newTitle": {
    "message": "AI Tool Development · China Export · Market Entry"
  },
  "homepage.hero.newSubtitle": {
    "message": "24 years of e-commerce experience, independent developer, helping businesses achieve measurable growth with AI and localization"
  },
  "homepage.hero.contact": {
    "message": "Contact"
  },
  "homepage.hero.viewServices": {
    "message": "View Services"
  },
  "homepage.services.title": {
    "message": "Services"
  },
  "homepage.services.aiTools.name": {
    "message": "AI Tool Development"
  },
  "homepage.services.aiTools.desc": {
    "message": "Custom AI workflows, automation systems and Agents for enterprises, from requirement analysis to delivery, understanding business not just technology"
  },
  "homepage.services.chinaExport.name": {
    "message": "China Export"
  },
  "homepage.services.chinaExport.desc": {
    "message": "Leverage China's supply chain and platform advantages to help foreign enterprises expand markets at low cost"
  },
  "homepage.services.chinaEntry.name": {
    "message": "China Market Entry"
  },
  "homepage.services.chinaEntry.desc": {
    "message": "Localization promotion and platform operations, helping foreign enterprises truly land in the Chinese market"
  },
  "homepage.about.title": {
    "message": "About"
  },
  "homepage.about.achievement1": {
    "message": "2024: Delivered 13 AI efficiency tools covering customer service, product selection, advertising, copywriting, saving 70% repetitive work"
  },
  "homepage.about.achievement2": {
    "message": "4 months as industrial 1688 operations consultant: 3x sales growth, now #1 in soldering iron tip category"
  },
  "homepage.about.cclhub": {
    "message": "CCLHUB is my continuously developed product ecosystem, a testament to my capabilities."
  },
  "homepage.cases.title": {
    "message": "Featured Projects"
  },
  "homepage.cases.viewAll": {
    "message": "View All Projects"
  },
  "homepage.cases.case1.title": {
    "message": "Turkish Law Firm — Bilingual Strategy & Chinese Website"
  },
  "homepage.cases.case1.result": {
    "message": "All Chinese content approved by client team"
  },
  "homepage.cases.case2.title": {
    "message": "Overseas B2B — China Market Localization & WordPress Migration"
  },
  "homepage.cases.case2.result": {
    "message": "Complete site restructuring and platform migration"
  }
}
```

**Step 2: 验证 JSON 格式**

运行: `cat i18n/en/code.json | python3 -m json.tool > /dev/null && echo "Valid JSON"`

---

## Task 2: 重写首页组件

**Files:**
- Modify: `src/pages/index.tsx`

**Step 1: 替换 import 和组件结构**

完整替换 `src/pages/index.tsx` 内容：

```tsx
import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import { translate } from '@docusaurus/Translate';
import { ArrowRightIcon, ZapIcon, GlobeIcon, BuildingIcon } from '@site/src/components/Icons';
import { HeroBackground } from '@site/src/components/HeroSection';

export default function Home(): React.ReactElement {
  const title = translate({ id: 'homepage.title', message: 'CCLHUB - AI工具开发与本地化服务' });
  const description = translate({ id: 'homepage.description', message: 'AI工具开发、中国出海、外企入华服务' });

  return (
    <Layout title={title} description={description}>
      <main>
        {/* Hero Section */}
        <div className="relative min-h-[70vh] flex flex-col items-center justify-center px-5 pt-[100px] pb-[60px] text-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <HeroBackground />
          </div>
          <div className="relative z-10 animate-fadeInUp">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black leading-tight mb-6 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent tracking-tight">
              <Translate id="homepage.hero.newTitle">AI工具开发 · 中国出海 · 外企入华</Translate>
            </h1>

            <div className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400 mb-10 leading-relaxed max-w-[600px] mx-auto text-center">
              <Translate id="homepage.hero.newSubtitle">24年电商经验，独立开发者，用AI和本地化帮企业实现可量化的业务增长</Translate>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-[400px] mx-auto">
              <Link
                to="/about"
                className="px-8 py-3 rounded-xl text-white text-base font-semibold inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 w-full sm:w-auto"
              >
                <Translate id="homepage.hero.contact">联系合作</Translate>
                <ArrowRightIcon size={16} />
              </Link>
              <Link
                to="/services"
                className="px-8 py-3 rounded-xl text-base font-semibold inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border-2 border-purple-500 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/50 transition-all duration-200 w-full sm:w-auto"
              >
                <Translate id="homepage.hero.viewServices">查看服务</Translate>
              </Link>
            </div>
          </div>
        </div>

        {/* Services Section */}
        <div className="max-w-[1200px] mx-auto px-5 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold mb-10 text-gray-900 dark:text-white text-center">
            <Translate id="homepage.services.title">服务</Translate>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
            {/* AI工具开发 */}
            <Link
              to="/services#ai-tools"
              className="group p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-inherit block shadow-md hover:shadow-lg hover:-translate-y-1 hover:border-purple-400 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md group-hover:rotate-6 transition-all duration-300">
                <ZapIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">
                <Translate id="homepage.services.aiTools.name">AI工具开发</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <Translate id="homepage.services.aiTools.desc">为企业定制AI工作流、自动化系统与Agent，从需求分析到落地交付，懂业务不只懂技术</Translate>
              </p>
            </Link>

            {/* 中国出海 */}
            <Link
              to="/services#china-export"
              className="group p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-inherit block shadow-md hover:shadow-lg hover:-translate-y-1 hover:border-purple-400 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md group-hover:rotate-6 transition-all duration-300">
                <GlobeIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">
                <Translate id="homepage.services.chinaExport.name">中国出海</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <Translate id="homepage.services.chinaExport.desc">借助中国供应链与平台优势，帮助外国企业低成本拓展市场</Translate>
              </p>
            </Link>

            {/* 外企入华 */}
            <Link
              to="/services#china-entry"
              className="group p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-inherit block shadow-md hover:shadow-lg hover:-translate-y-1 hover:border-purple-400 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md group-hover:rotate-6 transition-all duration-300">
                <BuildingIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">
                <Translate id="homepage.services.chinaEntry.name">外企入华</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <Translate id="homepage.services.chinaEntry.desc">本地化推广与平台运营，帮助外国企业真正落地中国市场</Translate>
              </p>
            </Link>
          </div>

          {/* About Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-16 mb-20">
            <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-gray-900 dark:text-white text-center">
              <Translate id="homepage.about.title">关于</Translate>
            </h2>

            <div className="max-w-[700px] mx-auto text-center">
              <div className="space-y-4 text-gray-700 dark:text-gray-300 mb-6">
                <p className="text-base leading-relaxed">
                  <Translate id="homepage.about.achievement1">2024年落地13个AI增效工具，覆盖客服、选品、广告、文案等场景，节省70%重复人力</Translate>
                </p>
                <p className="text-base leading-relaxed">
                  <Translate id="homepage.about.achievement2">以顾问身份主导工业品1688运营，4个月销售额增长3倍，现烙铁嘴类目销售额行业第一</Translate>
                </p>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <Translate id="homepage.about.cclhub">CCLHUB 是我持续开发的产品体系，是能力的实际见证。</Translate>
              </p>
            </div>
          </div>

          {/* Cases Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-16">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                <Translate id="homepage.cases.title">精选案例</Translate>
              </h2>
              <Link
                to="/cases"
                className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 text-sm font-medium flex items-center gap-1"
              >
                <Translate id="homepage.cases.viewAll">查看全部</Translate>
                <ArrowRightIcon size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Case 1 */}
              <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">外企入华 / 内容本地化</div>
                <h3 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.cases.case1.title">土耳其律所 — 双语策略重构与中文网站落地</Translate>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <Translate id="homepage.cases.case1.result">全部中文内容经客户团队审核通过</Translate>
                </p>
              </div>

              {/* Case 2 */}
              <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">外企入华 / 技术实施</div>
                <h3 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.cases.case2.title">海外B2B机构 — 中国市场本地化重构与WordPress迁移</Translate>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <Translate id="homepage.cases.case2.result">完成全站重构和平台迁移</Translate>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
```

**Step 2: 验证文件语法**

运行: `npx tsc --noEmit src/pages/index.tsx`

---

## Task 3: 添加缺失的图标组件

**Files:**
- Modify: `src/components/Icons/index.tsx`

**Step 1: 添加 GlobeIcon 和 BuildingIcon**

如果 `Icons/index.tsx` 中没有这些图标，添加：

```tsx
// GlobeIcon - 用于中国出海
export function GlobeIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// BuildingIcon - 用于外企入华
export function BuildingIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}
```

**Step 2: 验证图标导出**

运行: `grep -E "export.*Icon" src/components/Icons/index.tsx | head -10`

---

## Task 4: 本地测试

**Step 1: 启动开发服务器**

运行: `cd /home/aptop/projects/docs-site && npm run start`

**Step 2: 验证中文版**

- 访问 http://localhost:3004
- 检查 Hero 区标题和副标题
- 检查 3 个服务卡片
- 检查简介区
- 检查案例精选
- 点击 CTA 按钮验证跳转

**Step 3: 验证英文版**

运行: `npm run start -- --locale en`

- 访问 http://localhost:3004/en
- 检查所有文案是否正确翻译

**Step 4: 验证深色模式**

- 切换深色/浅色模式
- 检查所有颜色是否正确显示

---

## Task 5: 提交代码

**Step 1: 查看变更**

运行: `git status`

**Step 2: 提交**

```bash
git add src/pages/index.tsx i18n/en/code.json src/components/Icons/index.tsx
git commit -m "feat: 改版首页为服务导向

- Hero 区更新为服务定位
- 添加 3 个服务卡片（AI工具开发/中国出海/外企入华）
- 新增简介区展示核心成就
- 新增案例精选区
- 删除产品导向内容（已迁移到 /products）
- 同步更新英文翻译"
```

---

## 验收清单

- [ ] 首页显示 Hero + 服务卡片 + 简介区 + 案例精选
- [ ] CTA 按钮跳转正确（/about, /services）
- [ ] 服务卡片点击跳转到 /services 锚点
- [ ] 中英文切换正常
- [ ] 深色/浅色模式正常
- [ ] 无 TypeScript 错误
