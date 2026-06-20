// Реестр инструментов (без секретов) — используется и на клиенте (формы), и на сервере.
import type { EndpointKey } from "./runpod";

export type FieldType = "text" | "textarea" | "number" | "seed" | "image" | "audio" | "select";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  default?: string | number;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  hint?: string;
}

export interface Tool {
  key: "persona" | "product" | "video" | "talkinghead" | "voice";
  label: string;
  description: string;
  endpoint: EndpointKey;
  output: "image" | "video" | "audio";
  needsExport?: boolean; // граф — шаблон, замени своим Save (API Format)
  // что сохранять в библиотеку для повторного выбора в авто-пайплайне
  librarySave?: { type: "persona" | "product" | "voice"; source: "image" | "voiceRef" };
  fields: Field[];
}

export const TOOLS: Tool[] = [
  {
    key: "persona",
    label: "Персонаж",
    description: "Сгенерировать лицо синтетического персонажа (txt2img). Прод: Qwen-Image / своя LoRA.",
    endpoint: "image",
    output: "image",
    librarySave: { type: "persona", source: "image" },
    fields: [
      { name: "prompt", label: "Промпт", type: "textarea", default: "photorealistic portrait of a young woman, soft studio light, 85mm", placeholder: "опиши персонажа (на английском)" },
      { name: "negative", label: "Negative", type: "textarea", default: "lowres, bad anatomy, watermark, text" },
      { name: "width", label: "Ширина", type: "number", default: 832, step: 64 },
      { name: "height", label: "Высота", type: "number", default: 1216, step: 64 },
      { name: "steps", label: "Шаги", type: "number", default: 30, min: 1, max: 60 },
      { name: "cfg", label: "CFG", type: "number", default: 6, step: 0.5 },
      { name: "seed", label: "Seed", type: "seed", default: 0 },
    ],
  },
  {
    key: "product",
    label: "Товар в кадр",
    description: "Вставить товар к персонажу (демо: SDXL img2img). Прод: Qwen-Image-Edit person+product.",
    endpoint: "image",
    output: "image",
    librarySave: { type: "product", source: "image" },
    fields: [
      { name: "image", label: "Фото персонажа", type: "image", hint: "PNG/JPG" },
      { name: "prompt", label: "Промпт", type: "textarea", default: "person holding a product, studio light", placeholder: "что вставить / как изменить" },
      { name: "negative", label: "Negative", type: "textarea", default: "lowres, deformed hands, artifacts" },
      { name: "denoise", label: "Denoise", type: "number", default: 0.55, min: 0.1, max: 1, step: 0.05, hint: "ниже = ближе к исходнику" },
      { name: "seed", label: "Seed", type: "seed", default: 0 },
    ],
  },
  {
    key: "video",
    label: "Видео (Wan 2.2)",
    description: "Оживить картинку в ролик (I2V). Граф — шаблон Wan 2.2, сверь со своим экспортом.",
    endpoint: "video",
    output: "video",
    needsExport: true,
    fields: [
      { name: "image", label: "Стартовый кадр", type: "image", hint: "первый кадр ролика" },
      { name: "prompt", label: "Промпт движения", type: "textarea", default: "a person talking, natural motion, cinematic" },
      { name: "negative", label: "Negative", type: "textarea", default: "static, distorted, low quality" },
      { name: "length", label: "Кадров", type: "number", default: 81, min: 17, max: 161, step: 4, hint: "81 ≈ 5с при 16fps" },
      { name: "width", label: "Ширина", type: "number", default: 832, step: 16 },
      { name: "height", label: "Высота", type: "number", default: 480, step: 16 },
      { name: "steps", label: "Шаги", type: "number", default: 20, min: 1, max: 40 },
      { name: "seed", label: "Seed", type: "seed", default: 0 },
    ],
  },
  {
    key: "talkinghead",
    label: "Говорящая голова",
    description: "Аудио-driven: фото + голос → говорящее видео с липсинком и движением (Wan2.2-S2V).",
    endpoint: "video",
    output: "video",
    needsExport: true,
    fields: [
      { name: "image", label: "Фото персонажа (кадр)", type: "image", hint: "лицо/портрет, который заговорит" },
      { name: "audio", label: "Аудио речи (WAV)", type: "audio", hint: "озвучка — лучше 16 кГц моно" },
      { name: "prompt", label: "Промпт", type: "textarea", default: "a person talking to camera, natural expression, cinematic" },
      { name: "negative", label: "Negative", type: "textarea", default: "static, distorted, bad lips, low quality" },
      { name: "length", label: "Кадров", type: "number", default: 77, min: 25, max: 161, step: 4, hint: "77 ≈ 5с @16fps; длиннее = дольше" },
      { name: "width", label: "Ширина", type: "number", default: 576, step: 16 },
      { name: "height", label: "Высота", type: "number", default: 1024, step: 16 },
      { name: "seed", label: "Seed", type: "seed", default: 0 },
    ],
  },
  {
    key: "voice",
    label: "Голос (RU + клон)",
    description: "Озвучка на русском с клонированием голоса по референсу (CosyVoice 2).",
    endpoint: "voice",
    output: "audio",
    librarySave: { type: "voice", source: "voiceRef" },
    fields: [
      { name: "text", label: "Текст (русский)", type: "textarea", default: "Привет! Сегодня покажу новинку.", placeholder: "что произнести" },
      { name: "mode", label: "Режим", type: "select", default: "zero_shot", options: [
        { value: "zero_shot", label: "Клон по референсу" },
        { value: "instruct", label: "Инструкция (стиль)" },
      ] },
      { name: "prompt_text", label: "Расшифровка референса", type: "text", hint: "что сказано в референс-аудио (для клона)" },
      { name: "prompt_audio", label: "Референс голоса", type: "audio", hint: "5–15с WAV/MP3" },
      { name: "speed", label: "Скорость", type: "number", default: 1, min: 0.5, max: 2, step: 0.1 },
    ],
  },
];

export function getTool(key: string): Tool | undefined {
  return TOOLS.find((t) => t.key === key);
}
