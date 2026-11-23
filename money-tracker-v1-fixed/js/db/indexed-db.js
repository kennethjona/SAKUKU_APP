/**
 * Money Tracker storage V1. Compatible with the original IndexedDB database:
 * money_tracker_v1 (stores: transactions, categories, budgets, outings, settings).
 * No server, network, frameworks, or paid API is required.
 */
import { DB_NAME, DB_VERSION, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../utils/defaults.js';

export const STORE_KEYS = Object.freeze({
  transactions: 'transactions',
  categories: 'categories',
  budgets: 'budgets',
  outings: 'outings',
  settings: 'settings',
});
const STORE_NAMES = Object.values(STORE_KEYS);

export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Browser ini tidak mendukung IndexedDB. Gunakan Edge atau Chrome terbaru.'));
      return;
    }
    let request;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (error) { reject(error); return; }

    request.onupgradeneeded = () => {
      const db = request.result;
      const ensure = (name, indexes) => {
        if (db.objectStoreNames.contains(name)) return;
        const store = db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        for (const [index, keyPath, unique] of indexes) {
          store.createIndex(index, keyPath, { unique: Boolean(unique) });
        }
        return store;
      };
      ensure('transactions', [
        ['byDate', 'date'], ['byCategory', 'categoryId'],
        ['byType', 'type'], ['byOuting', 'outingId'],
      ]);
      ensure('categories', [['byType', 'type'], ['byArchived', 'archived']]);
      ensure('budgets', [['byMonth', 'month'], ['byMonthCategory', ['month', 'categoryId'], true]]);
      ensure('outings', [['byStatus', 'status'], ['byDate', 'date']]);
      const settings = ensure('settings', []);
      if (settings) {
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
          settings.put({ key, value });
        }
      }
    };
    request.onerror = () => reject(request.error || new Error('Gagal membuka database lokal.'));
    request.onblocked = () => reject(new Error('Database terblokir oleh tab lain. Tutup tab Money Tracker lain lalu coba lagi.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function assertStore(name) {
  if (!STORE_NAMES.includes(name)) throw new Error(`Store tidak dikenal: ${name}`);
}
function requestResult(db, store, mode, operation) {
  assertStore(store);
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error(`Gagal menyimpan ${store}.`));
      tx.onerror = () => reject(tx.error || new Error(`Transaksi ${store} gagal.`));
    } catch (error) { reject(error); }
  });
}

export const getAll = (db, store) => requestResult(db, store, 'readonly', objectStore => objectStore.getAll());
export const put = (db, store, record) => requestResult(db, store, 'readwrite', objectStore => objectStore.put(record));
export const remove = (db, store, id) => requestResult(db, store, 'readwrite', objectStore => objectStore.delete(id));
export const setSetting = (db, key, value) => put(db, 'settings', { key, value });

export async function loadData(db) {
  const [transactions, categories, budgets, outings, settingsRows] = await Promise.all([
    getAll(db, 'transactions'), getAll(db, 'categories'), getAll(db, 'budgets'),
    getAll(db, 'outings'), getAll(db, 'settings'),
  ]);
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of settingsRows) settings[row.key] = row.value;
  return { transactions, categories, budgets, outings, settings };
}

export async function exportBackup(db) {
  const data = await loadData(db);
  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Validate everything before clearing a single record. No silent partial restores. */
export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('Format backup tidak dikenal.');
  const data = backup.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('File tidak memiliki data Money Tracker.');
  for (const name of ['transactions', 'categories', 'budgets', 'outings']) {
    if (!Array.isArray(data[name])) throw new Error(`Data ${name} tidak valid.`);
    if (data[name].length > 100_000) throw new Error(`Data ${name} terlalu besar.`);
    const seen = new Set();
    for (const item of data[name]) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || seen.has(item.id)) {
        throw new Error(`Terdapat ID kosong/duplikat pada ${name}.`);
      }
      seen.add(item.id);
    }
  }
  const isAmount = x => Number.isSafeInteger(x) && x >= 0 && x <= 999_999_999_999;
  const dateOK = x => {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
    const [y, m, d] = x.split('-').map(Number);
    const actual = new Date(y, m - 1, d);
    return actual.getFullYear() === y && actual.getMonth() === m - 1 && actual.getDate() === d;
  };
  for (const t of data.transactions) {
    if (!['income', 'expense'].includes(t.type) || !isAmount(t.amount) || t.amount === 0 ||
        !dateOK(t.date) || typeof t.name !== 'string' || !t.name.trim() ||
        typeof t.categoryId !== 'string') {
      throw new Error('Ada transaksi dalam backup yang tidak valid.');
    }
  }
  for (const c of data.categories) {
    if (!['income', 'expense'].includes(c.type) || typeof c.name !== 'string' || !c.name.trim()) {
      throw new Error('Ada kategori dalam backup yang tidak valid.');
    }
  }
  for (const b of data.budgets) {
    if (!/^\d{4}-\d{2}$/.test(b.month) || !isAmount(b.limitAmount) || b.limitAmount === 0) {
      throw new Error('Ada anggaran dalam backup yang tidak valid.');
    }
  }
  for (const o of data.outings) {
    if (!dateOK(o.date) || typeof o.name !== 'string' || !o.name.trim() || !isAmount(o.plannedBudget)) {
      throw new Error('Ada aktivitas dalam backup yang tidak valid.');
    }
  }
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
    throw new Error('Pengaturan dalam backup tidak valid.');
  }
  if (!isAmount(data.settings.openingBalance ?? 0)) throw new Error('Saldo awal dalam backup tidak valid.');
  if (!['light', 'dark'].includes(data.settings.theme ?? 'light')) throw new Error('Tema backup tidak valid.');
  if (data.settings.trackingStartDate && !dateOK(data.settings.trackingStartDate)) throw new Error('Tanggal awal backup tidak valid.');
  const settings = Object.entries({ ...DEFAULT_SETTINGS, ...data.settings })
    .map(([key, value]) => ({ key, value }));
  return { ...data, settings };
}

/** One IndexedDB transaction: a failed import rolls back every store. */
export async function restoreBackup(db, backup) {
  const records = validateBackup(backup); // throws before database transaction
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE_NAMES, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Pemulihan backup gagal.'));
      tx.onabort = () => reject(tx.error || new Error('Backup dibatalkan. Data lama tetap aman.'));
      for (const store of STORE_NAMES) {
        const objectStore = tx.objectStore(store);
        objectStore.clear();
        for (const record of records[store]) objectStore.put(record);
      }
    } catch (error) {
      try { tx?.abort(); } catch {}
      reject(error);
    }
  });
}
