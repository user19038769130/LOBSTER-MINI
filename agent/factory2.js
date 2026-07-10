// agent/factory.js
const axios = require('axios');
const { getCurrentModelConfig } = require('../models/config');
const { convertSkillsToTools } = require('./tools');
const { StateGraph, END } = require('@langchain/langgraph');
const { ToolNode } = require('@langchain/langgraph/prebuilt');
const { initTask, updateStep, getTaskStatus } = require('../services/taskProgress');

// 最大并行数
const MAX_PARALLEL = 3;

async function buildAgent({ config, userId, skillRetriever, store, skillsMap }) {
  const cfg = getCurrentModelConfig();
  const modelName = cfg.modelName || 'hunyuan-standard';
  const apiKey = cfg.apiKey;
  const apiUrl = cfg.apiUrl;
  const supportsFC = cfg.functionCallingSupport === true;

  const rawLlm = {
    async invoke(messages, options = {}) {
      const payload = { model: modelName, messages, temperature: 0.7 };
      if (options._forceTools && options.tools && options.tools.length > 0 && supportsFC) {
        payload.tools = options.tools;
        payload.tool_choice = 'auto';
      }
      const resp = await axios.post(apiUrl, payload, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
      });
      const choice = resp.data.choices[0].message;
      return { role: 'assistant', content: choice.content, tool_calls: choice.tool_calls || [] };
    },
  };

  const graph = new StateGraph({
    channels: {
      messages: { reducer: (left, right) => left.concat(right), default: () => [] },
      subtasks: { reducer: (left, right) => right ?? left, default: () => [] },
      results: { reducer: (left, right) => left.concat(right || []), default: () => [] },
      isPlanningMode: { reducer: (left, right) => right ?? left, default: () => false },
      planningDone: { reducer: (left, right) => right ?? left, default: () => false },
      taskId: { reducer: (left, right) => right ?? left, default: () => null },
      batchIndex: { reducer: (left, right) => right ?? left, default: () => 0 },
      batchTotal: { reducer: (left, right) => right ?? left, default: () => 0 },
    },
  });

  function formatSkillResult(result) {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const reply = result.reply || result.message || result.content || result.text || result.answer;
      if (reply) return reply;
      if (result.success !== undefined) {
        return result.success ? (result.data || result.result || '操作成功') : (result.error || '操作失败');
      }
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  }

  // ===== 节点0：意图识别（任务类型识别） =====
  graph.addNode('intent_router', async (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    const lastUserMsg = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

    console.log('[意图识别] 分析用户意图...');

    const intentPrompt = `判断以下用户请求是否需要分解为多个子任务并行执行。
只返回 "true" 或 "false"。

用户请求：${lastUserMsg}

判断标准：
- 如果请求涉及"多个"、"调研"、"分析"、"比较"、"全面"、"详细"等关键词，或者请求包含多个子目标，返回 true。
- 如果请求简单、单一、明确（如"帮我生成一个网站"），返回 false。`;

    try {
      const response = await rawLlm.invoke([
        { role: 'system', content: '你是意图识别专家，只返回 true 或 false。' },
        { role: 'user', content: intentPrompt }
      ], { _forceTools: false });

      const needsPlanning = response.content.trim().toLowerCase().includes('true');
      console.log(`[意图识别] 需要规划: ${needsPlanning}`);

      if (!needsPlanning) {
        return { isPlanningMode: false, planningDone: true };
      }

      // 如果需要规划，直接进入 planner 节点（由路由控制）
      return { isPlanningMode: true };
    } catch (err) {
      console.error('[意图识别] 失败，默认不规划:', err.message);
      return { isPlanningMode: false, planningDone: true };
    }
  });

  // ===== 节点1：规划节点 =====
  graph.addNode('planner', async (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    const lastUserMsg = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

    console.log('[规划节点] 开始分解任务');
    const planPrompt = `将以下需求分解成 3-5 个可并行执行的子任务。只返回 JSON 数组。
需求：${lastUserMsg}
格式：["子任务1", "子任务2", "子任务3"]`;

    try {
      const planResponse = await rawLlm.invoke([
        { role: 'system', content: '你是任务规划专家，只返回 JSON 数组。' },
        { role: 'user', content: planPrompt }
      ], { _forceTools: false });

      let subtasks = [];
      const content = planResponse.content;
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) subtasks = JSON.parse(jsonMatch[0]);
      if (!subtasks.length) subtasks = JSON.parse(content);
      if (!Array.isArray(subtasks) || !subtasks.length) subtasks = [lastUserMsg];

      console.log(`[规划节点] 分解为 ${subtasks.length} 个子任务`);

      // 初始化进度
      const taskId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      await initTask(taskId, subtasks.length);
      for (let i = 0; i < subtasks.length; i++) {
        await updateStep(taskId, i + 1, `子任务 ${i+1}: ${subtasks[i].substring(0, 30)}...`, 'pending');
      }
      console.log(`[进度] 任务 ${taskId} 已初始化，共 ${subtasks.length} 个子任务`);

      // 计算总批次数
      const batchTotal = Math.ceil(subtasks.length / MAX_PARALLEL);

      const taskList = subtasks.map((t, i) => `  ${i+1}. ${t}`).join('\n');
      const planMessage = `📋 **任务规划完成**（${subtasks.length} 个子任务，分 ${batchTotal} 批执行）\n${taskList}\n\n🔄 开始分批并行执行...`;

      return {
        subtasks,
        isPlanningMode: true,
        taskId,
        batchIndex: 0,
        batchTotal,
        messages: [{ role: 'assistant', content: planMessage }]
      };
    } catch (err) {
      console.error('[规划节点] 失败:', err);
      return { isPlanningMode: false, planningDone: true };
    }
  });

  // ===== 节点2：并行执行器（支持动态分批 + 子任务调用技能） =====
  graph.addNode('parallel_executor', async (state) => {
    const subtasks = state.subtasks || [];
    const results = state.results || [];
    const taskId = state.taskId;
    let batchIndex = state.batchIndex || 0;
    const batchTotal = state.batchTotal || 1;

    if (!subtasks.length) {
      return { isPlanningMode: false, planningDone: true };
    }

    // 计算当前批次需要执行的子任务
    const start = batchIndex * MAX_PARALLEL;
    const end = Math.min(start + MAX_PARALLEL, subtasks.length);
    const batchTasks = subtasks.slice(start, end);

    if (batchTasks.length === 0) {
      // 所有批次已完成
      return { isPlanningMode: false, planningDone: true };
    }

    console.log(`[并行执行器] 执行第 ${batchIndex+1}/${batchTotal} 批，共 ${batchTasks.length} 个子任务`);

    // 更新进度：将当前批次的子任务状态改为 running
    for (let i = 0; i < batchTasks.length; i++) {
      const taskIndex = start + i + 1;
      if (taskId) {
        await updateStep(taskId, taskIndex, `正在执行: ${batchTasks[i].substring(0, 30)}...`, 'running');
      }
    }

    // 并行执行当前批次
    const batchResults = await Promise.all(
      batchTasks.map(async (task, idx) => {
        const taskIndex = start + idx + 1;
        console.log(`[并行执行器] 子任务 ${taskIndex}: ${task.substring(0, 40)}...`);

        try {
          // 子任务调用技能（开启 _forceTools = true，允许使用工具）
          const response = await rawLlm.invoke([
            { role: 'system', content: '完成子任务，可直接调用工具辅助。' },
            { role: 'user', content: task }
          ], { _forceTools: true }); // 关键：允许子任务使用 FC

          if (taskId) {
            await updateStep(taskId, taskIndex, `✅ ${task.substring(0, 30)}`, 'done', response.content.substring(0, 80));
          }
          return { taskId: taskIndex, success: true, result: response.content };
        } catch (err) {
          console.error(`[并行执行器] 子任务 ${taskIndex} 失败:`, err.message);
          if (taskId) {
            await updateStep(taskId, taskIndex, `❌ ${task.substring(0, 30)}`, 'error', err.message);
          }
          return { taskId: taskIndex, success: false, result: `失败: ${err.message}` };
        }
      })
    );

    const allResults = [...results, ...batchResults];
    const batchIndexNew = batchIndex + 1;

    // 如果所有批次完成
    if (batchIndexNew >= batchTotal) {
      // 汇总 + 润色
      const rawSummary = allResults.map(r =>
        `子任务 ${r.taskId}：${r.result}`
      ).join('\n\n');

      console.log('[润色] 开始整理汇总结果...');
      const polishPrompt = `你是一个专业的内容整合专家。将以下子任务结果整合成一份结构清晰、连贯完整的报告。要求：
- 使用小标题划分不同模块
- 语言流畅、专业
- 保留关键信息和数据
- 合并重叠信息

原始信息：
${rawSummary}`;

      let polishedContent = '';
      try {
        const polishResponse = await rawLlm.invoke([
          { role: 'system', content: '你是专业的内容整合专家。' },
          { role: 'user', content: polishPrompt }
        ], { _forceTools: false });
        polishedContent = polishResponse.content;
        console.log('[润色] 完成，长度:', polishedContent.length);
      } catch (err) {
        console.error('[润色] 失败，使用原始汇总:', err.message);
        polishedContent = `✅ **全部 ${subtasks.length} 个子任务完成！**\n\n${rawSummary}`;
      }

      if (taskId) {
        const status = await getTaskStatus(taskId);
        console.log(`[进度] 任务 ${taskId} 全部完成，共 ${status.total} 个子任务`);
      }

      return {
        results: allResults,
        isPlanningMode: false,
        planningDone: true,
        messages: [{
          role: 'assistant',
          content: polishedContent
        }]
      };
    }

    // 还有剩余批次
    return {
      results: allResults,
      isPlanningMode: true,
      batchIndex: batchIndexNew
    };
  });

  // ===== 节点3：原始 Agent =====
  graph.addNode('agent', async (state) => {
    // 如果规划已完成，重置标志
    if (state.planningDone === true && state.subtasks?.length) {
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg?.content?.includes('全部')) {
        return { planningDone: false };
      }
    }

    const lastMsg = state.messages[state.messages.length - 1];
    const lastUserMsg = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

    // 多模态
    let hasImage = false;
    if (Array.isArray(lastMsg?.content)) {
      hasImage = lastMsg.content.some(item => item.type === 'image_url');
    }
    if (hasImage) {
      console.log('→ 视觉模型分支');
      const systemMessage = { role: 'system', content: '你是 LOBSTER-MINI 助手。请根据图片回答。' };
      const fullMessages = [systemMessage, ...state.messages];
      try {
        const response = await rawLlm.invoke(fullMessages, { _forceTools: false });
        return { messages: [response] };
      } catch (err) {
        return { messages: [{ role: 'assistant', content: `图片识别失败: ${err.message}` }] };
      }
    }

    // 构建工具上下文
    const allSkills = [...skillsMap.values()];
    const skillsContext = allSkills.map(s => `- ${s.name}: ${s.description}`).join('\n');
    const systemMessage = {
      role: 'system',
      content: `你是 LOBSTER-MINI 助手。可用工具：\n${skillsContext}`
    };
    const fullMessages = [systemMessage, ...state.messages];

    // FC 分支
    if (supportsFC && allSkills.length) {
      console.log('→ FC 分支');
      const tools = convertSkillsToTools(allSkills, store, userId);
      try {
        const response = await rawLlm.invoke(fullMessages, { tools, _forceTools: true });
        if (response.tool_calls?.length) {
          const toolCall = response.tool_calls[0];
          const skillName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || '{}');
          args.userId = userId;
          args.userMessage = lastUserMsg;
          const targetSkill = skillsMap.get(skillName);
          if (targetSkill) {
            console.log(`[FC] 调用技能: ${skillName}`);
            const result = await targetSkill.handler(args);
            return { messages: [{ role: 'assistant', content: formatSkillResult(result) }] };
          }
        }
        const content = response.content || '';
        if (content) return { messages: [{ role: 'assistant', content }] };
      } catch (err) {
        console.error('[FC] 失败:', err.message);
      }
    }

    // 普通对话
    console.log('→ 普通对话');
    const normalSystem = { role: 'system', content: '你是 LOBSTER-MINI 助手。' };
    const normalMessages = [normalSystem, ...state.messages];
    const response = await rawLlm.invoke(normalMessages);
    return { messages: [response] };
  });

  const toolNode = new ToolNode([]);
  graph.addNode('tools', toolNode);

  // ===== 路由 =====
  graph.addConditionalEdges('agent', (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    const lastUserMsg = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

    // 简单判断是否可能复杂任务（关键词或长度）
    const planningKeywords = ['调研', '研究', '分析', '比较', '多个', '全面', '详细', '汇总', '综合'];
    const simpleHint = planningKeywords.some(kw => lastUserMsg.includes(kw)) || lastUserMsg.length > 80;

    if (simpleHint && !state.isPlanningMode && !state.planningDone) {
      console.log('[路由] → 意图识别');
      return 'intent_router';
    }

    if (state.isPlanningMode && state.subtasks?.length) {
      const completed = state.results?.length || 0;
      if (completed < state.subtasks.length) {
        console.log('[路由] → 并行执行器');
        return 'parallel_executor';
      }
    }

    if (lastMsg?.tool_calls?.length) return 'tools';
    return END;
  });

  // 意图识别 → 规划节点（如果 true）或直接结束
  graph.addConditionalEdges('intent_router', (state) => {
    if (state.isPlanningMode) {
      console.log('[路由] → 规划节点');
      return 'planner';
    }
    return END;
  });

  graph.addEdge('planner', 'parallel_executor');

  graph.addConditionalEdges('parallel_executor', (state) => {
    if (state.isPlanningMode && state.results?.length < state.subtasks?.length) {
      return 'parallel_executor';
    }
    return END;
  });

  graph.addEdge('tools', 'agent');
  graph.setEntryPoint('agent');

  const compiledGraph = graph.compile();
  if (!compiledGraph.astream) {
    compiledGraph.astream = async function* (input, options) {
      const stream = await this.stream(input, options);
      for await (const chunk of stream) yield chunk;
    };
  }
  return compiledGraph;
}

module.exports = { buildAgent };