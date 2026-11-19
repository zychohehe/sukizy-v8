/* Login SUKIZY: masuk memakai GitHub Personal Access Token, akun langsung terhubung. */
(function () {
  const SK = 'sukizy_session';
  const store = (remember) => (remember ? localStorage : sessionStorage);

  async function login(token, remember) {
    token = String(token || '').trim();
    if (!token) throw new Error('Tempel GitHub token dulu.');
    let r;
    try {
      r = await fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token },
      });
    } catch (e) { throw new Error('Tidak bisa terhubung ke GitHub. Periksa koneksi internet.'); }
    if (r.status === 401) throw new Error('Token tidak valid atau sudah kedaluwarsa.');
    if (!r.ok) throw new Error('GitHub menolak permintaan (' + r.status + ').');
    const u = await r.json();
    localStorage.removeItem(SK); sessionStorage.removeItem(SK);
    store(remember).setItem(SK, JSON.stringify({ token, login: u.login, name: u.name || u.login, avatar: u.avatar_url }));
  }

  function current() {
    try { return JSON.parse(sessionStorage.getItem(SK) || localStorage.getItem(SK)); } catch (e) { return null; }
  }
  function logout() { localStorage.removeItem(SK); sessionStorage.removeItem(SK); location.replace('login.html'); }
  function guard() { const me = current(); if (!me) location.replace('login.html'); return me; }

  window.Auth = { login, current, logout, guard };
})();
