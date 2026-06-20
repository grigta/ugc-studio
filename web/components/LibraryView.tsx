"use client";
import { useEffect, useState } from "react";
import { listAssets, deleteAsset, type Asset, type AssetType } from "@/lib/library";

const GROUPS: { type: AssetType; label: string }[] = [
  { type: "persona", label: "Персонажи" },
  { type: "product", label: "Товар-кадры" },
  { type: "voice", label: "Голоса" },
];

export default function LibraryView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    try { setAssets(await listAssets()); } catch {}
    setLoaded(true);
  }
  useEffect(() => { reload(); }, []);

  async function remove(id: string) {
    await deleteAsset(id);
    reload();
  }

  if (!loaded) return <p className="sub">загрузка…</p>;

  return (
    <div>
      {GROUPS.map((g) => {
        const items = assets.filter((a) => a.type === g.type);
        return (
          <div key={g.type} style={{ marginBottom: 28 }}>
            <h1 className="h1" style={{ fontSize: 18 }}>{g.label} ({items.length})</h1>
            {items.length === 0 ? (
              <p className="sub">пусто — создай на соответствующей странице и сохрани</p>
            ) : (
              <div className="grid">
                {items.map((a) => (
                  <div className="card" key={a.id}>
                    {g.type === "voice"
                      ? <audio controls src={a.dataUrl} style={{ width: "100%" }} />
                      : <img src={a.dataUrl} alt={a.name} style={{ width: "100%", borderRadius: 8 }} />}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <span style={{ fontSize: 13 }}>{a.name}</span>
                      <button className="btn secondary" onClick={() => remove(a.id)}>удалить</button>
                    </div>
                    {a.meta?.transcript && <div className="hint">«{a.meta.transcript}»</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
