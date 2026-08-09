# QA-Failed Creative Visibility — Decision Record + Open Defects

**Date:** 2026-08-09 · **Status:** ✅ IMPLEMENTED (§1 shipped; §2 masked, root cause NOT fixed)
**Branch:** `main` @ `468d32a` · **Session context:** post-PR#12 merge, new Railway account stand-up

---

## 1. Decision: QA-failed creatives become visible AND usable

### What changes

Creative media that fails the internal QA gate is currently generated, written to disk,
mirrored to R2 — and then dropped from the manifest, so the end user never sees it. It will
instead be shown in the variant grid at full fidelity, flagged with the specific reason it
failed, and remain **fully actionable** (publish / download / use in a sprint).

### Options that were on the table

| Option | Recommended? | Chosen? |
|---|---|---|
| **View-only** — renders, but publish/download/select disabled | ✅ **Recommended** | ❌ |
| **Downloadable, not publishable** — inspect offline, never reaches Meta | — | ❌ |
| **Fully actionable with a warning** — user may publish anyway after seeing the flag | ⚠️ flagged as a trade-off | ✅ **CHOSEN** |

| Option | Recommended? | Chosen? |
|---|---|---|
| **Specific reason** — e.g. `headline contrast 2.9:1 (needs 4.5:1)` | ✅ **Recommended** | ✅ **CHOSEN** |
| Generic label only (`Failed internal QA`) | — | ❌ |
| Generic label, detail on hover/expand | — | ❌ |

### Why "fully actionable" was chosen over the recommendation

**Creative Studio is still under active development.** Withholding generations while the QA
gate itself is still being tuned would hide output the operator needs to see and use. The
decision is explicitly about *not withholding any generation* during this phase — not a
statement that QA quality no longer matters.

### What this trades away — stated so it is not rediscovered as a bug

Allowing a QA-failed creative to be published makes the gate **advisory rather than
enforcing**. Two places in the repo currently assert the opposite:

- `CLAUDE.md` → *"NO MEDIOCRE OUTPUTS — reject, don't log."*
- `ai_layer/creative/schemas.py:164` → *"The pipeline ships only `pass`; `fail` loops or rejects."*

**Action when this lands:** update both wordings, or a future reader will read the new
behaviour as a defect and "fix" it back. Revisit the view-only option once Creative Studio
stabilises.

### Why the implementation is cheap (verified, not assumed)

`ai_layer/creative/pipeline.py:440` writes the composite **before** verifying it:

```python
base_out = run_dir / f"ad_{i:02d}_{_slug(base_fmt)}.png"
comp = compositor.compose(bg, base_spec, ..., base_out, ...)
report = verifier.verify(comp, ...)
```

and on final rejection, `pipeline.py:548`:

```python
manifest.rejected.append(concept.title)   # the TITLE only
continue                                   # never reaches manifest.ads / assets
```

The PNG is already on disk, and `service.py:220` `_mirror_to_r2` globs `run_dir.glob("ad_*.png")`
— so **rejected images are already uploaded to R2 today**. Only the metadata linking an image
to its failure reason is missing. No new storage or upload path is required.

There is also existing precedent for attach-and-flag on the **video** path,
`service.py:475`: *"must NOT discard them: attach the partial render and flag QA as not
passed."* This change makes the image path consistent with it.

### As implemented

- **ai-layer** `creative/schemas.py` — new `RejectedAd` (`title`, `path`, `failed_checks[]`,
  `retry_hint`) with a `.reason` property that degrades: first failing check → `retry_hint`
  → `"failed internal QA"`. `RunManifest.rejected` is now `list[RejectedAd]`, was `list[str]`.
- **ai-layer** `creative/pipeline.py` — `_make_concept` returns the `RejectedAd` instead of
  `True`; the reject branch appends it AND registers an `AssetRecord`, so the failed render
  flows through the existing R2 mirror and job payload. Truthiness contract unchanged
  (`False` on success), so `if rejected:` still reads correctly.
- **ai-layer** `creative/service.py` — `job["rejected"]` now mirrors the `assets` shape
  (`concept`, `url` via `_asset_url`, `reason`, `failed_checks`). Without the url the UI had
  nothing to render.
- **apps/api** `creative-gen-client.ts` — `rejected: string[]` → `CreativeGenRejected[]`.
  Type only; the route is a passthrough.
- **web** `output-gallery.component.ts` — the collapsed "we rejected N concepts" title list
  becomes a grid of the actual renders at full fidelity, each with a 2px red rule and the
  specific reason. `aiJob` is `signal<any>`, so no caller change was needed.

**Not done:** the publish-confirm step. Publish/download remain enabled with no extra guard,
per the "fully actionable" decision. Revisit alongside the view-only question.

### Gates

ai-layer creative 493 passed · web 456/456 · apps/api 444 passed / 2 skipped ·
`tsc --noEmit` baseline-only (`billing.ts:4` stripe) · `madge --circular` 0 cycles.
New test in `tests/creative/test_pipeline.py`: a rejected ad keeps title + path, the file
exists on disk, `.reason` resolves, and the path appears in `manifest.assets`.

---

## 2. Open defect: "Something went wrong" toast on platform actions

**Status:** 🔵 INVESTIGATING — root cause NOT confirmed. No fix attempted.

### Reported

A toast appears bottom-right on "any action on platform".

### Two mutually exclusive sources exist

| Source | Title | Body | Implies |
|---|---|---|---|
| `apps/web/.../error.interceptor.ts:51` | **Something Went Wrong** | "We've been notified. Please try again." | HTTP 500 / unlisted status → **server-side** |
| `apps/web/.../global-error-handler.ts:28` | **Unexpected Error** | "Something went wrong. Try refreshing the page." | uncaught JS error, **no HTTP** → **client-side** |

They cannot both fire: the global handler returns early on anything carrying a status
(`if (error?.rejection?.status || error?.status) return;`).

**The toast title is the decisive datum and has not yet been captured.**

### Evidence gathered

**Confirmed failing in prod** (Railway service `Cosmisk`, 2026-08-09 ~07:31 UTC onward):

```
[LLM-Gateway] countTokens failed ... "Your credit balance is too low to access the
Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."
  at async createMessage (dist/services/llm-gateway.js:191)
```

**Blast radius:** 19 files call `createMessage` — `creative-studio.ts`, `content.ts`,
`score.ts`, `reports.ts`, `google-ads.ts`, `tiktok-ads.ts`, `ai/intent.ts`, plus
`report-agent`, `content-agent`, `sprint-planner`, `sales-agent`, `creative-strategist`,
`ad-watchdog/reasoning`. Most user-visible actions in the product are AI-backed, which is
consistent with "any action".

**Ruled out:** new Railway account points at the same Neon endpoint
(`ep-little-rain-akekou1s`) as before — data and migrations intact, not an empty-DB problem.

**Not yet established:** the log window sampled contained **zero non-2xx responses**; the
`/autopilot` polls observed were all 200. No user action has been observed producing a 5xx.
Anthropic credit exhaustion is the leading hypothesis, not a confirmed cause.

### Resolution taken: noise masked, root cause deferred

Operator confirmed the cause is the exhausted Anthropic credits. **Decision:** these agents
move to an in-house OpenRouter-keyed version in a much later phase; until then the repeated
error is suppressed rather than fixed.

Further investigation also established the Watchdog is a **6-hourly cron**
(`30 1,7,13,19 * * *`, `routes/agent.ts`) that already catches its own errors — it never
500s a request. The 60s frontend poller (`notification.service.ts:67` → `/autopilot/alerts`)
returns 200. So the observed repetition was **log spam**, not a per-minute toast.

**Implemented — `llm-gateway.ts`** (the single LLM chokepoint, per architecture rule 1):

- `isCreditsExhausted(err)` matches only `/credit balance is too low/i`. Narrow on purpose:
  a genuine 400 still logs in full, every time.
- `shouldLogCreditsExhausted(err)` logs ONE actionable line per process, then suppresses.
  Process-local flag, so a redeploy re-reports it — which is when you want to hear it again.
- **Control flow is unchanged.** The error still propagates to callers exactly as before.
  This suppresses log noise; it does not swallow failures or alter degradation.
- `ad-watchdog/reasoning.ts` drops its duplicate line for the same condition (it fans out per
  concept, so one cron run logged ~30 identical stacks). Still returns `[]`.

Also renamed that log from `[Watchdog] Gemini reasoning failed` → `[Watchdog] reasoning
failed`; the "Gemini" label was stale, **not** a misroute — the path legitimately calls
Anthropic through the gateway.

**Remove this whole block when the agents move to OpenRouter keys.**

### Still true

Anthropic credits are exhausted in production. Every LLM-backed feature is degraded until
credits are added; masking the log does not change that.

### Incidental finding

`[Watchdog] Gemini reasoning failed` logs an error raised by the **Anthropic** SDK. Something
labelled Gemini is routing to Anthropic — either a mislabelled log line or a misrouted
provider. Unrelated to the toast; will mislead the next person debugging the gateway.

---

## 3. Also logged this session

- **`15028f7`** — ai-layer Dockerfile bind reverted `::` → `0.0.0.0`. The IPv6-only premise was
  measured false; `::` fails Railway's IPv4 healthcheck. Confirmed live in prod:
  `Uvicorn running on http://0.0.0.0:8000` with a green healthcheck and **no** Custom Start
  Command override. `2026-07-24-ship-to-prod-checklist.md:63` corrected.
- **`e625b31`** — `envelope_for_preset()` is now the single chunked-fetch dispatch;
  `creative/service.py:263` and `api.py:379` (competitors refresh) were still on the unchunked
  path and 500'd with `code=1 subcode=99` on large accounts.
- **`468d32a`** — apps/api no longer forces `source: 'store'`, which had taken the legacy
  branch in `_chat_messages` (bare snapshot: no tool loop, no CODE-COMPUTED ANALYSIS, no
  HISTORIC FACTS, no COMPETITOR INTEL) while the system prompt claimed those blocks were
  present. Web moved to the non-streaming `/chat` so the ad-level tool loop actually runs;
  chat timeout 60s → 180s.
- **Railway (new account `harmonious-tranquility`):** service names are **inverted** vs the old
  account — `Cosmisk` is now apps/api, `overflowing-forgiveness` is the ai-layer.
  `AI_LAYER_URL` had been set without scheme or port; corrected to
  `http://overflowing-forgiveness.railway.internal:8000`.
- **apps/api does not auto-deploy on push to `main`** while the ai-layer does. Same repo, same
  branch — a per-service setting (watch paths or auto-deploy off). Forced with
  `railway redeploy --service Cosmisk --from-source`. **Unresolved; needs a dashboard check**,
  or every backend change silently ships late.
- **`.env.test`** contains two `TEST_DATABASE_URL` lines, the first empty. Works only because
  dotenv is last-wins; any first-wins loader gets an empty string.
- **pg suite** measured at **1125s (18.7 min)** for 22 files, 391 passed / 10 skipped — the
  "≈58 min" figure in `agent_report.md:69` was a serialized per-agent run, not an orchestrator
  run. A killed pg run leaves an **orphan vitest process holding the Neon advisory lock**;
  `pgrep -fa vitest` before trusting a spurious failure.

---

## 4. Next actions

1. Capture the toast title → confirm or discard the Anthropic-credit hypothesis.
2. Top up Anthropic credits regardless — 19 call sites are currently failing.
3. Implement the QA-visibility change per §1.
4. Update `CLAUDE.md` and `schemas.py:164` wording once §1 lands.
5. Fix apps/api auto-deploy on the new Railway account.
