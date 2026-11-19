/* Izin: cek scope token GitHub + pilih izin aplikasi Android untuk build APK. */
(function () {
  if (!window.ME) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const KEY = 'sukizy_perm_' + ME.login, LOCK = ['INTERNET', 'ACCESS_NETWORK_STATE'];
  const APP = [['INTERNET', 'Internet', 'Wajib'], ['ACCESS_NETWORK_STATE', 'Status jaringan', 'Wajib'], ['CAMERA', 'Kamera', 'Foto & video'],
    ['RECORD_AUDIO', 'Mikrofon', 'Rekam suara'], ['ACCESS_FINE_LOCATION', 'Lokasi akurat', 'GPS'], ['ACCESS_COARSE_LOCATION', 'Lokasi perkiraan', 'Jaringan'],
    ['POST_NOTIFICATIONS', 'Notifikasi', 'Android 13+'], ['VIBRATE', 'Getar', 'Haptik'], ['READ_MEDIA_IMAGES', 'Foto', 'Galeri'],
    ['READ_MEDIA_VIDEO', 'Video', 'Galeri'], ['READ_MEDIA_AUDIO', 'Audio', 'Musik'], ['READ_CONTACTS', 'Kontak', 'Buku telepon'],
    ['BLUETOOTH_CONNECT', 'Bluetooth', 'Perangkat'], ['WAKE_LOCK', 'Layar menyala', 'Tetap aktif']];
  const TOK = [['repo', 'Baca & tulis repo', 'Upload ZIP, buat repo'], ['workflow', 'Workflow Actions', 'Build APK & Deploy'], ['delete_repo', 'Hapus repo', 'Tombol Hapus repo']];

  let sel; try { sel = new Set(JSON.parse(localStorage.getItem(KEY))); } catch (e) { sel = new Set(); }
  LOCK.forEach((p) => sel.add(p));
  const get = () => APP.map((a) => a[0]).filter((p) => sel.has(p));
  const info = () => { $('#apkPermInfo').textContent = get().length + ' dipilih'; };
  window.SKperms = { get };

  function renderApp() {
    const box = $('#appPerm'); box.textContent = '';
    APP.forEach(([p, t, s]) => {
      const r = el('label', 'prow' + (LOCK.includes(p) ? ' lock' : '')), c = el('input'), tx = el('span', 'ptxt');
      c.type = 'checkbox'; c.checked = sel.has(p); c.disabled = LOCK.includes(p);
      c.onchange = () => { c.checked ? sel.add(p) : sel.delete(p); localStorage.setItem(KEY, JSON.stringify(get())); info(); };
      tx.append(el('strong', null, t), el('small', null, s)); r.append(c, tx); box.append(r);
    });
    info();
  }
  async function renderTok() {
    const box = $('#tokPerm'); box.textContent = ''; box.append(el('p', 'muted', 'Memeriksa token…'));
    let sc = null;
    try {
      const r = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + ME.token } });
      if (r.status === 401) return Auth.logout();
      sc = r.headers.get('x-oauth-scopes');
    } catch (e) { box.textContent = ''; return box.append(el('p', 'muted', 'Gagal memeriksa token. Periksa koneksi.')); }
    box.textContent = '';
    if (sc === null) box.append(el('p', 'muted', 'Token fine-grained: izin tidak bisa dibaca otomatis. Pastikan Contents, Actions, Workflows, Pages, dan Administration = Read and write.'));
    const have = (sc || '').split(',').map((x) => x.trim());
    TOK.forEach(([k, t, s]) => {
      const ok = sc === null ? null : have.includes(k) || (k === 'repo' && have.includes('repo'));
      const r = el('div', 'prow ' + (ok === null ? 'unk' : ok ? 'ok' : 'no')), tx = el('span', 'ptxt');
      tx.append(el('strong', null, t + ' (' + k + ')'), el('small', null, s));
      r.append(el('span', 'pdot', ok === null ? '?' : ok ? '✓' : '✕'), tx); box.append(r);
    });
  }
  $('#tokCheck').addEventListener('click', renderTok);
  $('#apkPermGo').addEventListener('click', () => SKview('perm'));
  document.querySelector('#nav [data-view="perm"]').addEventListener('click', renderTok);
  renderApp(); if (location.hash === '#perm') renderTok();
})();
