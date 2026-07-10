// users/store.js
const { SQLiteRunStore } = require('../runtime/store/sqlite');

// 单例 store
let _store;
function getStore() {
  if (!_store) _store = new SQLiteRunStore();
  return _store;
}

// ---------- 用户数据操作 ----------
function getUserData(userId) {
  let user = getStore().getUser(userId);
  if (!user) {
    // 新用户初始化
    user = {
      points: 0,
      agents: [],
      custom_skills: [],
      user_api_key: '',
      last_free_date: '', // 记录上次赠送免费积分的日期（YYYY-MM-DD）
    };
    getStore().updateUser(userId, user);
  }
  return user;
}

function updateUserData(userId, data) {
  return getStore().updateUser(userId, data);
}

// ---------- 配置操作 ----------
function getGlobalConfig() {
  return getStore().getConfig();
}
function setGlobalConfig(key, value) {
  return getStore().setConfig(key, value);
}

// ---------- 积分操作 ----------
function getUserPoints(userId) {
  return getUserData(userId).points || 0;
}

function setUserPoints(userId, points) {
  const user = getUserData(userId);
  user.points = points;
  updateUserData(userId, user);
}

// ---------- 每日免费积分赠送 + 扣费（核心修改） ----------
function preDeductCredits(userId, useOwnKey, platformPre, ownKeyPre) {
  const user = getUserData(userId);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lastFreeDate = user.last_free_date || '';

  // 1. 检查今天是否已赠送免费积分
  if (lastFreeDate !== today) {
    // 未赠送，增加20积分
    user.points = (user.points || 0) + 20;
    user.last_free_date = today;
    updateUserData(userId, user);
    console.log(`[每日免费积分] 用户 ${userId} 获得20免费积分，当前积分: ${user.points}`);
  }

  // 2. 计算本次需要扣除的积分
  const cost = useOwnKey ? ownKeyPre : platformPre;

  // 3. 检查积分是否足够
  if (user.points < cost) {
    console.log(`[积分不足] 用户 ${userId} 当前积分 ${user.points}，需要 ${cost}`);
    return false; // 积分不足，扣费失败
  }

  // 4. 扣除积分
  user.points -= cost;
  updateUserData(userId, user);
  console.log(`[积分扣除] 用户 ${userId} 扣除 ${cost} 积分，剩余 ${user.points}`);
  return true; // 扣费成功
}

module.exports = {
  getUserData,
  updateUserData,
  getGlobalConfig,
  setGlobalConfig,
  getUserPoints,
  setUserPoints,
  preDeductCredits,
};