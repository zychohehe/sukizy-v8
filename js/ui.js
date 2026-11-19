/* Notifikasi toast & dialog konfirmasi. */
(function () {
  const box = document.createElement('div');
  box.className = 'toasts'; box.setAttribute('aria-live', 'polite');
  document.body.appendChild(box);
  const ICON = { success: '✓', error: '!', warn: '!', info: 'i' };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function show(type, text, ms) {
    ms = ms || (type === 'error' ? 6500 : 4000);
    const t = el('div', 'toast ' + type);
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const bar = el('i', 'tb'); bar.style.animationDuration = ms + 'ms';
    t.append(el('span', 'ti', ICON[type] || 'i'), el('span', 'tm', text), bar);
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    const close = () => { if (!t.isConnected) return; t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    t.addEventListener('click', close); setTimeout(close, ms);
  }

  function open(o) {
    return new Promise((res) => {
      const d = el('dialog', 'modal'), inner = el('div', 'minner');
      const body = el('div', 'mbody');
      typeof o.body === 'string' ? (body.textContent = o.body) : body.appendChild(o.body);
      let inp;
      if (o.expect) {
        inp = el('input'); inp.type = 'text'; inp.placeholder = o.expect; inp.autocomplete = 'off'; inp.spellcheck = false;
        body.appendChild(inp);
      }
      const act = el('div', 'mact');
      const no = el('button', 'ghost', o.cancelText || 'Batal'); no.type = 'button';
      const yes = el('button', o.danger ? 'danger' : 'primary', o.confirmText || 'Ya'); yes.type = 'button';
      if (o.expect) { yes.disabled = true; inp.oninput = () => { yes.disabled = inp.value.trim() !== o.expect; }; }
      no.onclick = () => d.close('no'); yes.onclick = () => d.close('yes');
      act.append(...(o.hideCancel ? [yes] : [no, yes]));
      inner.append(el('h3', null, o.title), body, act); d.appendChild(inner);
      d.addEventListener('click', (e) => { if (e.target === d) d.close('no'); });
      d.addEventListener('close', () => { res(d.returnValue === 'yes'); d.remove(); });
      document.body.appendChild(d); d.showModal(); (inp || yes).focus();
    });
  }
  window.Toast = { show }; window.Modal = { open };
})();
