# video worker — ComfyUI + Wan 2.2 (I2V / Animate / S2V talking-head)
# База: официальный RunPod ComfyUI serverless worker.
# Проверь актуальный тег: https://hub.docker.com/r/runpod/worker-comfyui/tags
FROM runpod/worker-comfyui:5.8.6-base-cuda12.8.1

# Ноды для видео: VideoHelperSuite (сборка/вывод видео) + KJNodes (Wan-хелперы,
# WanVideoWrapper-утилиты, блок-свап и пр.).
RUN comfy-node-install comfyui-videohelpersuite comfyui-kjnodes

# Веса Wan 2.2 (high/low-noise эксперты, umt5 text encoder, vae) — на Network
# Volume в /runpod-volume/models/{diffusion_models,text_encoders,vae}.
# Раскладку см. deploy/populate-volume.md.

# Видео из воркера НЕ возвращаем в JSON — заливаем в S3/R2 (env BUCKET_*),
# воркер вернёт presigned URL. См. deploy/config.json -> video.env.

# build:  docker build --platform linux/amd64 -t <user>/ugc-video-worker:1.0 workers/video
# push:   docker push <user>/ugc-video-worker:1.0
