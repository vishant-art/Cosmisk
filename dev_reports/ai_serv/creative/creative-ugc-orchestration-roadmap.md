# Creative Studio: UGC Orchestration Roadmap

> **Status:** proposed, awaiting build approval
> **Build surface:** `rnd/creative/` (prototype), port to `apps/ai-layer/ai_layer/creative/` after
> **Companion docs:** `creative-studio-system-architecture.md` (what exists), `creative-vendor-research.md` (model IDs + prices), `video-audio-research.md`, `meta-api-creative-asset-retrieval.md`
> **Verified against source:** 2026-07-10

---

## 0. Decisions taken before writing

| ID | Decision | Rationale |
|----|----------|-----------|
| `UGC-D1` | Build the **shot planner** now; **defer the concat rig**. Gate on `config.VIDEO_MAX_CLIP_SECONDS`. | Seedance 2.5 announces native 30s clips, 50 references, native audio and landing-frame control. Welding an ~8s segmentation rig into the architecture enshrines a constraint that is actively dissolving. The storyboard artifact is portable to either renderer. |
| `UGC-D2` | Teardown input is a **live Meta account** (`META_ACCESS_TOKEN` + `act_<id>`). | `rnd/src/meta_creatives.py` already ranks by `purchase_roas` and downloads winner assets. This is the data nobody else has. |
| `UGC-D3` | The **$0 mock test suite is preserved**. Every new module must be testable with no network. Live fal/OpenRouter calls only on explicit manual runs. | Matches the existing lazy-import + module-attribute-dispatch pattern in `image_providers.py` / `video_providers.py`. See §7.3 for how a video fixture is produced without checking a binary into git. |
| `UGC-D4` | Phase 1 ships four changes (§7). Everything else is documented but not started. | Ordered by product delta per hour, not by architectural tidiness. |
| `UGC-D5` | The teardown corpus is **two-tailed**: top-N *and* bottom-N above the same spend floor. `fetch_winning_creatives` becomes `fetch_creative_cohort`. | A corpus selected on the outcome has no negative class and no variance in the outcome. You cannot estimate an effect from a sample selected on the effect. Without this, everything downstream of Creative DNA (T11) is unlearnable **in principle**, not merely underpowered. See §9.1. |
| `UGC-D6` | The primary creative outcome variable is **thumb-stop rate**, not ROAS. Collect `video_3_sec_watched_actions`, `video_thruplay_watched_actions`, `video_avg_time_watched_actions` starting immediately. | ROAS is downstream of landing page, price, LTV, audience quality, attribution window and promo calendar. The creative's job is the first three seconds. We currently request **none** of these fields anywhere in the codebase. |
| `UGC-D7` | **Instrument now, model later.** T4/T10 log the structural dataset from day one. The inference layer (T11) is a research project gated on volume, and it emits a prior with an interval and an `n`, never a naked effect size. | Data not collected today is unrecoverable. Inference on 4 ads per account is astrology with a taxonomy. Same provenance discipline as T4, applied one level up. |
| `UGC-D8` | Deterministic post-processing is a **first-class tier** (`T7.5 Editor`), not a footnote. Anything achievable with ffmpeg/PIL is done there, never asked of a model. | `compositor.py : static ad :: editor.py : video ad`. The model renders pixels; we render meaning, deterministically and verifiably. Zero marginal model cost, unit-testable to the frame, and it converts T9's continuity checks from *detections* into *assertions*. |

---

## 1. The thesis

Our pipeline produces **an advertisement**. Creatify, Topview, Arcads and UGCify produce **content that happens to be an advertisement**.

That is not a renderer gap. Our renderer is competitive: FLUX.2 flex for stills, Seedance 2.0 for video, both on fal. The gap is that:

1. Nothing in our pipeline ever reads the **structure** of an ad that worked. We read its **pixels**.
2. Our creative artifact is a single composed frame (`AdConcept` → `CompositedAd`). Theirs is a **sequence** (script → storyboard → shots → timeline).
3. Our prompts explicitly ask for the agency look. `rnd/creative/src/main.py:81` defaults to `"Cinematic product hero shot, slow push-in, on-brand."` No winning Reel has a slow cinematic push-in.

The whole roadmap follows from those three sentences.

### 1.1 The one architectural insight worth preserving

Our core thesis is: **the image model never renders text; text is composited deterministically afterward and verified fail-closed.**

For UGC video this is not merely still applicable, it becomes *mandatory*. A caption must match the audio to the word, and no video model will ever do that reliably. `compositor.py` already renders deterministic text into safe zones. `verifier.py:69-107` already checks WCAG contrast. Both transfer to captions almost verbatim.

We built the right machine for a job we hadn't identified yet.

Extend the thesis one axis and the Editor (`T7.5`) falls out of it for free:

```
compositor.py : static ad  ::  editor.py : video ad
     (space)                        (time)
```

The compositor renders meaning into space. The editor renders meaning into time: cuts, punch-ins, speed ramps, caption timing, SFX keyed to boundaries we placed ourselves. Both are deterministic, both are testable, and neither asks a generative model to do something it cannot be held accountable for. This is why the Editor is a tier and not a polish pass.

---

## 2. Competitive teardown: what each platform actually does

Sourced from product docs, help centres, an open-sourced repo, and API references. Marketing pages were treated as claims, not evidence.

| Platform | Concept name | What it actually is | Is it a moat? |
|---|---|---|---|
| **Creatify** | *Ad Clone* / temporal template | Upload a video ad. It extracts format, hook, scene structure, script pattern, pacing, and emits a fill-in-the-blank template. Open-sourced as `creatify-ai/video-ad-reverse-engineer`: **no ML models**. Frame-difference scene detection plus an LLM classifying against a closed catalog of 12 formats and 10 hook types. | **No.** A week of work. Their version has no outcome data. |
| **Creatify** | *AdFlow* | Node-based canvas; swap the image model or voice mid-pipeline without rewiring. *AdFlow Co-Pilot* reads a brief, proposes an angle with reasoning, writes scene-by-scene copy, and **waits for input before building anything**. | No. UI surface for agencies. |
| **Creatify / Topview** | Avatar + voice library | 800+ avatars, 140+ voices, 30+ languages. | Partly, see Arcads. |
| **Arcads** | AI actors | 1,000+ "AI actors". The realism comes from **real human performers, filmed on a real shoot, then re-lipsynced**. The fully synthetic actors look worse. | **Yes, and it is the only real one.** It is casting, filming, licensing and rights clearance. Capital and legal work, not ML. Unreachable from here. |
| **Topview** | Storyboard stage | Parses a script into visual beats, lets the user **regenerate individual storyboard frames**, then proceeds to video. Storyboard is a first-class, addressable artifact. | No. |
| **UGCify** *(unverified)* | Segment planning + review gate | Claims: segment plan → first clip → **human review gate** → remaining clips → voice → sync → package. | Source could not be verified (homepage returned no substantive content). Treated as a hypothesis, not evidence. |
| **Meta Advantage+** | Native creative gen | Free, in Ads Manager. Converts up to 20 product images into a multi-scene video ad, swaps backgrounds, animates statics, generates text variations. | It is the floor. Anything generic is competing with free. |

### 2.1 The pattern nobody advertises

Every platform puts a **human in the loop before committing spend on the full render**. UGCify's review gate. AdFlow Co-Pilot waiting for input. Topview's per-frame regeneration.

That is not a UX flourish. It is a collective confession that **automated QA over a temporal artifact is unsolved**, so they all outsource it to the user.

Our architecture's distinguishing commitment is a fail-closed automated gate. That makes §6.3 the only genuine wedge in this document.

---

## 3. Ground truth: where our pipeline stands today

Verified against source, because two existing design docs describe things that are not true.

| Claim | Reality | Evidence |
|---|---|---|
| Winners condition generation | Only as **FLUX reference pixels for the background**, and only when no product image is supplied | `pipeline.py:97-98`, `pipeline.py:265-267` |
| Brand kit is grounded in winners | **Off by default.** `--ground` is opt-in in rnd; in prod `creative-studio.ts:537-546` never sets it, so `creative-gen-client.ts:79` defaults `ground: false` | `main.py:59-60`, `pipeline.py:99` |
| Concepts are informed by winners | **Never.** `brand_brain.generate_concepts` takes the brand kit JSON plus a summary string. Text only, no images, by construction | `brand_brain.py` |
| We analyze winning videos | **No.** Winner MP4s are downloaded, then discarded unopened by the `kind == "image"` filter | `pipeline.py:57` |
| Any frame extraction from ingested media | **None.** No `cv2`, `VideoCapture`, `ffprobe`, `scenedetect`, `moviepy`. The one `imageio_ffmpeg.read_frames` call reads clip metadata of a video we *generated* | `video_post.py:20-25` |
| Video is a product feature | It is a **smoke test**. `video_smoke()`, single clip, hardcoded default prompt | `pipeline.py:178+`, `main.py:81` |
| Multi-clip assembly | No `concat` anywhere. `merge_audio_onto_video` muxes one audio onto one video | `video_providers.py:113` |
| `reference-to-video` is used | Implemented and **unreachable**. `_seedance` dispatches to `VIDEO_REF2V` when `refs` are passed; `video_smoke` always passes `image=`, landing on i2v | `video_providers.py:36-38` |
| QA sees video | No. `verifier.verify` opens a PNG with PIL and sends one still to the VLM critic | `verifier.py:156` |

**Two assets already paid for and thrown away:** the winner MP4s on disk, and the `ref2v` code path.

### 3.1 Things that are better than expected

- `config.py:66` already has `VIDEO_DURATION_DEFAULT = 10` as a constant, not a magic number.
- `config.py` comment: Seedance emits **synced native audio when `generate_audio=true` (default on, free)**. We already get ambient sound for nothing.
- `schemas.py:CompositedAd.ad_copy` carries the comment `# the copy on this ad (reused for video overlay/VO)`. Someone anticipated this.
- `pipeline.py:357` already fans concepts out through a `ThreadPoolExecutor`. Shots fan out the same way.
- `rnd/creative` is CLI-driven (`main.py`) with a file-based `Ledger` and **no `_JOBS` dict and no DB**. The state-machine blockers are ai-layer-only, which makes rnd the correct build surface.

---

## 4. Verified API facts the roadmap depends on

Confirmed 2026-07-10. Do not build against these without re-checking; two are moving.

| Fact | Status | Consequence |
|---|---|---|
| `fal-ai/whisper` accepts `chunk_level: "word"` and returns word-level timestamp chunks | **Confirmed** | Unlocks caption burn-in and CTA/hook timing. Same `FAL_KEY`, no new vendor. |
| Seedance 2.5: native 30s, up to 50 multimodal refs (images, video, audio, landing frames), native audio in the same pass | **Announced for fal; ByteDance has not published full specs** | Basis for `UGC-D1`. Landing-frame refs would solve shot continuity natively. |
| Per-clip caps today: Veo 3.1 = 8s, Kling = 10s, Seedance 2.0 = 15s, Runway Gen-4 = 16s | Confirmed | Short shots are a *pacing* convention, not only a model limit. Build the storyboard for pacing, not for the cap. |
| Meta requires an **AI-generated disclosure** since March 2026 on any ad where AI generated, substantially modified, or composited visual or audio content. Explicitly includes background replacement and synthetic voiceover. Undisclosed AI is ~14% of all rejections, the third-largest category | Confirmed | **Every asset this pipeline emits is in scope today, including the statics.** See §8. |
| AI vs human creative: 0.76% vs 0.65% CTR across 500M+ impressions, top-of-funnel | Confirmed, but mostly pre-dates mandatory labelling | Do not treat as a forecast. |

---

## 5. The roadmap

Each item: **concept name**, where it is borrowed from, what it is, why, expected impact, files.

Expected impact is stated with an explicit **basis** and **confidence**. Where there is no measurement basis, that is said outright rather than dressed up as a number.

---

### T1. UGCStyle: the visual language

**Inspiration:** Arcads (the amateur-capture look), general UGC convention.
**Concept:** *visual language as a typed object, split by actuator*.

**What.** Not prompt engineering. A `UGCStyle` object that every renderer and the editor both consume. `main.py:81` currently defaults to `"Cinematic product hero shot, slow push-in, on-brand."` and `prompt_builder.build_image_prompt` reaches for photographic and premium tokens. That string is the "advertisement versus content" gap expressed as one literal.

**The critical design constraint: split the object by actuator.** A style attribute is either a prompt token (a *wish*, whose effect nobody can verify) or a deterministic post-process (a *guarantee*, testable to the frame). Mixing them in one flat object is how you end up unable to tell which half of your aesthetic is real.

```python
class UGCStyle(BaseModel):
    # --- prompt: wishes. The model may or may not honor these. Unfalsifiable. ---
    camera: Literal["handheld", "selfie", "tripod", "overhead"]
    lighting: Literal["window", "overhead", "golden_hour", "ring_light"]
    framing: Literal["imperfect", "centered", "rule_of_thirds"]

    # --- post: guarantees. ffmpeg/PIL, deterministic, asserted in tests. ---
    micro_shake: float = 0.0          # px amplitude, editor applies
    exposure_clip: float = 0.0        # highlight rolloff, curve filter
    grain: float = 0.0
    recompress: bool = False          # social-upload artifacting pass
```

Dropped from the original sketch: `focus: minor breathing`. Lens breathing cannot be obtained from a video model on request, and pretending otherwise puts an unachievable field in a typed contract. `lens: iphone 1x` is retained only as a prompt hint, with no expectation that it is honored.

**Make it bidirectional.** `UGCStyle` is also a field *on* `CreativeTemplate`, extracted from the winner's frames: shake magnitude, average shot brightness, and cut rhythm are all measurable. T1 and T4 then become the same object pointing in opposite directions, and "ground the ads in winners" extends from content to style.

**Why.** Every downstream architectural change is subordinate to this, because a perfectly storyboarded six-shot sequence rendered in agency lighting still reads as an ad. And embedding `handheld` inside one prompt string means the aesthetic cannot be varied, measured, or extracted.

**Expected impact.** Large, on the axis of "does this read as native content." **Basis:** none quantitative; this is a judgment a human evaluator settles in one look at two clips. **Confidence:** high on direction, unmeasured on magnitude. The `post:` half is exactly measurable; the `prompt:` half never will be. That asymmetry is the argument for pushing as much as possible across the line into the editor (`T7.5`).

**Files:** `schemas.py` (`UGCStyle`), `config.py` (preset constants, matching the existing model-ID convention), `main.py:81`, `prompt_builder.py`. The `post:` fields are consumed by `editor.py` (`T7.5`), not by the prompt.

**Cost:** zero new model calls.

---

### T2. Winner Grounding

**Inspiration:** ours, half-built already.
**Concept:** *vision-pass style grounding*.

**What.** Turn the existing grounding pass on. `pipeline.py:99` computes `ground_images = winner_refs if (ground_from_meta and winner_refs) else None`, and `brand_brain.generate_brand_kit` base64-embeds up to 6 winner images with the instruction to infer the real palette, visual style and product look. It works. It is switched off.

**Why.** The brand kit currently derives from a text summary and has never seen a winning ad. This is the smallest possible step from "pixels feed FLUX" to "the brain looks at what won."

**Expected impact.** Moderate, on brand fidelity and palette accuracy. **Basis:** the prompt at `brand_brain.py` explicitly asks for palette/style/product inference, and it currently receives `None`. **Confidence:** high that it does something, unmeasured how much.

**Files:** rnd: pass `--ground` (already exists, `main.py:59-60`), consider flipping the default. Prod: `apps/api/src/routes/creative-studio.ts:537-546` must set `ground`.

> ⚠️ **Scope note.** The prod fix touches `apps/api/src/routes/`, which is under the **CODE FREEZE** in `CLAUDE.md`. That is a separate maintainer change on its own branch, not part of the rnd build.

---

### T3. Word-Timed Caption Burn-In ✅ SHIPPED (Phase 2)

**Inspiration:** TikTok-native caption convention; Creatify and Topview both auto-caption.
**Concept:** *kinetic captions via forced alignment*.

**What.** Run `fal-ai/whisper` with `chunk_level: "word"` over the voiceover **we generated ourselves** in `video_providers.generate_voiceover`. Take the returned word timings. Render a per-word overlay through `compositor.py` and burn it with the bundled `imageio_ffmpeg` binary, extending `video_post.add_copy_overlay` from one static overlay to a timed sequence.

**Why.** Burned-in per-word captions are the strongest single visual signal that a clip is creator content rather than an ad. And this is the exact shape of our existing architecture: the model does not render the text, the compositor does, deterministically, and the contrast check already exists.

We know the script (we wrote it) but not the timing. Whisper on our own TTS output gives exact timing for a rounding-error cost.

**Expected impact.** **Highest visual delta per dollar in the document.** **Basis:** structural, not measured. Every competitor ships captions; no winning short-form ad omits them. **Confidence:** high.

**Files:** `captions.py` (plan + draw), `editor.py` (burn), `schemas.py` (`CaptionWord/Cue/Style`), `config.py`, `pipeline.video_smoke`, `main.py --no-captions`.

**Cost:** one Whisper call per clip. Negligible against a Seedance render.

**As shipped**, three decisions worth recording:

*Text from the script, timing from ASR.* Whisper knows **when** a word was said. It does not know how the brand is spelled. When the two transcripts agree token-for-token (after case and punctuation normalization) we display our own tokens. On any disagreement we display what was actually **said**, because a caption contradicting the audio is the one thing worse than an ugly caption.

*Drift is a fail-closed gate, not a warning.* We are transcribing audio we synthesized from a script we wrote. Drift above `CAPTION_MAX_DRIFT` means the wrong file, the wrong language, or a broken TTS. `captions.verify_agreement` raises, `video_smoke` catches it, logs `[captions] REFUSED by the drift gate`, and ships the clip **uncaptioned**. This is the first piece of T9 to exist, and it is a string comparison, not a judgment.

*White body, brand accent only on the active word.* Legibility over unknown footage is not negotiable. Every word is stroked in black, which is what real creator captions do and what makes white text survive an arbitrary background. A brand-coloured caption body would fail contrast on half the frames it lands on.

Rendering is per **state**, not per frame: a cue plus its active-word index is the cache key, so a 15-second voiceover encodes ~40 PNGs rather than ~360. A cue holds the screen until the *next* cue starts rather than until its own last word ends, because captions that blink off between phrases read as broken.

---

### T4. Creative Teardown

**Inspiration:** Creatify *Ad Clone*, and specifically their open-sourced `creatify-ai/video-ad-reverse-engineer`.
**Concept:** *temporal template extraction*.

**What.** `meta_creatives._one_winner` already downloads the winner's MP4 to `winners/winner_NN.mp4`. `pipeline.py:57` then discards it with a `kind == "image"` filter. **The file is already on disk and already paid for.**

Delete the filter. Then, in a new `teardown.py`, produce a typed `CreativeTemplate` from three sources, in descending order of trustworthiness:

1. **Measured from frames.** Frame-difference shot detection over the MP4 using `imageio_ffmpeg` (already a dependency). Yields: shot boundaries, cut count, average shot length, time-to-first-cut. Zero model calls. This is exactly what Creatify's `extract_frames.py` does, and why their repo contains no ML.
2. **Measured from audio.** Extract the audio track locally with the bundled ffmpeg, send to `fal-ai/whisper` at `chunk_level: "word"`. Yields: the spoken hook verbatim, words-per-minute, CTA timing.
3. **Classified, closed-set.** Tile keyframes sampled at each shot boundary into one contact-sheet image. One call to `config.VISION_MODEL` (`google/gemini-2.5-flash`, already configured). Classify against a **closed** taxonomy: Creatify's 12 ad formats and 10 hook types (pattern interrupt, question, bold claim, POV, authority/stat, visual-only, controversy, social proof, narrative, direct address).

**Why the three-tier discipline matters.** It is tempting to ask a VLM for `product first appears: 2.1s`. It will answer. It will not know. That number is precise, plausible and unfalsifiable, which makes it strictly worse than no number. It is drift **A9** (`generate_concepts` fabricating `cta = "Shop now"`) wearing a suit, and it violates **SPECIFIC OR SILENT**.

**Rule:** every field is measured from frames, measured from ASR, or a label from a closed set. Nothing else ships.

**Expected impact.** This is the module that makes Cosmisk different rather than cheaper. **Basis:** Creatify's Ad Clone requires the user to *upload* a reference ad, because Creatify does not know what worked for that advertiser. We rank by `purchase_roas` and the winner is already on disk. **Confidence:** high on capability. See §9 for the statistical caveat that decides whether it is a product or astrology.

**Files:** new `teardown.py`, new `schemas.py:CreativeTemplate`, new `taxonomy.py` (the closed catalogs), `pipeline.py:57` (delete the filter), `video_providers.py` (`transcribe_words`, shared with T3).

---

### T5. The Concept Seam

**Inspiration:** none. This is the argument, in code.
**Concept:** *structure-conditioned ideation*.

**What.** One signature change:

```python
# brand_brain.py
def generate_concepts(client, kit, summary):                      # today
def generate_concepts(client, kit, summary, template=None):       # proposed
```

Thread `CreativeTemplate` from `pipeline.run` → `_generate_ads` → `generate_concepts`.

**Why.** `generate_concepts` decides the hook, the headline, the CTA and the scene. Today it takes a brand kit and a string, and has never seen a winning ad. Every other item in this roadmap exists either to fill that parameter or to render what comes out of it.

**Expected impact.** Structural. Converts the pipeline from "copies what your winners look like" to "reuses what your winners do." **Basis:** direct, by construction. **Confidence:** high that it changes the output; unknown whether it improves ROAS until §9 is answered.

**Files:** `brand_brain.py`, `pipeline.py`, `schemas.py`.

---

### T6. Script and Storyboard as first-class artifacts ✅ SHIPPED (Phase 3)

**Inspiration:** Creatify (script is the primary artifact, generated before any video), Topview (storyboard is regenerable per frame), AdFlow Co-Pilot (scene-by-scene copy before building).
**Concept:** *the script is the creative; the video is a rendering of it*.

**What.** Today the artifact chain is `AdConcept(title, scene, ad_copy)` → `CompositedAd`. Add, alongside them in `schemas.py`:

```python
BeatPurpose = Literal["hook", "problem", "agitate", "demo", "proof", "objection", "cta"]

class ScriptBeat(BaseModel):
    purpose: BeatPurpose
    text: str

class Script(BaseModel):
    beats: list[ScriptBeat]

class Shot(BaseModel):
    purpose: BeatPurpose          # FK to the beat this shot renders. NOT free text.
    duration_s: float
    camera: str
    subject: str
    product_visible: Literal["hero", "background", "absent"]
    dialogue: str | None
    motion: str

class Storyboard(BaseModel):
    shots: list[Shot]
```

**On `Shot.purpose`.** It is a closed set, and it is not a new string field: it is a foreign key to the `ScriptBeat` the shot renders. Free-text purpose degenerates immediately, the model writes "build trust" on every shot and it becomes decorative. As a closed set it earns two things: the storyboard becomes *verifiable* (every beat must be covered by at least one shot, which is an assertion rather than a vibe), and shot-level recovery becomes possible (`T9.5`), because you can only regenerate a shot in isolation if you know what it was for.

Constraints: `sum(shot.duration_s)` equals the target, each `duration_s <= config.VIDEO_MAX_CLIP_SECONDS`, and `{s.purpose for s in shots} >= {b.purpose for b in script.beats}`.

**Why `VIDEO_MAX_CLIP_SECONDS` and not `8`.** Per `UGC-D1`. Short shots are a pacing convention; the model cap is a coincidence that currently agrees with it. If Seedance 2.5 ships 30s native, the same `Storyboard` renders as one call instead of six, and nothing above the renderer changes. Hard-coding the cap would enshrine a limitation that is dissolving.

**Expected impact.** Enables T7 and T9. On its own, produces a storyboard a human could hand to a real creator, which has standalone value even if we never render it. **Confidence:** high.

**Files:** `schemas.py`, new `storyboard.py`, `brand_brain.py` (`generate_script`).

**On splitting `brand_brain`.** Done, as part of T6, and cut where it was always going to be cut. Planner / strategist / copywriter / storyboarder is an org chart, and org charts make poor module boundaries. The boundary that matters is **what consumes a `CreativeTemplate` and what does not**:

```
brain.py        shared LLM transport (chat_json, vision_user)
brand_brain.py  IDENTITY.  generate_brand_kit. Does not consume a CreativeTemplate.
story_brain.py  ARGUMENT.  concepts, script, storyboard, voiceover. Consumes it.
storyboard.py   ARITHMETIC. fit_durations, validate, build. Consumes nothing.
```

`test_brand_brain_does_not_consume_a_creative_template` asserts the boundary by inspecting signatures rather than documenting it in prose. If a function here grows a `template=` argument, the test fails and tells you where it belongs.

---

### T7. Sequenced Render

**Inspiration:** UGCify segment planning; Creatify AdFlow variant scaling.
**Concept:** *shot-list rendering with continuity references*.

**What.** `render_shots(storyboard)`. Phase-gated per `UGC-D1`:

- **v1 (now):** render `shots[0]` only. Storyboard is real; renderer is honest about being one clip.
- **v2a (if 2.5 slips):** N Seedance calls through the existing `ThreadPoolExecutor` at `pipeline.py:357`. Continuity via **`reference-to-video`**, passing the previous clip's final frame plus the product cutout from `image_providers.cutout` as `refs`. That branch is already implemented at `video_providers.py:36-38` and has never been reached. Concat via the ffmpeg concat demuxer using `get_ffmpeg_exe()`, normalizing fps and resolution first.
- **v2b (if 2.5 lands):** one 30s call with landing-frame references.

Either way: one voiceover across the whole timeline, muxed once at the end, not per clip.

**Expected impact.** This is what makes the output a video ad rather than an animated still. **Confidence:** high on capability, medium on wall-clock (six Seedance renders is minutes, see §8).

**Files:** `pipeline.py`, `video_providers.py`, new `sequencer.py`, `config.py` (`VIDEO_MAX_CLIP_SECONDS`).

---

### T7.5. Deterministic Editor 🟡 STARTED (Phase 2: captions)

**Inspiration:** every competitor, none of whom market it. This is where they actually spend their effort.
**Concept:** *the compositor, on the time axis*. Per `UGC-D8`.

> `editor.py` now exists and ships caption burn-in. `probe()` and `_run()` are the shared
> ffmpeg surface every remaining operation below will use. `video_post.add_copy_overlay`
> has not yet been absorbed.

**What.** A module between the renderer and QA. Every operation below is ffmpeg or PIL. None of them ask a model for anything.

| Effect | Implementation | Model cost |
|---|---|---|
| Zoom punch-in | ffmpeg `zoompan` | $0 |
| Speed ramp | `setpts` + `atempo` | $0 |
| Freeze frame | `tpad` / frame loop | $0 |
| Whip transition | `xfade` + directional blur | $0 |
| Caption animation | the T3 per-word PNG sequence, with a scale keyframe | $0 |
| Emoji popup | PIL composite, timed | $0 |
| Product highlight | mask from `image_providers.cutout`, which we already generate | $0 |
| Punch / whoosh | licensed SFX pack, `amix`, keyed to cut boundaries we placed | $0 |
| `UGCStyle.post` (grain, micro-shake, exposure clip, recompress) | filter chain | $0 |

**Why.** Three reasons, in ascending order of importance.

It is where the native feel actually lives. The renderer produces plausible footage; the editor makes it read as content. Nothing on that list requires a better video model.

**It is the cheapest variant axis by an order of magnitude.** One Seedance render, edited three ways, is three creatives. Creatify advertises variant generation at 2x speed; this is almost certainly how. That reframes T10: vary the *edit*, not the render.

**It makes T9 easier, not harder.** Continuity and shot-length checks stop being *detections* and become *assertions*, because we placed every cut. We know where the boundaries are. We cut them.

**Expected impact.** Large on perceived nativeness, large on variant economics, and it strictly reduces the difficulty of the QA tier. **Basis:** structural. **Confidence:** high. The single largest correction to the first draft of this document, which relegated the editor to a footnote and called the renderer the hard part. That was wrong.

**Disclosure note.** The editor does not add disclosure surface (§9.2). Cuts, speed, captions and SFX are ordinary editing. The generation upstream is what triggers the label, and it already did.

**Licensing note.** SFX packs are not free-as-in-speech. A whoosh library needs a commercial licence before it ships. Line item, not an afterthought.

**Files:** new `editor.py`, `video_post.py` (absorbed), `captions.py` (T3 becomes an editor operation), `schemas.py` (`EditPlan`), `config.py` (SFX pack path).

---

### T8. Progressive Review Gate

**Inspiration:** UGCify (render clip one, approve, render the rest), AdFlow Co-Pilot ("waits for your input before building anything").
**Concept:** *spend-capped human checkpoint*.

**What.** Render shot one. Return. Wait. Render shots two through N on approval.

**Why.** Two reasons, and only one of them is UX. It caps spend on a bad concept at 1/N. And until T9 works, it is the only thing standing between a user and a six-shot render of a broken idea. Every competitor ships this, which tells you what they know about T9.

**Expected impact.** Direct cost control: worst-case spend on a rejected concept drops by roughly `(N-1)/N`.

**Files:** rnd: trivial, `main.py` is a CLI and can just stop. **Prod: requires killing `_JOBS` and wiring `creative_jobs`.** See §8.

---

### T9. Temporal QA Gate

**Inspiration:** nobody. Everyone else ships a human here.
**Concept:** *fail-closed verification over a temporal artifact*.

**What.** `verifier.verify` today opens a PNG with PIL, runs safe-zone geometry and WCAG contrast, then sends one still to the VLM critic. The video analogue, in descending order of how mechanical it is:

| Check | Method | Mechanical? |
|---|---|---|
| Caption/audio agreement | ASR the final mux, diff against the script we wrote | Yes, string comparison |
| Shot-length adherence | Compare rendered durations against `Storyboard` | Yes |
| Cut continuity | Perceptual hash distance across each cut boundary; flag jumps | Yes |
| Product presence | Template-match the `image_providers.cutout` output against sampled frames | Mostly |
| Everything else | VLM critic on a **contact sheet of keyframes**, not the video | No |

Four of five are arithmetic. That is the entire point, and it is why this is a wedge rather than a feature: it is expensive to build and cheap to run, and the alternative everyone else chose is a human.

**Expected impact.** Strategic. It is the only item here that a competitor could not ship next quarter. **Confidence:** medium on feasibility of the product-presence check; high on the other four.

**Files:** `verifier.py`, new `verifier_video.py`, `captions.py` (shared ASR).

---

### T9.5. Shot Recovery

**Inspiration:** ours. `_make_concept` already does this for stills.
**Concept:** *escalating shot-level repair, downstream of QA*.

**What.** The naive diagram is `Render → Failure → Rewrite shot → Render`. That is wrong, because **`Render` almost never fails.**

Ask Seedance for "girl opens fridge, cat jumps out, product reveal" and it will not throw. It will confidently hand you a girl, a fridge, and no cat. Plausible, well-lit, wrong. Failure is *detected*, not *raised*. So recovery hangs off T9, not off the renderer:

```
render(shot_i) → QA(shot_i) → verdict → repair(shot_i)
```

This is not a new pattern. `_make_concept` already carries `qa_retries` with a `retry_hint` on `QAReport`. The video version is the same loop at shot granularity.

**Escalate, do not loop.** Four rungs:

1. Retry the same prompt (models are stochastic).
2. Rewrite the prompt, seeded with the QA `retry_hint`.
3. **Replan the shot, preserving its `purpose`.** This is where `Shot.purpose` (T6) pays for itself.
4. Drop the shot; redistribute its duration across neighbours serving adjacent beats.

Rung 4 is what stops one bad beat from burning the budget.

**Blast radius.** If shot 4's continuity reference is shot 3's last frame, repairing shot 3 invalidates shot 4. There is a real trade-off and it belongs in the schema, not in a 2am debugging session:

- **Independent render:** repairs stay local, continuity suffers.
- **Sequential render:** continuity holds, a repair cascades forward.

Name the mode on `Storyboard`. Default to independent until T9's continuity check is trustworthy enough to justify the cascade.

**Expected impact.** Converts a whole-storyboard regeneration (N renders) into a single-shot repair (1 render). **Confidence:** high.

**Files:** `sequencer.py`, `verifier_video.py`, `schemas.py` (`Storyboard.render_mode`, `Shot.repair_attempts`).

---

### T10. Structural Variants

**Inspiration:** Creatify (Ad Clone across 9:16, 16:9, 1:1 simultaneously; AdFlow's 2x variant scaling).
**Concept:** *hold structure, vary one axis*.

**What.** One `CreativeTemplate` → N concepts that hold the temporal structure fixed and vary exactly one axis (hook category, or emotional angle). Not N random concepts.

**Why.** This is an experiment design, not a feature. Holding structure fixed and varying one axis is the only way the outputs ever teach us anything. It is also how the cross-account dataset in §9.1 gets built, and it is what makes T11 possible.

**Vary the edit, not the render** (per `T7.5`). The cheapest variant axis is the edit: one Seedance render, cut three ways, is three creatives at $0 marginal model cost. Reserve re-rendering for variants that genuinely change what is on screen.

**Expected impact.** Compounding, and near zero in the short term. **Confidence:** high, long horizon.

---

### T11. Creative Learning Loop

**Inspiration:** nobody, because nobody else can. Requires owning the ad account.
**Concept:** *closed-loop creative priors*. Governed by `UGC-D5`, `UGC-D6`, `UGC-D7`.

**What.** Close the arrow from performance back into planning:

```
Generated Ad → published → meta_ad_id → performance → CreativeTemplate outcome → prior
       ^                                                                            |
       +----------------------------- informs generate_concepts -------------------+
```

**Far more of this exists than the diagram suggests.** `creative-engine.ts:731` POSTs to `/adcreatives`, `:747` POSTs to `/ads`, and `:763` writes the result back:

```sql
UPDATE creative_assets SET meta_ad_id = ?, meta_campaign_id = ?, status = 'published' ...
```

`creative_assets.meta_ad_id` (`pg-schema.ts:254`) **is the join key** from a creative we generated to the ad Meta ran. `:825` already fetches `/{meta_ad_id}/insights` on a tracking endpoint.

The loop is half-closed. Exactly two things are missing:

1. That insights call requests **no video engagement fields**. Grep confirms `video_3_sec_watched_actions`, `video_thruplay_watched_actions` and `video_avg_time_watched_actions` appear nowhere in the codebase, on either side.
2. Nothing writes performance back into a structural record keyed by `CreativeTemplate`.

**Why thumb-stop rate and not ROAS** (`UGC-D6`). ROAS is downstream of landing page, price, LTV, audience quality, attribution window, and the promo running that week. Attribute a creative structure to it and you are attributing the whole funnel. Thumb-stop rate (3-second views over impressions) is *creative-proximal*: it measures the only thing the first three seconds can possibly cause.

**Why this is the company.** Creatify open-sourced their teardown. The renderer is a commodity, and Seedance 2.5 will be everyone's Seedance 2.5. The arrow from `performance` back to `prior` is the only edge in the whole graph that requires owning the advertiser's account. That arrow is the moat, and everything else in this roadmap is scaffolding for it.

**Expected impact.** Strategic, compounding, and zero on the day it ships. **Confidence:** high on the plumbing, **low on the inference** until §9.1 is resolved.

**Do this week, before any of the architecture:** add the three video metric fields to the existing insights field lists. It is a field-list edit. It costs nothing. It starts the clock on the only dataset that will ever be a moat, and every day it does not happen is a day of data that cannot be recovered.

**Files:** `rnd/src/meta_creatives.py:AD_FIELDS` (Phase 1). Prod: the insights field lists in `meta-ingestion.ts`, `account-analyzer.ts`, `creative-engine.ts` (all under the code freeze, see `OQ4`).

---

## 6. What we will deliberately not build

| Not building | Why |
|---|---|
| **An avatar / actor library** | Arcads' realism comes from real humans, filmed, then re-lipsynced. Their synthetic actors look worse, by their own reviewers' account. This is casting, shooting, licensing and rights clearance: capital and legal work. It is the only real moat in the category and it is not reachable from here. |
| **A node-graph editor (AdFlow)** | UI surface for agency workflows. It is not what makes their output good. |
| **URL-to-video** | Meta Advantage+ converts up to 20 product images into a multi-scene video ad, free, inside Ads Manager, at a $10B run-rate. Per `CLAUDE.md`: if it is already in the dashboard, it is not The Gap. |

---

## 7. Phase 1 build plan

Six changes, in `rnd/creative/` and `rnd/src/`. Per `UGC-D4`.

**Governing instruction: the ads must be grounded in winners.** Grounding stops being an opt-in flag. `generate_concepts` today has never seen a winning ad; after Phase 1 it cannot run without a `CreativeTemplate` derived from one.

### 7.1 Scope

| # | Change | Files | New deps |
|---|--------|-------|----------|
| 1 | **T1** `UGCStyle`, split by actuator; kill the cinematic default | `schemas.py`, `config.py`, `main.py:81`, `prompt_builder.py` | none |
| 2 | **T2** Grounding **on by default** (`--ground` → `--no-ground`) | `main.py:59-60`, `pipeline.py:99` | none |
| 3 | **T4** `teardown.py` + closed taxonomy | new `teardown.py`, new `taxonomy.py`, `schemas.py`, `pipeline.py:57`, `video_providers.py`, `ledger.py`, `config.py` | none (`imageio-ffmpeg` already in `requirements.txt`) |
| 4 | **T5** The concept seam | `brand_brain.py`, `pipeline.py` | none |
| 5 | **`UGC-D5`** Two-tailed cohort | `rnd/src/meta_creatives.py` (`fetch_creative_cohort`) | none |
| 6 | **`UGC-D6`** Video engagement fields | `rnd/src/meta_creatives.py` (`AD_FIELDS`) | none |

Items 5 and 6 are cheap now and **irreversible if skipped**: a corpus collected without the negative tail, or without thumb-stop metrics, cannot be repaired retroactively. They are the two-line insurance policy on T11.

T3 (captions) is held to Phase 2 despite being the highest visual-impact item, because it depends on the `transcribe_words()` helper that T4 introduces. Building T4 first makes T3 a two-file change, and per `UGC-D8` captions land inside `editor.py`, not beside it.

### 7.2 The `CreativeTemplate` contract

Sketch, to be settled in review. Note that every field carries its provenance.

```python
class ShotBoundary(BaseModel):
    index: int
    start_s: float          # MEASURED (frame diff)
    duration_s: float       # MEASURED

class CreativeTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ad_id: str
    cohort: Literal["winner", "loser"]      # UGC-D5. No corpus without both tails.
    # --- outcome (UGC-D6): creative-proximal first, funnel metrics second ---
    thumb_stop_rate: float | None           # video_3_sec_watched / impressions
    thruplay_rate: float | None
    avg_watch_time_s: float | None
    roas: float | None                      # sanity check ONLY, never the training signal
    spend: float
    impressions: int
    # --- measured from frames ---
    shot_count: int
    shots: list[ShotBoundary]
    avg_shot_length_s: float
    time_to_first_cut_s: float
    style: UGCStyle | None                  # T1, bidirectional: extracted from frames
    # --- measured from ASR ---
    spoken_hook: str | None                 # words in [0, time_to_first_cut]
    words_per_minute: float | None
    cta_start_s: float | None
    # --- classified, closed set only ---
    ad_format: Literal[...]                 # 12 values
    hook_type: Literal[...]                 # 10 values
    # --- explicitly absent ---
    # NO product_first_appears_s. NO b_roll_ratio. NO emotion_arc.
    # A VLM will happily invent all three. See T4.
```

### 7.3 Test plan (`UGC-D3`: $0, no network)

The tension: `UGC-D2` says the real input is a live Meta account, but the suite must run with no network.

**Resolution: synthesize the fixture.** `conftest.py` generates a short MP4 at test time using the already-bundled `imageio_ffmpeg` binary: solid-colour frames with hard cuts at *known* timestamps, plus a silent audio track.

This gives shot-boundary detection a **ground truth to assert against**, costs nothing, runs offline, and checks no binary into git. (Per the global rule on gitignored assets: there is no asset to gitignore.)

| Test | Asserts | Cost |
|---|---|---|
| `test_teardown.py::test_shot_boundaries` | Detected cuts match the synthesized ground truth within one frame | $0 |
| `test_teardown.py::test_asr_word_timings` | `transcribe_words` mocked at module attribute (the `image_providers` pattern); CTA timing derived correctly | $0 |
| `test_teardown.py::test_closed_taxonomy` | A VLM response outside the closed set raises, never coerces | $0 |
| `test_teardown.py::test_no_fabricated_fields` | `CreativeTemplate` rejects unknown fields (`model_config = ConfigDict(extra="forbid")`) | $0 |
| `test_brand_brain.py::test_concepts_accept_template` | `generate_concepts(..., template=None)` still works; template present alters the prompt | $0 |
| `test_pipeline.py::test_winner_videos_not_discarded` | An MP4 winner survives `_meta_winner_refs` | $0 |

Live verification is a separate, manual, billed run: `python -m src.main --meta-account act_XXX --ground --video`.

### 7.4 Invariants to hold

Per `CLAUDE.md`: default suite green, `madge --circular` 0 cycles (Node side untouched by Phase 1).

**Phase 1 result:** `rnd/creative` 93 → **131 passing** (38 added, 0 broken). `rnd` 36 passing, 5 skipped.

Two existing tests were amended rather than weakened, and both amendments record a deliberate contract change:

- `test_pipeline._patch_all` had a `generate_concepts` stub whose signature predates the T5 seam.
- `test_meta_creatives.test_fetch_winner_video_source_then_thumb` asserted `local_path.endswith(".mp4")`. The MP4 now lands in `video_path`, and `local_path` holds the still. **That conflation was the bug**: it is precisely what allowed the downstream `kind == "image"` filter to discard winner videos unopened.

## 7bis. Phase 2 build: captions (shipped)

`T3`, landing inside `editor.py` per `UGC-D8` rather than beside it.

| Change | Files |
|---|---|
| `captions.py` — align, drift gate, cue grouping, PNG rendering | new |
| `editor.py` — `probe`, `burn_captions`, `caption_clip` | new |
| `CaptionWord` / `CaptionCue` / `CaptionStyle` | `schemas.py` |
| caption constants + `CAPTION_MAX_DRIFT` | `config.py` |
| `video_smoke(captions=True)`, own error handling | `pipeline.py` |
| `--no-captions` | `main.py` |

**Tests:** `rnd/creative` 131 → **167 passing** (+36, 0 broken).

The editor tests run **real ffmpeg** against the synthesized fixture clip. No network, no key, no generated frame, and the burn is asserted end to end: output geometry, output duration, frame-level difference from the source, and cleanup. That is the payoff of `UGC-D8`. A deterministic post-process can be tested; a generative one can only be looked at.

Two defects the tests caught:

**`eof_action=repeat` on the overlay filter.** The caption PNG sequence is shorter than the clip whenever speech ends before the video does. ffmpeg's default truncates the **video** to the length of the overlay, so a 3-second ad with a 1.5-second voiceover silently ships as 1.5 seconds. `test_captions_survive_past_the_end_of_speech` pins it.

**Captions shared the voiceover's `except` block.** A caption failure was logged as `voiceover failed`, and a firing drift gate was indistinguishable from a broken TTS. Worse, the first version of the pipeline test *passed* because `transcribe_words` raised, was swallowed, and the assertion on the pre-caption path still held. Captions now have their own handler and their own log line, and `test_a_caption_failure_is_not_reported_as_a_voiceover_failure` locks it down. A test that passes because the thing under test never ran is worse than a failing one.

**Geometry check at real dimensions:** at 1080×1920 the caption band renders at y 0.604–0.662, clear of the 0.80 bottom safe zone that Reels reserves for platform UI. A full-res cue frame is 22.7KB, so a 15-second overlay sequence is roughly 8MB of mostly-transparent PNG.

## 7ter. Phase 3 build: script + storyboard (shipped)

`T6`, plus the `brand_brain` split it was always going to force.

| Change | Files |
|---|---|
| `BeatPurpose` / `ShotCamera` / `ProductVisibility` closed sets | `taxonomy.py` |
| `ScriptBeat` / `Script` / `Shot` / `Storyboard` | `schemas.py` |
| `storyboard.py` — `fit_durations`, `validate`, `build`, `as_shot_list` | new |
| `brain.py` — shared LLM transport | new |
| `story_brain.py` — concepts, script, storyboard, voiceover | new |
| `brand_brain.py` — identity only | trimmed |
| `pipeline.plan_story()`, `video_smoke` prefers `script.json` | `pipeline.py` |
| `--storyboard --seconds N` | `main.py` |

**Tests:** `rnd/creative` 167 → **201 passing** (+34, 0 broken).

**The split between what the model decides and what arithmetic decides.** The model proposes shots with `duration_s` *hints*. `fit_durations` rescales them to hit the target exactly. That is safe to do deterministically because **it changes no content**. Coverage is not: if a beat has no shot, we retry once with the exact violation as a hint and then raise. Inventing the missing shot would put a fabricated beat next to written ones with nothing to tell them apart, which is `product_first_appears_s = 2.1` in a different costume.

**Durations are fitted in integer tenths, not floats.** "Sums to 20.0s" has to be *true*, not nearly true. Float proportional scaling leaves a residue that either drifts the ad's length or gets dumped on whichever shot happens to be last. The fitter water-fills the remainder a tenth at a time, growing the shortest shots and shrinking the longest. A randomized property test runs 2,000 cases across every shot count, cap, floor and adversarial hint set (zeros, negatives, a 100 next to a 0.1) and asserts sum-equals-target and in-bounds. Zero violations.

The irony worth recording: the first version of `test_awkward_targets_still_land_exactly` failed, because `3.4 - 3.3 <= 0.1` is `False` in float. An assertion *about* exact arithmetic, broken *by* inexact arithmetic. It now compares in tenths, like the code does.

**`Shot.purpose` is a foreign key, not a label.** It points at the `ScriptBeat` the shot renders, drawn from the same closed set. That buys two things: the storyboard becomes verifiable (`Storyboard.covers(script)` returns the uncovered beats, and an empty set is the invariant), and shot-level recovery becomes possible in T9.5, because you can only regenerate a shot in isolation if you know what it was for.

**Structural invariants, enforced not suggested.** A `Script` must open on a `hook` (validated on the model itself: the first two seconds earn the next two). A `Storyboard` must open on a hook shot, and close on a CTA shot *if* the script has a CTA beat. No shot exceeds `VIDEO_MAX_CLIP_SECONDS`.

**`STORY_TYPICAL_SHOT_MAX` is deliberately not `VIDEO_MAX_CLIP_SECONDS`.** Shot length is a pacing convention (~1.2–4.0s, what the audience expects); the clip cap is a moving ceiling imposed by whichever renderer is current. Keeping them as separate constants is what stops a 30-second-native model from arriving to find a shot planner that still thinks in 8-second slices. This is `UGC-D1` made concrete.

**`plan_story` renders nothing.** It reads the run's `brand_kit.json` and `template.json`, writes `script.json` and `storyboard.json`, and prints a shot list. Per `OQ3`, that shot list is a deliverable on its own: something a human creator could shoot. The renderer has moved down the stack and become a detail.

**One seam closed for free.** `video_smoke` now prefers `script.json`'s `spoken()` text over `generate_vo_script`. The same string feeds the TTS and the caption drift gate, so the voiceover and the captions cannot disagree about what was said.

### 7.5 Implementation notes worth keeping

**The frame differ must run on RGB, not luma.** The first implementation averaged the channels before diffing and detected zero cuts on a three-shot test clip. Red `(220,30,30)` and green `(30,200,60)` have channel means of 93.3 and 96.7: a 3-unit brightness change across a hard cut. On RGB the same cut is 130 units. Any luma-first shot detector goes blind exactly when hue moves and brightness does not, which describes most colour-graded ad footage. The synthesized fixture caught this on the first run, which is the argument for a fixture with a ground truth rather than a real MP4 and an eyeball.

**Absent is not zero.** `metrics_of` returns `None`, not `0.0`, when a video engagement field is missing from an insights row. An image ad has no three-second video views; recording that as a zero thumb-stop rate is a false claim that silently poisons every average taken over the corpus later. "We did not observe this" and "nobody stopped" are different facts and the type system should keep them apart.

**`ASR_PER_MINUTE = 0.000544` is UNVERIFIED.** It comes from a third-party comparison, not fal's own pricing page. It is small enough that a 10x error is still noise beside one Seedance clip, which is exactly the reasoning that lets a bad constant survive for a year. Confirm it before any live run at volume.

---

## 8. Blockers that become load-bearing

None of these block Phase 1 in `rnd/`. All of them block the port to `apps/ai-layer/`.

| ID | Blocker | Why it matters now |
|---|---|---|
| **A3** | `_JOBS` is a module-global dict in `service.py:30`, assuming exactly one uvicorn worker. Unbounded memory. | A six-shot render is minutes long. T8's review gate is a state machine. Both are impossible on a dict in one process's memory. |
| **A2** | `creative_jobs` and `brand_config` tables exist, have repos, pass tests, and have **no caller outside `tests/test_repository_creative.py`**. `service.py` never imports `repository`. | This is the fix for A3. It is already built. |
| **A10** | Creative spend bypasses `llmGateway` entirely. The ledger is a JSONL on disk (`ledger.py:96-122`), invisible to the per-user daily cap. | Phase 1 adds Whisper and VLM calls. T7 adds N Seedance renders. That is one to two orders of magnitude above a static ad. **Wire cost tracking before wiring concat, not after.** |
| **A1** | `outpaint()` never receives `mode=`, so it always runs the deterministic Pillow cover-blur. The `fal-ai/flux-pro/v1/fill` generative path is dead. | Documented here only to note it is **correct**, not a bug. Having spent the whole pipeline preventing the model from drawing glyphs, a generative margin-fill would invite them back in. The architecture doc claims otherwise and should be corrected. |

---

## 9. The two things that decide whether this is a product

### 9.1 Statistical validity of the template

This section decides whether T11 is a product or astrology. There are three distinct problems and they compound.

#### Problem 1: selection on the outcome (fatal, fixable, fix it now)

`meta_creatives.rank_winners` sorts by `purchase_roas` and returns the top N. If the teardown corpus is **only winners**, then every structural feature extracted is, by construction, a feature of a winning ad. There is no negative class. There is no variance in the outcome.

**You cannot estimate an effect from a sample selected on the effect.** "Pattern interrupt appears in 40% of winners" is true, and so is "a human face appears in 40% of winners," and so is "40% of winners ran on a Tuesday." None of them mean anything without the other tail.

A claim of the form `Pattern interrupt → +18%` is not underpowered here. It is unidentifiable.

**Fix (`UGC-D5`).** `fetch_winning_creatives` → `fetch_creative_cohort`, returning top-N *and* bottom-N above the same spend floor. Roughly thirty lines. It must land in Phase 1, because a corpus collected without the negative tail cannot be repaired retroactively.

#### Problem 2: the outcome variable is wrong

ROAS is a terrible creative-level outcome. It sits downstream of landing page, price, LTV, audience quality, attribution window and promo calendar. Attributing a creative structure to it means attributing the entire funnel to the first three seconds.

**Fix (`UGC-D6`).** Primary outcome is **thumb-stop rate** = `video_3_sec_watched_actions / impressions`. Secondary: `video_thruplay_watched_actions`, `video_avg_time_watched_actions`. These are creative-proximal: they measure the only thing a hook can plausibly cause. ROAS remains as a downstream sanity check, never as the training signal.

Field restrictions worth knowing: `video_avg_time_watched_actions` cannot be requested with the `region` breakdown, and the `dma` breakdown is unavailable for `video_thruplay_watched_actions`.

#### Problem 3: errors cluster within account, and n is small

Meta's own guidance is roughly 100 conversions per variant for significance; 50 for 95% confidence, 30 for 90%, 20 for 80%. Meta will declare an A/B winner at **65% confidence**, barely better than a coin. Our ingestion filters at `spend > 100`, and most SMB accounts will have three to six creatives clearing that bar.

Ads from one advertiser are not independent observations. A naive pooled regression over 600 ads will return `+18%` with a beautiful p-value that is an artifact of ignoring the clustering. Account-clustered standard errors are the floor; a hierarchical model is the right answer.

#### The resolution: instrument now, model later (`UGC-D7`)

- **Now (Phase 1):** collect the two-tailed cohort. Collect the video engagement fields. Log every `CreativeTemplate` with its outcome. Zero inference.
- **Later, gated on volume:** the effect model, with clustered errors, emitting a prior with an interval and an `n`.
- **Never:** a naked effect size. `Pattern interrupt → +18%` does not ship. `Pattern interrupt, +6% to +19% thumb-stop, n=340 ads across 51 accounts` does.

This is the same three-tier provenance discipline as T4 (measured / ASR / closed set), applied one level up. **SPECIFIC OR SILENT** governs statistics too.

The pooled version is **the only real moat in this document**. Creatify has a taxonomy and no outcomes. We have outcomes. But outcomes selected on the outcome are not outcomes.

`OQ1` measures the thin-account problem directly and should be answered before anyone writes an inference layer.

### 9.2 Compliance

Since March 2026 Meta requires an AI-generated disclosure on any ad where AI generated, substantially modified, or composited visual or audio content. Background replacement and synthetic voiceover are named explicitly. Undisclosed AI is roughly 14% of all rejections.

**Every asset this pipeline emits is in scope today**, including the statics: a FLUX background behind a composited product is background replacement, full stop.

Required: a disclosure flag on `AssetRecord` and `RunManifest`, surfaced in the UI. It is a small change and it prevents our users' ad accounts taking policy strikes.

There is also a strategic reading worth stating plainly. UGC works because it reads as a person rather than an ad; trust and native feed appearance are the whole performance mechanism. A platform-rendered "AI-generated" chip discloses away precisely the property being paid for. This does not kill the category, but it means "generate videos indistinguishable from real creators" is now a strategy with a platform-controlled kill switch on it, and we would be entering after the switch was installed.

Which is one more argument for T9 (the fail-closed gate) and §9.1 (the outcome data) being the things we actually own.

---

## 10. Open questions

| ID | Question | Blocks |
|----|----------|--------|
| `OQ1` | What fraction of our real accounts clear a conversion floor for per-advertiser template extraction? This is measurable this week and it decides §9.1. | Whether T4 ships per-advertiser or pooled |
| `OQ2` | Do Seedance 2.5's landing-frame references ship as described? | `UGC-D1`, T7 v2a vs v2b |
| `OQ3` | Should the storyboard be a shippable deliverable on its own (hand it to a human creator) before any rendering exists? | Product scope; would make T6 standalone-valuable |
| `OQ4` | Who owns the `apps/api` `ground` fix given the code freeze? | T2 in prod |

---

## Appendix: sources

Product and API references consulted, with what each established.

- [Creatify Ads Clone](https://help.creatify.ai/en/articles/15049358-ads-clone) and [creatify-ai/video-ad-reverse-engineer](https://github.com/creatify-ai/video-ad-reverse-engineer) — temporal template extraction; frame-diff scene detection with no ML models; the 12-format / 10-hook taxonomy
- [Creatify AdFlow](https://creatify.ai/blog/introducing-adflow-the-node-based-ad-builder-built-for-production-scale) and [AdFlow Co-Pilot](https://creatify.ai/blog/introducing-adflow-copilot-describe-your-ad-get-a-full-production-pipeline) — node graph; the "waits for your input" review gate
- [Arcads](https://www.arcads.ai/) and [an independent review of the actor library](https://www.ngram.com/blog/arcads-alternatives-tested) — the actors are real filmed performers, re-lipsynced
- [Topview AI Avatar](https://www.topview.ai/ai-avatar) — storyboard as a regenerable artifact
- [fal-ai/whisper API](https://fal.ai/models/fal-ai/whisper/api) — `chunk_level: "word"`
- [Seedance 2.5 on fal](https://fal.ai/learn/tools/what-is-seedance-2-5) and [Seedance 2.0 reference-to-video](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video) — 30s native, 50 refs, native audio; specs not yet final
- [AI video model duration caps, 2026](https://www.atlascloud.ai/blog/guides/best-ai-video-generation-models-2026)
- [Meta AI content disclosure policy, March 2026](https://www.auditsocials.com/blog/meta-ai-generated-content-label-policy-2026) and [the 47 policy changes](https://www.1clickreport.com/blog/meta-ad-policy-changes-2026-compliance-guide)
- [Meta Advantage+ Creative](https://www.facebook.com/business/ads/meta-advantage-plus/creative)
- [Meta creative testing significance thresholds](https://www.adstellar.ai/blog/meta-ads-creative-testing-guide) and [A/B confidence levels](https://coinis.com/how-to/statistical-significance-facebook-ads)
- UGCify: **could not be verified.** The site returned no substantive content. Its claimed seven-stage pipeline is treated as a hypothesis in §2, not as evidence.
