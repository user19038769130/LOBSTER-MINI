// services/agentManager.js
const { v4: uuid } = require('uuid');
const { getUserData, updateUserData } = require('../users/store');

const MAX_AGENTS_PER_USER = 30;

/**
 * 获取用户所有 Agent
 */
function getUserAgents(userId) {
  const user = getUserData(userId);
  return user.agents || [];
}

/**
 * 创建新 Agent（自动限制 30 个）
 * @param {string} userId
 * @param {object} params { name, description, systemPrompt, level? }
 * @returns {object} 新创建的 agent 对象
 * @throws {Error} 超过限制或参数缺失
 */
function createAgent(userId, { name, description, systemPrompt, level = 1 }) {
  if (!name || !systemPrompt) {
    throw new Error('name 和 systemPrompt 为必填项');
  }

  const user = getUserData(userId);
  const agents = user.agents || [];

  if (agents.length >= MAX_AGENTS_PER_USER) {
    throw new Error(`每个用户最多创建 ${MAX_AGENTS_PER_USER} 个 Agent，当前已有 ${agents.length} 个`);
  }

  const newAgent = {
    id: uuid(),
    name: name.trim(),
    description: (description || '').trim(),
    systemPrompt: systemPrompt.trim(),
    level: level || 1,           // 等级：1-5，用于辩论筛选
    createdAt: new Date().toISOString(),
  };

  agents.push(newAgent);
  user.agents = agents;
  updateUserData(userId, user);
  return newAgent;
}

/**
 * 更新 Agent
 * @returns {object|null} 更新后的 agent，未找到返回 null
 */
function updateAgent(userId, agentId, updates) {
  const user = getUserData(userId);
  const agents = user.agents || [];
  const idx = agents.findIndex(a => a.id === agentId);
  if (idx === -1) return null;

  const agent = agents[idx];
  if (updates.name) agent.name = updates.name.trim();
  if (updates.description !== undefined) agent.description = updates.description.trim();
  if (updates.systemPrompt) agent.systemPrompt = updates.systemPrompt.trim();
  if (updates.level !== undefined) agent.level = updates.level;
  agent.updatedAt = new Date().toISOString();

  user.agents = agents;
  updateUserData(userId, user);
  return agent;
}

/**
 * 删除 Agent
 * @returns {boolean} 是否成功删除
 */
function deleteAgent(userId, agentId) {
  const user = getUserData(userId);
  const agents = user.agents || [];
  const idx = agents.findIndex(a => a.id === agentId);
  if (idx === -1) return false;

  agents.splice(idx, 1);
  user.agents = agents;
  updateUserData(userId, user);
  return true;
}

module.exports = {
  MAX_AGENTS_PER_USER,
  getUserAgents,
  createAgent,
  updateAgent,
  deleteAgent,
};