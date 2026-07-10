Lobster.Model = {
  VENDORS: [
    { id:'hunyuan', name:'腾讯混元', color:'#0052d9', models:['hunyuan-standard','hunyuan-turbo'], api:'https://api.hunyuan.cloud.tencent.com/v1/chat/completions' },
    { id:'deepseek', name:'DeepSeek', color:'#4f46e5', models:['deepseek-chat','deepseek-reasoner'], api:'https://api.deepseek.com/v1/chat/completions' },
    { id:'zhipu', name:'智谱GLM', color:'#1a73e8', models:['glm-4-flash','glm-4-plus'], api:'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
    { id:'qwen', name:'通义千问', color:'#ff6a00', models:['qwen-turbo','qwen-plus','qwen-max'], api:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
    { id:'moonshot', name:'月之暗面', color:'#18181b', models:['moonshot-v1-8k','moonshot-v1-32k','moonshot-v1-128k'], api:'https://api.moonshot.cn/v1/chat/completions' },
    { id:'baidu', name:'百度千帆', color:'#2468e5', models:['ernie-3.5-8k','ernie-4.0-8k'], api:'https://qianfan.baidubce.com/v2/chat/completions' },
    { id:'bytedance', name:'字节豆包', color:'#e82e2e', models:['doubao-lite-32k','doubao-pro-32k'], api:'https://ark.cn-beijing.volces.com/api/v3/chat/completions' }
  ],

  async loadConfig() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      const panel = document.getElementById('modelRightPanel');
      if (!panel) return;
      const modelInput = panel.querySelector('#model-name');
      const apiInput = panel.querySelector('#model-api-url');
      const keyInput = panel.querySelector('#model-api-key');
      const fcToggle = panel.querySelector('#fc-toggle');
      if (modelInput) modelInput.value = cfg.modelName || '';
      if (apiInput) apiInput.value = cfg.apiUrl || '';
      if (keyInput) keyInput.value = cfg.apiKey || '';
      if (fcToggle) fcToggle.checked = cfg.functionCallingSupport === true;
    } catch(e) {}
  },

  init() {
    document.querySelectorAll('.model-list-item').forEach(item => {
      item.onclick = () => {
        document.querySelectorAll('.model-list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const type = item.dataset.mtype;
        const panel = document.getElementById('modelRightPanel');
        if (type === 'personal') {
          panel.innerHTML = `
            <div class="form-row"><label>个人 API Key</label><input id="user-api-key" type="password" placeholder="sk-..."></div>
            <div class="form-row"><label>注意</label><div style="font-size:12px;color:#a5b4fc;">使用个人Key时优先使用个人配置</div></div>
            <button id="save-personal-key">💾 保存个人Key</button>
          `;
          const save = panel.querySelector('#save-personal-key');
          if (save) {
            save.onclick = async () => {
              try {
                const key = panel.querySelector('#user-api-key').value.trim();
                await fetch('/api/user-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: Lobster.Core.userId, userApiKey: key }) });
                alert('个人Key已保存');
              } catch(e) { alert('保存失败'); }
            };
          }
        } else {
          let vendorHTML = '<div class="form-row"><label>厂商选择</label><div class="vendor-grid">';
          Lobster.Model.VENDORS.forEach(v => {
            vendorHTML += `<div class="vendor-item" data-vendor="${v.id}" data-api="${v.api}" data-models='${JSON.stringify(v.models)}' title="${v.name}"><div class="vendor-logo" style="background:${v.color}">${v.name[0]}</div>${v.name}</div>`;
          });
          vendorHTML += '</div></div>';
          panel.innerHTML = vendorHTML + `
            <div class="form-row"><label>模型名称</label><input id="model-name" placeholder="请先选择厂商"></div>
            <div class="form-row"><label>API地址</label><input id="model-api-url" placeholder="自动填充"></div>
            <div class="form-row"><label>API Key</label><input id="model-api-key" type="password" placeholder="sk-..."></div>
            <div class="form-row"><label><input type="checkbox" id="fc-toggle"> ⚡ 启用工具调用（仅限支持 Function Calling 的高端模型）</label></div>
            <button id="save-model-config">💾 保存配置</button>
          `;
          Lobster.Model.loadConfig();
          const items = panel.querySelectorAll('.vendor-item');
          items.forEach(item => {
            item.addEventListener('click', () => {
              items.forEach(i => i.classList.remove('active'));
              item.classList.add('active');
              const models = JSON.parse(item.dataset.models);
              const api = item.dataset.api;
              const modelInput = panel.querySelector('#model-name');
              const apiInput = panel.querySelector('#model-api-url');
              modelInput.value = models[0];
              apiInput.value = api;
            });
          });
          const saveBtn = panel.querySelector('#save-model-config');
          if (saveBtn) {
            saveBtn.onclick = async () => {
              try {
                const modelName = panel.querySelector('#model-name').value.trim();
                const apiUrl = panel.querySelector('#model-api-url').value.trim();
                const apiKey = panel.querySelector('#model-api-key').value.trim();
                const functionCalling = panel.querySelector('#fc-toggle')?.checked || false;
                await fetch('/api/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ modelName, apiUrl, apiKey, functionCalling })
                });
                alert('全局配置已保存');
                Lobster.Model.loadConfig();
              } catch(e) { alert('保存失败'); }
            };
          }
        }
      };
    });
    const firstActive = document.querySelector('.model-list-item.active');
    if (firstActive) firstActive.click();
    else {
      const first = document.querySelector('.model-list-item');
      if (first) first.click();
    }
  }
};