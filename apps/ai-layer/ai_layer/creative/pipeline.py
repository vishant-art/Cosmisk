"""Orchestrate the experiment: campaigns -> brand kit -> logo -> on-brand images.

Modes:
  auto   -- kit + logo + N images in one shot.
  review -- kit + logo only, then STOP. The user edits output/<run>/brand_kit.json
            and reruns with resume() to generate images from the edited kit.

Pipeline functions call the brain/provider MODULES by attribute (brand_brain.*,
image_providers.*, logo.*), so tests monkeypatch those module attributes to run
the whole flow with zero spend.
"""
from __future__ import annotations

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai import OpenAI

from ai_layer.creative import brand_brain
from ai_layer.creative import campaign_select as cs
from ai_layer import meta_creatives
from ai_layer import shopify_products
from ai_layer.creative import captions as captions_mod
from ai_layer.creative import compositor
from ai_layer.creative import config
from ai_layer.creative import editor
from ai_layer.creative import fal_billing
from ai_layer.creative import graph
from ai_layer.creative import image_providers
from ai_layer.creative import layout as layout_mod
from ai_layer.creative import logo as logo_mod
from ai_layer.creative import prompt_builder
from ai_layer.creative import sequencer
from ai_layer.creative import story_brain
from ai_layer.creative import storyboard as sb_mod
from ai_layer.creative import teardown
from ai_layer.creative import variants
from ai_layer.creative import verifier
from ai_layer.creative import verifier_video
from ai_layer.creative import video_providers
from ai_layer.creative.ledger import Ledger  # noqa: E402
from ai_layer.creative.schemas import (  # noqa: E402
    AssetRecord, BrandKit, CreativeTemplate, CreatorKit, QAReport, RunManifest, Script,
    Storyboard,
)

DEFAULT_FORMATS = ["4:5"]                # base shape; pass more to fan out (1:1/9:16/16:9)


def _slug(fmt: str) -> str:
    return fmt.replace(":", "x")


def _meta_cohort(account, *, preset, top_n, run_dir, token=None, bottom_n=5,
                 min_spend=100.0, log=print):
    """Pull BOTH tails of the account's ROAS distribution (UGC-D5).

    Returns (ref_images, assets). `ref_images` are WINNER stills only, because those
    condition generation and we do not want to condition on a loser's pixels. `assets`
    carries the whole cohort, including losers and including MP4s, because the teardown
    learns from the contrast.

    Never blocks a run: no token, or a Meta hiccup, yields ([], []) and a log line.
    """
    token = token or config.META_ACCESS_TOKEN or os.getenv("META_ACCESS_TOKEN")
    if not token:
        log("[meta] GROUNDING UNAVAILABLE: META_ACCESS_TOKEN not set; "
            "proceeding UNGROUNDED (kit + concepts from campaign data only)")
        return [], []
    try:
        assets = meta_creatives.fetch_creative_cohort(
            token, account, preset=preset, top_n=top_n, bottom_n=bottom_n,
            min_spend=min_spend, out_dir=Path(run_dir) / "winners", log=log)
    except Exception as e:  # noqa: BLE001 -- never let Meta hiccups break a run
        # Graceful, but LOUD. A run that silently degrades to ungrounded is worse than
        # one that says so: the operator pays for generation believing it was grounded.
        log(f"[meta] GROUNDING UNAVAILABLE: cohort fetch failed for {account} "
            f"({e!s:.140}); proceeding UNGROUNDED")
        return [], []
    # Winner stills condition FLUX. Loser stills deliberately do not.
    imgs = [a.local_path for a in assets if a.cohort == "winner" and a.local_path]
    log(f"[meta] {len(imgs)} winning image ref(s) from {account}")
    return imgs, assets


def _shopify_products(run_dir, *, top_n=3, log=print):
    """Bestseller product image(s) from Shopify. Graceful when no creds: returns [] and
    logs, never blocks the run."""
    return shopify_products.fetch_bestsellers(
        config.SHOPIFY_TOKEN, config.SHOPIFY_STORE,
        out_dir=Path(run_dir) / "products", top_n=top_n,
        api_version=config.SHOPIFY_API_VERSION, log=log)


def _write_pickings(run_dir, cohort, products, *, grounded, product_source):
    """Write pickings.json: the Meta winners AND the Shopify products this run drew on.

    This is the "show me what you picked" artifact, and the seed of the attribution join
    (variant/creative -> outcome). Also what `_picked_product_desc` reads so the i2v
    product seed knows what the item actually is.
    """
    winners = [{"ad_id": a.ad_id, "ad_name": a.ad_name, "roas": a.roas}
               for a in (cohort or []) if a.cohort == "winner"]
    losers = [{"ad_id": a.ad_id, "ad_name": a.ad_name, "roas": a.roas}
              for a in (cohort or []) if a.cohort == "loser"]
    prods = [{"shopify_id": p.product_id, "title": p.title, "revenue": p.revenue,
              "units": p.units, "image_src": p.image_src, "local_path": p.local_path}
             for p in (products or [])]
    payload = {"grounded": grounded, "product_source": product_source,
               "winners": winners, "losers": losers, "products": prods}
    (Path(run_dir) / "pickings.json").write_text(json.dumps(payload, indent=2),
                                                 encoding="utf-8")
    return payload


def _teardown_cohort(assets, *, client, run_dir, led, brand_id=None, log=print):
    """Tear down every ad with a playable MP4 -- WINNERS AND LOSERS -- and remember each one.

    Losers used to be downloaded and then never opened. That is not a small omission: without
    them the corpus is UNIDENTIFIABLE. "Pattern interrupt appears in 60% of winners" is
    exactly as true, and exactly as meaningless, as "60% of winners ran on a Tuesday", until
    you can also say how often LOSERS used it (UGC-D5, and graph.py's whole thesis).

    Cheap enough to be default-on: a teardown is one ASR call plus one vision call, on the
    order of a cent, against $1.22 for a single Seedance clip. And it is IMMUTABLE -- an ad's
    structure does not change after it ran -- so an ad already in the library is skipped, and
    the per-run cost falls to zero as the library fills.

    Returns the best winner's template (what conditions THIS run); the rest go to the library
    (what conditions every future run, via graph.build_graph).
    """
    with_video = [a for a in assets if a.video_path]
    if not with_video:
        log("[teardown] no ad in the cohort has a playable MP4; concepts will be ungrounded")
        return None

    templates = {}
    reused = 0
    for a in with_video:
        if brand_id and graph.already_known(brand_id, a.ad_id):
            reused += 1
            continue                       # already in the library; do not pay again
        try:
            t = teardown.analyze(a.video_path, ad_id=a.ad_id, ad_name=a.ad_name,
                                 cohort=a.cohort, metrics=a.metrics, client=client,
                                 led=led, work_dir=Path(run_dir) / "teardown", log=log)
        except Exception as e:  # noqa: BLE001 -- one bad ad never breaks a run
            log(f"[teardown] failed for {a.ad_id} ({e!s:.100}); skipped")
            continue
        templates[a.ad_id] = t
        if brand_id:
            graph.remember(brand_id, t)    # the library that compounds
    log(f"[teardown] analysed {len(templates)} ad(s)"
        + (f", reused {reused} from the library" if reused else "")
        + f" ({sum(1 for t in templates.values() if t.cohort == 'winner')} winners, "
          f"{sum(1 for t in templates.values() if t.cohort == 'loser')} losers)")

    # This run is still conditioned on the single best winner: a concrete structure to
    # reuse. The aggregate lives in the graph, which is a different kind of evidence.
    winners = [a for a in with_video if a.cohort == "winner" and a.ad_id in templates]
    if not winners:
        return None
    return templates[max(winners, key=lambda a: a.roas).ad_id]


def _client() -> OpenAI:
    # dummy key keeps construction offline-safe in tests (patched brain never calls out)
    return OpenAI(api_key=config.OPENROUTER_API_KEY or "sk-test",
                  base_url=config.OPENROUTER_BASE_URL)


def _write_manifest(run_dir: Path, manifest: RunManifest) -> None:
    (run_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2),
                                           encoding="utf-8")


def _write_kit(run_dir: Path, kit: BrandKit) -> None:
    (run_dir / "brand_kit.json").write_text(kit.model_dump_json(indent=2),
                                            encoding="utf-8")


def run(*, run_id: str, data_path: str | None = None, strategy="top-roas", n_campaigns=5,
        mode="auto", images=4, image_provider="flux", formats=None,
        qa_retries=1, run_vlm=False, pro=False, refs=None, product_image=None,
        meta_account=None, meta_token=None, ground_from_meta=True, meta_preset="last_30d",
        top_creatives=5, bottom_creatives=5, min_spend=100.0, use_shopify=True,
        style=None, no_logo=False, summary=None, account_name=None, prior=None,
        graph_prior=None, on_stage=None, log=print) -> RunManifest:
    """Full grounded run. Every grounding source is ON by default and each degrades
    gracefully (and loudly) when its credentials are absent:

      Meta cohort  -> both ROAS tails + the winner's MP4   (needs META_ACCESS_TOKEN)
      teardown     -> the winner's measured structure       (needs a playable winner MP4)
      Shopify      -> the store's bestseller product image  (needs SHOPIFY_TOKEN/STORE)

    A run with no creds still produces ads; it just says, loudly, that it was UNGROUNDED.
    """
    on_stage = on_stage or (lambda *_: None)
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    led = Ledger(run_dir)

    # The brand kit is reasoned from a `summary`. Two ways to get it:
    #  - brief mode: caller passes `summary` directly (the Creative Studio product brief);
    #  - campaign mode: derive it from a Meta insights envelope at `data_path`.
    if summary is None:
        ds = cs.load_dataset(data_path)
        subset = cs.select_campaigns(ds, strategy, n_campaigns)
        summary = cs.summarize(ds, subset)
        account_name = account_name or ds.account_name
        log(f"[1/4] {account_name}: {len(subset)} campaigns via '{strategy}'")
    else:
        account_name = account_name or "Creative Studio"
        log(f"[1/4] {account_name}: brief-driven")

    # The spoken/brief summary is reused by plan_story (T6), which may run later against
    # this same run dir without a data_path (brief mode has none).
    (run_dir / "summary.txt").write_text(summary, encoding="utf-8")

    # Pull the real creative cohort from Meta (BOTH tails, UGC-D5) to ground generation.
    winner_refs, cohort = (_meta_cohort(meta_account, preset=meta_preset,
                                        top_n=top_creatives, bottom_n=bottom_creatives,
                                        min_spend=min_spend, run_dir=run_dir,
                                        token=meta_token, log=log)
                           if meta_account else ([], []))
    if refs is None and winner_refs:
        refs = winner_refs                       # condition backgrounds on real winners
    if winner_refs:
        on_stage(f"Pulled {len(winner_refs)} winning creative(s) from Meta")
    ground_images = winner_refs if (ground_from_meta and winner_refs) else None

    # Product image: an explicit product_image wins; otherwise source the store's
    # bestseller from Shopify. A real product from the store, not a fabricated one.
    products = []
    product_source = "supplied" if product_image else "none"
    if not product_image and use_shopify:
        products = _shopify_products(run_dir, log=log)
        top = next((p for p in products if p.local_path), None)
        if top:
            product_image = top.local_path
            product_source = "shopify"
            on_stage(f"Sourced the product from Shopify: {top.title}")
            log(f"[shopify] product for this ad: {top.title!r} ({top.local_path})")

    # Always written, even ungrounded, so a run always says what it picked. This is also
    # what _picked_product_desc reads, so the i2v product seed knows what the item IS.
    _write_pickings(run_dir, cohort, products, grounded=bool(winner_refs),
                    product_source=product_source)

    client = _client()
    log("[2/4] generating brand kit...")
    on_stage("Designing the brand kit")
    kit, kit_cost = brand_brain.generate_brand_kit(client, summary, ground_images=ground_images)
    led.record("brandkit", "openrouter", config.TEXT_MODEL, kit_cost)
    _write_kit(run_dir, kit)
    on_stage("Brand kit decided")

    # Structural teardown of the top winner's MP4 -> the template that conditions concepts
    # (T4/T5) and, later, the script + storyboard (T6).
    template = _teardown_cohort(cohort, client=client, run_dir=run_dir, led=led,
                                brand_id=meta_account, log=log) if cohort else None
    if template:
        (run_dir / "template.json").write_text(template.model_dump_json(indent=2),
                                               encoding="utf-8")
        on_stage("Tore down the winning ad's structure")

    manifest = RunManifest(
        run_id=run_id, account_name=account_name, select_strategy=strategy,
        mode=mode, status="awaiting_review", brand_kit=kit, formats=formats,
    )
    if no_logo:
        kit.logo.asset_path = None            # no logo generated or composited
        log("[3/4] skipping logo (--no-logo)")
    else:
        log("[3/4] generating logo...")
        logo_res = logo_mod.generate_logo(kit, run_dir / "logo.png",
                                          provider=image_provider, log=log)
        led.record("logo", logo_res["provider"], logo_res["model"],
                   logo_res["cost_usd"], path=logo_res["path"])
        _write_kit(run_dir, kit)   # re-write now that logo.asset_path is set
        manifest.assets.append(AssetRecord(kind="logo", **_asset(logo_res)))
        on_stage("Logo generated")

    if mode == "review":
        manifest.total_cost_usd = led.total
        led.finalize()
        _write_manifest(run_dir, manifest)
        log(f"[review] kit + logo written to {run_dir}. Edit brand_kit.json then "
            f"resume with --resume {run_id}.")
        return manifest

    _generate_ads(client, kit, summary, run_dir, manifest, led, images=images,
                  image_provider=image_provider, formats=formats, qa_retries=qa_retries,
                  run_vlm=run_vlm, pro=pro, refs=refs, product_image=product_image,
                  template=template, style=style, prior=prior, graph_prior=graph_prior,
                  on_stage=on_stage, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    led.finalize()
    _write_manifest(run_dir, manifest)
    log(f"[done] {len(manifest.ads)} ads across {len(formats)} format(s), "
        f"{len(manifest.rejected)} rejected, est ${led.total:.3f} -> {run_dir}")
    return manifest


def resume(*, run_id: str, data_path: str, images=4, image_provider="flux",
           formats=None, qa_retries=1, run_vlm=False, pro=False, refs=None,
           product_image=None, style=None, log=print) -> RunManifest:
    """Generate ads from a (possibly user-edited) brand_kit.json in output/<run>."""
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    led = Ledger(run_dir)
    # Reuse the run's teardown rather than re-downloading and re-analyzing the winner.
    tpl_file = run_dir / "template.json"
    template = (CreativeTemplate.model_validate_json(tpl_file.read_text("utf-8"))
                if tpl_file.exists() else None)
    ds = cs.load_dataset(data_path)
    summary = cs.summarize(ds, cs.select_campaigns(ds, "all", 0))

    logo_path = run_dir / "logo.png"
    if kit.logo.asset_path is None and logo_path.exists():
        kit.logo.asset_path = str(logo_path)

    manifest = RunManifest(run_id=run_id, account_name=ds.account_name,
                           select_strategy="resume", mode="review",
                           status="awaiting_review", brand_kit=kit, formats=formats)
    if logo_path.exists():
        manifest.assets.append(AssetRecord(kind="logo", provider="?",
                               model="?", path=str(logo_path)))

    client = _client()
    _generate_ads(client, kit, summary, run_dir, manifest, led, images=images,
                  image_provider=image_provider, formats=formats, qa_retries=qa_retries,
                  run_vlm=run_vlm, pro=pro, refs=refs, product_image=product_image,
                  template=template, style=style, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    led.finalize()
    _write_manifest(run_dir, manifest)
    log(f"[done] resumed: {len(manifest.ads)} ads, est ${led.total:.3f} -> {run_dir}")
    return manifest


def video_smoke(*, run_id: str, prompt: str, image=None,
                duration=config.VIDEO_DURATION_DEFAULT, resolution="720p", aspect="9:16",
                copy=None, kit=None, logo_path=None, generate_audio=True,
                voiceover=False, client=None, on_stage=None, log=print) -> AssetRecord:
    """Explicit, budget-gated single-clip smoke (Seedance i2v -> t2v fallback).
    Seeds from a TEXT-FREE background of this run so the clip matches the static ad.
    - `generate_audio` (default True): Seedance synced native audio (free).
    - `copy` (+ `kit`): burns the headline/CTA lower-third onto the clip.
    - `voiceover` (+ `client`, `kit`): brain writes a script -> fal TTS -> muxed on."""
    on_stage = on_stage or (lambda *_: None)
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    seed = image
    if seed is None:                                   # prefer a text-free bg from this run
        cands = sorted(run_dir.glob("concept_*_bg.png"))
        seed = str(cands[0]) if cands else None
    on_stage("Generating video")
    try:
        res = video_providers.generate_with_fallback(
            prompt, run_dir / "video.mp4", image=seed, duration=duration,
            resolution=resolution, aspect=aspect, generate_audio=generate_audio, log=log)
    except Exception as e:  # noqa: BLE001 -- a total video failure must not crash the run
        log(f"[video] generation failed entirely ({e!s:.140}); no clip produced")
        led.finalize()
        return None
    led.record("video", res["provider"], res["model"], res["cost_usd"],
               fell_back_from=res.get("fell_back_from"), audio=res.get("audio", generate_audio))
    log(f"[video] {res['provider']} ({'i2v' if seed else 't2v'}, "
        f"audio={'on' if res.get('audio', generate_audio) else 'off'}) -> {res['path']} "
        f"(est ${res['cost_usd']:.2f})")

    if copy is not None and kit is not None:           # burn copy/logo onto the clip
        on_stage("Overlaying copy on video")
        try:
            from ai_layer.creative import video_post
            final = video_post.add_copy_overlay(
                res["path"], run_dir / "video_captioned.mp4", copy, kit,
                fmt=aspect, logo_path=logo_path)
            res["path"] = final
            log(f"[video] copy overlay -> {final}")
        except Exception as e:  # noqa: BLE001 -- overlay is best-effort
            log(f"[video] copy overlay failed ({e!s:.100}); keeping raw clip")

    if voiceover and kit is not None and client is not None:   # script -> TTS -> mux
        on_stage("Adding voiceover")
        try:
            hook = copy.headline if copy else prompt
            cta = copy.cta_label if copy else ""
            script, vo_cost = brand_brain.generate_vo_script(client, kit, hook, cta, duration)
            led.record("vo_script", "openrouter", config.TEXT_MODEL, vo_cost)
            vo = video_providers.generate_voiceover(script, run_dir / "voiceover.mp3", log=log)
            led.record("voiceover", vo["provider"], vo["model"], vo["cost_usd"], chars=len(script))
            merged = video_providers.merge_audio_onto_video(
                res["path"], vo["path"], run_dir / "video_voiceover.mp4",
                seconds=duration, log=log)
            led.record("audio_merge", merged["provider"], merged["model"], merged["cost_usd"])
            res["path"] = merged["path"]
            log(f"[video] voiceover ({len(script)} chars) muxed -> {merged['path']}")
        except Exception as e:  # noqa: BLE001 -- voiceover is best-effort
            log(f"[video] voiceover failed ({e!s:.100}); keeping clip without VO")

    on_stage("Video done")
    led.finalize()
    return AssetRecord(kind="video", **_asset(res))


def _make_concept(i, concept, *, client, kit, run_dir, led, formats, qa_retries, run_vlm,
                  pro, bg_primary, bg_refs, negative, base_fmt, logo_path, style=None,
                  log=print):
    """Full per-concept flow (background -> composite -> verify -> retries -> outpaint
    each format). Self-contained so concepts run concurrently in a thread pool. Returns
    (comps, reports, rejected)."""
    layouts = layout_mod.plan_all_formats(concept.ad_copy, formats, has_logo=bool(logo_path))
    bg = run_dir / f"concept_{i:02d}_bg.png"
    base_spec = layouts[base_fmt]
    base_out = run_dir / f"ad_{i:02d}_{_slug(base_fmt)}.png"
    accepted, reports = None, []

    for attempt in range(qa_retries + 1):
        # Background is TEXT-FREE: negative prompt suppresses text/logo. `bg_refs`
        # condition the scene on the real product / winning creatives (or None).
        # `style` grounds the pixels in a capture aesthetic (T1); None = studio look.
        prompt = prompt_builder.build_image_prompt(concept, kit, base_fmt, style=style)
        res = image_providers.generate_with_fallback(
            prompt, bg, primary=bg_primary, refs=bg_refs, aspect=base_fmt,
            negative=negative, pro=pro, log=log)
        led.record("background", res["provider"], res["model"], res["cost_usd"],
                   concept=concept.title, fell_back_from=res.get("fell_back_from"))
        comp = compositor.compose(bg, base_spec, concept.ad_copy, base_out, kit=kit,
                                  logo_path=logo_path, concept_title=concept.title)
        comp.ad_copy = concept.ad_copy        # carry copy for video overlay / VO reuse
        report = verifier.verify(comp, base_spec, concept.ad_copy,
                                 client=client if run_vlm else None, run_vlm=run_vlm,
                                 expect_logo=bool(logo_path))
        reports.append(report)
        if report.cost_usd:
            led.record("qa_vlm", "openrouter", config.VISION_MODEL,
                       report.cost_usd, concept=concept.title)
        if report.approved:
            accepted = comp
            break
        log(f"  - '{concept.title}' QA fail (try {attempt + 1}): {report.retry_hint}")

    if accepted is None:
        return [], reports, True

    comps = []
    for fmt in formats:
        if fmt == base_fmt:
            comp = accepted
        else:
            src = bg
            fbg = run_dir / f"concept_{i:02d}_bg_{_slug(fmt)}.png"
            try:                          # extend the accepted bg to this ratio
                op = image_providers.outpaint(bg, fbg, fmt=fmt, negative=negative)
                led.record("outpaint", op["provider"], op["model"], op["cost_usd"],
                           concept=concept.title)
                src = fbg
            except Exception as e:        # noqa: BLE001 -- fall back to resizing base bg
                log(f"    outpaint {fmt} failed ({e!s:.80}); resizing base bg")
            out = run_dir / f"ad_{i:02d}_{_slug(fmt)}.png"
            comp = compositor.compose(src, layouts[fmt], concept.ad_copy, out, kit=kit,
                                      logo_path=logo_path, concept_title=concept.title)
        led.record("composite", "pillow", "-", 0.0, concept=concept.title, fmt=fmt)
        comps.append(comp)
    return comps, reports, False


def _generate_ads(client, kit, summary, run_dir, manifest, led, *, images,
                  image_provider, formats, qa_retries, run_vlm, pro, refs=None,
                  product_image=None, template=None, style=None, prior=None,
                  graph_prior=None, on_stage=None, log=print) -> None:
    """Generate N concepts CONCURRENTLY (each a text-free QA-gated background ->
    per-format layout -> composite -> verify -> outpaint). Emits milestone updates via
    `on_stage`. Conditioning: product_image -> Bria product-shot; else refs -> FLUX.2
    flex reference images; else a blind background.

    `template` grounds the CONCEPTS in the measured structure of a real winner (T5);
    `style` grounds the pixels in a capture aesthetic (T1)."""
    on_stage = on_stage or (lambda *_: None)
    log(f"[4/4] {images} concepts x {len(formats)} format(s); QA retries={qa_retries}...")
    concepts, concepts_cost = story_brain.generate_concepts(client, kit, summary, images,
                                                            template=template, prior=prior,
                                                            graph=graph_prior)
    led.record("concepts", "openrouter", config.TEXT_MODEL, concepts_cost)
    on_stage(f"Planned {len(concepts)} ad concept(s)")
    negative = prompt_builder.build_negative_prompt()
    base_fmt = formats[0]
    logo_path = kit.logo.asset_path

    if product_image:
        cut = run_dir / "product_cutout.png"
        try:
            cres = image_providers.cutout(product_image, cut)
            led.record("cutout", cres["provider"], cres["model"], cres["cost_usd"])
            bg_primary, bg_refs = "product", [str(cut)]
        except Exception as e:  # noqa: BLE001 -- cutout is best-effort
            log(f"  [product] cutout failed ({e!s:.80}); using raw product image")
            bg_primary, bg_refs = "product", [product_image]
    else:
        bg_primary, bg_refs = image_provider, (refs or None)

    compositor._font(24)   # pre-warm the font cache so concurrent composites don't race

    def work(item):
        i, concept = item
        return concept, _make_concept(
            i, concept, client=client, kit=kit, run_dir=run_dir, led=led, formats=formats,
            qa_retries=qa_retries, run_vlm=run_vlm, pro=pro, bg_primary=bg_primary,
            bg_refs=bg_refs, negative=negative, base_fmt=base_fmt, logo_path=logo_path,
            style=style, log=log)

    n, done = len(concepts), 0
    with ThreadPoolExecutor(max_workers=min(n, 4)) as ex:   # concepts in parallel
        futures = [ex.submit(work, (i, c)) for i, c in enumerate(concepts, 1)]
        for fut in as_completed(futures):
            done += 1
            try:
                concept, (comps, reports, rejected) = fut.result()
            except Exception as e:  # noqa: BLE001 -- one concept failing never kills the run
                log(f"  - concept errored: {e!s:.120}")
                on_stage(f"Ad {done}/{n} failed")
                continue
            manifest.qa_reports.extend(reports)
            if rejected:
                manifest.rejected.append(concept.title)
                on_stage(f"Ad {done}/{n} rejected by quality gate")
                continue
            for comp in comps:
                manifest.ads.append(comp)
                manifest.assets.append(AssetRecord(kind="image", concept_title=comp.concept_title,
                                                   provider="composite", model="pillow",
                                                   path=comp.path, cost_usd=0.0))
            on_stage(f"Ad {done}/{n} generated — {concept.title}")
            log(f"  - '{concept.title}' shipped in {len(formats)} format(s)")
    on_stage("Static ads done")


def _asset(res: dict) -> dict:
    return {"provider": res["provider"], "model": res["model"], "path": res["path"],
            "cost_usd": res.get("cost_usd", 0.0), "fell_back_from": res.get("fell_back_from")}


# ==============================================================================
# UGC VIDEO PIPELINE (T6-T10). Additive: the static-ad run()/resume()/video_smoke()
# above are untouched. These orchestrate script -> storyboard -> render -> finish ->
# variants -> temporal QA, on top of a run dir that run() already produced.
# ==============================================================================

# Preference order for "the clip that ships": the most post-processed one wins.
_FINAL_CLIP_NAMES = ("video_captioned.mp4", "video_voiceover.mp4",
                     "video_overlay.mp4", "timeline.mp4", "video.mp4")


def _picked_product_desc(run_dir):
    """The title of the product this run drew on (from pickings.json), or None.

    Anchors the i2v product seed to what the item ACTUALLY is, so the seed isolates the
    product instead of whatever else the source photo happened to contain (e.g. a model).
    """
    pk = Path(run_dir) / "pickings.json"
    if not pk.exists():
        return None
    try:
        prods = json.loads(pk.read_text("utf-8")).get("products") or []
    except (json.JSONDecodeError, OSError):
        return None
    title = (prods[0].get("title") if prods else None) or None
    return title.strip() if isinstance(title, str) and title.strip() else None


def _run_script(run_dir: Path) -> Script | None:
    """The run's Script artifact, if plan_story has been run."""
    f = run_dir / "script.json"
    return Script.model_validate_json(f.read_text("utf-8")) if f.exists() else None


def _run_creator(run_dir: Path) -> CreatorKit | None:
    """The run's CreatorKit, if one was set. Persisted so plan_story and render_story cannot
    disagree about who is in the ad: the script is written for this person and the shots are
    rendered as this person, and a mismatch between the two is not recoverable in post."""
    f = Path(run_dir) / "creator_kit.json"
    return CreatorKit.model_validate_json(f.read_text("utf-8")) if f.exists() else None


def _write_creator(run_dir: Path, creator: CreatorKit) -> None:
    (Path(run_dir) / "creator_kit.json").write_text(creator.model_dump_json(indent=2),
                                                    encoding="utf-8")


def _run_direction(run_dir) -> str | None:
    """The operator's look/feel guide for this run, if one was given. Persisted so the
    render uses the SAME direction the script was written to."""
    f = Path(run_dir) / "direction.txt"
    return f.read_text("utf-8") if f.exists() else None


def _write_direction(run_dir, direction: str) -> None:
    (Path(run_dir) / "direction.txt").write_text(direction, encoding="utf-8")


def _clean_work(run_dir):
    """Remove the scratch dir of $0 intermediates (Phase 9.4). The paid render cache lives
    in renders/, not here, so a re-run still reuses it."""
    import shutil
    shutil.rmtree(Path(run_dir) / ".work", ignore_errors=True)


def plan_story(*, run_id: str, data_path: str | None = None, summary: str | None = None,
               seconds: int = None, creator: CreatorKit | None = None, prior=None,
               graph_prior=None, direction: str | None = None, n_shots: int | None = None,
               log=print) -> tuple[Script, Storyboard]:
    """Script -> Storyboard, written to the run dir. No pixels, no renderer (T6).

    Standalone-valuable: a shot list a human creator could shoot is a deliverable even
    if we never render a frame (OQ3). The renderer moves down the stack and becomes a
    detail; the sequence IS the creative.

    Reuses the run's teardown (template.json) so the argument is grounded in the
    structure of a real winner rather than invented from a brand kit.

    The summary comes from (in order): the `summary` argument, the run's summary.txt
    (written by run(), and the only source in brief mode, which has no data_path), or
    a campaign envelope at `data_path`.
    """
    seconds = config.STORY_DEFAULT_SECONDS if seconds is None else seconds
    run_dir = config.OUTPUT_DIR / run_id
    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    led = Ledger(run_dir)

    tpl_file = run_dir / "template.json"
    template = (CreativeTemplate.model_validate_json(tpl_file.read_text("utf-8"))
                if tpl_file.exists() else None)
    if template is None:
        log("[story] no teardown for this run; the script will be ungrounded")

    if summary is None:
        cached = run_dir / "summary.txt"
        if cached.exists():
            summary = cached.read_text("utf-8")
        elif data_path:
            ds = cs.load_dataset(data_path)
            summary = cs.summarize(ds, cs.select_campaigns(ds, "all", 0))
        else:
            raise FileNotFoundError(
                f"no summary for run {run_id!r}: pass summary= or data_path=, or run() first")

    # The creator is persisted, so render_story renders the same person the script was
    # written for. An argument written for a deadpan 40-year-old, shot as a bubbly 22-year-old,
    # is two ads spliced together.
    creator = creator or _run_creator(run_dir)
    if creator is not None:
        _write_creator(run_dir, creator)
        log(f"[story] creator: {creator.name} ({creator.age_range} {creator.gender}, "
            f"{creator.energy})")
    direction = direction or _run_direction(run_dir)
    if direction:
        _write_direction(run_dir, direction)
        log(f"[story] operator direction: {direction.strip()[:120]}")

    script, s_cost = story_brain.generate_script(client=(client := _client()), kit=kit,
                                                 summary=summary, seconds=seconds,
                                                 template=template, creator=creator,
                                                 prior=prior, graph=graph_prior,
                                                 direction=direction)
    led.record("script", "openrouter", config.TEXT_MODEL, s_cost, beats=len(script.beats))
    (run_dir / "script.json").write_text(script.model_dump_json(indent=2), encoding="utf-8")

    board, b_cost = story_brain.generate_storyboard(client, kit, script, seconds=seconds,
                                                    template=template, creator=creator,
                                                    prior=prior, graph=graph_prior,
                                                    direction=direction, n_shots=n_shots, log=log)
    led.record("storyboard", "openrouter", config.TEXT_MODEL, b_cost, shots=len(board.shots))
    (run_dir / "storyboard.json").write_text(board.model_dump_json(indent=2), encoding="utf-8")

    led.finalize()
    log(f"[story] {len(script.beats)} beats -> {len(board.shots)} shots, "
        f"{board.duration_s:.1f}s (est ${led.total:.3f}) -> {run_dir}")
    log(sb_mod.as_shot_list(board))
    return script, board


def render_story(*, run_id: str, style=None, aspect: str = "9:16", resolution: str = "720p",
                 single_pass: bool = False, strict: bool = True, finish: bool = True,
                 keep_work: bool = False, guard_balance: bool = True,
                 creator: CreatorKit | None = None, pin_face: bool = False,
                 direction: str | None = None, log=print):
    """Render a planned storyboard into a timeline (T7). Costs real money.

    Reads the run's storyboard.json and brand_kit.json, renders every shot with repair
    (T9.5), edits each one (T7.5), concatenates, then verifies the assembled timeline
    against the plan (T9). The clip that ships is the clip that gets verified.

    When FAL_ADMIN_KEY is set, `guard_balance` fails BEFORE spending if the live fal balance
    cannot cover the planned clips (the overdraw that locked the account once already). Pass
    `guard_balance=False` to override. With no admin key the guard is a graceful no-op.
    """
    run_dir = config.OUTPUT_DIR / run_id
    board = Storyboard.model_validate_json(
        (run_dir / "storyboard.json").read_text("utf-8"))

    if guard_balance:
        g = fal_billing.affordable(len(board.shots))
        if g["enabled"] and not g["ok"]:
            raise RuntimeError(
                f"fal balance ${g['balance']:.2f} cannot cover {len(board.shots)} planned "
                f"clip(s) (~${g['needed']:.2f} needed, short ${g['shortfall']:.2f}). "
                f"Top up at fal.ai/dashboard/billing or pass guard_balance=False.")
        if g["enabled"]:
            log(f"[render] fal balance ${g['balance']:.2f}, plan needs ~${g['needed']:.2f}")

    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    script = _run_script(run_dir)
    creator = creator or _run_creator(run_dir)     # the person the script was written for
    direction = direction or _run_direction(run_dir)   # the same look/feel guide the script used
    cut = run_dir / "product_cutout.png"
    cutout = str(cut) if cut.exists() else None
    product_desc = _picked_product_desc(run_dir)   # anchors the seed to the real item (9.6)
    led = Ledger(run_dir)

    if single_pass:
        timeline = sequencer.render_single_pass(board, kit=kit, run_dir=run_dir,
                                                style=style, aspect=aspect,
                                                resolution=resolution, creator=creator,
                                                direction=direction, led=led, log=log)
        rlog = None
    else:
        client = _client()
        timeline, board, rlog = sequencer.render_storyboard(
            board, kit=kit, run_dir=run_dir, script=script, style=style,
            cutout_path=cutout, product_desc=product_desc, aspect=aspect, resolution=resolution,
            creator=creator, pin_face=pin_face, direction=direction,
            replan=lambda shot, reason: story_brain.replan_shot(
                client, kit, shot, reason=reason)[0],
            strict=strict, led=led, log=log)
        (run_dir / "storyboard_rendered.json").write_text(
            board.model_dump_json(indent=2), encoding="utf-8")
        (run_dir / "repair_log.json").write_text(rlog.model_dump_json(indent=2),
                                                 encoding="utf-8")

    if finish and script is not None:
        timeline = finish_timeline(timeline, board, script, kit, run_dir,
                                   client=_client(), led=led,
                                   voice=(creator.voice_id if creator else None), log=log)

    if not keep_work:
        _clean_work(run_dir)          # keep only paid artifacts + the finished ad (9.4)

    billed, used = sequencer.billed_seconds(board)
    led.finalize()
    log(f"[render] {timeline} ({used:g}s of ad, {billed:g}s billed, "
        f"est ${led.total:.2f})")

    try:                              # reconcile the estimate against fal's invoice (no-op
        act = fal_billing.write_run_actuals(run_dir)   # without an admin key)
        if act is not None:
            log(f"[render] fal actual ${act['actual_usd']:.2f} vs est ${act['estimate_usd']:.2f} "
                f"({act['delta_pct']:+.1f}%), balance ${act['balance_after_usd']:.2f} "
                f"-> fal_actuals.json")
    except Exception as e:            # noqa: BLE001 -- billing readback must never fail a run
        log(f"[render] fal actuals unavailable ({e!s:.80})")

    return timeline, board, rlog


def finish_timeline(timeline, board: Storyboard, script: Script, kit: BrandKit, run_dir, *,
                    client=None, sfx: bool = True, voiceover: bool = True,
                    captions: bool = True, voice: str | None = None,
                    led=None, log=print) -> str:
    """Voiceover, SFX and captions over the ASSEMBLED timeline, not per shot.

    One voiceover across the whole ad, muxed once. Splicing per-shot audio at every cut
    produces exactly the seams the cuts were meant to hide, and per-shot captions cannot
    know where a sentence crosses a boundary.

    Order matters: the VO lands first so the SFX have something to mix against, and the
    captions go last because they are checked against the audio that ships.
    """
    run_dir = Path(run_dir)
    work = run_dir / ".work"
    work.mkdir(parents=True, exist_ok=True)
    out = timeline

    if voiceover:
        try:
            spoken = script.spoken()
            # ONE voiceover for the whole ad, so `voice` is consistent across every shot by
            # construction. This is the half of a persona that is a GUARANTEE rather than a
            # wish: MiniMax honours voice_id exactly, where the video model only tries.
            vo = video_providers.generate_voiceover(spoken, run_dir / "voiceover.mp3",
                                                    voice=voice or None,
                                                    log=log)   # KEPT: paid TTS
            if led:
                led.record("voiceover", vo["provider"], vo["model"], vo["cost_usd"],
                           chars=len(spoken))
            # Make the voiceover end WITH the picture. TTS length is uncontrolled, and a
            # voiceover longer than the video gets its tail (the CTA) truncated at mux time.
            # fit_audio speeds it up to fit (or pads if short); it never cuts the tail.
            editor.fit_audio(run_dir / "voiceover.mp3", run_dir / "voiceover.mp3",
                             board.duration_s, log=log)
            merged = video_providers.merge_audio_onto_video(
                out, vo["path"], work / "timeline_voiceover.mp4",
                seconds=board.duration_s, log=log)
            if led:
                led.record("audio_merge", merged["provider"], merged["model"],
                           merged["cost_usd"])
            out = merged["path"]
        except Exception as e:  # noqa: BLE001 -- a silent ad is still an ad
            log(f"[finish] voiceover failed ({e!s:.100}); the timeline stays silent")
            voiceover = False

    if sfx:
        try:
            cues = editor.sfx_cues_for(board)
            out = editor.add_sfx(out, work / "timeline_sfx.mp4", cues, log=log)
        except Exception as e:  # noqa: BLE001
            log(f"[finish] sfx failed ({e!s:.100}); continuing without them")

    if captions and voiceover:
        try:
            out = editor.caption_clip(out, run_dir / "video_captioned.mp4",   # KEPT: deliverable
                                      script.spoken(), run_dir / "voiceover.mp3",
                                      kit=kit, led=led, log=log)[0]
        except captions_mod.CaptionDriftError as e:
            log(f"[captions] REFUSED by the drift gate: {e!s:.140}")
        except Exception as e:  # noqa: BLE001
            log(f"[captions] burn failed ({e!s:.100}); shipping uncaptioned")

    # Promote the deliverable out of scratch if the last step landed there (e.g. captions
    # skipped/failed, so `out` is the .work voiceover/sfx clip). The final ad must survive
    # the .work cleanup (Phase 9.4).
    if Path(out).resolve().parent.name == ".work":
        import shutil
        final = run_dir / "timeline_final.mp4"
        shutil.copy(out, final)
        out = str(final)

    log(f"[finish] {Path(out).name}")
    return str(out)


def make_variants(*, run_id: str, axis: str, values: list, base_clip=None, log=print):
    """Produce a matched variant set for a run (T10).

    Edit axes (`caption_style`, `aesthetic`) cut the run's finished timeline N ways for
    zero marginal model cost and write the clips. The `hook_type` axis regenerates N
    matched scripts and writes them for the operator to render (each is a full render, so
    the pipeline does not spend that money implicitly).

    Writes the experiment record either way: that is the point of T10, the clean tag that
    lets performance be attributed back to (axis, value) later.
    """
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    vdir = run_dir / "variants"

    if axis == "hook_type":
        script = _run_script(run_dir)
        if script is None:
            raise FileNotFoundError(f"{run_dir}/script.json not found; run --storyboard")
        kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
        tpl_file = run_dir / "template.json"
        template = (CreativeTemplate.model_validate_json(tpl_file.read_text("utf-8"))
                    if tpl_file.exists() else None)
        vset, scripts, cost = variants.hook_variant_set(
            _client(), kit, script, values, base_id=run_id, template=template)
        led.record("variant_scripts", "openrouter", config.TEXT_MODEL, cost)
        vdir.mkdir(parents=True, exist_ok=True)
        artifacts = {}
        for vid, s in scripts.items():
            p = vdir / f"{vid}.script.json"
            p.write_text(s.model_dump_json(indent=2), encoding="utf-8")
            artifacts[vid] = str(p)
        record = variants.write_record(run_dir, vset, artifacts,
                                       extra={"note": "render each with --resume/--render"})
    else:
        clip = base_clip or next(
            (run_dir / n for n in _FINAL_CLIP_NAMES if (run_dir / n).exists()), None)
        if clip is None:
            raise FileNotFoundError(f"no rendered clip in {run_dir}; run --render first")
        if axis == "caption_style":
            script = _run_script(run_dir)
            text = script.spoken() if script else ""
            vset, artifacts = variants.caption_variant_set(
                clip, text, values, base_id=run_id, out_dir=vdir, led=led, log=log)
        elif axis == "aesthetic":
            vset, artifacts = variants.aesthetic_variant_set(
                clip, values, base_id=run_id, out_dir=vdir, log=log)
        else:
            raise ValueError(f"unknown variant axis {axis!r}")
        record = variants.write_record(run_dir, vset, artifacts)

    led.finalize()
    log(f"[variants] {len(vset.variants)} {axis} variant(s) -> {record}")
    return vset, record


def qa_video(*, run_id: str, clip=None, cutout=None, shot_paths=None, strict: bool = True,
             run_vlm: bool = False, log=print) -> QAReport:
    """Run the temporal QA gate over a run's finished clip (T9).

    Verifies the artifact that SHIPS, chosen as the most post-processed clip in the run
    dir. Verifying an earlier intermediate would miss every defect the editor introduced,
    which is most of the ones worth catching.
    """
    run_dir = config.OUTPUT_DIR / run_id
    board_file = run_dir / "storyboard.json"
    if not board_file.exists():
        raise FileNotFoundError(f"{board_file} not found; run --storyboard first")
    board = Storyboard.model_validate_json(board_file.read_text("utf-8"))

    if clip is None:
        clip = next((run_dir / n for n in _FINAL_CLIP_NAMES if (run_dir / n).exists()), None)
    if clip is None:
        raise FileNotFoundError(f"no rendered clip in {run_dir}")

    if cutout is None:
        cut = run_dir / "product_cutout.png"
        cutout = str(cut) if cut.exists() else None

    # Shot-boundary checks (cut alignment, continuity) run on the PRE-caption assembled
    # timeline, not `clip`: burned-in per-word captions change every ~0.5s and a frame-diff
    # cut detector reads each change as a scene cut, which false-fails the gate on the
    # captioned final. `timeline.mp4` is the silent, caption-free assembly the run keeps.
    pre_caption = run_dir / "timeline.mp4"
    cuts_clip = str(pre_caption) if pre_caption.exists() and Path(clip).name != "timeline.mp4" else None

    vo_file = run_dir / "voiceover.mp3"
    led = Ledger(run_dir)
    report = verifier_video.verify(
        clip, board, _run_script(run_dir), client=(_client() if run_vlm else None),
        cutout_path=cutout, shot_paths=shot_paths, strict=strict, led=led,
        work_dir=run_dir / "qa", cuts_clip=cuts_clip,
        audio_path=(str(vo_file) if vo_file.exists() else None), log=log)
    (run_dir / "qa_report.json").write_text(report.model_dump_json(indent=2),
                                            encoding="utf-8")
    led.finalize()
    log(f"[qa] {Path(clip).name}: {report.verdict} -> {run_dir / 'qa_report.json'}")
    if report.retry_hint:
        log(f"[qa] {report.retry_hint}")
    return report
