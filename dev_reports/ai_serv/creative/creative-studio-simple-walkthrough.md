# Creative Studio — The Flow, In Plain Terms

> A plain-language walkthrough of how the Creative Studio actually works, step by step, with
> the real technologies, models, and modules at each stage. Written to be readable without
> opening the code.
>
> Updated 2026-07-13: added the creator persona (Step 3), the learning loop (Step 11) and the
> creative graph (Step 12), and corrected two things the earlier version got wrong (see
> "Two myths" at the bottom).
>
> For the rigorous version see `creative-studio-architecture-and-integration-state.md`.

---

# Step 1 — Learn the Brand

### Goal

Understand the client before creating anything.

### Inputs

* Meta ads — **winners AND losers** (both matter; see Step 2)
* Shopify products
* Brand identity

### Tools / Models

| Purpose             | Tech                                            |
| ------------------- | ----------------------------------------------- |
| Meta data           | `meta_creatives.py`                             |
| Shopify data        | `shopify_products.py`                           |
| Identity generation | **OpenRouter** LLM (Gemini 2.5 Flash currently) |
| Storage             | `BrandKit` (Pydantic schema)                    |

Everything here is **on by default** and each source **degrades loudly**: no Shopify token means
the run still ships ads, but the log says `PRODUCT SOURCE UNAVAILABLE`. A missing credential is
not an outage — it is a quality regression you would otherwise only notice in the output.

### Output

```text
BrandKit  →  Products  →  Winning + losing creatives  →  Campaign context
```

---

# Step 2 — Reverse Engineer the Ads (winners *and* losers)

### Goal

Instead of copying a winning ad, understand **why** it worked.

And — this is the part people skip — understand what the **losers** did, because without them you
cannot tell the difference between "this is why it won" and "this is just what this brand does".

> If 60% of your winners used a pattern interrupt, that is *exactly as meaningful* as "60% of your
> winners ran on a Tuesday" — until you know how many of the **losers** used one too.

So the studio tears down **every ad with a playable MP4, both cohorts**.

### Input

Winning and losing MP4s from Meta.

### Tools / Models

| Purpose              | Tech                                                          |
| -------------------- | ------------------------------------------------------------- |
| Scene detection      | **numpy frame differencing** (mean absolute inter-frame diff) |
| Speech transcription | **Whisper** (fal), word-level timestamps                      |
| Vision understanding | Gemini Vision (OpenRouter)                                    |
| Classification       | Closed taxonomy (`taxonomy.py`)                               |
| Validation           | Pydantic (`CreativeTemplate`, `extra="forbid"`)               |

### The provenance rule

Every field is exactly one of:

1. **measured** from frames,
2. **measured** from speech,
3. **classified** from a closed list.

Nothing else ships. Ask a vision model "when does the product first appear?" and it will answer
`2.1` — confidently, and unfalsifiably. That is *worse* than no number: it is a guess wearing the
costume of a measurement.

### Measures

Hook · camera · lighting · framing · pacing · shot lengths · CTA timing · format

### Cost

About **one cent** per ad (one Whisper call + one vision call). Cheap enough to do to the whole
cohort — and the result is **cached forever**, because an ad's structure does not change after it
ran. You never pay to analyse the same ad twice.

### Output

```text
CreativeTemplate   (this run's grounding)
       +
creative_teardowns (the library that compounds, forever)
```

---

# Step 3 — Cast the Creator (`CreatorKit`)

### Goal

Decide **who is on camera**, and keep them the same person in every shot.

### The honest bit

A persona has three halves, and they are **not equally real**:

| Half                              | Who honours it   | How reliable                                    |
| --------------------------------- | ---------------- | ----------------------------------------------- |
| **Voice** (`voice_id`)            | MiniMax TTS      | **A guarantee.** Exact.                         |
| **Speech** (energy, filler words) | the script LLM   | Reliable — ask for false starts, get them.      |
| **Face / look** (age, appearance) | the video model  | **A wish.** It mostly drifts across shots.      |

Voice consistency was free all along: the studio generates **one** voiceover for the whole ad
(never spliced per shot), so there is no per-shot voice to drift. The persona just picks it.

The **face is the hard problem**. Seedance *rejects a reference image containing a person*, so you
cannot simply hand it a photo of your creator. There is an experimental mode (`pin_face`, **off by
default**) that generates one still of the creator and seeds every shot from it. We do not yet
know if that works — it needs a live run, and the fal balance is empty.

Critically: if that seed gets rejected, the provider **silently falls back** to an unconditioned
render — which would ship **five different faces and report success**. So the renderer *shouts*
when conditioning is dropped. A persona that quietly lies is worse than no persona.

---

# Step 4 — Write the Script

### Goal

Write an entirely new story. Not a copy.

### Input

BrandKit · CreativeTemplate · **the prior** · **the graph** · CreatorKit *(see Step 4b)*

### Tools

| Purpose | Tech                            |
| ------- | ------------------------------- |
| LLM     | Gemini 2.5 Flash via OpenRouter |
| Module  | `story_brain.py`                |
| Schema  | `Script`, `ScriptBeat`          |

The LLM writes ordered beats:

```text
Hook  →  Problem  →  Demo  →  Proof  →  CTA
```

Hard rule: **a script must open on a hook.** The first two seconds earn the next two.

---

# Step 4b — What the brain is actually told (the evidence stack)

This is the most important idea in the whole system, and it is invisible from the outside.

The brain is given **three kinds of evidence, in order of strength**, and they are kept firmly
apart — because a model handed two blocks of evidence will otherwise treat them as equally true.

| # | Evidence      | What it is                                              | How strong                                    |
| - | ------------- | ------------------------------------------------------- | --------------------------------------------- |
| 1 | **Template**  | One real winner, torn down                              | A concrete thing to reuse. Not a claim.       |
| 2 | **Prior**     | An A/B test: **one thing changed on purpose**           | **Proof.** The only causal claim in the system.|
| 3 | **Graph**     | Things winners do more than losers                      | **A correlation** — and it says so itself.    |

The graph literally introduces itself as *"This is a CORRELATION, not a proven cause: use it to
choose between equally good options, not to override the script."*

If there is nothing credible to say, **nothing is said.** A new account gets no prior and no graph,
because "we don't know yet" is a correct answer and a fabricated one is not.

---

# Step 5 — Build the Storyboard

### Goal

Convert the script into shots.

### Tools

| Purpose    | Tech              |
| ---------- | ----------------- |
| Planner    | Gemini            |
| Module     | `storyboard.py`   |
| Validation | `fit_durations()` |
| Validation | `validate()`      |

Each shot carries: duration · purpose · camera · dialogue · motion · **the beat it renders**.

That last one matters: `Shot.purpose` is a **foreign key to a script beat**. It is what makes it
possible to repair one broken shot later without re-rendering the ad.

**The planner proposes durations. The software corrects them mathematically** so they sum to the
target exactly. And if a beat has no shot, that is a *failed plan* — retried once, then raised.
The studio will not invent a missing shot, because a fabricated beat sitting next to written ones
is indistinguishable from a real one.

---

# Step 6 — Generate Every Shot

This is where the expensive AI happens.

### Image models (all via **fal**)

| Task              | Model             |
| ----------------- | ----------------- |
| Lifestyle image   | FLUX.2 Flex       |
| Backup            | FLUX.2 Pro        |
| Product placement | BRIA Product Shot |
| Cutout            | BiRefNet          |
| Outpainting       | Blur / FLUX       |

### Video model — **Seedance 2.0** (via fal)

| Situation      | Endpoint           |
| -------------- | ------------------ |
| No references  | Text-to-video      |
| Seed image     | Image-to-video     |
| Previous frame | Reference-to-video |

It takes **either one seed image or a list of references — never both.** So when a shot wants the
product *and* the creator's face, there is a priority order: a **hero product shot keeps the
product** (the product must actually appear), everyone else gets the face.

### The money

One Seedance clip is **~$1.22**. A typical ad is 5-6 shots, so **~$6-8 per video**.

Which is why:

* the run is **balance-guarded** — it refuses to start a board it cannot finish, because a
  half-rendered board is the worst outcome (the clips it *did* render are already paid for);
* there is a **content-addressed cache** (SHA1 of prompt + refs + settings), so re-running a clean
  board costs **$0**;
* and you can **quote before you buy** (Step 10).

---

# Step 7 — Repair Bad Shots

One of the smartest modules.

The video model almost never says *"I failed."* It confidently returns a wrong-but-plausible clip.
So failure is **detected by QA**, not caught as an error.

```text
Retry  →  Rewrite the prompt  →  Rewrite the shot  →  Drop the shot
```

* **Retry** — same prompt (models are stochastic; once is worth it).
* **Rewrite prompt** — reprompt, seeded with the QA verdict.
* **Rewrite shot** — a *different* shot serving the same beat.
* **Drop** — remove it and redistribute the seconds.

Escalate, don't loop: a model that produced a bad shot from a prompt will usually produce another
bad shot from the same prompt. And if a check can't be fixed by re-rendering (say, there's no
product cutout to compare against), the ladder **stops** rather than paying four times to be told
the same thing.

Modules: `recovery.py`, `sequencer.py`.

---

# Step 8 — Edit the Video

Once all the clips exist: **no more AI.** Traditional editing.

| Task          | Tech                       |
| ------------- | -------------------------- |
| Concatenate   | ffmpeg                     |
| Voiceover     | MiniMax Speech-02 HD (fal) |
| ASR           | Whisper (fal)              |
| Captions      | `captions.py`              |
| Sound effects | `sfx.py`                   |
| Editing       | `editor.py`                |

```text
Voice  →  SFX  →  Captions  →  Final MP4
```

The order is deliberate: the voiceover lands first so the SFX have something to mix against, and
the captions go **last** because they are checked against the audio that actually ships.

One voiceover across the whole ad, muxed once — splicing per-shot audio would produce exactly the
seams the cuts were meant to hide.

---

# Step 9 — QA

The studio watches itself.

Here is the trick: **the studio can verify its own video because it *placed* the cuts and the
captions and it knows the durations.** So most checks are **arithmetic, not detection** — it isn't
trying to *understand* the video, it's asserting that what came back matches what it ordered.

### Deterministic checks

| Check            | How                                         |
| ---------------- | ------------------------------------------- |
| Cut timing       | numpy frame differencing vs the planned cuts |
| Motion           | frame correlation (catches a frozen render)  |
| Product presence | gradient matching under the cutout's mask    |
| Caption drift    | Whisper the shipped audio, compare to script |
| Continuity       | cross-frame correlation across each cut      |

### AI check

Gemini Vision — but it may only return **issues from a predefined list**. Never free-form opinions,
and it is forbidden from estimating timings or counts, because those are already measured exactly.

### Fail-closed

**"Inconclusive" is not a pass.** If a check couldn't run, the gate fails. "We could not prove this
is good" is not the same as "we found nothing wrong". Shipping unverified is an explicit, logged
decision — never a default.

Module: `verifier_video.py`. If QA fails → the repair ladder.

---

# Step 10 — Quote, Then Buy

Because a video costs real money, the API is split in two:

| Call                       | Cost     | What you get                                              |
| -------------------------- | -------- | --------------------------------------------------------- |
| `POST /creative/video/plan`     | **$0**   | The shot list **and a quote**: clips, $, balance, affordable? |
| `POST /creative/video/generate` | **paid** | The render. Refuses (402) if the balance can't cover it.  |

Nobody pays Seedance without first seeing exactly what they are buying.

---

# Step 11 — Produce Variants

### Goal

Generate multiple ads without regenerating everything.

| Variant           | Cost                    |
| ----------------- | ----------------------- |
| **Hook**          | High — needs a re-render |
| **Caption style** | Almost free — recut      |
| **Aesthetic**     | Almost free — re-grade   |

There are **exactly three axes**, and the list is closed on purpose.

### The one rule

**Only one axis changes.**

```text
Ad A  →  (different hook)  →  Ad B
```

Not: hook *and* music *and* captions.

This is not fussiness — it is the entire point. If two ads differ on one axis and one wins, you
know **why**. If they differ on three, the result is attributable to **none** of them, and you have
paid for an experiment that taught you nothing.

Module: `variants.py`.

---

# Step 12 — Learn From What Shipped (the loop)

This is what makes the studio get better instead of just getting *used*.

```text
Cut variants
      ↓
A human publishes the ad on Meta  ←  (the one manual step)
      ↓
Stamp which ad it became          POST /creative/variants/{id}/published
      ↓
Harvest what actually happened    POST /creative/learn
      ↓
Build the PRIOR
      ↓
Condition the next run  ────────→  back to Step 4
```

### Why a human is in it

**Nothing in this codebase publishes an ad.** The Meta integration is read-only. So a person ships
the ad and tells us which one it became. That single call is what closes the loop — without it,
every ad you ran is an unattributable number.

### The metric

**Thumb-stop rate** (did they stop scrolling?), *never* ROAS.

A hook can plausibly cause someone to stop scrolling. It cannot cause your landing page, your
price, your delivery times, or your discount calendar. **Train on ROAS and you train on the whole
funnel**, then congratulate the creative for it.

### What the prior refuses to do

* It won't compare ads from **different runs** (they differ for a hundred reasons).
* It won't listen to an arm with **under 1,000 impressions** (a percentage measured on 40 views is
  noise with a decimal point).
* It won't call a small gap a **winner** — it runs a real significance test and says `UNDECIDED`.
* It won't tell a **new account** anything at all.

A confident prior built on 40 impressions is worse than no prior, because the brain will *act* on
it.

Module: `outcomes.py`.

---

# Step 13 — The Creative Graph

### Goal

Stop storing **ads**. Start storing **choices**.

An ad isn't one thing — it's a bundle of decisions. "Which ad won?" is a nearly useless question
compared to "which *choice* won?". A folder of winning MP4s cannot tell you whether fast cutting
works for this brand. A table of choices can.

```text
CreativeTemplate  →  atoms  →  [ hook=pov, pacing=fast, camera=selfie, cta=late, ... ]

many ads, BOTH cohorts  →  "pov appears in 80% of winners vs 20% of losers"
```

### It refuses to speak without losers

If your library has only winners, the graph returns **nothing** — no matter how many winners it
has. (Back to Step 2: without a negative class, every feature of a winner is, by definition, a
feature of a winner.)

### And it never overclaims

It reports **"more common in winners"**, never **"causes wins"**. Winners differ from losers in a
hundred ways that aren't this atom — budget, audience, product, season, luck. The only *causal*
claim in the whole system is a variant test (Step 11/12), where one thing was changed on purpose.

Endpoint: `GET /creative/graph/{account}`. Module: `graph.py`.

---

# Supporting Infrastructure

## LLM

**OpenRouter** — Gemini 2.5 Flash (planning), Gemini Vision (critique). Swappable.

## Providers

**fal.ai** — Seedance (video), FLUX / BRIA / BiRefNet (images), Whisper (ASR), MiniMax (TTS).

## Schemas

Everything is typed with **Pydantic**: `BrandKit`, `CreatorKit`, `CreativeTemplate`, `Script`,
`Storyboard`, `Shot`, `QAReport`, `Variant`, `CreativePrior`, `CreativeGraph`.

No dictionaries floating around.

## Cost tracking

| System           | What                                                    |
| ---------------- | ------------------------------------------------------- |
| `ledger.py`      | **Estimated** — computed from published pricing         |
| `fal_billing.py` | **Actual** — reads fal's invoices, reconciles the guess |

The estimate lands about **1% low** per clip. `fal_billing` also powers the pre-spend balance guard.

## Memory (what persists)

| Store                | Holds                                               |
| -------------------- | --------------------------------------------------- |
| `creative_jobs`      | Job status, assets, cost                            |
| `creative_variants`  | **The loop** — what we changed → what it did        |
| `creative_teardowns` | **The library** — torn-down ads, both cohorts, cached |

In `rnd/` these are JSON files (`library.py`) so the studio runs on a laptop with no database.
In production they are Neon Postgres. **Same interface**, so an experiment promotes without a rewrite.

## Configuration

Everything in `config.py`: model IDs, thresholds, QA limits, significance bars.

Changing Seedance → Veo, or Gemini → Claude, is largely a config change.

---

# The Entire Pipeline

```text
Brand Data (Meta winners + LOSERS, Shopify)
        │
        ▼
Brand Brain  +  Creator Persona
(Gemini via OpenRouter)
        │
        ▼
Creative Teardown — every ad, both cohorts
(numpy frame-diff + Whisper + Gemini Vision)   ──►  teardown library (cached forever)
        │
        ▼
EVIDENCE:  template  +  prior (proof)  +  graph (correlation)
        │
        ▼
Script  →  Storyboard
(Gemini + deterministic validation)
        │
        ▼
Shot Rendering  ◄──►  Repair Ladder
(FLUX + BRIA + BiRefNet + Seedance via fal)     [balance-guarded, cached]
        │
        ▼
Video Editing
(ffmpeg + MiniMax TTS + Whisper + captions + SFX)
        │
        ▼
Temporal QA  (fail-closed)
(numpy + Whisper + Gemini Vision)
        │
        ▼
Variants  (one axis only)
        │
        ▼
Ship  →  publish  →  harvest  →  PRIOR + GRAPH  ──┐
        │                                          │
        └──────────────── next run ◄───────────────┘
```

**The AI only understands, plans, generates, and judges.** Everything else — composition, editing,
timing, stitching, captions, caching, cost, orchestration, and every statistical claim — is
deterministic software. That separation is what makes this resilient to the foundation models
changing underneath it.

---

# Two myths this doc used to repeat

Worth stating plainly, because both were in the earlier version and both are wrong:

1. **"Scene detection uses OpenCV."** It does not. There is **no cv2 anywhere** in the studio, and
   that is deliberate (`config.py`: *"No cv2, no scenedetect"*). Cuts are found with **numpy mean
   absolute inter-frame differencing** on downsampled frames; saliency is Pillow-only. It is not
   even a dependency.

2. **"CTA is a variant axis."** It is not. There are exactly **three** axes — `hook_type`,
   `caption_style`, `aesthetic` — and the set is closed on purpose, because an axis you cannot
   name is an axis you cannot attribute a result to.

---

# One last caveat

**None of this has run live yet.** Every test is mock-based ($0, no network). The fal balance is
negative and the Meta API is suspended, so no real render has happened, and the prior and the graph
have never seen a real number. The code is complete and green — it is not proven.
