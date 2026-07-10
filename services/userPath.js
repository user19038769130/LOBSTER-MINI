const path = require('path');
const fs = require('fs');

const BASE_DIR = '/tmp/ppt-images';

/**
 * 获取用户的专属目录，并确保目录存在
 * @param {string} userId 
 * @returns {string} 用户专属目录的绝对路径
 */
function getUserDir(userId) {
  const dir = path.join(BASE_DIR, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 在用户目录下生成一个带时间戳的文件名
 * @param {string} userId 
 * @param {string} prefix 前缀（如 "upload"、"excel"）
 * @param {string} ext 扩展名（如 ".jpg"）
 * @returns {string} 完整文件路径
 */
function getUserFilePath(userId, prefix = 'file', ext = '.jpg') {
  const dir = getUserDir(userId);
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`;
  return path.join(dir, filename);
}

module.exports = { getUserDir, getUserFilePath, BASE_DIR };