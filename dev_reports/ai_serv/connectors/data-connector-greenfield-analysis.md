# Data Connector — Greenfield Analysis (merit-only, no sunk cost)

> The from-scratch case: if we ignore that TS already has ingestion and choose
> language/architecture **purely on merit**, what's the right build, what does it cost, and
> what actually constrains the timeline. Read alongside `data-connector-architecture-decision.md`
> (the reuse-based case) — this is the deliberate counterweight to it.
> Branch `feat/data-connectors`. 2026-06-26.

---

## 1. The framing

Drop all sunk cost. Assume nothing exists. Pick language + architecture only on technical
merit for a system whose job is: ingest Meta + Google Ads + Shopify, retrieve creative
assets, and feed a substantive **AI/analytics layer** (RAG chat, anomaly, blended-ROAS
analysis, creative generation).

The deciding fact: **the centre of gravity is the AI/analytics layer, not the ingestion.**
Ingestion is commodity I/O-bound plumbing against three OAuth APIs. The value is the
analysis — all Python-shaped problems with a Python-dominant ecosystem (pandas, pydantic,
the LLM SDKs, and official Meta/Google/Shopify Python clients).

---

## 2. Merit-based choice: Python end-to-end, modular monolith

- **One language around the centre of gravity** → one type contract (pydantic), one test
  stack, one deploy, no cross-language serialization seam, one skillset.
- **Python ingestion is entirely adequate.** Async `httpx` + `asyncio` handle concurrent
  fan-out fine; the bottleneck is **rate limits, not the runtime**, so Node's async edge buys
  nothing real here.
- **Modular monolith, not microservices.** At this scale (a few platforms, scheduled/batch
  pulls) separate services add ops cost for zero scaling benefit. Keep connectors as
  independent *modules* behind one `Connector` interface, in one deployable.

### Alternatives considered and rejected
- **TS end-to-end** — would win only if the product were primarily the web/API surface and
  "AI" were a thin LLM call. It isn't; the AI layer is substantive. TS strands it behind a
  language seam.
- **Go (ingestion) + Python (AI)** — best raw concurrent-ingestion throughput + single
  binary, but that throughput is **wasted under API rate limits**, and it adds a third
  language that splits the system. Not worth it at this scale.

**Note:** this is the *opposite* conclusion to the reuse-based decision doc. That is the
honest cost of going greenfield — you trade proven, working TS ingestion for architectural
cohesion in one language.

---

## 3. Time expenses (1 senior engineer, production bar — order-of-magnitude)

| Component | Effort | Notes |
|---|---|---|
| Foundations — unified contract + async funnel (parallel, partial-failure, merge/blend) | 1–1.5 wk | per the design doc |
| Credential vault + OAuth framework (encrypt, refresh, single-flight, KMS) | 1–1.5 wk | security-critical |
| Rate-limit / backoff framework (per-connector policy, 429 handling) | 3–5 d | near-absent today |
| Asset pipeline (bounded pool, host allowlist, dedup, object storage) | 3–5 d | |
| Observability, cost ledger, CI, mock-seam tests | 3–5 d | |
| **Meta** connector | 1–1.5 wk | full scratch; ~3–5 d if porting existing lessons |
| **Shopify** connector | 1–1.5 wk | simple token; orders/products/inventory + product images + PII |
| **Google Ads** connector | 2–3 wk | the hard one: OAuth refresh, GAQL, `google-ads` lib config |
| **Total** | **~7–10 weeks (1.5–2.5 months)** | wider if hardened for backfill, multi-tenant scale, full monitoring |

These are judgment ranges, **not a quote** — assume one experienced engineer, exclude
review/iteration drag, and treat ±50% as normal.

---

## 4. Constraints that dominate over code effort

The real schedule risk is **calendar, not keystrokes**:

1. **Google Ads developer-token approval** — applying for Basic/Standard access can take
   **days to weeks**; until granted you're capped to test accounts. This frequently dominates
   the whole timeline regardless of coding speed.
2. **OAuth app review / scopes** — Meta app review for some scopes, Shopify app scopes, Google
   verification. External approval latency you don't control.
3. **API churn is a recurring tax, not a one-time cost** — Meta deprecates versions ~yearly
   and changed attribution windows in Jan 2026. You maintain versions forever.
4. **Rate limits force paced backfill** — historical loads are slow by design.
5. **Multi-tenancy + secrets + PII** — encrypted per-tenant tokens, isolation, Shopify
   customer-data / GDPR retention.
6. **Attribution correctness** — the genuinely hard domain problem: matching Meta pixel
   purchases to Ads Manager, reconciling Shopify revenue, cross-platform dedup.

---

## 5. The one caveat on "ignore old baggage"

Distinguish **code** (legitimately droppable) from **domain knowledge** (not baggage — it's
hard-won correctness). The existing Python layer encodes real lessons worth porting even if
the code is dropped:

- Meta field choices (`inline_link_clicks`, `fb_pixel_purchase` basis, **derived** ROAS).
- Attribution-window handling (`1d_view`/`7d_click`; the Jan 2026 removals).
- The download-immediately / hash-resolution **asset-expiry discipline** in `meta_creatives`.

A from-scratch build should **drop the code but keep the lessons** — re-learning them by
shipping wrong ROAS is the expensive path.

---

## 6. Bottom line

On pure merit: **Python end-to-end, modular monolith**, ~1.5–2.5 months of build, **gated by
Google's developer-token approval calendar**, with the biggest hidden risk being
re-derivation of attribution correctness rather than any language limitation.

How this sits next to the other docs:
- If **time-to-value and lowest risk** win → reuse-based **Hybrid** (decision doc): TS
  ingests, Python analyses. Weeks, not months.
- If **long-term architectural cohesion in one language** wins, and the Google-token calendar
  is acceptable → this **greenfield Python** build.
- The **fan-in design** (design doc) applies either way — only the language of the connectors
  changes.
```
