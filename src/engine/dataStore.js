// Stockage IndexedDB — gros quota (centaines de Mo) vs 5 Mo du localStorage.
// v2 : 3 magasins —
//   • "series"     : séries de marché OHLCV (pré-téléchargement hors-ligne)
//   • "strategies" : stratégies sauvegardées avec leurs paramètres + métriques (survit au rechargement)
//   • "backtests"  : journal durable de chaque backtest lancé par n'importe quel outil (cohérence inter-outils)
// Fallback gracieux si IDB indisponible.
const DB_NAME = "tradobot-data";
const DB_VERSION = 2;
export const SERIES = "series";
export const STRATEGIES = "strategies";
export const BACKTESTS = "backtests";
const STORES = [SERIES, STRATEGIES, BACKTESTS];
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const name of STORES) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function store(mode, storeName = SERIES) {
  const d = await openDB();
  return d.transaction(storeName, mode).objectStore(storeName);
}

// Helpers génériques (storeName optionnel → "series" par défaut pour compat ascendante).
export async function idbPut(record, storeName = SERIES) {
  const s = await store("readwrite", storeName);
  return new Promise((res, rej) => { const r = s.put(record); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
export async function idbGet(id, storeName = SERIES) {
  const s = await store("readonly", storeName);
  return new Promise((res, rej) => { const r = s.get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
}
export async function idbAll(storeName = SERIES) {
  const s = await store("readonly", storeName);
  return new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
}
export async function idbDelete(id, storeName = SERIES) {
  const s = await store("readwrite", storeName);
  return new Promise((res, rej) => { const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
export async function idbClear(storeName = SERIES) {
  const s = await store("readwrite", storeName);
  return new Promise((res, rej) => { const r = s.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
export async function storageEstimate() {
  try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0 }; } } catch { /* noop */ }
  return null;
}
