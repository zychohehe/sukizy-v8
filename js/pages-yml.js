/* Pembuat workflow Deploy Website (GitHub Pages lewat GitHub Actions). */
window.pagesYml = function (o) {
  o = o || {};
  const branch = o.branch || 'main';
  const src = !o.folder || o.folder === '/' ? '.' : String(o.folder).replace(/[^A-Za-z0-9._-]/g, '');
  const L = ['name: Deploy Website (SUKIZY)', 'on:', '  workflow_dispatch:'];
  if (o.auto) L.push('  push:', '    branches: [' + JSON.stringify(branch) + ']');
  L.push(
    'permissions:', '  contents: read', '  pages: write', '  id-token: write',
    'concurrency:', '  group: pages', '  cancel-in-progress: false',
    'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    timeout-minutes: 15',
    '    environment:', '      name: github-pages', '      url: ${{ steps.deployment.outputs.page_url }}',
    '    steps:', '      - uses: actions/checkout@v4',
    '      - name: Siapkan folder situs', '        shell: bash', '        run: |',
    '          mkdir -p "$RUNNER_TEMP/site"',
    '          rsync -a --exclude=\'.git\' --exclude=\'.github\' --exclude=\'node_modules\' "' + src + '/" "$RUNNER_TEMP/site/"',
    '          touch "$RUNNER_TEMP/site/.nojekyll"',
    '          if [ ! -f "$RUNNER_TEMP/site/index.html" ]; then echo "::warning::index.html tidak ditemukan di ' + src + '"; fi',
    '          echo "File situs: $(find "$RUNNER_TEMP/site" -type f | wc -l)"',
    '      - uses: actions/configure-pages@v5',
    '      - uses: actions/upload-pages-artifact@v3', '        with:', '          path: ${{ runner.temp }}/site',
    '      - id: deployment', '        uses: actions/deploy-pages@v4'
  );
  return L.join('\n') + '\n';
};
