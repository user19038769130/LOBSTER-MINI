// routes/agents.js
const express = require('express');
const router = express.Router();
const {
  getUserAgents,
  createAgent,
  updateAgent,
  deleteAgent,
} = require('../services/agentManager');

// 中间件确保 userId 存在
router.use((req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: '未提供用户标识' });
  }
  next();
});

// 获取当前用户所有 Agent
router.get('/', (req, res) => {
  try {
    const agents = getUserAgents(req.userId);
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建 Agent
router.post('/', (req, res) => {
  try {
    const { name, description, systemPrompt, level } = req.body;
    const agent = createAgent(req.userId, { name, description, systemPrompt, level });
    res.status(201).json({ agent });
  } catch (err) {
    if (err.message.includes('最多创建')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

// 更新 Agent
router.put('/:id', (req, res) => {
  try {
    const updated = updateAgent(req.userId, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }
    res.json({ agent: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除 Agent
router.delete('/:id', (req, res) => {
  try {
    const deleted = deleteAgent(req.userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Agent 不存在' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;