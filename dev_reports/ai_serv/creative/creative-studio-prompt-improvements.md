# Creative Studio — Prompt Improvement Plan

**Created:** 2026-07-20 · **Owner:** ai-engineer (creative subtree, `dryayeet`) · **Status:** Phase 1 COMPLETE (1a-1d shipped, both trees); Phases 2-4 remain proposals

> A per-prompt analysis of the Creative Studio's LLM/VLM prompts, grounded in (a) the actual
> prompt code, (b) the real recorded prompts from past live runs, (c) 2025-2026 prompt-craft
> research, and (d) how creatify.ai / Arcads / HeyParker / Icon / AdCreative do it. Every change
> below is prompt-copy only ($0, no new model calls) and respects the repo's hard constraints
> (Five Gates, provenance rule, actuator split, closed taxonomy, "the model never renders text").

## Method / evidence base

Five parallel research strands fed this doc:
- **Prompt catalog** of all 10 pipeline stages, verbatim with file:line (see the per-stage refs).
- **Real recorded prompts** from four past runs: the live `tall blonde woman` run
  (`live_runs/live_20260716_161118/prompts_and_calls.txt`, brand *Pratapsons USA*, Anarkali),
  the `bright skinned blonde woman` API smoke, the *Kin & Thread* 3-clip run, and the *Aurelia*
  $0 trace. These show what the prompts ACTUALLY produce, not just what they ask for.
- **LLM prompt-craft research** (brand voice, concept diversity, hooks, storyboards, VLM-judge).
- **Generative-media research** (FLUX.2, Seedance 2.0 i2v, UGC realism, face consistency).
- **Competitor teardown** + the repo's own creative-intent docs.

Prompts live in two mirrored trees: `apps/ai-layer/ai_layer/creative/` (deployed, the file:line
refs below) and `rnd/creative/src/` (the roadmap calls this the canonical experiment surface).
**Decision (2026-07-20):** edit BOTH trees (`apps/ai-layer` and `rnd/creative/src/`), kept in sync
in every change (see Decisions at the end).

---

## TL;DR — the changes ranked by leverage

| # | Change | Where | Why it matters (evidence) |
|---|---|---|---|
| 1 | **Direct the Seedance motion + give each shot a distinct camera move** | `prompt_builder.build_shot_prompt` | The weakest, most consequential stage and it has ZERO QA coverage. Real run's motion was a noun list ("woman's head, dress fabric.") with identical boilerplate camera on all 3 shots. Video's whole value-add is left blank. |
| 2 | **Elaborate + propagate the operator direction across ALL stages** | new helper + `story_brain`, `prompt_builder` | "tall blonde woman" reached only the video, as an unintegrated `Art direction:` tail. Brand kit, concepts, still ads and script were all cast as a generic "a woman", so the still ads and the video are different people by construction. |
| 3 | **Stop relying on the negative list for FLUX text suppression; go positive** | `prompt_builder`, `image_providers._suppress` | FLUX.2 (Qwen3 text encoder) **ignores negative/exclusionary phrasing entirely**. The `_NEGATIVE` fold is a no-op for FLUX and naming "text/logo" can even summon it. Seedance DOES honor a negative tail. Different rules per model. |
| 4 | **Make the hook rule enforceable: few-shot exemplars + positive hook formulas + a self-check** | `story_brain._SCRIPT_SYSTEM`, `_HOOK_GUIDANCE`, `taxonomy` | Same prompt produced an authentic hook in 3 runs and the exact slogan it forbids in the 4th ("This dress just makes me feel amazing"). The strongest rule is not reliably enforced. |
| 5 | **Fix brand-kit input starvation; demand operational voice, not adjectives** | `brand_brain._KIT_SYSTEM` + its inputs | The prompt asks the model to "infer what winning campaigns reveal" but the run fed zero campaign data and a blank audience. Output landed in exactly the safe zone it forbids (Playfair + Montserrat + sage + "Embrace Your Radiance"). Voice keywords were decorative adjectives. |
| 6 | **Plan the shot count before the script; stop lossy shot-count normalization** | `story_brain` script→storyboard flow | A 4-beat script squeezed to 3 shots desynced QA ("cut_alignment detected 4, planned 2"). A self-inflicted failure two stages upstream. |
| 7 | **Restore the verbatim identity anchor on the i2v path + use Seedance @Image1/Face Lock** | `prompt_builder.build_shot_prompt`, `sequencer` | The t2v path carries "The SAME person, unchanged, in every shot"; the i2v (hero-product) path drops it to a tail token. The product-featuring runs are the ones most at risk of identity drift. |
| 8 | **Reconcile concepts against the brand kit; inject direction; capture the ad copy** | `story_brain._CONCEPTS_SYSTEM`, logging | A concept ("bustling market at dusk") contradicted the kit's own donts. Ad copy (headline/CTA) is never logged or judged, so the words that make a static ad are invisible to QA. |
| 9 | **Fix the persona → TTS voice mapping (voice: null bug)** | `pipeline`/`video_providers` VO path | The real run shipped `voice: null`; the persona's `Wise_Woman` casting was dropped at the last step. (Part prompt-adjacent, part wiring.) |
| 10 | **Capture the still-ad critic verdict; add motion-quality coverage** | `verifier`, `verifier_video` | The still-ad critic verdict is never captured in any live run. The video critic reads a keyframe contact sheet and is structurally blind to motion, the exact dimension #1 under-specifies. |

Items 1-8 are pure prompt-copy edits. 9 is partly wiring. 10 is partly a QA-harness change (flagged).

---

## Hard constraints any change must respect (do not regress these)

From `CLAUDE.md`, `ANTI_PATTERNS.md`, `FOUNDER_DIRECTIVES.md`, and the roadmap. These are what the pipeline already does BETTER than every competitor, and they bound every edit below:

1. **The provenance rule.** Every field is measured-from-frames, measured-from-ASR, or a closed-set label. A model is never asked for a number it cannot know. Both VLM prompts already carry "Do NOT estimate any timing, duration, ratio or count: your guess would silently overwrite a real measurement." Keep it.
2. **The model never renders text or logo.** The positive image/video prompt must not name "text/logo/copy" (naming primes diffusion to draw them). Copy and captions are composited deterministically and verified. Change #3 refines HOW suppression works; it does not weaken this rule.
3. **Actuator split: prompt = wish, post-process = guarantee.** Do not ask a diffusion/video model to paint grain, shake, or compression; those are `editor.py` fields. Prompts must not name post effects.
4. **Closed taxonomies over free text.** Hook types, beat purposes, cameras, product-visibility, variant axes are closed sets in `taxonomy.py`; `Shot.purpose` is a foreign key to a script beat. New hook vocabulary belongs in `taxonomy.py` / `_HOOK_GUIDANCE`, not ad-hoc prompt text.
5. **The Five Gates + "rejection is the feature."** Specific, Causal, Actionable, reveals the unseeable, worth Rs 5,000. Prompts must DEMAND specificity, not permit it; borderline output should fail closed. Honor the NEVER SAY list.
6. **One axis per variant.** `revary_hook` changes only the opening line. Do not let a prompt vary two things at once.
7. **Evidence tiering.** Template (reuse) > causal prior > correlational graph, injected strongest-first, the graph self-labeled "CORRELATION, not a proven cause." A new account gets nothing rather than a fabricated prior. Preserve it.

---

## Per-stage analysis and proposed changes

### Stage 1 — Brand kit (`brand_brain._KIT_SYSTEM`, brand_brain.py:15-39)

**What the run showed.** The system prompt is strong (closed schema, explicit anti-cliché list, "concrete and VISUAL"). But the output was the textbook safe identity the prompt tries to forbid: *Playfair Display + Montserrat + sage-green #3A5F4B + "Embrace Your Radiance"*, with voice keywords that are decorative adjectives (`radiant, exquisite, flourish`) rather than a usable voice. **Root cause is the input, not the model:** the prompt's spine is "infer what the winning campaigns reveal", yet the run fed zero campaign data, a blank `TARGET AUDIENCE`, and grounding was degraded (Meta down). The prompt asks a strategy question the harness never gives it data to answer.

**Changes.**
- **Feed the model real evidence or tell it there is none.** When grounding is degraded, say so in the prompt ("No campaign data is available; design from the product facts alone and do NOT invent an audience") instead of leaving the instruction to infer from data that is not there. When Shopify/Meta data IS present, inject product reviews, best-seller context, and category as labeled evidence (same discipline as the template/prior/graph blocks). Competitors (creatify, HeyParker) treat customer-review language as the primary input; the repo already ingests Shopify and can too.
- **Replace adjective voice with operational rules** (five-element brand-voice research). Change the schema so `tone` is scored on 0-10 axes (Funny↔Serious, Formal↔Casual, Respectful↔Irreverent, Enthusiastic↔Matter-of-fact) and add two required lexicon arrays: `always_use` (10-20 words/phrases) and `banned` (20-30, each with a concrete replacement, e.g. "exquisite" → the specific detail it stands for). Add `minItems` so the model cannot return an empty banned list. Downstream roles read this as the canonical voice, killing adjective mush at the source. Explicit vocabulary rules get ~90% compliance vs ~50% for "avoid jargon."
- **Keep** the anti-cliché list and "SMART not safe", but pair each "avoid X" with a positive direction drawn from the product facts (the founder rule: specificity beats negation).

### Stage 2 — Ad concepts (`story_brain._CONCEPTS_SYSTEM`, story_brain.py:37-56)

**What the run showed.** The best stage. The three real scenes were genuinely varied strategic angles, art-directed with camera height, lighting motivation, and mood. Three real weaknesses: (a) the **operator direction is not injected here**, so every scene says a generic "a woman" and the still ads are cast differently from the video; (b) the **ad copy (headline/CTA) is never logged or judged** in any run, so the words that make or break a static ad are invisible to QA; (c) concept 1 ("bustling market at dusk, pattern interrupt") **contradicted the brand kit's own donts** ("uninspired settings", "elegantly styled interior spaces").

**Changes.**
- **Guarantee non-overlap structurally, not by hope.** Add an orthogonal axis: assign each concept a different Schwartz awareness stage (Unaware → Problem-aware → Solution-aware → Product-aware → Most-aware) in addition to the angle. Five concepts each targeting a different mindset cannot collapse to one distribution. Add a hard rule: "no two concepts share more than one keyword", generated in one ordered pass so the model self-avoids (LLMs fixate on early outputs). Put the awareness stage in the closed taxonomy, not free text.
- **Inject the elaborated creator/direction** (see cross-cutting #A) so the human in a lifestyle concept matches the video's creator.
- **Reconcile against the kit.** Add: "Every concept must obey the brand kit's donts and visual_style; if an angle conflicts with them, change the angle." 
- **Log the ad copy** (headline/subhead/CTA) to the prompt trace and route it to the still-ad critic (Stage 9), so the copy is judged, not just the pixels.

### Stage 3 — Static VLM critic (`verifier._vlm_system`, verifier.py:111-123)

**What the run showed.** Good rubric (unreadable/low-contrast headline, copy over product, misspelling vs intended copy, missing CTA, off-brand/AI-slop), correct conditional logo handling. But the **verdict is never captured** in any live run (the user payload logs opaquely as `<vision>`), so we cannot see what it decided about the copy.

**Changes.**
- **Adopt the RULERS/evidence-anchored pattern.** Convert the freeform `{"passed", "issues"}` into a fixed ternary checklist ({pass, partial, fail}) of ~6 atomic items (headline legible, contrast adequate, copy clear of product, spelling matches intended, CTA visible, on-brand-not-slop), each with a required `evidence` string. Make `evidence` non-optional so a "clean" verdict with no grounding is schema-invalid. This is the single biggest anti-hallucination lever for a judge.
- **Require the intended copy in the prompt AND localize before verdict** ("describe the headline text you see, THEN judge legibility"), which cuts hallucinated critiques ~15%.
- **Capture the verdict** in the run trace (logging, not prompt) so the copy is auditable.

### Stage 4 — UGC script / hooks (`story_brain._SCRIPT_SYSTEM`, story_brain.py:110-127; `_REHOOK_SYSTEM`, 317-325; `_HOOK_GUIDANCE`, 304-315)

**What the run showed.** Well-engineered prompt (word caps tied to duration, banned openers, beat taxonomy). But output is **unreliable**: three runs honored the persona "odd filler word" brief ("Honestly, I just stopped buying clothes that don't feel good") and one ignored it, producing the exact slogan the prompt forbids ("This dress just makes me feel amazing", "The floral embroidery is absolutely exquisite"). The prompt's strongest rule (spoken sentence, not slogan) is not enforced.

**Changes.**
- **Few-shot the hook.** Add 2-3 on-brand and 2-3 off-brand hook exemplars to the prompt ("GOOD: 'Honestly, I stopped buying dresses that don't feel like this.' BAD: 'This dress makes me feel amazing.' — that is a slogan, not speech."). Few-shot examples take voice consistency from ~50% to ~90% and are the reliable way to enforce a style rule. Keep the examples on the HOOK only, not the idea slots, so concepts stay diverse.
- **Ship positive hook formulas, not just a ban-list.** Every competitor gives the model a menu of named openers ("I wish I knew this before…", "Stop doing X, try Y", "POV: you just…", "Here's what no one tells you about…"). Add 1-2 exemplar openers per closed `HookType` in `_HOOK_GUIDANCE` (stays inside the closed-set rule).
- **Add a first-frame on-screen text hook field** (2-5 words) to the script output. ~40% watch muted; the spoken hook alone misses silent scrollers. The words are composited by the editor (does not violate the no-text-in-render rule).
- **Mine customer language.** When reviews/comments are available, pass 3-5 verbatim snippets as labeled evidence and instruct the writer to build the hook from real customer phrasing (creatify/HeyParker's core move; it is quoted, not invented, so it satisfies provenance).
- **Add a self-check field.** Ask the model to return, per beat, a boolean `is_spoken_sentence` and to regenerate any beat that is a slogan before returning. A cheap in-prompt guard against the exact MAIN failure.

### Stage 5 — Storyboard (`story_brain._STORYBOARD_SYSTEM`, story_brain.py:219-235)

**What the run showed.** Good enumerated camera/visibility vocab and beat-coverage rule. The real weakness is the **lossy "normalize to N shots" step**: a 4-beat script was rendered to 4 shots then squeezed to 3, which desynced QA ("cut_alignment detected 4, planned 2").

**Changes.**
- **Pin the shot count BEFORE the script is written**, or let the script and storyboard agree on count in one pass. If `n_shots` is fixed, tell the script prompt the exact beat budget (the `max_beats` clause already exists) so the storyboard never has to drop a beat's shot after the fact.
- **Adopt a continuity block** (Veo-style): carry one shared `continuity` object (creator identity, wardrobe, setting, lighting, grade) restated verbatim in every shot, plus a per-shot `changed_variable` enum so only one thing moves shot-to-shot. Model it as a shared object in the JSON, not prose, so continuity is structurally enforced.

### Stages 6-7 — Per-shot Seedance video prompt (THE crux) (`prompt_builder.build_shot_prompt`, prompt_builder.py:105-154; seeds in `sequencer.py:85-173`)

**What the run showed (the weakest, highest-impact stage).** The actual strings sent to Seedance:
- Motion was a **noun list**: "The shot moves: woman's head, dress fabric.", "gentle sway of fabric.", "woman walking, turning." No speed, arc, easing, or intensity. The one thing video adds over a still is left blank.
- Camera was **boilerplate-identical on every shot** ("shot handheld on a phone, natural camera movement"). Framing varied (selfie/close-up/wide) but the camera MOVE never did. No push-in, rack focus, orbit, or dolly ever specified.
- **Identity regressed to a tail token.** The i2v path replaced "The SAME person, unchanged, in every shot" with a bolted-on "Art direction: tall blonde woman.", and shot 2 dropped the person entirely. Cross-shot identity rested solely on the seed image.
- **Product specificity thrown away in text.** Subjects said "the dress" and never restated the distinctive attributes (pastel-green base, multi-colored floral, Anarkali silhouette) the FLUX seed named. If the seed drifts, nothing anchors the garment.
- **Internal contradiction.** Every shot demanded both "Lush, ethereal, and gracefully vibrant" (luxury) and "Looks like a real photo a customer took… honest mess" (UGC). Opposite directions in one prompt.
- **Template bugs:** doubled period ("dress fabric.."), and `Art direction:` appended as an unintegrated fragment.

**Changes (this is where most of the win is).**
- **Direct the motion.** Replace the `motion` noun-list with directed motion: subject action + speed + arc + easing, one primary action per shot (Seedance treats extra actions as an invitation to morph). Example rewrite of shot 3: not "woman walking, turning" but "she walks three unhurried steps away from camera, then turns her head back over her left shoulder and smiles, the dress swinging with the turn." Do NOT use the word "fast" (it causes jitter in Seedance); express speed through the verb.
- **Give each shot a distinct, named camera move.** Seedance reads film vocabulary as literal instructions. Map each `ShotCamera` to a real move: hook selfie = "slow handheld push-in"; proof macro = "slow rack focus onto the embroidery"; cta wide = "steadicam arc following her turn". Add a per-shot camera-move field to the storyboard so it is planned, not boilerplate.
- **Restate the product attributes every shot** (measured facts from Shopify: garment type, base color, key visual detail), so a seed drift does not lose the product. This is provenance-safe (the attributes are measured, not invented).
- **Resolve the luxury-vs-UGC contradiction by committing per track.** A shot is either the UGC track (lead with "UGC creator, iPhone handheld", inject one concrete imperfection, natural skin texture, no cinematic gloss) OR the studio track (editorial craft), never both in one prompt. The `_UGC_CRAFT` / `_STUDIO_CRAFT` split already exists; stop mixing the brand's "lush ethereal" visual_style into a UGC shot.
- **Add the UGC realism anchors** (research + Arcads): open UGC prompts with the device/creator anchor, add ONE Arcads-style micro-detail per shot ("a stray hair she brushes back", "the fabric catching slightly on her ring") for authenticity, and end UGC prompts with the Seedance negative tail "No music, no logo, no on-screen text" (Seedance honors this tail even though FLUX ignores negatives).
- **Restore the verbatim identity anchor on i2v** and add Seedance `@Image1` reference + the Face Lock instruction ("maintaining a consistent face and the exact outfit from the reference"). Repeat the identity description verbatim in every shot, varying only action/camera.
- **Fix the template bugs** (the doubled period; weave the direction into the subject instead of appending "Art direction: …").

### Stage 7b — FLUX image prompts (`prompt_builder.build_image_prompt` 27-69, seeds `sequencer.py:85-173`, `_NEGATIVE` 16-24, `image_providers._suppress` 30-32)

**What the run showed.** The most solid image-side work: tight product isolation, real hex codes for color-grading, thorough anti-text negative. Two real weaknesses: (a) the **same generic full-garment flat-lay seed feeds all three shots**, even shot 2 whose job is an embroidery macro; (b) the **empty-garment ghost-mannequin seed → person-wearing-it i2v hop is structurally hard** (FLUX renders "NO person", then Seedance must hallucinate the whole "tall blonde woman" wearing it from a 3-word tail).

**Changes.**
- **The FLUX negative list is largely a no-op — go positive.** FLUX.2's Qwen3 text encoder ignores negative/exclusionary phrasing; `_suppress` appending "Must NOT appear: text, logo…" does little and naming those nouns can even summon them. Replace with POSITIVE text-free scene semantics: "clean unmarked surface", "plain seamless backdrop", "blank matte wall", and avoid nouns that imply typography (packaging, label, sign, poster, storefront, screen/UI, book). This actually strengthens the repo's "never name text/logo in the positive prompt" rule. **Reserve the negative-tail technique for Seedance**, where it works.
- **Match the seed to the shot.** For a macro/detail shot, generate a matched close-up seed (crop or a macro FLUX prompt), not the full-garment flat-lay. The seed should look like the shot it conditions.
- **Consider seeding the person once, not the empty garment, for i2v hero shots.** A single "creator wearing the product" still (person + real garment via the Bria product-shot path) gives Seedance a far stronger i2v starting point than an empty ghost-mannequin plus a 3-word text token. This is the biggest structural lever for both product fidelity and face consistency.
- **Front-load the load-bearing craft instruction.** FLUX weights earlier tokens more; move "ONE clear hero subject, photoreal, [camera+lens+film stock]" ahead of the ~400 characters of brand dos/donts boilerplate. Add a real camera/lens/film-stock phrase ("shot on 50mm f/2.0, soft window light") — the single highest-leverage FLUX photorealism technique.
- **Consider JSON-structured FLUX prompts** (subject/style/color_palette/camera). FLUX.2 parses structured JSON, which fits a programmatic pipeline and makes the hex-to-object binding explicit.

### Stage 8 — Voiceover (`brand_brain._VO_SYSTEM` 68-73; duplicate `story_brain._VO_SYSTEM` 402-407)

**What the run showed.** The real run shipped `voice: null` — the creator-persona → TTS-voice mapping did not fire, so the emotional casting the persona defined (`Wise_Woman` in the other runs) was dropped at the last step. The VO otherwise inherits the Stage-4 script and its slogan weakness.

**Changes.**
- **Fix the persona → `voice_id` mapping** so the creator's voice is always passed to TTS (part wiring, part prompt: ensure the persona object carries a `voice_id` and the render path reads it).
- **Delete one of the duplicate `_VO_SYSTEM` prompts** (brand_brain.py:68 and story_brain.py:402 are byte-identical). Also collapse the dead `_CONCEPTS_SYSTEM` duplicate (brand_brain.py:41 vs the live story_brain.py:37). Two copies of a prompt drift; keep one.
- When a full `Script` exists, prefer `script.spoken()` over regenerating VO (already the intent; enforce it).

### Stage 9 — Teardown classify (`teardown._CLASSIFY_SYSTEM`, teardown.py:202-216)

**What the run showed.** Strong, disciplined prompt: five closed-set fields, "choose the closest member", the provenance guard ("do NOT estimate timing/duration/ratio"). No change needed to the prompt itself. **Do not touch it** beyond keeping the closed lists in sync with `taxonomy.py`.

### Stage 10 — Temporal VLM critic (`verifier_video._CRITIC_SYSTEM`, verifier_video.py:480-490)

**What the run showed.** Excellent design (closed issue vocabulary, the provenance guard, and — after the fix committed earlier this session — a full-resolution caption-band crop for legibility). But it reads a **keyframe contact sheet and is structurally blind to motion quality**, which is exactly the dimension the Seedance prompts (#1) under-specify. Nothing in the pipeline judges whether the motion is good.

**Changes.**
- **Adopt the ternary-checklist + required-evidence pattern** here too (each `QaIssue` as {present/absent} with a one-line grounded `note`), consistent with Stage 3.
- **Add motion coverage** (larger, partly a harness change, flagged): either sample a short strip of consecutive frames (not just keyframes) for the VLM to judge motion smoothness / morphing, or add a deterministic optical-flow / frame-difference motion-sanity check to the temporal gate. This closes the one-dimension gap where the pipeline's weakest prompt has no QA at all. Note: this is more than a prompt edit; scope it separately.

---

## Cross-cutting changes

### A. Operator direction: elaborate once, propagate everywhere
Today "tall blonde woman" is passed through verbatim and only reaches the video, as a tail fragment. **Add one step that elaborates the operator direction into a structured `CreatorKit`-shaped identity** (age range, hair, build, wardrobe register, setting, skin tone as in the API run's "bright skinned") the first time it is seen, persist it to the run (like `direction.txt` / `creator_kit.json`), and inject that SAME identity verbatim into the concept scenes, the script casting, the storyboard `subject`s, and every shot prompt. This is provenance-safe (it is art direction the operator asked for, elaborated, not fabricated fact) and it fixes the "still ads and video are different people" defect at the root. It also gives i2v the strong identity anchor it currently lacks.

### B. Two negative-prompt regimes, not one
FLUX.2 ignores negatives; Seedance honors a trailing negative tail. The current `_NEGATIVE` list is applied as if both behave the same. Split it: positive text-free scene semantics for FLUX, negative tail ("No music, no logo, no on-screen text") for Seedance. See Stage 7b / 6-7.

### C. Grounding honesty
Every past run ran with grounding degraded (Meta down), yet the brand/concept/script prompts all instruct the model to reason from "what winning campaigns reveal." When the evidence is absent, the prompt should SAY so and fall back to product facts, rather than inviting confabulation. This is the Five Gates applied to the prompts themselves: do not ask for a causal inference the data cannot support.

### D. Specificity as a schema requirement
The highest-leverage cross-cutting move from the research: make "generic" and "ungrounded" **schema-invalid**. Enums for every categorical field (awareness stage, hook type, camera move, pass/fail), required non-empty lexicon/evidence arrays, and required `evidence` strings on judge verdicts. A model that returns mush then fails validation and retries, which is the repo's "reject, don't log" philosophy enforced at the schema layer.

---

## What NOT to change (already ahead of competitors)

- The **provenance rule** and both VLM "do not estimate timing/count" guards.
- **First-party winner+loser grounding** and the evidence tiering (template > prior > graph). Competitors make you upload a reference; the repo already owns the account. This is the moat.
- The **teardown classify prompt** (Stage 9) — leave it.
- **Closed-set taxonomy**, `Shot.purpose` as a beat foreign key, and **one-axis variants**.
- **Deterministic text/caption compositing** and the actuator split. Keep post effects out of the prompts.

---

## TypeScript / UI impact (apps/web + apps/api, under code freeze)

The prompt and schema changes are Python-backend only and additive. **Nothing here REQUIRES a
TypeScript change to keep working:** the `apps/api` proxy (`services/creative-gen-client.ts`,
`routes/creative-studio.ts`) passes the job JSON through, and every new field below is additive
(a TS client that ignores it is unaffected). This section records the OPTIONAL front-end work to
actually SURFACE the new value, all owned by the maintainers under the code freeze (the AI side
will not touch `apps/`). If any phase is found to REQUIRE a TS change, it is added here as a hard
dependency with the exact route/field.

New or changed job fields these changes introduce (all additive on the Python side):
- `qa_passed` (already shipped this session) and, with the judge-rubric upgrade, per-check
  `evidence` strings on `qa.checks`.
- Brand kit: `tone` as 0-10 scored axes plus `always_use` / `banned` lexicon arrays (replacing the
  free-text `tone` + `voice_keywords`).
- Concepts: an `awareness_stage` field and the logged `ad_copy` (headline/subhead/CTA).
- Script: a first-frame `on_screen_text` hook (2-5 words) and a per-beat `is_spoken_sentence` flag.
- Storyboard shots: an explicit `camera_move` field and a shared `continuity` object.

Optional TS work to expose them (maintainers, not required for correctness):
1. `apps/web` video-planner / cockpit: show `qa_passed` and the per-check evidence, so a
   QA-flagged-but-shipped render reads clearly (pairs with the salvage change already shipped).
2. If the UI renders the brand kit, handle the new `tone`-as-scales + lexicon shape instead of the
   old free-text `tone`.
3. Optional: preview/edit the elaborated creator identity. The operator `direction` is already a
   free-text input in `video-planner.component.ts`; the elaboration is backend, so this is a
   nice-to-have, not a dependency.
4. Optional: surface the `on_screen_text` hook and the concept `ad_copy` in the review UI.
5. **To use 1d's concept-casting fully:** the backend now accepts `CreativeRequest.direction`
   on `POST /creative/generate` (additive), so a run casts one person into the static concept
   ads too. Today the UI sends `direction` only to `/video/plan`; sending it to `generate` as
   well (a maintainer TS change) makes the still ads and the video share the same cast. Without
   it, 1d still casts the video path; only the concept-ad casting stays dormant.

**Phase 1 specifically (Seedance motion/camera, FLUX suppression, direction propagation) has no
hard TS dependency:** it is entirely within `apps/ai-layer` + `rnd/creative`, changes no job-field
shape the proxy relies on, and needs no front-end work to function.

---

## Suggested rollout (all $0 prompt-copy unless noted)

1. **Phase 1 (highest leverage, low risk):** Stage 6-7 motion + camera + identity-anchor + product-restatement + template-bug fixes (#1, #7); the FLUX positive-suppression + front-loaded craft (#3, Stage 7b); the operator-direction elaboration + propagation (#A). These are where the real run was visibly weakest.
2. **Phase 2:** Hook reliability (few-shot + positive formulas + self-check, #4); brand-kit input honesty + operational voice (#5); concept↔kit reconciliation + awareness-stage diversity + ad-copy logging (#8).
3. **Phase 3:** Shot-count pinning + continuity block (#6); VO voice-mapping fix + dedupe prompts (#9); judge-rubric upgrade for both critics (#3/#10, evidence-anchored ternary).
4. **Phase 4 (not pure prompt work, scope separately):** motion QA coverage (#10); the seed-the-person-not-the-empty-garment change (needs a pipeline tweak, not just prompt copy).

Each phase should be validated the way the QA/salvage work was: unit tests on the prompt-builders' string output plus a $0 dry-run, then one guarded live run per phase to eyeball real output before trusting it. Prompt changes are cheap to make and cheap to test; the live run is the only real judge of copy quality.

---

## Decisions (2026-07-20)

Resolved with lemon:

1. **Tree:** edit BOTH `apps/ai-layer/ai_layer/creative/` and `rnd/creative/src/`, kept in sync, in every change.
2. **Phase 1:** implement now (Seedance motion/camera, FLUX positive-suppression, operator-direction propagation), with unit tests plus a $0 dry-run, then a review of real output.
3. **Scope:** prompt AND schema changes are in scope; edits may touch `schemas.py` / `taxonomy.py` (0-10 tone scales, lexicon arrays, awareness-stage enum, evidence-required judge fields).
4. **Customer-review mining:** DEFERRED to future scope (`creative-studio-future-scope.md`). This pass stays prompt-craft plus the schema changes above.

---

## Sources

**Generative media (FLUX.2 / Seedance):** Black Forest Labs FLUX.2 prompting guide; fal.ai FLUX.2 + Seedance 2.0 docs (text/image/reference-to-video); deAPI "Prompting FLUX.2" (negatives ignored); videoai.me Seedance UGC templates; brandbrain.app Claude+Seedance tutorial; aividpipeline / codedesigns character-consistency guides.

**LLM prompt-craft:** NN/g tone-of-voice dimensions; atomwriter / brandvm brand-voice rules; Schwartz awareness stages (betweenthelinescopy, motiveinmotion); motionapp / segwise / ugchumans hook taxonomies; DeepMind Veo prompt guide; RULERS (arxiv 2601.08654), Localize-Before-Answer (arxiv 2505.00744), TextFake judge (arxiv 2606.01050); Gemini structured-output docs.

**Competitors:** creatify.ai (URL-to-video, review-language mining, hook formulas, Ad Clone open-source); Arcads.ai (7-part brief, micro-detail beat, thumb-stop >30%); HeyParker (research-before-write); AdCreative.ai (conversion scoring); Icon.com (scene-tagged clip library); Foreplay (swipe-file grounding).

**Repo intent:** `CLAUDE.md`; `cosmisk-wiki/strategic/ANTI_PATTERNS.md`, `FOUNDER_DIRECTIVES.md`; `dev_reports/ai_serv/creative/` roadmap, architecture-and-integration-state, simple-walkthrough, gap-analysis-vs-competitors.

_Analysis and proposal only. No prompt code was changed. The four Open Questions gate implementation._
