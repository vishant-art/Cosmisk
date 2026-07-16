# Creative Studio API test tools

Two drivers that exercise the **real** Creative Studio HTTP surface (`ai_layer.api:app`)
in-process via FastAPI `TestClient`. Both drive the same routes and the same pipeline a
uvicorn deployment would; they run in-process so provider seams can be mocked (dry run) or
wrapped for prompt-capture (live run), which a separate process cannot do.

Run everything from `apps/ai-layer/` with the project venv:
`../../cos/Scripts/python.exe tools/<script>.py`

## `creative_api_dryrun.py` — hermetic, $0, no network

Mocks every paid seam (FLUX, Seedance, MiniMax TTS, Whisper, fal billing, the VLM critics)
so it spends **$0** and makes **no network calls**, while the real pipeline runs end to end
(sequencer, recovery ladder, editor ffmpeg ops, caption burn-in, SFX, ledger). The mocked
media is genuine (real tiny PNG/MP4/MP3) so the editor/caption/concat paths execute for real.

Proves the wiring and the money-gating, not output quality. Drives
`generate` → `video/plan (n_shots=3)` → `video/generate` and writes a report + a $0 ledger.

```
../../cos/Scripts/python.exe tools/creative_api_dryrun.py
```
Output: `apps/ai-layer/live_runs/dryrun_<stamp>/` (gitignored).

## `creative_api_liverun.py` — live, PAID, guarded

Same flow with **real** providers. Every prompt/provider call/cost is captured to
`prompts_and_calls.txt`; every artifact is kept under `live_runs/live_<stamp>/<job_id>/`.

**Spends real money only with `--confirm-spend`.** Without it, PREFLIGHT runs: it validates
inputs + keys, reads the live fal balance, prints the plan + cost estimate, and exits at $0.

Before a live run, edit the `CONFIG` block at the top of the file:
- `ACCOUNT_ID` — real `act_<id>` (the Meta token is outdated, so grounding degrades; the id
  only picks which account is queried).
- `BRIEF` — brand/product context for the brand kit.

This run is pre-set for: 3 clips, 720p, 9:16, static image track on, Shopify sourcing on,
Meta grounding attempted (degrades), `direction="tall blonde woman"`, voiceover + captions
+ SFX on. Estimated cost ~$4 (≈90% Seedance).

```
# $0 preflight
../../cos/Scripts/python.exe tools/creative_api_liverun.py
# real run (~$4)
../../cos/Scripts/python.exe tools/creative_api_liverun.py --confirm-spend
```

Check the fal balance any time: `../../cos/Scripts/python.exe -m ai_layer.creative.fal_billing balance`
