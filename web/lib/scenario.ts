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

const SYSTEM = `Ты — сценарист коротких вертикальных UGC-роликов (TikTok / Instagram Reels) на русском языке.
По идее товара и длительности придумай продающий, живой сценарий от лица блогера.
Верни СТРОГО валидный JSON без markdown, по схеме:
{
 "persona": "<англ. промпт внешности и сцены персонажа для image-модели>",
 "motion": "<англ. промпт движения для видео-модели>",
 "voiceover": "<полный текст озвучки на русском, разговорный, с хуком в начале и CTA в конце>",
 "scenes": [ {"t":"0–2с хук","text":"..."}, {"t":"2–10с","text":"..."}, {"t":"финал · CTA","text":"..."} ]
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

export async function generateScenario(idea: string, durationSec: number): Promise<Scenario> {
  const res = await chatCompletion("script", {
    model: MODEL,
    temperature: 0.8,
    max_tokens: 700,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Идея: ${idea}\nДлительность ролика: ${durationSec} секунд.\nВерни только JSON.` },
    ],
  });

  const content: string = res?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);

  if (parsed && parsed.voiceover) {
    return {
      persona: parsed.persona || "young blogger, soft daylight, vertical close-up",
      motion: parsed.motion || "talking to camera, natural gestures, holding product",
      voiceover: parsed.voiceover,
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    };
  }

  // fallback: модель вернула не-JSON — используем текст как озвучку
  return {
    persona: "young blogger, soft daylight, vertical close-up",
    motion: "talking to camera, natural gestures, holding product",
    voiceover: content.trim() || `Расскажу про: ${idea}`,
    scenes: [],
  };
}
