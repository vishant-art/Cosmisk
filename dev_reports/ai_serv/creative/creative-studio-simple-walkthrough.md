# Creative Studio — The 9-Step Flow, In Plain Terms

> A plain-language walkthrough of how the Creative Studio actually works, step by step, with
> the real technologies, models, and modules at each stage. Written to be readable without
> opening the code.
>
> For the rigorous version see `creative-studio-architecture-and-integration-state.md`; for
> how QA decides pass/fail see the temporal-QA section there.

---

# Step 1 — Learn the Brand

### Goal

Understand the client before creating anything.

### Inputs

* Meta ads (winners + losers)
* Shopify products
* Brand identity
* Logos
* Existing assets

### Tools / Models

| Purpose                          | Tech                                            |
| -------------------------------- | ----------------------------------------------- |
| Meta data                        | `meta_creatives.py`                             |
| Shopify data                     | `shopify_products.py`                           |
| API connectors (future main app) | `apps/connectors`                               |
| Identity generation              | **OpenRouter** LLM (Gemini 2.5 Flash currently) |
| Storage                          | `BrandKit` (Pydantic schema)                    |

### Output

```text
BrandKit

↓

Products

↓

Winning creatives

↓

Campaign context
```

---

# Step 2 — Reverse Engineer a Winning Ad

### Goal

Instead of copying a winning ad...

Understand why it worked.

### Input

Winning MP4 from Meta

### Tools / Models

| Purpose              | Tech                                                         |
| -------------------- | ------------------------------------------------------------ |
| Scene detection      | OpenCV / frame differencing (Mean Absolute Frame Difference) |
| Speech transcription | **Whisper** (Fal)                                            |
| Vision understanding | Gemini Vision (OpenRouter)                                   |
| Classification       | Closed taxonomy (`taxonomy.py`)                              |
| Validation           | Pydantic (`CreativeTemplate`)                                |

### Measures

* Hook
* Camera style
* Lighting
* Pacing
* Shot lengths
* CTA timing
* Creator style
* Format

### Output

```text
CreativeTemplate
```

This becomes the creative DNA for this ad.

---

# Step 3 — Write the Script

### Goal

Write an entirely new story.

Not copy.

### Input

* BrandKit
* CreativeTemplate

### Tools

| Purpose | Tech                            |
| ------- | ------------------------------- |
| LLM     | Gemini 2.5 Flash via OpenRouter |
| Module  | `story_brain.py`                |
| Schema  | `Script`, `ScriptBeat`          |

The LLM creates

```text
Hook

↓

Problem

↓

Demo

↓

Proof

↓

CTA
```

---

# Step 4 — Build the Storyboard

### Goal

Convert script into shots.

### Tools

| Purpose    | Tech              |
| ---------- | ----------------- |
| Planner    | Gemini            |
| Module     | `storyboard.py`   |
| Validation | `fit_durations()` |
| Validation | `validate()`      |

Each shot contains

* duration
* purpose
* camera
* dialogue
* motion
* beat mapping

Example

```text
Shot 1

2 sec

Selfie

Hook

↓

Shot 2

3 sec

Product close-up

Demo
```

The planner proposes durations.

The software corrects them mathematically.

---

# Step 5 — Generate Every Shot

This is where the expensive AI happens.

## Prompt Builder

Creates a prompt from

* BrandKit
* Shot
* CreativeTemplate

### Image models

| Task              | Model             |
| ----------------- | ----------------- |
| Lifestyle image   | FLUX.2 Flex       |
| Backup            | FLUX.2 Pro        |
| Product placement | BRIA Product Shot |
| Cutout            | BiRefNet          |
| Outpainting       | Blur / FLUX       |

Provider

* **Fal.ai**

---

### Video models

Everything currently uses

**Seedance 2.0**

through Fal.

Depending on input

| Situation      | Endpoint           |
| -------------- | ------------------ |
| No references  | Text-to-video      |
| Seed image     | Image-to-video     |
| Previous frame | Reference-to-video |

---

### Cache

Content-addressed SHA1 cache

Avoids paying twice.

---

# Step 6 — Repair Bad Shots

One of the smartest modules.

The video model almost never says

"I failed."

Instead

QA catches failures.

Then

```text
Retry

↓

Rewrite Prompt

↓

Rewrite Shot

↓

Drop Shot
```

### Modules

* `recovery.py`
* `sequencer.py`

### Uses

* Gemini (for reprompting/replanning)
* Seedance (rerender)

---

# Step 7 — Edit the Video

Once all clips exist

No more AI.

Traditional editing.

### Tools

| Task          | Tech                       |
| ------------- | -------------------------- |
| Concatenate   | ffmpeg                     |
| Voiceover     | MiniMax Speech-02 HD (Fal) |
| ASR           | Whisper                    |
| Captions      | `captions.py`              |
| Sound effects | `sfx.py`                   |
| Editing       | `editor.py`                |

Pipeline

```text
Voice

↓

SFX

↓

Captions

↓

Final MP4
```

---

# Step 8 — QA

The studio watches itself.

This is another hybrid AI + deterministic stage.

## Deterministic checks

| Check            | Tech                    |
| ---------------- | ----------------------- |
| Cut timing       | OpenCV                  |
| Motion           | Frame correlation       |
| Product presence | Gradient matching       |
| Caption drift    | Whisper transcription   |
| Continuity       | Cross-frame correlation |

---

## AI checks

Gemini Vision

Returns only

* predefined issues

Never free-form opinions.

### Module

`verifier_video.py`

If QA fails

↓

Repair ladder.

---

# Step 9 — Produce Variants

Goal

Generate multiple ads

without regenerating everything.

### Types

| Variant       | Cost            |
| ------------- | --------------- |
| Hook          | High (rerender) |
| Caption style | Almost free     |
| Aesthetic     | Low             |
| CTA           | Low             |

### Module

`variants.py`

Rule

Only one axis changes.

So

```text
Ad A

↓

Different hook

↓

Ad B
```

instead of changing

* hook
* music
* captions

all together.

---

# Supporting Infrastructure

These modules power every stage.

## LLM

Currently

* **OpenRouter**

  * Gemini 2.5 Flash (planning)
  * Gemini Vision (critique)

Can be swapped.

---

## Video Provider

Currently

* **Fal.ai**

  * Seedance
  * FLUX
  * Whisper
  * MiniMax Speech

---

## Schemas

Everything is typed using

* **Pydantic**

Examples

```text
BrandKit

CreativeTemplate

Script

Storyboard

Shot

QAReport

Variant
```

No dictionaries floating around.

---

## Cost Tracking

Two systems

### Estimated

```text
ledger.py
```

based on published pricing.

### Actual

```text
fal_billing.py
```

reads Fal invoices using

`FAL_ADMIN_KEY`

and reconciles estimates.

---

## Configuration

Everything lives in

```text
config.py
```

Examples

* model IDs
* thresholds
* provider names
* QA limits

Changing from Seedance → Veo or Gemini → Claude is largely a configuration change.

---

# The Entire Pipeline

```text
Brand Data
(Meta + Shopify)
        │
        ▼
Brand Brain
(Gemini via OpenRouter)
        │
        ▼
Creative Teardown
(OpenCV + Whisper + Gemini Vision)
        │
        ▼
Script Generation
(Gemini)
        │
        ▼
Storyboard Planning
(Gemini + validation logic)
        │
        ▼
Shot Rendering
(FLUX + BRIA + BiRefNet + Seedance via Fal)
        │
        ▼
Repair Ladder
(Gemini + Seedance)
        │
        ▼
Video Editing
(ffmpeg + MiniMax TTS + Whisper + captions + SFX)
        │
        ▼
Temporal QA
(OpenCV + Whisper + Gemini Vision)
        │
        ▼
Variants
(rule-based + selective rerendering)
```

In short, the "AI" is only responsible for **understanding, planning, generating, and judging**. Everything related to **composition, editing, timing, stitching, captions, storage, caching, cost tracking, and orchestration** is implemented with deterministic software. That separation is what makes the architecture modular and resilient to changes in underlying foundation models.
