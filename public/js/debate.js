// =====================================================================
// 模块8：辩论系统
// =====================================================================
Lobster.Debate = {
  steps: [
    { step: 1, title: "初始化辩论环境" },
    { step: 2, title: "多轮角色依次辩论" },
    { step: 3, title: "生成五维评分&增长数据" },
    { step: 4, title: "产出辩论总结&优化文稿" }
  ],

  loadAgentsCheckbox() {
    const container = document.getElementById('debate-agents-checkbox');
    if (!container) return;
    const agents = Lobster.Agents.agents;
    if (!agents.length) container.innerHTML = '<span>请先在Agent管理创建至少2个Agent</span>';
    else container.innerHTML = agents.map(a => `
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" value="${a.id}"> ${Lobster.Core.escapeHtml(a.name)}
      </label>
    `).join('');
  },

  updateStepIndicator(currentStep) {
    const container = document.getElementById('step-indicator');
    if (!container) return;
    let html = '<div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;">';
    for (let i = 0; i < Lobster.Debate.steps.length; i++) {
      const s = Lobster.Debate.steps[i];
      const isDone = (i + 1 < currentStep) || (currentStep > Lobster.Debate.steps.length && i + 1 === Lobster.Debate.steps.length);
      const isCurrent = (i + 1 === currentStep) && !isDone;
      html += '<div class="step-node">';
      html += `<div class="step-circle ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">${isDone ? '✓' : s.step}</div>`;
      if (i < Lobster.Debate.steps.length - 1) html += `<div class="step-line ${isDone ? 'done' : ''}"></div>`;
      html += '</div>';
    }
    html += '</div><div style="display:flex;justify-content:space-between;width:100%;margin-top:8px;">';
    for (const s of Lobster.Debate.steps) html += `<div class="step-label">${s.title}</div>`;
    html += '</div>';
    container.innerHTML = html;
  },

  renderRadarChart(radarScores) {
    const radarDom = document.getElementById('radar-chart');
    if (!radarDom) return;
    if (typeof echarts === 'undefined') return;
    try {
      const chart = echarts.init(radarDom);
      chart.setOption({
        title: { text: '五维评分', left: 'center', textStyle: { fontSize: 14, color: '#333' } },
        radar: {
          indicator: [
            { name: '内容', max: 10 }, { name: '逻辑', max: 10 },
            { name: '表达', max: 10 }, { name: '吸引', max: 10 }, { name: '完整', max: 10 }
          ],
          center: ['50%', '55%'],
          radius: '70%'
        },
        series: [{
          type: 'radar',
          data: [{
            value: [radarScores.content, radarScores.logic, radarScores.express, radarScores.attract, radarScores.complete],
            name: '评分',
            areaStyle: { color: 'rgba(90,130,255,0.2)' },
            lineStyle: { color: '#5a88ff' },
            itemStyle: { color: '#5a88ff' }
          }]
        }]
      });
      window.addEventListener('resize', () => chart.resize());
    } catch(e) { console.error('雷达图渲染失败', e); }
  },

  renderGrowthChart(growthData) {
    const growthDom = document.getElementById('growth-chart');
    if (!growthDom) return;
    if (typeof echarts === 'undefined') return;
    try {
      const chart = echarts.init(growthDom);
      const rounds = growthData.map(d => `第${d.round}轮`);
      const contentVals = growthData.map(d => d.textLength || d.contentLength || 0);
      const viewVals = growthData.map(d => d.viewGrowth || 0);
      chart.setOption({
        title: { text: '观点增长趋势', left: 'center', textStyle: { fontSize: 14, color: '#333' } },
        tooltip: { trigger: 'axis' },
        legend: { data: ['内容长度', '观点增长'], bottom: 0 },
        xAxis: { type: 'category', data: rounds },
        yAxis: { type: 'value' },
        series: [
          { name: '内容长度', type: 'bar', data: contentVals, color: '#5a88ff' },
          { name: '观点增长', type: 'line', data: viewVals, color: '#10b981' }
        ]
      });
      window.addEventListener('resize', () => chart.resize());
    } catch(e) { console.error('趋势图渲染失败', e); }
  },

  init() {
    const startBtn = document.getElementById('start-debate-btn');
    if (!startBtn) return;
    startBtn.addEventListener('click', async () => {
      const topic = Lobster.Core.getVal('debate-topic');
      if (!topic) return alert('请输入作品内容');
      const checkboxes = document.querySelectorAll('#debate-agents-checkbox input:checked');
      const agentIds = Array.from(checkboxes).map(c => c.value);
      if (agentIds.length < 2) return alert('请至少选择2个Agent');
      const rounds = parseInt(document.getElementById('debate-rounds').value, 10);
      const btn = startBtn; btn.disabled = true; btn.innerText = '处理中...';
      const resultDiv = document.getElementById('debate-result');
      if (resultDiv) resultDiv.style.display = 'block';
      const processDiv = document.getElementById('debate-process');
      if (processDiv) processDiv.innerHTML = '';
      const insightDiv = document.getElementById('ai-insight');
      if (insightDiv) insightDiv.style.display = 'block';
      Lobster.Debate.updateStepIndicator(0);
      try {
        const res = await fetch('/api/debate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Lobster.Core.userId, topic, agentIds, rounds }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              try {
                const payload = JSON.parse(jsonStr);
                if (payload.type === 'step') {
                  const { currentStep, totalStep, stepInfo, tip } = payload;
                  if (processDiv) processDiv.innerHTML = `<div style="margin-bottom:8px;"><span style="color:#5a88ff;font-weight:600;">${stepInfo.title}</span><span style="color:#94a3b8;"> (${currentStep}/${totalStep})</span></div><div style="font-size:13px;color:#cbd5e1;">${tip || ''}</div>`;
                  Lobster.Debate.updateStepIndicator(currentStep);
                  if (insightDiv) insightDiv.innerHTML = `<span style="font-weight:600;">🤖 智能引擎：</span> ${tip || '正在处理...'}`;
                } else if (payload.type === 'done') {
                  const data = payload.data;
                  if (processDiv) processDiv.innerHTML = data.allTalkList.map(r => `<div><b>${r.agentName}</b>: ${r.content}</div>`).join('<hr>');
                  document.getElementById('debate-summary').innerText = data.summary || '';
                  document.getElementById('final-creation').innerText = data.finalCreation || '';
                  if (data.radarScores) {
                    document.getElementById('score-display').innerText = `内容:${data.radarScores.content} 逻辑:${data.radarScores.logic} 表达:${data.radarScores.express} 吸引:${data.radarScores.attract} 完整:${data.radarScores.complete}`;
                    Lobster.Debate.renderRadarChart(data.radarScores);
                  }
                  if (data.growthData && data.growthData.length > 0) Lobster.Debate.renderGrowthChart(data.growthData);
                  Lobster.Debate.updateStepIndicator(Lobster.Debate.steps.length + 1);
                  if (insightDiv) insightDiv.innerHTML = `<span style="font-weight:600;">🤖 智能分析完成</span> 综合评分 ${((data.radarScores.content+data.radarScores.logic+data.radarScores.express+data.radarScores.attract+data.radarScores.complete)/2).toFixed(1)} 分，已生成优化建议。`;
                } else if (payload.type === 'error') {
                  if (processDiv) processDiv.innerHTML = `<div style="color:#ff6b81;">❌ ${payload.msg || '辩论失败'}</div>`;
                  alert('辩论失败: ' + payload.msg);
                  if (insightDiv) insightDiv.style.display = 'none';
                }
              } catch (e) { console.warn('JSON parse error', e); }
            }
          }
        }
      } catch (err) {
        alert('辩论请求失败: ' + err.message);
        console.error(err);
      } finally {
        btn.disabled = false;
        btn.innerText = '开始辩论';
      }
    });
  }
};