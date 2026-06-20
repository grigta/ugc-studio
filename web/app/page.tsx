"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const EP = [
  { key: "image", label: "Image (персонаж + товар)", tools: "Qwen-Image-Edit" },
  { key: "video", label: "Video (Wan 2.2)", tools: "I2V / talking-head" },
  { key: "voice", label: "Voice (CosyVoice 2)", tools: "RU + клон голоса" },
];

export default function Dashboard() {
  const [health, setHealth] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <h1 className="h1">Дашборд</h1>
      <p className="sub">Состояние эндпоинтов RunPod и быстрый доступ к инструментам.</p>

      {err && <div className="notice">Не удалось получить статус: {err}</div>}

      <div className="grid" style={{ marginBottom: 28 }}>
        {EP.map((e) => {
          const h = health?.[e.key];
          const configured = h?.configured;
          const workers = h?.workers;
          return (
            <div className="card" key={e.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>{e.label}</h3>
                {!health ? <span className="badge off">…</span>
                  : !configured ? <span className="badge off">не настроен</span>
                  : h?.error ? <span className="badge warn">ошибка</span>
                  : <span className="badge ok">готов</span>}
              </div>
              <p>{e.tools}</p>
              {configured && workers && (
                <p style={{ marginTop: 8 }}>
                  воркеры: {workers.running ?? 0} активных · {workers.idle ?? 0} idle
                  {h?.jobs ? ` · в очереди: ${h.jobs.inQueue ?? 0}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <h1 className="h1" style={{ fontSize: 18 }}>Инструменты</h1>
      <div className="grid">
        <Link className="card" href="/persona"><h3>Персонаж →</h3><p>Сгенерировать лицо синтетического персонажа</p></Link>
        <Link className="card" href="/product"><h3>Товар в кадр →</h3><p>Вставить товар к персонажу</p></Link>
        <Link className="card" href="/video"><h3>Видео →</h3><p>Оживить картинку в ролик (Wan 2.2)</p></Link>
        <Link className="card" href="/voice"><h3>Голос →</h3><p>Русская озвучка с клоном голоса</p></Link>
      </div>

      {health && !Object.values(health).some((h: any) => h.configured) && (
        <div className="notice" style={{ marginTop: 24 }}>
          Эндпоинты ещё не настроены. Задеплой их (<code>deploy/deploy.mjs</code>) и впиши
          ID в <code>web/.env.local</code>.
        </div>
      )}
    </div>
  );
}
