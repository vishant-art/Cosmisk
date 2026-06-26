# Creative System — How It Works (plain-English overview)

> One combined picture of the creative pipeline and the Meta integration, now that
> they are wired together. For the deep technical versions see
> `creative-pipeline-architecture.md` and `meta-api-creative-asset-retrieval.md`.
> Status: **built and tested offline; needs one live run to confirm.** Updated 2026-06-25.

---

## What the system does

It takes a brand's best-performing ad campaigns and produces finished, ready-to-run ad
images (and optionally short videos) in every size the platforms need.

The important idea: the AI image model is **only** asked to create a clean background
scene with **no words on it**. The headline, the call-to-action button and the logo are
added afterwards by ordinary, predictable code, so the text is always spelled correctly,
on-brand and sharp. Every finished ad is then **checked automatically** before it is
allowed out.

If the brand already runs ads, the system can also **pull their real winning ads and
their real product** straight from Meta and use those as a starting point. So instead of
inventing a look from scratch, it builds on what is already working.

---

## The two halves, joined

**Half 1 — Pull what already works (from Meta).**
We read the account's live ads, rank them by return on ad spend, and download the actual
images (and video thumbnails, or the full video when we own it). These become reference
material for the next step.

**Half 2 — Generate, assemble, and check.**
We design a brand kit and ad ideas, generate clean background scenes (guided by the real
winners when available), lay the words and logo on top, and run quality checks.

```
        REAL ADS (Meta)                         NEW ADS (our pipeline)
  ┌───────────────────────────┐        ┌────────────────────────────────────┐
  │ read live ads             │        │ 1. brand kit + ad copy              │
  │ rank by ROAS              │  refs  │ 2. plan the layout (per size)       │
  │ download winning images   ├──────▶ │ 3. AI makes a TEXT-FREE background  │
  │ (+ product / video frame) │        │ 4. add headline, CTA, logo (code)   │
  └───────────────────────────┘        │ 5. auto quality-check, then ship    │
                                        │ 6. resize to every aspect ratio     │
                                        └────────────────────────────────────┘
```

---

## Step by step (a single run)

1. **Pick the winners.** From the campaign data, choose the best campaigns. If a Meta
   account is provided, also pull that account's best live-ad images to use as references.
2. **Design the brand.** A language model produces a "brand kit" (colours, tone, logo
   idea) and several ad concepts, each with its own headline and call-to-action. If we
   pulled real winning ads, the model is shown those images so the brand reflects what is
   actually converting, not just guesswork.
3. **Make the logo** once, so every ad uses the same one.
4. **Plan the layout.** For each ad size (square, portrait, story, landscape) decide where
   the headline, button and logo sit, keeping clear of the areas platforms reserve.
5. **Generate the background.** The AI image model creates a clean scene with no text.
   It can be guided three ways:
   - by the **real product** (the product is placed into the scene cleanly), or
   - by the **real winning ads** (the new scene matches the proven style), or
   - by the prompt alone, if no references are available.
6. **Assemble the ad.** Ordinary code draws the headline, button and logo on top, adding
   a subtle shaded panel behind text where the background is busy so it stays readable.
7. **Check it.** Automatic checks confirm the text is readable, nothing important is
   covered, the button and logo are present, and the brand is respected. An optional
   second check uses an AI "art director" to review the finished image. If an ad fails,
   the background is regenerated a couple of times; if it still fails, it is rejected
   rather than shipped.
8. **Resize.** The approved background is extended to the other sizes and re-assembled, so
   one idea ships as a full set of formats.
9. **Record the cost.** Every step's price is written to a running log, ending with a
   grand total.

Optionally, a short **video** can be made by animating the clean background and adding the
words on top afterwards.

---

## What we can and cannot get from Meta

| What we want | Our own ads | A competitor's ads |
|---|---|---|
| The ad image (full quality) | **Yes** | No |
| A still frame from a video ad | **Yes** | No |
| The full video file | **Yes, for pages we manage** | No |
| The ad's words (headline/body) | **Yes** | Only in the EU/UK, text only |
| Which exact creative performed best | **Yes** | No |

In short: we can fully use **our own** (and our clients') winning creatives. We **cannot**
pull a competitor's actual images or videos — Meta only exposes their ad text and a
preview link, and only in some regions. So competitor visual research is not something this
system relies on.

**Good news on access:** the current Meta token can manage 31 of our/clients' Pages with
admin rights, which means we **can** download the full video files for those owned ads, not
just thumbnails.

---

## A few practical rules

- **Download immediately.** Every image and video link Meta gives us expires after a while.
  We download the file the moment we receive it and keep a stable reference for later.
- **Failures never block a run.** If Meta is unreachable or a token is missing, the system
  simply skips the references and generates normally.
- **Costs are tracked honestly.** Language-model steps record the exact amount the provider
  billed; image and video steps are calculated from the published per-image / per-second
  rates (the image provider does not return a price). A typical multi-format run costs
  roughly **$0.60–$0.80**.

---

## How to run it (quick reference)

```powershell
cd "rnd\creative"
..\..\cos\Scripts\python.exe -m pytest tests              # run the offline tests (free)

# normal run: 3 ideas, three sizes, with the AI art-director check
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --select top-roas --images 3 --formats 1:1,4:5,9:16 --vlm

# use the account's real winning ads as the starting point
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --meta-account act_<id> --ground --images 3 --formats 1:1,9:16

# place a real product into the scenes
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --product .\product.jpg --images 4
```

Everything is saved under `output/<run_id>/`: the brand kit, the logo, the downloaded
winning ads, the backgrounds, the finished ads in each size, a manifest, and the cost log.

---

## Where it stands

- **Built and passing all offline tests** (no real spend in the tests).
- **Not yet run live**, so the first real run is also the moment we confirm the exact
  shapes the image/video and Meta calls expect. If anything is off, the system falls back
  gracefully (a simpler image model, a plain resize, or a still frame).
- **Still to do:** add the words onto generated videos automatically, and (for production)
  move to a longer-lived Meta "system user" token and the newest API version.
```
