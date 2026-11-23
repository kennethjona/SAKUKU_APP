import { openDatabase, loadData, put, remove, setSetting, exportBackup, restoreBackup } from './db/indexed-db.js';
import { DEFAULT_CATEGORIES } from './utils/defaults.js';
import {
  rupiah, escapeHTML as h, todayLocal, currentMonth, nextMonth, monthName,
  dateLabel, isDate, parseAmount, sums, balance, categorySpending,
  outingSpent, budgetSpent, validateTransaction, validateOuting,
  validateBudget, validateCategory,
} from './core/finance.js';

const $ = selector => document.querySelector(selector);
const container = $('#main');
const ROUTES = [
  ['beranda', 'Beranda', 'Ringkasan', 'home'],
  ['transaksi', 'Transaksi', 'Pencatatan', 'list'],
  ['aktivitas', 'Aktivitas', 'Jalan-jalan', 'bag'],
  ['anggaran', 'Anggaran', 'Perencanaan', 'target'],
  ['analitik', 'Analitik', 'Wawasan', 'chart'],
  ['pengaturan', 'Pengaturan', 'Preferensi', 'settings'],
];
const ICON = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16l4-5 3 2 5-7"/>',
  settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M18.4 5.6l-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
};
const svg = key => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[key]}</svg>`;
const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const catColor = category => /^#[0-9a-f]{6}$/i.test(category?.color ?? '') ? category.color : '#81939c';

let db;
let data = { transactions: [], categories: [], budgets: [], outings: [], settings: {} };
let selectedMonth = currentMonth();
let transactionFilter = { search: '', type: 'all' };
let busy = false;

function notify(message, error = false) {
  const root = $('#toastRoot');
  root.innerHTML = `<div class="toast-message ${error ? 'toast-error' : ''}" role="alert">${h(message)}</div>`;
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => { root.textContent = ''; }, 4200);
}
function failPage(error) {
  console.error('Money Tracker gagal dijalankan:', error);
  container.innerHTML = `<section class="card error-panel" role="alert">
    <div class="error-icon">!</div>
    <h2>Aplikasi tidak berhasil dimuat</h2>
    <p>${h(error?.message || String(error))}</p>
    <p class="muted">Jika halaman dibuka lewat <code>file:///</code>, jalankan dengan Live Server atau <code>python -m http.server 5500</code> dan akses <code>http://127.0.0.1:5500/</code>.</p>
    <button class="btn btn-primary" type="button" data-action="reload">Coba lagi</button>
  </section>`;
}
function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, '').split(/[?\/]/)[0]);
  return ROUTES.some(([path]) => path === hash) ? hash : 'beranda';
}
function activeMonthTransactions() { return data.transactions.filter(t => t.date?.startsWith(selectedMonth)); }
function expenseCategory(idValue) { return data.categories.find(c => c.id === idValue); }
function categoryName(idValue) { return expenseCategory(idValue)?.name ?? 'Kategori lama'; }
function categoryDot(idValue) { return `<span class="category-dot" style="background:${catColor(expenseCategory(idValue))}"></span>`; }
function categoryOptions(type, selected = '') {
  return data.categories.filter(c => c.type === type && (!c.archived || c.id === selected))
    .map(c => `<option value="${h(c.id)}" ${selected === c.id ? 'selected' : ''}>${h(c.name)}${c.archived ? ' (arsip)' : ''}</option>`).join('');
}
function routeLink([path, label, , icon]) {
  return `<a href="#/${path}" class="nav-link" ${route() === path ? 'aria-current="page"' : ''}>${svg(icon)}<span>${h(label)}</span></a>`;
}
function renderNav() {
  $('#sideNav').innerHTML = ROUTES.map(routeLink).join('');
  $('#bottomNav').innerHTML = ROUTES.slice(0, 5).map(([path, label, , icon]) =>
    `<a href="#/${path}" class="mobile-nav-item ${route() === path ? 'active' : ''}" ${route() === path ? 'aria-current="page"' : ''}>${svg(icon)}<span>${h(label)}</span></a>`
  ).join('');
}
function empty(title, text, href = '#/transaksi', action = 'Mulai mencatat') {
  return `<div class="blank-state"><div class="blank-symbol">◎</div><h3>${h(title)}</h3><p>${h(text)}</p><a href="${href}" class="btn btn-secondary btn-sm">${h(action)}</a></div>`;
}
function sectionHeading(label, meta = '') {
  return `<div class="mt-section-heading"><h2>${h(label)}</h2>${meta}</div>`;
}
function summaryTile(label, value, tone = '', note = '') {
  return `<div class="mt-summary-tile ${tone}"><p class="tile-label">${h(label)}</p><strong>${rupiah(value)}</strong><span class="tile-note">${h(note)}</span></div>`;
}
function budgetProgress(budget) {
  const spent = budgetSpent(data.transactions, budget);
  const remaining = budget.limitAmount - spent;
  const percentage = Math.round(spent / budget.limitAmount * 100);
  return `<div class="progress-wrap">
    <div class="progress-top"><strong>${h(budget.categoryId ? categoryName(budget.categoryId) : 'Total bulanan')}</strong><span>${rupiah(spent)} / ${rupiah(budget.limitAmount)}</span></div>
    <div class="mt-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, percentage)}"><span class="${percentage > 100 ? 'over' : percentage >= 80 ? 'warning' : ''}" style="width:${Math.min(100, percentage)}%"></span></div>
    <div class="progress-bottom"><span>${percentage}% digunakan</span><span class="${remaining < 0 ? 'negative' : ''}">${remaining < 0 ? 'Melebihi ' + rupiah(-remaining) : 'Sisa ' + rupiah(remaining)}</span></div>
  </div>`;
}
function budgetForMonth() { return data.budgets.filter(b => b.month === selectedMonth).sort((a, b) => Number(Boolean(a.categoryId)) - Number(Boolean(b.categoryId))); }
function transactionRow(t) {
  const isExpense = t.type === 'expense';
  return `<tr>
    <td><strong>${h(t.name)}</strong>${t.description ? `<span class="table-subtitle">${h(t.description)}</span>` : ''}</td>
    <td><span class="cat-label">${categoryDot(t.categoryId)}${h(categoryName(t.categoryId))}</span></td>
    <td>${h(dateLabel(t.date))}</td>
    <td class="amount-cell ${isExpense ? 'negative' : 'positive'}">${isExpense ? '−' : '+'} ${rupiah(t.amount)}</td>
    <td class="table-actions"><button class="tiny-action" data-action="edit-transaction" data-id="${h(t.id)}" aria-label="Edit ${h(t.name)}">Edit</button><button class="tiny-action danger" data-action="delete-transaction" data-id="${h(t.id)}" aria-label="Hapus ${h(t.name)}">Hapus</button></td>
  </tr>`;
}
function latestRows(list) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
function tableTransactions(list, showEmpty = true) {
  if (!list.length) return showEmpty ? empty('Belum ada transaksi', 'Tambahkan pemasukan atau pengeluaran pertamamu.') : '';
  return `<div class="table-scroll"><table class="mt-table"><thead><tr><th>Transaksi</th><th>Kategori</th><th>Tanggal</th><th>Nominal</th><th>Opsi</th></tr></thead><tbody>${latestRows(list).map(transactionRow).join('')}</tbody></table></div>`;
}
function renderDashboard() {
  const allBalance = balance(data.transactions, data.settings.openingBalance);
  const m = sums(data.transactions, selectedMonth);
  const latest = latestRows(activeMonthTransactions()).slice(0, 5);
  const topCategories = categorySpending(data.transactions, selectedMonth).slice(0, 4);
  const totalExpense = m.expense;
  const budget = budgetForMonth().find(b => !b.categoryId);
  container.innerHTML = `<div class="mt-page-stack">
    <div class="hero-row">
      <div class="balance-card mt-hero"><p class="balance-label">SALDO KESELURUHAN</p><h2 class="balance-amount">${rupiah(allBalance)}</h2><p class="hero-note">Saldo awal + seluruh pemasukan − seluruh pengeluaran</p>
        <div class="hero-actions"><button class="btn hero-button" data-action="add-transaction">+ Tambah transaksi</button><a class="hero-secondary" href="#/analitik">Lihat analitik ↗</a></div>
        <div class="hero-decoration" aria-hidden="true"></div>
      </div>
      <div class="hero-aside"><p class="small-uppercase">RINGKASAN BULAN</p><h2>${h(monthName(selectedMonth))}</h2><p class="muted">Semua catatan keuangan tersimpan di browser ini. Tanpa login, tanpa biaya langganan.</p><span class="local-chip">● Tersimpan lokal</span></div>
    </div>
    <div class="mt-tiles">${summaryTile('Pemasukan bulan ini', m.income, 'income', `${activeMonthTransactions().filter(t => t.type === 'income').length} transaksi masuk`)}
      ${summaryTile('Pengeluaran bulan ini', m.expense, 'expense', `${activeMonthTransactions().filter(t => t.type === 'expense').length} transaksi keluar`)}
      ${summaryTile('Arus kas bulan ini', m.net, '', 'Pemasukan dikurangi pengeluaran')}</div>
    <div class="mt-two-column">
      <section class="card mt-card">${sectionHeading('Transaksi terakhir', '<a href="#/transaksi" class="small-link">Lihat semua →</a>')}
        ${latest.length ? tableTransactions(latest) : empty('Belum ada transaksi bulan ini', 'Mulai catat setiap uang yang masuk dan keluar.')}
      </section>
      <div class="mt-side-stack"><section class="card mt-card">${sectionHeading('Anggaran bulanan', '<a href="#/anggaran" class="small-link">Atur →</a>')}
          ${budget ? budgetProgress(budget) : empty('Anggaran belum dibuat', 'Tetapkan batas pengeluaran bulan ini.', '#/anggaran', 'Atur anggaran')}</section>
        <section class="card mt-card">${sectionHeading('Kategori teratas')}
          ${topCategories.length ? topCategories.map(c => `<div class="category-breakdown"><span class="cat-label">${categoryDot(c.categoryId)}${h(categoryName(c.categoryId))}</span><strong>${rupiah(c.amount)}</strong></div>
            <div class="thin-track"><span style="width:${Math.min(100, Math.round(c.amount / (totalExpense || 1) * 100))}%"></span></div>`).join('') : `<p class="muted">Belum ada pengeluaran bulan ini.</p>`}</section></div>
    </div>
  </div>`;
}
function filteredTransactions() {
  const query = transactionFilter.search.toLowerCase();
  return activeMonthTransactions().filter(t => (transactionFilter.type === 'all' || t.type === transactionFilter.type) &&
    (`${t.name} ${t.description || ''} ${categoryName(t.categoryId)}`).toLowerCase().includes(query));
}
function updateTransactionList() {
  const target = $('#transactionResults');
  if (!target) return;
  const list = filteredTransactions();
  target.innerHTML = `<p class="results-count">${list.length} transaksi ditemukan</p>` + (list.length ? tableTransactions(list) :
    `<p class="muted mt-empty-small">Tidak ada transaksi sesuai pencarian.</p>`);
}
function renderTransactions() {
  const month = sums(data.transactions, selectedMonth);
  container.innerHTML = `<div class="mt-page-stack">
    <div class="page-intro"><div><p class="muted">Kelola pemasukan dan pengeluaran untuk ${h(monthName(selectedMonth))}.</p></div><button class="btn btn-primary" data-action="add-transaction">+ Transaksi baru</button></div>
    <div class="mt-tiles">${summaryTile('Pemasukan', month.income, 'income')}${summaryTile('Pengeluaran', month.expense, 'expense')}${summaryTile('Selisih', month.net)}</div>
    <section class="card mt-card"><div class="mt-section-heading"><h2>Riwayat transaksi</h2><span class="muted">Filter bulanan</span></div>
      <div class="filter-row"><label class="search-wrap"><span class="sr-only">Cari transaksi</span><input id="searchTx" type="search" placeholder="Cari nama, catatan, kategori..." value="${h(transactionFilter.search)}"></label>
      <label class="sr-only" for="filterType">Jenis transaksi</label><select id="filterType"><option value="all" ${transactionFilter.type === 'all' ? 'selected' : ''}>Semua jenis</option><option value="income" ${transactionFilter.type === 'income' ? 'selected' : ''}>Pemasukan</option><option value="expense" ${transactionFilter.type === 'expense' ? 'selected' : ''}>Pengeluaran</option></select></div>
      <div id="transactionResults"></div></section>
  </div>`;
  updateTransactionList();
}
function renderOutings() {
  const outings = [...data.outings].sort((a, b) => b.date.localeCompare(a.date));
  container.innerHTML = `<div class="mt-page-stack">
    <div class="page-intro"><p class="muted">Catat budget dan total belanja saat jalan-jalan, nongkrong, atau acara.</p></div>
    <div class="mt-two-column mt-outing-grid"><section class="card mt-card">
      ${sectionHeading('Buat aktivitas')}
      <form id="outingForm" class="form-stack">
        <label>Nama aktivitas <input name="name" maxlength="60" required placeholder="Contoh: Nongkrong Sabtu"></label>
        <div class="form-two"><label>Tanggal <input name="date" type="date" value="${todayLocal()}" required></label><label>Anggaran (Rp) <input name="plannedBudget" inputmode="numeric" placeholder="100000" value="0" required></label></div>
        <label>Catatan (opsional) <textarea name="note" maxlength="240" rows="2" placeholder="Lokasi, teman, tujuan..."></textarea></label>
        <button type="submit" class="btn btn-primary">Buat aktivitas</button>
      </form>
    </section>
    <section class="card mt-card"><h2>Penggunaan dana aktivitas</h2><p class="muted" style="margin-top:8px">Setelah membuat aktivitas, pilih aktivitas tersebut ketika menambahkan pengeluaran. Totalnya dihitung otomatis dari transaksi yang terhubung.</p>
      <div class="mini-facts"><strong>${data.outings.length}</strong><span>Total aktivitas</span></div>
    </section></div>
    ${sectionHeading('Daftar aktivitas', `<span class="muted">${outings.length} aktivitas</span>`)}
    ${outings.length ? `<div class="outing-cards">${outings.map(o => {
      const spent = outingSpent(data.transactions, o.id);
      const remaining = o.plannedBudget - spent;
      const pct = o.plannedBudget ? Math.round(spent / o.plannedBudget * 100) : 0;
      return `<article class="card outing-item"><div class="outing-head"><span class="out-status ${o.status === 'completed' ? 'done' : ''}">${o.status === 'completed' ? 'Selesai' : 'Aktif'}</span><small class="muted">${h(dateLabel(o.date))}</small></div>
        <h3>${h(o.name)}</h3>${o.note ? `<p class="muted">${h(o.note)}</p>` : ''}
        <div class="outing-amount"><strong>${rupiah(spent)}</strong><small>dari ${rupiah(o.plannedBudget)} budget</small></div>
        <div class="mt-progress"><span class="${remaining < 0 ? 'over' : ''}" style="width:${Math.min(100, pct)}%"></span></div>
        <p class="${remaining < 0 ? 'negative' : 'muted'} small-note">${remaining < 0 ? `Melebihi budget ${rupiah(-remaining)}` : `Sisa budget ${rupiah(remaining)}`}</p>
        <div class="outing-actions"><button class="btn btn-primary btn-sm" data-action="add-outing-expense" data-id="${h(o.id)}">+ Pengeluaran</button><button class="btn btn-secondary btn-sm" data-action="toggle-outing" data-id="${h(o.id)}">${o.status === 'active' ? 'Selesaikan' : 'Aktifkan'}</button><button class="tiny-action danger" data-action="delete-outing" data-id="${h(o.id)}">Hapus</button></div>
      </article>`;
    }).join('')}</div>` : empty('Belum ada aktivitas', 'Buat aktivitas pertama agar pengeluaran jalan-jalan bisa dikelompokkan.', '#/aktivitas', 'Isi formulir di atas')}
  </div>`;
}
function renderBudgets() {
  const budgets = budgetForMonth();
  container.innerHTML = `<div class="mt-page-stack"><div class="page-intro"><p class="muted">Tentukan batas pengeluaran dan pantau sisanya per bulan atau kategori.</p></div>
    <div class="mt-two-column mt-outing-grid"><section class="card mt-card">${sectionHeading('Atur anggaran')}
      <form id="budgetForm" class="form-stack"><label>Bulan <input type="month" name="month" value="${selectedMonth}" required></label>
      <label>Kategori <select name="categoryId"><option value="">Semua pengeluaran (total bulanan)</option>${categoryOptions('expense')}</select></label>
      <label>Batas anggaran (Rp) <input name="limitAmount" inputmode="numeric" required placeholder="500000"></label>
      <p class="muted small-note">Menyimpan bulan dan kategori yang sama akan memperbarui anggaran lama.</p>
      <button class="btn btn-primary" type="submit">Simpan anggaran</button></form></section>
      <section class="card mt-card"><h2>Belanja bulan ini</h2><p class="big-number negative">${rupiah(sums(data.transactions, selectedMonth).expense)}</p><p class="muted">Gunakan anggaran untuk melihat apakah pengeluaranmu masih dalam batas aman.</p></section></div>
      <section class="card mt-card">${sectionHeading(`Anggaran ${monthName(selectedMonth)}`, `<span class="muted">${budgets.length} anggaran</span>`)}
      ${budgets.length ? budgets.map(b => `<div class="budget-item">${budgetProgress(b)}<button class="tiny-action danger" data-action="delete-budget" data-id="${h(b.id)}">Hapus anggaran</button></div>`).join('') : empty('Belum ada anggaran untuk bulan ini', 'Isi formulir di atas untuk menetapkan batas pengeluaran.', '#/anggaran', 'Buat anggaran')}</section>
  </div>`;
}
function renderAnalytics() {
  const month = sums(data.transactions, selectedMonth);
  const spending = categorySpending(data.transactions, selectedMonth);
  const top = spending[0];
  const expenseTransactions = activeMonthTransactions().filter(t => t.type === 'expense');
  const daysInThisMonth = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
  const elapsedDays = selectedMonth === currentMonth() ? Math.min(daysInThisMonth, Number(todayLocal().slice(8))) : daysInThisMonth;
  const avg = Math.round(month.expense / elapsedDays);
  const months = Array.from({ length: 6 }, (_, index) => nextMonth(selectedMonth, index - 5));
  const flows = months.map(m => ({ month: m, ...sums(data.transactions, m) }));
  const maximum = Math.max(1, ...flows.map(f => Math.max(f.income, f.expense)));
  container.innerHTML = `<div class="mt-page-stack"><div class="page-intro"><p class="muted">Pahami pola pengeluaran agar keputusan keuanganmu lebih terarah.</p></div>
    <div class="mt-tiles">${summaryTile('Rata-rata pengeluaran / hari', avg)}${summaryTile('Pengeluaran bulan ini', month.expense, 'expense')}${summaryTile('Total pemasukan', month.income, 'income')}</div>
    <div class="mt-two-column"><section class="card mt-card">${sectionHeading('Arus kas 6 bulan')}
      <div class="legend"><span class="legend-income"></span> Pemasukan <span class="legend-expense"></span> Pengeluaran</div>
      <div class="monthly-bars">${flows.map(f => `<div class="month-bar"><div class="paired-bars"><span class="bar-income" title="Pemasukan ${rupiah(f.income)}" style="height:${f.income ? Math.max(4, Math.round(100 * f.income / maximum)) : 0}%"></span><span class="bar-expense" title="Pengeluaran ${rupiah(f.expense)}" style="height:${f.expense ? Math.max(4, Math.round(100 * f.expense / maximum)) : 0}%"></span></div><small>${h(new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(Number(f.month.slice(0, 4)), Number(f.month.slice(5, 7)) - 1, 1)))}</small></div>`).join('')}</div>
    </section><section class="card mt-card">${sectionHeading('Pengeluaran per kategori')}
      ${spending.length ? spending.map(item => `<div class="category-breakdown"><span class="cat-label">${categoryDot(item.categoryId)}${h(categoryName(item.categoryId))}</span><strong>${rupiah(item.amount)}</strong></div><div class="thin-track"><span style="width:${Math.round(item.amount / (month.expense || 1) * 100)}%"></span></div>`).join('') : `<p class="muted">Belum ada pengeluaran untuk dianalisis.</p>`}</section></div>
    <section class="card mt-card">${sectionHeading('Wawasan bulan ini')}<div class="insight-cards">
      <div class="insight-mini"><strong>${expenseTransactions.length}</strong><p>Transaksi pengeluaran tercatat</p></div>
      <div class="insight-mini"><strong>${top ? h(categoryName(top.categoryId)) : '—'}</strong><p>Kategori pengeluaran terbesar</p></div>
      <div class="insight-mini"><strong>${month.net >= 0 ? 'Surplus' : 'Defisit'}</strong><p>Arus kas ${month.net >= 0 ? 'positif' : 'negatif'} ${rupiah(Math.abs(month.net))}</p></div>
    </div></section>
  </div>`;
}
function renderSettings() {
  const s = data.settings;
  container.innerHTML = `<div class="mt-page-stack"><div class="page-intro"><p class="muted">Kelola saldo awal, kategori, tampilan, dan cadangan data lokal.</p></div>
    <div class="mt-two-column mt-outing-grid"><section class="card mt-card">${sectionHeading('Pengaturan keuangan')}
      <form id="settingsForm" class="form-stack"><label>Saldo awal (Rp) <input name="openingBalance" inputmode="numeric" value="${h(s.openingBalance ?? 0)}" required></label>
        <label>Tanggal mulai pencatatan <input name="trackingStartDate" type="date" value="${h(s.trackingStartDate || '')}" max="${todayLocal()}"></label>
        <label>Tema <select name="theme"><option value="light" ${s.theme !== 'dark' ? 'selected' : ''}>Terang</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Gelap</option></select></label>
        <button class="btn btn-primary" type="submit">Simpan pengaturan</button></form>
      </section>
      <section class="card mt-card">${sectionHeading('Cadangan & pemulihan')}
        <p class="muted">Data hanya tersimpan pada browser dan alamat website yang sama. Ekspor secara berkala agar datamu aman saat mengganti perangkat atau membersihkan browser.</p>
        <div class="backup-actions"><button class="btn btn-primary" data-action="export-backup">Unduh backup JSON</button><button class="btn btn-secondary" data-action="import-backup">Impor backup JSON</button></div>
        <p class="muted small-note">Impor akan mengganti seluruh data saat ini setelah konfirmasi. Data tidak dikirim ke server.</p>
      </section></div>
    <section class="card mt-card">${sectionHeading('Kelola kategori')}
      <form id="categoryForm" class="form-row"><label class="sr-only" for="categoryName">Nama kategori</label><input id="categoryName" name="name" placeholder="Nama kategori baru" maxlength="40" required>
        <label class="sr-only" for="categoryType">Jenis kategori</label><select id="categoryType" name="type"><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select><button class="btn btn-primary" type="submit">+ Tambah kategori</button></form>
      <div class="category-pills">${data.categories.map(c => `<div class="category-pill ${c.archived ? 'is-archived' : ''}">${categoryDot(c.id)}<span>${h(c.name)}</span><small>${c.type === 'income' ? 'Masuk' : 'Keluar'}</small><button data-action="toggle-category" data-id="${h(c.id)}" class="tiny-action">${c.archived ? 'Aktifkan' : 'Arsipkan'}</button></div>`).join('')}</div>
    </section></div>`;
}
function render() {
  const current = route();
  const entry = ROUTES.find(([path]) => path === current);
  $('#pageEyebrow').textContent = entry[2];
  $('#pageTitle').textContent = entry[1];
  $('#monthLabel').textContent = monthName(selectedMonth);
  $('#monthSwitcher').hidden = current === 'pengaturan' || current === 'aktivitas';
  renderNav();
  ({ beranda: renderDashboard, transaksi: renderTransactions, aktivitas: renderOutings,
    anggaran: renderBudgets, analitik: renderAnalytics, pengaturan: renderSettings })[current]();
}
async function refresh(message = '') {
  data = await loadData(db);
  document.documentElement.dataset.theme = data.settings.theme === 'dark' ? 'dark' : 'light';
  render();
  if (message) notify(message);
}
async function init() {
  try {
    db = await openDatabase();
    data = await loadData(db);
    if (data.categories.length === 0) {
      for (const category of DEFAULT_CATEGORIES) {
        await put(db, 'categories', { ...category, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }
    bindEvents();
    await refresh();
  } catch (error) { failPage(error); }
}
function openTransactionDialog(edit = null, outingId = '') {
  const dialog = $('#transactionDialog');
  const type = edit?.type || 'expense';
  const selectedCategory = edit?.categoryId || data.categories.find(c => c.type === type && !c.archived)?.id || '';
  dialog.dataset.editId = edit?.id || '';
  dialog.innerHTML = `<form id="transactionForm" class="dialog-body" method="dialog">
    <div class="dialog-top"><div><p class="eyebrow">PENCATATAN</p><h2>${edit ? 'Edit transaksi' : 'Tambah transaksi'}</h2></div><button type="button" class="dialog-close" data-action="close-dialog" aria-label="Tutup">×</button></div>
    <div class="form-stack"><label>Jenis transaksi <select name="type" id="txType"><option value="expense" ${type === 'expense' ? 'selected' : ''}>Pengeluaran</option><option value="income" ${type === 'income' ? 'selected' : ''}>Pemasukan</option></select></label>
    <label>Nama transaksi <input name="name" placeholder="Contoh: Beli makan siang" value="${h(edit?.name ?? '')}" maxlength="80" required autofocus></label>
    <div class="form-two"><label>Nominal (Rp) <input name="amount" inputmode="numeric" value="${h(edit?.amount ?? '')}" placeholder="25000" required></label><label>Tanggal <input name="date" type="date" value="${h(edit?.date ?? todayLocal())}" max="${todayLocal()}" required></label></div>
    <label>Kategori <select name="categoryId" id="txCategory" required>${categoryOptions(type, selectedCategory)}</select></label>
    <label id="outingField" ${type === 'income' ? 'hidden' : ''}>Aktivitas (opsional) <select name="outingId"><option value="">Tanpa aktivitas</option>${data.outings.map(o => `<option value="${h(o.id)}" ${(edit?.outingId || outingId) === o.id ? 'selected' : ''}>${h(o.name)}</option>`).join('')}</select></label>
    <label>Catatan (opsional) <textarea name="description" rows="2" maxlength="240" placeholder="Catatan singkat">${h(edit?.description || '')}</textarea></label></div>
    <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-action="close-dialog">Batal</button><button class="btn btn-primary" type="submit">${edit ? 'Simpan perubahan' : 'Simpan transaksi'}</button></div>
  </form>`;
  dialog.showModal();
  dialog.querySelector('[name="name"]').focus();
}
async function handleTransaction(form) {
  const editId = $('#transactionDialog').dataset.editId;
  const original = data.transactions.find(t => t.id === editId);
  const values = Object.fromEntries(new FormData(form));
  const validated = validateTransaction(values, { categories: data.categories, outings: data.outings,
    startDate: data.settings.trackingStartDate, existing: original });
  const now = new Date().toISOString();
  await put(db, 'transactions', { ...original, ...validated, id: editId || id('tx'),
    createdAt: original?.createdAt || now, updatedAt: now });
  $('#transactionDialog').close();
  selectedMonth = validated.date.slice(0, 7);
  await refresh(editId ? 'Transaksi diperbarui.' : 'Transaksi berhasil ditambahkan.');
}
async function handleOuting(form) {
  const values = Object.fromEntries(new FormData(form));
  const validated = validateOuting({ ...values, status: 'active' });
  const now = new Date().toISOString();
  await put(db, 'outings', { ...validated, id: id('outing'), createdAt: now, updatedAt: now });
  await refresh('Aktivitas berhasil dibuat.');
}
async function handleBudget(form) {
  const values = Object.fromEntries(new FormData(form));
  const validated = validateBudget(values, data.categories);
  const now = new Date().toISOString();
  const budgetId = `${validated.month}:${validated.categoryId || 'all'}`;
  const prior = data.budgets.find(b => b.id === budgetId);
  await put(db, 'budgets', { ...prior, ...validated, id: budgetId,
    createdAt: prior?.createdAt || now, updatedAt: now });
  selectedMonth = validated.month;
  await refresh('Anggaran berhasil disimpan.');
}
async function handleSettings(form) {
  const values = Object.fromEntries(new FormData(form));
  const openingBalance = parseAmount(values.openingBalance, true);
  if (openingBalance === null) throw new Error('Saldo awal harus berupa rupiah bulat minimal 0.');
  if (values.trackingStartDate && (!isDate(values.trackingStartDate) || values.trackingStartDate > todayLocal())) {
    throw new Error('Tanggal mulai pencatatan tidak valid.');
  }
  if (!['light', 'dark'].includes(values.theme)) throw new Error('Pilihan tema tidak dikenal.');
  if (values.trackingStartDate && data.transactions.some(t => t.date < values.trackingStartDate)) {
    throw new Error('Tanggal mulai tidak boleh lebih baru daripada transaksi yang sudah tercatat.');
  }
  await setSetting(db, 'openingBalance', openingBalance);
  await setSetting(db, 'trackingStartDate', values.trackingStartDate);
  await setSetting(db, 'theme', values.theme);
  try { localStorage.setItem('mt_theme', values.theme); } catch {}
  await refresh('Pengaturan disimpan.');
}
async function handleCategory(form) {
  const values = Object.fromEntries(new FormData(form));
  const validated = validateCategory(values, data.categories);
  const colors = ['#0f8a5f', '#e07a5f', '#3d7ea6', '#7c3aed', '#b45f9b', '#d9a441', '#0e7490'];
  await put(db, 'categories', { ...validated, id: id('cat'), archived: false,
    color: colors[data.categories.length % colors.length], createdAt: new Date().toISOString() });
  await refresh('Kategori baru berhasil ditambahkan.');
}
async function importBackupFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('File backup terlalu besar (maksimal 20 MB).');
  let backup;
  try { backup = JSON.parse(await file.text()); }
  catch { throw new Error('Bukan file JSON yang valid.'); }
  if (!confirm('Semua data Money Tracker saat ini akan diganti dengan data dari backup. Sudah mengunduh cadangan terbaru?')) return;
  await restoreBackup(db, backup);
  await refresh('Backup berhasil dipulihkan.');
}
async function downloadBackup() {
  const backup = await exportBackup(db);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `money-tracker-backup-${todayLocal()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  notify('Backup JSON berhasil dibuat.');
}
async function run(operation) {
  if (busy) return;
  busy = true;
  try { await operation(); }
  catch (error) { console.error(error); notify(error?.message || 'Operasi gagal.', true); }
  finally { busy = false; }
}
function bindEvents() {
  window.addEventListener('hashchange', render);
  $('#prevMonth').addEventListener('click', () => { selectedMonth = nextMonth(selectedMonth, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { selectedMonth = nextMonth(selectedMonth, 1); render(); });
  $('#quickAddBtn').addEventListener('click', () => openTransactionDialog());
  $('#themeToggle').addEventListener('click', () => run(async () => {
    const theme = data.settings.theme === 'dark' ? 'light' : 'dark';
    await setSetting(db, 'theme', theme);
    try { localStorage.setItem('mt_theme', theme); } catch {}
    await refresh(`Tema ${theme === 'dark' ? 'gelap' : 'terang'} aktif.`);
  }));
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id: recordId } = target.dataset;
    if (action === 'reload') { location.reload(); return; }
    if (action === 'close-dialog') { $('#transactionDialog').close(); return; }
    if (action === 'add-transaction') { openTransactionDialog(); return; }
    if (action === 'edit-transaction') {
      const record = data.transactions.find(t => t.id === recordId);
      if (record) openTransactionDialog(record);
      return;
    }
    if (action === 'add-outing-expense') { openTransactionDialog(null, recordId); return; }
    if (action === 'delete-transaction') {
      if (!confirm('Hapus transaksi ini?')) return;
      run(async () => { await remove(db, 'transactions', recordId); await refresh('Transaksi dihapus.'); });
    }
    if (action === 'delete-budget') {
      if (!confirm('Hapus anggaran ini?')) return;
      run(async () => { await remove(db, 'budgets', recordId); await refresh('Anggaran dihapus.'); });
    }
    if (action === 'toggle-category') {
      run(async () => { const c = data.categories.find(c => c.id === recordId); if (!c) return;
        await put(db, 'categories', { ...c, archived: !c.archived, updatedAt: new Date().toISOString() });
        await refresh(`Kategori ${c.archived ? 'diaktifkan' : 'diarsipkan'}.`);
      });
    }
    if (action === 'toggle-outing') {
      run(async () => { const o = data.outings.find(o => o.id === recordId); if (!o) return;
        await put(db, 'outings', { ...o, status: o.status === 'active' ? 'completed' : 'active', updatedAt: new Date().toISOString() });
        await refresh('Status aktivitas diperbarui.');
      });
    }
    if (action === 'delete-outing') {
      if (!confirm('Hapus aktivitas ini? Transaksi yang terkait tetap ada, tetapi tidak lagi dikelompokkan dalam aktivitas.')) return;
      run(async () => {
        for (const t of data.transactions.filter(t => t.outingId === recordId)) {
          await put(db, 'transactions', { ...t, outingId: null, updatedAt: new Date().toISOString() });
        }
        await remove(db, 'outings', recordId);
        await refresh('Aktivitas dihapus; transaksi tetap disimpan.');
      });
    }
    if (action === 'export-backup') run(downloadBackup);
    if (action === 'import-backup') $('#importBackupInput').click();
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'txType') {
      const form = $('#transactionForm');
      const type = event.target.value;
      form.elements.categoryId.innerHTML = categoryOptions(type);
      $('#outingField').hidden = type === 'income';
      if (type === 'income') form.elements.outingId.value = '';
    }
    if (event.target.id === 'filterType') {
      transactionFilter.type = event.target.value;
      updateTransactionList();
    }
    if (event.target.id === 'importBackupInput') {
      const file = event.target.files?.[0];
      if (file) run(() => importBackupFile(file));
      event.target.value = '';
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'searchTx') {
      transactionFilter.search = event.target.value;
      updateTransactionList();
    }
  });
  document.addEventListener('submit', event => {
    const actions = {
      transactionForm: handleTransaction, outingForm: handleOuting,
      budgetForm: handleBudget, settingsForm: handleSettings, categoryForm: handleCategory,
    };
    const handler = actions[event.target.id];
    if (!handler) return;
    event.preventDefault();
    run(() => handler(event.target));
  });
}

init();
