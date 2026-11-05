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
              to="/services"
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
              to="/services"
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
              to="/services"
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
              {/* Case 1 - 土耳其律所 */}
              <Link
                to="/cases/website-localization-turkey-law-firm"
                className="group p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 block shadow-md hover:shadow-lg hover:-translate-y-1 hover:border-purple-400 transition-all duration-300 text-inherit"
              >
                <div className="h-56 rounded-xl overflow-hidden mb-4 bg-white dark:bg-gray-800 flex items-center justify-center p-4">
                  <img
                    src={require('@site/static/images/cases/website-localization-turkey-law-firm/cover.png').default}
                    alt="LegitLaw 介绍册"
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300 drop-shadow-lg"
                  />
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">
                  <Translate id="homepage.cases.case1.tags">外企入华 / 内容本地化</Translate>
                </div>
                <h3 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.cases.case1.title">土耳其律所 — 双语策略重构与中文网站落地</Translate>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <Translate id="homepage.cases.case1.result">全部中文内容经客户团队审核通过</Translate>
                </p>
              </Link>

              {/* Case 2 - 海外B2B机构 Linkexis */}
              <Link
                to="/cases/china-market-localization-b2b-agency"
                className="group p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 block shadow-md hover:shadow-lg hover:-translate-y-1 hover:border-purple-400 transition-all duration-300 text-inherit"
              >
                <div className="h-56 rounded-xl overflow-hidden mb-4 bg-white dark:bg-gray-800 flex items-center justify-center p-4">
                  <img
                    src={require('@site/static/images/cases/china-market-localization-b2b-agency/mobile.png').default}
                    alt="Linkexis 莱客策略咨询"
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300 drop-shadow-lg"
                  />
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">
                  <Translate id="homepage.cases.case2.tags">外企入华 / 技术实施</Translate>
                </div>
                <h3 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.cases.case2.title">海外B2B机构 — 中国市场本地化重构与WordPress迁移</Translate>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <Translate id="homepage.cases.case2.result">完成全站重构和平台迁移</Translate>
                </p>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
