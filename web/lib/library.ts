// Клиентская библиотека ассетов (IndexedDB) — сохранённые персонажи, товар-кадры,
// голосовые профили. Работает без бэкенда, переживает перезагрузку страницы.
"use client";

export type AssetType = "persona" | "product" | "voice";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  createdAt: number;
  dataUrl: string; // картинка (data:image...) или референс-аудио (data:audio...)
  meta?: Record<string, any>; // для voice: { transcript }
}

const DB = "ugc-studio";
const STORE = "assets";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("indexedDB недоступен"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("type", "type", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid(type: string): string {
  const rnd = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}`.slice(2);
  return `${type}-${rnd}`;
}

export async function addAsset(a: Omit<Asset, "id" | "createdAt">): Promise<Asset> {
  const db = await openDb();
  const asset: Asset = { ...a, id: uid(a.type), createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return asset;
}

export async function listAssets(type?: AssetType): Promise<Asset[]> {
  const db = await openDb();
  const all: Asset[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Asset[]);
    req.onerror = () => reject(req.error);
  });
  return all.filter((a) => !type || a.type === type).sort((x, y) => y.createdAt - x.createdAt);
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
