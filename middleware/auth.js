// middleware/auth.js
// 从多个位置提取 userId，统一挂载到 req.userId。
// 优先级：请求头 x-user-id > 查询参数 userId > 请求体 userId > 'anonymous'

function extractUserId(req, res, next) {
  let userId =
    req.headers['x-user-id'] ||
    req.query.userId ||
    (req.body && req.body.userId) ||
    'anonymous';
  // 简单的合法性校验（防止注入过长字符串）
  if (typeof userId === 'string' && userId.length > 100) {
    userId = userId.slice(0, 100);
  }
  req.userId = userId;
  next();
}

module.exports = extractUserId;