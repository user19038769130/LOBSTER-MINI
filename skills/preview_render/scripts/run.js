// skills/preview_render/scripts/run.js
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const PREVIEW_DIR = '/home/ubuntu/lobster-mini/public/previews';
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

async function handler(args) {
  const { html_code } = args;
  if (!html_code) {
    return { success: false, error: '缺少 html_code 参数' };
  }

  const filename = `preview-${uuid()}.html`;
  const filepath = path.join(PREVIEW_DIR, filename);

  try {
    fs.writeFileSync(filepath, html_code, 'utf-8');
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3003';
    const url = `${baseUrl}/previews/${filename}`;
    return {
      success: true,
      url,
      message: `✅ 预览已生成：${url}`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  name: 'preview_render',
  description: '将 HTML 代码渲染为可预览的网页，返回预览链接。当需要预览网页效果时调用此技能。',
  handler,
  parameters: {
    type: 'object',
    properties: {
      html_code: { type: 'string', description: '完整的 HTML 代码' }
    },
    required: ['html_code']
  }
};