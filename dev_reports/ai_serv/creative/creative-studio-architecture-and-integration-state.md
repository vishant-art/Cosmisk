# Creative Studio: Architecture and Integration State

> **⚠️ UPDATE 2026-07-21 (maintainers) — two claims below are now stale:**
> **(1) R2 was implemented.** §3.2's "R2 evaluated and never built / ephemeral disk" no longer holds.
> Decoupled + Mode-2 presigned delivery shipped (`ai_layer/storage.py`, `_publish_assets`, the
> `/creative/asset-url` endpoint, and the apps/api 302 proxy), merged to `improve/creative`. Finished
> assets are R2-backed and survive a redeploy.
> **(2) Meta grounding is now available.** A real ad account + working token are wired, so runs can be
> grounded — the "Meta suspended / never run grounded" caveats are superseded.
> See `docs/superpowers/specs/2026-07-21-creative-studio-ui-redesign-design.md`.

> Status: reference doc. Rewritten 2026-07-13, after the UGC pipeline was integrated into the
> deployed service and the three open gaps (persona, performance loop, creative graph) were built.
> Supersedes the 2026-07-12 version, which described two diverged copies and a port that had not
> happened yet.
>
> Companions (same folder): `creative-studio-ops-handoff.md` (what infra needs doing),
> `creative-studio-gap-analysis-vs-competitors.md` (why these features and not others),
> `creative-studio-ugc-video-integration-plan.md` (the port, now executed),
> `creative-ugc-orchestration-roadmap.md` (the T1-T12 build log).

---

## TL;DR

**The two copies are no longer diverged.** `rnd/creative/src/` (R&D) and
`apps/ai-layer/ai_layer/creative/` (deployed) now hold the same studio: same modules, same logic,
same tests. They differ only in imports (flat vs package), in their persistence backend, and in
three deployment-only files.

| | `rnd/creative/src` | `apps/ai-layer/.../creative` |
|---|---|---|
| Full UGC video pipeline | yes | yes |
| Persona / prior / graph | yes | yes |
| Store | `library.py` (JSON files) | `ai_layer.db.repository` (Neon) |
| Only-in-this-tree | `library.py` | `service.py`, `video_post.py`, `__init__.py` |
| Tests | 439 pass | 440 pass |

`rnd/` is permanent. It is where experiments happen, and it must never fall behind the deployed
tree, or you would be experimenting against a studio that no longer exists.

**What the studio now is:** a UGC video-ad generator that grounds itself in an account's real
ads, renders a storyboard shot by shot with a repair ladder, verifies its own output temporally,
and — new — **learns from what it shipped**.

**What it has never done:** run live. Every test is mock-based ($0, no network). The fal balance
is negative and the Meta API is suspended, so no real render, no real grounding, and no prior or
graph built from real numbers. Treat everything below as code-complete and test-green, not proven.

---

# Part 1: How the Studio Works

## 1.1 The founding rule

The generative model **never renders text or a logo**. Copy, captions and the logo are placed
deterministically (Pillow for stills, ffmpeg for video) and then verified. The positive prompt
does not even *name* text or logo, because naming primes a diffusion model to draw them;
suppression lives in a negative list. fal is the only image/video provider; the language brain and
the vision critic run on OpenRouter.

## 1.2 Two tracks, one brain

- **Static-ad track:** campaigns -> BrandKit -> text-free background -> Pillow composite -> static
  QA gate -> multi-format outpaint. Entry: `pipeline.run` / `resume`.
- **UGC-video track:** teardown -> script -> storyboard -> per-shot render + repair -> ffmpeg edit
  -> concat -> voiceover/SFX/captions -> temporal QA gate -> variants. Entry: `plan_story` ->
  `render_story` -> `qa_video` -> `make_variants`.

Both share one identity brain, one provider layer, one cost ledger, and one fail-closed QA
philosophy.

## 1.3 End-to-end flow (UGC video)

```
  Meta account (BOTH ROAS tails)              Shopify store (bestseller)
            |                                          |
            v  _meta_cohort                            v  _shopify_products
   winners/ + losers/  (stills condition FLUX;   products/ -> BiRefNet cutout
    MP4s feed the teardown)                       -> i2v product seed
            |                                          |
            +---------------- pickings.json -----------+
            |
            v
   [2] TEARDOWN every ad with an MP4, BOTH cohorts -> template.json (this run)
        (frame-diff cuts, ASR hook, closed-set VLM)   + creative_teardowns (forever)
            |
            v
   [1] BrandKit -> brand_kit.json      [1b] CreatorKit -> creator_kit.json (WHO is on camera)
            |
            v
   [4] SCRIPT (ordered spoken beats) -> script.json          (must open on a hook)
            |                          conditioned on: template + prior + graph + creator
            v
   [5] STORYBOARD (durations refitted) -> storyboard.json    (every beat covered)
            |
            v
   [6/7] PER-SHOT RENDER + REPAIR + EDIT   (the money stage; balance-guarded)
          prompt -> snap to an allowed Seedance duration -> CACHE CHECK
          -> Seedance i2v/ref2v/t2v -> trim -> ffmpeg edit
          -> PER-SHOT QA --fail--> REPAIR LADDER (retry->reprompt->replan->drop)
            |
            v
   [8] CONCAT (stream-copy, audio dropped) -> timeline.mp4
            |
            v
   [9] FINISH: voiceover (ONE take, persona voice) -> SFX -> captions (drift-gated)
            -> video_captioned.mp4   (the ad that ships)
            |
            v
   [10] TEMPORAL QA GATE -> qa_report.json
        cuts/continuity on the PRE-caption timeline; product/caption/VLM on the shipped clip
            |
            v
   [11] VARIANTS (single-axis A/B/n) -> variants/ + creative_variants rows
            |
            v
   [12] THE LOOP:  operator publishes -> stamps meta_ad_id -> harvest -> prior
            |
            +-----> conditions the NEXT run (back to [4])

   COST: ledger.jsonl (estimate) reconciled against the fal invoice -> fal_actuals.json
```

Every stage writes typed artifacts to `output/<run_id>/`. Runs are resumable: each entry point
reads the previous stage's JSON, so you can plan a storyboard, look at it, and only then pay to
render it.

## 1.4 The evidence stack (the part that matters most)

The brain is conditioned on **three kinds of evidence, which are not equally strong**, and the
whole design turns on keeping them apart. A model handed two blocks of evidence will otherwise
weight them the same.

| Tier | What it is | Strength | Where |
|---|---|---|---|
| **Template** | ONE real winner, torn down: its hook, pacing, format, structure | A concrete thing to reuse. Not a claim. | `_structure_block` |
| **Prior** | A variant set: one axis changed **on purpose**, everything else held | **Causal.** The only causal claim in the system. | `_prior_block` |
| **Graph** | Atoms that winners use more than losers | **Correlational**, and says so in its own first line. | `_graph_block` |

They are injected in that order (`story_brain`), strongest claim first, and the weakest one
labels itself: *"This is a CORRELATION, not a proven cause: use it to choose between equally good
options, not to override the script."*

**The prior refuses to overclaim** (`outcomes.py`, `config.PRIOR_*`):
- comparisons happen only **within a variant set** (same base, one axis). Two ads from different
  runs differ for a hundred reasons; averaging them is how you come to believe something a real
  A/B test would have killed.
- an arm under **1,000 impressions may not speak at all** — a proportion over 40 impressions is
  noise with a decimal point.
- a gap that fails a **two-proportion z-test** is reported `UNDECIDED`, never as a preference.
- a new account gets **no prior**. "We do not know yet" is a correct answer.

**The graph refuses to be unidentifiable** (`graph.py`): it emits nothing without a **negative
class**, however many winners it has. "Pattern interrupt appears in 60% of winners" is exactly as
true, and exactly as meaningless, as "60% of winners ran on a Tuesday" — you cannot estimate an
effect from a sample selected on the effect. This is why the cohort fetch pulls **both tails**,
and why **losers are now torn down** (they used to be downloaded and never opened).

The label is always `thumb_stop_rate`, never ROAS. A hook can plausibly cause someone to stop
scrolling; it cannot cause the landing page, the price, the LTV or the promo calendar. Training on
ROAS trains on the funnel.

## 1.5 The creator persona (`CreatorKit`)

WHO is on camera, held constant. Split by **actuator**, because the three halves are honoured by
three different systems with three very different levels of reliability, and the schema must not
pretend otherwise:

| Half | Fields | Actuator | Reality |
|---|---|---|---|
| voice | `voice_id` | MiniMax TTS | **Guarantee.** Exact. |
| speech | `energy`, `filler_words`, `gesture` | the script brain | Reliable wish: an LLM asked for filler words obeys. |
| visual | `age_range`, `gender`, `appearance`, `wardrobe`, `setting` | the video model | A wish that mostly does **not** hold across independent renders. |

Voice consistency turned out to be **already structural**: `finish_timeline` generates **one**
voiceover for the whole timeline (never spliced per shot), so there is no per-shot voice to drift.
The persona only had to choose it.

The face is the hard half. `pin_face` (**off by default, an experiment**) generates one still of
the creator and i2v-seeds every non-hero shot from it — the only lever Seedance offers, because its
ref2v path **rejects references containing a person** (fal's content filter; this is the wall
`_product_seed` was built to get around). Whether it also rejects a person as an *i2v seed* is
**unverified** — the balance is empty.

The failure mode that matters: `generate_with_fallback` silently degrades a rejected seeded call to
t2v, which would ship **five different faces and report success**. `render_shot` therefore shouts
when conditioning is dropped and stamps it on the ledger row. A persona that quietly lies is worse
than no persona.

Priority where the two seeds collide (Seedance takes one image **or** a ref list, never both):
a hero shot keeps the **product** seed; everyone else gets the face.

## 1.6 Repair ladder and the temporal QA gate (the hard part)

A video model **almost never raises an error**. Seedance confidently returns a wrong-but-plausible
clip. So failure is **detected by QA**, not caught as an exception.

**Repair ladder (`recovery.py`):** `retry` (same prompt; models are stochastic) -> `reprompt`
(prompt seeded with the QA hint) -> `replan` (a different shot serving the same beat) -> `drop`
(redistribute the seconds). A non-repairable check (e.g. no product cutout) stops the board
immediately rather than paying four times to be told the same thing. A global render cap bounds a
systematically broken renderer.

**Temporal QA gate (`verifier_video.py`).** The studio can verify its own temporal output because
it *placed* the cuts and captions and knows the durations — so most checks are **arithmetic, not
detection**:

| Check | Fails when |
|---|---|
| shot duration | off plan by > 0.15s |
| shot motion | every frame correlates >= 0.99 with the first (a frozen render) |
| cut alignment | wrong cut count, or a cut > 0.30s off plan |
| continuity | >= 0.98 across a cut (a stall/duplicate), or < 0.75 in sequential mode |
| product presence | masked gradient correlation < 0.35 on a hero shot |
| caption/audio drift | ASR of the shipped audio diverges > 0.35 from the script |
| VLM critique | any issue from a **closed** set (incl. the new `identity_drift`) |

**Fail-closed:** `failed = any(hard) or (strict and any(inconclusive))`. Inconclusive is **not** a
pass — "we could not prove this is good" fails the gate in strict mode. `strict=False` is the
explicit, logged decision to ship unverified.

Two subtleties worth keeping: cuts/continuity run on the **pre-caption `timeline.mp4`** (burned-in
per-word captions change every ~0.5s and a frame-diff detector reads each change as a scene cut),
and correlation is zero-mean normalized, so a re-grade of the same footage still scores ~1.0 where
a naive hash would call it a different frame.

## 1.7 Cost: two sources of truth

- **`ledger.py` (a-priori).** fal returns no cost inline, so cost is computed from published rates,
  one JSONL row per step + a `TOTAL`. OpenRouter is the exception: exact, and read rather than
  estimated.
- **`fal_billing.py` (ex-post).** Reads fal's *actual* charges via the Platform API using a separate
  **`FAL_ADMIN_KEY`** (the render path only ever carries `FAL_KEY` — admin scope is isolated).
  Provides `balance()`, the pre-spend `affordable(n_clips)` guard `render_story` calls **before**
  spending (this is what prevents the overdraw that once locked the account), and
  `reconcile()`/`write_run_actuals()`. All of it no-ops gracefully without the admin key.

Observed: the estimate lands ~1% low per Seedance clip. One Seedance clip is **~$1.22**, and a
typical board is 5-6 shots, so **~$6-8 per video**. A teardown, by contrast, is ~1 cent (one ASR +
one vision call), which is why tearing down the whole cohort is affordable — and it is cached by
`(brand_id, ad_id)` forever, since an ad's structure does not change after it ran.

## 1.8 Frugality is built into the API shape

`/creative/video/plan` is **$0** (one LLM call) and returns the shot list **plus a quote**: clips,
estimated USD, live balance, affordable yes/no. `/creative/video/generate` is the only call that
spends, and it returns **402** with the shortfall rather than starting a board the balance cannot
finish — a half-rendered board is the worst outcome, because the clips it *did* render are already
paid for.

---

# Part 2: State in the Main App

## 2.1 It is integrated

`apps/ai-layer/ai_layer/creative/` now contains the **full** studio: all the UGC video modules, the
cost system, the persona, the loop and the graph. Every top-level `def`/`class` in every `rnd`
module exists in the deployed tree. The static-ad path was preserved byte-for-byte through the
merge, and the live service was never broken.

**HTTP surface** (`creative/service.py`, mounted in `api.py` behind `X-API-Key`):

```
POST /creative/generate                    static ads; all grounding ON by default
POST /creative/video/plan                  $0 — script + storyboard + a COST QUOTE
POST /creative/video/generate              PAID — render + repair + finish + QA + variants
GET  /creative/jobs/{job_id}               poll
POST /creative/variants/{id}/published     THE JOIN — stamp the meta_ad_id (manual)
POST /creative/learn                       harvest realized metrics, rebuild the prior
GET  /creative/prior/{account_id}          what this account has PROVEN
GET  /creative/graph/{account_id}          what its winners CORRELATE with
GET  /creative/assets/...                  static mount (ephemeral — see 3.2)
```

**Everything is on by default** and each grounding source degrades **gracefully and loudly**
without credentials (the run still ships ads; the log says `GROUNDING UNAVAILABLE ... proceeding
UNGROUNDED`). A missing Shopify token is not an outage — it is a quality regression you will only
see in the logs. Two deliberate exceptions: `no_logo=True` always (a standing rule), and the paid
storyboard render stays behind the plan/quote split.

**Persistence (Neon, via the existing `ai_layer.db.repository`):**

| Table | Migration | Holds |
|---|---|---|
| `creative_jobs` | 0001 (existing) | job status/stage/assets/cost; survives a restart |
| `creative_variants` | **0002 (new)** | the loop: `variant_id` -> `meta_ad_id` -> realized thumb-stop |
| `creative_teardowns` | **0003 (new)** | the structural library: torn-down ads, BOTH cohorts, cached |

Every creative DB write is **best-effort by design**: a failure is caught and never fails a run
(the generation already happened; the bytes are on disk). That is right for availability and it has
a sharp edge — **a missing table fails silently**, so the studio would keep generating while
quietly never learning. See the ops handoff.

## 2.2 The one manual step

**Nothing in this codebase publishes an ad to Meta.** `meta_live` is GET-only and the token is
read-only in practice. So the loop has a human in it, on purpose:

1. we cut variants (rows land with `meta_ad_id = NULL`);
2. **an operator publishes the ad** and stamps the id back (`POST /creative/variants/{id}/published`);
3. `POST /creative/learn` harvests the metrics and rebuilds the prior.

Automating step 2 is real work (a write-scoped `ads_management` token plus an `/advideos` ->
`/adcreatives` -> `/ads` publisher) and is untestable while Meta is suspended. Writing it now would
mean shipping an unverifiable publisher against a token that cannot use it.

---

# Part 3: What Is Left

## 3.1 Blocked externally (nobody can act)

- **fal balance is negative.** No video renders at all. Every paid render refuses up front (402).
- **The Meta API is suspended.** No cohort grounding, no teardowns, no harvest — so the prior and
  the graph have **never seen real data**.

Consequence: **nothing is live-verified.** 440/439 passing tests are all mock-based. No real
Seedance render, no real Meta grounding, no real prior. And `pin_face` remains an open question
(does fal reject a person as an i2v seed, as it does in a ref2v reference?) that only a live run
can answer.

## 3.2 Infra (the teammate's doc)

1. `FAL_ADMIN_KEY` — without it the balance guard and cost reconciliation silently disable.
2. **`CREATIVE_OUTPUT_DIR` -> a persistent volume.** The highest-value item. R2 was evaluated and
   **dropped**, so there is no object storage: without a volume every asset dies on redeploy,
   including ones already referenced by Neon rows.
3. **Migrations `0002` + `0003`.** Without them the loop and the graph never persist, silently.
4. `PG*` CI vars — the non-creative ai-layer suite cannot even collect without them.

## 3.3 Product work still open

- **B-roll alternation.** The vocabulary exists (`ProductVisibility`, `macro`/`close_up`/`pov`) but
  nothing *enforces* alternating talking-head vs product; it is emergent from the LLM.
- **Auto-publisher** (2.2), which would remove the human from the loop.
- `Shot.dialogue` is populated by the storyboard and never read by `build_shot_prompt` — a dangling
  field.

**Deliberately NOT doing:** a prescriptive "editing grammar" (hardcoded "cut every 1s"). The graph
now measures pacing per account from that account's own winners and losers, which is strictly
better than overwriting account-specific truth with a generic template. Descriptive-from-winners
beats prescriptive-by-fiat. Also not doing: Cloudflare R2 (dropped).

---

## Appendix A: Run artifacts (`output/<run_id>/`)

`manifest.json`, `brand_kit.json`, `creator_kit.json`, `template.json`, `pickings.json`,
`summary.txt`, `script.json`, `storyboard.json`, `storyboard_rendered.json`, `repair_log.json`,
`renders/gen_*.mp4` (paid raws, the cache), `product_seeds/`, `persona_seeds/`, `timeline.mp4`
(silent, pre-caption), `voiceover.mp3`, `video_captioned.mp4` (the ad), `qa_report.json`,
`variants/`, `ledger.jsonl` (estimates), `fal_actuals.json` (the invoice), plus `winners/`,
`products/`, `teardown/`, and `.work/` (scratch, deleted on success).

## Appendix B: Environment

| Var | Used by | State |
|---|---|---|
| `OPENROUTER_API_KEY` | brain + VLM critic | present |
| `FAL_KEY` | all fal generation | present |
| `FAL_ADMIN_KEY` | fal billing reads, the balance guard | **to add** |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT` | cohort grounding | present (**API suspended**) |
| `SHOPIFY_STORE` / `_TOKEN` / `_API_VERSION` | product sourcing | present |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL` | Neon | present |
| `CREATIVE_OUTPUT_DIR` | assets | **needs a volume** |
| `PG*` / `PG*_POOL` | the test-branch fixture | **missing (CI)** |
| `CLOUDFLARE_*` | nothing — R2 was dropped | unused |

## Appendix C: The two trees

`rnd/creative/src/` and `apps/ai-layer/ai_layer/creative/` hold the same 28-module studio. The only
structural difference is the store: `outcomes.py` and `graph.py` talk to a `_repo()` seam, which is
`library.py` (JSON files, no database) in rnd and `ai_layer.db.repository` (Neon) in the deployed
tree. **The interfaces are identical**, so those modules are the same code in both trees and an
experiment promoted from rnd needs no rewriting — Postgres already answers the same calls.
