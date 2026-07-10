// =====================================================================
// 模块2：UI控制 (导航、主题、头像)
// =====================================================================
Lobster.UI = {
  init() {
    const savedAvatar = localStorage.getItem('lobster_avatar');
    const img = document.getElementById('avatarImg');
    if (savedAvatar && img) { img.src = savedAvatar; img.style.display = 'block'; }
    const avatarBtn = document.getElementById('avatarBtn');
    const avatarUpload = document.getElementById('avatar-upload');
    if (avatarBtn) avatarBtn.addEventListener('click', () => { if (avatarUpload) avatarUpload.click(); });
    if (avatarUpload) {
      avatarUpload.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target.result;
            localStorage.setItem('lobster_avatar', base64);
            const img2 = document.getElementById('avatarImg');
            if (img2) { img2.src = base64; img2.style.display = 'block'; }
          };
          reader.readAsDataURL(file);
        }
      };
    }
    const themeSwitch = document.getElementById('themeSwitch');
    if (themeSwitch) {
      themeSwitch.onclick = () => {
        document.body.classList.toggle('light-mode');
        localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
      };
    }
    if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`page-${page}`);
        if (target) target.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        if (page === 'skill-manager') Lobster.Skills.load();
        if (page === 'audit') Lobster.Audit.load();
        if (page === 'behavior') Lobster.Behavior.load();
        if (page === 'agents') Lobster.Agents.load();
        if (page === 'channel') Lobster.Channel.load();
        if (page === 'debate') Lobster.Debate.loadAgentsCheckbox();
        if (page === 'model') Lobster.Model.loadConfig();
      });
    });
  }
};