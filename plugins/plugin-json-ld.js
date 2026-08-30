const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 双站配置：SITE=zh → 中文站 ccleeai.com；SITE=ai（或未设置）→ 英文站 aidevhub.ai
const site = process.env.SITE === 'zh' ? 'zh' : 'ai';
const siteUrl = site === 'zh' ? 'https://ccleeai.com' : 'https://aidevhub.ai';
// 页面 URL 前缀：默认语言构建在根路径，非默认语言带语言前缀（zh 站：zh 在根、en 加 /en；ai 站：en 在根、zh 加 /zh）
const zhUrlPrefix = site === 'zh' ? '' : '/zh';
const enUrlPrefix = site === 'zh' ? '/en' : '';

// ============ 全局 Schema ============

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "CCLHUB",
  "url": siteUrl,
  "logo": `${siteUrl}/logo.png`,
  "description": "AI-powered e-commerce operations platform — AI automation + e-commerce tools, making operations more efficient",
  "founder": {
    "@type": "Person",
    "name": "CCLEE"
  }
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "CCLHUB",
  "url": siteUrl,
  "description": "AI-powered e-commerce operations platform",
  "publisher": {
    "@type": "Organization",
    "name": "CCLHUB",
    "logo": {
      "@type": "ImageObject",
      "url": `${siteUrl}/logo.png`
    }
  }
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "CCLEE",
  "url": siteUrl,
  "jobTitle": "AI Tool Developer & E-commerce Consultant",
  "description": "Independent developer with 24 years of e-commerce experience, specializing in building AI-powered tools and systems grounded in real business needs — not technology for its own sake.",
  "knowsAbout": [
    "FastAPI",
    "RAG Systems",
    "AI Agent Development",
    "1688 B2B Sourcing",
    "React",
    "China Market Entry"
  ],
  "sameAs": [
    "https://www.upwork.com/freelancers/~010ab5ec29d8f4ff3f",
    "https://github.com/cclee-hub",
    // 双向互指：指向另一站点域名
    site === 'zh' ? 'https://aidevhub.ai' : 'https://ccleeai.com'
  ]
};

// ============ 页面级 Schema 生成器 ============

function buildArticleSchema({ title, description, url, date, image }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description || "",
    "url": url,
    "image": image || `${siteUrl}/logo.png`,
    "datePublished": date || new Date().toISOString().split('T')[0],
    "dateModified": new Date().toISOString().split('T')[0],
    "author": {
      "@type": "Person",
      "name": "CCLEE"
    },
    "publisher": {
      "@type": "Organization",
      "name": "CCLHUB",
      "logo": {
        "@type": "ImageObject",
        "url": `${siteUrl}/logo.png`
      }
    }
  };
}

function buildHowToSchema({ title, description, url, steps }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": title,
    "description": description || "",
    "url": url,
    "step": (steps || []).map((step, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": step.name || `步骤 ${i + 1}`,
      "text": step.text || step
    }))
  };
}

function buildFAQSchema({ title, description, url, faqs }) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "name": title,
    "description": description || "",
    "url": url,
    "mainEntity": (faqs || []).map(faq => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a
      }
    }))
  };
}

// i18n 目录映射：源目录 -> 英文翻译目录
const i18nEnDirs = {
  docs: 'i18n/en/docusaurus-plugin-content-docs/current',
  blog: 'i18n/en/docusaurus-plugin-content-blog-blog',
  'cases-blog': 'i18n/en/docusaurus-plugin-content-blog-cases-blog',
};

// 从 frontmatter 生成 schema 对象
function buildSchema(frontmatter, url) {
  const base = {
    title: frontmatter.title || '',
    description: frontmatter.description || "",
    url,
    date: frontmatter.date,
    image: frontmatter.image,
  };

  switch (frontmatter.schema) {
    case 'Article':
      return buildArticleSchema(base);
    case 'HowTo':
      return buildHowToSchema({ ...base, steps: frontmatter.steps || [] });
    case 'FAQPage':
      return buildFAQSchema({ ...base, faqs: frontmatter.faqs || [] });
    default:
      return null;
  }
}

// ============ Docusaurus 插件 ============

module.exports = function pluginJsonLd() {
  // key: urlPath (e.g. '/docs/cclee-b2b-pricing'), value: schema object
  const pageSchemaMap = {};
  // 英文版 schema：key 加 '/en' 前缀路径，postBuild 时注入到对应 outDir 路径
  const enSchemaMap = {};

  // 读取文件并尝试从 i18n 目录读取英文 frontmatter
  function scanDirectory(dir, urlPrefix, dirKey) {
    if (!fs.existsSync(dir)) return;

    const enDir = dirKey && i18nEnDirs[dirKey]
      ? path.resolve(__dirname, '..', i18nEnDirs[dirKey])
      : null;

    // 递归收集（子目录产品如 docs/agntc/、docs/life/ 也注入页面级 schema）
    const files = [];
    (function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) files.push(p);
      }
    })(dir);

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data: fm } = matter(content);

      if (!fm.schema) continue;

      // 相对路径即 URL 子路径（子目录文件 slug 带目录前缀，blog 日期前缀仅剥 basename）
      const rel = path.relative(dir, filePath).replace(/\\/g, '/');
      let slug;
      if (fm.slug) {
        slug = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) + fm.slug : fm.slug;
      } else {
        slug = rel.replace(/\/\d{4}-\d{2}-\d{2}-/, '/').replace(/\.mdx?$/, '');
      }
      // index.md 的页面 URL 不含 index 段（/docs/agntc/ 而非 /docs/agntc/index）
      slug = slug.replace(/(^|\/)index$/, '');
      const urlPath = `${urlPrefix}${slug}`;

      // 中文 schema（源文件 frontmatter，注入中文页面）
      pageSchemaMap[urlPath] = buildSchema(fm, `${siteUrl}${zhUrlPrefix}${urlPath}`);

      // 英文 schema（优先 i18n/en/ frontmatter）
      if (enDir) {
        const enFilePath = path.join(enDir, rel);
        if (fs.existsSync(enFilePath)) {
          const enContent = fs.readFileSync(enFilePath, 'utf-8');
          const { data: enFm } = matter(enContent);
          if (enFm.schema) {
            enSchemaMap[urlPath] = buildSchema(enFm, `${siteUrl}${enUrlPrefix}${urlPath}`);
            continue;
          }
        }
      }
      // fallback：英文页面也用源文件 schema
      enSchemaMap[urlPath] = buildSchema(fm, `${siteUrl}${enUrlPrefix}${urlPath}`);
    }
  }

  return {
    name: 'plugin-json-ld',

    // 构建时扫描 docs + blog + cases-blog 目录
    async loadContent() {
      scanDirectory(path.resolve(__dirname, '..', 'docs'), '/docs/', 'docs');
      scanDirectory(path.resolve(__dirname, '..', 'blog'), '/blog/', 'blog');
      scanDirectory(path.resolve(__dirname, '..', 'cases-blog'), '/cases/', 'cases-blog');
    },

    // 全局注入 Organization + WebSite + Person
    injectHtmlTags() {
      return {
        headTags: [
          {
            tagName: 'script',
            attributes: { type: 'application/ld+json' },
            innerHTML: JSON.stringify(organizationSchema),
          },
          {
            tagName: 'script',
            attributes: { type: 'application/ld+json' },
            innerHTML: JSON.stringify(websiteSchema),
          },
          {
            tagName: 'script',
            attributes: { type: 'application/ld+json' },
            innerHTML: JSON.stringify(personSchema),
          },
        ],
      };
    },

    // 页面级 Schema 注入（Docusaurus 对每个 locale 调用一次 postBuild；
    // 非默认语言构建的 outDir 带语言后缀，默认语言构建在根 outDir）
    async postBuild({ outDir }) {
      const cheerio = require('cheerio');
      const out = outDir.replace(/\/+$/, '');
      const buildLocale = out.endsWith('/zh')
        ? 'zh'
        : out.endsWith('/en')
          ? 'en'
          : site === 'zh' ? 'zh' : 'en';
      const schemaMap = buildLocale === 'zh' ? pageSchemaMap : enSchemaMap;

      function injectSchema(htmlPath, schema) {
        if (!fs.existsSync(htmlPath)) return;
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const $ = cheerio.load(html);
        $('head').append(
          `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
        );
        fs.writeFileSync(htmlPath, $.html());
      }

      for (const [urlPath, schema] of Object.entries(schemaMap)) {
        injectSchema(path.join(outDir, urlPath, 'index.html'), schema);
      }
    },
  };
};
