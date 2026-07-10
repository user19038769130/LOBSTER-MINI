// =====================================================================
// 模块5：技能管理
// =====================================================================
Lobster.Skills = {
  async load() {
    try {
      const res = await fetch(`/api/skills?userId=${Lobster.Core.userId}`);
      const allSkills = await res.json();
      const local = allSkills.filter(s => !s.apiUrl);
      const custom = allSkills.filter(s => s.apiUrl);
      const localPanel = document.getElementById('local-skills-panel');
      if (localPanel) {
        if (!local.length) localPanel.innerHTML = '<div>暂无本地技能（可添加 skill 文件夹下的 .js）</div>';
        else localPanel.innerHTML = local.map(s => `
          <div class="skill-card">
            <b>${Lobster.Core.escapeHtml(s.name)}</b>
            <p>${Lobster.Core.escapeHtml(s.description)}</p >
            <button onclick="Lobster.Skills.toggle('${Lobster.Core.escapeHtml(s.name)}')">${s.enabled ? '禁用' : '启用'}</button>
          </div>
        `).join('');
      }
      const customList = document.getElementById('custom-skills-list');
      if (customList) {
        if (!custom.length) customList.innerHTML = '<div>暂无自定义API技能，请添加</div>';
        else customList.innerHTML = custom.map(s => `
          <div class="skill-card">
            <b>${Lobster.Core.escapeHtml(s.name)}</b>
            <p>${Lobster.Core.escapeHtml(s.description)}</p >
            <button onclick="Lobster.Skills.deleteCustom('${Lobster.Core.escapeHtml(s.name)}')">删除</button>
          </div>
        `).join('');
      }
    } catch(e) { console.error(e); }
  },

  async toggle(name) {
    await fetch('/api/skills/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    Lobster.Skills.load();
  },

  async deleteCustom(name) {
    await fetch(`/api/skills/custom?userId=${Lobster.Core.userId}&name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    Lobster.Skills.load();
  },

  init() {
    const addBtn = document.getElementById('add-custom-skill');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        try {
          await fetch('/api/skills/custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: Lobster.Core.userId,
              name: Lobster.Core.getVal('custom-name'),
              description: Lobster.Core.getVal('custom-desc'),
              apiUrl: Lobster.Core.getVal('custom-url'),
              method: Lobster.Core.getVal('custom-method'),
              parameters: Lobster.Core.getVal('custom-params')
            })
          });
          Lobster.Skills.load();
          ['custom-name','custom-desc','custom-url','custom-params'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        } catch(e) { alert('添加失败'); }
      });
    }
    const tabLocal = document.getElementById('tab-local');
    const tabCustom = document.getElementById('tab-custom');
    if (tabLocal) tabLocal.addEventListener('click', () => { document.getElementById('local-skills-panel').style.display = 'block'; document.getElementById('custom-skills-panel').style.display = 'none'; });
    if (tabCustom) tabCustom.addEventListener('click', () => { document.getElementById('local-skills-panel').style.display = 'none'; document.getElementById('custom-skills-panel').style.display = 'block'; });
    document.getElementById('local-skills-panel').style.display = 'block';
    document.getElementById('custom-skills-panel').style.display = 'none';
  }
};