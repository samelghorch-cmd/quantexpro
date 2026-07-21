// Stockage IndexedDB pour les séries de marché — gros quota (centaines de Mo) vs 5 Mo du localStorage.
// Permet de pré-télécharger un univers d'actifs et de le garder hors-ligne. Fallback gracieux si IDB indisponible.
const DB_NAME = "tradobot-data";
const STORE = "series";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function store(mode) {
  const d = await openDB();
  return d.transaction(STORE, mode).objectStore(STORE);
}

export async function idbPut(record) {
  const s = await store("readwrite");
  return new Promise((res, rej) => { const r = s.put(record); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
export async function idbGet(id) {
  const s = await store("readonly");
  return new Promise((res, rej) => { const r = s.get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
}
export async function idbAll() {
  const s = await store("readonly");
  return new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
}
export async function idbDelete(id) {
  const s = await store("readwrite");
  return new Promise((res, rej) => { const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
export async function idbClear() {
  const s = await store("readwrite");
  return new Promise((res, rej) => { const r = s.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}
export async function storageEstimate() {
  try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0 }; } } catch { /* noop */ }
  return null;
}
