# Creative Studio — UI/UX Redesign (scoped design doc)

**Date:** 2026-07-21 · **Surface:** the Creative Studio screen in `apps/web` (Angular) + its
proxy routes in `apps/api` · **Status:** design, not implemented.

> Scope: the Creative Studio screen ONLY. The three sibling legacy surfaces (Creative Cockpit,
> Director Lab, Creative Engine) are left as-is and are not designed for here. Creative Studio
> is the one true creative surface.
>
> Grounding: `dev_reports/ai_serv/creative/` — cited per-decision as [walkthrough],
> [architecture], [ops-handoff], [gap-analysis], [ts-wiring], [ugc-plan].

---

## 1. Design thesis

**One line:** *"See the evidence, see the price, then decide — the studio never spends your
money or your trust silently."*

Every competitor (Creatify, Arcads, AdCreative) sells "type a URL, get ads". The docs' entire
differentiation is the opposite posture: grounded in the account's real winners AND losers,
statistically honest, cost-guarded, self-verifying [gap-analysis, walkthrough §2/§4b]. The UI
must *show* that posture, because it is invisible from the outside ("this is the most important
idea in the whole system, and it is invisible" — [walkthrough §4b]). Four principles fall out:

1. **Grounded — and loud when it isn't.** Every grounding source (Meta cohort, Shopify product)
   is on by default and fails visibly: a missing credential is "a quality regression you would
   otherwise only notice in the output" [walkthrough §1, architecture §2.1]. In the UI this is a
   persistent badge, never a toast that disappears.
2. **Quote before spend.** The API is split into a $0 `plan` and a paid `generate` precisely so
   "nobody pays Seedance without first seeing exactly what they are buying" [walkthrough §10,
   architecture §1.8]. The quote screen is therefore the most important screen in the product
   and gets the most design weight.
3. **QA-honest.** "Inconclusive is not a pass"; shipping unverified is an explicit, logged
   decision [walkthrough §9]. The UI shows verdicts WITH evidence, shows what was rejected, and
   renders "flagged-but-shipped" as exactly that — shipped, with an unmissable warning.
4. **One person, one voice — honestly labeled.** The persona's three halves are not equally
   real: voice is a guarantee, speech a reliable wish, the face a wish that drifts
   [walkthrough §3]. The persona UI must not pretend otherwise; a persona that quietly lies is
   worse than no persona.

Anti-goal: no fake magic. No spinner that hides 12 steps behind "Generating your ads ✨". The
pipeline's 12-step story is legible and interesting [walkthrough] — narrate it.

---

## 2. Information architecture & entry

### 2.1 Screen skeleton

One route, four sequential zones. Not a wizard with separate pages — a single scrolling run
view where completed zones collapse to summaries. This matches the backend's resumable-stage
design ("plan a storyboard, look at it, and only then pay to render it" [architecture §1.3]).

```
┌──────────────────────────────────────────────────────────────────────┐
│ CREATIVE STUDIO          Brand: [Pratap Sons ▾]  Ad acct: [act_… ▾]  │
│                          ● Meta: grounded   ● Shopify: connected     │
├────────────────────────────────────────────────┬─────────────────────┤
│  ZONE A  Setup (brief · direction · formats)   │  HISTORY            │
│  ZONE B  Run (live activity feed)              │  (right rail,       │
│  ZONE C  Results (concepts · QA · cost)        │   collapsible)      │
│  ZONE D  Video (persona → plan → QUOTE → gen)  │                     │
└────────────────────────────────────────────────┴─────────────────────┘
```

The top bar carries the **brand** and **ad-account** selectors plus the two grounding pills
(§9). These are run inputs, not settings: the ad account is what `X-Meta-Token` grounds
against and what `/creative/prior/{acct}` and `/creative/graph/{acct}` key on.

### 2.2 Starting a run: brief-first, `direction` first-class

The current hero — "Paste product URL → Analyze" — is broken (dead key behind the TS
`/analyze-url` route, [ts-wiring #5]). **Decision: remove it as the hero.** The manual brief
form (which works) is promoted to the primary entry. URL-analyze returns later as a small
"Prefill from URL" affordance on the brief form, only once the route is migrated off TS
Anthropic — it is a prefill convenience, not an entry mode. Until then it does not render at
all; a visible-but-broken hero is the exact opposite of the degrade-loudly rule.

"Import from Sprint" is removed from this surface (legacy, ignored per scope).

**Setup panel (Zone A):**

```
┌ NEW RUN ─────────────────────────────────────────────────┐
│ Brand name*      [____________]   Product name* [______] │
│ Product description* [__________________________________]│
│ Target audience* [_______________________________________]│
│ Key features     [+ add]          Price  [$____]         │
│                                                          │
│ DIRECTION (art guide, free text — steers every concept)  │
│ [ e.g. "tall blonde woman, golden-hour rooftop, warm" ]  │
│                                                          │
│ Product images (1–8)  [⬚][⬚][⬚][+]                       │
│ Formats  [x]1:1 [x]4:5 [x]9:16 [ ]16:9                   │
│ [x] Include a video smoke clip (with_video)  [ ] Voiceover│
│                                                          │
│ Grounding (on by default): Meta winners+losers · Shopify │
│ bestseller · brand kit — see status pills above.         │
│                                                          │
│              [ Generate concepts · ~$0.60–0.81 ]         │
└──────────────────────────────────────────────────────────┘
```

Decisions:

- **`direction` is a first-class field on the setup form**, not a video-only setting, and the
  static path now sends it. This closes [ts-wiring #1] ("without this, concept-ad casting stays
  dormant") and the live run proved it works — `"tall blonde woman"` reached the storyboard
  verbatim [ops-handoff]. Placeholder text teaches by example.
- **The generate button carries its price.** Static runs cost ~$0.60–0.81; cost-visible-
  before-spend applies to the cheap path too, and it establishes the pattern the video quote
  screen completes.
- Grounding is **not configurable** in the form — it is on by default by design
  [architecture §2.1]. The form only *states* what will ground the run; the pills show whether
  it can.

### 2.3 History

Right rail (collapsible), backed by the existing job list. Each row: thumbnail · brand/product
· date · status chip · `cost_usd` · grounding badges (an ungrounded run stays visibly
ungrounded forever) · QA chip (passed / flagged / failed). Clicking a row opens that job in
Zones B–D read-only (same components, fed from `GET /creative/jobs/{id}`). See §8.

---

## 3. The two tracks as one flow

The backend has two tracks sharing one brain [architecture §1.2]. The UI presents them as one
downhill flow: **static concepts first, video as an optional continuation of a finished job**
— because `POST /creative/video/plan` requires a `job_id`, so the static run *is* the video
run's foundation (brand kit, product cutout, grounding all come from it).

```
Setup ──▶ Static run ──▶ Concept gallery ──┬──▶ done (publish stills)
                                           └──▶ [ Make a UGC video → ]
                                                    │
                                    Persona + direction + shots/seconds
                                                    │
                                          /video/plan  ($0)
                                                    │
                                          ★ QUOTE SCREEN ★
                                                    │ explicit paid confirm
                                          /video/generate (paid)
                                                    │
                                     Video result → variants → publish
```

### 3.1 Where `direction` and the persona live

- **`direction`** is entered once at Setup (§2.2) and **pre-fills** the video plan step,
  editable there. Same words steer both tracks; editing at the video step re-plans for free.
- **The `creator` persona** lives at the top of Zone D — it only affects video. Card layout:

```
┌ WHO IS ON CAMERA ────────────────────────────────────────┐
│ Age [25–34 ▾]  Gender [woman ▾]  Energy [warm ▾]         │
│ Appearance [___________]  Wardrobe [_______]  Setting […] │
│ Voice [▾ preview ▸]        ← "exact — this voice ships"  │
│                                                          │
│ Look consistency: best-effort. The face may vary across  │
│ shots. [ ] Pin face (experimental) — seeds every shot     │
│           from one still; if the seed is rejected, the   │
│           run will tell you, loudly.                     │
│ [ ] Creator holds the product in hero shots (experimental)│
└──────────────────────────────────────────────────────────┘
```

Decisions, all from [walkthrough §3] / [architecture §1.5]:

- The **voice row is labeled a guarantee** ("this voice ships") with an audio preview; the
  **look rows are labeled best-effort** in-line. The schema splits these by actuator on
  purpose; the UI copy mirrors that honesty instead of implying five identical faces.
- **`pin_face` is an opt-in toggle, off by default, labeled experimental** — it is an
  unverified experiment, and when the seed is dropped the renderer shouts; that shout surfaces
  as a run badge ("Persona seed dropped — faces may vary"), never swallowed (§7).
- **`hero_with_creator`** is the second experimental toggle, off by default per [ts-wiring #8]
  ("keep it off until a paid live run validates the tradeoff").
- Below the persona card: **Shots** `[3 ▾]` and **Seconds** `[12 ▾]` with a live rough
  estimate that updates as you change them (`n_shots × ~$1.42`), plus toggles for
  voiceover / captions / SFX (all default on). Then one button: **[ Plan storyboard — $0 ]**.
  The button's "$0" is doing design work: it teaches that planning is always safe.

---

## 4. The quote-before-spend moment (the most important screen)

`/video/plan` returns the script, the storyboard, and the quote in one response. The screen
shows all three, because the user is approving *both* the creative and the price — "nobody
pays Seedance without first seeing exactly what they are buying" [walkthrough §10].

```
┌ STORYBOARD & QUOTE ──────────────────────────────────────────────────┐
│ SCRIPT  (opens on a hook — enforced)                                 │
│  HOOK  "Wait — this anarkali has POCKETS?"                           │
│  DEMO  "Watch the embroidery catch the light…"                       │
│  CTA   "Tap to see the full pastel collection."                      │
│                                                                      │
│ SHOTS                                                                │
│ ┌──┬─────┬──────────┬───────────────────────────┬──────────────────┐ │
│ │# │ sec │ camera   │ subject / motion          │ dialogue          │ │
│ │1 │ 3.0 │ selfie   │ creator, pattern interrupt│ "Wait — this…"    │ │
│ │2 │ 5.0 │ close_up │ product hero, slow pan    │ "Watch the…"      │ │
│ │3 │ 4.0 │ pov      │ creator + product, walk   │ "Tap to see…"     │ │
│ └──┴─────┴──────────┴───────────────────────────┴──────────────────┘ │
│                                                                      │
│ ┌ THE QUOTE ─────────────────────────────┐                           │
│ │ 3 clips × ~$1.42        est. $4.78     │  Not right?               │
│ │ Your fal balance        $8.25          │  [ Edit direction/shots   │
│ │ After this run          ~$3.47         │    and re-plan — $0 ]     │
│ │ ✓ Affordable — guard active            │                           │
│ └────────────────────────────────────────┘                           │
│                                                                      │
│        [ Render 3 clips — spend ~$4.78 ]      [ Cancel ]             │
└──────────────────────────────────────────────────────────────────────┘
```

Design rules:

- **The confirm button states the dollar amount.** Never "Generate" — always
  "Render N clips — spend ~$X". This is the single explicit paid-confirm in the product.
- **Re-planning is free and the UI says so.** The "Edit and re-plan — $0" affordance keeps the
  user iterating on the cheap side of the split. Cache note: re-rendering an unchanged board
  costs $0 (content-addressed cache [walkthrough §6]) — show "cached, $0" on the quote when
  the estimate comes back zero.
- Quote fields map 1:1 to the response: `clips`, `estimated_usd`, `balance_usd`,
  `affordable`, `shortfall_usd`, `guard_enabled`.

**Insufficient-balance state** (`affordable: false`, or a 402 from `/video/generate` because
the balance moved between quote and render):

```
│ ┌ THE QUOTE ─────────────────────────────┐
│ │ 3 clips × ~$1.42        est. $4.78     │
│ │ Your fal balance        $2.10          │
│ │ ✗ Short by $2.68                       │
│ │ A partial render is worse than none —  │
│ │ rendered clips are already paid for,   │
│ │ so the studio refuses to start.        │
│ └────────────────────────────────────────┘
│  [ Render — blocked ]  [ Re-plan with 1 shot — $0 ]  Top up at fal.ai
```

- The render button is **disabled, not hidden** — the user sees exactly what unblocks it.
- Offer the cheap out: re-plan with fewer shots (free) alongside "top up".
- A 402 mid-flow returns the user to this state with a banner: "Balance changed since the
  quote — re-quoted below." Re-quote automatically (plan is $0).
- **`guard_enabled: false`** renders an amber notice on the quote card: "Balance guard off
  (no admin key) — this estimate is unverified against your live balance." The guard silently
  disabling is a known failure mode [ops-handoff]; the UI makes it loud.

---

## 5. Generation & progress

The job object gives us `stage` (current milestone) and `progress[]` (appended strings — a
live activity feed). Zone B renders both, polled from `GET /creative/jobs/{id}` (3–5s
interval; on `status: complete|failed`, stop).

```
┌ RUN a1b2c3 — GENERATING ─────────────────────────────────┐
│ ◉ Learning the brand   ─ done                            │
│ ◉ Tearing down 14 of your real ads  ─ done               │
│ ◉ Writing concepts      ─ done (1 rejected at QA)        │
│ ◔ Rendering images      ─ in progress                    │
│ ○ Compositing copy · QA · formats                        │
│──────────────────────────────────────────────────────────│
│ ACTIVITY                                                 │
│  12:01:14  Shopify bestseller: "Pastel Green Floral…"    │
│  12:01:30  Meta cohort: 9 winners, 5 losers torn down    │
│  12:02:02  Concept "Pockets?!" — brief written           │
│  12:02:41  QA: concept 2 rejected (claim_unsupported)    │
│  ▍                                                       │
└──────────────────────────────────────────────────────────┘
```

- **Milestone rail** (top): a small fixed set of human-named phases derived from `stage`, told
  in the walkthrough's narrative voice — the 12 steps are the product story
  [walkthrough]. Static track phases: *Learn the brand → Tear down your ads → Write concepts →
  Render → Compose & QA*. Video track: *Cast & script → Storyboard → Render shots (with
  repair) → Edit (voice · SFX · captions) → QA → Variants*.
- **Activity feed** (bottom): `progress[]` verbatim, timestamped, auto-scrolling, monospace.
  Do not paraphrase it — the raw lines carry the degrade-loudly shouts ("GROUNDING
  UNAVAILABLE… proceeding UNGROUNDED") and repair-ladder events ("shot 2: reprompted after QA
  hint"), which are exactly what an honest UI should show. Grounding shouts additionally
  promote to badges (§7) so they outlive the feed.
- Repair events get an inline chip in the milestone rail ("shot 2 repaired ×1") — the repair
  ladder is a feature, not an embarrassment [walkthrough §7].
- `status: failed` → the feed stays visible (it *is* the error report), `error` renders as
  the final feed line in red, and Zone A reopens pre-filled for retry.
- Long-running renders: leaving the page is fine; the job continues server-side, History shows
  it "generating", and reopening resumes polling. A bell notification fires on completion.

---

## 6. Results

### 6.1 Concept gallery (static track, Zone C)

One card per concept asset; format tabs within a card (1:1 / 4:5 / 9:16 / 16:9 render of the
same concept).

```
┌ CONCEPT "Pockets?!" ────────────┐ ┌ CONCEPT "Golden hour" ──────────┐
│ [1:1][4:5][9:16][16:9]          │ │ …                               │
│ ┌───────────────┐  HEADLINE     │ │                                 │
│ │   image       │  "Anarkalis   │ │                                 │
│ │               │   with actual │ │                                 │
│ └───────────────┘   pockets."   │ │                                 │
│ Sub: "Hand-embroidered…"        │ │                                 │
│ CTA: [Shop the drop]            │ │                                 │
│ QA ✓ passed (6 checks) ▸        │ │ QA ⚠ flagged, shipped ▸         │
│ [Download] [Make video →]       │ │                                 │
└─────────────────────────────────┘ └─────────────────────────────────┘

  ⓘ We rejected 1 concept that failed QA: "Luxury heritage" ▸
  Run cost: $0.71 (estimate) · grounded: Meta ✓ Shopify ✓
```

- **Per-image QA chip** from `assets[].qa`: `✓ passed` (green) or `⚠ flagged, shipped`
  (amber) — expanding shows the per-check list with evidence. Fail-closed means a hard fail
  never reaches the gallery; what you see either passed or was explicitly shipped-with-flags
  [walkthrough §9].
- **`rejected[]` is shown, proudly**: "We rejected N concepts that failed QA", expandable to
  the rejected titles. Rejection is the differentiation ("reject, don't log") — competitors
  show you everything the model burped out; we show what survived and admit what didn't.
- **`cost_usd`** as a plain line, always visible, labeled "estimate" (the ledger is a-priori;
  actuals reconcile later [architecture §1.7]).
- Copy (headline / subhead / cta_label) is text next to the image — it was composited
  deterministically, so show it as data too (copy-to-clipboard on click).
- Images and video load from `/api/creative-studio/asset/{job}/{file}` (R2-backed).

### 6.2 Video result (Zone D, after render)

- Player for `video.url` (`video_captioned.mp4` — the ad that ships), with download.
- **QA banner** above the player, from `qa_passed` + per-check evidence:
  - `qa_passed: true` → slim green bar: "QA passed — 7 checks ▸" (expand for the check table:
    cut alignment, motion, product presence, caption drift, continuity, VLM).
  - `qa_passed: false` but shipped → **amber banner, not hidden**: "⚠ Shipped with QA flags —
    2 checks failed ▸" expanding to each check, its measured evidence, and a one-line meaning
    ("cut_alignment: 22 cuts detected vs 2 planned — known false-positive on edited clips"
    [ops-handoff §5]). A paid render is never discarded [ts-wiring #2]; the UI's job is to
    make "shipped anyway" an informed state, not a silent one.
- Check names render with plain-language glosses; evidence values (correlations, drift
  numbers) shown raw in the expansion — measurements, not vibes [walkthrough §2].

### 6.3 Variants — exactly three axes

```
┌ VARIANTS — change ONE thing, learn WHY it won ───────────┐
│ ● Hook        (re-renders the opening — costs ~$1.42)    │
│ ○ Caption style   (recut — ~$0)                          │
│ ○ Aesthetic       (re-grade — ~$0)                       │
│         [ Cut variant on: Hook — ~$1.42 ]                │
│                                                          │
│ CUT SO FAR                                               │
│  base      ▸ video_captioned.mp4     [Published? ▸]      │
│  hook_v2   ▸ variant_hook_2.mp4      [Published? ▸]      │
└──────────────────────────────────────────────────────────┘
```

- **Radio, not checkboxes.** One axis per variant is the entire point ("if they differ on
  three, the result is attributable to none of them" [walkthrough §11]) — the UI physically
  prevents multi-axis variants. A caption under the control says why, in one sentence.
- Each axis is priced on its control (hook = paid re-render; caption/aesthetic ≈ $0), and the
  paid axis routes through the same explicit-confirm pattern as §4.
- Each cut variant row carries the publish affordance (§8).

---

## 7. Degrade-loudly states

One badge system, used everywhere a grounding source or a guarantee degrades. Badges are
**amber pills, persistent for the life of the run and its History row** — never toasts.

| State | Badge text | Where it appears | Source |
|---|---|---|---|
| No Meta account / token outdated | `Ungrounded — no Meta account` | top bar pill (pre-run) + run header + History row | grounding shout in `progress[]`; `pickings.grounded=false` [ops-handoff] |
| Shopify unavailable | `Product source unavailable` | same | [walkthrough §1] |
| No prior/graph for account | `New account — no prior yet` (neutral gray, not amber: "we don't know yet" is a *correct* answer [walkthrough §4b]) | video plan step | `GET /prior` empty |
| Persona seed rejected | `Persona seed dropped — faces may vary` | video result header + QA panel | renderer shout [architecture §1.5] |
| Balance guard off | `Balance guard off — spend unverified` | quote card (§4) | `guard_enabled: false` |
| QA flagged but shipped | `⚠ Shipped with QA flags` | asset card / video banner (§6) | `qa_passed=false` + evidence |

Rules: a badge always names the *consequence*, not the config ("faces may vary", not
"i2v seed 400"); hovering/expanding gives the cause and the fix ("reconnect Meta in
Settings"). Pre-run, the top-bar pills already warn ("this run will be ungrounded") so nobody
discovers it after paying. Badges are stored with the job so History is honest forever.

---

## 8. History & the learning loop

### 8.1 History

Right rail (§2.3). Opening a row loads `GET /creative/jobs/{id}` into the same Zones B–D:
finished runs show Results directly; a still-generating run resumes the live feed. Nothing
bespoke — history *is* the run view, replayed.

### 8.2 The loop: publish → stamp → learn

"Nothing in this codebase publishes an ad. A person ships the ad and tells us which one it
became. That single call is what closes the loop." [walkthrough §12]. The UI's job is to make
the manual stamp effortless and its purpose obvious.

- Every variant row (and the base video) carries **[Published? ▸]** → inline popover:

```
┌ You published this on Meta? ─────────────────┐
│ Paste the Meta ad id:  [ 2384… ]  [ Stamp ]  │
│ This is how the studio learns which choice   │
│ actually won. Unstamped ads teach it nothing.│
└──────────────────────────────────────────────┘
```

  → `POST /creative/variants/{id}/published {meta_ad_id}`. Stamped rows show a green
  `linked ✓ 2384…` chip.
- A **"Harvest results"** button on the account level (History header) fires
  `POST /creative/learn` and reports what it learned in the button's own result line
  ("2 arms updated · 1 UNDECIDED — needs more impressions"). No fake certainty: `UNDECIDED`
  is rendered as UNDECIDED [walkthrough §12].
- **"What this account has proven"** — a small panel under the History rail, from
  `GET /creative/prior/{acct}` and `GET /creative/graph/{acct}`:
  - Prior entries as sentences: "Hook 'pattern interrupt' beat 'question' — proven
    (A/B, 4.1k impressions)."
  - Graph entries as a plain list prefixed with the graph's own disclaimer, verbatim:
    *"Correlation, not proven cause"* — "pov camera: 80% of winners vs 20% of losers."
  - New account → the neutral badge from §7 and one line: "Publish and stamp ads to start
    building proof." No graph visualization in this scope (§11).

---

## 9. Empty / error / cost states, and the top-bar selectors

- **First-visit empty state:** Zone A's form with a 3-line explainer of the flow
  ("Brief → concepts (~$0.70) → optional UGC video (quoted first, ~$1.42/clip)") — the
  pricing IS the pitch. History rail: "No runs yet."
- **Top-bar selectors:** Brand (drives brand kit + `brand_id`) and Ad account (drives
  `X-Meta-Token` grounding + prior/graph). Each has a status pill: `● grounded` (green) /
  `● ungrounded` (amber, §7). Changing the account mid-setup re-checks the pills; changing it
  after a run does nothing to that run (a run's grounding is frozen at start).
- **Job failed:** feed-as-error-report (§5); `error` string verbatim; one retry CTA
  re-opening Setup pre-filled. Never a bare "Something went wrong".
- **Poll failure / network:** keep the last known state rendered, show a slim reconnecting
  bar; never blank a screen that had data.
- **402:** §4's re-quote flow. **401/403 (API key):** full-screen config error — this is an
  operator problem, not a user retry.
- **Cost, everywhere:** every button that spends carries its price; every finished run shows
  `cost_usd`; the quote card is the only place balance appears (it is fal's balance, an
  operator concern — do not scatter it across the UI).

---

## 10. Endpoint map

| Screen / action | Call | Sends | Reads |
|---|---|---|---|
| Setup → "Generate concepts" | `POST /creative/generate` | `brief{brand_name, product_name, product_description, target_audience, key_features?, price?}`, `formats[]`, `images` (1–8), `with_video`, **`direction`** (new — [ts-wiring #1]), `voiceover`; headers `X-API-Key`, `X-Meta-Token` | `job_id` |
| Run view (poll, all zones) | `GET /creative/jobs/{id}` | — | `status`, `stage`, `progress[]`, `assets[]` (+`copy`, `qa`), `brand_kit`, `winners[]`, `video.url`, `variants[]`, `qa_passed` + evidence, `cost_usd`, `rejected[]`, `error` |
| Video step → "Plan storyboard — $0" (and every re-plan) | `POST /creative/video/plan` | `job_id`, `n_shots`, `seconds`, `direction`, `creator{age_range, gender, appearance, wardrobe, setting, energy, voice_id}` | quote `{clips, estimated_usd, balance_usd, affordable, shortfall_usd, guard_enabled}`, script, storyboard (shots: duration/camera/subject/motion/dialogue) |
| Quote → "Render N clips — spend ~$X" | `POST /creative/video/generate` | `job_id`, `direction`, `creator`, `voiceover`, `captions`, `sfx`, `pin_face`, `hero_with_creator` | job (then poll); **402** → §4 shortfall state |
| Variant row → "Stamp" | `POST /creative/variants/{id}/published` | `meta_ad_id` | ack |
| History header → "Harvest results" | `POST /creative/learn` | account | learn summary |
| "What this account has proven" panel | `GET /creative/prior/{acct}`, `GET /creative/graph/{acct}` | — | prior entries; graph correlations |
| Images / video / downloads | `GET /api/creative-studio/asset/{job}/{file}` | — | bytes (R2-backed; video = `video_captioned.mp4`) |

Everything routes through the existing `apps/api` proxy (`creative-gen-client.ts` +
`routes/creative-studio.ts`); the proxy must be extended to forward the bolded/new fields.

---

## 11. Scope boundaries

### In scope
- The Creative Studio screen: Zones A–D, History rail, top-bar selectors, badge system.
- Proxy additions in `apps/api` for: `direction` on `/generate`, the full
  `plan`/`generate` video passthrough (`creator`, `n_shots`(fixed 3), `seconds`, `pin_face`,
  `hero_with_creator`, VO/captions/SFX), publish-stamp, learn, prior, graph, and a **voice-preview
  endpoint**.
- Removing the dead URL-analyze hero and the "Import from Sprint" button from this screen.

> **Endpoint-coverage verification (2026-07-21, live grep — the code-review graph was stale at
> `663a6fd`):** the core flow (`/generate`, `/video/plan`, `/video/generate`, `/jobs`, assets) is
> fully routed frontend↔apps/api↔ai-layer. **NOT yet routed (must be added in the build):** the four
> loop routes `POST /creative/variants/{id}/published`, `POST /creative/learn`,
> `GET /creative/prior/{acct}`, `GET /creative/graph/{acct}`. **Fields not yet forwarded:**
> `direction` on `/generate`; `creator` on `/video/plan`; `direction`+`creator`+`pin_face`+
> `hero_with_creator` on `/video/generate`. Plus the new voice-preview endpoint. This is the build's
> apps/api backend scope.

### Explicitly deferred
- **URL-analyze prefill** — returns only after [ts-wiring #5] migrates the route off TS
  Anthropic. Design slot reserved on the brief form; nothing renders until then.
- **The three legacy surfaces** (Cockpit / Director Lab / Creative Engine) — untouched, still
  routed, not linked from Studio.
- **Auto-publisher to Meta** — the loop keeps its human by design and by constraint
  (read-only token, Meta suspended) [architecture §2.2].
- **Graph visualization** — list-only in this scope; a visual creative graph waits for real
  data (the graph has never seen a live number [gap-analysis]).
- **Brand-kit viewer/editor** — `brand_kit` and `winners[]` are on the job; rendering them
  richly ([ts-wiring #3/#4]: tone_scales, awareness_stage, on_screen_text…) is a follow-up.
- **`<a download>` cross-origin fix** — [ts-wiring #7], presign work, separate change.
- **Multi-brand asset library / search** — out; History is per-run only.

### Resolved decisions (2026-07-21, maintainer)
1. **`n_shots` = 3, FIXED.** No UI control — the quote always plans 3 shots (keeps cost
   predictable at ~$4.78, matching the verified live run). Do not expose a shot-count input.
2. **Single-tenant now.** `balance_usd` = the platform fal balance; shown as-is. **DEFERRED
   (logged):** multi-tenant credits — when Studio serves multiple clients, the quote card needs a
   per-client credits abstraction instead of the raw platform balance. Not built now.
3. **Progress feed = polling.** Reuse the shipped `video-job-poller` (3–5s); no SSE.
4. **QA false-positives = NOT surfaced.** The two known-bad checks (caption critic @48px,
   cut_alignment double-count) are kept as an **internal marker only** — not shown in the UI.
   Remove the marker when the checks are patched ([ops-handoff §4/§5]).
5. **Voice preview = backend endpoint.** A real MiniMax preview endpoint (ai-layer + apps/api
   passthrough), not pre-rendered samples. Adds to the build's backend scope.
