// skills/web_builder/scripts/run.js
const { getCurrentModelConfig } = require('../../../models/config');
const OpenAI = require('openai');

async function handler(args) {
  const { topic, userMessage } = args;
  const prompt = topic || userMessage || '一个简单的网页';
  console.log('[web_builder] 生成网站，主题:', prompt);

  const cfg = getCurrentModelConfig();
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.apiUrl
  });

  const response = await client.chat.completions.create({
    model: cfg.modelName || 'qwen3.5-plus',
    messages: [
      { role: 'system', content: '你是一个网页设计师，生成完整的 HTML 页面代码（包含 CSS 样式），页面应美观、响应式。只输出 HTML 代码，不要任何解释。' },
      { role: 'user', content: `请生成关于“${prompt}”的网站页面` }
    ],
    temperature: 0.7
  });

  let html = response.choices[0].message.content;
  const codeMatch = html.match(/```html\s*([\s\S]*?)\s*```/);
  if (codeMatch) html = codeMatch[1];

  // 将 HTML 传给 preview_render 技能
  const previewSkill = require('../preview_render/scripts/run.js');
  const result = await previewSkill.handler({ html_code: html });

  return result;
}

module.exports = {
  name: 'web_builder',
  description: '根据用户描述生成一个完整的 HTML 网站页面，并自动返回预览链接。当用户要求“做一个网站”、“生成一个页面”、“创建一个网页”时，应调用此技能。',
  handler,
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '网站主题或描述' }
    },
    required: ['topic']
  }
};