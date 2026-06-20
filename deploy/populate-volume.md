# Заливка весов на Network Volume

Веса больших моделей лежат на Network Volume и монтируются в воркеры по пути
`/runpod-volume`. Заливаются один раз. Volume жёстко привязан к одному датацентру
(тот же `dataCenterId`, что в `config.json`) — все 3 эндпоинта должны его использовать.

## Шаг 1. Поднять временный Pod с этим volume

В RunPod Console → Pods → Deploy, выбери тот же датацентр, прикрепи
network volume `ugc-studio-weights`. На Pod он монтируется в `/workspace`
(на serverless тот же том будет в `/runpod-volume`).

## Шаг 2. Скачать веса в раскладку ComfyUI

```bash
cd /workspace
mkdir -p models/{diffusion_models,text_encoders,vae,loras,checkpoints} CosyVoice2-0.5B

# --- Qwen-Image-Edit (image endpoint) ---
huggingface-cli download Comfy-Org/Qwen-Image-Edit_ComfyUI \
  split_files/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors \
  --local-dir models/diffusion_models --local-dir-use-symlinks False
huggingface-cli download Comfy-Org/Qwen-Image_ComfyUI \
  split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
  split_files/vae/qwen_image_vae.safetensors \
  --local-dir models --local-dir-use-symlinks False

# --- Wan 2.2 (video endpoint) ---
huggingface-cli download Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
  split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors \
  split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors \
  split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  split_files/vae/wan_2.1_vae.safetensors \
  --local-dir models --local-dir-use-symlinks False

# --- CosyVoice 2 (voice endpoint) ---
huggingface-cli download FunAudioLLM/CosyVoice2-0.5B --local-dir CosyVoice2-0.5B
```

Итоговая раскладка на volume:

```
/runpod-volume/
├── models/
│   ├── diffusion_models/   qwen_image_edit_2509_fp8...  wan2.2_i2v_*_14B_fp8...
│   ├── text_encoders/      qwen_2.5_vl_7b_fp8...        umt5_xxl_fp8...
│   ├── vae/                qwen_image_vae...            wan_2.1_vae...
│   └── loras/              (твоя character-LoRA сюда)
└── CosyVoice2-0.5B/        (веса CosyVoice)
```

## Шаг 3. Удалить временный Pod

Volume и данные останутся. Serverless-воркеры подхватят их из `/runpod-volume`.

> Точные имена файлов/репозиториев сверь на HuggingFace (Comfy-Org публикует
> упакованные под ComfyUI версии). Если версия модели иная — поправь имена в
> workflow-шаблонах (`web/workflows/*.json`).
