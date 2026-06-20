#!/usr/bin/env node
// Авто-деплой 3 serverless-эндпоинтов через RunPod REST API.
// Создаёт: network volume -> templates -> endpoints. Образы должны быть уже в реестре.
//
//   RUNPOD_API_KEY=xxxx node deploy.mjs
//   RUNPOD_API_KEY=xxxx node deploy.mjs --skip-volume   # не создавать volume заново
//
// Результат пишется в deploy/.deployed.json и печатается готовый блок для web/.env.local.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REST = "https://rest.runpod.io/v1";
const API_KEY = process.env.RUNPOD_API_KEY;
const skipVolume = process.argv.includes("--skip-volume");

if (!API_KEY) {
  console.error("✗ Установи RUNPOD_API_KEY (https://www.runpod.io/console/user/settings)");
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

async function rp(method, route, body) {
  const res = await fetch(`${REST}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    throw new Error(`${method} ${route} -> ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  }
  return json;
}

function cleanEnv(env = {}) {
  // выкинуть служебные ключи вида _comment и пустые значения
  return Object.fromEntries(
    Object.entries(env).filter(([k, v]) => !k.startsWith("_") && v !== "")
  );
}

async function main() {
  const deployed = { networkVolumeId: null, endpoints: {} };

  // 1) network volume (общий для всех эндпоинтов — один датацентр)
  let networkVolumeId = process.env.RUNPOD_VOLUME_ID || null;
  if (!skipVolume && !networkVolumeId && cfg.networkVolume) {
    console.log(`▸ создаю network volume "${cfg.networkVolume.name}" (${cfg.networkVolume.size} ГБ, ${cfg.networkVolume.dataCenterId})`);
    const vol = await rp("POST", "/networkvolumes", {
      name: cfg.networkVolume.name,
      size: cfg.networkVolume.size,
      dataCenterId: cfg.networkVolume.dataCenterId,
    });
    networkVolumeId = vol.id;
    console.log(`  ✓ volume id: ${networkVolumeId} — залей веса (см. populate-volume.md) перед первым запуском`);
  } else if (networkVolumeId) {
    console.log(`▸ использую существующий volume: ${networkVolumeId}`);
  }
  deployed.networkVolumeId = networkVolumeId;

  // preflight: список доступных GPU-типов (best-effort; имена в gpuTypeIds бывают
  // нестабильны — см. github.com/runpod/docs/issues/633)
  let validGpu = null;
  try {
    const types = await rp("GET", "/gpu-types");
    const arr = Array.isArray(types) ? types : (types?.data || types?.gpuTypes || []);
    const set = new Set();
    for (const t of arr) { if (t?.id) set.add(t.id); if (t?.displayName) set.add(t.displayName); }
    if (set.size) { validGpu = set; console.log(`▸ RunPod знает ${set.size} GPU-типов — валидирую конфиг`); }
  } catch {
    console.log("▸ список GPU-типов недоступен — пропускаю валидацию (беру значения из config.json)");
  }

  // 2) для каждого эндпоинта: template -> endpoint
  for (const ep of cfg.endpoints) {
    if (ep.imageName.startsWith("REPLACE_")) {
      console.error(`✗ ${ep.key}: впиши реальный imageName в config.json (сейчас ${ep.imageName})`);
      process.exit(1);
    }

    console.log(`▸ ${ep.key}: создаю template`);
    const tpl = await rp("POST", "/templates", {
      name: `${ep.name}-tpl`,
      imageName: ep.imageName,
      isServerless: true,
      containerDiskInGb: ep.containerDiskInGb ?? 20,
      volumeInGb: 0,
      env: cleanEnv(ep.env),
    });

    let gpuIds = ep.gpuTypeIds;
    if (validGpu) {
      const ok = gpuIds.filter((g) => validGpu.has(g));
      if (!ok.length) {
        console.error(`✗ ${ep.key}: ни один gpuTypeIds не найден в RunPod (${gpuIds.join(", ")}).`);
        console.error(`  доступные примеры: ${[...validGpu].slice(0, 12).join(", ")}`);
        process.exit(1);
      }
      if (ok.length < gpuIds.length) {
        console.log(`  ! ${ep.key}: отброшены неизвестные GPU: ${gpuIds.filter((g) => !ok.includes(g)).join(", ")}`);
      }
      gpuIds = ok;
    }

    console.log(`▸ ${ep.key}: создаю endpoint (GPU: ${gpuIds.join(" / ")})`);
    const endpoint = await rp("POST", "/endpoints", {
      name: ep.name,
      templateId: tpl.id,
      computeType: "GPU",
      gpuTypeIds: gpuIds,
      gpuCount: ep.gpuCount ?? 1,
      workersMin: ep.workersMin ?? 0,
      workersMax: ep.workersMax ?? 3,
      idleTimeout: ep.idleTimeout ?? 10,
      scalerType: ep.scalerType ?? "QUEUE_DELAY",
      scalerValue: ep.scalerValue ?? 4,
      executionTimeoutMs: ep.executionTimeoutMs ?? 600000,
      ...(networkVolumeId ? { networkVolumeId } : {}),
    });

    deployed.endpoints[ep.key] = { endpointId: endpoint.id, templateId: tpl.id, name: ep.name };
    console.log(`  ✓ ${ep.key} endpoint id: ${endpoint.id}`);
  }

  fs.writeFileSync(path.join(__dirname, ".deployed.json"), JSON.stringify(deployed, null, 2));

  console.log("\n=== ГОТОВО. Скопируй в web/.env.local ===\n");
  console.log(`RUNPOD_API_KEY=${API_KEY}`);
  console.log(`RUNPOD_IMAGE_ENDPOINT_ID=${deployed.endpoints.image?.endpointId ?? ""}`);
  console.log(`RUNPOD_VIDEO_ENDPOINT_ID=${deployed.endpoints.video?.endpointId ?? ""}`);
  console.log(`RUNPOD_VOICE_ENDPOINT_ID=${deployed.endpoints.voice?.endpointId ?? ""}`);
  console.log(`RUNPOD_SCRIPT_ENDPOINT_ID=${deployed.endpoints.script?.endpointId ?? ""}`);
  const scriptModel = cfg.endpoints.find((e) => e.key === "script")?.env?.MODEL_NAME ?? "";
  if (scriptModel) console.log(`RUNPOD_SCRIPT_MODEL=${scriptModel}`);
  console.log("\n(идентификаторы также сохранены в deploy/.deployed.json)");
}

main().catch((e) => {
  console.error("\n✗ Ошибка деплоя:", e.message);
  process.exit(1);
});
