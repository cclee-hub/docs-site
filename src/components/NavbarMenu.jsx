'use client'

import { useState } from 'react'
import { Menu, X, Sparkles } from 'lucide-react'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import ThemeSwitch from './ThemeSwitch'
import LocaleSwitch from './LocaleSwitch'
import { useTranslations } from './TranslationProvider'
import { useLocation } from '@docusaurus/router'

export default function NavbarMenu() {
  const { t } = useTranslations()
  const location = useLocation()
  const { i18n } = useDocusaurusContext()
  // 单语单域：当前语言即站点默认语言（ aidevhub.ai=en，ccleeai.com=zh）
  const locale = i18n.defaultLocale
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState(null)

  const navItems = [
    { href: '/', label: t('nav.home'), icon: Sparkles },
    { href: '/browser-plugin', label: t('nav.browserPlugin') },
    { href: '/ai-analytics', label: t('nav.aiAnalytics') },
    { href: '/customer-service', label: t('nav.customerService') },
  ]

  const isActive = (href) => {
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname.includes(href)
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className={`
          md:hidden relative p-2.5 -mr-2 rounded-xl
          transition-all duration-300
          focus:outline-none
          group
          ${isOpen
            ? 'bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20'
            : 'hover:bg-gray-100 dark:hover:bg-white/5'
          }
        `}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        <div className="relative w-5 h-5">
          <Menu
            size={20}
            className={`
              absolute inset-0 transition-all duration-300
              text-gray-600 dark:text-gray-300
              ${isOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}
            `}
          />
          <X
            size={20}
            className={`
              absolute inset-0 transition-all duration-300
              text-indigo-600 dark:text-indigo-400
              ${isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}
            `}
          />
        </div>
      </button>

      {/* Desktop navigation */}
      <div className="hidden md:flex items-center gap-1">
        {navItems.map((item, index) => {
          const active = isActive(item.href)
          const isHovered = hoveredItem === item.href

          return (
            <a
              key={item.href}
              href={item.href}
              onMouseEnter={() => setHoveredItem(item.href)}
              onMouseLeave={() => setHoveredItem(null)}
              className={`
                relative px-4 py-2
                text-sm font-medium
                no-underline
                rounded-full
                transition-all duration-300
                group
                ${active
                  ? 'text-indigo-600 dark:text-indigo-300'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }
              `}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* 背景效果 - 悬停/激活时显示 */}
              <span
                className={`
                  absolute inset-0 rounded-full
                  transition-all duration-300
                  ${active
                    ? 'bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 dark:from-indigo-500/20 dark:via-purple-500/20 dark:to-indigo-500/20'
                    : isHovered
                      ? 'bg-gray-100/80 dark:bg-white/5'
                      : 'opacity-0'
                  }
                `}
              />

              {/* 液态边框 - 激活时 */}
              {active && (
                <span
                  className="absolute inset-0 rounded-full opacity-100"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s infinite',
                  }}
                />
              )}

              {/* 文字 */}
              <span className="relative z-10 flex items-center gap-1.5">
                {item.label}
                {/* 首页显示小星星 */}
                {item.href === '/' && active && (
                  <Sparkles size={12} className="text-amber-500 animate-pulse" />
                )}
              </span>

              {/* 底部指示器 - 激活时 */}
              <span
                className={`
                  absolute -bottom-0.5 left-1/2 -translate-x-1/2
                  h-0.5 rounded-full
                  transition-all duration-300
                  bg-gradient-to-r from-indigo-500 to-purple-500
                  ${active ? 'w-4 opacity-100' : 'w-0 opacity-0'}
                `}
              />
            </a>
          )
        })}

        {/* 分隔线 */}
        <div className="w-px h-5 bg-gradient-to-b from-transparent via-gray-300 to-transparent dark:via-gray-600 mx-3" />

        {/* 语言和主题切换 */}
        <LocaleSwitch currentLocale={locale} />
        <ThemeSwitch />
      </div>

      {/* Mobile navigation menu */}
      <div
        className={`
          absolute top-full left-0 right-0
          md:hidden
          transition-all duration-300 ease-out
          origin-top
          ${isOpen
            ? 'opacity-100 scale-y-100'
            : 'opacity-0 scale-y-95 pointer-events-none'
          }
        `}
      >
        <div className="mx-4 mt-2 overflow-hidden rounded-2xl">
          {/* 背景层 */}
          <div className="absolute inset-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl" />
          <div className="absolute inset-0 border border-gray-200/50 dark:border-gray-700/50 rounded-2xl" />

          {/* 顶部渐变 */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-indigo-500/5 to-transparent dark:from-indigo-500/10 rounded-t-2xl" />

          {/* 内容 */}
          <div className="relative p-3">
            <div className="flex flex-col gap-1">
              {navItems.map((item, index) => {
                const active = isActive(item.href)

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`
                      relative px-4 py-3
                      rounded-xl
                      text-sm font-medium
                      no-underline
                      transition-all duration-200
                      flex items-center gap-3
                      ${active
                        ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 text-indigo-600 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                      }
                    `}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* 左侧指示条 */}
                    <span
                      className={`
                        w-1 h-4 rounded-full
                        transition-all duration-200
                        ${active
                          ? 'bg-gradient-to-b from-indigo-500 to-purple-500'
                          : 'bg-transparent'
                        }
                      `}
                    />

                    {item.label}

                    {/* 激活标识 */}
                    {active && (
                      <Sparkles size={14} className="ml-auto text-amber-500" />
                    )}
                  </a>
                )
              })}
            </div>

            {/* 分隔线 */}
            <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />

            {/* 语言和主题切换 */}
            <div className="flex items-center justify-between px-4 py-2">
              <LocaleSwitch currentLocale={locale} />
              <ThemeSwitch />
            </div>
          </div>
        </div>
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  )
}
