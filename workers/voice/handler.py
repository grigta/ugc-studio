"""RunPod serverless worker: CosyVoice 2 (русский TTS + zero-shot клон голоса).

Контракт job.input:
{
  "mode": "zero_shot" | "instruct",      # zero_shot = клон по референсу
  "text": "Текст, который произнести (русский)",
  "prompt_text": "Расшифровка референс-аудио (для zero_shot)",
  "prompt_audio": "data:audio/wav;base64,...",  # референс голоса (для zero_shot)
  "instruct": "говори спокойно, дружелюбно",     # для mode=instruct
  "speed": 1.0
}

Ответ:
{ "audio": "<base64 wav>", "sample_rate": 24000, "format": "wav" }
либо, если задан env BUCKET_ENDPOINT_URL — { "audio_url": "https://...", ... }
"""
import base64
import io
import os
import tempfile

import runpod

MODEL_DIR = os.environ.get("COSYVOICE_MODEL_DIR", "/runpod-volume/models/CosyVoice2-0.5B")

_model = None  # ленивый singleton — грузим модель один раз на воркер


def _load_model():
    global _model
    if _model is None:
        from cosyvoice.cli.cosyvoice import CosyVoice2
        _model = CosyVoice2(MODEL_DIR, load_jit=False, load_trt=False, fp16=True)
    return _model


def _decode_audio_to_16k(data_uri: str):
    """base64 (data-uri или чистый) -> torch tensor 16 kHz mono для референса."""
    from cosyvoice.utils.file_utils import load_wav

    b64 = data_uri.split(",", 1)[1] if data_uri.startswith("data:") else data_uri
    raw = base64.b64decode(b64)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(raw)
        path = f.name
    try:
        return load_wav(path, 16000)
    finally:
        os.unlink(path)


def handler(job):
    job_input = job["input"]
    text = job_input.get("text")
    if not text:
        return {"error": "field 'text' is required"}

    mode = job_input.get("mode", "zero_shot")
    speed = float(job_input.get("speed", 1.0))

    model = _load_model()
    runpod.serverless.progress_update(job, f"synthesizing ({mode})")

    chunks = []
    if mode == "zero_shot":
        prompt_text = job_input.get("prompt_text", "")
        prompt_audio = job_input.get("prompt_audio")
        if not prompt_audio:
            return {"error": "zero_shot mode requires 'prompt_audio' (base64)"}
        prompt_16k = _decode_audio_to_16k(prompt_audio)
        for out in model.inference_zero_shot(text, prompt_text, prompt_16k, stream=False, speed=speed):
            chunks.append(out["tts_speech"])
    elif mode == "instruct":
        instruct = job_input.get("instruct", "говори спокойно и дружелюбно")
        prompt_audio = job_input.get("prompt_audio")
        prompt_16k = _decode_audio_to_16k(prompt_audio) if prompt_audio else None
        for out in model.inference_instruct2(text, instruct, prompt_16k, stream=False, speed=speed):
            chunks.append(out["tts_speech"])
    else:
        return {"error": f"unknown mode '{mode}'"}

    import torch
    import torchaudio

    audio = torch.cat(chunks, dim=1)
    sr = model.sample_rate

    buf = io.BytesIO()
    torchaudio.save(buf, audio, sr, format="wav")
    wav_bytes = buf.getvalue()

    # большой? можно залить в S3 через rp_upload; иначе base64
    if os.environ.get("BUCKET_ENDPOINT_URL"):
        from runpod.serverless.utils import rp_upload

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            tmp = f.name
        url = rp_upload.upload_file_to_bucket(f"{job['id']}.wav", tmp)
        os.unlink(tmp)
        return {"audio_url": url, "sample_rate": sr, "format": "wav"}

    return {
        "audio": base64.b64encode(wav_bytes).decode("utf-8"),
        "sample_rate": sr,
        "format": "wav",
    }


runpod.serverless.start({"handler": handler})
