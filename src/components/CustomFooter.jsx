'use client'

import Translate from '@docusaurus/Translate'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { Zap, Shield, Rocket } from 'lucide-react'

export default function CustomFooter() {
  const currentYear = new Date().getFullYear()
  const { i18n } = useDocusaurusContext()
  const isEn = i18n.currentLocale === 'en'

  const features = isEn
    ? [
        { icon: Zap, label: 'Efficient' },
        { icon: Shield, label: 'Secure' },
        { icon: Rocket, label: 'Innovative' },
      ]
    : [
        { icon: Zap, label: '高效' },
        { icon: Shield, label: '安全' },
        { icon: Rocket, label: '创新' },
      ]

  return (
    <footer className="bg-gray-900 dark:bg-gray-950 text-gray-400">
      <div className="max-w-[1200px] mx-auto px-5 py-16">
        {/* 4列布局 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-12">
          {/* 品牌列 */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-xl font-bold text-white mb-3">CC.L</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
              <Translate id="footer.tagline">AI驱动的电商运营工具平台</Translate>
            </p>

            {/* 特性标签 */}
            <div className="flex gap-2">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 dark:bg-gray-800/50 text-[10px] text-gray-400 dark:text-gray-500"
                >
                  <feature.icon size={10} className="text-indigo-400" />
                  {feature.label}
                </div>
              ))}
            </div>
          </div>

          {/* 产品 */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm">
              <Translate id="footer.products">产品</Translate>
            </h4>
            <ul className="space-y-3 text-sm">
              {[
                { href: '/docs/ai-analytics', id: 'footer.aiAnalytics', label: 'AI运营' },
                { href: '/docs/browser-plugin', id: 'footer.browserPlugin', label: '电商工具箱' },
                { href: '/docs/customer-service', id: 'footer.aiService', label: 'AI客服' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                  >
                    <Translate id={link.id}>{link.label}</Translate>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 资源 */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm">
              <Translate id="footer.resources">资源</Translate>
            </h4>
            <ul className="space-y-3 text-sm">
              {[
                { href: '/services', id: 'footer.services', label: '服务' },
                { href: '/products', id: 'footer.products', label: '产品' },
                { href: '/cases', id: 'footer.cases', label: '案例' },
                { href: '/blog', id: 'footer.blog', label: '博客' },
                { href: '/about', id: 'footer.aboutUs', label: '关于我们' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                  >
                    <Translate id={link.id}>{link.label}</Translate>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 支持 */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm">
              <Translate id="footer.support">支持</Translate>
            </h4>
            <ul className="space-y-3 text-sm">
              {[
                { href: '/docs/ai-analytics', id: 'footer.getStarted', label: '快速开始' },
                { href: '/docs/customer-service', id: 'footer.helpCenter', label: '帮助中心' },
                { href: '/privacy', id: 'footer.privacy', label: '隐私政策' },
                { href: '/terms', id: 'footer.terms', label: '服务条款' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                  >
                    <Translate id={link.id}>{link.label}</Translate>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="border-t border-gray-800 pt-8">
          {/* 站点外链 - SEO */}
          <div className="flex justify-center gap-6 mb-6 text-sm">
            <a
              href="https://www.aigent.ren/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
            >
              aigent.ren
            </a>
            <span className="text-gray-700 dark:text-gray-600">•</span>
            <a
              href="https://aidevhub.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
            >
              aidevhub.ai
            </a>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            {/* 版权信息 */}
            <div>© {currentYear} CC.L. <Translate id="footer.copyright">All rights reserved.</Translate></div>

            {/* 备案信息 - 仅中文版 */}
            {!isEn && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors duration-200"
                >
                  粤ICP备2026015835号
                </a>
                <span className="text-gray-700 dark:text-gray-500">•</span>
                <a
                  href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=44200102445864"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors duration-200 flex items-center gap-1.5"
                >
                  <img
                    src="/images/beian.png"
                    alt="公安备案"
                    className="w-4 h-4"
                  />
                  粤公网安备44200102445864号
                </a>
              </div>
            )}
          </div>

          {/* 合规声明 - 仅中文版 */}
          {!isEn && (
            <div className="mt-4 text-xs text-gray-600 dark:text-gray-400 space-y-1 text-center md:text-left">
              <p>
                <Translate id="footer.compliance1">
                  本网站遵循 MIT 开源协议，完全在本地运行，不收集任何用户数据。
                </Translate>
              </p>
              <p>
                <Translate id="footer.compliance2">
                  仅供技术学习与研究使用，用户需自行确保符合目标平台规则及当地法律法规。
                </Translate>
              </p>
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}
