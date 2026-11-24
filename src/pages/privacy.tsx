import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import { translate } from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { ShieldIcon } from '@site/src/components/Icons';

export default function PrivacyPage(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();
  const lastUpdated = String(siteConfig.customFields?.lastUpdatedZh ?? '');
  const title = translate({ id: 'privacy.title', message: '隐私政策' });
  const description = translate({ id: 'privacy.description', message: 'CCLEE 隐私政策' });

  return (
    <Layout title={title} description={description}>
      <main>
        {/* Hero Section */}
        <div className="relative min-h-[30vh] flex flex-col items-center justify-center px-5 pt-[80px] pb-[40px] text-center">
          <div className="relative z-10 animate-fadeInUp">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-6 mx-auto shadow-md">
              <ShieldIcon size={32} className="text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-4 text-gray-900 dark:text-white">
              <Translate id="privacy.title">隐私政策</Translate>
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[900px] mx-auto px-5 pb-20">
          <div className="space-y-8">
            {/* 开源声明 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="privacy.opensource.title">开源项目</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                <Translate id="privacy.opensource.desc">本网站为开源项目，遵循 MIT 协议。我们不会收集、存储或传输任何访问者的个人信息。</Translate>
              </p>
            </div>

            {/* 本地运行 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="privacy.local.title">本地运行</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                <Translate id="privacy.local.desc">本网站代码完全开源，您可以自行托管和部署。所有数据处理仅在您的浏览器本地进行。</Translate>
              </p>
            </div>

            {/* 第三方服务 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="privacy.thirdparty.title">第三方服务</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                <Translate id="privacy.thirdparty.desc">本网站不使用任何数据分析、广告或追踪服务。</Translate>
              </p>
            </div>

            {/* 开源代码 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="privacy.source.title">开源代码</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                <Translate id="privacy.source.desc">您可以在 GitHub 上查看完整的源代码，了解网站的工作原理。</Translate>
              </p>
            </div>

            {/* 更新时间 */}
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 pt-4">
              <Translate id="privacy.lastUpdate">最后更新</Translate>: {lastUpdated}
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
