# image worker — ComfyUI + Qwen-Image-Edit (персонаж + вставка товара)
# База: официальный RunPod ComfyUI serverless worker.
# Контракт воркера (наследуется от базы): job.input = { workflow, images[] }.
# Проверь актуальный тег на https://hub.docker.com/r/runpod/worker-comfyui/tags
FROM runpod/worker-comfyui:5.8.6-base-cuda12.8.1

# Кастомные ноды из ComfyUI Registry (имена — по comfy registry).
# kjnodes — утилиты; videohelpersuite не нужен для image, но safe.
RUN comfy-node-install comfyui-kjnodes

# Веса НЕ запекаем в образ — они лежат на Network Volume и монтируются
# в /runpod-volume; база worker-comfyui сама подхватывает
# /runpod-volume/models/{checkpoints,diffusion_models,text_encoders,vae,loras}.
# Если хочешь запечь модель в образ (без volume) — раскомментируй:
# RUN comfy model download \
#   --url https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors \
#   --relative-path models/diffusion_models

# build:  docker build --platform linux/amd64 -t <user>/ugc-image-worker:1.0 workers/image
# push:   docker push <user>/ugc-image-worker:1.0
