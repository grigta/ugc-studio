# Воркеры (3 serverless-эндпоинта)

| Эндпоинт | База | Модели | Контракт входа |
|---|---|---|---|
| `image` | `runpod/worker-comfyui` | Qwen-Image-Edit (персонаж + товар) | `{workflow, images[]}` |
| `video` | `runpod/worker-comfyui` | Wan 2.2 I2V / S2V | `{workflow, images[]}` |
| `voice` | кастомный | CosyVoice 2 | `{mode, text, prompt_audio, ...}` |

## 1. Собрать и запушить образы (один раз)

```bash
DOCKER_USER=<твой_логин_dockerhub>

docker build --platform linux/amd64 -t $DOCKER_USER/ugc-image-worker:1.0 workers/image
docker build --platform linux/amd64 -t $DOCKER_USER/ugc-video-worker:1.0 workers/video
docker build --platform linux/amd64 -t $DOCKER_USER/ugc-voice-worker:1.0 workers/voice

docker push $DOCKER_USER/ugc-image-worker:1.0
docker push $DOCKER_USER/ugc-video-worker:1.0
docker push $DOCKER_USER/ugc-voice-worker:1.0
```

> `--platform linux/amd64` обязателен (особенно на Apple Silicon) — иначе воркер
> не стартует на инфраструктуре RunPod.

Пропиши эти имена образов в `deploy/config.json` (`imageName`).

### Вариант Б — без локального Docker, сборка в GitHub Actions

В репозитории есть workflow `.github/workflows/build-workers.yml`: собирает все 3
образа на раннере GitHub (нативно `linux/amd64`) и пушит в **ghcr.io** под именами
`ghcr.io/<owner>/ugc-{image,video,voice}-worker:<tag>`. Авторизация — встроенным
`GITHUB_TOKEN`, секреты не нужны.

1. Запушь репозиторий на GitHub.
2. Actions → **build-workers** → Run workflow (или просто push в `main`).
3. После сборки сделай пакеты публичными: GitHub → Packages → каждый
   `ugc-*-worker` → Package settings → Change visibility → Public.
   (Иначе RunPod не сможет тянуть приватный образ без registry-кредов.)
4. Впиши `ghcr.io/<owner>/ugc-*-worker:1.0` в `deploy/config.json` → `imageName`.

> Приватные образы тоже можно — тогда в RunPod заведи Container Registry Credentials
> и передай `containerRegistryAuthId` при создании template (см. RunPod docs).

## 2. Контракт ComfyUI-воркеров (image / video)

Воркер принимает **ComfyUI-граф в API-формате** (в ComfyUI: меню → Save (API Format))
и входные картинки как base64:

```json
{
  "input": {
    "workflow": { "...": "ComfyUI API graph" },
    "images": [ { "name": "ref.png", "image": "data:image/png;base64,..." } ]
  }
}
```

Ответ по умолчанию — base64 PNG/видео; если задан `BUCKET_ENDPOINT_URL` —
presigned S3-URL. Готовые шаблоны графов лежат в `workers/*/workflows/*.json`
с плейсхолдерами `%prompt%`, `%seed%`, `%image_name%` и т.п. — панель подставляет
параметры (`web/lib/workflows.ts`).

### Как получить точный граф под свои версии моделей
Хэндкрафтить API-граф Wan 2.2 / Qwen-Image-Edit вслепую рискованно (меняются
имена нод между версиями). Надёжный путь:
1. Локально в ComfyUI собери рабочий граф (официальные шаблоны Wan 2.2 / Qwen-Edit).
2. Save (API Format) → JSON.
3. Замени в нём изменяемые значения на плейсхолдеры (`%prompt%`, `%image_name%`…).
4. Положи в `workers/<endpoint>/workflows/` и в `web/workflows/`.

Шаблоны в репозитории — рабочая отправная точка; сверь ID нод со своим экспортом.

## 3. Веса — на Network Volume, не в образе

Большие веса (Wan ~28–56 ГБ, Qwen 20B, CosyVoice) кладутся на RunPod Network
Volume и монтируются в воркер по пути `/runpod-volume`. Раскладка и заливка —
`deploy/populate-volume.md`. Так образы остаются лёгкими, а веса заливаются однажды.

## 4. Локальная отладка ComfyUI-воркера без RunPod

```bash
SERVE_API_LOCALLY=true python handler.py
curl -X POST http://localhost:8000/runsync -H 'Content-Type: application/json' -d @test_input.json
```
