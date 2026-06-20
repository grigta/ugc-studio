# Деплой UGC Studio — пошагово

Предпосылки: аккаунт RunPod + API-ключ, аккаунт Docker Hub (или GHCR), Node 18+,
для сборки образов — Docker. Панель деплоится на Vercel (или локально).

---

## Шаг 1 — собрать и запушить 3 образа воркеров

```bash
DOCKER_USER=<твой_логин>
cd ugc-studio

docker build --platform linux/amd64 -t $DOCKER_USER/ugc-image-worker:1.0 workers/image
docker build --platform linux/amd64 -t $DOCKER_USER/ugc-video-worker:1.0 workers/video
docker build --platform linux/amd64 -t $DOCKER_USER/ugc-voice-worker:1.0 workers/voice

docker push $DOCKER_USER/ugc-image-worker:1.0
docker push $DOCKER_USER/ugc-video-worker:1.0
docker push $DOCKER_USER/ugc-voice-worker:1.0
```

Впиши эти имена в `deploy/config.json` → `imageName` (замени `REPLACE_DOCKER_USER/...`).

> **Нет Docker локально?** Используй CI: `.github/workflows/build-workers.yml`
> собирает и пушит все 3 образа в ghcr.io на раннере GitHub (Actions → build-workers →
> Run workflow). Затем сделай пакеты публичными и впиши `ghcr.io/<owner>/ugc-*-worker:1.0`
> в `config.json`. Подробности — workers/README.md (Вариант Б).

---

## Шаг 2 — создать эндпоинты через RunPod API

```bash
cd deploy
RUNPOD_API_KEY=<твой_ключ> node deploy.mjs
```

Скрипт создаст: network volume → 3 templates → 3 endpoints и напечатает блок для
`web/.env.local`. ID также сохранятся в `deploy/.deployed.json`.

Если volume уже есть: `RUNPOD_VOLUME_ID=<id> node deploy.mjs --skip-volume`.

---

## Шаг 3 — залить веса моделей на network volume (один раз)

Следуй `deploy/populate-volume.md`: подними временный Pod с тем же volume,
скачай веса Qwen-Image-Edit / Wan 2.2 / CosyVoice 2 в раскладку
`/runpod-volume/models/...`, удали Pod.

---

## Шаг 4 — настроить и запустить панель

```bash
cd ../web
cp .env.example .env.local
# вставь в .env.local вывод из шага 2 (RUNPOD_API_KEY + 3 ID эндпоинтов)
npm install
npm run dev          # http://localhost:3000
```

Деплой на Vercel:

```bash
npm i -g vercel
vercel            # импортируй проект (root = web/)
# в Project → Settings → Environment Variables добавь те же 4 переменные
vercel --prod
```

> Ключ RUNPOD_API_KEY читается только в серверных `/api`-роутах и в браузер не попадает.

---

## Проверка

1. Открой дашборд — карточки эндпоинтов должны быть «готов».
2. «Персонаж» → Запустить → через ~10–40с (после прогрева воркера) появится картинка.
3. «Видео» работает после того, как сверишь граф Wan со своим экспортом ComfyUI
   (см. баннер на странице и `workers/README.md`).

## Частые проблемы

- **«не настроен»** на дашборде — не заполнен `web/.env.local` или не перезапущен `npm run dev`.
- **воркер не стартует** — образ собран не под `linux/amd64`, либо веса не залиты на volume.
- **долгий первый ответ** — cold start (workersMin=0). Для мгновенного отклика подними
  `workersMin: 1` в `deploy/config.json` (платишь за активный воркер 24/7).
- **видео не возвращается** — задай S3/R2 креды (`BUCKET_*`) в `config.json` для video-эндпоинта:
  большие файлы отдаются по URL, а не в JSON.

## Известные ограничения MVP

- **Вывод видео.** Граф Wan заканчивается `VHS_VideoCombine`. Чтобы воркер вернул
  файл, нужна версия `worker-comfyui` с поддержкой видео-выходов ИЛИ заданные
  `BUCKET_*` (S3/R2) — тогда воркер зальёт mp4 и вернёт URL. Без этого получишь
  только кадры. Рекомендуется S3/R2 для video-эндпоинта.
- **Длинные ролики.** Один клип Wan ≈ 5–10с (≤161 кадра). Длительность >10с в
  авто-пайплайне упирается в этот предел — для 30–60с нужен ститчинг сегментов
  или InfiniteTalk (вне MVP).
- **Авторизация.** Панель не имеет логина. Перед ПУБЛИЧНЫМ деплоем на Vercel
  добавь защиту (Vercel Password Protection / middleware-аутентификацию) — иначе
  любой с URL сможет жечь твои GPU-кредиты через `/api`.
- **Лимит тела запроса.** На Vercel тело ~4.5 МБ. Крупные фото/аудио-референсы
  лучше сжимать на клиенте; для тяжёлых входов — заливать в своё S3 и слать URL.
- **Сборка звука и видео.** Финальный mux (видео + озвучка в один mp4) в MVP не
  делается на сервере — ролик и аудио показываются рядом. Прод-финализатор —
  ffmpeg-шаг или подача аудио в `VHS_VideoCombine`.
