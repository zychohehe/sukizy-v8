/* Build APK lewat GitHub Actions: pasang workflow, jalankan, log langsung, unduh log & APK. */
(function () {
  if (!window.ME) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gh = window.SKgh, WF = 'sukizy-build-apk.yml', PATH = '.github/workflows/' + WF;
  const enc = (s) => btoa(unescape(encodeURIComponent(s)));
  const dec = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  const ERR = /##\[error\]|\berror\b|exception|\bfailed\b|failure|cannot find|not found|exit code [1-9]/i, WARN = /##\[warning\]|\bwarning\b/i;
  const clean = (l) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, '');
  let repo = null, job = 0;
  const TPL = window.APK_TEMPLATES || {};
  const HINT = {
    repo: 'SUKIZY membungkus isi repo apa adanya (harus ada index.html di root).',
    url: 'APK membuka website online ini di dalam aplikasi. Tidak perlu file web di repo. Cocok setelah Deploy Website.',
  };
  (function fillTemplates() {
    const sel = $('#apkTpl'); sel.textContent = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
    add('repo', 'Pakai file repo (index.html di root)');
    Object.keys(TPL).forEach((k) => add(k, 'Template: ' + TPL[k].name));
    add('url', 'Bungkus website (URL jadi APK)');
  })();
  function tplChange() {
    const v = $('#apkTpl').value;
    $('#apkUrlRow').hidden = v !== 'url';
    $('#tplHint').textContent = HINT[v] || `${TPL[v].desc} Template dipasang ke repo sebagai index.html lalu langsung di-build.`;
  }
  $('#apkTpl').addEventListener('change', tplChange); tplChange();

  const find = () => { const n = $('#apkRepo').value.trim().toLowerCase(); return (window.SKrepos || []).find((r) => r.full_name.toLowerCase() === n) || null; };
  function onRepo() {
    repo = find(); if (!repo) return;
    const slug = repo.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
    $('#apkName').value = repo.name; $('#apkId').value = 'com.sukizy.' + (/^[a-z]/.test(slug) ? slug : 'a' + slug);
    loadList();
  }
  ['input', 'change'].forEach((t) => $('#apkRepo').addEventListener(t, onRepo));

  /* ---------- fetch & simpan ---------- */
  const authFetch = (url, accept) => fetch(url, { headers: { Authorization: 'Bearer ' + ME.token, Accept: accept || 'application/vnd.github+json' } });
  async function authText(url, accept) { const r = await authFetch(url, accept); if (!r.ok) throw new Error(r.status); return r.text(); }
  function save(name, data, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: type || 'text/plain' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  const fetchJobLog = (r, id) => authText(`https://api.github.com/repos/${r.full_name}/actions/jobs/${id}/logs`).catch(() => null);
  async function fetchAssetLog(r, n) {
    try {
      const rel = await gh(`/repos/${r.full_name}/releases/tags/sukizy-logs`), a = rel.assets.find((x) => x.name === `build-${n}.log`);
      return a ? await authText(`https://api.github.com/repos/${r.full_name}/releases/assets/${a.id}`, 'application/octet-stream') : null;
    } catch (e) { return null; }
  }
  async function summary(r, run, jobObj, steps) {
    const t = ['SUKIZY - ringkasan build (log lengkap tidak bisa diambil dari browser; buka tautan run untuk log penuh)', `Repo: ${r.full_name}`, `Run: ${run.html_url}`, `Status: ${run.status} / ${run.conclusion || '-'}`, '', 'Langkah:'];
    steps.forEach((s) => t.push(`- ${s.name}: ${s.conclusion || s.status}`));
    try { (await gh(`/repos/${r.full_name}/check-runs/${jobObj.id}/annotations`)).forEach((a) => t.push(`[${a.annotation_level}] ${a.title || ''} ${a.message}`)); } catch (e) { /* opsional */ }
    return t.join('\n');
  }
  async function getApk(r, asset) {
    if (!r.private) { window.open(asset.browser_download_url, '_blank', 'noopener'); return; }
    try {
      Toast.show('info', 'Mengunduh APK…', 2500);
      const res = await authFetch(`https://api.github.com/repos/${r.full_name}/releases/assets/${asset.id}`, 'application/octet-stream');
      if (!res.ok) throw new Error(res.status);
      save(asset.name, await res.blob(), 'application/vnd.android.package-archive');
    } catch (e) { window.open(asset.browser_download_url, '_blank', 'noopener'); }
  }

  /* ---------- workflow ---------- */
  async function ensureWorkflow(r) {
    let sha;
    try {
      const f = await gh(`/repos/${r.full_name}/contents/${PATH}?ref=${encodeURIComponent(r.default_branch)}`);
      sha = f.sha; if (dec(f.content) === window.APK_YML) return false;
    } catch (e) { if (e.status !== 404) throw e; }
    await gh(`/repos/${r.full_name}/contents/${PATH}`, 'PUT', { message: 'Tambah workflow Build APK (SUKIZY)', content: enc(window.APK_YML), branch: r.default_branch, sha });
    return true;
  }
  /* Pasang file template ke repo (satu commit) sebelum build. */
  async function installTemplate(r, key, ui) {
    const t = TPL[key]; if (!t) throw new Error('Template tidak ditemukan.');
    let exists = false;
    try { await gh(`/repos/${r.full_name}/contents/index.html?ref=${encodeURIComponent(r.default_branch)}`); exists = true; }
    catch (e) { if (e.status !== 404 && e.status !== 409) throw e; }
    if (exists && !(await Modal.open({ title: 'Timpa index.html?', body: `Repo ini sudah punya index.html. Template “${t.name}” akan menimpanya.`, confirmText: 'Timpa & lanjut', danger: true }))) return false;
    ui.label.textContent = 'Memasang template…';
    const te = new TextEncoder();
    const files = Object.keys(t.files).map((path) => { const b = te.encode(t.files[path]); return { path, size: b.length, getData: async () => b }; });
    const res = await GH.pushFiles({ token: ME.token, owner: r.owner.login, repo: r.name, branch: r.default_branch, message: `Tambah template APK: ${t.name} (SUKIZY)`, files, replace: false, onLog: () => {}, onProgress: () => {} });
    Toast.show('success', res.unchanged ? 'Template sudah terpasang di repo.' : `Template “${t.name}” dipasang di repo.`);
    return true;
  }
  async function dispatch(r, inputs) {
    for (let i = 0; ; i++) {
      try { return await gh(`/repos/${r.full_name}/actions/workflows/${WF}/dispatches`, 'POST', { ref: r.default_branch, inputs }); }
      catch (e) { if (i < 6 && (e.status === 404 || e.status === 422)) { await sleep(3000); continue; } throw e; }
    }
  }

  /* ---------- tampilan run ---------- */
  function initRun() {
    const box = $('#apkRun'); box.hidden = false; box.textContent = '';
    const head = el('div', 'run-head'), label = el('strong', null, 'Menyiapkan…'), lg = el('a', 'link', 'Buka di GitHub');
    lg.target = '_blank'; lg.rel = 'noopener'; lg.hidden = true; head.append(label, lg);
    const bar = el('div', 'bar'), fill = el('div'); bar.append(fill);
    const ul = el('ul', 'steps'), err = el('div', 'errbox'), lh = el('div', 'log-head'), live = el('span', 'badge', 'Menunggu');
    err.hidden = true; lh.append(el('strong', null, 'Log build'), live);
    const pre = el('pre', 'logview', 'Menunggu log dari GitHub…'), act = el('div', 'run-act');
    const cancel = el('button', 'ghost sm dng', 'Batalkan build'); cancel.type = 'button'; act.append(cancel);
    box.append(head, bar, ul, err, lh, pre, act);
    return { label, lg, fill, ul, err, live, pre, act, cancel };
  }
  function setLog(ui, text) {
    const lines = text.split(/\r?\n/).map(clean).slice(-400), pre = ui.pre;
    const stick = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 40, f = document.createDocumentFragment();
    lines.forEach((l) => f.append(el('span', ERR.test(l) ? 'le' : WARN.test(l) ? 'lw' : '', l + '\n')));
    pre.textContent = ''; pre.append(f); if (stick) pre.scrollTop = pre.scrollHeight;
  }
  function update(ui, c) {
    const run = c.run, done = run.status === 'completed', ok = run.conclusion === 'success';
    ui.label.textContent = done ? (ok ? 'Build selesai' : run.conclusion === 'cancelled' ? 'Build dibatalkan' : 'Build gagal') : run.status === 'queued' ? 'Mengantre di GitHub…' : 'Sedang membangun…';
    ui.label.className = done && !ok ? 'bad' : '';
    ui.lg.href = run.html_url; ui.lg.hidden = false;
    const fin = c.steps.filter((s) => s.status === 'completed').length;
    ui.fill.style.width = (done ? 100 : c.steps.length ? (fin / c.steps.length) * 100 : 5) + '%';
    ui.ul.textContent = '';
    c.steps.forEach((s) => ui.ul.append(el('li', 's-' + (s.conclusion || s.status), ({ success: '✓', failure: '✕', skipped: '–' }[s.conclusion] || (s.status === 'in_progress' ? '●' : '○')) + ' ' + s.name)));
    if (c.logText) setLog(ui, c.logText);
    ui.live.textContent = done ? 'Selesai' : c.liveOk && c.logText ? '● Langsung' : 'Per langkah';
  }
  function showErrors(ui, text) {
    const hit = [...new Set(text.split(/\r?\n/).map(clean).filter((l) => ERR.test(l) && l.trim()).map((l) => l.trim().slice(0, 220)))].slice(-6);
    if (!hit.length) return;
    ui.err.hidden = false; ui.err.textContent = ''; ui.err.append(el('strong', null, 'Kemungkinan penyebab'));
    hit.forEach((l) => ui.err.append(el('div', null, l)));
  }

  async function finish(ui, c) {
    const { r, run } = c, ok = run.conclusion === 'success';
    update(ui, c); ui.act.textContent = '';
    if (ok) {
      let asset = null;
      try { asset = (await gh(`/repos/${r.full_name}/releases/tags/apk-${run.run_number}`)).assets.find((x) => /\.apk$/.test(x.name)); } catch (e) { /* cek di bawah */ }
      if (asset) {
        const b = el('button', 'primary', `Unduh & pasang APK (${mb(asset.size)})`); b.type = 'button'; b.onclick = () => getApk(r, asset);
        ui.act.append(b, el('p', 'muted', 'Setelah terunduh, buka file APK, izinkan “Pasang dari sumber ini” bila diminta, lalu ketuk Pasang.'));
        Toast.show('success', 'APK siap diunduh dan dipasang!', 7000);
      } else Toast.show('warn', 'Build sukses, tapi APK belum ditemukan di Releases.', 7000);
    } else if (run.conclusion !== 'cancelled') {
      showErrors(ui, c.logText); Toast.show('error', 'Build gagal. Penyebabnya tampil di bawah.', 8000);
    }
    const dl = el('button', 'ghost', 'Unduh log lengkap'); dl.type = 'button';
    dl.onclick = () => save(`build-log-${r.name}-${run.run_number}.txt`, c.logText);
    ui.act.append(dl); loadList();
  }

  async function track(r, since, my, ui) {
    const c = { r, run: null, steps: [], logText: null, liveOk: true, liveFail: 0 };
    for (let i = 0; i < 400 && my === job; i++) {
      await sleep(i ? 4000 : 3000);
      if (!c.run || c.run.status !== 'completed') {
        const d = await gh(`/repos/${r.full_name}/actions/workflows/${WF}/runs?event=workflow_dispatch&per_page=5`);
        const f = d.workflow_runs.find((x) => new Date(x.created_at).getTime() >= since - 30000);
        if (!f) continue; c.run = f;
        ui.cancel.onclick = async () => { try { await gh(`/repos/${r.full_name}/actions/runs/${f.id}/cancel`, 'POST'); Toast.show('warn', 'Permintaan batal dikirim.'); } catch (e) { Toast.show('error', 'Gagal membatalkan: ' + e.message); } };
      }
      let jobObj = null;
      try { const j = await gh(`/repos/${r.full_name}/actions/runs/${c.run.id}/jobs`); jobObj = j.jobs[0] || null; c.steps = (jobObj && jobObj.steps) || []; } catch (e) { /* coba lagi */ }
      if (jobObj && c.liveOk && jobObj.status !== 'queued') {
        const t = await fetchJobLog(r, jobObj.id);
        if (t) { c.logText = t; c.liveFail = 0; } else if (++c.liveFail >= 3 && c.run.status !== 'completed') c.liveOk = false;
      }
      if (c.run.status !== 'completed') { update(ui, c); continue; }
      if (!c.logText) c.logText = await fetchAssetLog(r, c.run.run_number);
      if (!c.logText) c.logText = await summary(r, c.run, jobObj, c.steps);
      return finish(ui, c);
    }
  }

  async function build() {
    const r = repo || find();
    if (!r) return Toast.show('error', 'Pilih repo dari daftar dulu.');
    const name = $('#apkName').value.trim(), id = $('#apkId').value.trim();
    if (!name) return Toast.show('error', 'Isi nama aplikasi.');
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(id)) return Toast.show('error', 'Package ID tidak valid. Contoh: com.sukizy.app');
    if (!(r.permissions && r.permissions.push)) return Toast.show('error', 'Kamu tidak punya izin tulis ke repo ini.');
    const tpl = $('#apkTpl').value, url = $('#apkUrl').value.trim();
    if (tpl === 'url' && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(url)) return Toast.show('error', 'Isi URL website yang valid, contoh: https://situsmu.github.io/repo/');
    const my = ++job, btn = $('#apkGo'), ui = initRun(); btn.disabled = true; btn.classList.add('loading');
    try {
      if (tpl !== 'repo' && tpl !== 'url' && !(await installTemplate(r, tpl, ui))) { ui.label.textContent = 'Dibatalkan'; return; }
      ui.label.textContent = 'Memasang workflow…';
      if (await ensureWorkflow(r)) Toast.show('success', 'Workflow dipasang di branch ' + r.default_branch + '.');
      ui.label.textContent = 'Memulai build…';
      const since = Date.now();
      await dispatch(r, { app_name: name, app_id: id, web_url: tpl === 'url' ? url : '', permissions: window.SKperms ? SKperms.get().join(',') : 'INTERNET,ACCESS_NETWORK_STATE' });
      Toast.show('success', 'Build dimulai. Log tampil di bawah.');
      await track(r, since, my, ui);
    } catch (e) {
      ui.label.textContent = 'Gagal memulai build'; ui.label.className = 'bad'; ui.act.textContent = '';
      Toast.show('error', (e.status === 403 || e.status === 404 ? 'GitHub menolak. Pastikan token punya izin workflow dan Actions aktif di repo. ' : 'Gagal: ') + e.message, 9000);
    } finally { if (my === job) { btn.disabled = false; btn.classList.remove('loading'); } }
  }

  async function loadList() {
    const box = $('#apkList'); if (!repo) return; box.textContent = '';
    const r = repo;
    try {
      const rels = (await gh(`/repos/${r.full_name}/releases?per_page=30`)).filter((x) => /^apk-/.test(x.tag_name));
      if (!rels.length) { box.append(el('p', 'muted', 'Belum ada APK untuk repo ini.')); return; }
      rels.forEach((x) => {
        const a = x.assets.find((s) => /\.apk$/.test(s.name)), n = x.tag_name.replace('apk-', ''), row = el('div', 'hist-row');
        row.append(el('strong', null, x.name || x.tag_name), el('span', null, `${new Date(x.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}${a ? ' · ' + mb(a.size) : ''}`));
        const act = el('div', 'repo-act'), mk = (t, cls, fn) => { const b = el('button', cls, t); b.type = 'button'; b.onclick = fn; act.append(b); };
        if (a) mk('Unduh', 'sun sm', () => getApk(r, a));
        mk('Log', 'ghost sm', async () => {
          const t = await fetchAssetLog(r, n);
          t ? save(`build-log-${r.name}-${n}.txt`, t) : Toast.show('warn', 'Log build ini tidak tersedia.');
        });
        mk('Hapus', 'ghost sm dng', async () => {
          if (!(await Modal.open({ title: 'Hapus APK ini?', body: `${x.name || x.tag_name} akan dihapus dari Releases.`, confirmText: 'Hapus', danger: true }))) return;
          try { await gh(`/repos/${r.full_name}/releases/${x.id}`, 'DELETE'); try { await gh(`/repos/${r.full_name}/git/refs/tags/${x.tag_name}`, 'DELETE'); } catch (e) {} Toast.show('success', 'APK dihapus.'); loadList(); }
          catch (e) { Toast.show('error', 'Gagal menghapus: ' + e.message); }
        });
        row.append(act); box.append(row);
      });
    } catch (e) { box.append(el('p', 'muted', 'Gagal memuat daftar APK: ' + e.message)); }
  }

  $('#apkGo').addEventListener('click', build);
})();
