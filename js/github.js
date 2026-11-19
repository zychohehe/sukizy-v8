/* Klien GitHub: semua file di-push dalam satu commit lewat Git Data API. */
(function () {
  const API = 'https://api.github.com';

  class GitHubError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  function explain(res, data) {
    const msg = (data && data.message) || res.statusText || 'Terjadi kesalahan';
    if (res.status === 401) return 'Token tidak valid atau sudah kedaluwarsa.';
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
        const jam = reset ? new Date(reset).toLocaleTimeString('id-ID') : 'nanti';
        return 'Batas request GitHub tercapai. Coba lagi sekitar pukul ' + jam + '.';
      }
      if (/rate limit|abuse|secondary/i.test(msg)) {
        return 'GitHub membatasi request sementara. Tunggu satu menit lalu coba lagi.';
      }
      return 'Akses ditolak. Pastikan token punya izin tulis ke repo ini. (' + msg + ')';
    }
    if (res.status === 404) return 'Tidak ditemukan. Periksa owner dan nama repo, atau token belum punya akses ke repo ini.';
    if (res.status === 409) return 'Konflik di GitHub: ' + msg;
    if (res.status === 422) return 'GitHub menolak data: ' + msg;
    return msg;
  }

  async function request(token, path, opts) {
    const { method = 'GET', body } = opts || {};
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new GitHubError('Tidak bisa terhubung ke api.github.com. Periksa koneksi internet.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* respons kosong */ }
    if (!res.ok) {
      const err = new GitHubError(explain(res, data), res.status);
      err.retryAfter = Number(res.headers.get('retry-after')) || 0;
      err.resetAt = res.headers.get('x-ratelimit-remaining') === '0' ? Number(res.headers.get('x-ratelimit-reset')) * 1000 : 0;
      err.rate = res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit|abuse|secondary/i.test((data && data.message) || '')));
      throw err;
    }
    return data;
  }

  function toBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  async function runPool(items, limit, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    });
    await Promise.all(runners);
  }

  const getUser = (token) => request(token, '/user');

  async function createRepo(token, { owner, login, name, isPrivate }) {
    const body = { name, private: isPrivate, auto_init: true, description: 'Dibuat dari ZIP ke GitHub' };
    const path = owner.toLowerCase() === login.toLowerCase()
      ? '/user/repos'
      : '/orgs/' + encodeURIComponent(owner) + '/repos';
    return request(token, path, { method: 'POST', body });
  }

  async function findRef(token, owner, repo, branch) {
    try {
      return await request(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    } catch (e) {
      if (e.status === 404 || e.status === 409) return null;
      throw e;
    }
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const MB = 1024 * 1024, HARD_LIMIT = 100 * MB - 1;
  const fmt = (n) => (n < MB ? (n / 1024).toFixed(0) + ' KB' : (n / MB).toFixed(1) + ' MB');

  /* SHA-1 gaya git: dipakai untuk melewati file yang sudah identik di repo. */
  async function gitSha(bytes) {
    try {
      const head = enc.encode('blob ' + bytes.length + '\0');
      const buf = new Uint8Array(head.length + bytes.length);
      buf.set(head); buf.set(bytes, head.length);
      const d = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
      return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
  }
  const b64 = (bytes) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(new GitHubError('Gagal membaca file.', 0));
    fr.readAsDataURL(new Blob([bytes]));
  });

  /* Jeda bersama: begitu GitHub membatasi request, semua pekerja menunggu bersama lalu lanjut sendiri. */
  let pauseUntil = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function retry(fn, log, noTransient) {
    for (let n = 0; ; n++) {
      const w = pauseUntil - Date.now();
      if (w > 0) await sleep(w);
      try { return await fn(); } catch (e) {
        const transient = !noTransient && (e.status === 0 || e.status >= 500);
        if (!(transient || e.rate) || n >= (e.rate ? 12 : 6)) throw e;
        let wait;
        if (e.rate) {
          wait = e.resetAt ? e.resetAt - Date.now() + 1500 : Math.max((e.retryAfter || 0) * 1000, 61000);
          if (wait > 10 * 60 * 1000) throw e;
          if (Date.now() + wait > pauseUntil + 1000) log(`Batas request GitHub tercapai. Menunggu ${Math.ceil(wait / 1000)} dtk, lalu lanjut otomatis…`, 'warn');
          pauseUntil = Math.max(pauseUntil, Date.now() + wait);
        } else {
          wait = Math.min(1000 * 2 ** n, 30000);
          log(`GitHub sibuk, mencoba lagi dalam ${Math.round(wait / 1000)} dtk…`, 'warn');
        }
        await sleep(wait);
      }
    }
  }

  /**
   * Push semua file dalam satu commit, tanpa batas jumlah file.
   * Cepat: file identik dilewati, teks dikirim inline, sisanya diunggah paralel.
   */
  async function pushFiles(opts) {
    const { token, owner, repo, branch, message, files, replace, onLog, onProgress } = opts;
    const base = `/repos/${owner}/${repo}`;
    const log = onLog || (() => {});
    const req = (path, o) => retry(() => request(token, path, o), log);

    log('Membaca info repo…');
    const info = await req(base);
    const defaultBranch = info.default_branch || 'main';

    let ref = await findRef(token, owner, repo, branch);
    let branchExists = !!ref;
    if (!ref) {
      let defRef = await findRef(token, owner, repo, defaultBranch);
      if (!defRef) {
        log('Repo masih kosong, membuat commit awal…', 'warn');
        await req(`${base}/contents/.gitkeep`, { method: 'PUT', body: { message: 'Inisialisasi repo', content: '' } });
        defRef = await findRef(token, owner, repo, defaultBranch);
        if (!defRef) throw new GitHubError('Gagal menginisialisasi repo kosong.', 409);
        if (branch === defaultBranch) { ref = defRef; branchExists = true; }
      }
      if (!ref) { log(`Branch "${branch}" belum ada, dibuat dari "${defaultBranch}".`, 'warn'); ref = defRef; }
    }

    const parentSha = ref.object.sha;
    const parent = await req(`${base}/git/commits/${parentSha}`);
    const baseTreeSha = parent.tree.sha;

    // Peta isi repo saat ini, untuk melewati file yang tidak berubah.
    const remote = new Map(), known = new Set();
    let remoteKnown = false;
    try {
      const t = await req(`${base}/git/trees/${baseTreeSha}?recursive=1`);
      if (!t.truncated) { remoteKnown = true; t.tree.forEach((x) => { if (x.type === 'blob') { remote.set(x.path, x.sha); known.add(x.sha); } }); }
      else log('Repo sangat besar, pengecekan file identik dilewati.', 'warn');
    } catch (e) { /* tanpa pengecekan */ }

    log(`Memproses ${files.length} file…`);
    const entries = [], tooBig = [], paths = new Set(files.map((f) => f.path));
    const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
    let done = 0, doneBytes = 0, changed = 0, skipped = 0;
    const t0 = Date.now();
    const tick = () => {
      const sp = doneBytes / ((Date.now() - t0) / 1000 || 1), rem = sp > 0 ? (totalBytes - doneBytes) / sp : 0;
      if (onProgress) onProgress(done, files.length, { label: `${done}/${files.length} file · ${fmt(sp)}/dtk${rem > 2 ? ' · sisa ~' + Math.ceil(rem) + ' dtk' : ''}` });
    };
    const entry = (path, extra) => ({ path, mode: '100644', type: 'blob', ...extra });

    await runPool(files.slice().sort((a, b) => b.size - a.size), 6, async (f) => {
      const bytes = await f.getData();
      if (bytes.length > HARD_LIMIT) {
        tooBig.push(f.path); log(`"${f.path}" (${fmt(bytes.length)}) melebihi batas 100 MB GitHub, dilewati.`, 'warn');
      } else {
        const sha = bytes.length <= 50 * MB ? await gitSha(bytes) : null;
        if (sha && known.has(sha)) {
          if (remote.get(f.path) === sha) { skipped++; if (replace) entries.push(entry(f.path, { sha })); }
          else { changed++; entries.push(entry(f.path, { sha })); }
        } else {
          let text = null;
          if (bytes.length <= 256 * 1024) { try { const s = dec.decode(bytes); if (!s.includes('\0')) text = s; } catch (e) { /* biner */ } }
          if (text !== null) entries.push(entry(f.path, { content: text }));
          else {
            const blob = await req(`${base}/git/blobs`, { method: 'POST', body: { content: await b64(bytes), encoding: 'base64' } });
            entries.push(entry(f.path, { sha: blob.sha }));
          }
          changed++;
        }
      }
      done++; doneBytes += bytes.length; tick();
    });

    const removing = replace && remoteKnown && [...remote.keys()].some((p) => !paths.has(p));
    if (!entries.length || (!changed && !removing)) return { unchanged: true, skipped, changed: 0, tooBig };

    log(`Menyusun tree (${entries.length} file)…`);
    let treeSha = replace ? null : baseTreeSha, i = 0, n = 120, fails = 0;
    while (i < entries.length) {
      const chunk = []; let sz = 0, j = i;
      while (j < entries.length && chunk.length < n && sz < MB) { const e = entries[j++]; chunk.push(e); sz += (e.content ? e.content.length : 120) + e.path.length; }
      try {
        const t = await retry(() => request(token, `${base}/git/trees`, { method: 'POST', body: treeSha ? { base_tree: treeSha, tree: chunk } : { tree: chunk } }), log, true);
        treeSha = t.sha; i = j; fails = 0; n = Math.min(300, Math.ceil(n * 1.25));
        if (onProgress) onProgress(files.length, files.length, { label: `Menyusun tree ${i}/${entries.length}…` });
      } catch (e) {
        if (e.rate || !(e.status === 0 || e.status >= 500) || (n <= 10 && ++fails > 5)) throw e;
        n = Math.max(10, Math.floor(n / 2));
        log(`Tree terlalu berat untuk GitHub, memperkecil batch ke ${n} file…`, 'warn');
        await sleep(1500);
      }
    }

    log('Membuat commit…');
    const commit = await req(`${base}/git/commits`, { method: 'POST', body: { message, tree: treeSha, parents: [parentSha] } });

    log('Memperbarui branch…');
    if (branchExists) await req(`${base}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    else await req(`${base}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });

    return { commitSha: commit.sha, repoUrl: info.html_url, branchUrl: `${info.html_url}/tree/${branch}`, changed, skipped, tooBig };
  }

  window.GH = { GitHubError, getUser, createRepo, pushFiles };
})();
