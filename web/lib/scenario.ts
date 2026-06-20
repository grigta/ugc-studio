// Серверная генерация сценария из идеи через LLM-эндпоинт (vLLM, OpenAI-совместимый).
import "server-only";
import { chatCompletion } from "./runpod";

export interface Scenario {
  persona: string;   // промпт внешности/сцены персонажа
  motion: string;    // промпт движения для видео
  voiceover: string; // текст озвучки целиком (RU)
  scenes: { t: string; text: string }[];
}

const MODEL = process.env.RUNPOD_SCRIPT_MODEL || "Qwen/Qwen2.5-7B-Instruct";

const SYSTEM = `Ты — топовый сценарист вертикальных UGC-роликов (Reels/TikTok) и сильный копирайтер. Пишешь как реальный человек, а не как реклама.

Правила для voiceover (его читает TTS вслух — это самое важное):
- живой разговорный русский от первого лица, естественный устный ритм;
- ПЕРВАЯ фраза — мощный хук: боль, интрига или неожиданное утверждение (НЕ "привет, друзья/девочки");
- конкретика и польза, а не вода; без клише ("чудо-средство", "просто космос", "маст-хэв");
- БЕЗ эмодзи, БЕЗ хэштегов, БЕЗ markdown и спецсимволов (TTS их зачитает или сломается);
- финал — один чёткий короткий призыв к действию;
- длина строго под хронометраж (ориентир по словам указан в запросе, ≈2.5 слова/сек), не больше.

persona и motion — на АНГЛИЙСКОМ (для image/video-моделей), конкретно: внешность, свет, кадр, эмоция / характер движения.
scenes — краткие визуальные ремарки на русском.

Верни СТРОГО валидный JSON, без markdown и без текста вокруг:
{
 "persona": "<english prompt: look, lighting, framing>",
 "motion": "<english prompt: motion/gestures>",
 "voiceover": "<разговорный русский текст озвучки, хук → суть → один CTA, без эмодзи>",
 "scenes": [ {"t":"0–2с хук","text":"..."}, {"t":"2–Xс","text":"..."}, {"t":"финал · CTA","text":"..."} ]
}`;

function extractJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// чистим озвучку для TTS: убираем эмодзи, хэштеги, markdown
function cleanVoice(s: string): string {
  return (s || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{2122}]/gu, "")
    .replace(/[#*_`>]+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function generateScenario(idea: string, durationSec: number): Promise<Scenario> {
  const words = Math.round(durationSec * 2.5);
  const res = await chatCompletion("script", {
    model: MODEL,
    temperature: 0.7,
    max_tokens: 800,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Идея: ${idea}\nДлительность ролика: ${durationSec} секунд → озвучка примерно ${words} слов.\nСделай хук цепким и конкретным, без клише и эмодзи. Верни только JSON.` },
    ],
  });

  const content: string = res?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);

  if (parsed && parsed.voiceover) {
    return {
      persona: parsed.persona || "young blogger, soft daylight, vertical close-up",
      motion: parsed.motion || "talking to camera, natural gestures, holding product",
      voiceover: cleanVoice(parsed.voiceover),
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    };
  }

  // fallback: модель вернула не-JSON — используем текст как озвучку
  return {
    persona: "young blogger, soft daylight, vertical close-up",
    motion: "talking to camera, natural gestures, holding product",
    voiceover: cleanVoice(content) || `Расскажу про: ${idea}`,
    scenes: [],
  };
}
