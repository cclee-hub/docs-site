import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import { translate } from '@docusaurus/Translate';
import { PluginIcon, AIIcon, ZapIcon, TrendIcon, ShieldIcon, LightbulbIcon, MessageCircleIcon, RocketIcon, LayoutIcon, ToolIcon, BuildingIcon, TruckIcon, BookOpenIcon, GlobeIcon, LayersIcon } from '@site/src/components/Icons';
import { HeroBackground } from '@site/src/components/HeroSection';
import ProductListRow from '@site/src/components/ProductListRow';

export default function Products(): React.ReactElement {
  const title = translate({ id: 'homepage.title', message: 'CCLHUB - AI驱动的电商运营工具平台' });
  const description = translate({ id: 'homepage.description', message: 'CCLHUB 电商运营工具平台 - AI驱动的AI运营与电商工具箱' });

  return (
    <Layout title={title} description={description}>
      <main>
        <div className="relative min-h-[45vh] flex flex-col items-center justify-center px-5 pt-[80px] pb-[40px] text-center overflow-hidden">
          {/* Particle Background */}
          <div className="absolute inset-0 z-0">
            <HeroBackground />
          </div>
          <div className="relative z-10 animate-fadeInUp">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black leading-tight mb-8 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent tracking-tight">
              <Translate id="homepage.hero.title">您的业务，还有几个环节在靠人工支撑</Translate>
            </h1>

            <div className="text-lg sm:text-xl lg:text-2xl text-gray-600 dark:text-gray-400 mb-8 leading-relaxed max-w-[700px] mx-auto text-center">
              <Translate id="homepage.hero.subtitle">重复人工、成本攀升、竞争加剧——AI定制工具帮您降本增效，重建竞争优势</Translate>
            </div>

          </div>

        </div>

        {/* Transition Section */}
        <div className="py-16 px-5 text-center">
          <div className="text-lg sm:text-xl lg:text-2xl text-gray-700 dark:text-gray-300 max-w-[700px] mx-auto leading-relaxed">
            <Translate id="homepage.transition">已落地170+个AI定制工具，覆盖出海、入华、内部流程自动化。非通用软件，专为您的业务场景定制开发</Translate>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-5 py-20">

          {/* WordPress / WooCommerce 主题插件 */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-900 dark:text-white">
              <Translate id="homepage.products.wordpress.title">WordPress / WooCommerce 主题 插件</Translate>
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              <Translate id="homepage.products.wordpress.subtitle">免费开源的 WordPress / WooCommerce 主题与插件</Translate>
            </p>
          </div>

          <div className="space-y-3 mb-12">
            <ProductListRow
              icon={<LayoutIcon size={24} className="text-white" />}
              name="CCLEE Theme"
              nameId="homepage.products.ccleeTheme.title"
              description="免费 WordPress FSE 区块主题。76 行 JS、零依赖、24 区块、5 种风格，开发者与建站者皆宜。"
              descriptionId="homepage.products.ccleeTheme.description"
              cta="GitHub 开源 · 永久免费"
              ctaId="homepage.products.ccleeTheme.cta"
              ctaLink="/cclee-theme"
              animationDelay="0.1s"
            />
            <ProductListRow
              icon={<ToolIcon size={24} className="text-white" />}
              name="CCLEE Toolkit"
              nameId="homepage.products.ccleeToolkit.title"
              description="WordPress + WooCommerce 增强插件。全系列集成 AI 操作，自动生成 SEO 内容、Product Schema、图片 Alt，显著提升搜索引擎排名。"
              descriptionId="homepage.products.ccleeToolkit.description"
              cta="GitHub 开源 · 永久免费"
              ctaId="homepage.products.ccleeToolkit.cta"
              ctaLink="/docs/cclee-toolkit"
              animationDelay="0.2s"
            />
            <ProductListRow
              icon={<BuildingIcon size={24} className="text-white" />}
              name="CCLEE B2B"
              nameId="homepage.products.ccleeB2b.title"
              description="WooCommerce B2B 增强插件。企业用户管理、差异化定价、报价系统、批量下单，让批发商和品牌商高效开展线上业务。"
              descriptionId="homepage.products.ccleeB2b.description"
              cta="GitHub 开源 · 永久免费"
              ctaId="homepage.products.ccleeB2b.cta"
              ctaLink="/docs/cclee-b2b-general"
              animationDelay="0.3s"
            />
            <ProductListRow
              icon={<TruckIcon size={24} className="text-white" />}
              name="CCLEE Shipping"
              nameId="homepage.products.ccleeShipping.title"
              description="WooCommerce 多承运商物流插件。FedEx、顺丰国际实时运费报价，结算页自动显示真实运费。"
              descriptionId="homepage.products.ccleeShipping.description"
              cta="GitHub 开源 · 永久免费"
              ctaId="homepage.products.ccleeShipping.cta"
              ctaLink="/docs/cclee-shipping"
              animationDelay="0.4s"
            />
          </div>

          {/* 电子商务运营 */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-900 dark:text-white">
              <Translate id="homepage.products.core.title">电子商务运营</Translate>
            </h2>
          </div>

          <div className="space-y-3 mb-12">
            <ProductListRow
              icon={<PluginIcon size={24} className="text-white" />}
              name="电商工具箱"
              nameId="homepage.products.toolkit.title"
              description="一站式电商运营解决方案，从数据采集到智能分析，全方位提升运营效率"
              descriptionId="homepage.products.toolkit.description"
              cta="了解更多"
              ctaId="homepage.products.toolkit.cta"
              ctaLink="/docs/browser-plugin"
              animationDelay="0.1s"
            />
            <ProductListRow
              icon={<AIIcon size={24} className="text-white" />}
              name="AI运营"
              nameId="homepage.products.aiOps.title"
              description="基于大语言模型的智能分析，自动洞察市场趋势、用户行为、销售数据，提供精准运营策略。"
              descriptionId="homepage.products.aiOps.description"
              cta="了解更多"
              ctaId="homepage.products.aiOps.cta"
              ctaLink="/docs/ai-analytics"
              animationDelay="0.2s"
            />
            <ProductListRow
              icon={<MessageCircleIcon size={24} className="text-white" />}
              name="AI客服"
              nameId="homepage.products.aiSupport.title"
              description="7×24小时AI客服，快速解答产品使用问题，提供功能指导和最佳实践。"
              descriptionId="homepage.products.aiSupport.description"
              cta="了解更多"
              ctaId="homepage.products.aiSupport.cta"
              ctaLink="/docs/customer-service"
              animationDelay="0.3s"
            />
            <ProductListRow
              icon={<RocketIcon size={24} className="text-white" />}
              name="AI Agent"
              nameId="homepage.products.agntc.title"
              description="说出来就能做到，不用找开发者。自带 API Key，执行透明，数据自主。"
              descriptionId="homepage.products.agntc.description"
              cta="访问 app.ccleeai.com"
              ctaId="homepage.products.agntc.cta"
              ctaLink="/agntc"
              animationDelay="0.4s"
            />
            <ProductListRow
              icon={<GlobeIcon size={24} className="text-white" />}
              name="跨境铺货助手"
              nameId="homepage.products.aiProductListing.title"
              description="一键采集淘宝/1688商品，AI自动生成英文描述和定价，审核后直接上架WooCommerce，支持多店铺管理。"
              descriptionId="homepage.products.aiProductListing.description"
              cta="了解更多"
              ctaId="homepage.products.aiProductListing.cta"
              ctaLink="/docs/ai-product-listing"
              animationDelay="0.5s"
            />
          </div>

          {/* 开发者工具 */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-900 dark:text-white">
              <Translate id="homepage.products.devtools.title">开发者工具</Translate>
            </h2>
          </div>

          <div className="space-y-3 mb-12">
            <ProductListRow
              icon={<BookOpenIcon size={24} className="text-white" />}
              name="CCLEE Docusaurus Theme"
              nameId="homepage.products.ccleeDocusaurusTheme.title"
              description="基于 Docusaurus 3.x 的高级文档主题，紫色主题 + 深色模式 + Tailwind 排版增强，开箱即用的生产级文档站点模板。"
              descriptionId="homepage.products.ccleeDocusaurusTheme.description"
              cta="GitHub 开源 · 永久免费"
              ctaId="homepage.products.ccleeDocusaurusTheme.cta"
              ctaLink="/docs/cclee-docusaurus-theme"
              animationDelay="0.1s"
            />
            <ProductListRow
              icon={<LayersIcon size={24} className="text-white" />}
              name="任务栈"
              nameId="homepage.products.taskStack.title"
              description="单人多项目任务上下文栈，push/pop 追踪当前进度，跨会话持久化，与 Claude Code 深度集成"
              descriptionId="homepage.products.taskStack.description"
              cta="了解更多"
              ctaId="homepage.products.taskStack.cta"
              ctaLink="/docs/task-stack"
              animationDelay="0.2s"
            />
          </div>

          {/* 个人应用 */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-900 dark:text-white">
              <Translate id="homepage.products.personal.title">个人应用</Translate>
            </h2>
          </div>

          <div className="space-y-3 mb-12">
            <ProductListRow
              icon={<TrendIcon size={24} className="text-white" />}
              name="Life 记账助手"
              nameId="homepage.products.life.title"
              description="自然语言记账健康助手。说人话就能记——AI 自动抽取金额、类目、账户；同时追踪情绪与服药，端到端加密保护隐私。"
              descriptionId="homepage.products.life.description"
              cta="访问 life.ccleeai.com"
              ctaId="homepage.products.life.cta"
              ctaLink="/life"
              animationDelay="0.1s"
            />
          </div>

        </div>
      </main>
    </Layout>
  );
}
