import React, { useState } from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import Translate, { translate } from '@docusaurus/Translate';
import { ZapIcon, MailIcon } from '@site/src/components/Icons';
import { Award, Target, Copy, Check } from 'lucide-react';

const TargetIcon = Target;
const AwardIcon = Award;

export default function AboutPage(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('leecc1531@gmail.com');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = 'leecc1531@gmail.com';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "CCLEE 是谁？",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "CCLEE 是拥有24年电商行业实战经验的独立开发者，专注将AI能力落地于真实商业场景。主导过多平台电商运营年销售额突破800万元，2024年落地13个AI增效工具节省70%重复性人力工作。"
        }
      },
      {
        "@type": "Question",
        "name": "CCLEE 提供哪些服务？",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "提供三类服务：1) AI工具开发 - 客服自动化、数据采集、文案生成、选品分析等定制化AI工具；2) 中国出海 - 1688、速卖通、独立站全渠道运营；3) 外企入华 - 中国市场策略、平台选择、本地化推广。"
        }
      },
      {
        "@type": "Question",
        "name": "如何联系 CCLEE？",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "邮箱：leecc1531@gmail.com，或扫描网站上的微信二维码添加微信联系。"
        }
      }
    ]
  };

  return (
    <Layout title="关于我" description="关于 CCLEE - 独立开发者，AI工具开发与本地化服务">
      <Head>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Head>
      <main className="max-w-[1200px] mx-auto px-5 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full overflow-hidden shadow-lg ring-4 ring-purple-500/20">
            <img
              src={require('@site/static/images/avatar.webp').default}
              alt="CCLEE"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 text-gray-900 dark:text-white">
            <Translate id="about.title">关于我</Translate>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            <Translate id="about.subtitle">独立开发者，拥有24年电商行业实战经验，专注将AI能力落地于真实商业场景，围绕业务需求开发实用工具与系统，拒绝脱离实际的技术堆砌。</Translate>
          </p>
        </div>

        {/* Achievements Section */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <AwardIcon size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              <Translate id="about.achievements.title">核心成果</Translate>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                <Translate id="about.achievements.item1">主导多平台电商运营，年销售额突破800万元，成功打造数十款全国类目Top 10产品</Translate>
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                <Translate id="about.achievements.item2">负责企业全渠道运营，月均销售额环比增长200%，独立站海外询盘量提升30%</Translate>
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                <Translate id="about.achievements.item3">2024年落地13个AI增效工具（覆盖客服、选品、广告、文案等场景），节省70%重复性人力工作</Translate>
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                <Translate id="about.achievements.item4">以顾问身份主导工业品1688运营，4个月内销售额增长3倍；"烙铁嘴"类目销售额稳居行业第一（数据来源：1688平台，2025年9月至今）</Translate>
              </p>
            </div>
          </div>
        </div>

        {/* Current Focus Section */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <TargetIcon size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              <Translate id="about.focus.title">当前聚焦</Translate>
            </h2>
          </div>
          <ul className="space-y-3 text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <Translate id="about.focus.item1">为企业定制高ROI的AI增效工具</Translate>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <Translate id="about.focus.item2">助力海外品牌高效进入并深耕中国市场</Translate>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <Translate id="about.focus.item3">为出海企业提供本土化运营支持</Translate>
            </li>
          </ul>
        </div>

        {/* CCLHUB Section */}
        <div className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/40 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-600 dark:bg-purple-500 flex items-center justify-center">
              <ZapIcon size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">CCLHUB</h2>
          </div>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            <Translate id="about.cclhub.desc">CCLHUB是我持续迭代的产品体系，技术能力与商业实践的综合体现。</Translate>
          </p>
        </div>

        {/* Contact Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <MailIcon size={20} className="text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              <Translate id="about.contact.title">联系方式</Translate>
            </h2>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <a
              href="mailto:leecc1531@gmail.com"
              className="text-purple-600 dark:text-purple-400 hover:underline text-lg"
            >
              📧 leecc1531@gmail.com
            </a>
            <button
              onClick={handleCopyEmail}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
              title={copied ? translate({ id: 'about.contact.copied', message: '已复制' }) : translate({ id: 'about.contact.copy', message: '复制邮箱' })}
            >
              {copied ? (
                <>
                  <Check size={12} />
                  <span><Translate id="about.contact.copied">已复制</Translate></span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span><Translate id="about.contact.copy">复制</Translate></span>
                </>
              )}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-32 h-32 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center">
              <img
                src={require('@site/static/images/wechat-qr.webp').default}
                alt="微信二维码"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <Translate id="about.contact.wechat">扫码添加微信</Translate>
              </p>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
