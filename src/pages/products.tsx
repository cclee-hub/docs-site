import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import { translate } from '@docusaurus/Translate';
import { PluginIcon, AIIcon, ZapIcon, TrendIcon, ShieldIcon, LightbulbIcon, ArrowRightIcon, MessageCircleIcon } from '@site/src/components/Icons';
import { HeroCounter, HeroBackground } from '@site/src/components/HeroSection';

export default function Home(): React.ReactElement {
  const title = translate({ id: 'homepage.title', message: 'CCLHUB - AI驱动的电商运营工具平台' });
  const description = translate({ id: 'homepage.description', message: 'CCLHUB 电商运营工具平台 - AI驱动的AI运营与电商工具箱' });

  // Alt texts for images
  const toolkitAlt = translate({ id: 'homepage.products.toolkit.alt', message: '电商工具箱' });
  const aiOpsAlt = translate({ id: 'homepage.products.aiOps.alt', message: 'AI运营' });
  const aiSupportAlt = translate({ id: 'homepage.products.aiSupport.alt', message: 'AI客服' });

  return (
    <Layout title={title} description={description}>
      <main>
        <div className="relative min-h-[85vh] flex flex-col items-center justify-center px-5 pt-[100px] pb-[80px] text-center overflow-hidden">
          {/* Particle Background */}
          <div className="absolute inset-0 z-0">
            <HeroBackground />
          </div>
          <div className="relative z-10 animate-fadeInUp">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black leading-tight mb-8 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent tracking-tight">
              <Translate id="homepage.hero.title">AI 驱动的电商运营工具</Translate>
            </h1>

            <div className="text-lg sm:text-xl lg:text-2xl text-gray-600 dark:text-gray-400 mb-12 leading-relaxed max-w-[700px] mx-auto text-center">
              <Translate id="homepage.hero.subtitle">AI运营 + 电商工具箱，让电商运营更高效</Translate>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center sm:items-stretch w-full max-w-[500px] mx-auto mb-16">
              <Link
                to="/docs/ai-analytics"
                className="animate-fadeIn group relative px-10 py-4 rounded-xl text-white text-lg font-semibold inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 shadow-md hover:shadow-lg hover:-translate-y-0.5 border-b-4 border-purple-900 active:border-b-0 active:translate-y-1 transition-all duration-200 w-full sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  <Translate id="homepage.hero.freeTrial">免费试用</Translate>
                  <ArrowRightIcon size={18} />
                </span>
              </Link>
              <Link
                to="/docs/browser-plugin"
                className="animate-fadeIn group relative px-10 py-4 rounded-xl text-lg font-semibold inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border-2 border-purple-500 dark:border-purple-500 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/50 hover:border-purple-600 dark:hover:border-purple-400 hover:text-purple-800 dark:hover:text-purple-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 w-full sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  <PluginIcon size={18} />
                  <Translate id="homepage.hero.getTools">获取工具</Translate>
                </span>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="animate-enter grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative z-10 mt-20 max-w-4xl mx-auto px-4">
            <div>
              <div className="text-5xl lg:text-6xl font-black mb-2 bg-gradient-to-br from-purple-700 to-purple-900 bg-clip-text text-transparent">
                <HeroCounter value="50K+" duration={2000} suffix="" />
              </div>
              <div className="text-base text-gray-600 dark:text-gray-400 font-medium">
                <Translate id="homepage.stats.activeUsers">活跃用户</Translate>
              </div>
            </div>
            <div>
              <div className="text-5xl lg:text-6xl font-black mb-2 bg-gradient-to-br from-purple-700 to-purple-900 bg-clip-text text-transparent">
                <HeroCounter value="95%" duration={2000} suffix="" />
              </div>
              <div className="text-base text-gray-600 dark:text-gray-400 font-medium">
                <Translate id="homepage.stats.accuracy">分析准确率</Translate>
              </div>
            </div>
            <div>
              <div className="text-5xl lg:text-6xl font-black mb-2 bg-gradient-to-br from-purple-700 to-purple-900 bg-clip-text text-transparent">
                7×24
              </div>
              <div className="text-base text-gray-600 dark:text-gray-400 font-medium">
                <Translate id="homepage.stats.aiSupport">AI客服</Translate>
              </div>
            </div>
          </div>
        </div>

        {/* Transition Section */}
        <div className="py-16 px-5 text-center">
          <div className="text-lg sm:text-xl lg:text-2xl text-gray-700 dark:text-gray-300 max-w-[700px] mx-auto leading-relaxed">
            <Translate id="homepage.transition">一站式电商运营解决方案，从数据采集到智能分析，全方位提升运营效率</Translate>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-5 py-20">
          <div className="mb-20">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
              <Translate id="homepage.products.title">核心产品</Translate>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-32">
            <Link
              to="/docs/browser-plugin"
              className="animate-enter group p-8 rounded-2xl bg-gray-50 dark:bg-[#181824] border-2 border-gray-200 dark:border-gray-700 text-inherit block shadow-md hover:shadow-xl hover:shadow-purple hover:-translate-y-1 hover:border-purple-400 transition-all duration-300"
              style={{ animationDelay: '0.1s' }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md group-hover:shadow-lg group-hover:shadow-purple group-hover:rotate-6 transition-all duration-300">
                <PluginIcon size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                <Translate id="homepage.products.toolkit.title">电商工具箱</Translate>
              </h3>
              <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed mb-5">
                <Translate id="homepage.products.toolkit.description">实时获取商品数据、价格监控、竞品分析。支持淘宝、京东、拼多多等主流电商平台。</Translate>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <img src={require('@site/static/images/plugin-sidebar-ecommerce.png').default} alt={toolkitAlt} className="w-full h-full object-cover" />
              </div>
            </Link>

            <Link
              to="/docs/ai-analytics"
              className="animate-enter group p-8 rounded-2xl bg-gray-50 dark:bg-[#181824] border-2 border-gray-200 dark:border-gray-700 text-inherit block shadow-md hover:shadow-xl hover:shadow-purple hover:-translate-y-1 hover:border-purple-400 transition-all duration-300"
              style={{ animationDelay: '0.2s' }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md group-hover:shadow-lg group-hover:shadow-purple group-hover:rotate-6 transition-all duration-300">
                <AIIcon size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                <Translate id="homepage.products.aiOps.title">AI运营</Translate>
              </h3>
              <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed mb-5">
                <Translate id="homepage.products.aiOps.description">基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。</Translate>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <img src={require('@site/static/images/saas-dashboard-main.png').default} alt={aiOpsAlt} className="w-full h-full object-cover" />
              </div>
            </Link>

            <div className="animate-enter group p-8 rounded-2xl bg-gray-50 dark:bg-[#181824] border-2 border-gray-200 dark:border-gray-700 shadow-md hover:shadow-xl hover:shadow-purple hover:-translate-y-1 hover:border-purple-400 transition-all duration-300" style={{ animationDelay: '0.3s' }}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md group-hover:shadow-lg group-hover:shadow-purple group-hover:rotate-6 transition-all duration-300">
                <MessageCircleIcon size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">
                <Translate id="homepage.products.aiSupport.title">AI客服</Translate>
              </h3>
              <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed mb-5">
                <Translate id="homepage.products.aiSupport.description">7×24小时AI客服，快速解答产品使用问题，提供功能指导和最佳实践。</Translate>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden shadow-sm bg-white dark:bg-gray-800 mb-4 border border-gray-200 dark:border-gray-700">
                <img src={require('@site/static/images/ai-chat-interface.jpg').default} alt={aiSupportAlt} className="w-full h-full object-cover" />
              </div>
              <div className="text-purple-700 dark:text-purple-400 font-semibold text-sm flex items-center gap-1.5">
                <ZapIcon size={16} />
                <Translate id="homepage.products.aiSupport.cta">点击右下角图标开始咨询</Translate>
              </div>
            </div>
          </div>

          <div className="border-t-2 border-gray-300 dark:border-gray-700 pt-20 mb-20">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-12 text-gray-900 dark:text-gray-100">
              <Translate id="homepage.whyChoose.title">为什么选择 CCLHUB</Translate>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
              <div className="animate-enter" style={{ animationDelay: '0.1s' }}>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-900/50 dark:to-purple-800/50 flex items-center justify-center mb-5 shadow-md">
                  <ZapIcon size={24} className="text-white dark:text-purple-300" />
                </div>
                <h3 className="text-lg font-bold mb-2.5 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.features.instant.title">即时可用</Translate>
                </h3>
                <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed">
                  <Translate id="homepage.features.instant.description">无需复杂配置，安装即用。5分钟即可完成数据接入并开始分析。</Translate>
                </div>
              </div>

              <div className="animate-enter" style={{ animationDelay: '0.2s' }}>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-900/50 dark:to-purple-800/50 flex items-center justify-center mb-5 shadow-md">
                  <TrendIcon size={24} className="text-white dark:text-purple-300" />
                </div>
                <h3 className="text-lg font-bold mb-2.5 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.features.precise.title">精准分析</Translate>
                </h3>
                <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed">
                  <Translate id="homepage.features.precise.description">AI驱动的数据分析，深度洞察市场趋势和用户行为，准确率高达95%以上。</Translate>
                </div>
              </div>

              <div className="animate-enter" style={{ animationDelay: '0.3s' }}>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-900/50 dark:to-purple-800/50 flex items-center justify-center mb-5 shadow-md">
                  <ShieldIcon size={24} className="text-white dark:text-purple-300" />
                </div>
                <h3 className="text-lg font-bold mb-2.5 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.features.secure.title">数据安全</Translate>
                </h3>
                <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed">
                  <Translate id="homepage.features.secure.description">采用企业级加密技术，本地数据处理，严格保护商业隐私和数据安全。</Translate>
                </div>
              </div>

              <div className="animate-enter" style={{ animationDelay: '0.4s' }}>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-900/50 dark:to-purple-800/50 flex items-center justify-center mb-5 shadow-md">
                  <LightbulbIcon size={24} className="text-white dark:text-purple-300" />
                </div>
                <h3 className="text-lg font-bold mb-2.5 text-gray-900 dark:text-gray-100">
                  <Translate id="homepage.features.updates.title">持续更新</Translate>
                </h3>
                <div className="text-base text-gray-700 dark:text-gray-400 leading-relaxed">
                  <Translate id="homepage.features.updates.description">定期功能更新，AI模型持续优化，始终跟上电商发展趋势和技术前沿。</Translate>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
