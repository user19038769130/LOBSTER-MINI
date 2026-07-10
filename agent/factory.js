const axios = require('axios');
const { getCurrentModelConfig } = require('../models/config');
const { convertSkillsToTools } = require('./tools');
const { StateGraph, END } = require('@langchain/langgraph');
const { ToolNode } = require('@langchain/langgraph/prebuilt');

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
    channels: { messages: { reducer: (left, right) => left.concat(right), default: () => [] } },
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

  graph.addNode('agent', async (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    const lastUserMsg = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

    // ===== 硬编码路由（userId 强制传递） =====
    // ===== 硬编码路由（userId 强制传递） =====
const hardPatterns = [
  /用\s*([a-zA-Z_0-9\u4e00-\u9fff]+)\s*技能/,
  /调用\s*([a-zA-Z_0-9\u4e00-\u9fff]+)\s*技能/,
];
for (const pattern of hardPatterns) {
  const match = lastUserMsg.match(pattern);
  if (match) {
    const skillName = match[1].trim();
    const targetSkill = skillsMap.get(skillName);
    if (targetSkill) {
      console.log(`[硬编码路由] 技能: ${skillName}, 用户: ${userId}`);
      try {
        const args = {
          userMessage: lastUserMsg,
          userId: userId,
        };
        console.log('[硬编码路由] 传给技能的 args:', JSON.stringify(args));
        const result = await targetSkill.handler(args);
        const reply = formatSkillResult(result);
        return { messages: [{ role: 'assistant', content: reply }] };
      } catch (err) {
        return { messages: [{ role: 'assistant', content: `技能执行失败: ${err.message}` }] };
      }
    }
  }
}
    // ===== FC 分支 =====
    if (supportsFC && skillsMap.size > 0) {
      console.log('→ FC 分支');
      const allSkills = [...skillsMap.values()];
      const tools = convertSkillsToTools(allSkills, store, userId);
      const systemMessage = {
        role: 'system',
        content: `你是 LOBSTER-MINI 助手，你可以使用工具。可用工具：${allSkills.map(s => s.name).join(', ')}`
      };
      const fullMessages = [systemMessage, ...state.messages];
      try {
        const response = await rawLlm.invoke(fullMessages, { tools, _forceTools: true });
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolCall = response.tool_calls[0];
          const skillName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || '{}');
          args.userId = userId;
          args.userMessage = lastUserMsg;
          const targetSkill = skillsMap.get(skillName);
          if (targetSkill) {
            console.log(`[FC] 调用技能: ${skillName}, 用户: ${userId}`);
            const result = await targetSkill.handler(args);
            const reply = formatSkillResult(result);
            return { messages: [{ role: 'assistant', content: reply }] };
          }
        } else {
          const content = response.content || '';
          if (content) return { messages: [{ role: 'assistant', content }] };
        }
      } catch (err) {
        console.error('[FC] 失败:', err.message);
      }
    }

    // ===== 普通对话 =====
    console.log('→ 普通对话');
    const normalSystem = { role: 'system', content: '你是 LOBSTER-MINI 助手。' };
    const normalMessages = [normalSystem, ...state.messages];
    const response = await rawLlm.invoke(normalMessages);
    return { messages: [response] };
  });

  const toolNode = new ToolNode([]);
  graph.addNode('tools', toolNode);
  graph.addConditionalEdges('agent', (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    return lastMsg.tool_calls && lastMsg.tool_calls.length > 0 ? 'tools' : END;
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