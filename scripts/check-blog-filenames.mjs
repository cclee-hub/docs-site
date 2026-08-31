// 博客文件名守卫：文件名带日期前缀会被 Docusaurus 编进 URL（/blog/YYYY/MM/DD/slug/），
// 项目约定 URL 平铺 /blog/<slug>/，日期只允许写在 frontmatter date。
// 通过 npm pre-hook（prebuild / prebuild:zh / prebuild:ai）在所有构建路径（本地 + Vercel）强制执行。
//
// LEGACY_DATED_SLUGS：存量豁免清单（2026-08-31 前发布、URL 已被搜索引擎索引的日期式旧文，保持不动）。
// 新文章一律不得使用日期前缀文件名；豁免清单只减不增。
import { readdirSync } from 'node:fs';

const DATED = /^\d{4}-\d{2}-\d{2}-(.+\.md)$/;
const LEGACY_DATED_SLUGS = new Set([
  'airflow-postgreshook-multistatement-sql-truncated.md',
  'asynclocalstorage-context-lost-eventemitter-callback.md',
  'asynclocalstorage-enterwith-concurrency-crosstalk.md',
  'chrome-alarms-minimum-period-mv3.md',
  'chrome-extension-dry-run-mode.md',
  'chrome-extension-postmessage-targetorigin-star.md',
  'chrome-extension-token-sync-service-worker.md',
  'dotenv-hash-truncation.md',
  'drizzle-raw-sql-expression-as-parameter.md',
  'fse-block-theme-two-pitfalls.md',
  'fse-group-block-layout-override-css.md',
  'hostinger-cdn-blocks-wp-rest-api-media-upload.md',
  'javascript-bare-throw-rethrow-syntax-error.md',
  'milvus-invalid-collection-name-uuid.md',
  'nanoid-v5-err-require-esm-commonjs.md',
  'nodejs-env-loaded-undefined-dotenv-import-order.md',
  'postgresql-on-conflict-unique-constraint.md',
  'site123-embed-timeline-pitfalls.md',
  'tavily-mcp-replace-zhipu-search.md',
  'woocommerce-fse-block-theme-4-css-traps.md',
  'wsl-docker-postgresql-port-conflict.md',
]);

const targets = [
  'blog',
  'i18n/en/docusaurus-plugin-content-blog-blog',
];

const bad = [];
for (const dir of targets) {
  const base = new URL(`../${dir}/`, import.meta.url);
  let files;
  try {
    files = readdirSync(base);
  } catch {
    continue; // 目录不存在（如 i18n 未初始化）则跳过
  }
  for (const f of files) {
    const m = f.match(DATED);
    if (m && !LEGACY_DATED_SLUGS.has(m[1])) bad.push(`${dir}/${f}`);
  }
}

if (bad.length > 0) {
  console.error(
    '[blog-filename-guard] 以下文件名带日期前缀，将生成日期式 URL（/blog/YYYY/MM/DD/…），违反平铺约定：\n' +
      bad.map((f) => `  - ${f}`).join('\n') +
      '\n请去掉文件名日期前缀（git mv），日期写入 frontmatter 的 date: 字段；i18n/en 镜像文件需与中文源文件同名。'
  );
  process.exit(1);
}
console.log('[blog-filename-guard] OK：无新增日期前缀文件名');
