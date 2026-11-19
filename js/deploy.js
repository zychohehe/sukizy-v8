/* Deploy Website ke GitHub Pages: mode branch (cepat) atau GitHub Actions (otomatis tiap push). */
(function () {
  if (!window.ME) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gh = window.SKgh, WF = 'sukizy-deploy-pages.yml', PATH = '.github/workflows/' + WF;
  const enc = (s) => btoa(unescape(encodeURIComponent(s)));
  const dec = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
  let repo = null, job = 0;

  const find = () => { const n = $('#depRepo').value.trim().toLowerCase(); return (window.SKrepos || []).find((r) => r.full_name.toLowerCase() === n) || null; };
  const mode = () => document.querySelector('input[name="depMode"]:checked').value;
  const mk = (txt, cls, fn) => { const b = el('button', cls, txt); b.type = 'button'; b.onclick = fn; return b; };

  /* ---------- tampilan form ---------- */
  function modeChange() {
    const m = mode(), sel = $('#depFolder');
    $('#depAutoRow').hidden = m !== 'actions';
    [...sel.options].forEach((o) => { o.disabled = m === 'branch' && o.value !== '/' && o.value !== 'docs'; });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = '/';
    $('#depHint').textContent = m === 'actions'
      ? 'GitHub Actions menyalin folder situs lalu mempublikasikannya. Bisa pakai folder apa saja (dist, public, build) dan deploy otomatis tiap push.'
      : 'GitHub Pages menyajikan langsung dari branch utama. Paling cepat dan sederhana; folder hanya root atau docs.';
  }
  document.querySelectorAll('input[name="depMode"]').forEach((r) => r.addEventListener('change', modeChange));
  modeChange();

  /* ---------- status Pages ---------- */
  async function pageInfo(r) {
    try { return await gh(`/repos/${r.full_name}/pages`); }
    catch (e) { if (e.status === 404) return null; throw e; }
  }

  function renderStatus(p) {
    const box = $('#depStatus'); box.textContent = '';
    if (!repo) { box.hidden = true; return; }
    box.hidden = false;
    if (!p) { box.append(el('p', 'muted', 'GitHub Pages belum aktif untuk repo ini. Atur opsi di bawah lalu tekan Deploy sekarang.')); return; }
    const top = el('div', 'dep-top'), a = el('a', 'dep-url', p.html_url);
    a.href = p.html_url; a.target = '_blank'; a.rel = 'noopener';
    const st = { built: ['ok', 'Aktif'], building: ['', 'Membangun'], errored: ['err', 'Error'] }[p.status] || ['', p.status || 'Menunggu build'];
    top.append(a, el('span', 'badge ' + st[0], st[1]));
    const legacy = p.build_type !== 'workflow';
    const meta = el('p', 'muted', legacy ? `Mode: branch ${p.source ? p.source.branch + p.source.path : ''}` : 'Mode: GitHub Actions');
    const act = el('div', 'dep-act');
    act.append(
      mk('Salin URL', 'ghost sm', () => navigator.clipboard.writeText(p.html_url).then(() => Toast.show('success', 'URL situs disalin.'), () => Toast.show('error', 'Gagal menyalin.'))),
      mk('Jadikan APK', 'ghost sm', () => toApk(repo, p.html_url)),
      mk('Matikan', 'ghost sm dng', () => disable(repo))
    );
    box.append(top, meta, act);
    // Samakan form dengan konfigurasi yang sedang aktif.
    const radio = document.querySelector(`input[name="depMode"][value="${legacy ? 'branch' : 'actions'}"]`);
    if (radio) { radio.checked = true; modeChange(); }
    if (legacy && p.source) $('#depFolder').value = p.source.path === '/docs' ? 'docs' : '/';
  }

  async function loadStatus() {
    if (!repo) return renderStatus(null);
    const box = $('#depStatus'); box.hidden = false; box.textContent = ''; box.append(el('p', 'muted', 'Memeriksa status…'));
    const r = repo;
    try { const p = await pageInfo(r); if (r === repo) renderStatus(p); }
    catch (e) { if (r === repo) { box.textContent = ''; box.append(el('p', 'muted', 'Gagal memuat status Pages: ' + e.message)); } }
  }

  function onRepo() {
    const r = find();
    if (r && repo && r.full_name === repo.full_name) return;
    repo = r; $('#depRun').hidden = true; loadStatus();
  }
  ['input', 'change'].forEach((t) => $('#depRepo').addEventListener(t, onRepo));

  /* ---------- aksi status ---------- */
  async function disable(r) {
    if (!(await Modal.open({ title: 'Matikan website?', body: 'Situs tidak bisa diakses lagi. File di repo tetap aman dan situs bisa diaktifkan lagi kapan saja.', confirmText: 'Matikan', danger: true }))) return;
    try { await gh(`/repos/${r.full_name}/pages`, 'DELETE'); Toast.show('success', 'GitHub Pages dimatikan.'); loadStatus(); }
    catch (e) { Toast.show('error', 'Gagal mematikan: ' + e.message); }
  }

  function toApk(r, url) {
    const i = $('#apkRepo'); i.value = r.full_name; i.dispatchEvent(new Event('change'));
    const t = $('#apkTpl'); t.value = 'url'; t.dispatchEvent(new Event('change'));
    $('#apkUrl').value = url; window.SKview('apk');
    Toast.show('info', 'URL situs sudah terisi. Tekan Build APK.');
  }

  /* ---------- tampilan proses ---------- */
  function initRun() {
    const box = $('#depRun'); box.hidden = false; box.textContent = '';
    const head = el('div', 'run-head'), label = el('strong', null, 'Menyiapkan…'), lg = el('a', 'link', 'Buka di GitHub');
    lg.target = '_blank'; lg.rel = 'noopener'; lg.hidden = true; head.append(label, lg);
    const bar = el('div', 'bar'), fill = el('div'); bar.append(fill);
    const ul = el('ul', 'steps'), act = el('div', 'run-act');
    box.append(head, bar, ul, act);
    return { label, lg, fill, ul, act };
  }
  function setSteps(ui, steps) {
    ui.ul.textContent = '';
    steps.forEach((s) => ui.ul.append(el('li', 's-' + (s.conclusion || s.status), ({ success: '✓', failure: '✕', skipped: '–' }[s.conclusion] || (s.status === 'in_progress' ? '●' : '○')) + ' ' + s.name)));
  }
  function fail(ui, e) {
    const m = String((e && e.message) || e);
    let text;
    if (/plan|upgrade|private/i.test(m) && /pages/i.test(m)) text = 'Repo private butuh paket GitHub berbayar untuk Pages. Jadikan repo public (Repo saya → Lainnya) atau upgrade paket.';
    else if (e && (e.status === 403 || e.status === 404)) text = 'GitHub menolak. Pastikan kamu admin repo ini dan token punya izin repo (mode Actions juga butuh workflow). ' + m;
    else text = m;
    ui.label.textContent = 'Deploy gagal'; ui.label.className = 'bad'; ui.act.textContent = ''; ui.act.append(el('p', 'muted', text));
    Toast.show('error', 'Deploy gagal. ' + text, 9000);
  }

  async function done(r, ui) {
    let p = null;
    for (let i = 0; i < 5; i++) { try { p = await pageInfo(r); } catch (e) { /* coba lagi */ } if (p && p.html_url) break; await sleep(2000); }
    ui.fill.style.width = '100%'; ui.label.textContent = 'Situs aktif'; ui.label.className = ''; ui.act.textContent = '';
    if (p && p.html_url) {
      const a = el('a', 'dl', 'Buka situs'); a.href = p.html_url; a.target = '_blank'; a.rel = 'noopener';
      ui.act.append(a, mk('Jadikan APK', 'ghost', () => toApk(r, p.html_url)),
        el('p', 'muted', 'Kalau halaman belum muncul, tunggu sekitar satu menit lalu muat ulang (cache GitHub).'));
    }
    Toast.show('success', 'Website berhasil di-deploy!', 6000);
    if (repo && repo.full_name === r.full_name) renderStatus(p);
  }

  /* ---------- Pages & workflow ---------- */
  async function enablePages(r, body) {
    try { await gh(`/repos/${r.full_name}/pages`, 'POST', body); return true; }
    catch (e) { if (e.status !== 409) throw e; await gh(`/repos/${r.full_name}/pages`, 'PUT', body); return false; }
  }
  async function hasIndex(r, folder) {
    const p = (folder === '/' ? '' : folder + '/') + 'index.html';
    try { await gh(`/repos/${r.full_name}/contents/${p}?ref=${encodeURIComponent(r.default_branch)}`); return true; }
    catch (e) { return !(e.status === 404 || e.status === 409); }
  }
  async function ensureWorkflow(r, yml) {
    let sha;
    try {
      const f = await gh(`/repos/${r.full_name}/contents/${PATH}?ref=${encodeURIComponent(r.default_branch)}`);
      sha = f.sha; if (dec(f.content) === yml) return false;
    } catch (e) { if (e.status !== 404) throw e; }
    await gh(`/repos/${r.full_name}/contents/${PATH}`, 'PUT', { message: 'Tambah workflow Deploy Website (SUKIZY)', content: enc(yml), branch: r.default_branch, sha });
    return true;
  }
  async function dispatch(r) {
    for (let i = 0; ; i++) {
      try { return await gh(`/repos/${r.full_name}/actions/workflows/${WF}/dispatches`, 'POST', { ref: r.default_branch }); }
      catch (e) { if (i < 6 && (e.status === 404 || e.status === 422)) { await sleep(3000); continue; } throw e; }
    }
  }

  /* ---------- mode branch ---------- */
  async function waitBuild(r, ui, my) {
    for (let i = 0; i < 60 && my === job; i++) {
      await sleep(i ? 4000 : 2500);
      ui.fill.style.width = Math.min(90, 10 + i * 4) + '%';
      let b; try { b = await gh(`/repos/${r.full_name}/pages/builds/latest`); } catch (e) { continue; }
      if (b.status === 'built') return b;
      if (b.status === 'errored') throw new Error((b.error && b.error.message) || 'Build GitHub Pages gagal.');
      ui.label.textContent = 'Membangun situs…';
    }
    if (my === job) throw new Error('Build terlalu lama. Cek tab Actions di repo lalu coba lagi.');
    return null;
  }
  async function viaBranch(r, folder, ui, my) {
    ui.label.textContent = 'Mengaktifkan GitHub Pages…';
    const created = await enablePages(r, { build_type: 'legacy', source: { branch: r.default_branch, path: folder === '/' ? '/' : '/docs' } });
    if (!created) { try { await gh(`/repos/${r.full_name}/pages/builds`, 'POST'); } catch (e) { /* build otomatis tetap jalan */ } }
    ui.label.textContent = 'Membangun situs…';
    if (await waitBuild(r, ui, my)) await done(r, ui);
  }

  /* ---------- mode Actions ---------- */
  async function track(r, since, my, ui) {
    let run = null;
    ui.act.textContent = '';
    for (let i = 0; i < 200 && my === job; i++) {
      await sleep(i ? 4000 : 3000);
      const d = await gh(`/repos/${r.full_name}/actions/workflows/${WF}/runs?event=workflow_dispatch&per_page=5`);
      const f = d.workflow_runs.find((x) => new Date(x.created_at).getTime() >= since - 30000);
      if (!f) continue;
      if (!run) {
        const cancel = mk('Batalkan', 'ghost sm dng', async () => { try { await gh(`/repos/${r.full_name}/actions/runs/${f.id}/cancel`, 'POST'); Toast.show('warn', 'Permintaan batal dikirim.'); } catch (e) { Toast.show('error', 'Gagal membatalkan: ' + e.message); } });
        ui.act.append(cancel);
      }
      run = f; ui.lg.href = run.html_url; ui.lg.hidden = false;
      let steps = [];
      try { const j = await gh(`/repos/${r.full_name}/actions/runs/${run.id}/jobs`); steps = (j.jobs[0] && j.jobs[0].steps) || []; } catch (e) { /* coba lagi */ }
      setSteps(ui, steps);
      const fin = steps.filter((s) => s.status === 'completed').length;
      ui.fill.style.width = (run.status === 'completed' ? 100 : steps.length ? (fin / steps.length) * 100 : 5) + '%';
      ui.label.textContent = run.status === 'completed' ? 'Selesai' : run.status === 'queued' || run.status === 'waiting' ? 'Mengantre di GitHub…' : 'Sedang deploy…';
      if (run.status === 'completed') { run.steps = steps; return run; }
    }
    return null;
  }
  async function viaActions(r, folder, auto, ui, my) {
    ui.label.textContent = 'Memasang workflow…';
    if (await ensureWorkflow(r, window.pagesYml({ branch: r.default_branch, folder, auto }))) Toast.show('success', 'Workflow dipasang di branch ' + r.default_branch + '.');
    ui.label.textContent = 'Mengaktifkan GitHub Pages…';
    await enablePages(r, { build_type: 'workflow' });
    ui.label.textContent = 'Memulai deploy…';
    const since = Date.now();
    await dispatch(r);
    const run = await track(r, since, my, ui);
    if (!run) return;
    if (run.conclusion === 'success') return done(r, ui);
    ui.label.textContent = run.conclusion === 'cancelled' ? 'Deploy dibatalkan' : 'Deploy gagal'; ui.label.className = 'bad';
    ui.act.textContent = '';
    if (run.conclusion !== 'cancelled') {
      const bad = (run.steps || []).find((s) => s.conclusion === 'failure');
      ui.act.append(el('p', 'muted', (bad ? `Gagal di langkah “${bad.name}”. ` : '') + 'Buka tautan GitHub di atas untuk log lengkap. Pastikan Settings → Pages → Source = GitHub Actions dan Actions aktif di repo.'));
      Toast.show('error', 'Deploy gagal. Lihat langkah yang merah di bawah.', 8000);
    }
  }

  /* ---------- tombol deploy ---------- */
  async function deploy() {
    const r = repo || find();
    if (!r) return Toast.show('error', 'Pilih repo dari daftar dulu.');
    if (!(r.permissions && r.permissions.push)) return Toast.show('error', 'Kamu tidak punya izin tulis ke repo ini.');
    repo = r;
    const m = mode(), folder = $('#depFolder').value, auto = $('#depAuto').checked, btn = $('#depGo');
    if (!(await hasIndex(r, folder)) && !(await Modal.open({ title: 'index.html tidak ditemukan', body: `Tidak ada index.html di ${folder === '/' ? 'root' : folder + '/'} branch ${r.default_branch}. Situs bisa tampil 404. Tetap deploy?`, confirmText: 'Tetap deploy' }))) return;
    const my = ++job, ui = initRun(); btn.disabled = true; btn.classList.add('loading');
    try { await (m === 'branch' ? viaBranch(r, folder, ui, my) : viaActions(r, folder, auto, ui, my)); }
    catch (e) { fail(ui, e); }
    finally { if (my === job) { btn.disabled = false; btn.classList.remove('loading'); } }
  }
  $('#depGo').addEventListener('click', deploy);
})();
