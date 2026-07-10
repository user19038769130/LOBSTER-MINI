// =====================================================================
// 模块7：行为日记
// =====================================================================
Lobster.Behavior = {
  page: 1,
  pageSize: 20,

  async load() {
    const offset = (Lobster.Behavior.page - 1) * Lobster.Behavior.pageSize;
    let url = `/api/behavior/logs?limit=${Lobster.Behavior.pageSize}&offset=${offset}`;
    try {
      const res = await Lobster.Core.fetchWithAuth(url);
      const data = await res.json();
      const container = document.getElementById('behavior-list');
      if (!container) return;
      if (!data.logs?.length) container.innerHTML = '<div>暂无记录</div>';
      else container.innerHTML = data.logs.map(b => `
        <div class="behavior-item">
          <strong>${Lobster.Core.escapeHtml(b.userId)}</strong> ${new Date(b.timestamp || b.created_at).toLocaleString()}<br/>
          问：${Lobster.Core.escapeHtml(b.userMessage)}<br/>
          答：${Lobster.Core.escapeHtml(b.assistantReply)}
        </div>
      `).join('');
      Lobster.Core.setText('behavior-total', `共${data.total}条`);
      const totalPages = Math.ceil(data.total / Lobster.Behavior.pageSize) || 1;
      Lobster.Core.setText('behavior-page-info', `第${Lobster.Behavior.page}页/${totalPages}页`);
      const prevBtn = document.getElementById('behavior-prev'); if (prevBtn) prevBtn.disabled = Lobster.Behavior.page === 1;
      const nextBtn = document.getElementById('behavior-next'); if (nextBtn) nextBtn.disabled = Lobster.Behavior.page >= totalPages;
    } catch(e) { console.error(e); }
  },

  init() {
    const refreshBtn = document.getElementById('behavior-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', Lobster.Behavior.load);
    const prevBtn = document.getElementById('behavior-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (Lobster.Behavior.page > 1) { Lobster.Behavior.page--; Lobster.Behavior.load(); } });
    const nextBtn = document.getElementById('behavior-next');
    if (nextBtn) nextBtn.addEventListener('click', () => { Lobster.Behavior.page++; Lobster.Behavior.load(); });
  }
};