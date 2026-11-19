/* Dashboard: daftar repo, filter, lihat file, ubah visibilitas, hapus. */
(function () {
  if (!window.ME) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let repos = [], loading = true, failed = false;

  async function gh(path, method, body) {
    const r = await fetch('https://api.github.com' + path, {
      method: method || 'GET',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + ME.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { Auth.logout(); throw new Error('Sesi berakhir'); }
    if (r.status === 204) return null;
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const e = new Error((d && d.message) || r.statusText); e.status = r.status; throw e; }
    return d;
  }
  window.SKgh = gh;
  const kb = (n) => (n < 1024 ? n + ' KB' : (n / 1024).toFixed(1) + ' MB');
  const bytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
  function ago(d) {
    const m = (Date.now() - new Date(d)) / 60000;
    if (m < 1) return 'baru saja'; if (m < 60) return Math.floor(m) + ' menit lalu';
    if (m < 1440) return Math.floor(m / 60) + ' jam lalu'; if (m < 43200) return Math.floor(m / 1440) + ' hari lalu';
    if (m < 525600) return Math.floor(m / 43200) + ' bulan lalu'; return Math.floor(m / 525600) + ' tahun lalu';
  }

  /* ---------- tab ---------- */
  const VIEWS = ['repos', 'upload', 'deploy', 'apk', 'perm', 'hist'];
  function view(v) {
    VIEWS.forEach((n) => { $('#view-' + n).hidden = n !== v; });
    document.querySelectorAll('#nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === v));
    history.replaceState(null, '', '#' + v); window.scrollTo({ top: 0 });
  }
  window.SKview = view;
  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => view(b.dataset.view)));

  /* ---------- render ---------- */
  function renderStats() {
    const box = $('#stats'); box.textContent = '';
    const priv = repos.filter((r) => r.private).length;
    [['Total repo', repos.length], ['Private', priv], ['Public', repos.length - priv],
     ['Bintang', repos.reduce((s, r) => s + r.stargazers_count, 0)]].forEach(([l, n]) => {
      const s = el('div', 'stat'); s.append(el('strong', null, loading ? '–' : n), el('span', null, l)); box.appendChild(s);
    });
  }

  function card(r) {
    const c = el('article', 'repo');
    const head = el('div', 'repo-head');
    const a = el('a', 'repo-name', r.name); a.href = r.html_url; a.target = '_blank'; a.rel = 'noopener';
    const bd = el('span', 'badges');
    bd.append(el('span', 'badge ' + (r.private ? 'priv' : 'pub'), r.private ? 'Private' : 'Public'));
    if (r.fork) bd.append(el('span', 'badge', 'Fork'));
    if (r.archived) bd.append(el('span', 'badge', 'Arsip'));
    head.append(a, bd);
    const meta = el('div', 'repo-meta');
    [r.language && '● ' + r.language, '★ ' + r.stargazers_count, kb(r.size), 'Diperbarui ' + ago(r.pushed_at || r.updated_at),
     r.owner.login !== ME.login && r.owner.login].filter(Boolean).forEach((t) => meta.append(el('span', null, t)));
    const act = el('div', 'repo-act');
    const mk = (txt, fn, cls) => { const b = el('button', cls, txt); b.type = 'button'; b.onclick = fn; return b; };
    act.append(mk('Upload ZIP', () => toUpload(r), 'sm sun'), mk('Deploy', () => toDeploy(r), 'ghost sm'), mk('Build APK', () => toApk(r), 'ghost sm'),
      mk('File', () => browse(r), 'ghost sm'), mk('Lainnya', () => more(r), 'ghost sm'));
    c.append(head, el('p', 'repo-desc', r.description || 'Tanpa deskripsi.'), meta, act);
    return c;
  }

  function render() {
    window.SKrepos = repos;
    renderStats();
    const grid = $('#repoGrid'); grid.textContent = '';
    if (loading) { for (let i = 0; i < 4; i++) grid.append(el('div', 'repo sk')); return; }
    if (failed) { grid.append(el('p', 'empty', 'Gagal memuat repo. Periksa koneksi lalu tekan Segarkan.')); return; }
    const q = $('#q').value.trim().toLowerCase(), f = $('#flt').value, s = $('#srt').value;
    let list = repos.filter((r) => (!q || (r.name + ' ' + (r.description || '')).toLowerCase().includes(q)) &&
      (f === 'all' || (f === 'private' && r.private) || (f === 'public' && !r.private) || (f === 'fork' && r.fork)));
    list.sort((a, b) => s === 'name' ? a.name.localeCompare(b.name)
      : s === 'pushed_at' ? new Date(b.pushed_at) - new Date(a.pushed_at) : b[s] - a[s]);
    if (!list.length) grid.append(el('p', 'empty', repos.length ? 'Tidak ada repo yang cocok dengan pencarian.' : 'Belum ada repo. Buka tab Upload ZIP untuk membuat yang pertama.'));
    list.forEach((r) => grid.append(card(r)));
  }

  /* ---------- aksi ---------- */
  function toUpload(r) {
    const s = $('#repoSearch'); s.value = r.full_name; s.dispatchEvent(new Event('input'));
    view('upload'); Toast.show('info', 'Repo ' + r.full_name + ' dipilih. Tarik file ZIP-mu.');
  }

  async function browse(r) {
    try {
      Toast.show('info', 'Memuat file ' + r.name + '…', 1500);
      const t = await gh(`/repos/${r.full_name}/git/trees/${encodeURIComponent(r.default_branch)}?recursive=1`);
      const files = t.tree.filter((x) => x.type === 'blob'), box = el('div', 'flist');
      if (!files.length) box.textContent = 'Repo kosong.';
      files.slice(0, 300).forEach((x) => { const row = el('div', 'frow'); row.append(el('span', null, x.path), el('small', null, bytes(x.size || 0))); box.append(row); });
      if (files.length > 300 || t.truncated) box.append(el('p', 'muted', 'Menampilkan 300 file pertama.'));
      Modal.open({ title: `${r.name} · ${files.length} file`, body: box, confirmText: 'Tutup', hideCancel: true });
    } catch (e) { Toast.show('error', e.status === 409 ? 'Repo ini masih kosong.' : 'Gagal memuat file: ' + e.message); }
  }

  async function toggle(r) {
    const to = !r.private;
    if (!(await Modal.open({ title: to ? 'Jadikan private?' : 'Jadikan public?', confirmText: 'Ya, ubah',
      body: to ? `${r.name} hanya bisa dilihat kamu dan kolaborator.` : `Semua orang di internet bisa melihat isi ${r.name}.`, danger: !to }))) return;
    try {
      await gh('/repos/' + r.full_name, 'PATCH', { private: to });
      r.private = to; render(); Toast.show('success', `${r.name} sekarang ${to ? 'private' : 'public'}.`);
    } catch (e) { Toast.show('error', 'Gagal mengubah visibilitas: ' + e.message); }
  }

  async function del(r) {
    if (!(await Modal.open({ title: 'Hapus repo?', body: `Repo ${r.full_name} beserta semua isinya akan dihapus permanen.`, confirmText: 'Hapus', danger: true }))) return;
    try {
      await gh('/repos/' + r.full_name, 'DELETE');
      repos = repos.filter((x) => x.id !== r.id); render();
      Toast.show('success', `Repo ${r.name} dihapus.`); $('#sync').click();
    } catch (e) {
      Toast.show('error', e.status === 403 ? 'Token belum punya izin delete_repo. Buat token baru dengan izin itu.' : 'Gagal menghapus: ' + e.message);
    }
  }

  function toDeploy(r) {
    const i = $('#depRepo'); i.value = r.full_name; i.dispatchEvent(new Event('change')); view('deploy');
  }
  function toApk(r) {
    const i = $('#apkRepo'); i.value = r.full_name; i.dispatchEvent(new Event('change')); view('apk');
  }
  const field = (label, input) => { const l = el('label', 'field'); l.append(el('span', null, label), input); return l; };
  const inp = (v, ph) => { const i = el('input'); i.type = 'text'; i.value = v || ''; i.placeholder = ph || ''; i.autocomplete = 'off'; i.spellcheck = false; return i; };

  function more(r) {
    const box = el('div', 'menu');
    const it = (t, fn, cls) => { const b = el('button', 'ghost ' + (cls || ''), t); b.type = 'button'; b.onclick = () => { b.closest('dialog').close('no'); setTimeout(fn, 0); }; box.append(b); };
    it('Salin URL clone', () => navigator.clipboard.writeText(r.clone_url).then(() => Toast.show('success', 'URL clone disalin.'), () => Toast.show('error', 'Gagal menyalin.')));
    if (r.permissions && r.permissions.admin) {
      it('Edit nama & deskripsi', () => edit(r));
      it(r.archived ? 'Buka arsip' : 'Arsipkan', () => archive(r));
      it(r.private ? 'Jadikan public' : 'Jadikan private', () => toggle(r));
      it('Hapus repo', () => del(r), 'dng');
    }
    Modal.open({ title: r.name, body: box, confirmText: 'Tutup', hideCancel: true });
  }

  async function patch(r, body, okMsg) {
    try { const d = await gh('/repos/' + r.full_name, 'PATCH', body); const p = r.permissions; Object.assign(r, d); r.permissions = r.permissions || p; render(); Toast.show('success', okMsg); $('#sync').click(); }
    catch (e) { Toast.show('error', 'Gagal: ' + e.message); }
  }
  async function edit(r) {
    const n = inp(r.name), d = inp(r.description, 'Deskripsi singkat'), box = el('div');
    box.append(field('Nama repo', n), field('Deskripsi', d));
    if (!(await Modal.open({ title: 'Edit repo', body: box, confirmText: 'Simpan' }))) return;
    if (!/^[A-Za-z0-9._-]+$/.test(n.value.trim())) return Toast.show('error', 'Nama repo hanya huruf, angka, titik, strip, underscore.');
    patch(r, { name: n.value.trim(), description: d.value.trim() }, 'Repo diperbarui.');
  }
  async function archive(r) {
    if (await Modal.open({ title: r.archived ? 'Buka arsip?' : 'Arsipkan repo?', body: r.archived ? 'Repo bisa diubah lagi.' : 'Repo jadi read-only sampai kamu membuka arsipnya.', confirmText: 'Ya' }))
      patch(r, { archived: !r.archived }, r.archived ? 'Arsip dibuka.' : 'Repo diarsipkan.');
  }
  async function newRepo() {
    const n = inp('', 'nama-repo'), d = inp('', 'Deskripsi (opsional)'), box = el('div');
    const c = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = true; c.append(cb, document.createTextNode(' Private'));
    box.append(field('Nama repo', n), field('Deskripsi', d), c);
    if (!(await Modal.open({ title: 'Repo baru', body: box, confirmText: 'Buat repo' }))) return;
    if (!/^[A-Za-z0-9._-]+$/.test(n.value.trim())) return Toast.show('error', 'Nama repo hanya huruf, angka, titik, strip, underscore.');
    try { await gh('/user/repos', 'POST', { name: n.value.trim(), description: d.value.trim(), private: cb.checked, auto_init: true }); Toast.show('success', 'Repo ' + n.value.trim() + ' dibuat.'); $('#sync').click(); }
    catch (e) { Toast.show('error', 'Gagal membuat repo: ' + e.message); }
  }

  async function account() {
    try {
      const r = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + ME.token } });
      const u = await r.json(), sc = r.headers.get('x-oauth-scopes'), c = (await gh('/rate_limit')).resources.core;
      const dl = el('div', 'dl-grid');
      [['Akun', '@' + u.login], ['Nama', u.name || '-'], ['Repo public', u.public_repos], ['Repo private', u.total_private_repos != null ? u.total_private_repos : '-'],
       ['Pengikut', u.followers], ['Jenis token', sc === null ? 'Fine-grained' : 'Classic'], ['Izin (scope)', sc || 'Sesuai pengaturan token'],
       ['Sisa kuota API', c.remaining + ' / ' + c.limit]].forEach(([k, v]) => dl.append(el('span', 'k', k), el('span', null, String(v))));
      Modal.open({ title: 'Akun & token', body: dl, confirmText: 'Tutup', hideCancel: true });
    } catch (e) { Toast.show('error', 'Gagal memuat info akun.'); }
  }

  /* ---------- event ---------- */
  $('#newRepo').addEventListener('click', newRepo);
  const av = $('#avatar'); av.setAttribute('role', 'button'); av.tabIndex = 0; av.title = 'Akun & token'; av.style.cursor = 'pointer';
  av.addEventListener('click', account); av.addEventListener('keydown', (e) => { if (e.key === 'Enter') account(); });
  ['input', 'change'].forEach((t) => ['#q', '#flt', '#srt'].forEach((s) => $(s).addEventListener(t, render)));
  $('#refresh').addEventListener('click', () => { loading = true; render(); $('#sync').click(); });
  document.addEventListener('sukizy:repos', (e) => { loading = false; failed = !e.detail; repos = e.detail || []; render(); });

  render();
  const h = location.hash.slice(1); view(VIEWS.includes(h) ? h : 'repos');
})();
