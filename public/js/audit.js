// =====================================================================
// 模块6：审计日志
// =====================================================================
Lobster.Audit = {
  page: 1,
  pageSize: 20,

  async load() {
    const skill = Lobster.Core.getVal('audit-skill-filter');
    const status = Lobster.Core.getVal('audit-status-filter');
    const offset = (Lobster.Audit.page - 1) * Lobster.Audit.pageSize;
    let url = `/api/audit/logs?limit=${Lobster.Audit.pageSize}&offset=${offset}`;
    if (skill) url += `&skillName=${encodeURIComponent(skill)}`;
    if (status) url += `&success=${status}`;
    try {
      const res = await Lobster.Core.fetchWithAuth(url);
      const data = await res.json();
      const tbody = document.getElementById('audit-tbody');
      if (!tbody) return;
      if (!data.logs?.length) tbody.innerHTML = '<tr><td colspan="4">暂无日志</td></tr>';
      else tbody.innerHTML = data.logs.map(l => `
        <tr>
          <td>${new Date(l.timestamp || l.created_at).toLocaleString()}</td>
          <td>${Lobster.Core.escapeHtml(l.userId)}</td>
          <td>${Lobster.Core.escapeHtml(l.skillName)}</td>
          <td>${l.success ? '✅' : '❌'}</td>
        </tr>
      `).join('');
      Lobster.Core.setText('audit-total', `共${data.total}条`);
      const totalPages = Math.ceil(data.total / Lobster.Audit.pageSize) || 1;
      Lobster.Core.setText('audit-page-info', `第${Lobster.Audit.page}页/${totalPages}页`);
      const prevBtn = document.getElementById('audit-prev'); if (prevBtn) prevBtn.disabled = Lobster.Audit.page === 1;
      const nextBtn = document.getElementById('audit-next'); if (nextBtn) nextBtn.disabled = Lobster.Audit.page >= totalPages;
    } catch(e) { console.error(e); }
  },

  init() {
    const searchBtn = document.getElementById('audit-search');
    if (searchBtn) searchBtn.addEventListener('click', () => { Lobster.Audit.page = 1; Lobster.Audit.load(); });
    const refreshBtn = document.getElementById('audit-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', Lobster.Audit.load);
    const prevBtn = document.getElementById('audit-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (Lobster.Audit.page > 1) { Lobster.Audit.page--; Lobster.Audit.load(); } });
    const nextBtn = document.getElementById('audit-next');
    if (nextBtn) nextBtn.addEventListener('click', () => { Lobster.Audit.page++; Lobster.Audit.load(); });
  }
};