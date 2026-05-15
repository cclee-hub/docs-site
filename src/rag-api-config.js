// API 配置文件
// 优先使用环境变量，回退到生产环境地址
export const RAG_API_URL = typeof process !== 'undefined' && process.env?.RAG_API_URL
  ? process.env.RAG_API_URL
  : 'https://rag.ccleeai.com/query'
