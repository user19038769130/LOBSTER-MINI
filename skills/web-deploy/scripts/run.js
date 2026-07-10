const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

// 用户数据根目录
const USER_DATA_ROOT = '/home/ubuntu/lobster-mini/user_data';

// 获取用户的预览目录
function getUserPreviewDir(userId) {
  return path.join(USER_DATA_ROOT, userId, 'previews');
}

// 确保用户目录存在
function ensureUserDir(userId) {
  const dir = getUserPreviewDir(userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[web_deploy] 为用户 ${userId} 创建目录: ${dir}`);
  }
  return dir;
}

async function handler(args) {
  // 必须传入 userId
  const { userId, userMessage, filename } = args;
  if (!userId) {
    return { success: false, error: '缺少 userId 参数，无法进行用户隔离' };
  }

  // 从用户消息中提取 HTML
  const msg = userMessage || '';
  let html_code = '';
  const patterns = [
    /(<!DOCTYPE html>[\s\S]*?<\/html>)/i,
    /(<html[\s\S]*?<\/html>)/i,
    /(<body[\s\S]*?<\/body>)/i,
  ];
  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match) {
      html_code = match[0];
      break;
    }
  }

  if (!html_code) {
    return { success: false, error: '未找到 HTML 代码，请确保消息中包含完整的 HTML 内容' };
  }

  // 使用用户的专属目录
  const userDir = ensureUserDir(userId);
  const name = filename || uuid();
  const fileName = `${name}.html`;
  const filePath = path.join(userDir, fileName);

  try {
    fs.writeFileSync(filePath, html_code, 'utf-8');
    const port = process.env.PORT || 3003;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
    // URL 包含 userId，用于权限校验
    const url = `${baseUrl}/user_data/${userId}/previews/${fileName}`;

    return {
      success: true,
      url,
      file_path: filePath,
      message: `✅ 已部署！点击访问：${url}`
    };
  } catch (err) {
    console.error('[web_deploy] 写入失败:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  name: 'web_deploy',
  description: '将 HTML 代码部署到用户专属目录，生成可访问的网页链接。',
  handler,
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: '用户ID（必填）' },
      userMessage: { type: 'string', description: '包含 HTML 代码的用户消息' },
      filename: { type: 'string', description: '自定义文件名（可选）' }
    },
    required: ['userId']
  }
};