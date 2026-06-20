# UGC Studio — локальный/облачный конвейер AI-инфлюенсера на RunPod

Панель управления (Next.js) + три serverless-эндпоинта на RunPod для генерации
UGC-роликов с синтетическим персонажем, вставкой товара, видео и русской озвучкой.

Стек выбран по итогам deep-research как **коммерчески-чистый** (Apache/MIT):
Qwen-Image-Edit · Wan 2.2 · CosyVoice 2 / Chatterbox.

## Архитектура

```
                ┌──────────────────────────┐
   браузер ──▶  │  Next.js панель (Vercel)  │   ключ RunPod только на сервере
                │  app/  +  /api проксирует  │
                └────────────┬─────────────┘
                             │  api.runpod.ai/v2/{id}/run · /status
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                     ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │  image    │        │  video    │        │  voice    │   3 serverless endpoints
  │ worker-   │        │ worker-   │        │ CosyVoice2│
  │ comfyui   │        │ comfyui   │        │ (custom)  │
  │ Qwen-Edit │        │ Wan 2.2   │        │           │
  └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
        └──────── веса на RunPod Network Volume (/runpod-volume/models) ───────┘
```

- **image** и **video** — на базе официального `runpod/worker-comfyui`
  (контракт `input.workflow` + `input.images`, веса монтируются с network volume).
- **voice** — лёгкий кастомный handler с CosyVoice 2 (русский + клон голоса).
- Веса больших моделей лежат на **Network Volume**, а не запекаются в образ —
  образы остаются лёгкими, веса заливаются один раз.

## Структура репозитория

```
ugc-studio/
├── workers/            # три serverless-воркера (Docker)
│   ├── image/          # ComfyUI + Qwen-Image-Edit (персонаж + товар)
│   ├── video/          # ComfyUI + Wan 2.2 (I2V / S2V talking-head)
│   └── voice/          # CosyVoice 2 (кастомный handler)
├── deploy/             # авто-деплой эндпоинтов через RunPod REST API
│   ├── config.json     # GPU и worker-настройки на каждый эндпоинт
│   ├── deploy.mjs      # node-скрипт: volume → templates → endpoints
│   └── populate-volume.md
└── web/                # Next.js панель управления
```

## Быстрый старт (3 шага)

1. **Собрать и запушить образы** (один раз) — см. `workers/README.md`.
2. **Создать эндпоинты через API** — `cd deploy && RUNPOD_API_KEY=… node deploy.mjs`.
   Скрипт создаёт network volume, templates и три endpoint'а и печатает их ID.
3. **Запустить панель** — скопировать ID в `web/.env.local`, `cd web && npm i && npm run dev`.

Подробности: `DEPLOY.md`, `workers/README.md`, `deploy/populate-volume.md`.

## Что НЕ делает этот репозиторий

- Не собирает и не пушит Docker-образы за тебя (нужен твой Docker Hub/GHCR).
- Не заливает веса моделей на volume (делается один раз через Pod, см. populate-volume.md).
- RunPod REST API создаёт эндпоинты, но образ должен уже быть в реестре.

Всё остальное (создание эндпоинтов, очередь задач, UI, проксирование ключа,
построение workflow из параметров) — автоматизировано.
