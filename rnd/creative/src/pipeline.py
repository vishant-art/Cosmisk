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
import sys
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
import brand_brain  # noqa: E402
import campaign_select as cs  # noqa: E402
import compositor  # noqa: E402
import config  # noqa: E402
import image_providers  # noqa: E402
import layout as layout_mod  # noqa: E402
import logo as logo_mod  # noqa: E402
import prompt_builder  # noqa: E402
import verifier  # noqa: E402
import video_providers  # noqa: E402
from ledger import Ledger  # noqa: E402
from schemas import AssetRecord, BrandKit, RunManifest  # noqa: E402

DEFAULT_FORMATS = ["4:5"]                # base shape; pass more to fan out (1:1/9:16/16:9)


def _slug(fmt: str) -> str:
    return fmt.replace(":", "x")


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
        qa_retries=1, run_vlm=False, pro=False, log=print) -> RunManifest:
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    led = Ledger(run_dir)

    ds = cs.load_dataset(data_path)
    subset = cs.select_campaigns(ds, strategy, n_campaigns)
    summary = cs.summarize(ds, subset)
    log(f"[1/4] {ds.account_name}: {len(subset)} campaigns via '{strategy}'")

    client = _client()
    log("[2/4] generating brand kit...")
    kit, kit_cost = brand_brain.generate_brand_kit(client, summary)
    led.record("brandkit", "openrouter", config.TEXT_MODEL, kit_cost)
    _write_kit(run_dir, kit)

    log("[3/4] generating logo...")
    logo_res = logo_mod.generate_logo(kit, run_dir / "logo.png",
                                      provider=image_provider, log=log)
    led.record("logo", logo_res["provider"], logo_res["model"],
               logo_res["cost_usd"], path=logo_res["path"])
    _write_kit(run_dir, kit)   # re-write now that logo.asset_path is set

    manifest = RunManifest(
        run_id=run_id, account_name=ds.account_name, select_strategy=strategy,
        mode=mode, status="awaiting_review", brand_kit=kit, formats=formats,
        assets=[AssetRecord(kind="logo", **_asset(logo_res))],
    )

    if mode == "review":
        manifest.total_cost_usd = led.total
        led.finalize()
        _write_manifest(run_dir, manifest)
        log(f"[review] kit + logo written to {run_dir}. Edit brand_kit.json then "
            f"resume with --resume {run_id}.")
        return manifest

    _generate_ads(client, kit, summary, run_dir, manifest, led, images=images,
                  image_provider=image_provider, formats=formats, qa_retries=qa_retries,
                  run_vlm=run_vlm, pro=pro, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    led.finalize()
    _write_manifest(run_dir, manifest)
    log(f"[done] {len(manifest.ads)} ads across {len(formats)} format(s), "
        f"{len(manifest.rejected)} rejected, est ${led.total:.3f} -> {run_dir}")
    return manifest


def resume(*, run_id: str, data_path: str, images=4, image_provider="flux",
           formats=None, qa_retries=1, run_vlm=False, pro=False, log=print) -> RunManifest:
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
                  run_vlm=run_vlm, pro=pro, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    led.finalize()
    _write_manifest(run_dir, manifest)
    log(f"[done] resumed: {len(manifest.ads)} ads, est ${led.total:.3f} -> {run_dir}")
    return manifest


def video_smoke(*, run_id: str, prompt: str, image=None, duration=5,
                resolution="720p", aspect="9:16", log=print) -> AssetRecord:
    """Explicit, budget-gated single-clip smoke (Seedance i2v -> t2v fallback).
    Seeds from a TEXT-FREE background of this run so the clip matches the static ad."""
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    seed = image
    if seed is None:                                   # prefer a text-free bg from this run
        cands = sorted(run_dir.glob("concept_*_bg.png"))
        seed = str(cands[0]) if cands else None
    res = video_providers.generate_with_fallback(
        prompt, run_dir / "video.mp4", image=seed, duration=duration,
        resolution=resolution, aspect=aspect, log=log)
    led.record("video", res["provider"], res["model"], res["cost_usd"],
               fell_back_from=res.get("fell_back_from"))
    log(f"[video] {res['provider']} ({'i2v' if seed else 't2v'}) -> {res['path']} "
        f"(est ${res['cost_usd']:.2f})")
    return AssetRecord(kind="video", **_asset(res))


def _generate_ads(client, kit, summary, run_dir, manifest, led, *, images,
                  image_provider, formats, qa_retries, run_vlm, pro, log) -> None:
    """For each concept: a text-free background (QA-gated, regenerated on fail) ->
    per-format layout -> Pillow composite -> verify. The base format is the gate;
    other formats are outpainted from the accepted background, then composited."""
    log(f"[4/4] {images} concepts x {len(formats)} format(s); QA retries={qa_retries}...")
    concepts, concepts_cost = brand_brain.generate_concepts(client, kit, summary, images)
    led.record("concepts", "openrouter", config.TEXT_MODEL, concepts_cost)
    negative = prompt_builder.build_negative_prompt()
    base_fmt = formats[0]
    logo_path = kit.logo.asset_path

    for i, concept in enumerate(concepts, 1):
        layouts = layout_mod.plan_all_formats(concept.ad_copy, formats,
                                              has_logo=bool(logo_path))
        bg = run_dir / f"concept_{i:02d}_bg.png"
        base_spec = layouts[base_fmt]
        base_out = run_dir / f"ad_{i:02d}_{_slug(base_fmt)}.png"
        accepted = None

        for attempt in range(qa_retries + 1):
            # Background is TEXT-FREE: no logo ref, negative prompt suppresses text/logo.
            prompt = prompt_builder.build_image_prompt(concept, kit, base_fmt)
            res = image_providers.generate_with_fallback(
                prompt, bg, primary=image_provider, refs=None, aspect=base_fmt,
                negative=negative, pro=pro, log=log)
            led.record("background", res["provider"], res["model"], res["cost_usd"],
                       concept=concept.title, fell_back_from=res.get("fell_back_from"))
            comp = compositor.compose(bg, base_spec, concept.ad_copy, base_out, kit=kit,
                                      logo_path=logo_path, concept_title=concept.title)
            report = verifier.verify(comp, base_spec, concept.ad_copy,
                                     client=client if run_vlm else None, run_vlm=run_vlm)
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
