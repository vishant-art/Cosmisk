# Future Features / Deferred Engineering

Engineering work intentionally deferred out of a spec, with enough context to pick it up
later. Not product roadmap (see `docs/ROADMAP_COMING_SOON.md`) — these are technical items
parked during design so the current scope stays shippable.

---

## Brief-mode creative jobs — real tenant attachment

**Deferred from:** `specs/2026-07-06-ai-layer-neon-data-layer-design.md` (ai-layer Neon data layer, #29)
**Depends on:** #34 (per-brand `CredentialProvider` — the real caller→brand binding)
**Date parked:** 2026-07-06

**What it is.** The Creative Studio has two generation paths:
- **Account mode** — the caller supplies `account_id` (`act_<id>`); the pipeline conditions on
  live Meta winners. Tenant identity is `brand_id = account_id` (the current default), so a
  durable `creative_jobs` row is naturally tenant-keyed.
- **Brief mode** — the caller supplies only a free-text product brief (`brand_name`,
  `product_name`, audience …) and no ad account. `CreativeRequest.account_id` is `None`; the
  only brand-ish value is `req.brief["brand_name"]`, which defaults to the literal
  `"Creative Studio"` (`apps/ai-layer/ai_layer/creative/service.py:83`). There is **no tenant
  identifier at all** in brief mode.

**Why it's parked.** The demo runs a **single client** — all connected account/API keys belong
to that one client; multi-tenancy is being *provisioned for* structurally, not exercised. Brief
mode is a future capability. Fabricating a tenant id now (e.g. slugging `brand_name`) would
create false, collision-prone identity with no real binding to disambiguate it.

**Interim provision (in the #29 schema).** `creative_jobs.brand_id` (and `account_id`) are
**nullable**: account-mode jobs carry `brand_id = account_id`; brief-mode jobs are
brand-unattached (`NULL`) until real identity exists. `load_job` filters by `brand_id` when one
is supplied.

**What "done" looks like (when #34 lands).**
- A real caller→brand binding (per-tenant API key → allowed brands, or a signed `X-Brand-Id`).
- Brief-mode `CreativeRequest` carries an authenticated `brand_id`, so every job is tenant-keyed.
- `creative_jobs.brand_id` tightened to `NOT NULL` + FK `brands`; `GET /creative/jobs/{id}`
  enforces brand ownership (today it has none — obscurity-only via `uuid4` job ids).
- The connector snapshot cache key gains credential identity (already flagged at
  `apps/ai-layer/ai_layer/connector_source.py:78-80`).
