# src/creative_studio/generation/adapters/fal_tts.py
"""fal-ai/minimax/speech-02-hd text-to-speech adapter.

Argument shape mirrors the working, live-verified
`apps/ai-layer/ai_layer/creative/video_providers.py::generate_voiceover()`
exactly: only `text` and `voice_setting.voice_id` are sent. `VoiceRequest`
(Task 16 builder) also carries `speed` and `energy`, but the working code
never forwards them to fal either -- this adapter reproduces that gap rather
than silently inventing a `speed`/`emotion` sub-field fal may or may not
accept; see the task-17 report.

Result parsing mirrors the working code's defensive lookup
(`res.get("audio") or res.get("audio_file") or {}`, then `.get("url") or
res.get("url")`). fal's own published schema for this endpoint names the
field `audio` (a `File`, i.e. `{url, content_type, ...}`); `content_type` is
preferred when present. A live example response from fal's docs returns an
MP3 (`.../speech.mp3`), not the `.wav` extension
`R2Store.key_for("voice", ...)` names its stored file -- see the report.
"""
from __future__ import annotations

from creative_studio.generation.adapters.base import MODEL_IDS, FalAdapter, FalAdapterError
from creative_studio.generation.builders import VoiceRequest
from creative_studio.storage.r2 import R2Store

_CONTENT_TYPE_DEFAULT = "audio/mpeg"


async def synthesize_voice(adapter: FalAdapter, r2: R2Store, vr: VoiceRequest, key: str) -> tuple[str, dict]:
    """Synthesize `vr.text` and store the resulting audio in R2 at `key`.

    Returns `(r2_uri, meta)` where `meta` always carries `modelId` and, when
    fal's result includes a `duration_ms`, that too.
    """
    model_id = MODEL_IDS["tts"]
    arguments = {
        "text": vr.text,
        "voice_setting": {"voice_id": vr.voice_id},
    }

    result = await adapter.submit(model_id, arguments)

    audio = result.get("audio") or result.get("audio_file") or {}
    url = audio.get("url") or result.get("url")
    if not url:
        raise FalAdapterError(
            f"fal tts returned no audio url for model {model_id!r}; "
            f"result keys: {sorted(result.keys())}"
        )

    data = await adapter.download(url)
    content_type = audio.get("content_type", _CONTENT_TYPE_DEFAULT)
    uri = r2.put_bytes(key, data, content_type)

    meta = {"modelId": model_id}
    if "duration_ms" in result:
        meta["durationMs"] = result["duration_ms"]
    return uri, meta
