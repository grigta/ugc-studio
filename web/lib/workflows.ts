// Серверная сборка полезной нагрузки для RunPod из параметров формы.
import "server-only";
import type { EndpointKey } from "./runpod";

import persona from "../workflows/persona.json";
import productInsert from "../workflows/product_insert.json";
import wanI2V from "../workflows/wan_i2v.json";

type Target = [string, string]; // [nodeId, inputName]
type Binding = Target | Target[];

interface ComfyTool {
  endpoint: EndpointKey;
  template: Record<string, any>;
  bindings: Record<string, Binding>; // имя поля формы -> куда подставить в граф
  imageFields: string[]; // поля-файлы, чьё имя проставляется в LoadImage
}

const COMFY: Record<string, ComfyTool> = {
  persona: {
    endpoint: "image",
    template: persona as any,
    bindings: {
      prompt: ["6", "text"],
      negative: ["7", "text"],
      width: ["5", "width"],
      height: ["5", "height"],
      steps: ["3", "steps"],
      cfg: ["3", "cfg"],
      seed: ["3", "seed"],
    },
    imageFields: [],
  },
  product: {
    endpoint: "image",
    template: productInsert as any,
    bindings: {
      prompt: ["6", "text"],
      negative: ["7", "text"],
      denoise: ["3", "denoise"],
      seed: ["3", "seed"],
      image: ["10", "image"],
    },
    imageFields: ["image"],
  },
  video: {
    endpoint: "video",
    template: wanI2V as any,
    bindings: {
      prompt: ["6", "text"],
      negative: ["7", "text"],
      length: ["8", "length"],
      width: ["8", "width"],
      height: ["8", "height"],
      steps: [["11", "steps"], ["12", "steps"]],
      seed: [["11", "noise_seed"], ["12", "noise_seed"]],
      image: ["5", "image"],
    },
    imageFields: ["image"],
  },
};

export interface UploadedFile {
  field: string;
  name: string;
  dataUrl: string; // data:<mime>;base64,...
}

export interface BuiltJob {
  endpoint: EndpointKey;
  input: Record<string, any>;
}

function setTarget(graph: Record<string, any>, [nodeId, input]: Target, value: unknown) {
  const node = graph[nodeId];
  if (!node || !node.inputs) return;
  const current = node.inputs[input];
  // сохраняем числовой тип, если в шаблоне было число
  node.inputs[input] = typeof current === "number" ? Number(value) : value;
}

export function buildJob(
  toolKey: string,
  params: Record<string, any>,
  files: UploadedFile[]
): BuiltJob {
  // голос — отдельный контракт (кастомный handler)
  if (toolKey === "voice") {
    const ref = files.find((f) => f.field === "prompt_audio");
    return {
      endpoint: "voice",
      input: {
        mode: params.mode || "zero_shot",
        text: params.text,
        prompt_text: params.prompt_text || "",
        prompt_audio: ref?.dataUrl,
        instruct: params.instruct || "",
        speed: Number(params.speed ?? 1),
      },
    };
  }

  const tool = COMFY[toolKey];
  if (!tool) throw new Error(`Неизвестный инструмент: ${toolKey}`);

  const graph: Record<string, any> = JSON.parse(JSON.stringify(tool.template));
  const images: { name: string; image: string }[] = [];

  for (const [field, binding] of Object.entries(tool.bindings)) {
    let value: unknown;
    if (tool.imageFields.includes(field)) {
      const file = files.find((f) => f.field === field);
      if (!file) continue; // картинку не приложили — оставить дефолт графа
      value = file.name;
      // worker-comfyui ожидает чистый base64 без data-URI префикса
      const raw = file.dataUrl.includes(",") ? file.dataUrl.split(",")[1] : file.dataUrl;
      images.push({ name: file.name, image: raw });
    } else {
      if (params[field] === undefined || params[field] === "") continue;
      value = params[field];
    }
    const targets: Target[] = Array.isArray(binding[0]) ? (binding as Target[]) : [binding as Target];
    for (const t of targets) setTarget(graph, t, value);
  }

  return {
    endpoint: tool.endpoint,
    input: images.length ? { workflow: graph, images } : { workflow: graph },
  };
}
