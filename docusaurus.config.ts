import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// 双站配置：SITE=zh → 中文站 ccleeai.com；SITE=ai（或未设置）→ 英文站 aidevhub.ai
const site = process.env.SITE === 'zh' ? 'zh' : 'ai';
const siteUrl = site === 'zh' ? 'https://ccleeai.com' : 'https://aidevhub.ai';
// 百度统计域名仅中文站进入 CSP
const baiduCsp = site === 'zh' ? ' https://hm.baidu.com' : '';
// GA4 仅英文站（SITE=ai）启用
const gaId = site === 'zh' ? null : 'G-Z4Q2RBZNL0';
const gaScriptCsp = gaId ? ' https://www.googletagmanager.com' : '';
const gaConnectCsp = gaId
  ? ' https://*.google-analytics.com https://*.analytics.google.com'
  : '';
const gaImgCsp = gaConnectCsp;

const config: Config = {
  title: 'CCLEE',
  tagline: 'AI驱动的电商运营工具平台',
  favicon: 'img/favicon.ico',

  url: siteUrl,
  baseUrl: '/',
  trailingSlash: true,

  // 网站分析：Umami（中英各自独立 id）+ GA4（仅英文站）+ 百度统计（仅中文站）
  scripts: [
    {
      src: 'https://tj.ccleeai.com/script.js',
      async: true,
      'data-website-id':
        site === 'zh'
          ? '049ab0ce-cd45-4404-8c09-45bd1bd93c94'
          : '806b27c0-695b-4e07-8b75-89a6b4aefc95',
    },
    // 谷歌分析 GA4 仅英文站（SITE=ai）加载（Docusaurus scripts 不支持纯 content 项，走静态文件）
    ...(gaId ? [{src: '/js/ga4.js', async: true}] : []),
    // 百度统计仅中文站（SITE=zh）加载
    ...(site === 'zh' ? [{src: '/js/baidu-tongji.js?v=2', async: true}] : []),
  ],

  // 静态资源目录，drafts/ 不在此列表中，不参与构建和发布
  staticDirectories: ['static'],

  organizationName: 'CCLHUB',
  projectName: 'docs-site',

  // 构建期常量（config 加载时求值一次）：SSR HTML 与客户端 bundle 烘入同一值，
  // 避免组件内 new Date() 在 hydration 期与构建期漂移（跨年即触发 #425 文本不匹配）
  customFields: {
    buildYear: new Date().getFullYear(),
    lastUpdatedZh: `${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日`,
  },

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',

  future: {
    v4: true,
    // 显式列全 8 键（对象形态下未列键回落 false，勿简写）：仅关 swcHtmlMinimizer。
    // 根因：SWC HTML minifier 会压缩 FloatingChat 在 React root 内渲染的 <style> 文本子节点
    // （opacity: 0.8 → opacity:.8、去空白），React 18.3 hydration 文本比对失败 → #425/#418/#423。
    // 关闭后回落 terser minifier（官方 hydration-safe 选项：保留引号/空白/style 原文，不设 minifyCSS）。
    experimental_faster: {
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: false,
      lightningCssMinimizer: true,
      mdxCrossCompilerCache: true,
      rspackBundler: true,
      rspackPersistentCache: true,
      ssgWorkerThreads: true,
    },
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    // 双 locale 声明 + 每 locale 跨域 url：AlternateLangHeaders 据此原生输出
    // zh-CN/en-US/x-default 互指（x-default 统一指 en 站），替代构建后注入脚本；
    // defaultLocale 固定 en，构建必须显式 --locale（两 locale baseUrl 均 '/'，裸构建会互相覆盖产物）
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    localeConfigs: {
      zh: {
        label: '简体中文',
        htmlLang: 'zh-CN',
        url: 'https://ccleeai.com',
        baseUrl: '/',
      },
      en: {
        label: 'English',
        htmlLang: 'en-US',
        url: 'https://aidevhub.ai',
        baseUrl: '/',
      },
    },
  },

  plugins: [
    './plugins/plugin-json-ld',
    // 技术博客
    [
      '@docusaurus/plugin-content-blog',
      {
        id: 'blog',
        path: 'blog',
        routeBasePath: 'blog',
        blogSidebarCount: 'ALL',
      },
    ],
    // 案例博客
    [
      '@docusaurus/plugin-content-blog',
      {
        id: 'cases-blog',
        path: 'cases-blog',
        routeBasePath: 'cases',
        blogTitle: '项目案例',
        blogDescription: '真实交付案例，覆盖AI工具开发、本地化策略、电商运营',
        blogSidebarTitle: '最近案例',
        blogSidebarCount: 'ALL',
        postsPerPage: 10,
        blogListComponent: '@theme/BlogListPageForCases',
        blogPostComponent: '@theme/BlogPostPage',
        tagsBasePath: 'cases-tags',
        archiveBasePath: null, // 禁用归档
        authorsMapPath: '../blog/authors.yml',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          priority: null,
          changefreq: null,
          filename: 'sitemap.xml',
          createSitemapItems: async (params) => {
            const { defaultCreateSitemapItems, ...rest } = params;
            const items = await defaultCreateSitemapItems(rest);
            return items.filter((item) => {
              const url = item.url;
              return (
                !/\/blog\/page\/\d+/.test(url) &&
                !url.includes('/blog/tags/') &&
                !url.includes('/cases/cases-tags/')
              );
            });
          },
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['./themes/image-zoom', '@docusaurus/theme-mermaid'],

  themeConfig: {
    image: 'img/docusaurus-social-card.webp',
    navbar: {
      title: '',
      logo: {
        alt: 'CCLEE Logo',
        src: 'logo.png',
      },
      items: [
        { to: '/', label: '首页', position: 'left' },
        { to: '/services', label: '服务', position: 'left' },
        { to: '/products', label: '产品', position: 'left' },
        { to: '/tool', label: 'AI 工具', position: 'left' },
        { to: '/cases', label: '案例', position: 'left' },
        { to: '/about', label: '关于', position: 'left' },
        { to: '/blog', label: '博客', position: 'left' },
        {
          to: '/about',
          label: '合作咨询',
          position: 'right',
          className: 'navbar-cta',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '网址',
          items: [
            { label: '首页', to: '/' },
            { label: '服务', to: '/services' },
            { label: '产品', to: '/products' },
            { label: 'AI 工具', to: '/tool' },
            { label: '案例', to: '/cases' },
            { label: '关于', to: '/about' },
          ],
        },
      ],
    },
    // 允许前端连接到 RAG API
    metadata: [
      { charSet: 'utf-8' },
      {
        'http-equiv': 'Content-Security-Policy',
        content: `default-src 'self' 'unsafe-inline'; connect-src 'self' https://rag.ccleeai.com https://tj.ccleeai.com${baiduCsp}${gaConnectCsp}; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://tj.ccleeai.com${baiduCsp}${gaScriptCsp}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.ccleeai.com https://oss-cn-shenzhen.aliyuncs.com${baiduCsp}${gaImgCsp}; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; block-all-mixed-content`,
      },
    ],
  } satisfies Preset.ThemeConfig,
};

export default config;
