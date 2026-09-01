// 博客 en 镜像守卫：Docusaurus 博客在 i18n/en 缺镜像时会回退中文源文件，
// 导致中文文漏进 en 站（默认语言）列表。本守卫强制每篇非 draft 博文必须有 en 镜像。
// 通过 npm pre-hook（prebuild / prebuild:zh / prebuild:ai）在所有构建路径（本地 + Vercel）强制执行。
//
// 豁免：frontmatter 含 draft: true 的文章（production 构建本就不产出，双语一致地隐藏）。
// 处置方式二选一：① 补 i18n/en/docusaurus-plugin-content-blog-blog/<同名>.md；
// ② 确实只需中文的临时文，给中英文源都加 draft: true。
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const ZH_DIR = new URL('../blog/', import.meta.url);
const EN_DIR = new URL('../i18n/en/docusaurus-plugin-content-blog-blog/', import.meta.url);

let files;
try {
  files = readdirSync(ZH_DIR).filter((f) => f.endsWith('.md'));
} catch {
  console.log('[blog-en-mirror-guard] OK：blog/ 目录不存在，跳过');
  process.exit(0);
}

const missing = [];
for (const f of files) {
  let source;
  try {
    source = readFileSync(new URL(f, ZH_DIR), 'utf8');
  } catch {
    continue;
  }
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm && /^draft:\s*true\b/m.test(fm[1])) continue; // draft 豁免
  if (!existsSync(new URL(f, EN_DIR))) missing.push(f);
}

if (missing.length > 0) {
  console.error(
    '[blog-en-mirror-guard] 以下博文缺少 en 镜像（i18n/en/docusaurus-plugin-content-blog-blog/），' +
      '构建后中文将回退漏进 en 站博客列表：\n' +
      missing.map((f) => `  - blog/${f}`).join('\n') +
      '\n请补英文镜像（同名文件），或给中英文源都加 draft: true 豁免。'
  );
  process.exit(1);
}
console.log(`[blog-en-mirror-guard] OK：${files.length} 篇博文 en 镜像齐全`);
