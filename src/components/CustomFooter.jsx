'use client'

import Translate from '@docusaurus/Translate'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { Zap, Shield, Rocket, Github, MessageCircle } from 'lucide-react'

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
            <h3 className="text-xl font-bold text-white mb-3">CCLEE</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
              <Translate id="footer.tagline">AI驱动的电商运营工具平台</Translate>
            </p>

            {/* 特性标签 */}
            <div className="flex gap-2 mb-4">
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

            {/* 社媒图标 */}
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/cclee-hub/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                aria-label="GitHub"
              >
                <Github size={18} />
              </a>

              {/* 微信 - 仅中文站 */}
              {!isEn && (
                <div className="relative group">
                  <div className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200 cursor-pointer">
                    <MessageCircle size={18} />
                  </div>
                  <div className="absolute top-full left-0 mt-2 w-[136px] p-3 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    <img
                      src="/images/wechat-qr.jpg"
                      alt="微信二维码"
                      className="w-full aspect-square rounded"
                    />
                    <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">扫码联系</p>
                  </div>
                </div>
              )}

              {/* Upwork - 仅英文站 */}
              {/* 英文站社媒 */}
              {isEn && (
                <>
                  <a
                    href="https://www.upwork.com/freelancers/~010ab5ec29d8f4ff3f"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                    aria-label="Upwork"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.561 13.158c-1.698 0-3.074-1.376-3.074-3.074s1.376-3.074 3.074-3.074 3.074 1.376 3.074 3.074-1.376 3.074-3.074 3.074zm-6.478-6.479h-2.81v8.372c0 .838-.68 1.518-1.518 1.518s-1.518-.68-1.518-1.518V6.68H5.427v8.372c0 2.392 1.944 4.336 4.336 4.336s4.336-1.944 4.336-4.336V6.68h-.016zm12.892-2.81H22.17v10.645c0 .838-.68 1.518-1.518 1.518-.468 0-.887-.212-1.163-.546 1.023-.973 1.662-2.345 1.662-3.867 0-2.961-2.409-5.37-5.37-5.37s-5.37 2.409-5.37 5.37 2.409 5.37 5.37 5.37c.996 0 1.928-.274 2.732-.747.766 1.027 1.98 1.695 3.35 1.695 2.32 0 4.207-1.887 4.207-4.207V3.868h-.078z"/>
                    </svg>
                  </a>
                  <a
                    href="https://x.com/CaichenLee"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                    aria-label="X"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                  <a
                    href="https://www.linkedin.com/in/cc-lee-9b0b113bb/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
                    aria-label="LinkedIn"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                </>
              )}
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
                { href: '/cclee-theme', id: 'footer.ccleeTheme', label: 'WordPress 主题' },
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
        <div className="border-t border-gray-800 dark:border-gray-600 pt-8">
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
              href="https://app.aigent.ren/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:text-white dark:hover:text-gray-200 transition-colors duration-200"
            >
              app.aigent.ren
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
            <div>© {currentYear} CCLEE. <Translate id="footer.copyright">All rights reserved.</Translate></div>

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
