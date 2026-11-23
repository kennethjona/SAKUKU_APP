# Money Tracker V1 — Stabilized

Aplikasi Money Tracker sederhana untuk tugas Sistem Informasi: catat pemasukan, pengeluaran, aktivitas jalan-jalan, dan anggaran. **Tanpa login, backend, API, atau biaya AI.** Data disimpan di **IndexedDB browser lokal**.

## Cara menjalankan di Windows + VS Code

1. Ekstrak folder `money-tracker-v1` dari ZIP ke folder baru (jangan timpa project lama sebelum membuat backup).
2. Buka folder `money-tracker-v1` di VS Code.
3. Buka Terminal → New Terminal dan jalankan:

   ```powershell
   py -m http.server 5500 --bind 127.0.0.1
   ```

   Bila `py` tidak tersedia, gunakan `python -m http.server 5500 --bind 127.0.0.1`.

4. Buka **http://127.0.0.1:5500/** di Edge/Chrome.
5. Biarkan terminal tetap terbuka selama menggunakan aplikasi. Untuk menghentikan, tekan `Ctrl+C`.

Alternatif: klik ganda `jalankan-money-tracker.bat` pada Windows dengan Python terpasang.

**Penting:** Jangan jalankan dengan klik langsung `index.html` sehingga browser menampilkan `file:///...`. Modul JavaScript modern biasanya ditolak dengan cara itu. Aplikasi akan menampilkan panduan jika kamu tidak sengaja membuka lewat `file:///`.

## Fitur utama

- Beranda: saldo seluruh waktu, pemasukan dan pengeluaran bulan terpilih, riwayat terbaru, dan ringkasan anggaran.
- Transaksi: tambah, edit, hapus, pencarian, filter pemasukan/pengeluaran, dan kategori.
- Aktivitas: buat acara/jalan-jalan, sambungkan transaksi pengeluaran, dan pantau budget versus pengeluaran riil.
- Anggaran: total per bulan atau khusus kategori, dengan sisa dan persentase realisasi.
- Analitik: perbandingan pemasukan/pengeluaran enam bulan, kategori terbesar, dan ringkasan bulanan.
- Pengaturan: saldo awal, tanggal mulai, tema terang/gelap, tambah/arsip kategori.
- Backup JSON: ekspor dan pemulihan data dari file lokal, dengan validasi dan konfirmasi.
- Responsive: tampilan laptop dan HP.

## Aturan perhitungan

- **Saldo keseluruhan** = saldo awal + semua pemasukan - semua pengeluaran.
- **Arus kas bulan** = pemasukan bulan terpilih - pengeluaran bulan terpilih.
- **Sisa anggaran** = batas bulan/kategori - pengeluaran yang sesuai.
- **Pengeluaran aktivitas** = total transaksi **pengeluaran** yang dikaitkan dengan aktivitas, tanpa menggandakan pengeluaran.
- Rupiah harus berupa angka bulat positif (saldo awal dan budget aktivitas boleh 0).

## Penyimpanan dan migrasi

Data lokal terikat ke **browser + origin (protokol, alamat, port)**. `http://127.0.0.1:5500` dan `http://localhost:5500` adalah origin berbeda, demikian pula port 5500 dan 5501. Untuk melihat database lama, gunakan browser dan alamat yang sama seperti sebelumnya.

- **Sebelum menimpa aplikasi lama**, ekspor backup dari versi lama kalau tersedia. Jika versi lama gagal membuka, jangan hapus cache / IndexedDB browser.
- Project baru menggunakan **nama database yang sama** `money_tracker_v1` dan nama store yang sama. Versi IndexedDB dinaikkan secara aman ke **2** untuk memperbaiki store yang mungkin hilang, tanpa menghapus record lama. Data yang sudah ada di origin sama tidak dihapus saat aplikasi dibuka.
- Backup JSON dapat dipulihkan dari halaman Pengaturan. **Impor akan mengganti seluruh isi Money Tracker** setelah konfirmasi, jadi ekspor dulu bila ada data penting.
- Tidak ada sinkronisasi antarperangkat; backup harus dipindahkan secara manual.

## Tes otomatis

Dengan Node.js terpasang, jalankan:

```powershell
npm test
```

Terdapat 7 pengujian unit atas rumus, validasi, dan struktur backup (lulus saat dibuat). Pengujian simulasi UI desktop/mobile juga dilakukan melalui browser otomatis dengan implementasi database dalam memori: tambah transaksi, anggaran, aktivitas, analitik, ekspor dan pemulihan backup (lulus).

**Batas verifikasi:** Simulasi UI tersebut bukan pengujian permanensi data menggunakan IndexedDB asli pada Windows. Jalankan checklist manual di bawah ini sebelum menyerahkan project ke sekolah.

## Checklist manual di browser Windows

- [ ] `http://127.0.0.1:5500/` terbuka tanpa loading tanpa akhir.
- [ ] Tambah pemasukan Rp500.000, pengeluaran Rp32.000; periksa arus kas Rp468.000.
- [ ] Refresh browser: transaksi tetap tersimpan.
- [ ] Edit dan hapus satu transaksi, saldo terhitung ulang.
- [ ] Buat aktivitas dengan budget lalu kaitkan satu pengeluaran; cek sisa budget.
- [ ] Buat batas anggaran bulan, cek progres.
- [ ] Ekspor backup JSON, lalu uji impor ke browser/profil uji **tanpa data penting**.
- [ ] Uji tema gelap, pergantian bulan, dan tampilan HP di Developer Tools.

## Struktur

- `index.html` — shell dan penanganan error awal.
- `css/` — styling (tema asli dipertahankan, `repair.css` menambah komponen V1).
- `js/app.js` — navigasi, tampilan, dan event aplikasi.
- `js/core/finance.js` — rumus keuangan dan validasi (pure functions).
- `js/db/indexed-db.js` — penyimpanan IndexedDB dan backup.
- `js/utils/defaults.js` — skema dan kategori bawaan.
- `tests/finance.test.mjs` — unit tests.
- `docs/legacy-incomplete-modules.zip` — modul draft lama yang tidak dipakai karena memiliki import, referensi, dan operasi tidak lengkap.

Tidak ada instalasi `npm install` yang dibutuhkan. Node hanya diperlukan untuk menjalankan unit test, bukan untuk membuka website.
