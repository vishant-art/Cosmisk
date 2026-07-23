# Live Run Procedure (supervised, paid)

The one paid end-to-end run: portrait -> keyframes -> product replacement ->
Seedance clips -> voice -> ffmpeg composition -> QA -> export. Run it **with a
human present** (lemon), because it spends real fal credits and Task 17 left two
creative-quality choices that only a live render can confirm (see Cautions).

## Prerequisites

- **fal balance:** at least ~$6 of headroom (a full run is ~$4-5). Check the
  balance line the confirmation prints before you type `y`.
- **Neon + R2 + Shopify + OpenRouter** creds present in the repo-root `.env`
  (same ones the dry e2e used). **Meta/Google are NOT needed** for a live run.
- **ffmpeg + ffprobe on PATH in the terminal you launch from.** A fresh
  terminal does not inherit a prior session's PATH export; `creative_studio`
  calls `require_ffmpeg()` at the top of `generate` and aborts early if either
  binary is missing. Verify with `ffmpeg -version` first.
- A planned creative spec already exists (run `sync-shopify` -> `plan` first, or
  reuse a `<specId>` from the dry run). All commands run from `rnd_mine/` using
  the venv interpreter: `.venv/Scripts/python -m creative_studio ...`.

## The command

```
.venv/Scripts/python -m creative_studio generate --spec <specId> --live-images --live-video
```

`--live-images` gates the portrait, keyframes, and product replacement;
`--live-video` gates the three Seedance clips **and** the voice track. Omitting
one keeps that stage dry.

## What the confirmation shows

Before ANY paid call, the spend gate prints an itemized estimate and the current
fal balance, then waits for a typed `y` (anything else, including a bare Enter,
aborts with zero spend):

```
Paid generation requested. Estimated spend:
  portrait 1 + keyframes 3 ≈ $0.20-0.60; BiRefNet+BRIA ≈ $0.15
  3 Seedance clips × ≈$1.21 = ≈$3.63; TTS ≈ $0.10
  total ≈ $4-5
  current fal balance: $<balance>
Proceed with paid generation? [y/N]
```

(Pass `--yes` only for an unattended re-run you have already priced.) After the
run, the CLI prints the step table and a `balance delta:` line.

## Expected outputs

- **R2** under `creative-studio/runs/<runId>/`: `final/ad.mp4` (the deliverable),
  `final/thumb.jpg`, `portraits/`, `keyframes/shotN/`, `clips/shotN.mp4`,
  `voice/`.
- **Neon:** one `asset_manifests` row (deliverables + lineage) and one
  `qa_reports` row for `<runId>`, plus the `generation_runs` row showing all 14
  steps `done` and status `completed`.
- The status table prints all steps `done`. Re-check any time with
  `... -m creative_studio status --run <runId>`.

## Regenerating a single shot

If one clip is weak, regenerate just that shot (resets that shot's
keyframe/replace/video plus compose/qa/export, reuses the rest):

```
.venv/Scripts/python -m creative_studio regen --run <runId> --shot 2 --live-images --live-video
```

To continue a crashed or partially-failed run without redoing finished steps,
use `resume --run <runId> ...` (a run left marked `running` can only be advanced
via `resume`; `run`/`generate` will refuse it).

## Cautions (unverified until this live run)

Two Task 17 decisions are documented-default guesses, not live-verified creative
choices. Inspect the rendered output for them and adjust if needed:

1. **BRIA placement position** (`bottom_center`, `placement_type=manual_placement`)
   in `generation/adapters/fal_bria.py` — is the product actually placed correctly
   on the worn garment? The `automatic` alternative costs 10x (returns 10 images).
2. **TTS container/codec** — `key_for("voice", ...)` names the file `narration.wav`,
   but `minimax/speech-02-hd` emits MP3 by default; the bytes/content-type are
   stored correctly, but do not trust the `.wav` extension.

Full context: `.superpowers/sdd/task-17-report.md` (Concerns 1-2b) and the
docstring in `fal_bria.py`.
