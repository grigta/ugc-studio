"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { listAssets, type Asset } from "@/lib/library";

type FilePayload = { field: string; name: string; dataUrl: string };
type StepKey = "persona" | "product" | "video" | "voice" | "mux";
type StepState = "idle" | "run" | "done" | "skip" | "err";

const STEPS: { key: StepKey; nm: string; ic: string }[] = [
  { key: "persona", nm: "Персонаж", ic: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { key: "product", nm: "Товар", ic: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" },
  { key: "video", nm: "Видео", ic: "M3 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM23 7l-5 4 5 4z" },
  { key: "voice", nm: "Голос", ic: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 10v1a7 7 0 0 0 14 0v-1M12 18v4" },
  { key: "mux", nm: "Сборка", ic: "M2 4h20v16H2zM7 4v16M17 4v16M2 8h5M2 12h5M2 16h5M17 8h5M17 12h5M17 16h5" },
];

const PV_CHECK = "M5 12l5 5L20 7";
const PV_X = "M6 6l12 12M18 6L6 18";

function PvIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

const QUALITY: Record<string, { w: number; h: number; steps: number; factor: number }> = {
  "480": { w: 480, h: 854, steps: 16, factor: 1 },
  "720": { w: 720, h: 1280, steps: 20, factor: 1.8 },
  "1080": { w: 1080, h: 1920, steps: 26, factor: 3.2 },
};

const PRESETS: Record<string, { idea: string }> = {
  ad: { idea: "крем, который убирает сухость кожи за неделю" },
  unbox: { idea: "распаковка нового беспроводного пылесоса" },
  review: { idea: "честный отзыв на умную колонку после месяца" },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function durToFrames(sec: number) {
  // Wan 2.2 одним клипом тянет ~10с (≈161 кадр); длиннее — нужна нарезка/ститчинг (вне MVP)
  return Math.min(161, Math.max(17, Math.round((sec * 16) / 4) * 4 + 1));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function runStep(tool: string, params: any, files: FilePayload[] = []): Promise<any> {
  const r = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, params, files }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "run failed");
  const { jobId, endpoint } = d;
  const MAX_ATTEMPTS = 600; // ~25 мин при 2.5с — защита от зависшей задачи
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await sleep(2500);
    const sr = await fetch(`/api/status?endpoint=${endpoint}&jobId=${jobId}`);
    const sd = await sr.json();
    if (!sr.ok) throw new Error(sd.error || "status failed");
    if (sd.status === "COMPLETED") return sd.output;
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(sd.status)) {
      throw new Error(`${sd.status}: ${JSON.stringify(sd.output ?? "")}`);
    }
  }
  throw new Error("таймаут опроса задачи (~25 мин)");
}

async function firstImageDataUrl(output: any): Promise<string | null> {
  const it = output?.images?.[0];
  if (!it) return null;
  if (it.type === "base64") return `data:image/png;base64,${it.data}`;
  if (it.type === "s3_url" || it.type === "url") return urlToDataUrl(it.data);
  return null;
}

function videoSrc(output: any): string | null {
  const it = output?.images?.[0];
  if (!it) return null;
  return it.type === "s3_url" || it.type === "url" ? it.data : `data:video/mp4;base64,${it.data}`;
}

function audioSrc(output: any): string | null {
  if (output?.audio_url) return output.audio_url;
  if (output?.audio) return `data:audio/wav;base64,${output.audio}`;
  return null;
}

interface Scene { t: string; text: string; }
interface Reel { video: string | null; audio: string | null; label: string; }

export default function AutoPipeline() {
  const [idea, setIdea] = useState("крем, который убирает сухость кожи за неделю");
  const [model, setModel] = useState("tpro");
  const [persona, setPersona] = useState("девушка у окна, естественный дневной свет, крупный план");
  const [voiceover, setVoiceover] = useState("Привет! Покажу новинку, которая реально удивила.");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [refAudio, setRefAudio] = useState<FilePayload | null>(null);
  const [promptText, setPromptText] = useState("");

  const [duration, setDuration] = useState(30);
  const [quality, setQuality] = useState("720");
  const [count, setCount] = useState(3);

  const [genBusy, setGenBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({
    persona: "idle", product: "idle", video: "idle", voice: "idle", mux: "idle",
  });
  const [progress, setProgress] = useState(0);
  const [batchLabel, setBatchLabel] = useState("");
  const [reels, setReels] = useState<Reel[]>([]);
  const [error, setError] = useState("");
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [libPersona, setLibPersona] = useState<Asset[]>([]);
  const [libProduct, setLibProduct] = useState<Asset[]>([]);
  const [libVoice, setLibVoice] = useState<Asset[]>([]);
  const [selPersona, setSelPersona] = useState("");
  const [selProduct, setSelProduct] = useState("");
  const [selVoice, setSelVoice] = useState("");

  useEffect(() => {
    listAssets("persona").then(setLibPersona).catch(() => {});
    listAssets("product").then(setLibProduct).catch(() => {});
    listAssets("voice").then(setLibVoice).catch(() => {});
  }, []);

  const metrics = useMemo(() => {
    const q = QUALITY[quality];
    const perReel = Math.round(40 * q.factor * (duration / 15));
    const price = perReel * Math.max(1, count) * 0.0008;
    return {
      dur: `${duration}с`,
      time: perReel >= 60 ? `${Math.round(perReel / 60)}м` : `${perReel}с`,
      price: `$${price < 1 ? price.toFixed(2) : price.toFixed(1)}`,
    };
  }, [duration, quality, count]);

  function setStep(k: StepKey, s: StepState) {
    setSteps((prev) => ({ ...prev, [k]: s }));
  }
  function resetSteps() {
    setSteps({ persona: "idle", product: "idle", video: "idle", voice: "idle", mux: "idle" });
    setProgress(0);
  }

  async function onRefAudio(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("Аудио-референс больше 8 МБ — сократи до 5–15 секунд"); return; }
    setError("");
    setRefAudio({ field: "prompt_audio", name: file.name.replace(/[^a-z0-9._-]/gi, "_"), dataUrl: await readFileAsDataUrl(file) });
  }

  async function generateScript() {
    setGenBusy(true); setError("");
    try {
      const r = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, duration }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "script failed");
      setPersona(d.persona || persona);
      setVoiceover(d.voiceover || voiceover);
      setScenes(Array.isArray(d.scenes) ? d.scenes : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenBusy(false);
    }
  }

  async function runOne(seed: number): Promise<Reel> {
    const q = QUALITY[quality];
    resetSteps();

    const chosenProduct = libProduct.find((a) => a.id === selProduct);
    const chosenPersona = libPersona.find((a) => a.id === selPersona);
    const chosenVoice = libVoice.find((a) => a.id === selVoice);

    let productImg: string | null = null;

    if (chosenProduct) {
      // готовый товар-кадр из библиотеки → пропускаем персонажа и товар
      setStep("persona", "done"); setStep("product", "done");
      productImg = chosenProduct.dataUrl;
      setProgress(40);
    } else {
      let personaImg: string | null;
      if (chosenPersona) {
        setStep("persona", "done");
        personaImg = chosenPersona.dataUrl;
      } else {
        setStep("persona", "run");
        const pOut = await runStep("persona", { prompt: persona, seed });
        personaImg = await firstImageDataUrl(pOut);
        setStep("persona", "done");
      }
      setStep("product", "run");
      const prOut = await runStep(
        "product",
        { prompt: persona, denoise: 0.55, seed },
        personaImg ? [{ field: "image", name: "person.png", dataUrl: personaImg }] : []
      );
      productImg = (await firstImageDataUrl(prOut)) || personaImg;
      setStep("product", "done"); setProgress(40);
    }

    setStep("video", "run");
    const vOut = await runStep(
      "video",
      { prompt: persona, length: durToFrames(duration), width: q.w, height: q.h, steps: q.steps, seed },
      productImg ? [{ field: "image", name: "start.png", dataUrl: productImg }] : []
    );
    const video = videoSrc(vOut);
    setStep("video", "done"); setProgress(70);

    let audio: string | null = null;
    const voiceRef = chosenVoice
      ? { field: "prompt_audio", name: "voice.wav", dataUrl: chosenVoice.dataUrl }
      : refAudio;
    const voicePrompt = chosenVoice ? (chosenVoice.meta?.transcript || "") : promptText;
    if (voiceRef) {
      setStep("voice", "run");
      const aOut = await runStep("voice", {
        mode: "zero_shot", text: voiceover, prompt_text: voicePrompt, speed: 1,
      }, [voiceRef]);
      audio = audioSrc(aOut);
      setStep("voice", "done");
    } else {
      setStep("voice", "skip");
    }
    setProgress(90);

    setStep("mux", "run");
    await sleep(300);
    setStep("mux", "done"); setProgress(100);

    return { video, audio, label: `${quality}p · ${duration}с` };
  }

  async function run() {
    setRunning(true); setError(""); setReels([]);
    setElapsed(0);
    const t0 = Date.now();
    elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    try {
      const n = Math.max(1, Math.min(20, Math.round(count)));
      for (let i = 0; i < n; i++) {
        setBatchLabel(`ролик ${i + 1} из ${n}`);
        const reel = await runOne(Math.floor(Math.random() * 1e9));
        setReels((prev) => [...prev, reel]);
      }
      setBatchLabel("готово");
    } catch (e: any) {
      setError(e.message);
      setSteps((prev) => {
        const cur = (Object.keys(prev) as StepKey[]).find((k) => prev[k] === "run");
        return cur ? { ...prev, [cur]: "err" } : prev;
      });
    } finally {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      setRunning(false);
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <div className="card"><p className="sub" style={{ margin: 0 }}>длительность</p><div style={{ fontSize: 22, fontWeight: 600 }}>{metrics.dur}</div></div>
        <div className="card"><p className="sub" style={{ margin: 0 }}>время ≈ / ролик</p><div style={{ fontSize: 22, fontWeight: 600 }}>{metrics.time}</div></div>
        <div className="card"><p className="sub" style={{ margin: 0 }}>цена ≈ / пачка</p><div style={{ fontSize: 22, fontWeight: 600 }}>{metrics.price}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span className="sub" style={{ margin: 0 }}>Идея → сценарий</span>
          <div style={{ display: "flex", gap: 6 }}>
            {["tpro", "qwen", "giga"].map((m) => (
              <button key={m} className={`chip ${model === m ? "on" : ""}`} onClick={() => setModel(m)}>
                {m === "tpro" ? "T-pro" : m === "qwen" ? "Qwen3" : "GigaChat"}
              </button>
            ))}
          </div>
        </div>
        <input type="text" value={idea} onChange={(e) => setIdea(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {Object.entries(PRESETS).map(([k, v]) => (
            <button key={k} className="chip" onClick={() => setIdea(v.idea)}>
              {k === "ad" ? "реклама" : k === "unbox" ? "распаковка" : "отзыв"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={generateScript} disabled={genBusy}>
            {genBusy ? <><span className="spinner" />пишет…</> : "Сгенерировать сценарий"}
          </button>
        </div>
        {scenes.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {scenes.map((s, i) => (
              <div className="scene" key={i}><span className="tag">{s.t}</span><span>{s.text}</span></div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <span className="sub" style={{ margin: 0 }}>Из библиотеки (готовые ассеты, необязательно)</span>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="field"><label>Персонаж</label>
            <select value={selPersona} onChange={(e) => setSelPersona(e.target.value)}>
              <option value="">— генерировать заново —</option>
              {libPersona.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Товар-кадр (готовый старт-кадр)</label>
            <select value={selProduct} onChange={(e) => setSelProduct(e.target.value)}>
              <option value="">— нет (собрать в пайплайне) —</option>
              {libProduct.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Голос</label>
            <select value={selVoice} onChange={(e) => setSelVoice(e.target.value)}>
              <option value="">— из загрузки ниже —</option>
              {libVoice.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="hint">Пусто? Создай ассет на страницах «Персонаж» / «Товар в кадр» / «Голос» и нажми «Сохранить в библиотеку». Выбор товар-кадра пропускает шаги персонажа и товара.</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field"><label>Промпт персонажа</label><textarea value={persona} onChange={(e) => setPersona(e.target.value)} /></div>
        <div className="field"><label>Текст озвучки (RU)</label><textarea value={voiceover} onChange={(e) => setVoiceover(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Референс голоса (для клона, опц.)</label>
            <input type="file" accept="audio/*" onChange={(e) => onRefAudio(e.target.files?.[0])} />
            {refAudio && <div className="hint">✓ {refAudio.name}</div>}
          </div>
          <div className="field"><label>Расшифровка референса</label>
            <input type="text" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="что сказано в аудио" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 6 }}>
          <div>
            <label className="sub" style={{ display: "block", marginBottom: 6 }}>Длительность</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[15, 30, 45, 60].map((s) => (
                <button key={s} className={`chip ${duration === s ? "on" : ""}`} onClick={() => setDuration(s)}>{s}с</button>
              ))}
            </div>
          </div>
          <div>
            <label className="sub" style={{ display: "block", marginBottom: 6 }}>Качество</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[["480", "480p"], ["720", "720p"], ["1080", "1080p"]].map(([q, l]) => (
                <button key={q} className={`chip ${quality === q ? "on" : ""}`} onClick={() => setQuality(q)}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="sub" style={{ margin: 0 }}>роликов</span>
            <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 72 }} />
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={run} disabled={running}>
            {running ? <><span className="spinner" />{batchLabel}</> : "Запустить пайплайн"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="sub" style={{ margin: 0 }}>Конвейер</span>
          <span className="sub" style={{ margin: 0 }}>{progress}% · {fmt(elapsed)}{batchLabel && running ? ` · ${batchLabel}` : ""}</span>
        </div>
        <div className="steprow">
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ display: "contents" }}>
              <div className={`step ${steps[s.key]}`}>
                <div className="pv"><PvIcon d={steps[s.key] === "done" ? PV_CHECK : steps[s.key] === "err" ? PV_X : s.ic} /></div>
                <div className="nm">{s.nm}</div>
                <div className="st">{steps[s.key] === "idle" ? "ожидает" : steps[s.key] === "run" ? "…" : steps[s.key] === "skip" ? "пропущен" : steps[s.key] === "err" ? "ошибка" : "готово"}</div>
              </div>
              {i < STEPS.length - 1 && <span className="chevron">→</span>}
            </div>
          ))}
        </div>
        <div className="track" style={{ marginTop: 14 }}><div className="fill" style={{ width: `${progress}%` }} /></div>
        {error && <div className="status err" style={{ marginTop: 10 }}>Ошибка: {error}</div>}
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <span className="sub" style={{ margin: 0 }}>Готовые ролики</span>
        {reels.length === 0 ? (
          <p className="sub" style={{ marginTop: 8 }}>запусти пайплайн — здесь появится галерея reels</p>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            {reels.map((r, i) => (
              <div className="reel" key={i}>
                <div className="box">
                  {r.video ? <video controls src={r.video} style={{ width: "100%", borderRadius: 8 }} /> : <span className="sub">нет видео</span>}
                </div>
                {r.audio && <audio controls src={r.audio} style={{ width: "100%", marginTop: 6 }} />}
                <div className="hint" style={{ textAlign: "center", marginTop: 4 }}>{r.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
