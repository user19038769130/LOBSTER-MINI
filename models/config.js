// models/config.js
// 多厂商模型配置管理。从全局配置表读取当前使用模型，
// 同时提供常用厂商的预设，方便前端展示和切换。

const { getGlobalConfig, setGlobalConfig } = require('../users/store');

// 预置厂商模型列表（可自由扩展）
const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16384 },
    ],
    defaultApiUrl: 'https://api.openai.com/v1/chat/completions',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3', contextWindow: 128000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', contextWindow: 128000 },
    ],
    defaultApiUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  {
    id: 'zhipu',
    name: '智谱AI (GLM)',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4-Plus', contextWindow: 128000 },
      { id: 'glm-4-flash', name: 'GLM-4-Flash', contextWindow: 128000 },
    ],
    defaultApiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  },
  {
    id: 'qwen',
    name: '通义千问',
    models: [
      { id: 'qwen-turbo', name: 'Qwen-Turbo', contextWindow: 8192 },
      { id: 'qwen-plus', name: 'Qwen-Plus', contextWindow: 131072 },
      { id: 'qwen-max', name: 'Qwen-Max', contextWindow: 32768 },
    ],
    defaultApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', contextWindow: 8192 },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', contextWindow: 32768 },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', contextWindow: 128000 },
    ],
    defaultApiUrl: 'https://api.moonshot.cn/v1/chat/completions',
  },
];

// 获取所有可用厂商/模型
function getAvailableProviders() {
  return PROVIDERS;
}

// 获取当前全局模型配置
function getCurrentModelConfig() {
  const cfg = getGlobalConfig();
  return {
    modelName: cfg.modelName || 'gpt-3.5-turbo',
    apiUrl: cfg.apiUrl || 'https://api.openai.com/v1/chat/completions',
    apiKey: cfg.apiKey || '',
    maxQuota: parseInt(cfg.maxQuota) || 1000,
    // 工具调用开关，由用户在前端控制，默认关闭以兼容所有低模型
    functionCallingSupport: cfg.functionCalling === 'true' || cfg.functionCalling === true,
  };
}

// 更新全局模型配置
function updateCurrentModelConfig({ modelName, apiUrl, apiKey, maxQuota, functionCalling }) {
  if (modelName !== undefined) setGlobalConfig('modelName', modelName);
  if (apiUrl !== undefined) setGlobalConfig('apiUrl', apiUrl);
  if (apiKey !== undefined) setGlobalConfig('apiKey', apiKey);
  if (maxQuota !== undefined) setGlobalConfig('maxQuota', String(maxQuota));
  if (functionCalling !== undefined) setGlobalConfig('functionCalling', functionCalling ? 'true' : 'false');
}

// 根据厂商和模型ID自动填充默认的 apiUrl（方便快速配置）
function getPresetApiUrl(providerId) {
  const provider = PROVIDERS.find(p => p.id === providerId);
  return provider ? provider.defaultApiUrl : '';
}

module.exports = {
  getAvailableProviders,
  getCurrentModelConfig,
  updateCurrentModelConfig,
  getPresetApiUrl,
  PROVIDERS,
};