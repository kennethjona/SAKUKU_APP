# Laporan audit source Money Tracker (23 November 2026)

## Ringkasan temuan pada ZIP yang diberikan

**Kritis**

1. `js/app.js` mengimpor `openDatabase` dan `STORE_KEYS` dari `js/db/indexed-db.js`, tetapi file database awal tidak mengekspor kedua nama tersebut. Modul utama gagal dimuat pada tahap link sehingga halaman statis terus menampilkan “Memuat data keuangan…”.
2. `js/db/indexed-db.js` juga mengimpor `STORE_KEYS` dari `js/utils/defaults.js`, padahal konstanta itu tidak didefinisikan di `defaults.js`. Bahkan setelah masalah pertama diselesaikan, impor database berikutnya tetap gagal.
3. `js/db/indexed-db.js` memakai `DEFAULT_SETTINGS` dan `validateBackup` tanpa impor yang sesuai, termasuk saat membuat database baru. Ini berpotensi membatalkan inisialisasi IndexedDB.
4. `js/app.js` tidak pernah membuat isi utama atau menu sebelum memanggil renderer yang mengharapkan elemen `.balance-card`, `.summary-card`, `.budget-section` ada. Elemen-elemen tersebut tidak tersedia dalam HTML awal.
5. `js/app.js` memanggil `setSetting` serta `createTransaction` tanpa mengimpor fungsi-fungsi tersebut. Fitur simpan pengaturan/transaksi akan gagal saat digunakan.

**Tinggi**

6. Antarmuka form seperti `transactionForm`, `settingsForm`, `customCategoryWrap` dicari melalui `getElementById` sebelum dirender. Listener `addEventListener` pada elemen `null` menyebabkan error startup jika eksekusi sampai tahap itu.
7. Berbagai service draft memiliki ketidaksesuaian kontrak hasil database (`{ok, data}` vs ID/array/error) dan memakai fungsi tanpa impor, sehingga memperbaiki satu baris secara lokal saja tidak cukup.
8. Back-up dan restore awal memiliki lebih dari satu implementasi, dengan kontrak berbeda; salah satunya dapat mencoba clear data sebelum pemulihan sukses. Tidak layak digunakan tanpa perbaikan.
9. Folder `tests` pada ZIP asli kosong, jadi tidak terdapat test otomatis untuk perhitungan saldo dan migrasi.

## Perbaikan yang diterapkan

- Membuat ulang entry point fungsional `js/app.js` dan rendering keenam halaman (beranda, transaksi, aktivitas, anggaran, analitik, pengaturan).
- Menulis lapisan IndexedDB yang tetap memakai database `money_tracker_v1`, nama store V1, dengan peningkatan versi IndexedDB ke 2 untuk memastikan store yang hilang dapat dibuat tanpa menghapus data pada startup.
- Menulis fungsi keuangan dan validasi murni, dengan batas nominal dan sanitasi teks HTML.
- Membuat operasi tambah/edit/hapus transaksi, aktivitas jalan-jalan, anggaran total/kategori, kategori aktif/arsip, dan opsi tema.
- Memperbaiki ekspor dan restore backup JSON: seluruh struktur divalidasi sebelum menulis, dan pemulihan dalam satu transaksi IndexedDB.
- Mempertahankan token desain CSS utama, membuat layout responsif, dan memberi pesan error nyata jika `file:///` atau modul JavaScript gagal.
- Memindahkan modul implementasi draft yang tidak lagi dipakai ke arsip `legacy-incomplete-modules.zip`, agar referensi historis tidak hilang.
- Membuat README pemakaian dan tes keuangan otomatis.

## Pengujian yang telah dilakukan

- `npm test`: 7/7 lulus (nominal, bulan, saldo, kategori, aktivitas, budget, tanggal, sanitasi HTML, struktur backup).
- Browser smoke test dengan database mock/in-memory: startup, navigasi, tambah pemasukan, tambah pengeluaran, pencarian, tambah anggaran, tambah aktivitas, sambungkan pengeluaran, analitik, ubah saldo awal, ekspor JSON, hapus transaksi, pemulihan backup, dan tampilan mobile. **Lulus; tidak ada error JavaScript dari simulasi tersebut.**
- **Belum terverifikasi:** IndexedDB asli di Edge/Chrome Windows pada perangkat pengguna, data nyata lama dari origin pengguna, dan proses evaluasi guru. Simulasi browser menggunakan fake storage karena akses navigasi localhost dibatasi pada lingkungan pengujian.

## Keterbatasan V1 dan kandidat V2

- Data hanya disimpan di browser per origin, belum tersinkron otomatis antarperangkat.
- Tidak ada edit aktivitas atau impor CSV; status aktivitas dapat diubah, dan penghapusan tetap mempertahankan transaksi.
- Grafik analitik masih ringkas, belum ada forecasting/pengingat budget.
- Kategori dapat dibuat, diarsipkan/diaktifkan, tetapi belum dapat mengganti nama.
- Browser dengan IndexedDB nonaktif akan menampilkan error, tidak diam-diam memakai penyimpanan volatil.

**Prioritas:** validasi penuh di Windows dahulu, baru menambah fitur V2. Hindari meminta model AI mengganti semua source tanpa audit dan backup.
