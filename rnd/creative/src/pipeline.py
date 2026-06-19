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
import config  # noqa: E402
import image_providers  # noqa: E402
import logo as logo_mod  # noqa: E402
import prompt_builder  # noqa: E402
import video_providers  # noqa: E402
from ledger import Ledger  # noqa: E402
from schemas import AssetRecord, BrandKit, RunManifest  # noqa: E402


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
        mode="auto", images=4, image_provider="nanobanana", aspect="4:5",
        size="2K", pro=False, log=print) -> RunManifest:
    run_dir = config.OUTPUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    led = Ledger(run_dir)

    ds = cs.load_dataset(data_path)
    subset = cs.select_campaigns(ds, strategy, n_campaigns)
    summary = cs.summarize(ds, subset)
    log(f"[1/4] {ds.account_name}: {len(subset)} campaigns via '{strategy}'")

    client = _client()
    log("[2/4] generating brand kit...")
    kit = brand_brain.generate_brand_kit(client, summary)
    led.record("brandkit", "openrouter", config.TEXT_MODEL, 0.0)
    _write_kit(run_dir, kit)

    log("[3/4] generating logo...")
    logo_res = logo_mod.generate_logo(kit, run_dir / "logo.png",
                                      provider=image_provider, size=size, log=log)
    led.record("logo", logo_res["provider"], logo_res["model"],
               logo_res["cost_usd"], path=logo_res["path"])
    _write_kit(run_dir, kit)   # re-write now that logo.asset_path is set

    manifest = RunManifest(
        run_id=run_id, account_name=ds.account_name, select_strategy=strategy,
        mode=mode, status="awaiting_review", brand_kit=kit,
        assets=[AssetRecord(kind="logo", **_asset(logo_res))],
    )

    if mode == "review":
        manifest.total_cost_usd = led.total
        _write_manifest(run_dir, manifest)
        log(f"[review] kit + logo written to {run_dir}. Edit brand_kit.json then "
            f"resume with --resume {run_id}.")
        return manifest

    _generate_images(client, kit, summary, run_dir, manifest, led,
                     images=images, image_provider=image_provider, aspect=aspect,
                     size=size, pro=pro, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    _write_manifest(run_dir, manifest)
    log(f"[done] {len([a for a in manifest.assets if a.kind=='image'])} images, "
        f"est ${led.total:.3f} -> {run_dir}")
    return manifest


def resume(*, run_id: str, data_path: str, images=4, image_provider="nanobanana",
           aspect="4:5", size="2K", pro=False, log=print) -> RunManifest:
    """Generate images from a (possibly user-edited) brand_kit.json in output/<run>."""
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
                           status="awaiting_review", brand_kit=kit)
    if logo_path.exists():
        manifest.assets.append(AssetRecord(kind="logo", provider="?",
                               model="?", path=str(logo_path)))

    client = _client()
    _generate_images(client, kit, summary, run_dir, manifest, led,
                     images=images, image_provider=image_provider, aspect=aspect,
                     size=size, pro=pro, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    _write_manifest(run_dir, manifest)
    log(f"[done] resumed: {images} images, est ${led.total:.3f} -> {run_dir}")
    return manifest


def video_smoke(*, run_id: str, prompt: str, provider="veo", duration=8,
                resolution="720p", aspect="9:16", log=print) -> AssetRecord:
    """Explicit, budget-gated single-clip smoke (Veo -> Seedance)."""
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    res = video_providers.generate_with_fallback(
        prompt, run_dir / "video.mp4", primary=provider, duration=duration,
        resolution=resolution, aspect=aspect, log=log)
    led.record("video", res["provider"], res["model"], res["cost_usd"],
               fell_back_from=res.get("fell_back_from"))
    log(f"[video] {res['provider']} -> {res['path']} (est ${res['cost_usd']:.2f})")
    return AssetRecord(kind="video", **_asset(res))


def _generate_images(client, kit, summary, run_dir, manifest, led, *, images,
                     image_provider, aspect, size, pro, log) -> None:
    log(f"[4/4] generating {images} concepts + images...")
    concepts = brand_brain.generate_concepts(client, kit, summary, images)
    led.record("concepts", "openrouter", config.TEXT_MODEL, 0.0)
    # Ads are generated WITHOUT any logo baked in -- the logo (and copy) get overlaid
    # later in post, so we pass no reference image AND a negative prompt that suppresses
    # any text/logo/watermark. The logo asset is still saved in the kit for that post step.
    refs = None
    negative = prompt_builder.build_negative_prompt()
    for i, concept in enumerate(concepts, 1):
        prompt = prompt_builder.build_image_prompt(concept, kit, aspect)
        out = run_dir / f"ad_{i:02d}.png"
        res = image_providers.generate_with_fallback(
            prompt, out, primary=image_provider, refs=refs, aspect=aspect,
            size=size, pro=pro, negative=negative, log=log)
        led.record("image", res["provider"], res["model"], res["cost_usd"],
                   concept=concept.title, fell_back_from=res.get("fell_back_from"))
        manifest.assets.append(AssetRecord(kind="image", concept_title=concept.title,
                                           **_asset(res)))
        log(f"  - ad_{i:02d} '{concept.title}' via {res['provider']}")


def _asset(res: dict) -> dict:
    return {"provider": res["provider"], "model": res["model"], "path": res["path"],
            "cost_usd": res.get("cost_usd", 0.0), "fell_back_from": res.get("fell_back_from")}
