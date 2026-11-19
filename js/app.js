/* Logika antarmuka: pilih ZIP, pratinjau tree, lalu push. */
(function () {
  const $ = (s) => document.querySelector(s);
  const el = {
    owner: $('#owner'), repo: $('#repo'),
    branch: $('#branch'), message: $('#message'),
    privateRow: $('#privateRow'), isPrivate: $('#isPrivate'),
    drop: $('#drop'), dropTitle: $('#dropTitle'), dropSub: $('#dropSub'), zipInput: $('#zipInput'),
    stripRoot: $('#stripRoot'), replaceAll: $('#replaceAll'),
    reviewCard: $('#reviewCard'), summary: $('#summary'), tree: $('#tree'),
    selAll: $('#selAll'), selNone: $('#selNone'),
    pushBtn: $('#pushBtn'), bar: $('#bar'), barFill: $('#barFill'), barText: $('#barText'),
    result: $('#result'), log: $('#log'),
  };

  const state = { raw: [], files: [], selected: new Set(), removedRoot: null, busy: false };
  let folderUI = [];

  /* ---------- util ---------- */
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function log(text, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = new Date().toLocaleTimeString('id-ID') + '  ' + text;
    el.log.appendChild(d);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function mode() {
    return document.querySelector('input[name="mode"]:checked').value;
  }

  function setProgress(done, total, label) {
    el.bar.hidden = false;
    el.barFill.style.width = (total ? (done / total) * 100 : 0) + '%';
    el.barText.textContent = label || `${done} dari ${total} file terunggah`;
  }

  /* ---------- ZIP ---------- */
  async function handleZip(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      log('File harus berekstensi .zip', 'err');
      return;
    }
    el.dropTitle.textContent = 'Membaca ' + file.name + '…';
    try {
      state.raw = await ZipTools.readZip(file);
    } catch (e) {
      el.dropTitle.textContent = 'Tarik file .zip ke sini';
      log('Gagal membaca ZIP: ' + e.message, 'err');
      return;
    }
    el.drop.classList.add('has-file');
    el.dropTitle.textContent = file.name;
    el.dropSub.textContent = fmtSize(file.size) + ' · ketuk untuk mengganti';

    if (mode() === 'new' || !el.repo.value.trim()) {
      el.repo.value = file.name.replace(/\.zip$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    }
    rebuild();
    Toast.show('success', `${state.files.length} file siap di-push dari ${file.name}.`);
  }

  function rebuild() {
    const { files, removed } = ZipTools.normalize(state.raw, el.stripRoot.checked);
    state.files = files;
    state.removedRoot = removed;
    state.selected = new Set(files.map((f) => f.path));
    renderTree();
    updateSummary();
  }

  /* ---------- tree ---------- */
  function buildTree(files) {
    const root = { name: '', dirs: new Map(), files: [] };
    for (const f of files) {
      const segs = f.path.split('/');
      let node = root;
      for (let i = 0; i < segs.length - 1; i++) {
        if (!node.dirs.has(segs[i])) node.dirs.set(segs[i], { name: segs[i], dirs: new Map(), files: [] });
        node = node.dirs.get(segs[i]);
      }
      node.files.push({ name: segs[segs.length - 1], path: f.path, size: f.size });
    }
    return root;
  }

  function collect(node, out) {
    node.files.forEach((f) => out.push(f.path));
    node.dirs.forEach((d) => collect(d, out));
    return out;
  }

  function renderNode(node, parent, depth) {
    [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((dir) => {
      const details = document.createElement('details');
      details.open = depth < 1;
      const summary = document.createElement('summary');
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const name = document.createElement('span');
      name.className = 'dir';
      name.textContent = dir.name + '/';
      const count = document.createElement('span');
      count.className = 'n';
      label.append(cb, name, count);
      summary.appendChild(label);
      details.appendChild(summary);

      label.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        collect(dir, []).forEach((p) => (cb.checked ? state.selected.add(p) : state.selected.delete(p)));
        syncChecks();
      });

      folderUI.push({ cb, count, paths: collect(dir, []) });
      renderNode(dir, details, depth + 1);
      parent.appendChild(details);
    });

    if (node.files.length) {
      const ul = document.createElement('ul');
      node.files.sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => {
        const li = document.createElement('li');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.path = f.path;
        cb.addEventListener('change', () => {
          cb.checked ? state.selected.add(f.path) : state.selected.delete(f.path);
          syncChecks();
        });
        const name = document.createElement('span');
        name.className = 'fname';
        name.textContent = f.name;
        const sz = document.createElement('span');
        sz.className = 'sz';
        sz.textContent = fmtSize(f.size);
        label.append(cb, name, sz);
        li.appendChild(label);
        ul.appendChild(li);
      });
      parent.appendChild(ul);
    }
  }

  function renderTree() {
    el.tree.textContent = '';
    folderUI = [];
    el.reviewCard.hidden = state.files.length === 0;
    renderNode(buildTree(state.files), el.tree, 0);
    syncChecks();
  }

  function syncChecks() {
    el.tree.querySelectorAll('input[data-path]').forEach((cb) => {
      cb.checked = state.selected.has(cb.dataset.path);
    });
    folderUI.forEach(({ cb, count, paths }) => {
      const n = paths.filter((p) => state.selected.has(p)).length;
      cb.checked = n === paths.length;
      cb.indeterminate = n > 0 && n < paths.length;
      count.textContent = `(${n}/${paths.length})`;
    });
    updateSummary();
  }

  function updateSummary() {
    const picked = state.files.filter((f) => state.selected.has(f.path));
    const total = picked.reduce((s, f) => s + f.size, 0);
    let text = `${picked.length} dari ${state.files.length} file dipilih (${fmtSize(total)}).`;
    if (state.removedRoot) text += ` Folder pembungkus "${state.removedRoot}/" dihapus.`;
    el.summary.textContent = text;
    el.pushBtn.disabled = state.busy || picked.length === 0;
  }

  /* ---------- push ---------- */
  async function push() {
    const token = ME.token;
    const branch = el.branch.value.trim() || 'main';
    const repo = el.repo.value.trim();
    const message = el.message.value.trim() || 'Upload dari ZIP';
    const files = state.files.filter((f) => state.selected.has(f.path));

    el.result.hidden = true;
    el.result.className = 'result';
    if (!repo) return fail('Isi nama repo dulu.');
    if (!/^[A-Za-z0-9._-]+$/.test(repo)) return fail('Nama repo hanya boleh berisi huruf, angka, titik, strip, dan underscore.');
    if (!files.length) return fail('Belum ada file yang dipilih.');

    state.busy = true;
    el.pushBtn.disabled = true;
    el.pushBtn.textContent = 'Sedang memproses…';
    el.log.textContent = '';
    setProgress(0, files.length, 'Memeriksa token…');

    try {
      const user = await GH.getUser(token);
      const owner = el.owner.value.trim() || user.login;
      log(`Masuk sebagai ${user.login}.`);

      if (mode() === 'new') {
        log(`Membuat repo ${owner}/${repo}…`);
        await GH.createRepo(token, { owner, login: user.login, name: repo, isPrivate: el.isPrivate.checked });
        log('Repo dibuat.', 'ok');
      }

      const res = await GH.pushFiles({
        token, owner, repo, branch, message, files,
        replace: el.replaceAll.checked,
        onLog: log,
        onProgress: (d, t, i) => setProgress(d, t, i && i.label),
      });

      if (res.unchanged) {
        setProgress(files.length, files.length, 'Tidak ada perubahan.');
        log('Semua file identik dengan isi branch. Tidak ada commit baru.', 'ok');
        el.result.hidden = false; el.result.textContent = `Semua ${res.skipped} file sudah identik dengan isi branch, jadi tidak ada commit baru.`;
        Toast.show('info', 'Tidak ada perubahan untuk di-push.');
        return;
      }
      if (res.tooBig.length) Toast.show('warn', `${res.tooBig.length} file di atas 100 MB dilewati (batas GitHub).`, 8000);
      setProgress(files.length, files.length, 'Selesai.');
      document.dispatchEvent(new CustomEvent('sukizy:pushed', { detail: {
        repo: owner + '/' + repo, branch, url: res.branchUrl, sha: res.commitSha.slice(0, 7),
        changed: res.changed, skipped: res.skipped, files: files.length, size: files.reduce((s, f) => s + f.size, 0) } }));
      log('Commit ' + res.commitSha.slice(0, 7) + ' berhasil dibuat.', 'ok');
      el.result.hidden = false;
      el.result.textContent = '';
      const a = document.createElement('a');
      a.href = res.branchUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = res.branchUrl;
      el.result.append(`Berhasil di-push (${res.changed} diunggah, ${res.skipped} dilewati karena identik). Buka repo: `, a);
    } catch (e) {
      log(e.message, 'err');
      fail(e.message);
    } finally {
      state.busy = false;
      el.pushBtn.textContent = 'Push ke GitHub';
      updateSummary();
    }
  }

  function fail(text) {
    el.result.hidden = false;
    el.result.className = 'result error';
    el.result.textContent = text;
    if (window.Toast) Toast.show('error', text);
  }

  /* ---------- event ---------- */
  document.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener('change', () => { el.privateRow.hidden = mode() !== 'new'; }));

  el.drop.addEventListener('click', () => el.zipInput.click());
  el.drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.zipInput.click(); }
  });
  el.zipInput.addEventListener('change', () => handleZip(el.zipInput.files[0]));
  ['dragenter', 'dragover'].forEach((t) =>
    el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) =>
    el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.remove('over'); }));
  el.drop.addEventListener('drop', (e) => handleZip(e.dataTransfer.files[0]));

  el.stripRoot.addEventListener('change', () => { if (state.raw.length) rebuild(); });
  el.selAll.addEventListener('click', () => { state.selected = new Set(state.files.map((f) => f.path)); syncChecks(); });
  el.selNone.addEventListener('click', () => { state.selected.clear(); syncChecks(); });
  el.pushBtn.addEventListener('click', push);
})();
