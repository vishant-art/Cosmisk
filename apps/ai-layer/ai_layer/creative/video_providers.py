"""Video generation -- fal is the only provider (rebuild plan, decision D1).

Seedance 2.0, mode chosen by inputs:
  refs   -> reference-to-video  (product/brand refs)
  image  -> image-to-video      (seed = the TEXT-FREE background, NOT the finished ad)
  else   -> text-to-video       (no seed; least brand-consistent, last resort)

Copy/logo are NOT baked into the i2v input (the model would warp overlaid text); they
are composited onto the rendered clip afterwards (animated lower-third / end-card).

SDK imports are LAZY. Output URLs are temporary (*.fal.media) -- downloaded immediately.
"""
from __future__ import annotations

import sys
from pathlib import Path

from ai_layer.creative import config
from ai_layer.creative import ledger

# resolution -> (width, height) px for the Seedance token formula (orientation
# doesn't change width*height, so one entry per resolution is enough).
_VIDEO_DIMS = {"720p": (1280, 720), "1080p": (1920, 1080), "4k": (3840, 2160)}


def _seedance(prompt: str, out_path: Path, *, image=None, refs=None, aspect="9:16",
              duration=10, resolution="720p", fast=False, generate_audio=True,
              log=print) -> dict:
    import fal_client                   # lazy
    import requests
    common = {"prompt": prompt, "resolution": resolution, "duration": str(duration),
              "aspect_ratio": aspect, "generate_audio": bool(generate_audio)}
    if refs:
        endpoint = config.VIDEO_REF2V
        args = {**common, "image_urls": [fal_client.upload_file(str(r)) for r in refs]}
    elif image:
        endpoint = config.VIDEO_I2V
        args = {**common, "image_url": fal_client.upload_file(str(image))}
    else:
        endpoint = config.VIDEO_T2V
        args = {**common}
    res = fal_client.subscribe(endpoint, arguments=args, with_logs=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(requests.get(res["video"]["url"], timeout=300).content)
    bucket = ("seedance_4k" if resolution == "4k" else
              "seedance_fast" if fast else "seedance")
    w, h = _VIDEO_DIMS.get(resolution, _VIDEO_DIMS["720p"])
    return {"provider": "seedance", "model": endpoint, "path": str(out_path),
            "cost_usd": ledger.video_cost(bucket, w, h, float(duration))}


def generate_video(prompt: str, out_path, *, image=None, refs=None, aspect="9:16",
                   duration=config.VIDEO_DURATION_DEFAULT, resolution="720p", fast=False,
                   generate_audio=True, log=print) -> dict:
    return _seedance(prompt, Path(out_path), image=image, refs=refs, aspect=aspect,
                     duration=duration, resolution=resolution, fast=fast,
                     generate_audio=generate_audio, log=log)


def generate_with_fallback(prompt: str, out_path, *, image=None, refs=None, aspect="9:16",
                           duration=config.VIDEO_DURATION_DEFAULT, resolution="720p",
                           fast=False, generate_audio=True, log=print) -> dict:
    """Try seeded i2v/ref2v first; on failure, progressively drop NATIVE AUDIO, then
    the seed (t2v). Seedance rejects a clip if its auto-generated audio trips a content
    filter ('Output audio has sensitive content'), so audio-off is a key fallback and
    matters more than keeping the seed. Charged on success only."""
    seeded = bool(image or refs)
    if seeded:
        plan = [("seeded", image, refs, generate_audio)]
        if generate_audio:
            plan.append(("seeded/no-audio", image, refs, False))
        plan.append(("t2v/no-audio", None, None, False))
    else:
        plan = [("t2v", None, None, generate_audio)]
        if generate_audio:
            plan.append(("t2v/no-audio", None, None, False))

    last = None
    for i, (tag, img, rf, aud) in enumerate(plan):
        try:
            res = generate_video(prompt, out_path, image=img, refs=rf, aspect=aspect,
                                 duration=duration, resolution=resolution, fast=fast,
                                 generate_audio=aud, log=log)
            res["audio"] = aud
            if i > 0:
                res["fell_back_from"] = tag
            return res
        except Exception as e:  # noqa: BLE001 -- try the next fallback
            last = e
            log(f"  [video] {tag} failed ({e!s:.110})")
    raise last


def generate_voiceover(text: str, out_path, *, voice=None, log=print) -> dict:
    """Generate a spoken voiceover via a fal-hosted TTS model (MiniMax Speech-02 HD,
    NOT ElevenLabs). Returns {provider, model, path, cost_usd}."""
    import fal_client                   # lazy
    import requests
    args = {"text": text,
            "voice_setting": {"voice_id": voice or config.VIDEO_TTS_VOICE}}
    res = fal_client.subscribe(config.VIDEO_TTS_MODEL, arguments=args, with_logs=False)
    audio = res.get("audio") or res.get("audio_file") or {}
    url = audio.get("url") or res.get("url")
    if not url:
        raise RuntimeError("tts returned no audio url")
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(requests.get(url, timeout=120).content)
    return {"provider": "minimax-tts", "model": config.VIDEO_TTS_MODEL,
            "path": str(out), "cost_usd": ledger.tts_cost(len(text))}


def transcribe_words(audio_path, *, log=print) -> tuple[list[dict], float]:
    """Word-level ASR via fal Whisper. Returns ([{text,start,end}], cost_usd).

    `chunk_level="word"` is the whole reason this exists: segment-level timestamps
    cannot drive caption burn-in (T3) or measure a spoken hook against a cut boundary
    (T4). Same FAL_KEY, no new vendor.
    """
    import fal_client                   # lazy
    res = fal_client.subscribe(
        config.ASR_MODEL,
        arguments={"audio_url": fal_client.upload_file(str(audio_path)),
                   "chunk_level": config.ASR_CHUNK_LEVEL},
        with_logs=False)
    words = []
    for ch in res.get("chunks") or []:
        ts = ch.get("timestamp") or [None, None]
        if ts[0] is None:
            continue
        words.append({"text": str(ch.get("text", "")).strip(),
                      "start": float(ts[0]), "end": float(ts[1] or ts[0])})
    seconds = words[-1]["end"] if words else 0.0
    return words, ledger.asr_cost(seconds)


def merge_audio_onto_video(video_path, audio_path, out_path, *, seconds=0, log=print) -> dict:
    """Lay an audio track onto a video without re-rendering frames (fal ffmpeg muxer)."""
    import fal_client                   # lazy
    import requests
    args = {"video_url": fal_client.upload_file(str(video_path)),
            "audio_url": fal_client.upload_file(str(audio_path))}
    res = fal_client.subscribe(config.AUDIO_MERGE_MODEL, arguments=args, with_logs=False)
    url = (res.get("video") or {}).get("url") or res.get("url")
    if not url:
        raise RuntimeError("merge returned no video url")
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(requests.get(url, timeout=300).content)
    return {"provider": "fal-ffmpeg", "model": config.AUDIO_MERGE_MODEL,
            "path": str(out), "cost_usd": ledger.merge_cost(seconds)}
