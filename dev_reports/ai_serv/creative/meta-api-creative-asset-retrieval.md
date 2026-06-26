# Pulling Running-Ad Creatives from the Meta API → Conditioning Our Pipeline

> How to fetch the actual image/video creatives of already-running Meta ads, what's
> reliably retrievable vs not, and exactly how it makes `rnd/creative/` better.
> Web-verified June 2026 against Meta developer docs + the Facebook Business SDKs.
> Companion to `creative-pipeline-fal-rebuild-plan.md` and `static-ad-generation-architecture-research.md`.

---

## TL;DR

- **Our own ad IMAGES: fully retrievable.** Walk `insights(level=ad)` → winning `ad_id` →
  `creative{...}` → `image_url` (direct) or `image_hash` → resolve via `act_<id>/adimages`.
  `ads_read` (which our token already has) is enough.
- **Our own ad VIDEOS: partially.** You always get the `video_id` + thumbnails; the playable
  MP4 (`source`) is **only** returned when the token's user is an **admin of the Page that owns
  the video**. So owned winners → MP4 if we use a Page-admin/System-User token; otherwise just a
  still frame.
- **Competitor creatives: essentially NOT retrievable.** The Ad Library API returns ad *text* +
  a *snapshot URL* only (no image/video binaries), and commercial-ad coverage is **EU/UK only**
  (DSA). Treat competitor visual intel as out-of-scope via API.
- **Why it matters for us:** we currently generate **blind** (text prompt only). Our fal pipeline
  already accepts reference images (`flux-2-flex` up to 10 refs, `bria/product-shot` needs the
  real product, Kontext edits, Seedance i2v). Feeding the **real winning creatives + the real
  product** as conditioning inputs turns "invent a brand" into "extract and extend what already
  converts." This is the missing closed loop between performance and generation.
- **Two operational must-dos:** (1) download every asset **immediately** (all CDN URLs are signed
  and expire), storing the durable `hash`/`permalink_url`; (2) make `META_ACCESS_TOKEN` a
  **System-User token** with Page-admin scope if we want video `source`.

---

## 1. What is and isn't retrievable (the honest matrix)

| Asset | Ours (we run the ad) | Competitor |
|---|---|---|
| Static image (full-res) | ✅ `image_url` / `image_hash`→`adimages` | ❌ (snapshot URL only, EU/UK text only) |
| Carousel images | ✅ `child_attachments[].image_hash` | ❌ |
| Dynamic/Advantage+ image set | ✅ `asset_feed_spec.images[].hash` | ❌ |
| Video still / thumbnail | ✅ `thumbnails`, `picture`, `thumbnail_url` | ❌ |
| Playable video MP4 (`source`) | ⚠️ only with Page-admin/System-User token | ❌ |
| Ad copy (headline/body/CTA) | ✅ `object_story_spec` / `asset_feed_spec` | ⚠️ EU/UK only via Ad Library |
| Per-asset performance (which won) | ✅ insights `breakdowns=image_asset/video_asset` | ❌ |
| Composed ad rendered to PNG | ❌ no Meta endpoint (previews are iframes only) | ❌ |

The "composed ad → PNG" gap is fine for us: we want the **raw** creative (clean image, no
chrome) as a conditioning input, not the composed preview.

---

## 2. Retrieving our own IMAGE creatives

**Step 1 — winners by performance** (`level=ad`, current Graph version):
```
GET /v25.0/act_<AD_ACCOUNT_ID>/insights
    ?level=ad&fields=ad_id,ad_name,spend,purchase_roas,actions,impressions
    &date_preset=last_30d&access_token=<TOKEN>
```
Rank on `purchase_roas[].value` (or purchases inside `actions` =
`offsite_conversion.fb_pixel_purchase`). `creative` is **not** an insights field — insights gives
`ad_id`, then you hop to the ad.

**Step 2 — ad → creative (one expanded call):**
```
GET /v25.0/<AD_ID>?fields=name,creative{id,image_url,image_hash,thumbnail_url,
    object_story_spec,asset_feed_spec,effective_object_story_id}&access_token=<TOKEN>
```

**Step 3 — get downloadable bytes**, in priority order:
1. `creative.image_url` → **direct full-res** CDN URL. Download.
2. `object_story_spec.link_data.picture` / `photo_data.url` / `video_data.image_url` (video poster)
   → direct URLs.
3. Otherwise collect every **hash** (`image_hash`, `link_data.image_hash` + carousel
   `child_attachments[].image_hash`, `photo_data.image_hash`, `asset_feed_spec.images[].hash`) and
   batch-resolve:
   ```
   GET /v25.0/act_<id>/adimages?fields=hash,url,permalink_url,width,height&hashes=["h1","h2"]
   ```
   `url` = full-res (expiring); `permalink_url` = stable `facebook.com/ads/image/...` reference.
4. Published-post-backed creatives with no spec media → `effective_object_story_id` →
   `GET /<id>?fields=full_picture,attachments{media,subattachments}`.

`ads_read` is sufficient for all of this (GET-only). Sources:
[AdCreative](https://developers.facebook.com/docs/marketing-api/reference/ad-creative/) ·
[object_story_spec](https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/) ·
[AdImage / adimages edge](https://developers.facebook.com/docs/marketing-api/reference/ad-image/) ·
[asset_feed_spec](https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/).

---

## 3. Retrieving our own VIDEO creatives (and the `source` restriction)

**Find every `video_id`** — check **all three** locations (multi-asset Advantage+ only fills the
array): `creative.video_id`, `creative.object_story_spec.video_data.video_id`,
`creative.asset_feed_spec.videos[].video_id`.

**Read the video node:**
```
GET /v25.0/<VIDEO_ID>?fields=source,permalink_url,picture,length,created_time,
    thumbnails{uri,is_preferred,width,height},format&access_token=<TOKEN>
```
- `source` = the raw MP4 URL — **only returned if the requesting user is an admin of the owning
  Page** (Meta tightened this in 2018; `ads_read` alone is not enough). When the token isn't a
  Page admin, `source` is silently **omitted** (not an error) — handle gracefully.
- `thumbnails{uri,is_preferred}` → pick `is_preferred=true` for the canonical cover frame; this is
  the reliable fallback when `source` is blocked. `picture` and `format[].picture` give more stills.

So: **owned winners + System-User/Page-admin token → MP4**; otherwise → preferred thumbnail + the
public `permalink_url`. There is **no** supported way to download a video we don't own. Sources:
[Video node](https://developers.facebook.com/docs/graph-api/reference/video/) ·
[video.thumbnails](https://developers.facebook.com/docs/graph-api/reference/video/thumbnails/) ·
[ad-creative-video-data](https://developers.facebook.com/docs/marketing-api/reference/ad-creative-video-data/) ·
[advideos edge](https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/).

---

## 4. Which specific creative won (per-asset performance)

For a **dynamic / Advantage+** ad, split its performance by individual asset:
```
GET /v25.0/<AD_ID>/insights?fields=spend,impressions,actions,purchase_roas
    &breakdowns=image_asset      # or video_asset / body_asset / title_asset
```
Each row returns the asset identifier (an `image_asset` with `hash`/`id`, a `video_asset` with
`video_id`), so you learn *"this exact image out-performed"* and can condition new generation on
the proven winner. Caveats: asset breakdowns are **`level=ad` only** (not account-level), support
**only a metric subset** (spend/impressions/clicks/some actions), and can't be freely combined
with demographic breakdowns. Source:
[insights breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/) ·
[asset-feed insights](https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/insights/).

---

## 5. Competitors (Ad Library API) — why it's out of scope

`GET /v25.0/ads_archive?search_terms=...&ad_reached_countries=['DE']&ad_type=ALL&fields=...`
returns ad **text** (`ad_creative_bodies`, `ad_creative_link_titles`, …) + **`ad_snapshot_url`**
(a rendered preview page) + page metadata. It does **not** return image/video binaries or CDN
URLs, and **commercial** (non-political) ads are only covered programmatically in the **EU/UK**
(DSA); a US/India commercial query returns nothing. Scraping the snapshot page violates ToS.
**Conclusion: do not build competitor visual intel on this API** — it gives text and a link, not
pixels. Source: [ads_archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive/) ·
[Ad Library API](https://www.facebook.com/ads/library/api).

---

## 6. Operational constraints (design around these)

- **Every CDN URL expires.** `image_url`, `adimages.url`, `link_data.picture`, video `source`,
  `thumbnails[].uri` are signed `*.fbcdn.net` URLs (`oe=` expiry → HTTP 403 "signature expired").
  **Download the bytes immediately**; persist the durable `hash` + `permalink_url`, never the raw
  signed URL. (Same discipline we already apply to fal/Veo temp URLs.)
- **Token:** our `META_ACCESS_TOKEN` already has `ads_read` (it pulls insights), so images work
  today. For video `source` and unattended server use, move to a **Business System-User token**
  with `ads_read` (+ `business_management`) **and Page-admin** on the owning Pages.
- **Version:** our code is on **v23.0** (still supported, EOL ~May 2027); latest is **v25.0**.
  Creative/image fields are stable across v23–v25, so bumping is low-risk and worth doing.
- **Rate limits:** Business-Use-Case (BUC), per ad account. Read the `X-Business-Use-Case-Usage`
  header (`call_count`, `estimated_time_to_regain_access`) and back off near 100%. Use **field
  expansion** (`creative{...}`) and **batch** `adimages?hashes=[...]` to minimize calls; bulk
  pulls on a dev-tier app throttle fast. Sources:
  [rate limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/) ·
  [system users](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/).

---

## 7. Connect the dots — how this upgrades `rnd/creative/`

Today the pipeline **invents** a brand from campaign *numbers* and generates **text-only,
blind** backgrounds. For an existing advertiser that already has winning creatives, that throws
away the single most valuable signal: **what already converts visually.** Pulling the real assets
plugs directly into plumbing we already built.

**Where each capability lands (existing module → change):**

| Real-asset input | Pipeline module | What changes |
|---|---|---|
| Top winning images (by ROAS) | `campaign_select.py` | extend from campaign-level to **ad-level** winner selection; attach the downloaded asset path to each winner |
| Winning creatives → vision pass | `brand_brain.py` | ground the BrandKit in the **actual** palette/style/product (OpenRouter vision over the top images) instead of inferring from numbers |
| The real product image | `image_providers.py` (`product` = `bria/product-shot`) | drop the **real product** into generated scenes — no more hallucinated product. Use `birefnet/v2` to cut the product out first |
| Winning creative as style/brand ref | `image_providers.py` `_flux` `refs=[...]` | `flux-2-flex` already takes up to 10 refs; feed the winners so new backgrounds match the proven aesthetic (today we pass `refs=None`) |
| Real logo as it appears in-ad | `logo.py` / compositor | skip logo invention; composite the **actual** logo |
| Owned winning video (MP4 or preferred frame) | `video_providers.py` (Seedance i2v/ref2v) | seed motion from a **real** winning frame/clip, not a generated bg |
| Which asset won (`image_asset` breakdown) | new selection logic | condition generation on the **specific** proven winner, closing the perf→generation loop |
| Winners as a QA benchmark | `verifier.py` (VLM critic) | judge new creative for brand consistency **against** the real winners |

**The conceptual shift:** for an existing account we should move from *generate a brand* to
*extract-and-extend the winning brand*. The `refs` parameter is the seam — it's already wired
through `generate_image` / `generate_with_fallback`; we currently just pass `None`.

---

## 8. Proposed integration (phased — NOT yet built)

1. **`meta_creatives.py` (new, in `rnd/src/`)** — reuses `meta_live`'s token/session/version.
   `fetch_winning_creatives(account_id, since, until, top_n) -> list[CreativeAsset]` where
   `CreativeAsset = {ad_id, ad_name, roas, kind: image|video, local_path, hash, permalink, is_video_source: bool}`.
   Flow: insights(level=ad) → rank → `creative{...}` → resolve hashes via `adimages` / video_ids
   via the video node → **download immediately** → store under a run's `winners/` dir.
2. **Brand grounding** — optional `--ground-from-meta` flag: a vision pass in `brand_brain` over
   the top N winning images to extract the real palette/style/product cues before composing the
   BrandKit.
3. **Reference-conditioned generation** — pass winners/product as `refs` to `flux-2-flex`, and add
   a `--product <image>` path that routes through `bria/product-shot` (+ `birefnet/v2` cutout).
4. **Video seeding** — when an owned winning video's `source` (or preferred thumbnail) is
   available, use it as the Seedance i2v seed.
5. **Token upgrade + version bump** — System-User token w/ Page admin; move requests to v25.0.

Each phase is independently testable and mock-friendly (same lazy-import discipline as the rest of
the pipeline). This is a plan only — implementation is a separate, approved step.

---

## Sources

Meta official: [AdCreative](https://developers.facebook.com/docs/marketing-api/reference/ad-creative/) ·
[object_story_spec](https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/) ·
[AdImage/adimages](https://developers.facebook.com/docs/marketing-api/reference/ad-image/) ·
[asset_feed_spec](https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/) ·
[Video node](https://developers.facebook.com/docs/graph-api/reference/video/) ·
[video.thumbnails](https://developers.facebook.com/docs/graph-api/reference/video/thumbnails/) ·
[advideos](https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/) ·
[insights](https://developers.facebook.com/docs/marketing-api/insights/) ·
[breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/) ·
[ads_archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive/) ·
[generatepreviews](https://developers.facebook.com/docs/marketing-api/generatepreview/) ·
[rate limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/) ·
[system users](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/) ·
[v25.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version25.0/) ·
[ads_read permission](https://developers.facebook.com/docs/permissions/reference/ads_read).
