"use client";
import { useRef, useState } from "react";
import type { Tool, Field } from "@/lib/tools";
import { addAsset } from "@/lib/library";

type FilePayload = { field: string; name: string; dataUrl: string };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default function JobRunner({ tool }: { tool: Tool }) {
  const initial: Record<string, any> = {};
  tool.fields.forEach((f) => { if (f.default !== undefined) initial[f.name] = f.default; });

  const [values, setValues] = useState<Record<string, any>>(initial);
  const [files, setFiles] = useState<Record<string, FilePayload>>({});
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string>("");
  const [output, setOutput] = useState<any>(null);
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function set(name: string, v: any) {
    setValues((s) => ({ ...s, [name]: v }));
  }

  async function onFile(field: string, file?: File) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setFiles((s) => ({ ...s, [field]: { field, name: sanitizeName(file.name), dataUrl } }));
  }

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function saveToLibrary() {
    const ls = tool.librarySave;
    if (!ls) return;
    setSaved("");
    try {
      if (ls.source === "image") {
        const it = output?.images?.[0];
        if (!it) { setSaved("нет изображения для сохранения"); return; }
        const dataUrl = it.type === "base64" ? `data:image/png;base64,${it.data}` : it.data;
        await addAsset({ type: ls.type, name: saveName.trim() || tool.label, dataUrl });
      } else {
        const ref = files["prompt_audio"];
        if (!ref) { setSaved("чтобы сохранить голос, приложи референс-аудио"); return; }
        await addAsset({
          type: "voice",
          name: saveName.trim() || "голос",
          dataUrl: ref.dataUrl,
          meta: { transcript: values["prompt_text"] || "" },
        });
      }
      setSaved("✓ сохранено в библиотеку — теперь доступно в авто-пайплайне");
      setSaveName("");
    } catch (e: any) {
      setSaved("ошибка сохранения: " + e.message);
    }
  }

  async function run() {
    setError(""); setOutput(null); setStatus("submitting");
    stopPoll();
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.key, params: values, files: Object.values(files) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка запуска");
      setStatus(data.status || "IN_QUEUE");
      poll(data.endpoint, data.jobId);
    } catch (e: any) {
      setStatus("error"); setError(e.message);
    }
  }

  function poll(endpoint: string, jobId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?endpoint=${endpoint}&jobId=${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "status error");
        setStatus(data.status);
        if (data.status === "COMPLETED") { stopPoll(); setOutput(data.output); }
        else if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(data.status)) {
          stopPoll(); setError(JSON.stringify(data.output ?? data.error ?? data.status));
        }
      } catch (e: any) { stopPoll(); setStatus("error"); setError(e.message); }
    }, 2500);
  }

  const busy = ["submitting", "IN_QUEUE", "IN_PROGRESS"].includes(status);

  return (
    <div>
      {tool.needsExport && (
        <div className="notice">
          Граф этого инструмента — шаблон Wan 2.2. Сверь ID нод со своим экспортом
          из ComfyUI (Save · API Format) в <code>web/workflows/wan_i2v.json</code>.
        </div>
      )}

      {tool.fields.map((f) => (
        <FieldInput
          key={f.name}
          field={f}
          value={values[f.name]}
          file={files[f.name]}
          onChange={(v) => set(f.name, v)}
          onFile={(file) => onFile(f.name, file)}
        />
      ))}

      <button className="btn" onClick={run} disabled={busy}>
        {busy ? <><span className="spinner" />Генерация…</> : "Запустить"}
      </button>

      {(status !== "idle") && (
        <div className="panel-out">
          <div className={`status ${error ? "err" : ""}`}>
            {error ? `Ошибка: ${error}` : `Статус: ${status}`}
          </div>
          {output && <Result tool={tool} output={output} />}
          {output && tool.librarySave && (
            <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
              <input type="text" placeholder="название для библиотеки" value={saveName}
                onChange={(e) => setSaveName(e.target.value)} style={{ flex: 1 }} />
              <button className="btn secondary" onClick={saveToLibrary}>Сохранить в библиотеку</button>
            </div>
          )}
          {saved && <div className="hint" style={{ marginTop: 6 }}>{saved}</div>}
          {output && (
            <details>
              <summary>raw output</summary>
              <pre>{JSON.stringify(output, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field, value, file, onChange, onFile,
}: {
  field: Field; value: any; file?: FilePayload;
  onChange: (v: any) => void; onFile: (f?: File) => void;
}) {
  const f = field;
  return (
    <div className="field">
      <label>{f.label}</label>
      {f.type === "textarea" && (
        <textarea value={value ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {f.type === "text" && (
        <input type="text" value={value ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {f.type === "number" && (
        <input type="number" value={value ?? ""} min={f.min} max={f.max} step={f.step}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      )}
      {f.type === "seed" && (
        <div className="row">
          <input type="number" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
          <button type="button" className="btn secondary" onClick={() => onChange(Math.floor(Math.random() * 1e9))}>
            🎲
          </button>
        </div>
      )}
      {f.type === "select" && (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {(f.type === "image" || f.type === "audio") && (
        <input type="file" accept={f.type === "image" ? "image/*" : "audio/*"}
          onChange={(e) => onFile(e.target.files?.[0])} />
      )}
      {file && <div className="hint">✓ {file.name}</div>}
      {f.hint && <div className="hint">{f.hint}</div>}
    </div>
  );
}

function Result({ tool, output }: { tool: Tool; output: any }) {
  if (tool.output === "audio") {
    const src = output?.audio_url || (output?.audio ? `data:audio/wav;base64,${output.audio}` : null);
    return src ? <div className="result"><audio controls src={src} /></div> : null;
  }
  const items: any[] = output?.images || [];
  return (
    <div className="result">
      {items.map((it, i) => {
        const isVideo = /\.(mp4|webm|mov)$/i.test(it.filename || "");
        const src = it.type === "s3_url" || it.type === "url"
          ? it.data
          : `data:${isVideo ? "video/mp4" : "image/png"};base64,${it.data}`;
        return isVideo
          ? <video key={i} controls src={src} />
          : <img key={i} src={src} alt={it.filename || `out-${i}`} />;
      })}
    </div>
  );
}
