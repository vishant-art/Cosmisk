# Creative Studio — future scope / parked backlog

**Created:** 2026-07-20 · **Owner:** ai-engineer (creative subtree, `dryayeet`) · **Branch:** `improve/creative`

> What we are deliberately **not** doing in the current work, parked so nobody re-derives it.
> The active plan right now is narrow: (1) partial-render hardening in `service.py`, and (2)
> fixing the two QA false-fail checks. Everything below is out of that scope.

## Environment status at time of writing (context, so these are NOT relisted as blockers)

The demo creds wired on 2026-07-19/20 closed the old ops-handoff infra blockers:

- **Neon demo DB** — `DATABASE_URL` auth works; ai-layer alembic at head **`0003`**; `creative_jobs`
  / `creative_variants` / `creative_teardowns` all present. Persistence is live.
- **Cloudflare R2** (`cosmisk-mvp-v1`) — `storage.py` round-trip verified (head/put/presign-GET/delete).
  Needed `boto3>=1.36` installed in the local venv (declared in `pyproject.toml`, was missing locally).
- Both shipped self-checks pass: `python -m ai_layer.storage`, `python -m ai_layer.creative._publish_check`.

So the old §1 (auth) / §2 (migrations) / §3 (asset durability) items are **done**, not future scope.

---

## A. AI-layer / creative (this subtree — candidate future work)

| Item | What it is | Why parked | Tracked / design |
|---|---|---|---|
| **`ai_feedback` learning loop** | Turn the capture-only thumbs (chat + creative) into a usable quality signal. | Handoff says capture-only for now; a real iteration. **Hard rule: keep it SEPARATE from Meta performance (`/creative/learn`) — do not blend into the graph.** | 2026-07-18 handoff §"ai_feedback contract" |
| **Chat → Creative-Studio handoff** | Emit a structured `StudioBrief` from AI Chat and deep-link a prefill "Generate this" button into the studio (prefill, never auto-fire). | Deferred feature; net-new UX + contract work. | `creative/chat-to-studio-handoff-deferred.md` |
| **Meta auto-publisher** | Nothing in the codebase publishes an ad to Meta (the Meta layer is GET-only), so the learning loop has a manual step: a human publishes and stamps `meta_ad_id` back via `POST /creative/variants/{id}/published`. | Automating needs a write-scoped `ads_management` token + an `/advideos`→`/adcreatives`→`/ads` publisher. | Ops handoff §"learning loop" |
| **Meta grounding reinstated** | Token is present but outdated and no `META_AD_ACCOUNT` set → runs go **ungrounded** (no winner/teardown conditioning). | Needs a fresh token + an account id; degrades gracefully until then. | — |
| **QA critic full-res upgrade (beyond the false-fail fix)** | The current plan only stops the caption critic from failing legible captions. A deeper upgrade: give legibility a genuine full-res sample instead of the 48px contact sheet. | The in-scope fix unblocks the gate; the richer critic is a follow-on. | Ops handoff §4 |
| **Customer-review language mining** | Feed verbatim Shopify review/comment phrasing into the script prompt as labeled evidence, so hooks quote real customers (creatify/HeyParker's core move; provenance-safe because it is quoted, not invented). | Deferred from the 2026-07-20 prompt pass; needs a review/comment ingestion into the brief. | `creative/creative-studio-prompt-improvements.md` |
| **Motion-quality QA coverage** | The video critic reads a keyframe contact sheet and is blind to motion; add a consecutive-frame or optical-flow motion-sanity check. | The pipeline's weakest prompt (Seedance motion) has no QA; more than a prompt edit, scope separately. | `creative/creative-studio-prompt-improvements.md` §Stage 10 |

## B. Cross-cutting / infra (not necessarily this subtree)

| Item | What it is | Why parked | Tracked |
|---|---|---|---|
| **Per-tenant storage prefix** | Real `tenant_id/` R2 key prefix (`STORAGE_PREFIX` empty today = single-tenant demo). | Waits on per-brand identity. | issue **#34** |
| **Audio → R2** | ElevenLabs voiceover currently lands on apps/api local disk and 404s after a redeploy. | Out of the demo path; moves to R2 at the TS refactor. | issue **#48** |
| **CI `PG*` test-branch vars** | The non-creative ai-layer suite can't collect without Neon test-branch creds (`PG*` / `*_POOL`). | Creative subtree is exempt (mock-based, $0). | Ops handoff §"CI" |
| **Deployed live smoke** | No run has yet gone through the deployed Railway uvicorn; all live runs were the in-process driver. | Was blocked on the infra items now resolved — worth a real deployed smoke next. | — |

## C. TypeScript side (code freeze — other owners / maintainers)

| Item | What it is | Why parked |
|---|---|---|
| **`/analyze-url` still on TS Anthropic** | The one UI-reachable route not served by the Python ai-layer (creative brief extraction). | Flagged in the 2026-07-18 handoff as "not yours" for the Google-Ads ai-engineer; TS under code freeze. |
| **TS-side R2 client** | If the TS side ever needs to own storage instead of the ai-layer 302-to-R2 proxy. | Deliberately not built; ai-layer is the sole R2 owner. See `2026-07-19-ts-r2-client-future-work.md`. |
| **`<a download>` cross-origin** | A cross-origin R2 asset opens in a new tab instead of downloading. | Minor; upgrade path = presign with `ResponseContentDisposition=attachment` behind `?download=1`. |

---

_Update this file when an item moves into an active plan or ships; delete rows that become obsolete._
