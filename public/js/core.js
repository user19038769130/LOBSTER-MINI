// =====================================================================
// 模块1：核心工具函数 (Core)
// =====================================================================
const Lobster = {};

Lobster.Core = {
  userId: localStorage.getItem('lobster_user_id') || ('user_' + Math.random().toString(36).substr(2,8)),
  getEl: (id) => document.getElementById(id),
  getVal: (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; },
  setText: (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; },
  escapeHtml: (s) => String(s).replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])),
  simpleMarkdown: (text) => {
    let html = Lobster.Core.escapeHtml(text);
    html = html.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/___+/g, '<hr>').replace(/---+/g, '<hr>').replace(/\n/g, '<br>');
    return html;
  },
  fetchWithAuth: (url, options = {}) => {
    const headers = options.headers || {};
    if (url.includes('/api/audit/logs') || url.includes('/api/behavior/logs')) headers['X-User-Id'] = Lobster.Core.userId;
    return fetch(url, { ...options, headers });
  }
};
localStorage.setItem('lobster_user_id', Lobster.Core.userId);