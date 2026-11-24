import React from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import { translate } from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { FileIcon } from '@site/src/components/Icons';

export default function TermsPage(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();
  const lastUpdated = String(siteConfig.customFields?.lastUpdatedZh ?? '');
  const title = translate({ id: 'terms.title', message: '服务条款' });
  const description = translate({ id: 'terms.description', message: 'CCLEE 服务条款' });

  return (
    <Layout title={title} description={description}>
      <main>
        {/* Hero Section */}
        <div className="relative min-h-[30vh] flex flex-col items-center justify-center px-5 pt-[80px] pb-[40px] text-center">
          <div className="relative z-10 animate-fadeInUp">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mb-6 mx-auto shadow-md">
              <FileIcon size={32} className="text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-4 text-gray-900 dark:text-white">
              <Translate id="terms.title">服务条款</Translate>
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[900px] mx-auto px-5 pb-20">
          <div className="space-y-8">
            {/* 开源协议 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="terms.license.title">开源协议</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                <Translate id="terms.license.desc">本网站遵循 MIT 开源协议。</Translate>
              </p>
              <ul className="space-y-2 text-base text-gray-700 dark:text-gray-300">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <Translate id="terms.license.commercial">允许商业使用</Translate>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <Translate id="terms.license.modify">允许修改</Translate>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <Translate id="terms.license.distribute">允许分发</Translate>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <Translate id="terms.license.private">允许私用</Translate>
                </li>
              </ul>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
                <a
                  href="https://opensource.org/licenses/MIT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 dark:text-purple-400 hover:underline"
                >
                  <Translate id="terms.license.viewFull">查看完整协议</Translate> →
                </a>
              </p>
            </div>

            {/* 免责声明 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="terms.disclaimer.title">免责声明</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                <Translate id="terms.disclaimer.desc">本网站按"原样"提供，不提供任何形式保证。使用本网站代码造成的任何损失，开发者不承担责任。</Translate>
              </p>
            </div>

            {/* 使用须知 */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                <Translate id="terms.usage.title">使用须知</Translate>
              </h2>
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                <Translate id="terms.usage.desc">访问和使用本网站即表示您同意：</Translate>
              </p>
              <ul className="space-y-2 text-base text-gray-700 dark:text-gray-300">
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">•</span>
                  <Translate id="terms.usage.item1">遵守当地法律法规</Translate>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">•</span>
                  <Translate id="terms.usage.item2">不将本网站用于非法用途</Translate>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">•</span>
                  <Translate id="terms.usage.item3">自行承担使用风险</Translate>
                </li>
              </ul>
            </div>

            {/* 更新时间 */}
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 pt-4">
              <Translate id="terms.lastUpdate">最后更新</Translate>: {lastUpdated}
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
