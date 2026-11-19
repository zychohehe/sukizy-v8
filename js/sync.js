/* Sinkron otomatis: repo, aktivitas build/deploy, dan penghapusan repo di GitHub. */
(function () {
  if (!window.ME || !window.SKgh) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pill = $('#syncPill'), live = $('#feedLive');
  let known = null, last = 0, busy = false, active = false, ft = 0;
  const ago = (d) => { const s = Math.max(0, (Date.now() - new Date(d)) / 1000); return s < 60 ? 'baru saja' : s < 3600 ? Math.floor(s / 60) + ' mnt lalu' : s < 86400 ? Math.floor(s / 3600) + ' jam lalu' : Math.floor(s / 86400) + ' hari lalu'; };

  function mark(ok) { last = ok ? Date.now() : last; pill.className = 'sync-pill ' + (ok ? 'ok' : 'bad'); label(); }
  function label() {
    if (pill.className.includes('bad')) return (pill.textContent = 'Gagal sinkron · ketuk');
    const s = Math.round((Date.now() - last) / 1000);
    pill.textContent = s < 8 ? 'Tersinkron' : 'Sinkron ' + s + ' dtk lalu';
  }
  setInterval(() => last && label(), 1000);
  pill.addEventListener('click', () => { pill.textContent = 'Menyinkronkan…'; $('#sync').click(); });

  /* repo yang hilang di GitHub: bersihkan semua tampilan yang masih memakainya */
  function gone(n) {
    ['#repoSearch', '#depRepo', '#apkRepo'].forEach((s) => { const i = $(s); if (i && i.value.trim().toLowerCase() === n.toLowerCase()) { i.value = ''; i.dispatchEvent(new Event('change')); } });
    const a = $('#apkRepo'); if (!a.value) { $('#apkRun').hidden = true; $('#depRun').hidden = true; $('#depStatus').hidden = true; $('#apkList').textContent = ''; $('#apkList').append(el('p', 'muted', 'Pilih repo untuk melihat APK yang pernah dibuat.')); }
    Toast.show('warn', 'Repo ' + n + ' sudah tidak ada di GitHub. Semua daftar disinkronkan.');
  }
  document.addEventListener('sukizy:repos', (e) => {
    if (!e.detail) return mark(false);
    mark(true);
    const now = new Set(e.detail.map((r) => r.full_name));
    if (known) {
      known.forEach((n) => { if (!now.has(n)) gone(n); });
      now.forEach((n) => { if (!known.has(n)) Toast.show('info', 'Repo baru terdeteksi: ' + n.split('/')[1]); });
    }
    known = now; feed();
  });

  /* aktivitas Actions (build APK, deploy) dari repo terbaru */
  async function feed() {
    if (busy) return; busy = true; clearTimeout(ft);
    const box = $('#feed');
    try {
      const top = (window.SKrepos || []).filter((r) => !r.archived && r.permissions && r.permissions.push).slice(0, 6);
      const all = await Promise.all(top.map((r) => SKgh('/repos/' + r.full_name + '/actions/runs?per_page=3').then((d) => d.workflow_runs.map((x) => ({ r, x }))).catch(() => [])));
      const runs = all.flat().sort((a, b) => new Date(b.x.created_at) - new Date(a.x.created_at)).slice(0, 8);
      box.textContent = '';
      if (!runs.length) box.append(el('p', 'muted', 'Belum ada build atau deploy. Mulai dari tab Build APK atau Deploy Web.'));
      runs.forEach(({ r, x }) => {
        const st = x.status !== 'completed' ? 'run' : x.conclusion === 'success' ? 'ok' : x.conclusion === 'cancelled' ? 'cx' : 'bad';
        const a = el('a', 'frun ' + st); a.href = x.html_url; a.target = '_blank'; a.rel = 'noopener';
        const t = el('span', 'ft'); t.append(el('strong', null, r.name), el('small', null, x.name + ' · ' + x.head_branch));
        a.append(el('i', 'dot'), t, el('span', 'fs', { run: 'Berjalan', ok: 'Sukses', cx: 'Batal', bad: 'Gagal' }[st] + ' · ' + ago(x.created_at)));
        box.append(a);
      });
      active = runs.some((o) => o.x.status !== 'completed');
    } catch (e) { /* sinkron berikutnya mencoba lagi */ }
    live.textContent = active ? 'berjalan' : 'live'; live.classList.toggle('on', active);
    busy = false; ft = setTimeout(feed, active ? 8000 : 30000);
  }

  /* sinkron berkala + saat tab kembali dibuka */
  setInterval(() => { if (!document.hidden) $('#sync').click(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > 15000) $('#sync').click(); });
})();
