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
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))  # rnd/src (Meta layer)
import brand_brain  # noqa: E402
import campaign_select as cs  # noqa: E402
import meta_creatives  # noqa: E402
import compositor  # noqa: E402
import config  # noqa: E402
import image_providers  # noqa: E402
import layout as layout_mod  # noqa: E402
import logo as logo_mod  # noqa: E402
import prompt_builder  # noqa: E402
import teardown  # noqa: E402
import verifier  # noqa: E402
import video_providers  # noqa: E402
from ledger import Ledger  # noqa: E402
from schemas import AssetRecord, BrandKit, CreativeTemplate, RunManifest  # noqa: E402

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
    token = token or os.getenv("META_ACCESS_TOKEN")
    if not token:
        log("[meta] META_ACCESS_TOKEN not set; skipping cohort fetch")
        return [], []
    try:
        assets = meta_creatives.fetch_creative_cohort(
            token, account, preset=preset, top_n=top_n, bottom_n=bottom_n,
            min_spend=min_spend, out_dir=Path(run_dir) / "winners", log=log)
    except Exception as e:  # noqa: BLE001 -- never let Meta hiccups break a run
        log(f"[meta] cohort fetch failed ({e!s:.120}); proceeding without refs")
        return [], []
    # Winner stills condition FLUX. Loser stills deliberately do not.
    imgs = [a.local_path for a in assets if a.cohort == "winner" and a.local_path]
    log(f"[meta] {len(imgs)} winning image ref(s) from {account}")
    return imgs, assets


def _teardown_winner(assets, *, client, run_dir, led, log=print):
    """Tear down the best winner that has a playable MP4. Returns a CreativeTemplate
    or None.

    The MP4s were already being downloaded here and then dropped on the floor by a
    `kind == "image"` filter that never opened them. This is the fix, and it costs one
    Whisper call plus one vision call.
    """
    with_video = [a for a in assets if a.cohort == "winner" and a.video_path]
    if not with_video:
        log("[teardown] no winner has a playable MP4; concepts will be ungrounded")
        return None
    best = max(with_video, key=lambda a: a.roas)
    try:
        return teardown.analyze(best.video_path, ad_id=best.ad_id, ad_name=best.ad_name,
                                cohort=best.cohort, metrics=best.metrics, client=client,
                                led=led, work_dir=Path(run_dir) / "teardown", log=log)
    except Exception as e:  # noqa: BLE001 -- a teardown must never break a run
        log(f"[teardown] failed for {best.ad_id} ({e!s:.120}); concepts will be ungrounded")
        return None


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


def run(*, data_path: str, run_id: str, strategy="top-roas", n_campaigns=5,
        mode="auto", images=4, image_provider="flux", formats=None,
        qa_retries=1, run_vlm=False, pro=False, refs=None, product_image=None,
        meta_account=None, ground_from_meta=True, meta_preset="last_30d",
        top_creatives=5, bottom_creatives=5, min_spend=100.0, style=None,
        no_logo=False, log=print) -> RunManifest:
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    led = Ledger(run_dir)

    ds = cs.load_dataset(data_path)
    subset = cs.select_campaigns(ds, strategy, n_campaigns)
    summary = cs.summarize(ds, subset)
    log(f"[1/4] {ds.account_name}: {len(subset)} campaigns via '{strategy}'")

    # Pull the real creative cohort from Meta (both tails) to ground generation.
    winner_refs, cohort = (_meta_cohort(meta_account, preset=meta_preset,
                                        top_n=top_creatives, bottom_n=bottom_creatives,
                                        min_spend=min_spend, run_dir=run_dir, log=log)
                           if meta_account else ([], []))
    if refs is None and winner_refs:
        refs = winner_refs                       # condition backgrounds on real winners
    # Grounding is ON by default now. The vision pass is the only place the brain ever
    # looks at what actually converted for this account, and it used to be off.
    ground_images = winner_refs if (ground_from_meta and winner_refs) else None

    client = _client()
    log("[2/4] generating brand kit...")
    kit, kit_cost = brand_brain.generate_brand_kit(client, summary, ground_images=ground_images)
    led.record("brandkit", "openrouter", config.TEXT_MODEL, kit_cost)
    _write_kit(run_dir, kit)

    # Structural teardown of the top winner's MP4 -> the template that conditions concepts.
    template = _teardown_winner(cohort, client=client, run_dir=run_dir, led=led,
                                log=log) if cohort else None
    if template:
        (run_dir / "template.json").write_text(template.model_dump_json(indent=2),
                                               encoding="utf-8")

    manifest = RunManifest(
        run_id=run_id, account_name=ds.account_name, select_strategy=strategy,
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
                  template=template, style=style, log=log)
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
                voiceover=False, client=None, log=print) -> AssetRecord:
    """Explicit, budget-gated single-clip smoke (Seedance i2v -> t2v fallback).
    Seeds from a TEXT-FREE background of this run so the clip matches the static ad.
    - `generate_audio` (default True): Seedance synced native audio (free).
    - `copy` (+ `kit`): burns the headline/CTA lower-third onto the clip.
    - `voiceover` (+ `client`, `kit`): brain writes a script -> fal TTS -> muxed on."""
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    seed = image
    if seed is None:                                   # prefer a text-free bg from this run
        cands = sorted(run_dir.glob("concept_*_bg.png"))
        seed = str(cands[0]) if cands else None
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
        try:
            import video_post
            final = video_post.add_copy_overlay(
                res["path"], run_dir / "video_captioned.mp4", copy, kit,
                fmt=aspect, logo_path=logo_path)
            res["path"] = final
            log(f"[video] copy overlay -> {final}")
        except Exception as e:  # noqa: BLE001 -- overlay is best-effort
            log(f"[video] copy overlay failed ({e!s:.100}); keeping raw clip")

    if voiceover and kit is not None and client is not None:   # script -> TTS -> mux
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

    led.finalize()
    return AssetRecord(kind="video", **_asset(res))


def _generate_ads(client, kit, summary, run_dir, manifest, led, *, images,
                  image_provider, formats, qa_retries, run_vlm, pro, refs=None,
                  product_image=None, template=None, style=None, log=print) -> None:
    """For each concept: a text-free background (QA-gated, regenerated on fail) ->
    per-format layout -> Pillow composite -> verify. The base format is the gate;
    other formats are outpainted from the accepted background, then composited.

    Conditioning: `product_image` -> Bria product-shot (real product into the scene,
    after a BiRefNet cutout); else `refs` (e.g. real winning creatives) -> FLUX.2 flex
    reference images; else a blind text-only background.

    `template` grounds the CONCEPTS in the measured structure of a real winner (T5);
    `style` grounds the pixels in a UGC capture aesthetic (T1)."""
    log(f"[4/4] {images} concepts x {len(formats)} format(s); QA retries={qa_retries}...")
    concepts, concepts_cost = brand_brain.generate_concepts(client, kit, summary, images,
                                                            template=template)
    led.record("concepts", "openrouter", config.TEXT_MODEL, concepts_cost)
    negative = prompt_builder.build_negative_prompt()
    base_fmt = formats[0]
    logo_path = kit.logo.asset_path

    # Resolve the conditioning mode once. Product cutout (background removed) makes
    # product-shot place the real product cleanly into the generated scene.
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

    for i, concept in enumerate(concepts, 1):
        layouts = layout_mod.plan_all_formats(concept.ad_copy, formats,
                                              has_logo=bool(logo_path))
        bg = run_dir / f"concept_{i:02d}_bg.png"
        base_spec = layouts[base_fmt]
        base_out = run_dir / f"ad_{i:02d}_{_slug(base_fmt)}.png"
        accepted = None

        for attempt in range(qa_retries + 1):
            # Background is TEXT-FREE: negative prompt suppresses text/logo. `bg_refs`
            # condition the scene on the real product / winning creatives (or None).
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
            manifest.qa_reports.append(report)
            if report.cost_usd:
                led.record("qa_vlm", "openrouter", config.VISION_MODEL,
                           report.cost_usd, concept=concept.title)
            if report.approved:
                accepted = comp
                break
            log(f"  - '{concept.title}' QA fail (try {attempt + 1}): {report.retry_hint}")

        if accepted is None:
            manifest.rejected.append(concept.title)
            log(f"  - '{concept.title}' REJECTED after {qa_retries + 1} tries -- not shipped")
            continue

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
            manifest.ads.append(comp)
            manifest.assets.append(AssetRecord(kind="image", concept_title=concept.title,
                                               provider="composite", model="pillow",
                                               path=comp.path, cost_usd=0.0))
            led.record("composite", "pillow", "-", 0.0,
                       concept=concept.title, fmt=fmt)         # free, but logged for transparency
        log(f"  - '{concept.title}' shipped in {len(formats)} format(s)")


def _asset(res: dict) -> dict:
    return {"provider": res["provider"], "model": res["model"], "path": res["path"],
            "cost_usd": res.get("cost_usd", 0.0), "fell_back_from": res.get("fell_back_from")}
