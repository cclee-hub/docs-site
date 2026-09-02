import React, { useState, useMemo } from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import Translate from '@docusaurus/Translate';
import { translate } from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import toolsData from '@site/src/data/tools.json';

type Tool = typeof toolsData.tools[0];
type Scene = typeof toolsData.scenes[0];

export default function ToolPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScene, setSelectedScene] = useState('all');

  // 获取当前语言：单语单域下即站点默认语言（aidevhub.ai=en，ccleeai.com=zh）
  const { i18n } = useDocusaurusContext();
  const isZh = i18n.defaultLocale === 'zh';

  // 筛选逻辑
  const filteredTools = useMemo(() => {
    return toolsData.tools.filter((tool) => {
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = isZh ? tool.name.toLowerCase() : (tool.nameEn || tool.name).toLowerCase();
        const desc = isZh ? tool.description : tool.descriptionEn;
        if (!name.includes(query) && !desc.toLowerCase().includes(query)) {
          return false;
        }
      }

      // 场景过滤（支持多场景）
      if (selectedScene !== 'all' && !tool.scenes.includes(selectedScene)) {
        return false;
      }

      return true;
    });
  }, [searchQuery, selectedScene, isZh]);

  // 获取场景名称
  const getSceneName = (scene: Scene) => {
    return isZh ? scene.name : scene.nameEn;
  };

  const title = translate({ id: 'tool.page.title', message: 'AI 工具场景推荐' });
  const description = translate({ id: 'tool.page.description', message: '按使用场景精选 AI 工具' });

  // ItemList JSON-LD：全量工具清单（不随搜索/筛选变化），条目 URL 用外链 affiliateUrl
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: toolsData.tools
      .filter((tool) => tool.affiliateUrl)
      .map((tool, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'SoftwareApplication',
          applicationCategory: 'WebApplication',
          operatingSystem: 'Web',
          name: isZh ? tool.name : tool.nameEn || tool.name,
          description: isZh ? tool.description : tool.descriptionEn || tool.description,
          url: tool.affiliateUrl,
        },
      })),
  };

  return (
    <Layout title={title} description={description}>
      <Head>
        <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
      </Head>
      <main className="max-w-[1400px] mx-auto px-4 py-12">
        {/* 页面标题 */}
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
          <Translate id="tool.page.title">AI 工具场景推荐</Translate>
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          <Translate id="tool.page.subtitle">按使用场景精选，同一工具可在多个场景出现</Translate>
        </p>

        {/* 搜索框 */}
        <div className="mb-6">
          <input
            type="text"
            placeholder={translate({ id: 'tool.search.placeholder', message: '搜索 AI 工具...' })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 px-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 outline-none transition-colors"
          />
        </div>

        {/* 场景 Tab */}
        <div className="flex flex-wrap gap-2 mb-6">
          {toolsData.scenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => setSelectedScene(scene.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedScene === scene.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {getSceneName(scene)}
            </button>
          ))}
        </div>

        {/* 工具数量 */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {filteredTools.length} <Translate id="tool.count.tools">个工具</Translate>
        </p>

        {/* 工具列表 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} isZh={isZh} />
          ))}
        </div>

        {/* 无结果提示 */}
        {filteredTools.length === 0 && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Translate id="tool.noresults">没有找到匹配的工具</Translate>
          </div>
        )}
      </main>
    </Layout>
  );
}

// 场景对应的渐变色
const sceneGradients: Record<string, string> = {
  writing: 'from-purple-500 to-pink-500',
  'image-design': 'from-pink-500 to-rose-500',
  'video-audio': 'from-red-500 to-orange-500',
  coding: 'from-blue-500 to-cyan-500',
  automation: 'from-green-500 to-emerald-500',
  ecommerce: 'from-orange-500 to-amber-500',
  hosting: 'from-green-500 to-emerald-500',
};

// 地区标签
const regionLabels: Record<string, { zh: string; en: string }> = {
  china: { zh: '🇨🇳 国产', en: '🇨🇳 CN' },
  overseas: { zh: '🌍 海外', en: '🌍 Global' },
};

// 场景标签颜色映射（从 JSON 读取图标和名称，这里只保留颜色）
const sceneTagColors: Record<string, string> = {
  coding: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  writing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'image-design': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'video-audio': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  automation: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ecommerce: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  hosting: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

// 获取工具首字母
function getInitial(name: string): string {
  // 优先取英文字母，否则取第一个字符
  const match = name.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : name.charAt(0);
}

// 工具卡片组件
function ToolCard({
  tool,
  isZh,
}: {
  tool: Tool;
  isZh: boolean;
}) {
  const name = isZh ? tool.name : (tool.nameEn || tool.name);
  const description = isZh ? tool.description : tool.descriptionEn;
  // 取第一个场景的渐变色
  const gradient = sceneGradients[tool.scenes[0]] || 'from-gray-500 to-gray-600';
  const initial = getInitial(name);
  const regionLabel = tool.region ? (isZh ? regionLabels[tool.region]?.zh : regionLabels[tool.region]?.en) : null;

  return (
    <div className="group relative bg-gray-50 dark:bg-[#181824] border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1 hover:border-purple-400 dark:hover:border-purple-500 transition-all duration-300">
      {/* 卡片主体 - 点击跳推广链接 */}
      <a
        href={tool.affiliateUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="block"
      >
        {/* Logo + 名称 */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
            <span className="text-xl font-bold text-white">
              {initial}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
              {name}
            </h3>
            {regionLabel && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {regionLabel}
              </span>
            )}
          </div>
        </div>

        {/* 描述 */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {description}
        </p>

        {/* 标签：场景标签 + 特性标签（统一彩色风格） */}
        <div className="flex flex-wrap gap-1.5">
          {/* 场景标签 */}
          {tool.scenes.map((sceneId) => {
            const sceneData = toolsData.scenes.find(s => s.id === sceneId);
            const color = sceneTagColors[sceneId];
            if (!sceneData || !color) return null;
            return (
              <span
                key={sceneId}
                className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}
              >
                {sceneData.icon} {isZh ? sceneData.name : sceneData.nameEn}
              </span>
            );
          })}
        </div>
      </a>

      {/* 查看评测按钮 - 独立点击区域 */}
      {tool.reviewUrl && (
        <a
          href={tool.reviewUrl}
          rel="nofollow"
          className="mt-4 block text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
        >
          <Translate id="tool.card.readReview">查看评测</Translate> →
        </a>
      )}
    </div>
  );
}
