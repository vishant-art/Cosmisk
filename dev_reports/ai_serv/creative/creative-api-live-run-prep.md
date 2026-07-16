# Creative Studio API — live run prep + executed run (3 clips, 720p, all assets)

Status: **EXECUTED 2026-07-16.** The prep below stands as the runbook; the live run has now
been run once via `tools/creative_api_liverun.py --confirm-spend`. Outcome recorded below.

## Live run outcome (2026-07-16, job `30e75ae7…`)

- **Brand derived from Shopify** (no Meta account → grounding skipped). Store: Pratap Sons
  USA; top bestseller "Pastel Green Floral Embroidered Anarkali" (₹8995) drove the brief.
- **Both jobs `complete`.** Produced 3 static concept ads (× formats), product cutout, 3
  product seeds, 3 Seedance clips, voiceover, burned captions, SFX, and `video_captioned.mp4`
  (12s, real 720×1280 + AAC). The `"tall blonde woman"` direction reached the storyboard
  verbatim (hook + CTA shots), Anarkali hero in all 3 shots.
- **Actual cost $4.78** (fal invoice; balance $13.03 → $8.25), ~19% over the $4.02 estimate:
  the grounded clips rendered as **image-to-video** at ~$1.42/clip (not $1.21 t2v), + 3 FLUX
  product seeds $0.25 + 6 Bria backgrounds $0.24 + TTS/ASR/merge ~$0.015. Update estimates to
  ~$1.42/clip for grounded-hero runs.
- **QA verdict: fail**, on the two pre-flagged issues — `cut_alignment` (22 detected cuts vs 2
  planned, from the UGC micro-cut editing) and `vlm_critic` unreadable captions. Everything
  else passed: product_presence (0.54–0.66), continuity, audio_video_sync, caption drift.
- **Caption fix** (`tools/creative_caption_fix.py`): re-burned large, scrim-backed, 1080p
  captions reusing the cached clips + voiceover → `video_captioned_v2.mp4`. Cost ~$0.005 (one
  Whisper ASR), no re-render. The extracted frame is plainly legible.
- **Finding — the caption QA gate is blind to captions.** `verifier_video`'s VLM critic scores
  a contact sheet of keyframes downsampled to **48×48 px** (`config.TEARDOWN_GRID`), so no
  burned text can be crisp there regardless of source resolution. The "unreadable caption"
  verdict is largely a harness artifact. Truly passing it needs a repo change (raise the grid
  for the caption critic, or judge legibility on a full-res frame) — out of scope for a
  no-edit run, logged here.

---

## Original prep (runbook)

The $0 dry harness is green; the live driver is preflight-clean and gated behind
`--confirm-spend`. Prepared 2026-07-16.

## What this run is

Full creative surface through the HTTP API, in-process (`ai_layer.api:app` via TestClient,
in-process only so prompts can be captured — otherwise identical to uvicorn):

`POST /creative/generate` (static concepts + Shopify product + Meta-grounding attempt)
→ `POST /creative/video/plan` (n_shots=3, $0 quote)
→ `POST /creative/video/generate` (3 Seedance clips + voiceover + burned-in captions + SFX).

Config (in `apps/ai-layer/tools/creative_api_liverun.py`, `CONFIG` block):
- 3 clips, 720p, 9:16, seconds=12
- static image track: 3 concepts × `["1:1","4:5","9:16"]`
- `use_shopify=True` (sources the store bestseller image)
- Meta grounding ATTEMPTED with `ground=True` + `account_id` — the token is outdated, so it
  DEGRADES to ungrounded (no teardown/prior/graph), by design and gracefully
- `direction="tall blonde woman"` (steers the script and every shot prompt)
- voiceover + captions + SFX ON
- every prompt/provider call/cost → `prompts_and_calls.txt`; every artifact →
  `apps/ai-layer/live_runs/live_<stamp>/<job_id>/` (gitignored, kept for review)

## Environment readiness (verified 2026-07-16)

| Item | State |
|---|---|
| `FAL_KEY` (renders) | set ✓ |
| `FAL_ADMIN_KEY` (balance guard + reconciliation) | set ✓ |
| `OPENROUTER_API_KEY` (brain + VLM) | set ✓ |
| `SHOPIFY_STORE` / `SHOPIFY_TOKEN` | set ✓ (product sourcing can run) |
| `META_ACCESS_TOKEN` | set but **outdated** → grounding degrades (intended) |
| `DATABASE_URL` (Neon) | set ✓ (jobs persist) |
| **fal balance** | **$13.03** — covers one run (guard needs $3.97 for 3 clips + $0.30 overhead) |

## Cost

Preflight estimate **~$4.02**: video $3.6666 (3 × $1.2222 Seedance) + static ~$0.30 (3 FLUX
backgrounds; BiRefNet cutout $0; blur-outpaint $0) + ~$0.05 (LLM/VO/ASR). ~90% is Seedance.
Balance guard is active (`FAL_ADMIN_KEY` set) and will 402 rather than half-render.
$13.03 funds ~2–3 runs before a top-up.

## REQUIRED INPUTS before the run can execute (blockers)

The live driver **refuses to spend** until these are filled (they are `REPLACE_ME`
placeholders today):

1. **`ACCOUNT_ID`** — a real Meta `act_<id>`. `.env` has no `META_AD_ACCOUNT`, so there is no
   default. The outdated token means grounding degrades regardless, but the call still needs
   an account id to attempt.
2. **`BRIEF`** — brand/product context (brand_name, product_name, description, audience,
   features, price). Shopify supplies the product image; the brief shapes the brand kit.
   Confirm the brand, or whether to derive it from the Shopify store identity.

## Changes/fixes handled in the driver (no repo/app edits)

- **Prompt logging** — the pipeline does not persist prompts to text; the driver WRAPS each
  provider seam and the LLM client to log prompt + args + model + cost to
  `prompts_and_calls.txt`, then calls through to the real provider.
- **Persistent, gitignored artifacts** — default `CREATIVE_OUTPUT_DIR` is inside the package
  and not ignored; the driver redirects to `live_runs/` and `.gitignore` now excludes it.
- **Poll-safe driver** — the previous live-API smoke crashed on a `None` poll body
  (`'NoneType' object has no attribute 'get'`). The new `_poll` tolerates a missing/None body.
- **Spend gate + preflight** — `--confirm-spend` required; preflight validates keys, reads the
  balance, prints the estimate, and refuses on placeholder inputs / short balance.

## Known risks (not blockers — decide before running)

- **QA may fail the output.** The one completed real 3-clip run (`creative-live-3clip-run.txt`)
  passed generation but its QA gate **failed** on `cut_alignment` and a `vlm_critic`
  "text_garbled / unreadable_caption" verdict. Expect the same caption-legibility risk;
  `strict=True` reports the fail but still produces the video.
- **Seedance + a specific person.** `direction="tall blonde woman"` steers t2v/i2v prompts, but
  Seedance may render an inconsistent face across the 3 shots (`pin_face` is off) or trip a
  content filter. Unverified until a live run.
- **Shopify** — sourcing degrades to "no product" if the store has no bestseller / API differs.
- **Neon persistence** — jobs persist; `creative_variants`/`creative_teardowns` writes are
  best-effort and silently no-op if migrations `0002`/`0003` are unapplied (does not affect the
  produced artifacts, only the learning loop).

## How to run

```
cd apps/ai-layer
# check balance
../../cos/Scripts/python.exe -m ai_layer.creative.fal_billing balance
# $0 preflight (safe; prints plan + estimate, refuses on placeholders)
../../cos/Scripts/python.exe tools/creative_api_liverun.py
# after filling ACCOUNT_ID + BRIEF -> the real ~$4 run
../../cos/Scripts/python.exe tools/creative_api_liverun.py --confirm-spend
```

See `apps/ai-layer/tools/README.md` and the $0 sibling `creative_api_dryrun.py`.
