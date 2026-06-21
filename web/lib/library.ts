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

// Встроенные (демо) ассеты — кладутся в библиотеку один раз при первом запуске,
// чтобы можно было сразу пользоваться (напр. готовый женский голос для клонирования).
// transcript = точная расшифровка референса (нужна voice-воркеру для zero_shot).
const BUILTIN_VOICES = [
  {
    id: "voice-builtin-ru-female-1",
    name: "Женский русский (демо)",
    src: "/voices/ru-female-1.wav",
    transcript:
      "не знаю осознаете вы или нет но большая часть товаров из центральной америки была ввезена в эту страну беспошлинно",
  },
];

const SEED_FLAG = "ugc-builtins-seeded-v1";
let seedPromise: Promise<void> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function seedBuiltins(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(SEED_FLAG)) return; // уже сидировали (или юзер удалил — не навязываемся)
  } catch {}
  for (const bv of BUILTIN_VOICES) {
    try {
      const res = await fetch(bv.src);
      if (!res.ok) continue;
      const dataUrl = await blobToDataUrl(await res.blob());
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({
          id: bv.id,
          type: "voice",
          name: bv.name,
          createdAt: Date.now(),
          dataUrl,
          meta: { transcript: bv.transcript, builtin: true },
        } as Asset);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // нет файла / нет доступа — тихо пропускаем, не ломаем библиотеку
    }
  }
  try {
    localStorage.setItem(SEED_FLAG, "1");
  } catch {}
}

// Идемпотентно: сидирование выполняется максимум один раз за загрузку страницы.
export function ensureBuiltins(): Promise<void> {
  if (!seedPromise) seedPromise = seedBuiltins();
  return seedPromise;
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
  await ensureBuiltins();
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
