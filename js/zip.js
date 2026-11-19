/* Ekstrak ZIP di browser dan rapikan struktur foldernya. */
(function () {
  const IGNORED = new Set(['__MACOSX', '.DS_Store', 'Thumbs.db', 'node_modules', 'desktop.ini']);

  /** Baca ZIP, buang file sampah, kembalikan daftar file mentah. */
  async function readZip(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
    }
    const zip = await JSZip.loadAsync(file);
    const files = [];
    zip.forEach((relPath, entry) => {
      if (entry.dir) return;
      const segs = relPath.replace(/\\/g, '/').split('/')
        .filter((s) => s && s !== '.' && s !== '..');
      if (!segs.length || segs.some((s) => IGNORED.has(s))) return;
      files.push({
        segs,
        size: (entry._data && entry._data.uncompressedSize) || 0,
        getData: () => entry.async('uint8array'),
      });
    });
    return files;
  }

  /**
   * Jika semua file berada di satu folder pembungkus, buang folder itu.
   * Mengembalikan { files: [{path,size,getData}], removed: string|null }.
   */
  function normalize(rawFiles, stripRoot) {
    let removed = null;
    let list = rawFiles.map((f) => ({ ...f, segs: f.segs.slice() }));

    if (stripRoot && list.length) {
      const first = list[0].segs[0];
      const wrapped = list.every((f) => f.segs.length > 1 && f.segs[0] === first);
      if (wrapped) {
        removed = first;
        list.forEach((f) => f.segs.shift());
      }
    }

    const seen = new Set();
    const files = [];
    for (const f of list) {
      const path = f.segs.join('/');
      if (seen.has(path)) continue;
      seen.add(path);
      files.push({ path, size: f.size, getData: f.getData });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, removed };
  }

  window.ZipTools = { readZip, normalize };
})();
