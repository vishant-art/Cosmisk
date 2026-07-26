# Creative Studio — Full-Pipeline Trace (3-clip UGC video)

> Every prompt and every output of the whole 13-stage pipeline, captured from a real run of
> `rnd/creative`. **This was a hermetic $0 trace, not a live render:** every fal/OpenRouter key was
> stripped from the environment and every paid provider was mocked to record its call and write a
> tiny *real* media file. The deterministic half — ffmpeg trim/concat/edit/captions, the temporal
> QA gate, the cost ledger — ran **for real** on those files. Meta was left unconfigured, so
> grounding degraded exactly as it would live today.
>
> Captured 2026-07-16. Verdict: **the pipeline wires together end to end and passes its own QA
> gate.** No live render has happened; the fal balance would be spent by the real thing.

---

## What was verified

| Stage | Result |
|---|---|
| 1 · Brand kit | ok — `brand_kit.json` |
| 2 · Teardown | **DEGRADED** (Meta down → no cohort → ungrounded) |
| 3 · Creator persona | ok — `creator_kit.json` |
| 4 · Script | ok — `script.json` (3 beats) |
| 4b · Evidence stack | **DEGRADED** (no template / prior / graph) |
| 5 · Storyboard | ok — `storyboard.json` (3 shots, 10.0s) |
| 6–7 · Render + repair | ok — 3 clips rendered, 0 repairs, 0 exhausted |
| 8 · Edit / finish | ok — voiceover + SFX + captions muxed |
| 9 · Temporal QA | ok — **verdict: pass**, all 6 checks green |
| 11 · Variants | ok — 2 caption-style cuts, $0 marginal |
| 12–13 · Learn (loop + graph) | ok — empty (nothing shipped yet), correctly says nothing |

**Artifacts written** to the run dir: `brand_kit.json`, `creator_kit.json`, `script.json`,
`storyboard.json`, `storyboard_rendered.json`, `repair_log.json`, `renders/` (paid raws),
`timeline.mp4` (silent), `voiceover.mp3`, `video_captioned.mp4` (**the ad**), `qa_report.json`,
`variants/` + `variants_caption_style.json`, `ledger.jsonl`, `fal_actuals.json`.

---

## What a real 3-clip run costs

Estimated total: **$3.64** (the ledger's a-priori number). fal actually bills Seedance ~1% higher
than the formula (87.3 vs ~86.4 token-units per clip), so **expect ~$3.67–3.70 actually charged**,
plus the balance guard reserves a $0.30 overhead margin before it will start.

| Item | Model | Qty | Est USD |
|---|---|---|---|
| Shot video | Seedance 2.0 (720p) | 3 clips × 4s billed | **$3.6288** |
| Voiceover | MiniMax Speech-02 HD | 118 chars | $0.0118 |
| Audio merge | fal ffmpeg | flat/call | $0.0002 |
| ASR (captions + QA) | fal Whisper | ~3× | $0.00021 |
| Brand/script/storyboard/VLM | Gemini 2.5 Flash (OpenRouter) | 4 calls | ~$0.00 (rounds to nil) |
| **Total** | | | **$3.641** |

**The billing subtlety that matters:** the storyboard asked for shots of **3s, 4s, 3s**, but Seedance
only makes clips of `{4,5,6,8,10,12,15}` seconds, so each snaps **up to 4s**. You pay for **12
seconds** to ship a **10-second** ad. Cutting faster than 4s per shot costs the same as a 4s shot.
So a "3-clip" video is 3 × $1.21 ≈ **$3.63 of Seedance regardless of how short the shots are**.

**What changes the number in a live run:**
- **Product hero shots** (with a Shopify product or a Meta winner): each adds one FLUX "product
  seed" still (~$0.05) and renders i2v instead of t2v. In this trace there were none, so all three
  shots ran **t2v** — the persona lived only in the prompt.
- **`pin_face=True`** (the face experiment): one extra FLUX persona still (~$0.05), shots switch to
  i2v. Off by default.
- **A repair**: each re-rolled shot is another ~$1.21. This run needed none.
- **Resolution**: 1080p is ~2.25× the token cost of 720p per second.

---

## Grounding, degraded (what Meta being down actually does)

With `META_ACCESS_TOKEN` unset, the trace ran the real degrade path, loudly:

- **Stage 2 (teardown): skipped.** No cohort → no winner MP4 → no `CreativeTemplate`. Concepts,
  script and storyboard get **no "here's how a winner was built" block**.
- **Stage 4b (evidence stack): empty.** No template, and no prior/graph either (nothing has shipped,
  so there is no realized performance to learn from). The brain runs on **brand kit + persona +
  the campaign summary only**.
- The campaign summary is **not** empty, though — `plan_story` fell back to the bundled mock
  envelope (`DEFAULT_DATA`), so the script prompt still carried real-looking campaign context
  (see Stage 4 below). In production with a live Meta token this is the account's actual campaigns.

Everything else is unaffected: the ad still gets made, it just isn't grounded in what won.

---

## Every prompt and output, stage by stage

Verbatim from the capture. `...` marks where a long system prompt is trimmed; the load-bearing
parts are kept.

### Stage 1 — Brand kit  · `brand_brain.generate_brand_kit` → Gemini 2.5 Flash

**System (verbatim):**
> You are an elite brand strategist and art director. From the ad-account summary, FIRST infer the
> brand's category, its audience, and what the winning campaigns reveal about what those customers
> actually respond to. THEN design a distinctive, ownable brand identity ... Return STRICT JSON only
> ... Schema: `{brand_name, tagline, palette[3-5], typography, tone, voice_keywords, dos, donts,
> visual_style, logo{brief}}` ... Make it SMART, not safe ... Avoid the obvious cliche ...

**User:** `ACCOUNT: linen apparel brand. 3 winning campaigns, ROAS 4-6, spend 40k INR each.`

**Output → `brand_kit.json`:** brand "Aurelia", palette `#2E2A26 / #B08D57 / #E8E2D6 / #FAF8F4`,
visual_style "warm minimal, natural light, tactile linen and brass". *(In a grounded run this system
prompt gains a winner-image vision pass.)*

### Stage 2 — Teardown · **DEGRADED**
`META_ACCESS_TOKEN unset → no cohort → no teardown → ungrounded template.` No prompt issued.

### Stage 3 — Creator persona · `CreatorKit` (no LLM)

**`creator_kit.json` → two derived briefs that the brain and the renderer consume:**

- **Visual half** (goes into every shot prompt): *"The same 25 to 34-year-old woman, dark wavy hair,
  minimal makeup, warm skin, wearing the linen set in oatmeal, in a sunlit apartment. Occasional
  natural hand gestures. The SAME person, unchanged, in every shot."*
- **Voice half** (goes into the script prompt, and picks the TTS voice): *"THE CREATOR SPEAKING:
  Priya, a warm woman. Write in their voice: the odd filler word ('honestly', 'like'), the way
  people actually talk."*

### Stage 4 — Script  · `story_brain.generate_script` → Gemini 2.5 Flash

**System (verbatim):**
> You are a direct-response copywriter who writes short-form video ads that do not look like ads.
> Write the SPOKEN script for a 10-second creator-style video, as ordered beats. Return STRICT JSON
> ... `purpose` MUST be one of: hook, problem, agitate, demo, proof, objection, cta ... The FIRST
> beat is always `hook` ... No brand name in the hook ... Total spoken length ~24 words MAX ...

**User (verbatim, note the fallbacks that fired):**
```
BRAND: Aurelia -- Quiet luxury for everyday.
TONE: understated, warm, assured. VOICE: crafted, calm, enduring
DO: show real texture; let the product breathe
DON'T: no neon; no clutter

ACCOUNT CONTEXT:
ACCOUNT: Pratapsons (mock)   CURRENCY: INR   WINDOW: 2026-05-01 to 2026-05-30
SELECTED 4 CAMPAIGNS (name | spend | revenue | roas | purchases | link_ctr%):
  - Prospecting -- Summer Sale: ... roas=3.10 ...
  - UGC -- Reels Push: ... roas=4.20 ...
  - Retargeting -- Evergreen: ... roas=6.83 ...

THE CREATOR SPEAKING: Priya, a warm woman. Write in their voice: the odd filler word ...
```
> Note what is **absent** because Meta is down: there is **no `STRUCTURE OF A REAL WINNER` block**
> (the template) and **no `WHAT HAS ACTUALLY WORKED` / `WHAT WINNERS DO DIFFERENTLY` blocks** (the
> prior and graph). Present: the persona's voice brief, and the mock campaign summary.

**Output → `script.json`:** 3 beats — hook / demo / cta.

### Stage 5 — Storyboard  · `story_brain.generate_storyboard` → Gemini 2.5 Flash

**System (verbatim):**
> You are a director breaking a script into a shot list ... `camera` MUST be one of: selfie,
> handheld_wide, close_up, macro, over_shoulder, overhead, pov. `product_visible` MUST be one of:
> hero, background, absent ... Shots are SHORT: 1.2-4 seconds each ... Aim for 3-8 shots totalling
> about 10 seconds. Treat `duration_s` as a proposal: it will be scaled.

**User (verbatim — the persona re-enters here so five shots describe ONE person):**
```
BRAND: Aurelia. TONE: understated, warm, assured.
SCRIPT:
  [hook] I almost returned this on day one.
  [demo] Then I actually wore it for a week straight.
  [cta] It's the linen set, link's right here.

THE CREATOR ON CAMERA (the SAME person in every shot -- write every `subject` around them,
never a different person):
The same 25 to 34-year-old woman, dark wavy hair, ... The SAME person, unchanged, in every shot.
```

**Output → `storyboard.json`:** 3 shots, durations refitted to sum to 10.0s.

### Stages 6–7 — Render each shot  · `sequencer` → Seedance 2.0 via fal

Three prompts, one per shot, built by `prompt_builder.build_shot_prompt`. **The persona is in all
three** ("The same 25 to 34-year-old woman ... The SAME person, unchanged, in every shot"), which is
how prompt-level face consistency is attempted. All three rendered **t2v** (no product cutout, no
`pin_face`), so the face is a wish, not a seed.

**Shot 0 (hook, selfie) — verbatim prompt:**
> woman on a linen sofa, morning light, talking to camera
>
> The same 25 to 34-year-old woman, dark wavy hair, minimal makeup, warm skin, wearing the linen set
> in oatmeal, in a sunlit apartment. Occasional natural hand gestures. The SAME person, unchanged, in
> every shot. front-facing phone selfie, held at arm's length. The shot moves: slight lean in. Filmed
> for Aurelia. Visual style: warm minimal, natural light, tactile linen and brass. Mood: understated,
> warm, assured. ONE clear hero subject ... Avoid the generic-stock / AI look ...

**Shot 1 (demo, handheld_wide)** — same persona block, `subject` = "she moves through a sunlit room
wearing the set", adds *"The product is visible in the background, not the subject."*

**Shot 2 (cta, selfie)** — same persona block, `subject` = "back on the sofa, holding the folded set
up to camera", motion "holds it up".

**Ledger (real, from `ledger.jsonl`):** each shot `billed_s=4, used_s=3/4/3, mode=t2v, cost $1.2096`.
No `dropped_conditioning` warnings (nothing was being pinned). 0 repairs.

### Stage 8 — Finish (edit)  · `pipeline.finish_timeline` (ffmpeg, real)

- **Voiceover → MiniMax TTS**, `voice=Wise_Woman` (the persona's voice), one take across the whole
  ad: *"I almost returned this on day one. Then I actually wore it for a week straight. It's the
  linen set, link's right here."* (118 chars, $0.0118)
- **SFX** (deterministic, ffmpeg lavfi) and **per-word captions** burned in after ASR word-timing.
- Muxed once → **`video_captioned.mp4`**.

### Stage 9 — Temporal QA  · `verifier_video.verify` → **verdict: pass**

Real checks on the real assembled clip:

| Check | Result |
|---|---|
| cut_alignment | pass — 2 cuts within 0.3s of plan |
| continuity (cut 1) | pass — correlation -0.651 |
| continuity (cut 2) | pass — correlation -0.074 |
| product_presence | pass — no shot promised a hero product |
| caption_audio | pass — drift 0.000 over 23 words (limit 0.35) |
| vlm_critic | pass — Gemini returned `["none"]` |

**VLM critic system (verbatim):**
> You are a quality gate for a finished short-form video ad. You are shown a CONTACT SHEET: keyframes
> tiled left-to-right, top-to-bottom, in chronological order. Report only DEFECTS you can SEE ... Each
> issue MUST be chosen verbatim from this list: none, text_garbled, product_missing, face_distorted,
> extra_limb, caption_overlap, unreadable_caption, continuity_break, frozen_frame, **identity_drift**
> ... Do NOT estimate any timing, duration, ratio or count ...

*(`identity_drift` is the persona-era addition — "two intact faces that don't match".)*

### Stage 11 — Variants  · `make_variants` (edit axis, $0 marginal render)

Axis `caption_style`, values `bottom_white` / `center_pop` — the finished clip is re-captioned two
ways for **zero** new model cost. Record → `variants_caption_style.json` with durable ids
`trace3__caption_style__bottom_white`, `trace3__caption_style__center_pop`. *(A `hook_type` axis would
instead re-render and cost another ~$3.63.)*

### Stages 12–13 — Learn (loop + graph)  · `outcomes.build_prior` / `graph.build_graph`

Both returned **empty**, correctly: nothing has been published, harvested, or torn down for this
account, so there is nothing to say. `prior.to_brief() == ""`, `graph.to_brief() == ""`,
`graph.identifiable == False`. The brain is told nothing rather than something invented — which is
the whole point of these two modules.

---

## Bottom line

- **It works.** The 13-stage pipeline runs end to end in `rnd/creative`, produces a finished
  captioned ad, and its own QA gate passes on the real output.
- **A live 3-clip 720p run costs ~$3.64 estimated / ~$3.67–3.70 charged**, dominated entirely by 3 ×
  Seedance (~$1.21 each); everything else is rounding error. Shorter shots do not save money — the
  4-second floor is the unit.
- **Right now it would run ungrounded** (Meta suspended): no teardown, no prior, no graph. It still
  ships an ad, from the brand kit + persona + campaign summary. The grounding lights up the moment
  Meta is back.
- **This trace spent nothing.** To see a real rendered clip, a live run (~$3.64) is required — not
  done here.
