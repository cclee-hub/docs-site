import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import { translate } from '@docusaurus/Translate';
import { MessageCircleIcon, EyeIcon, KeyIcon, ShieldIcon, BrainIcon, ZapIcon } from '@site/src/components/Icons';
import { HeroBackground } from '@site/src/components/HeroSection';

export default function AgntcPage(): React.ReactElement {
  const title = translate({ id: 'agntc.title', message: 'AI Agent Platform - 说出来就能做到' });
  const description = translate({ id: 'agntc.description', message: 'AI Agent Platform - 自然语言驱动，执行透明，自带 API Key，沙箱安全' });

  return (
    <Layout title={title} description={description}>
      <main>
        {/* Hero Section */}
        <div className="relative min-h-[50vh] flex flex-col items-center justify-center px-5 pt-[80px] pb-[60px] text-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <HeroBackground />
          </div>
          <div className="relative z-10 animate-fadeInUp">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent tracking-tight">
              <Translate id="agntc.hero.title">AI Agent Platform</Translate>
            </h1>

            <div className="text-xl sm:text-2xl lg:text-3xl text-gray-700 dark:text-gray-300 mb-10 leading-relaxed max-w-[700px] mx-auto">
              <Translate id="agntc.hero.slogan">说出来就能做到，不用找开发者</Translate>
            </div>

            <Link
              to="https://app.ccleeai.com"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <ZapIcon size={20} />
              <Translate id="agntc.hero.cta">立即体验</Translate>
            </Link>
          </div>
        </div>

        {/* Core Features Section */}
        <div className="max-w-[1200px] mx-auto px-5 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              <Translate id="agntc.features.title">核心特性</Translate>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-[600px] mx-auto">
              <Translate id="agntc.features.subtitle">为安全、透明、高效的 AI Agent 体验而设计</Translate>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: 自然语言驱动 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <MessageCircleIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="agntc.features.natural.title">自然语言驱动</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="agntc.features.natural.slogan">说出来就能做到</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="agntc.features.natural.description">用日常语言描述需求，Agent 自动理解并执行，零代码门槛</Translate>
              </p>
            </div>

            {/* Feature 2: 执行透明 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <EyeIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="agntc.features.transparent.title">执行透明</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="agntc.features.transparent.slogan">每一步实时可见</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="agntc.features.transparent.description">实时查看执行过程，随时叫停，完全掌控</Translate>
              </p>
            </div>

            {/* Feature 3: BYOK */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <KeyIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="agntc.features.byok.title">自带 API Key</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="agntc.features.byok.slogan">你的 Key 你自己保管</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="agntc.features.byok.description">数据不经平台，成本透明，用多少付多少</Translate>
              </p>
            </div>

            {/* Feature 4: 沙箱安全 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <ShieldIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="agntc.features.sandbox.title">沙箱安全</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="agntc.features.sandbox.slogan">三层防护</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="agntc.features.sandbox.description">隔离执行环境，保护系统安全，放心使用</Translate>
              </p>
            </div>

            {/* Feature 5: 智能记忆 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <BrainIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="agntc.features.memory.title">智能记忆</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="agntc.features.memory.slogan">越用越懂你</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="agntc.features.memory.description">记住你的偏好和习惯，不用重复交代，效率倍增</Translate>
              </p>
            </div>
          </div>
        </div>

        {/* Use Cases Section */}
        <div className="bg-gray-50 dark:bg-gray-900 py-20">
          <div className="max-w-[1200px] mx-auto px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                <Translate id="agntc.usecases.title">应用场景</Translate>
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-[600px] mx-auto">
                <Translate id="agntc.usecases.subtitle">多种场景，一个平台解决</Translate>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Use Case 1 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md">
                  <ZapIcon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  <Translate id="agntc.usecases.automation.title">日常任务自动化</Translate>
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  <Translate id="agntc.usecases.automation.description">数据整理、报告生成、流程编排，说出来就执行</Translate>
                </p>
              </div>

              {/* Use Case 2 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md">
                  <KeyIcon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  <Translate id="agntc.usecases.cost.title">成本透明可控</Translate>
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  <Translate id="agntc.usecases.cost.description">自带 API Key，无中间商，用多少付多少</Translate>
                </p>
              </div>

              {/* Use Case 3 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md">
                  <ShieldIcon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  <Translate id="agntc.usecases.security.title">安全执行环境</Translate>
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  <Translate id="agntc.usecases.security.description">沙箱隔离，实时可见，随时叫停</Translate>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-20 text-center">
          <div className="max-w-[700px] mx-auto px-5">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-gray-900 dark:text-white">
              <Translate id="agntc.cta.title">开始你的 AI Agent 之旅</Translate>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-10">
              <Translate id="agntc.cta.description">无需复杂配置，说出来就能做到</Translate>
            </p>
            <Link
              to="https://app.ccleeai.com"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-xl text-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <ZapIcon size={20} />
              <Translate id="agntc.cta.button">免费体验</Translate>
            </Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
