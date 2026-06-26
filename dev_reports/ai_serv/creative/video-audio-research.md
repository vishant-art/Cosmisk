# Adding Audio (Music / Voiceover / SFX) to Generated Video Ads — Research

> How to give the creative pipeline's generated videos sound: native model audio,
> generated music, AI voiceover, sound effects, and how to mux/mix it in Python.
> Web-verified June 2026. Companion to `creative-pipeline-architecture.md`.
> Status: **research + recommendation. Not yet built** (the text/copy video overlay
> and the `imageio-ffmpeg` muxing toolchain ARE built — see end).

---

## TL;DR

- **Seedance 2.0 already generates native audio.** The `generate_audio` flag defaults to
  **true** and adds synced SFX + ambient + music (and lip-synced dialogue if you put quoted
  lines in the prompt), at **no extra cost**. Our existing clips likely already have sound —
  we just never set the flag explicitly. This is the cheapest path by far.
- **For controlled audio**, the pattern is **generate the audio, then mux it on**: a fal music
  model (or TTS model) produces a track, and `fal-ai/ffmpeg-api/merge-audio-video` glues it onto
  the video for ~$0.0002/s (effectively free, no local ffmpeg needed).
- **Licensing is the real constraint for paid ads**, not capability. **ElevenLabs Music** (music)
  and **ElevenLabs / Cartesia** (voice) are the licensing-safe defaults. **Avoid** MusicGen
  (non-commercial weights), Suno (no real API), and Udio (downloads disabled).
- **Recommended for us:** Seedance native audio by default, plus an optional ElevenLabs
  voiceover muxed via the fal ffmpeg endpoint — one provider family (fal), licensing-clean,
  minimal new code.

---

## 1. Native model audio (audio generated WITH the video, one call)

Cheapest and simplest: the video model emits audio in the same pass. All via
`fal_client.subscribe(endpoint, arguments={...})`.

| Model | fal endpoint | Audio control | Price | Notes |
|---|---|---|---|---|
| **Seedance 2.0** (t2v/i2v) | `bytedance/seedance-2.0/{text,image}-to-video` | `generate_audio` (default **true**); quote lines in prompt for dialogue | ~$0.30/s @720p, **audio free** | what our pipeline already uses |
| Seedance 2.0 Fast | `bytedance/seedance-2.0/fast/*` | same | ~$0.24/s @720p | cheaper |
| Veo 3.1 | `fal-ai/veo3.1` (+ `/fast`, `/lite`) | `generate_audio` (default true), multi-language dialogue | $0.20/$0.40 per s (audio doubles cost) | higher fidelity, audio is a paid add-on |
| Sora 2 / Pro | `fal-ai/sora-2/text-to-video[/pro]` | audio same pass, free, up to 25s | Pro ~$0.30/s @720p | |
| Kling v3 | `fal-ai/kling-video/v3/{standard,pro}/*` | `generate_audio` (confirm flag) | Std ~$0.084/s silent, ~$0.126/s audio | |

**Action for us:** expose `generate_audio` on `video_providers._seedance` (default true). Zero new
infrastructure — the clip just comes back with sound.

Sources: [Seedance t2v](https://fal.ai/models/bytedance/seedance-2.0/text-to-video) ·
[Veo 3.1](https://fal.ai/models/fal-ai/veo3.1) ·
[Sora 2 Pro](https://fal.ai/models/fal-ai/sora-2/text-to-video/pro).

---

## 2. Generated background music (generate, then mux)

| Model | fal endpoint | Inputs | Output | Price |
|---|---|---|---|---|
| **CassetteAI** | `cassetteai/music-generator` | `prompt`, `duration` (s) | 44.1kHz stereo WAV | **$0.02 / output min** (fit-to-length) |
| Google Lyria 2 | `fal-ai/lyria2` | `prompt`, `negative_prompt`, `seed` (fixed 30s) | 48kHz WAV | $0.10 / 30s |
| Stable Audio 2.5 | `fal-ai/stable-audio-25/text-to-audio` | `prompt`, `seconds_total` (≤~190) | WAV | $0.20 / gen |
| MiniMax Music 2.x | `fal-ai/minimax-music/v2` | `prompt` (style) + `lyrics` | MP3/PCM/FLAC | ~$0.03 / gen |
| ElevenLabs Music | `fal-ai/elevenlabs/music` | `prompt`, `music_length_ms`, `composition_plan` | MP3 (multi-codec), ≤600s | $0.80 / min |
| ACE-Step | `fal-ai/ace-step` | `tags`, `lyrics`, `duration` | WAV | $0.0002 / s |

**Not on fal / avoid:** Meta MusicGen (weights CC-BY-NC, output rights unresolved — risky for
paid ads), a first-party Suno endpoint (does not exist; all "Suno APIs" are ToS-violating
resellers), Udio (downloads disabled after the Oct 2025 UMG settlement — unusable).

Sources: [fal music generators](https://fal.ai/learn/tools/ai-music-generators) ·
[Lyria2](https://fal.ai/models/fal-ai/lyria2/api) ·
[CassetteAI](https://fal.ai/models/cassetteai/music-generator/api) ·
[ElevenLabs Music](https://fal.ai/models/fal-ai/elevenlabs/music/api).

---

## 3. AI voiceover / TTS (generate, then mux)

| Model | fal endpoint | Voice / cloning | Price |
|---|---|---|---|
| **ElevenLabs Turbo v2.5** | `fal-ai/elevenlabs/tts/turbo-v2.5` | named voices, 32 langs | **$0.05 / 1K chars** |
| ElevenLabs Multilingual v2 | `fal-ai/elevenlabs/tts/multilingual-v2` | + word **timestamps** (caption sync) | $0.10 / 1K |
| ElevenLabs v3 | `fal-ai/elevenlabs/tts/eleven-v3` | inline tags `[excited]` `[whispers]`, 70+ langs | $0.10 / 1K |
| MiniMax Speech-02 HD | `fal-ai/minimax/speech-02-hd` | emotion control, 30+ langs | $0.10 / 1K |
| Kokoro | `fal-ai/kokoro/american-english` | 19 named voices | $0.02 / 1K (cheapest) |
| F5-TTS / Chatterbox | `fal-ai/f5-tts`, `fal-ai/chatterbox/text-to-speech` | voice clone from a sample | $0.05 / ~$0.025 per 1K |

Off-fal options (own API key): ElevenLabs direct, OpenAI `gpt-4o-mini-tts` ($12/1M tok, **must
disclose AI voice**), Cartesia Sonic-3.5 (sub-90ms latency, explicit ad licensing, $5/mo Pro),
Google/Gemini TTS, Azure (500+ voices). **Deprecated/removed on fal:** PlayHT, Cartesia (not
hosted on fal).

Sources: [ElevenLabs Turbo on fal](https://fal.ai/models/fal-ai/elevenlabs/tts/turbo-v2.5/api) ·
[Kokoro](https://fal.ai/models/fal-ai/kokoro/american-english) ·
[fal TTS catalog](https://fal.ai/models?categories=text-to-speech).

---

## 4. Sound effects / video-to-audio (score an existing silent clip)

| Model | fal endpoint | Input | Price |
|---|---|---|---|
| **MMAudio V2** | `fal-ai/mmaudio-v2` | `video_url` + `prompt` → synced foley | **$0.001 / s** (cheapest) |
| ElevenLabs SFX V2 | `fal-ai/elevenlabs/sound-effects/v2` | `text`, `duration` (≤22s), `loop` | $0.002 / s |
| HunyuanVideo-Foley | `fal-ai/hunyuan-video-foley` | `video_url` + prompt (highest fidelity) | $0.01 / s |
| Kling Video-to-Audio | `fal-ai/kling-video/video-to-audio` | `video_url` (no prompt) | $0.035 / video |

Sources: [MMAudio](https://fal.ai/models/fal-ai/mmaudio-v2) ·
[ElevenLabs SFX](https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2).

---

## 5. Attaching audio to video (mux / mix / lip-sync)

**The key tool:** `fal-ai/ffmpeg-api/merge-audio-video` is a **true muxer** (glues an audio track
onto a video without re-rendering frames) at **~$0.0002/s** — effectively free, server-side, no
local ffmpeg. Use `start_offset` to align. Related: `…/merge-audios`, `…/merge-videos`.

Lip-sync (only when an on-screen face must visibly speak — 1000× the cost of a mux):
`veed/lipsync` ($0.40/min, cheapest), `fal-ai/latentsync` ($0.20 ≤40s), `fal-ai/sync-lipsync`
($0.70/min). For ad b-roll with a voiceover over the top, **do not** lip-sync — just mux.

**Mixing music + voice into one track** (the fal muxer takes one audio input): pre-mix with
`fal-ai/ffmpeg-api/merge-audios`, or do it locally with ffmpeg.

Sources: [fal ffmpeg merge-audio-video](https://fal.ai/models/fal-ai/ffmpeg-api/merge-audio-video) ·
[VEED lipsync](https://fal.ai/models/veed/lipsync).

---

## 6. Local audio assembly in Python (if not using the fal muxer)

We already added **`imageio-ffmpeg`** (a pip wheel that **bundles a static ffmpeg** — no system
install, works in a bare venv/Docker). Get the binary with `imageio_ffmpeg.get_ffmpeg_exe()` and
drive it via `subprocess`. Useful ffmpeg recipes:

- **Add an audio track:** `-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest`.
- **Mix music + voice:** `-filter_complex "[1:a]volume=1.0[v];[2:a]volume=0.15[m];[v][m]amix=inputs=2:duration=first:normalize=0"` (set `normalize=0`, control levels with `volume`).
- **Duck music under voice (sidechain):** `[0:a]asplit=2[narr][key];[1:a][key]sidechaincompress=threshold=0.02:ratio=10:attack=50:release=500[ducked];[narr][ducked]amix=...`.
- **Loop/trim music to length:** `-stream_loop -1 … -shortest`, or `aloop`/`atrim`+`apad`.
- **Fade:** `afade=t=in:st=0:d=2`, `afade=t=out:st=28:d=2`.
- **Loudness:** two-pass `loudnorm=I=-14:TP=-1.5:LRA=11` (measure, then apply with `linear=true`).

**Loudness targets:** YouTube enforces **−14 LUFS / −1 dBTP** (official). Meta/Instagram/TikTok
publish **no** official targets (Meta uses adaptive xHE-AAC) — industry estimates cluster around
−14 LUFS, so **−14 LUFS / −1 to −1.5 dBTP** is the safe cross-platform target.

Python wrapper note: `imageio-ffmpeg` (pip wheel) bundles the binary; `ffmpeg-python` and `moviepy`
do **not** ship a binary (moviepy pulls imageio-ffmpeg). For a no-system-ffmpeg guarantee, use the
pip wheel, not conda.

Sources: [imageio-ffmpeg](https://github.com/imageio/imageio-ffmpeg) ·
[two-pass loudnorm](https://dev.to/masonwritescode/two-pass-loudness-normalization-with-ffmpeg-loudnorm-the-right-way-1nm3) ·
[LUFS per platform](https://www.forasoft.com/learn/audio-for-video/articles-audio/lufs-targets-per-platform-2026).

---

## 7. Recommendation for the pipeline

1. **Default:** set Seedance `generate_audio=true` (it already is) — free synced ambient/music,
   zero new code. Expose a `--audio/--no-audio` toggle on `video_providers`.
2. **Optional voiceover:** generate with `fal-ai/elevenlabs/tts/turbo-v2.5` from a short script
   (the brain can write it), then mux with `fal-ai/ffmpeg-api/merge-audio-video`. Licensing-clean,
   stays inside the fal provider family.
3. **Optional music bed:** `cassetteai/music-generator` (fit-to-length, cheap) or ElevenLabs Music
   (licensing-safest), mixed under the voice and ducked, then muxed.
4. **Keep lip-sync out of scope** unless a generated spokesperson must speak on camera.

This composes cleanly with the now-built **video copy-overlay** (text/CTA burned onto the clip)
and the bundled-ffmpeg toolchain.

---

## Build status (for context)

- **Built — video copy-overlay** (`compositor.render_overlay` + `video_post.add_copy_overlay`,
  bundled ffmpeg) and the **outpaint fix** (mask-based, real aspect-ratio extension).
- **Built — audio stage (per §7, minus the music bed):**
  - Seedance **native audio** default-on (`generate_audio=true`), `--no-audio` toggle on
    `video_providers`.
  - Optional **voiceover**: `brand_brain.generate_vo_script` (the brain writes a time-fit script)
    -> `video_providers.generate_voiceover` via **`fal-ai/minimax/speech-02-hd`** (fal-hosted,
    NOT ElevenLabs) -> `video_providers.merge_audio_onto_video` via
    **`fal-ai/ffmpeg-api/merge-audio-video`**. Wired into `pipeline.video_smoke`
    (`voiceover=True`) and the CLI (`--voiceover`, `--no-audio`). Default clip length is now
    **10s** (`config.VIDEO_DURATION_DEFAULT`).
  - **Music bed: intentionally NOT built** (per direction). Lip-sync out of scope.
  - **Live-verified:** brain script -> MiniMax TTS -> fal mux produced a final clip with a
    confirmed audio stream. Tests green (creative 91, rnd 36).
- **Default voice:** `Wise_Woman` (MiniMax `voice_id`) -- swap in `config.VIDEO_TTS_VOICE`.

### Flagged unverified
Kling's audio flag name; Seedance/Veo exact per-second math vs token billing; several music/TTS
prices sourced from fal curated/explore pages rather than per-model API pages; Mubert/Suno/Udio
licensing specifics (JS-rendered ToS). Reconfirm in-browser before any high-spend launch.
