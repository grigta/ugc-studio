# voice worker — CosyVoice 2 (русский TTS + zero-shot клон голоса), кастомный handler.
# Лёгкий serverless worker без ComfyUI: контракт job.input описан в handler.py.
# voice идёт на A100 (sm_80) в том же ДЦ, что и volume: CosyVoice 0.5B не нуждается в 96GB,
# а stock-torch на A100 стабилен (Blackwell потребовал бы хрупкий nightly cu128).
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PIP_PREFER_BINARY=1

RUN apt-get update && apt-get install -y \
        python3.10 python3-pip git git-lfs ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# CosyVoice + зависимости. CosyVoice ставится из исходников Alibaba FunAudioLLM.
WORKDIR /app
RUN git clone --depth 1 https://github.com/FunAudioLLM/CosyVoice.git /app/CosyVoice
RUN pip install --no-cache-dir -r /app/CosyVoice/requirements.txt || true
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ENV PYTHONPATH=/app/CosyVoice:/app/CosyVoice/third_party/Matcha-TTS
COPY handler.py /app/handler.py

# Веса CosyVoice2-0.5B монтируются с Network Volume:
#   /runpod-volume/models/CosyVoice2-0.5B
# (залить один раз — см. deploy/populate-volume.md)

CMD ["python3", "-u", "/app/handler.py"]

# build:  docker build --platform linux/amd64 -t <user>/ugc-voice-worker:1.0 workers/voice
# push:   docker push <user>/ugc-voice-worker:1.0
