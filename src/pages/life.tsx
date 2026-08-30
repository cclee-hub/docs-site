import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import { translate } from '@docusaurus/Translate';
import { ZapIcon, GlobeIcon, LayersIcon, BrainIcon, ShieldIcon, MessageCircleIcon, KeyIcon, CheckIcon } from '@site/src/components/Icons';
import { HeroBackground } from '@site/src/components/HeroSection';

export default function LifePage(): React.ReactElement {
  const title = translate({ id: 'life.title', message: 'Life 记账助手 - 说人话就能记' });
  const description = translate({ id: 'life.description', message: 'Life 记账健康助手 - 自然语言记账，情绪与服药一起管，端到端加密保护隐私' });

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
              <Translate id="life.hero.title">Life 记账助手</Translate>
            </h1>

            <div className="text-xl sm:text-2xl lg:text-3xl text-gray-700 dark:text-gray-300 mb-10 leading-relaxed max-w-[700px] mx-auto">
              <Translate id="life.hero.slogan">说人话就能记——收支、情绪、服药，一句话的事</Translate>
            </div>

            <Link
              to="https://life.ccleeai.com"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <ZapIcon size={20} />
              <Translate id="life.hero.cta">立即体验</Translate>
            </Link>

            <div className="mt-5 text-sm text-gray-500 dark:text-gray-400">
              <Translate id="life.hero.beta">限量内测 · 邀请制 · Web 端</Translate>
            </div>
          </div>
        </div>

        {/* Core Features Section */}
        <div className="max-w-[1200px] mx-auto px-5 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              <Translate id="life.features.title">核心特性</Translate>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-[600px] mx-auto">
              <Translate id="life.features.subtitle">记账不该是填表，健康值得被温柔记录</Translate>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: 自然语言记账 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <ZapIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="life.features.nl.title">自然语言记账</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="life.features.nl.slogan">说出来就记好了</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="life.features.nl.description">金额、时间、类目、账户自动抽取，确认卡片一眼核对，模糊说法给候选不瞎猜</Translate>
              </p>
            </div>

            {/* Feature 2: 多币种 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <GlobeIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="life.features.currency.title">多币种记账</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="life.features.currency.slogan">按原话币种记录</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="life.features.currency.description">支持 CNY / USD / EUR / JPY / HKD / TWD，按币种分组统计，不做汇率换算</Translate>
              </p>
            </div>

            {/* Feature 3: 账户与借贷 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <LayersIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="life.features.ledger.title">账户与借贷</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="life.features.ledger.slogan">余额与往来一目了然</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="life.features.ledger.description">多账户余额、账户间转账，借款还款自动核销，未结金额实时可见</Translate>
              </p>
            </div>

            {/* Feature 4: 情绪与服药 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <BrainIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="life.features.health.title">情绪与服药</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="life.features.health.slogan">身心一起照顾</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="life.features.health.description">情绪曲线长期追踪，PHQ-9 / GAD-7 自评筛查（参考工具，不构成医疗诊断）</Translate>
              </p>
            </div>

            {/* Feature 5: 端到端加密 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <ShieldIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="life.features.privacy.title">端到端加密</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="life.features.privacy.slogan">数据库里只有密文</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="life.features.privacy.description">每个账号一把独立密钥，敏感字段加密后存储，注销即密码学擦除</Translate>
              </p>
            </div>

            {/* Feature 6: 聊天模式 */}
            <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-4 shadow-md">
                <MessageCircleIcon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                <Translate id="life.features.chat.title">聊天模式</Translate>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 font-medium text-purple-600 dark:text-purple-400">
                <Translate id="life.features.chat.slogan">只依据你的真实数据</Translate>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <Translate id="life.features.chat.description">问「这个月花了多少」，聊聊收支与情绪，回答有据可查不编造</Translate>
              </p>
            </div>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="bg-gray-50 dark:bg-gray-900 py-20">
          <div className="max-w-[1200px] mx-auto px-5">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                <Translate id="life.privacy.title">你的数据，只属于你</Translate>
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-[600px] mx-auto">
                <Translate id="life.privacy.subtitle">财务与健康状况是最私人的数据，我们从设计上把它当作底线</Translate>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md">
                  <KeyIcon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  <Translate id="life.privacy.encryption.title">独立密钥加密</Translate>
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  <Translate id="life.privacy.encryption.description">每个账号一把数据密钥，AES-256-GCM 加密后入库，泄露也只有密文</Translate>
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md">
                  <CheckIcon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  <Translate id="life.privacy.deletion.title">注销即擦除</Translate>
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  <Translate id="life.privacy.deletion.description">自助注销删除全部数据并销毁密钥，任何残留密文永久不可解</Translate>
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-5 shadow-md">
                  <ShieldIcon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  <Translate id="life.privacy.logs.title">日志全程脱敏</Translate>
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  <Translate id="life.privacy.logs.description">系统日志只留技术元数据，不记录你的原文和金额</Translate>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-20 text-center">
          <div className="max-w-[700px] mx-auto px-5">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-gray-900 dark:text-white">
              <Translate id="life.cta.title">开始用 Life 照顾自己</Translate>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-10">
              <Translate id="life.cta.description">不用学新软件，像发消息一样记账</Translate>
            </p>
            <Link
              to="https://life.ccleeai.com"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-xl text-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <ZapIcon size={20} />
              <Translate id="life.cta.button">立即体验</Translate>
            </Link>
            <div className="mt-6">
              <Link to="/docs/life" className="text-purple-700 dark:text-purple-400 font-semibold hover:underline">
                <Translate id="life.cta.docs">查看使用文档 →</Translate>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
