// services/embeddingService.js
// 调用 OpenAI 兼容的 Embedding API，将文本转为向量。
// 支持配置 baseURL、apiKey、model。
const axios = require('axios');
const { getGlobalConfig } = require('../users/store');

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * 获取 Embedding API 配置
 */
function getEmbeddingConfig() {
  const cfg = getGlobalConfig();
  // 优先用全局配置的 apiKey 和 apiUrl，可单独设置 embedding 模型
  return {
    apiKey: cfg.apiKey,
    baseURL: (cfg.apiUrl || '').replace(/\/chat\/completions$/, ''), // 去掉聊天路径
    model: cfg.embeddingModel || DEFAULT_EMBEDDING_MODEL,
  };
}

/**
 * 生成文本的嵌入向量
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const { apiKey, baseURL, model } = getEmbeddingConfig();
  if (!apiKey) throw new Error('缺少 API Key，无法生成嵌入向量');

  const url = `${baseURL}/embeddings`;
  const response = await axios.post(
    url,
    { input: text, model },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  return response.data.data[0].embedding;
}

module.exports = { getEmbedding };