// Серверный клиент RunPod. Импортируется ТОЛЬКО в /api роутах — ключ не уходит в браузер.
import "server-only";

const API = "https://api.runpod.ai/v2";

export type EndpointKey = "image" | "video" | "voice" | "script";

export const ENDPOINT_IDS: Record<EndpointKey, string | undefined> = {
  image: process.env.RUNPOD_IMAGE_ENDPOINT_ID,
  video: process.env.RUNPOD_VIDEO_ENDPOINT_ID,
  voice: process.env.RUNPOD_VOICE_ENDPOINT_ID,
  script: process.env.RUNPOD_SCRIPT_ENDPOINT_ID,
};

function key(): string {
  const k = process.env.RUNPOD_API_KEY;
  if (!k) throw new Error("RUNPOD_API_KEY не задан (web/.env.local)");
  return k;
}

function endpointId(ep: EndpointKey): string {
  const id = ENDPOINT_IDS[ep];
  if (!id) throw new Error(`ID эндпоинта '${ep}' не задан (RUNPOD_${ep.toUpperCase()}_ENDPOINT_ID)`);
  return id;
}

async function call(ep: EndpointKey, route: string, method: "GET" | "POST", body?: unknown) {
  const res = await fetch(`${API}/${endpointId(ep)}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`RunPod ${ep}${route} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// async-постановка задачи -> { id, status: "IN_QUEUE" }
export function runJob(ep: EndpointKey, input: unknown, webhook?: string) {
  return call(ep, "/run", "POST", webhook ? { input, webhook } : { input });
}

// статус задачи -> { status, output?, delayTime?, executionTime? }
export function getStatus(ep: EndpointKey, jobId: string) {
  return call(ep, `/status/${jobId}`, "GET");
}

export function cancelJob(ep: EndpointKey, jobId: string) {
  return call(ep, `/cancel/${jobId}`, "POST");
}

// здоровье эндпоинта -> { jobs:{...}, workers:{idle,running} }
export function getHealth(ep: EndpointKey) {
  return call(ep, "/health", "GET");
}

// OpenAI-совместимый чат (vLLM-воркер) -> стандартный ответ chat/completions
export function chatCompletion(ep: EndpointKey, body: Record<string, unknown>) {
  return call(ep, "/openai/v1/chat/completions", "POST", body);
}

export function isConfigured(ep: EndpointKey): boolean {
  return Boolean(process.env.RUNPOD_API_KEY && ENDPOINT_IDS[ep]);
}
