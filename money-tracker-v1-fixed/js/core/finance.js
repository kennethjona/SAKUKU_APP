/** Pure, dependency-free calculation and validation helpers. */
export const MAX_RUPIAH = 999_999_999_999;
const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const rupiah = value => formatter.format(Number(value) || 0);
export const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
export const todayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const currentMonth = () => todayLocal().slice(0, 7);
export const nextMonth = (month, offset) => {
  const [year, numericMonth] = month.split('-').map(Number);
  const date = new Date(year, numericMonth - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
export const monthName = month => {
  const [year, numericMonth] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, numericMonth - 1, 1));
};
export const dateLabel = date => {
  if (!isDate(date)) return 'Tanggal tidak valid';
  const [year, month, day] = String(date).split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
};
export const isDate = date => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};
export function parseAmount(raw, allowZero = false) {
  const text = String(raw ?? '').trim().replace(/^Rp\.?\s*/i, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  const number = Number(text.replaceAll('.', ''));
  return Number.isSafeInteger(number) && number <= MAX_RUPIAH && (allowZero || number > 0) ? number : null;
}
export function sums(transactions, month = null) {
  const list = month ? transactions.filter(t => t.date?.startsWith(month)) : transactions;
  const income = list.reduce((n, t) => n + (t.type === 'income' ? Number(t.amount) || 0 : 0), 0);
  const expense = list.reduce((n, t) => n + (t.type === 'expense' ? Number(t.amount) || 0 : 0), 0);
  return { income, expense, net: income - expense };
}
export const balance = (transactions, openingBalance) => Number(openingBalance || 0) + sums(transactions).net;
export function categorySpending(transactions, month) {
  const values = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.date?.startsWith(month)) continue;
    values.set(t.categoryId, (values.get(t.categoryId) || 0) + Number(t.amount || 0));
  }
  return [...values].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
}
export const outingSpent = (transactions, outingId) => transactions
  .filter(t => t.outingId === outingId && t.type === 'expense')
  .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
export function budgetSpent(transactions, budget) {
  return transactions.filter(t => t.type === 'expense' && t.date?.startsWith(budget.month) &&
    (!budget.categoryId || t.categoryId === budget.categoryId))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}
export function validateTransaction(input, context) {
  const name = String(input.name ?? '').trim();
  const description = String(input.description ?? '').trim();
  const type = input.type;
  const date = input.date;
  const amount = parseAmount(input.amount);
  const category = context.categories.find(c => c.id === input.categoryId);
  if (!name || name.length > 80) throw new Error('Nama transaksi wajib diisi (maksimal 80 karakter).');
  if (amount === null) throw new Error('Nominal harus bilangan rupiah bulat lebih dari 0.');
  if (!['income', 'expense'].includes(type)) throw new Error('Jenis transaksi tidak dikenal.');
  if (!category || category.type !== type || (category.archived && category.id !== context.existing?.categoryId)) {
    throw new Error('Pilih kategori aktif yang sesuai jenis transaksi.');
  }
  if (!isDate(date) || date > todayLocal()) throw new Error('Tanggal transaksi harus valid dan tidak boleh di masa depan.');
  if (context.startDate && date < context.startDate) throw new Error('Tanggal lebih awal dari awal pencatatan.');
  if (description.length > 240) throw new Error('Catatan maksimal 240 karakter.');
  const outingId = input.outingId || null;
  if (outingId && !context.outings.some(outing => outing.id === outingId)) throw new Error('Aktivitas yang dipilih tidak tersedia.');
  if (outingId && type !== 'expense') throw new Error('Hanya pengeluaran yang dapat dikaitkan dengan aktivitas.');
  return { name, amount, type, date, categoryId: category.id, description, outingId };
}
export function validateOuting(input) {
  const name = String(input.name ?? '').trim();
  const note = String(input.note ?? '').trim();
  const plannedBudget = parseAmount(input.plannedBudget, true);
  if (!name || name.length > 60) throw new Error('Nama aktivitas wajib diisi (maksimal 60 karakter).');
  if (!isDate(input.date)) throw new Error('Tanggal aktivitas tidak valid.');
  if (plannedBudget === null) throw new Error('Anggaran aktivitas harus berupa rupiah bulat (boleh 0).');
  if (note.length > 240) throw new Error('Catatan aktivitas maksimal 240 karakter.');
  if (!['active', 'completed'].includes(input.status)) throw new Error('Status aktivitas tidak valid.');
  return { name, date: input.date, plannedBudget, note, status: input.status };
}
export function validateBudget(input, categories) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Bulan anggaran tidak valid.');
  const limitAmount = parseAmount(input.limitAmount);
  if (limitAmount === null) throw new Error('Batas anggaran harus lebih dari 0.');
  const categoryId = input.categoryId || null;
  if (categoryId && !categories.some(c => c.id === categoryId && c.type === 'expense')) {
    throw new Error('Pilih kategori pengeluaran yang valid.');
  }
  return { month: input.month, categoryId, limitAmount };
}
export function validateCategory(input, categories) {
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 40) throw new Error('Nama kategori wajib diisi (maksimal 40 karakter).');
  if (!['income', 'expense'].includes(input.type)) throw new Error('Jenis kategori tidak valid.');
  if (categories.some(c => c.type === input.type && c.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Kategori dengan nama sama sudah tersedia.');
  }
  return { name, type: input.type };
}
