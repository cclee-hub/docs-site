import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// 双站配置：SITE=zh → 中文站 ccleeai.com；SITE=ai（或未设置）→ 英文站 aidevhub.ai
const site = process.env.SITE === 'zh' ? 'zh' : 'ai';
const siteUrl = site === 'zh' ? 'https://ccleeai.com' : 'https://aidevhub.ai';
const defaultLocale = site === 'zh' ? 'zh' : 'en';

const config: Config = {
  title: 'CCLEE',
  tagline: 'AI驱动的电商运营工具平台',
  favicon: 'img/favicon.ico',

  url: siteUrl,
  baseUrl: '/',
  trailingSlash: true,

  // 网站分析：Umami + 百度统计
  scripts: [
    {
      src: 'https://tj.ccleeai.com/script.js',
      async: true,
      'data-website-id': '806b27c0-695b-4e07-8b75-89a6b4aefc95',
    },
    {
      src: '/js/baidu-tongji.js',
      async: true,
    },
  ],

  // 静态资源目录，drafts/ 不在此列表中，不参与构建和发布
  staticDirectories: ['static'],

  organizationName: 'CCLHUB',
  projectName: 'docs-site',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',

  future: {
    v4: true,
    experimental_faster: true,
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale,
    // 单语单域：aidevhub.ai 仅英文、ccleeai.com 仅中文，避免跨域重复内容；
    // 历史异语 URL 由 301 兜底（ai 站见 vercel.json，zh 站见 cclhub nginx）
    locales: site === 'zh' ? ['zh'] : ['en'],
    localeConfigs: {
      zh: {
        label: '简体中文',
        htmlLang: 'zh-CN',
      },
      en: {
        label: 'English',
        htmlLang: 'en-US',
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

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
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
        content: "default-src 'self' 'unsafe-inline'; connect-src 'self' https://rag.ccleeai.com https://tj.ccleeai.com https://hm.baidu.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://tj.ccleeai.com https://hm.baidu.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.ccleeai.com https://oss-cn-shenzhen.aliyuncs.com https://hm.baidu.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; block-all-mixed-content",
      },
    ],
  } satisfies Preset.ThemeConfig,
};

export default config;
