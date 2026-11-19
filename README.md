# SUKIZY — ZIP ke GitHub

Web app statis (tanpa backend) untuk meng-upload file ZIP ke GitHub: ZIP diekstrak di browser, strukturnya dirapikan otomatis, lalu semua file di-push dalam satu commit.

## Struktur proyek

```
github-zip-uploader/
├── index.html      # halaman utama
├── css/style.css   # tampilan + dark mode
└── js/
    ├── zip.js      # ekstrak ZIP & rapikan struktur
    ├── github.js   # klien GitHub Git Data API
    ├── app.js      # logika UI
    ├── deploy.js   # Deploy Website (GitHub Pages)
    ├── pages-yml.js# pembuat workflow deploy Pages
    ├── apk.js      # Build APK + template
    └── templates.js# template APK siap build
```

## Cara menjalankan

- Buka `index.html` langsung di browser, atau
- jalankan server lokal: `npx serve .` atau `python3 -m http.server 8000`, lalu buka `http://localhost:8000`.

Perlu koneksi internet untuk memuat JSZip (cdnjs) dan memanggil `api.github.com`.

## Deploy ke GitHub Pages

1. Push folder ini ke sebuah repo.
2. Settings → Pages → Source: branch `main`, folder `/ (root)`.
3. Buka URL yang diberikan GitHub Pages.

## Membuat token

- **Classic**: github.com/settings/tokens → centang scope `repo`.
- **Fine-grained**: pilih repo tujuan, beri izin `Contents: Read and write` (dan `Administration: Read and write` bila ingin membuat repo baru).

Token hanya disimpan di memori halaman dan hanya dikirim ke `api.github.com`. Menutup tab menghapusnya.

## Perilaku otomatis

- Mengabaikan `__MACOSX`, `.DS_Store`, `Thumbs.db`, `node_modules`, `desktop.ini`.
- Jika semua file ada dalam satu folder pembungkus (mis. `project-main/`), folder itu dihapus sehingga isinya langsung di root repo (bisa dimatikan).
- Sub-folder lain dipertahankan.
- Branch belum ada → dibuat dari default branch. Repo kosong → dibuat commit awal `.gitkeep`.
- Mode **Ganti total** menghapus file lama yang tidak ada di ZIP; tanpa itu, file lama dipertahankan dan file dengan path sama ditimpa.

## Batasan

- File di atas 100 MB dilewati (batas keras GitHub, butuh Git LFS); file lain tetap di-push.
- Izin eksekusi file (`chmod +x`) tidak dipertahankan; semua file di-commit sebagai mode `100644`.
- ZIP yang sangat besar membutuhkan memori browser yang besar.

## Login

- Masuk dengan GitHub token di `login.html`; token divalidasi ke `api.github.com/user`, lalu akun, avatar, dan daftar repo langsung tersinkron.
- Pilih repo dari daftar (termasuk private dan organisasi), branch ikut terisi. Tombol **Sinkron** memuat ulang daftar.
- Token disimpan di browser (localStorage bila "Tetap masuk" dicentang, kalau tidak sessionStorage) dan hanya dikirim ke GitHub. Gunakan token dengan izin seminimal mungkin dan hapus saat tidak dipakai.
- Unggahan file dicoba ulang otomatis bila gagal sementara; file besar (beberapa MB) aman, batas per file 100 MB (batas GitHub).

## Dashboard

- **Repo saya**: statistik, cari/filter/urutkan repo, lihat isi file, ubah public/private, dan hapus repo (konfirmasi dengan mengetik nama repo; butuh izin `delete_repo`).
- **Upload ZIP**: pilih repo dari daftar, atau tombol "Upload ZIP" di kartu repo.
- **Riwayat**: 10 push terakhir.
- Notifikasi toast dan dialog konfirmasi untuk semua aksi.

## Build APK

- Tab **Build APK**: pilih repo, isi nama app dan package ID. SUKIZY memasang `.github/workflows/sukizy-build-apk.yml` ke repo, menjalankannya (workflow_dispatch), memantau langkah build, lalu APK debug muncul di **Releases** (tag `apk-N`) dengan tombol Unduh.
- Cocok untuk repo web statis dengan `index.html` di root (dibungkus Capacitor). Token perlu izin `repo` + `workflow`.
- Repo SUKIZY ini sendiri sudah membawa workflow tersebut, jadi bisa di-build menjadi APK dengan cara yang sama.
- Menu **Lainnya** di kartu repo: salin URL clone, edit nama/deskripsi, arsipkan, ubah visibilitas, hapus. Klik avatar untuk melihat info akun, jenis token, scope, dan sisa kuota API.

## Push cepat

- File yang identik dengan isi branch (dicek lewat SHA-1 gaya git) tidak diunggah ulang; kalau semua identik, tidak ada commit kosong.
- File teks sampai 1 MB dikirim inline di dalam tree (tanpa request blob terpisah); file biner diunggah paralel (8 sekaligus), terbesar lebih dulu.
- Tree disusun bertahap, jadi tidak ada batas jumlah file per push. Request yang kena rate limit atau error server diulang otomatis dengan jeda.
- Progres menampilkan kecepatan dan perkiraan sisa waktu.

## Anti-limit

- Tree disusun bertahap dengan ukuran batch adaptif: kalau GitHub timeout/error server, batch otomatis diperkecil lalu dibesarkan lagi saat lancar.
- Saat kena rate limit GitHub, semua pengunggahan berhenti bersama, menunggu sesuai arahan GitHub (minimal 61 dtk bila tidak ada arahan), lalu lanjut otomatis tanpa mengulang dari awal.
- File teks > 256 KB dan semua file biner diunggah sebagai blob (6 paralel); file teks kecil dikirim inline agar jumlah request minimal.
- Progres tahap penyusunan tree ikut tampil di progress bar.

## Log build & pasang APK

- Saat build berjalan: status per langkah selalu tampil; log teks ditampilkan langsung bila GitHub mengizinkan pengambilan dari browser (lencana "● Langsung"). Baris error diberi warna merah, dan bila gagal muncul kotak "Kemungkinan penyebab".
- **Unduh log lengkap** menyimpan file `.txt`. Workflow juga menyimpan log tiap build ke Release `sukizy-logs` (`build-N.log`) sebagai cadangan, dan tombol **Log** di daftar APK mengambil dari sana.
- Build sukses → tombol **Unduh & pasang APK**: buka file hasil unduhan, izinkan "Pasang dari sumber ini", lalu Pasang.
- Hapus repo kini cukup dengan satu dialog konfirmasi, tanpa mengetik nama repo.

## Deploy Website (GitHub Pages)

- Tab **Deploy Web** (atau tombol **Deploy** di kartu repo): pilih repo, pilih mode, tekan **Deploy sekarang**. Link situs `username.github.io/repo` muncul setelah selesai.
- **Otomatis (Actions)**: SUKIZY memasang `.github/workflows/sukizy-deploy-pages.yml`, mengaktifkan Pages (sumber: GitHub Actions), lalu menjalankannya dan menampilkan langkahnya. Bisa memakai folder `/`, `docs`, `dist`, `public`, atau `build`, dan opsi deploy ulang otomatis tiap push ke branch utama.
- **Dari branch**: GitHub Pages menyajikan langsung dari branch utama (root atau `docs`). Paling cepat dan tidak butuh workflow.
- Panel status menampilkan URL, status (Aktif / Membangun / Error), mode, serta tombol **Salin URL**, **Jadikan APK**, dan **Matikan**.
- Token: `repo` (+ `workflow` untuk mode Actions). Fine-grained: Pages, Actions, Workflows = Read and write. Repo private butuh paket GitHub berbayar untuk Pages.
- Workflow `sukizy-deploy-pages.yml` yang ikut di repo SUKIZY hanya berjalan manual (tanpa trigger push), jadi aman di-push meski Pages belum aktif.

## Template APK

Di tab **Build APK** ada pilihan **Template**:

- **Pakai file repo**: membungkus isi repo apa adanya (perlu `index.html` di root).
- **Template: Starter App**: kerangka aplikasi mobile (tab navigasi, penghitung, mode gelap).
- **Template: Catatan Mini**: aplikasi catatan offline dengan pencarian.
- **Bungkus website (URL jadi APK)**: isi URL website online, APK membukanya di dalam aplikasi, tanpa file web di repo. Cocok setelah Deploy Website (tombol **Jadikan APK** mengisi URL otomatis).

Template dipasang ke repo sebagai satu commit (`index.html`; kalau sudah ada, ada konfirmasi timpa), lalu workflow Build APK berjalan seperti biasa. Menambah template baru: tambahkan entri di `js/templates.js`.

## Upgrade v8

- **Login & UI**: halaman login baru (latar bergerak, kartu kaca, deteksi jenis token, tombol tempel dari clipboard), tab navigasi baru, statistik dan kartu repo lebih rapi, animasi hormat `prefers-reduced-motion`.
- **Sinkron otomatis** (`js/sync.js`): lencana sinkron di topbar, repo disegarkan tiap 45 dtk dan saat tab dibuka lagi. Repo yang dihapus (dari Sukizy maupun GitHub) langsung hilang dari semua daftar, form Deploy/APK, dan panel status. Kartu **Aktivitas GitHub** menampilkan run Build APK & Deploy dari 6 repo terbaru, refresh tiap 8 dtk saat ada yang berjalan.
- **Izin** (`js/perm.js`): tab **Izin** memeriksa scope token (`repo`, `workflow`, `delete_repo`) dan memilih izin aplikasi Android (kamera, mikrofon, lokasi, notifikasi, dll). Pilihan ikut dikirim ke workflow Build APK (input `permissions`) dan ditulis ke `AndroidManifest.xml` oleh langkah **Atur izin aplikasi**. Workflow lama di repo otomatis diperbarui saat build berikutnya.
