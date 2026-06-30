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
from ai_layer.creative import compositor
from ai_layer.creative import config
from ai_layer.creative import image_providers
from ai_layer.creative import layout as layout_mod
from ai_layer.creative import logo as logo_mod
from ai_layer.creative import prompt_builder
from ai_layer.creative import verifier
from ai_layer.creative import video_providers
from ai_layer.creative.ledger import Ledger  # noqa: E402
from ai_layer.creative.schemas import AssetRecord, BrandKit, RunManifest  # noqa: E402

DEFAULT_FORMATS = ["4:5"]                # base shape; pass more to fan out (1:1/9:16/16:9)


def _slug(fmt: str) -> str:
    return fmt.replace(":", "x")


def _meta_winner_refs(account, *, preset, top_n, run_dir, token=None, log=print) -> list[str]:
    """Pull the account's winning RUNNING-ad images via the Meta API (downloaded
    immediately, URLs expire) to use as brand/reference conditioning. Returns local
    image paths; empty + a log line if no token (never blocks a run)."""
    token = token or os.getenv("META_ACCESS_TOKEN")
    if not token:
        log("[meta] META_ACCESS_TOKEN not set; skipping winner fetch")
        return []
    try:
        assets = meta_creatives.fetch_winning_creatives(
            token, account, preset=preset, top_n=top_n, out_dir=Path(run_dir) / "winners")
    except Exception as e:  # noqa: BLE001 -- never let Meta hiccups break a run
        log(f"[meta] winner fetch failed ({e!s:.120}); proceeding without refs")
        return []
    imgs = [a.local_path for a in assets if a.kind == "image" and a.local_path]
    log(f"[meta] pulled {len(imgs)} winning image ref(s) from {account}")
    return imgs


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
        meta_account=None, meta_token=None, ground_from_meta=False, meta_preset="last_30d",
        top_creatives=5, no_logo=False, summary=None, account_name=None,
        on_stage=None, log=print) -> RunManifest:
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

    # Pull real winning creatives from Meta to condition generation (optional).
    winner_refs = (_meta_winner_refs(meta_account, preset=meta_preset, top_n=top_creatives,
                                     run_dir=run_dir, token=meta_token, log=log)
                   if meta_account else [])
    if refs is None and winner_refs:
        refs = winner_refs                       # condition backgrounds on real winners
    if winner_refs:
        on_stage(f"Pulled {len(winner_refs)} winning creative(s) from Meta")
    ground_images = winner_refs if (ground_from_meta and winner_refs) else None

    client = _client()
    log("[2/4] generating brand kit...")
    on_stage("Designing the brand kit")
    kit, kit_cost = brand_brain.generate_brand_kit(client, summary, ground_images=ground_images)
    led.record("brandkit", "openrouter", config.TEXT_MODEL, kit_cost)
    _write_kit(run_dir, kit)
    on_stage("Brand kit decided")

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
           product_image=None, log=print) -> RunManifest:
    """Generate ads from a (possibly user-edited) brand_kit.json in output/<run>."""
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    led = Ledger(run_dir)
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
                  run_vlm=run_vlm, pro=pro, refs=refs, product_image=product_image, log=log)
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
                  pro, bg_primary, bg_refs, negative, base_fmt, logo_path, log):
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
        prompt = prompt_builder.build_image_prompt(concept, kit, base_fmt)
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
                  product_image=None, on_stage=None, log=print) -> None:
    """Generate N concepts CONCURRENTLY (each a text-free QA-gated background ->
    per-format layout -> composite -> verify -> outpaint). Emits milestone updates via
    `on_stage`. Conditioning: product_image -> Bria product-shot; else refs -> FLUX.2
    flex reference images; else a blind background."""
    on_stage = on_stage or (lambda *_: None)
    log(f"[4/4] {images} concepts x {len(formats)} format(s); QA retries={qa_retries}...")
    concepts, concepts_cost = brand_brain.generate_concepts(client, kit, summary, images)
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
            bg_refs=bg_refs, negative=negative, base_fmt=base_fmt, logo_path=logo_path, log=log)

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
