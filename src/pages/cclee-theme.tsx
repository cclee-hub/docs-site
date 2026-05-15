import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import { GithubIcon, GlobeIcon, ZapIcon, CheckIcon, FileIcon, UserIcon, BuildingIcon, LayoutIcon } from '@site/src/components/Icons';

export default function CCLEETheme(): React.ReactElement {
  return (
    <Layout
      title="CCLEE Theme - 免费 WordPress 区块主题"
      description="轻量级 WordPress FSE 区块主题。76 行 JS、零依赖、24 个区块、5 种样式。为开发者和网站搭建者打造。"
    >
      <main className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-20 px-6 text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-medium mb-6">
              <ZapIcon size={16} />
              <span><Translate id="ccleetheme.hero.badge">Free & Open Source</Translate></span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
              <Translate id="ccleetheme.hero.title">Free WordPress Block Theme</Translate>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 mb-4">
              <Translate id="ccleetheme.hero.subtitle">Ultra-light architecture · Designer-grade visuals · Ready to use</Translate>
            </p>

            <p className="text-lg text-gray-500 dark:text-gray-500 mb-8">
              <Translate id="ccleetheme.hero.description">Free FSE-based WordPress theme for developers and site builders</Translate>
            </p>

            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Link
                to="https://github.com/cclee-hub/cclee-theme"
                className="button button--primary button--lg"
                target="_blank"
              >
                <GithubIcon size={18} />
                <span className="ml-2"><Translate id="ccleetheme.hero.github">View Source on GitHub</Translate></span>
              </Link>
              <Link
                to="https://demo.ccleeai.com"
                className="button button--secondary button--lg"
                target="_blank"
              >
                <GlobeIcon size={18} />
                <span className="ml-2"><Translate id="ccleetheme.hero.demo">View Style Demo</Translate></span>
              </Link>
              <Link
                to="/docs/cclee-theme"
                className="button button--outline button--lg"
              >
                <FileIcon size={18} />
                <span className="ml-2"><Translate id="ccleetheme.hero.docs">Read Docs</Translate></span>
              </Link>
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-2">
                <CheckIcon size={16} className="text-green-500" />
                <Translate id="ccleetheme.hero.jsLines">76 lines JS</Translate>
              </span>
              <span className="flex items-center gap-2">
                <CheckIcon size={16} className="text-green-500" />
                <Translate id="ccleetheme.hero.zeroDeps">Zero dependencies</Translate>
              </span>
              <span className="flex items-center gap-2">
                <CheckIcon size={16} className="text-green-500" />
                <Translate id="ccleetheme.hero.blocks">24 blocks</Translate>
              </span>
              <span className="flex items-center gap-2">
                <CheckIcon size={16} className="text-green-500" />
                <Translate id="ccleetheme.hero.gpl">GPLv2 Open Source</Translate>
              </span>
            </div>
          </div>
        </section>

        {/* Pain Points Section */}
        <section className="py-16 px-6 bg-gray-50 dark:bg-[#0f0f17]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-gray-900 dark:text-gray-100">
              <Translate id="ccleetheme.pain.title">Sound familiar?</Translate>
            </h2>

            <div className="space-y-6 text-lg text-gray-600 dark:text-gray-400 leading-loose">
              <p>
                <Translate id="ccleetheme.pain.item1">Open theme code, find unmaintainable spaghetti in functions.php —</Translate>
              </p>
              <p>
                <Translate id="ccleetheme.pain.item2">Install 5 plugins, site gets slower, don't know who to blame —</Translate>
              </p>
              <p>
                <Translate id="ccleetheme.pain.item3">Finally pick a "pro theme", something feels off after changing the logo —</Translate>
              </p>
              <p>
                <Translate id="ccleetheme.pain.item4">Want premium feel, either pay a designer or settle for free templates —</Translate>
              </p>

              <p className="text-xl font-medium text-gray-900 dark:text-gray-100 pt-8 leading-relaxed">
                <Translate id="ccleetheme.pain.conclusion">Most themes make you choose between "works" and "works well".</Translate><br />
                <span className="text-purple-600 dark:text-purple-400"><Translate id="ccleetheme.pain.highlight">CCLEE refuses to make you choose.</Translate></span>
              </p>
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-gray-900 dark:text-gray-100">
              <Translate id="ccleetheme.compare.title">Compared to mainstream commercial themes</Translate>
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-8 rounded-2xl bg-gray-100 dark:bg-[#181824] border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100"><Translate id="ccleetheme.compare.mainstream">Mainstream themes</Translate></h3>
                <ul className="space-y-3 text-gray-600 dark:text-gray-400 leading-relaxed">
                  <li>500-2000 lines JS</li>
                  <li>Multiple external dependencies</li>
                  <li>jQuery, third-party libraries</li>
                  <li>Bloated functions.php</li>
                </ul>
              </div>

              <div className="p-8 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-400 dark:border-purple-600">
                <h3 className="text-lg font-bold mb-4 text-purple-700 dark:text-purple-300">CCLEE</h3>
                <ul className="space-y-3 text-purple-600 dark:text-purple-300 leading-relaxed">
                  <li className="flex items-center gap-2">
                    <CheckIcon size={18} className="text-green-500" />
                    <Translate>76 行 JS</Translate>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={18} className="text-green-500" />
                    <Translate>零依赖</Translate>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={18} className="text-green-500" />
                    <Translate>无 jQuery</Translate>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={18} className="text-green-500" />
                    <Translate>模块化架构</Translate>
                  </li>
                </ul>
              </div>
            </div>

            <p className="text-center text-lg text-gray-600 dark:text-gray-400 mt-8">
              <Translate id="ccleetheme.compare.conclusion">同样的功能，</Translate> <span className="font-bold text-purple-600 dark:text-purple-400"><Translate id="ccleetheme.compare.highlight">只有 1/10 的代码量</Translate></span>。<br />
              <Translate id="ccleetheme.compare.reason">不是我们更强——只是他们塞了一堆你永远用不到的东西。</Translate>
            </p>
          </div>
        </section>

        {/* User Types Section */}
        <section className="py-16 px-6 bg-gray-50 dark:bg-[#0f0f17]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-gray-900 dark:text-gray-100">
              <Translate id="ccleetheme.users.title">三类用户的价值</Translate>
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Developers */}
              <div className="p-8 rounded-2xl bg-white dark:bg-[#181824] border border-gray-200 dark:border-gray-700 shadow-md">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5">
                  <FileIcon size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                  <Translate id="ccleetheme.users.dev.title">Developers / Agencies</Translate>
                </h3>
                <p className="text-purple-600 dark:text-purple-400 font-medium mb-4">
                  <Translate id="ccleetheme.users.dev.highlight">Clean code foundation, not a black box to fight against</Translate>
                </p>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  <Translate id="ccleetheme.users.dev.desc">Child-theme friendly, upgrades preserve customizations, handoffs don't cause headaches.</Translate>
                </p>
                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>76 行 JavaScript，无 jQuery，无第三方库</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>纯 CSS WooCommerce，零模板覆盖</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>theme.json 设计令牌，改一处全局生效</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>GPLv2 开源，可修改，商用可再发布</Translate>
                  </li>
                </ul>
              </div>

              {/* Site Builders */}
              <div className="p-8 rounded-2xl bg-white dark:bg-[#181824] border border-gray-200 dark:border-gray-700 shadow-md">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5">
                  <UserIcon size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                  <Translate id="ccleetheme.users.builder.title">Site Builders</Translate>
                </h3>
                <p className="text-purple-600 dark:text-purple-400 font-medium mb-4">
                  <Translate id="ccleetheme.users.builder.highlight">Professional aesthetics built-in, premium look out of the box</Translate>
                </p>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  <Translate id="ccleetheme.users.builder.desc">What's FSE? — Full Site Editing, click to edit anywhere, no code needed.</Translate>
                </p>
                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>24 个区块：Hero、定价、案例、FAQ、团队、时间轴...</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>5 种品牌样式，一键切换</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>全可视化编辑，无需代码</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>安装 → 选样式 → 换内容 → 上线</Translate>
                  </li>
                </ul>
              </div>

              {/* Advanced Users */}
              <div className="p-8 rounded-2xl bg-white dark:bg-[#181824] border border-gray-200 dark:border-gray-700 shadow-md">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5">
                  <ZapIcon size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                  <Translate id="ccleetheme.users.advanced.title">Advanced / Extension Users</Translate>
                </h3>
                <p className="text-purple-600 dark:text-purple-400 font-medium mb-4">
                  <Translate id="ccleetheme.users.advanced.highlight">Today a website, tomorrow a growth engine</Translate>
                </p>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  <Translate id="ccleetheme.users.advanced.desc">Child theme extensible, standard hooks, ready for new features anytime.</Translate>
                </p>
                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>SEO 友好：语义化 HTML、Core Web Vitals 优化</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>GEO 就绪：多语言 / 多区域内容架构</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>AI 就绪：预配置 ai-content-block</Translate>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <Translate>内置转化：表单、倒计时、信任徽章</Translate>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-gray-900 dark:text-gray-100">
              <Translate id="ccleetheme.stats.title">关键数字</Translate>
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#181824]">
                <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-2">76</div>
                <div className="text-sm text-gray-500 dark:text-gray-400"><Translate id="ccleetheme.stats.js">Lines of JS</Translate></div>
              </div>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#181824]">
                <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-2">0</div>
                <div className="text-sm text-gray-500 dark:text-gray-400"><Translate id="ccleetheme.stats.deps">External Dependencies</Translate></div>
              </div>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#181824]">
                <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-2">24</div>
                <div className="text-sm text-gray-500 dark:text-gray-400"><Translate id="ccleetheme.stats.blocks">Designed Blocks</Translate></div>
              </div>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#181824]">
                <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-2">5</div>
                <div className="text-sm text-gray-500 dark:text-gray-400"><Translate id="ccleetheme.stats.styles">Brand Styles</Translate></div>
              </div>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#181824]">
                <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-2">16</div>
                <div className="text-sm text-gray-500 dark:text-gray-400"><Translate id="ccleetheme.stats.colors">Color Palette</Translate></div>
              </div>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-[#181824]">
                <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-2">1/5</div>
                <div className="text-sm text-gray-500 dark:text-gray-400"><Translate id="ccleetheme.stats.size">Commercial Theme Size</Translate></div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <span className="px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium">
                GitHub 开源
              </span>
              <span className="px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium">
                GPLv2 商用免费
              </span>
              <span className="px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium">
                WP 6.4+ 原生支持
              </span>
            </div>
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="py-16 px-6 bg-gray-50 dark:bg-[#0f0f17]">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
              <Translate id="ccleetheme.usecases.title">Use Cases</Translate>
            </h2>

            <div className="flex flex-wrap justify-center gap-4">
              {['B2B 企业', 'SaaS 落地页', '电商商城', '营销页面', '作品集', '代理项目'].map((useCase) => (
                <span
                  key={useCase}
                  className="px-6 py-3 rounded-full bg-white dark:bg-[#181824] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium"
                >
                  {useCase}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              <Translate id="ccleetheme.cta.title">Start Now, Free Forever</Translate>
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
              <Translate id="ccleetheme.cta.desc">No registration, no authorization, fork and use.</Translate><br />
              <Translate id="ccleetheme.cta.star">Already using it? A Star ⭐ is the best support.</Translate>
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="https://github.com/cclee-hub/cclee-theme"
                className="button button--primary button--lg"
                target="_blank"
              >
                <GithubIcon size={18} />
                <span className="ml-2"><Translate id="ccleetheme.cta.github">View Source on GitHub</Translate></span>
              </Link>
              <Link
                to="https://demo.ccleeai.com"
                className="button button--secondary button--lg"
                target="_blank"
              >
                <GlobeIcon size={18} />
                <span className="ml-2"><Translate id="ccleetheme.cta.demo">Live Demo</Translate></span>
              </Link>
              <Link
                to="/docs/cclee-theme"
                className="button button--outline button--lg"
              >
                <FileIcon size={18} />
                <span className="ml-2"><Translate id="ccleetheme.cta.docs">Read Docs</Translate></span>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
