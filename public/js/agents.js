// =====================================================================
// 模块4：Agent管理
// =====================================================================
Lobster.Agents = {
  agents: [],

  async load() {
    try {
      const res = await fetch(`/api/agents?userId=${Lobster.Core.userId}`);
      const agentData = await res.json();
      Lobster.Agents.agents = agentData.agents || agentData;
      const sel = document.getElementById('agent-selector');
      if (sel) sel.innerHTML = '<option value="">默认助手</option>' + Lobster.Agents.agents.map(a => `<option value="${a.id}">${Lobster.Core.escapeHtml(a.name)}</option>`).join('');
      const container = document.getElementById('agents-list');
      if (container) {
        if (!Lobster.Agents.agents.length) container.innerHTML = '<div>暂无Agent，点击上方按钮创建</div>';
        else container.innerHTML = Lobster.Agents.agents.map(a => `
          <div class="agent-card">
            <strong>${Lobster.Core.escapeHtml(a.name)}</strong>
            <p>${Lobster.Core.escapeHtml(a.description||'')}</p >
            <button onclick="Lobster.Agents.edit('${a.id}')">编辑</button>
            <button onclick="Lobster.Agents.delete('${a.id}')">删除</button>
          </div>
        `).join('');
      }
      Lobster.Debate.loadAgentsCheckbox();
    } catch(e) { console.error(e); }
  },

  edit(id) {
    const a = Lobster.Agents.agents.find(x => x.id === id);
    if (!a) return;
    document.getElementById('agent-name').value = a.name;
    document.getElementById('agent-desc').value = a.description || '';
    document.getElementById('agent-prompt').value = a.systemPrompt || '';
    const modal = document.getElementById('agent-modal');
    if (modal) { modal.style.display = 'flex'; modal.dataset.editId = id; }
  },

  async delete(id) {
    if (!confirm('删除此Agent？')) return;
    try {
      await fetch(`/api/agents/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: Lobster.Core.userId }) });
      Lobster.Agents.load();
    } catch(e) { alert('删除失败'); }
  },

  init() {
    const createBtn = document.getElementById('create-agent-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        document.getElementById('agent-name').value = '';
        document.getElementById('agent-desc').value = '';
        document.getElementById('agent-prompt').value = '';
        const modal = document.getElementById('agent-modal');
        if (modal) { modal.style.display = 'flex'; delete modal.dataset.editId; }
      });
    }
    const cancelBtn = document.getElementById('modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { const modal = document.getElementById('agent-modal'); if (modal) modal.style.display = 'none'; });
    const saveBtn = document.getElementById('modal-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          const data = {
            userId: Lobster.Core.userId,
            name: Lobster.Core.getVal('agent-name'),
            description: Lobster.Core.getVal('agent-desc'),
            systemPrompt: Lobster.Core.getVal('agent-prompt')
          };
          const modal = document.getElementById('agent-modal');
          const editId = modal ? modal.dataset.editId : null;
          const url = editId ? `/api/agents/${editId}` : '/api/agents';
          const method = editId ? 'PUT' : 'POST';
          await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          if (modal) modal.style.display = 'none';
          Lobster.Agents.load();
        } catch(e) { alert('保存失败'); }
      });
    }
  }
};