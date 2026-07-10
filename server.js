// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { taskQueue } = require('./services/taskQueue');
const extractUserId = require('./middleware/auth');
const requestLogger = require('./middleware/logger');
const {
  getUserData,
  updateUserData,
  getGlobalConfig,
  setGlobalConfig,
} = require('./users/store');

const { SQLiteRunStore } = require('./airuntime/data_store');
const { RunManager, ConflictError } = require('./airuntime/manager');
const { StreamBridge } = require('./airuntime/stream_bridge');
const { RunContext, run_agent } = require('./airuntime/task_worker');
const { buildAgent } = require('./agent/factory');
const { SkillRetriever } = require('./services/skillRetriever');
const {
  getCurrentModelConfig,
  updateCurrentModelConfig,
  getAvailableProviders,
} = require('./models/config');
const { createWechatOrder, queryWechatOrder } = require('./payment/wechat');
const { initChannels, getChannelStatus, handleChannelMessage } = require('./channels');
const agentRoutes = require('./routes/agents');
const pptRoutes = require('./routes/ppt');
const ivm = require('isolated-vm');
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(requestLogger);
app.use(extractUserId);
app.use(express.static(path.join(__dirname, 'public')));
const store = new SQLiteRunStore();
const bridge = new StreamBridge();
const runManager = new RunManager(store);
// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
// ===== 用户数据静态文件路由（安全加固版） =====
app.use('/user_data/:userId', (req, res, next) => {
  const requestUserId = req.params.userId;
  const baseUserDataDir = path.resolve(__dirname, 'user_data');
  const targetUserDir = path.resolve(baseUserDataDir, requestUserId);
  if (requestUserId !== req.userId) {
    return res.status(403).json({ error: '无权访问此用户数据' });
  }
  if (!targetUserDir.startsWith(baseUserDataDir + path.sep)) {
    return res.status(403).json({ error: '非法访问路径' });
  }
  const userStaticPath = path.join(__dirname, 'user_data', requestUserId);
  express.static(userStaticPath)(req, res, next);
});
// ===== 通用登录入口（用户可登录任意网站） =====
app.get('/login', (req, res) => {
  const userId = req.query.userId || req.userId;
  if (!userId) {
    return res.status(400).send('缺少 userId 参数');
  }
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>登录您的账号</title></head>
    <body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:20px;background:#0a0a0a;color:#e8edff;">
      <h2>🔐 通用登录</h2>
      <p>用户ID: <strong>${userId}</strong></p >
      <p>在虚拟桌面中登录您需要使用的任何网站：</p >
      <ul>
        <li>饿了么 / 美团</li>
        <li>抖音 / 小红书</li>
        <li>淘宝 / 京东</li>
        <li>邮箱 / OA</li>
        <li>任何需要登录的网站</li>
      </ul>
      <br>
      <button onclick="window.open('http://43.156.18.57:8080/vnc.html', '_blank')" style="background:#3b82f6;border:none;color:white;padding:10px 24px;border-radius:30px;cursor:pointer;font-size:16px;">🖥️ 打开虚拟桌面</button>
      <button onclick="fetch('/login/confirm?userId=${userId}').then(() => alert('✅ 登录态已保存！')).catch(() => alert('❌ 保存失败'))" style="background:#10b981;border:none;color:white;padding:10px 24px;border-radius:30px;cursor:pointer;font-size:16px;margin-left:12px;">✅ 已完成登录</button>
      <br><br>
      <p>← 返回对话</p >
    </body>
    </html>
  `);
});
app.get('/login/confirm', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' });
  }
  const profileDir = `/home/ubuntu/lobster-mini/user_data/${userId}/firefox_profile`;
  const fs = require('fs');
  const path = require('path');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  fs.writeFileSync(path.join(profileDir, '.logged_in'), 'true');
  res.json({ success: true, message: '登录态已保存' });
});
// ====== 技能加载 ======
const skillsMap = new Map();
const disabledSkills = new Set();
const skillDir = path.join(__dirname, 'skills');
if (fs.existsSync(skillDir)) {
  const entries = fs.readdirSync(skillDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(skillDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.js')) {
      try {
        const skill = require(fullPath);
        if (skill.name && typeof skill.handler === 'function') {
          skillsMap.set(skill.name, skill);
          console.log(`✅ 加载技能: ${skill.name} (.js)`);
        }
      } catch (e) { console.error(`加载技能失败: ${entry.name}`, e); }
    }
    if (entry.isDirectory()) {
      const runJs = path.join(fullPath, 'scripts', 'run.js');
      if (fs.existsSync(runJs)) {
        try {
          const skill = require(runJs);
          if (skill.name && typeof skill.handler === 'function') {
            skillsMap.set(skill.name, skill);
            console.log(`✅ 加载模块化技能: ${skill.name} (${entry.name})`);
          } else {
            console.warn(`⚠️ 跳过技能 ${entry.name}: run.js 未导出 name 和 handler`);
          }
        } catch (e) { console.error(`加载模块化技能失败: ${entry.name}`, e); }
      }
    }
  }
}
const skillRetriever = new SkillRetriever(skillsMap);
(async () => {
  try {
    await skillRetriever.buildIndex();
    console.log('🚀 技能向量索引已就绪');
  } catch (err) {
    console.error('技能向量索引构建失败:', err);
  }
})();
initChannels(store);
const CREDIT_RULES = {
  chat: { platformPreDeduct: 3, ownKeyPreDeduct: 1 },
  debate: { platformPreDeduct: 150, ownKeyPreDeduct: 6 },
};
async function validateCustomSkillCode(code) {
  const dangerousPatterns = [
    /require\s*\(/,
    /import\s+.*\s+from/,
    /eval\s*\(/,
    /Function\s*\(/,
    /process\./,
    /global\./,
    /__dirname/,
    /__filename/,
    /child_process/,
    /http\.request/,
    /https\.request/,
    /fs\./,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return { valid: false, error: `禁止使用危险模式: ${pattern.source}` };
    }
  }
  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  const context = isolate.createContextSync();
  try {
    const blockedGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'require', 'process', 'Buffer', 'setInterval', 'setTimeout'];
    for (const g of blockedGlobals) context.global.setSync(g, undefined);
    const testScript = `(async () => { ${code} })()`;
    await context.eval(testScript, { timeout: 2000 });
    return { valid: true };
  } catch (err)
    return { valid: false, error: `沙箱执行失败: ${err.message}` };
  } finally {
    isolate.dispose();
  }
}
function sleep(ms) {
  return new Promise(resolve => global.setTimeout(resolve, ms));
}
// ========== 路由 ==========
app.get('/api/config/models', (req, res) => res.json(getAvailableProviders()));
app.get('/api/config', (req, res) => res.json(getCurrentModelConfig()));
app.post('/api/config', (req, res) => {
  updateCurrentModelConfig(req.body);
  res.json({ ok: true });
});
app.get('/api/user-config', (req, res) => {
  const user = getUserData(req.userId);
  res.json({ userApiKey: user.user_api_key, points: user.points });
});
app.post('/api/user-config', (req, res) => {
  const { userApiKey } = req.body;
  const user = getUserData(req.userId);
  user.user_api_key = userApiKey;
  updateUserData(req.userId, user);
  res.json({ ok: true });
});
app.get('/api/my-points', (req, res) => res.json({ points: getUserPoints(req.userId) }));
app.get('/api/external-keys', (req, res) => res.json([]));
app.get('/api/skills/local', (req, res) => {
  const list = [];
  for (const [name, skill] of skillsMap) {
    list.push({ name, description: skill.description, enabled: !disabledSkills.has(name) });
  }
  res.json(list);
});
app.get('/api/skills', (req, res) => {
  const userId = req.userId;
  const user = getUserData(userId);
  const list = [];
  for (const [name, skill] of skillsMap) {
    list.push({
      name,
      description: skill.description,
      enabled: !disabledSkills.has(name),
      parameters: skill.parameters,
    });
  }
  if (user.custom_skills) {
    user.custom_skills.forEach(s => {
      list.push({
        name: s.name,
        description: s.description,
        apiUrl: s.apiUrl,
        method: s.method,
        parameters: s.parameters,
        enabled: true,
      });
    });
  }
  res.json(list);
});
app.post('/api/skills/toggle', (req, res) => {
  const { name } = req.body;
  if (disabledSkills.has(name)) disabledSkills.delete(name);
  else disabledSkills.add(name);
  res.json({ ok: true });
});
app.get('/api/skills/custom', (req, res) => {
  const user = getUserData(req.userId);
  res.json(user.custom_skills || []);
});
app.post('/api/skills/custom', async (req, res) => {
  const { name, description, apiUrl, method, parameters, code } = req.body;
  const user = getUserData(req.userId);
  if (!user.custom_skills) user.custom_skills = [];
  if (code) {
    const { valid, error } = await validateCustomSkillCode(code);
    if (!valid) {
      return res.status(400).json({ error: `技能代码不安全: ${error}` });
    }
  }
  user.custom_skills = user.custom_skills.filter(s => s.name !== name);
  user.custom_skills.push({
    name,
    description,
    apiUrl,
    method,
    parameters: parameters || '{}',
    code,
  });
  updateUserData(req.userId, user);
  res.json({ ok: true });
});
app.delete('/api/skills/custom', (req, res) => {
  const { name } = req.query;
  const user = getUserData(req.userId);
  if (user.custom_skills) {
    user.custom_skills = user.custom_skills.filter(s => s.name !== name);
    updateUserData(req.userId, user);
  }
  res.json({ ok: true });
});
app.get('/api/channels', (req, res) => res.json(getChannelStatus()));
app.get('/api/channel/workwechat/callback', (req, res) => res.send(req.query.echostr || ''));
app.post('/api/channel/workwechat/callback', async (req, res) => {
  await handleChannelMessage('workwechat', req.body);
  res.send('success');
});
app.post('/api/channel/feishu/event', async (req, res) => {
  if (req.body.type === 'url_verification') return res.json({ challenge: req.body.challenge });
  await handleChannelMessage('feishu', req.body);
  res.json({ code: 0 });
});
app.use('/api/agents', agentRoutes);
app.get('/api/audit/logs', (req, res) => {
  const { skillName, success, limit = 20, offset = 0 } = req.query;
  const logs = store.getAuditLogs(req.userId, {
    limit: Number(limit),
    offset: Number(offset),
    skillName,
    success: success !== undefined ? success === 'true' : undefined,
  });
  const allLogs = store.getAuditLogs(req.userId, { limit: 10000, offset: 0 });
  res.json({ logs, total: allLogs.length });
});
app.get('/api/behavior/logs', (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const logs = store.getBehaviorLogs(req.userId, {
    limit: Number(limit),
    offset: Number(offset),
  });
  const allLogs = store.getBehaviorLogs(req.userId, { limit: 10000, offset: 0 });
  res.json({ logs, total: allLogs.length });
});
// ===================== 核心聊天路由（已修复多模态） =====================
app.post('/api/chat', async (req, res) => {
  let { message, image, agentId, history = [], stream_modes = ['values'] } = req.body;
  const userId = req.userId;
  // 归一化 message 为字符串
  if (Array.isArray(message)) {
    message = message[0]?.text || "";
  } else if (typeof message !== 'string') {
    message = String(message || "");
  }
  if (!message && !image) return res.status(400).json({ error: '消息不能为空' });
  const userData = getUserData(userId);
  const useOwnKey = !!(userData.user_api_key);
  const preDeduct = useOwnKey ? CREDIT_RULES.chat.ownKeyPreDeduct : CREDIT_RULES.chat.platformPreDeduct;
  if (!preDeductCredits(userId, useOwnKey, CREDIT_RULES.chat.platformPreDeduct, CREDIT_RULES.chat.ownKeyPreDeduct)) {
    return res.status(403).json({ error: '积分不足' });
  }
  // ========== 技能路由（硬编码模式，仅纯文本） ==========
  if (!image && (skillsMap.size > 0 || (userData.custom_skills && userData.custom_skills.length))) {
    try {
      const availableSkills = [];
      for (const [name, skill] of skillsMap.entries()) {
        if (!disabledSkills.has(name)) {
          availableSkills.push({
            name,
            description: skill.description,
            parameters: skill.parameters || { type: 'object', properties: {} },
          });
        }
      }
      if (userData.custom_skills) {
        for (const cs of userData.custom_skills) {
          availableSkills.push({
            name: cs.name,
            description: cs.description,
            parameters: cs.parameters ? (typeof cs.parameters === 'string' ? JSON.parse(cs.parameters) : cs.parameters) : { type: 'object', properties: {} },
            apiUrl: cs.apiUrl,
            method: cs.method,
            apiKey: cs.apiKey,
          });
        }
      }
      if (availableSkills.length > 0) {
        const hardPatterns = [
          /用\s*([a-zA-Z_0-9\u4e00-\u9fff]+)\s*技能/,
          /调用\s*([a-zA-Z_0-9\u4e00-\u9fff]+)\s*技能/,
          /使用\s*([a-zA-Z_0-9\u4e00-\u9fff]+)\s*功能/,
          /执行\s*([a-zA-Z_0-9\u4e00-\u9fff]+)\s*技能/,
        ];
        let matchedSkill = null;
        for (const pattern of hardPatterns) {
          const match = message.match(pattern);
          if (match) {
            const skillName = match[1].trim();
            matchedSkill = skillsMap.get(skillName);
            if (matchedSkill) break;
          }
        }
        if (matchedSkill) {
          console.log(`[硬编码路由] 直接调用技能: ${matchedSkill.name}`);
          try {
            const args = {};
            let filePath = null;
            const fileMatch = message.match(/filePath[=:\s]+["']?([^"'\s,]+)["']?/i);
            if (fileMatch) filePath = fileMatch[1];
            if (!filePath) {
              const analyzeMatch = message.match(/分析\s+["']?([^\s"']+\.[a-zA-Z0-9]+)["']?/i);
              if (analyzeMatch) filePath = analyzeMatch[1];
            }
            if (!filePath) {
              const anyPath = message.match(/(\/[^\s"']+\.[a-zA-Z0-9]+)/);
              if (anyPath) filePath = anyPath;
            }
            if (filePath) args.filePath = filePath;
            const analysisMatch = message.match(/analysisType[=:\s]+"?(\w+)"?/i);
            if (analysisMatch) args.analysisType = analysisMatch[1];
            args.userMessage = message;
			args.userId = userId;
			const actionMatch = message.match(/\b(snapshot|move|click|type|key|open)\b/i);
        if (actionMatch) {
            args.action = actionMatch[0].toLowerCase();
          }
            const result = await matchedSkill.handler(args);
            return res.json({
              reply: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            });
          } catch (err) {
            console.error(`技能 [${matchedSkill.name}] 执行失败:`, err);
            return res.status(500).json({ error: `技能执行失败: ${err.message}` });
          }
        }
        const { getGlobalConfig } = require('./users/store');
        const cfg = getGlobalConfig();
        const NO_FC_MODELS = ['hunyuan-standard'];
        const supportsFC = !NO_FC_MODELS.includes(cfg.modelName);
        if (supportsFC) {
          try {
            const OpenAI = require('openai');
            const openai = new OpenAI({
              apiKey: cfg.apiKey,
              baseURL: (cfg.apiUrl || '').replace(/\/chat\/completions$/, '/v1'),
            });
            const tools = availableSkills.map(s => ({
              type: 'function',
              function: { name: s.name, description: s.description, parameters: s.parameters },
            }));
            const systemMessage = {
              role: 'system',
              content: `你是一个执行助手，必须调用函数完成任务。可用函数：${availableSkills.map(s => s.name).join(', ')}。如果用户意图匹配某个函数，请直接调用。`
            };
            const messages = [
              systemMessage,
              ...history.filter(h => h.role && h.content).map(h => ({ role: h.role, content: h.content })),
              { role: 'user', content: message }
            ];
            const completion = await openai.chat.completions.create({
              model: cfg.modelName,
              messages,
              tools,
              tool_choice: 'auto',
              temperature: 0,
            });
            const choice = completion.choices[0];
            if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
              const toolCall = choice.message.tool_calls[0];
              const skillName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments || '{}');
              const builtinSkill = skillsMap.get(skillName);
              if (builtinSkill && typeof builtinSkill.handler === 'function') {
                const result = await builtinSkill.handler(args);
                return res.json({
                  reply: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                });
              }
            } else {
              const reply = choice.message.content || '无回复';
              return res.json({ reply });
            }
          } catch (err) {
            console.error('原生 Function Calling 失败，降级到普通聊天:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('技能路由整体错误，降级到普通聊天:', err.message);
    }
  }
  // ---------- 原有 Agent 流式逻辑（降级，支持多模态） ----------
  const threadId = `chat-${userId}`;
  try {
    const record = await runManager.createOrReject(threadId, null, { multitask_strategy: 'reject' });
    const runId = record.run_id;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    bridge.subscribe(runId, res);
    let userContent;
    if (image) {
      userContent = [
        { type: "image_url", image_url: { url: image } },
        { type: "text", text: message || "请描述这张图片" }
      ];
    } else {
      userContent = message;
    }
    const graphInput = {
      messages: [
        ...history.filter(h => h.role && h.content),
        { role: 'user', content: userContent },
      ],
    };
    const config = { userId, agentId };
    const ctx = new RunContext({ checkpointer: null, store, eventStore: store, threadStore: null });
    const agentFactory = async cfg => buildAgent({ config: cfg, userId, skillRetriever, store, skillsMap });
    run_agent(bridge, runManager, record, ctx, agentFactory, graphInput, config, stream_modes)
      .then(async () => {
        const finalRecord = await runManager.get(runId);
        if (finalRecord && finalRecord.total_tokens) {
          const actualCost = Math.ceil((finalRecord.total_tokens / 1000) * 1);
          const diff = actualCost - preDeduct;
          if (diff !== 0) setUserPoints(userId, getUserPoints(userId) - diff);
        }
        if (store.addBehaviorLog) store.addBehaviorLog(userId, message, finalRecord?.last_ai_message || '');
      })
      .catch(async err => {
        setUserPoints(userId, getUserPoints(userId) + preDeduct);
        console.error('聊天运行错误:', err);
      });
    req.on('close', () => runManager.cancel(runId, 'interrupt'));
  } catch (err) {
    setUserPoints(userId, getUserPoints(userId) + preDeduct);
    if (err instanceof ConflictError) return res.status(409).json({ error: 'Thread has active run' });
    console.error('聊天接口致命错误:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});
// 异步聊天接口
app.post('/api/async-chat', async (req, res) => {
  const { message, userId } = req.body;
  // 简单提取技能名和参数（复用硬编码逻辑或FC）
  // 这里简化为直接调用 web_builder 作为示例
  const skillName = 'web_builder';
  const args = { topic: message };
  
  // 提交任务
  const job = await taskQueue.add({ skillName, args });
  res.json({
    taskId: job.id,
    status: 'pending',
    message: '任务已提交，请稍后通过 /api/task/:id 查询结果'
  });
});
// 查询任务=结果
app.get('/api/task/:id', async (req, res) => {
  const job = await taskQueue.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: '任务不存在' });
  }
  const state = await job.getState();
  const result = job.returnvalue;
  const progress = job.progress();
  res.json({ id: job.id, state, progress, result });
});
// ===== 任务进度查询 =====
app.get('/api/task/:id/progress', async (req, res) => {
  try {
    const { getTaskStatus } = require('./services/taskProgress');
    const status = await getTaskStatus(req.params.id);
    if (!status.total) {
      return res.status(404).json({ error: '任务不存在或已过期' });
    }
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ===================== 辩论（保持不变） =====================
const PROCESS_STEPS = [
  { step: 1, title: "初始化辩论环境", type: "normal" },
  { step: 2, title: "多轮角色依次辩论", type: "normal" },
  { step: 3, title: "生成五维评分&增长数据", type: "normal" },
  { step: 4, title: "产出辩论总结&优化文稿", type: "finish" }
];
const TOTAL_STEP = PROCESS_STEPS.length;
const FETCH_TIMEOUT = 25000;
const SSE_OVERTIME = 180000;
const HEART_BEAT = 25000;
function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT) {
  return Promise.race([
    fetch(url, options),
    sleep(timeout).then(() => { throw new Error('AI接口请求超时，请稍后重试'); })
  ]);
}
app.post('/api/debate', async (req, res) => {
  const { topic, agentIds, rounds = 2 } = req.body;
  const userId = req.userId;
  if (!topic || !agentIds || !Array.isArray(agentIds) || agentIds.length < 2) {
    return res.status(400).json({ error: '至少选择2个辩论角色' });
  }
  const MAX_ROUND = 5;
  const realRound = Math.min(Number(rounds), MAX_ROUND);
  const userData = getUserData(userId);
  const useOwnKey = !!userData.user_api_key;
  const deductScore = useOwnKey ? CREDIT_RULES.debate.ownKeyPreDeduct : CREDIT_RULES.debate.platformPreDeduct;
  const deductSuccess = preDeductCredits(userId, useOwnKey, CREDIT_RULES.debate.platformPreDeduct, CREDIT_RULES.debate.ownKeyPreDeduct);
  if (!deductSuccess) {
    return res.status(403).json({ error: '积分余额不足' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const sendMsg = (obj) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  const heartTimer = setInterval(() => sendMsg({ type: 'ping' }), HEART_BEAT);
  const closeTimer = setTimeout(() => {
    clearInterval(heartTimer);
    sendMsg({ type: 'error', currentStep: 0, msg: '服务执行超时，连接已终止' });
    res.end();
  }, SSE_OVERTIME);
  const clearAllTimer = () => { clearInterval(heartTimer); clearTimeout(closeTimer); };
  req.on('close', () => { clearAllTimer(); setUserPoints(userId, getUserPoints(userId) + deductScore); });
  let currentStep = 0;
  let allRoundContents = [];
  try {
    currentStep = 1;
    sendMsg({ type: 'step', currentStep, totalStep: TOTAL_STEP, stepInfo: PROCESS_STEPS[currentStep - 1], tip: '校验权限、加载角色基础信息...' });
    await sleep(300);
    const agents = (userData.agents || []).filter(item => agentIds.includes(item.id));
    if (agents.length < 2) throw new Error('选中角色不存在，请重新选择');
    const modelCfg = getCurrentModelConfig();
    const apiKey = useOwnKey ? userData.user_api_key : modelCfg.apiKey;
    const modelName = modelCfg.modelName || 'gpt-3.5-turbo';
    const baseUrl = modelCfg.apiUrl;
    await sleep(200);
    currentStep = 2;
    sendMsg({ type: 'step', currentStep, totalStep: TOTAL_STEP, stepInfo: PROCESS_STEPS[currentStep - 1], tip: `共${realRound}轮辩论，角色开始依次发表观点` });
    await sleep(300);
    for (let r = 1; r <= realRound; r++) {
      const roundList = [];
      for (const agent of agents) {
        sendMsg({ type: 'step', currentStep, totalStep: TOTAL_STEP, stepInfo: PROCESS_STEPS[currentStep - 1], tip: `第${r}轮｜【${agent.name}】正在生成发言内容` });
        const historyText = allRoundContents.flat().map(item => `【${item.agentName}】：${item.content}`).join('\n');
        const prompt = `身份：${agent.name}\n人设：${agent.systemPrompt}\n辩论主题：${topic}\n历史对话记录：\n${historyText || '暂无发言'}\n要求：承接上文观点进行答辩辩论，贴合人设，不要重复已有的内容，直接输出正文即可`;
        const resAi = await fetchWithTimeout(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: modelName, temperature: 0.7, messages: [{ role: 'user', content: prompt }] })
        });
        if (!resAi.ok) throw new Error(`接口异常${resAi.status}`);
        const resData = await resAi.json();
        const content = resData?.choices?.[0]?.message?.content?.trim() || '暂无回复';
        roundList.push({ round: r, agentId: agent.id, agentName: agent.name, content });
        await sleep(200);
      }
      allRoundContents.push(roundList);
    }
    currentStep = 3;
    sendMsg({ type: 'step', currentStep, totalStep: TOTAL_STEP, stepInfo: PROCESS_STEPS[currentStep - 1], tip: '正在统计内容长度、AI分析辩论质量打分...' });
    await sleep(300);
    const growthData = allRoundContents.map((item, idx) => {
      const totalTextLen = item.reduce((sum, i) => sum + i.content.length, 0);
      return { round: idx + 1, textLength: totalTextLen, viewGrowth: Math.floor(totalTextLen / 10) };
    });
    const allTalkText = allRoundContents.flat().map(i => `${i.agentName}：${i.content}`).join('\n');
    const scorePrompt = `请针对以下辩论内容，从【内容丰富度content、逻辑严谨度logic、语言表达express、观点吸引力attract、内容完整度complete】五个维度分别打分，分值范围1~10，仅返回标准JSON格式，不要多余文字。\n辩论主题：${topic}\n全部发言内容：\n${allTalkText}`;
    const scoreRes = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: scorePrompt }] })
    });
    const scoreData = await scoreRes.json();
    let radarScores;
    try { radarScores = JSON.parse(scoreData.choices[0].message.content); } catch { radarScores = { content:7, logic:7, express:7, attract:7, complete:7 }; }
    await sleep(200);
    currentStep = 4;
    sendMsg({ type: 'step', currentStep, totalStep: TOTAL_STEP, stepInfo: PROCESS_STEPS[currentStep - 1], tip: '生成辩论总结与精炼优化文稿，流程即将完成' });
    await sleep(300);
    const summaryPrompt = `精简总结本次辩论双方核心观点、分歧点、整体结论，主题：${topic}\n内容：${allTalkText}`;
    const summaryRes = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: summaryPrompt }] })
    });
    const summaryText = summaryRes.json().then(d => d.choices[0].message.content || '暂无总结');
    const finalPrompt = `围绕辩论主题「${topic}」，结合全部辩论观点，整理一篇通顺完整、逻辑流畅的定稿文章`;
    const finalRes = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: finalPrompt }] })
    });
    const finalText = finalRes.json().then(d => d.choices[0].message.content || '暂无优化内容');
    const [summary, finalCreation] = await Promise.all([summaryText, finalText]);
    const finalResult = {
      rounds: realRound,
      allRecords: allRoundContents,
      allTalkList: allRoundContents.flat(),
      radarScores,
      growthData,
      summary,
      finalCreation
    };
    sendMsg({ type: 'done', currentStep, totalStep: TOTAL_STEP, data: finalResult });
    clearAllTimer();
    res.end();
  } catch (err) {
    setUserPoints(userId, getUserPoints(userId) + deductScore);
    clearAllTimer();
    sendMsg({ type: 'error', currentStep, totalStep: TOTAL_STEP, msg: err.message || '服务运行异常' });
    res.end();
  }
});
// =====================图片上传接口 =====================

const { getUserFilePath, getUserDir } = require('./services/userPath');
app.post('/api/upload-image', (req, res) => {
  const { imageBase64, fileName } = req.body;
  const userId = req.userId;
  if (!imageBase64) return res.status(400).json({ error: '缺少图片数据' });
  const matches = imageBase64.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: '图片格式不正确' });
  const ext = matches[1] === 'png' ? 'png' : 'jpg';
  const savePath = getUserFilePath(userId, 'upload', `.${ext}`);
  const buffer = Buffer.from(matches[2], 'base64');
  fs.writeFileSync(savePath, buffer);
  res.json({ success: true, file_path: savePath });
});
app.get('/api/download-file', (req, res) => {
  const filePath = req.query.file;
  const userId = req.userId;
  const userDir = getUserDir(userId);
  if (!filePath || !filePath.startsWith(userDir)) {
    return res.status(403).json({ error: '无权访问此文件' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  res.download(filePath);
});
app.use('/api/ppt', pptRoutes);
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ LOBSTER-MINI 公网运行在 http://0.0.0.0:${PORT}`);
});
