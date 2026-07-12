# Creative Studio: Gap Analysis vs Competitors (Creatify / Topview / Ryze / Pycraft)

> A critique of an external "10 gaps" analysis of Creative Studio, checked against the
> actual code in `rnd/creative/src/`. Companion to
> `creative-studio-architecture-and-integration-state.md`.

---

## TL;DR

The external analysis is sharp and its principles are almost all correct. The problem is
that it argues for a studio that **already exists**. Roughly six of the ten proposed
"gaps" are already implemented as typed contracts in `rnd/creative/src/`, and the tenth
("be less AI-heavy, more deterministic") is literally the studio's founding design
principle, stated almost verbatim in the schema docstrings.

So the real question is not "should we build these ten things." It is:

1. Which gaps are **actually still open** (answer: three, and they are the hardest).
2. Which copy of the studio the analysis is even describing (answer: it is correct about
   the deployed `apps/ai-layer` copy, and mostly already-done against `rnd/creative`).

The priority that falls out of this is **integration, not greenfield building**: bring the
`rnd/creative` studio (which already implements six of the ten) into the main app, then add
only the three genuinely-open items on top.

---

## Gap-by-gap, against the real schemas

| # | External claim | Status in `rnd/creative` | Evidence |
|---|---|---|---|
| 1 | Atom should be Script -> Beat -> Shot -> Clip, not Ad -> Image | **Already built** | `ScriptBeat` -> `Script` -> `Shot` -> `Storyboard` in `schemas.py`. `Shot` carries `purpose` (FK to the beat), `duration_s`, `camera`, `subject`, `product_visible`, `motion`, `dialogue`. That is the exact atom in their YAML. |
| 2 | Story too shallow (Concept -> Headline -> CTA) | **Already built** | `BeatPurpose = hook, problem, agitate, demo, proof, objection, cta`. `Script` rejects a board that does not open on a hook. The shallow path they describe is the *static-ad* pipeline, a different product. |
| 3 | No Creator Personas (CreatorKit) | **Genuinely open** | There is `BrandKit` and `UGCStyle`, but no persistent, reusable creator identity, and no face/voice consistency across shots. |
| 4 | Editing should be first-class + deterministic | **Already built** | `EditPlan` (punch zoom, speed ramp, SFX), `captions.py` (per-word burned captions), `sfx.py` (synthesized punch/whoosh/click), `editor.py`, `compositor.py`. The pipeline is Generate -> Edit -> Caption -> SFX -> QA, not Generate -> QA. |
| 5 | Renderer does not speak social media | **Already built** | `UGCStyle.to_prompt()` emits "front-facing phone selfie, arm's length", "casually framed, slightly off-centre". Post-fields (`grain`, `exposure_clip`, `recompress`, `micro_shake`) are literally "controlled imperfection". |
| 6 | No B-roll intelligence | **Partial** | `ProductVisibility` (hero/background/absent) + `ShotCamera` (macro/close_up/pov) give the vocabulary to alternate talking-head vs product. What is missing is a *rule* enforcing the alternation; today it is emergent from the LLM board. |
| 7 | No editing grammar (deterministic pacing) | **Deliberately different** | Pacing is *measured from winners* (`avg_shot_length_s`, `time_to_first_cut_s`, `words_per_minute` in `CreativeTemplate.to_brief`), not hardcoded. This is better than a fixed grammar (see disagreement below). |
| 8 | Weak performance feedback | **Scaffolded, loop not closed** | `CreativeTemplate` already carries `cohort`, `thumb_stop_rate`, `roas`, and argues (correctly) that thumb-stop is the creative-proximal signal and ROAS is downstream noise. `Variant.variant_id` is built to join to `meta_ad_id`. The data spine exists; the auto-update-priors loop does not. |
| 9 | No Creative Graph | **Partial** | The atoms are already typed and separable (`HookType`, `BeatPurpose`, `VariantAxis`). Storing them as independent queryable nodes is not done. |
| 10 | Too much AI, not enough code | **This IS the design** | `UGCStyle` splits "prompt: wishes" from "post: guarantees". `CreativeTemplate` sets `extra="forbid"` to ban VLM-invented fields. `QaIssue` is a closed set. The VLM critic is boxed. The recommendation is a paraphrase of the existing manifesto. |

---

## What is actually left

Strip out what is already built and only three real items survive, and they happen to be
the three hardest.

### 1. Creator personas + consistency (Gap 3)

The strongest point in the analysis, and genuinely missing. But note the split:

- **Easy half (schema):** add a `CreatorKit` next to `BrandKit` (voice, energy, camera
  habit, filler-word density, gesture frequency, caption style).
- **Hard half (engineering):** *identity consistency across shots* -- the same face and
  voice in shot 1 and shot 5. That is a character-consistency problem against Seedance,
  not a data-model problem, and it is where the real cost sits.

The external analysis names the easy half and skips the hard half.

### 2. Close the performance loop (Gap 8)

The data model is ready for this and it is the highest-leverage item. `CreativeTemplate`
already separates the creative-proximal signal (thumb-stop rate) from downstream noise
(ROAS), and `Variant.variant_id` is designed to join creative to `meta_ad_id`. What is
missing is the closed loop: feeding realized performance back to update generation priors.

Build this as a **self-contained loop inside the creative studio** (teardown of realized
winners -> updated priors -> next generation). It stands on the studio's own data spine
(`CreativeTemplate`, `VariantSet`, `campaign_select`) and does not depend on anything
outside the studio.

### 3. Creative graph (Gap 9)

Real, but downstream of Gap 8. A graph of hooks and cameras is only useful once each node
is joined to a performance number, and that join is Gap 8. Do 8 first; 9 is then mostly a
storage decision on top of already-typed atoms.

---

## Where the analysis is wrong

**Gap 7 (prescriptive editing grammar).** The proposal is to hardcode pacing rules ("hook
cuts every 1s, demo holds 2.5s"). The studio already does something better: it *measures*
pacing off winning ads for that specific account and conditions generation on it, then
enforces the result at QA via `cut_alignment`. A hardcoded global grammar would overwrite
account-specific truth with a generic template. Descriptive-from-winners beats
prescriptive-by-fiat.

**Gap 10 (become less AI-heavy).** This reads as advice but is actually a description of
what the code already is. Worth noticing, because it means whoever wrote the analysis
either had not read `schemas.py` or was looking at a different tree.

---

## The framing trap

The analysis is only correct about **one of the two copies** of the studio:

- Against the deployed `apps/ai-layer/ai_layer/creative/` (static-ad plus a single video
  smoke test, no UGC pipeline), nearly every gap is real and this is a solid build plan.
- Against `rnd/creative/src/` (28 modules, the full thing), six of ten are already done.

So before treating this as a roadmap, the actual question is the one the architecture doc
raised: the priority is not building these ten things, it is **integrating the studio that
already implements six of them** into the main app, then adding only personas, the closed
loop, and the graph on top.

---

## Recommended sequence

1. Finish the `rnd/creative -> apps` integration first. You already have the pipeline the
   analysis is asking you to build.
2. Add Gap 3's `CreatorKit` schema (easy half), then scope the consistency work (hard half)
   separately.
3. Build Gap 8's closed performance loop as a self-contained studio loop.
4. Gaps 6, 7, and 9 are polish and can wait. Gap 9 follows Gap 8.
