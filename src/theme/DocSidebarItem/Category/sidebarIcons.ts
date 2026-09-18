import type {LucideIcon} from 'lucide-react';
import {
  BarChart3,
  Bot,
  Building2,
  CloudUpload,
  Globe,
  Headset,
  ListChecks,
  Package,
  Palette,
  Puzzle,
  ShieldCheck,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react';

/**
 * 一级分类图标映射（label → lucide 图标）。
 * 中文站 label 取 sidebars.ts 原文；英文站 label 是 i18n 翻译后的文本
 * （见 i18n/en/docusaurus-plugin-content-docs/current.json），
 * 两套 key 指向同一图标。新增分类时需同步两侧 key。
 */
const ICON_BY_LABEL: Record<string, LucideIcon> = {};

const register = (icon: LucideIcon, ...labels: string[]): void => {
  labels.forEach((label) => {
    ICON_BY_LABEL[label] = icon;
  });
};

register(BarChart3, 'AI运营', 'AI Analytics');
register(Puzzle, '浏览器插件', 'Browser Plugin');
register(Headset, 'AI客服', 'AI Customer Service');
register(Bot, 'AI Agent');
register(Palette, 'cclee-docusaurus-theme', 'CCLEE Docusaurus Theme');
register(Globe, 'WordPress 生态', 'WordPress Ecosystem');
register(Wrench, 'CCLEE Toolkit');
register(Building2, 'CCLEE B2B');
register(CloudUpload, 'CCLEE OSS');
register(Package, '跨境铺货助手', 'Cross-border Listing Assistant');
register(Truck, 'WooCommerce 物流', 'WooCommerce Shipping');
register(ListChecks, '任务栈', 'Task Stack');
register(Wallet, 'Life 记账助手', 'Life');
register(ShieldCheck, 'CCLee 服务器哨兵', 'CCLee Server Sentinel');

/** 仅一级分类返回图标；子级分类与文档条目不配图标 */
export function getCategoryIcon(
  label: string,
  level: number,
): LucideIcon | undefined {
  return level === 1 ? ICON_BY_LABEL[label] : undefined;
}
