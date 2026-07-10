Lobster.Channel = {
  async load() {
    try {
      const res = await fetch('/api/channels');
      const data = await res.json();
      const ww = document.getElementById('ww-status');
      if (ww) ww.innerHTML = data.workwechat?.enabled ? '✅ 已配置' : '⚪ 未配置';
      const zalo = document.getElementById('zalo-status');
      if (zalo) zalo.innerHTML = data.zalo?.enabled ? '✅ 已配置' : '⚪ 未配置';
      const fb = document.getElementById('fb-status');
      if (fb) fb.innerHTML = data.messenger?.enabled ? '✅ 已配置' : '⚪ 未配置';
    } catch(e) {}
  },

  init() {
    document.querySelectorAll('.config-guide').forEach(btn => {
      btn.onclick = () => alert('请在后端配置对应渠道的回调地址');
    });
  }
};