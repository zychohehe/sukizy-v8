/* Sinkron akun GitHub: daftar repo, branch, dan riwayat push. */
(function () {
  if (!window.ME) return;
  const $ = (s) => document.querySelector(s);
  const T = ME.token, HK = 'sukizy_hist_' + ME.login;
  let repos = [];

  async function api(path) {
    const r = await fetch('https://api.github.com' + path, {
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + T },
    });
    if (r.status === 401) { Auth.logout(); throw new Error('401'); }
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  const fmt = (n) => n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

  async function loadRepos() {
    const info = $('#repoInfo'), btn = $('#sync');
    info.textContent = 'Menyinkronkan repo…'; btn.disabled = true;
    try {
      let all = [];
      for (let p = 1; p <= 5; p++) {
        const d = await api('/user/repos?per_page=100&sort=pushed&page=' + p);
        all = all.concat(d);
        if (d.length < 100) break;
      }
      repos = all;
      document.dispatchEvent(new CustomEvent('sukizy:repos', { detail: all }));
      const list = $('#repoList'); list.textContent = '';
      all.forEach((r) => {
        const o = document.createElement('option');
        o.value = r.full_name; o.label = (r.private ? '🔒 ' : '') + r.full_name;
        list.appendChild(o);
      });
      info.textContent = `${all.length} repo tersinkron dari @${ME.login}. Ketuk kolom untuk memilih.`;
    } catch (e) {
      document.dispatchEvent(new CustomEvent('sukizy:repos', { detail: null }));
      info.textContent = 'Gagal menyinkronkan repo. Kamu tetap bisa mengisi owner dan nama repo manual.';
    }
    btn.disabled = false;
  }

  async function pickRepo(name) {
    const r = repos.find((x) => x.full_name.toLowerCase() === name.trim().toLowerCase());
    if (!r) return;
    $('#owner').value = r.owner.login; $('#repo').value = r.name; $('#branch').value = r.default_branch;
    const ex = document.querySelector('input[name="mode"][value="existing"]');
    ex.checked = true; ex.dispatchEvent(new Event('change'));
    $('#repoInfo').textContent = `Terpilih: ${r.full_name}${r.private ? ' (private)' : ''}, branch ${r.default_branch}.`;
    try {
      const bl = $('#branchList'); bl.textContent = '';
      (await api(`/repos/${r.full_name}/branches?per_page=100`)).forEach((b) => {
        const o = document.createElement('option'); o.value = b.name; bl.appendChild(o);
      });
    } catch (e) { /* daftar branch opsional */ }
  }

  const hist = () => { try { return JSON.parse(localStorage.getItem(HK)) || []; } catch (e) { return []; } };
  function renderHist() {
    const h = hist(), box = $('#hist');
    box.textContent = '';
    if (!h.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Belum ada push. Upload ZIP pertamamu lewat tab Upload ZIP.'; box.appendChild(p); }
    h.forEach((x) => {
      const row = document.createElement('div'); row.className = 'hist-row';
      const a = document.createElement('a'); a.href = x.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = `${x.repo} · ${x.branch}`;
      const m = document.createElement('span');
      m.textContent = `${x.files} file, ${fmt(x.size)} · ${x.sha} · ${new Date(x.t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`;
      row.append(a, m); box.appendChild(row);
    });
  }

  $('#repoSearch').addEventListener('input', (e) => pickRepo(e.target.value));
  $('#repoSearch').addEventListener('change', (e) => pickRepo(e.target.value));
  $('#sync').addEventListener('click', loadRepos);
  $('#histClear').addEventListener('click', () => { localStorage.removeItem(HK); renderHist(); });
  document.addEventListener('sukizy:pushed', (e) => {
    localStorage.setItem(HK, JSON.stringify([{ ...e.detail, t: Date.now() }, ...hist()].slice(0, 10)));
    renderHist(); loadRepos();
    Toast.show('success', `${e.detail.changed != null ? e.detail.changed : e.detail.files} file diunggah ke ${e.detail.repo}.`);
  });

  renderHist(); loadRepos();
})();
