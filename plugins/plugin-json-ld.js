const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const siteUrl = 'https://aidevhub.ai';

// ============ 全局 Schema ============

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "CCLHUB",
  "url": "https://aidevhub.ai",
  "logo": "https://aidevhub.ai/logo.png",
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
  "url": "https://aidevhub.ai",
  "description": "AI-powered e-commerce operations platform",
  "publisher": {
    "@type": "Organization",
    "name": "CCLHUB",
    "logo": {
      "@type": "ImageObject",
      "url": "https://aidevhub.ai/logo.png"
    }
  }
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "CCLEE",
  "url": "https://aidevhub.ai",
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
    "https://www.aigent.ren"
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

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data: fm } = matter(content);

      if (!fm.schema) continue;

      let slug = fm.slug || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.mdx?$/, '');
      const urlPath = `${urlPrefix}${slug}`;

      // 中文 schema（源文件，用于 /zh/ 页面）
      pageSchemaMap[urlPath] = buildSchema(fm, `${siteUrl}/zh${urlPath}`);

      // 英文 schema（优先 i18n/en/ frontmatter）
      if (enDir) {
        const enFilePath = path.join(enDir, file);
        if (fs.existsSync(enFilePath)) {
          const enContent = fs.readFileSync(enFilePath, 'utf-8');
          const { data: enFm } = matter(enContent);
          if (enFm.schema) {
            enSchemaMap[urlPath] = buildSchema(enFm, `${siteUrl}${urlPath}`);
            continue;
          }
        }
      }
      // fallback：英文页面也用源文件 schema
      enSchemaMap[urlPath] = buildSchema(fm, `${siteUrl}${urlPath}`);
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

    // 页面级 Schema 注入（Docusaurus 对每个 locale 调用一次 postBuild）
    async postBuild({ outDir }) {
      const cheerio = require('cheerio');
      const isZhBuild = outDir.replace(/\/+$/, '').endsWith('/zh');

      function injectSchema(htmlPath, schema) {
        if (!fs.existsSync(htmlPath)) return;
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const $ = cheerio.load(html);
        $('head').append(
          `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
        );
        fs.writeFileSync(htmlPath, $.html());
      }

      if (isZhBuild) {
        // 中文构建：schema url 指向 /zh/ 路径
        for (const [urlPath, schema] of Object.entries(pageSchemaMap)) {
          injectSchema(path.join(outDir, urlPath, 'index.html'), schema);
        }
      } else {
        // 英文构建：schema url 指向默认路径
        for (const [urlPath, schema] of Object.entries(enSchemaMap)) {
          injectSchema(path.join(outDir, urlPath, 'index.html'), schema);
        }
      }
    },
  };
};
