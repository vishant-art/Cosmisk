"""End-to-end pipeline with the brain + fal providers monkeypatched (zero spend).

Backgrounds/logo are faked as REAL PNGs so the new flow's compositor + verifier run
for real: concept -> text-free bg -> layout -> composite -> verify -> (outpaint).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

from ai_layer.creative import brand_brain
from ai_layer.creative import config
from ai_layer.creative import image_providers
from ai_layer.creative import logo as logo_mod
from ai_layer.creative import pipeline
from ai_layer.creative import story_brain
from ai_layer.creative import verifier


def _png(path, size=(1080, 1350), color="white"):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color).save(path)


def _patch_all(monkeypatch, brand_kit, concepts, bg_calls):
    monkeypatch.setattr(brand_brain, "generate_brand_kit",
                        lambda c, s, ground_images=None: (brand_kit, 0.0))
    # Concepts come from story_brain, grounded in three kinds of evidence: a teardown
    # template (what one winner DID), the learned prior (what a controlled variant test
    # PROVED), and the creative graph (what winners CORRELATE with vs losers).
    monkeypatch.setattr(story_brain, "generate_concepts",
                        lambda c, k, s, n, template=None, prior=None, graph=None, creator=None:
                        (concepts[:n], 0.0))

    def fake_logo(kit, out_path, **kw):
        _png(out_path, size=(400, 400), color="red")
        kit.logo.asset_path = str(out_path)
        return {"provider": "flux", "model": "m", "path": str(out_path), "cost_usd": 0.05}

    def fake_bg(prompt, out_path, **kw):
        bg_calls.append({"out": str(out_path), "refs": kw.get("refs"),
                         "primary": kw.get("primary")})
        _png(out_path)                                    # a valid text-free background
        return {"provider": "flux", "model": "m", "path": str(out_path), "cost_usd": 0.05}

    monkeypatch.setattr(logo_mod, "generate_logo", fake_logo)
    monkeypatch.setattr(image_providers, "generate_with_fallback", fake_bg)


def test_auto_mode_full_run(monkeypatch, tmp_path, envelope_path, brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    m = pipeline.run(data_path=envelope_path, run_id="r1", strategy="top-roas",
                     mode="auto", images=3, log=lambda *_: None)

    assert m.status == "complete"
    assert len(bg_calls) == 3                             # one background per concept
    imgs = [a for a in m.assets if a.kind == "image"]
    assert len(imgs) == 3 and len(m.ads) == 3            # one format (4:5) default
    assert m.rejected == []
    run_dir = tmp_path / "r1"
    assert (run_dir / "manifest.json").exists()
    assert (run_dir / "ad_01_4x5.png").exists()
    manifest = json.loads((run_dir / "manifest.json").read_text("utf-8"))
    assert manifest["brand_kit"]["brand_name"] == "Lumen"
    assert m.total_cost_usd > 0


def test_review_mode_stops_before_ads(monkeypatch, tmp_path, envelope_path,
                                      brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    m = pipeline.run(data_path=envelope_path, run_id="r2", mode="review",
                     images=4, log=lambda *_: None)

    assert m.status == "awaiting_review"
    assert bg_calls == [] and m.ads == []                # nothing generated past the kit/logo
    assert (tmp_path / "r2" / "brand_kit.json").exists()
    assert (tmp_path / "r2" / "logo.png").exists()
    saved = json.loads((tmp_path / "r2" / "brand_kit.json").read_text("utf-8"))
    assert saved["logo"]["asset_path"] is not None


def test_resume_generates_from_saved_kit(monkeypatch, tmp_path, envelope_path,
                                         brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)
    pipeline.run(data_path=envelope_path, run_id="r3", mode="review",
                 images=4, log=lambda *_: None)

    m = pipeline.resume(run_id="r3", data_path=envelope_path, images=2,
                        log=lambda *_: None)
    assert m.status == "complete"
    assert len(m.ads) == 2


def test_multiformat_outpaints_non_base(monkeypatch, tmp_path, envelope_path,
                                        brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)
    outpaints = []

    def fake_outpaint(src, out_path, *, fmt, **kw):
        outpaints.append(fmt)
        _png(out_path)
        return {"provider": "flux_fill", "model": "m", "path": str(out_path), "cost_usd": 0.05}

    monkeypatch.setattr(image_providers, "outpaint", fake_outpaint)

    m = pipeline.run(data_path=envelope_path, run_id="r4", mode="auto", images=2,
                     formats=["1:1", "4:5"], log=lambda *_: None)

    assert len(bg_calls) == 2                             # one base bg per concept
    assert outpaints == ["4:5", "4:5"]                   # non-base outpainted once per concept
    assert len(m.ads) == 4                               # 2 concepts x 2 formats
    assert (tmp_path / "r4" / "ad_01_1x1.png").exists()
    assert (tmp_path / "r4" / "ad_01_4x5.png").exists()


def test_qa_reject_excludes_concept(monkeypatch, tmp_path, envelope_path,
                                    brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    from ai_layer.creative.schemas import QAReport
    monkeypatch.setattr(verifier, "verify",
                        lambda *a, **k: QAReport(checks=[], verdict="fail",
                                                 retry_hint="forced"))

    m = pipeline.run(data_path=envelope_path, run_id="r5", mode="auto", images=2,
                     qa_retries=0, log=lambda *_: None)

    assert m.status == "complete"
    assert m.ads == []                                   # nothing passed QA
    assert len(m.rejected) == 2
    assert len(bg_calls) == 2                            # one attempt each (qa_retries=0)


def test_video_smoke_native_audio_and_voiceover(monkeypatch, tmp_path, brand_kit, copyset):
    from ai_layer.creative import video_providers, brand_brain, schemas
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    (tmp_path / "vid").mkdir()
    (tmp_path / "vid" / "concept_01_bg.png").write_bytes(b"BG")
    calls = {}

    def fake_vid(prompt, out_path, **kw):
        calls["generate_audio"] = kw.get("generate_audio")
        Path(out_path).write_bytes(b"V")
        return {"provider": "seedance", "model": "m", "path": str(out_path), "cost_usd": 1.5}

    monkeypatch.setattr(video_providers, "generate_with_fallback", fake_vid)
    monkeypatch.setattr(brand_brain, "generate_vo_script",
                        lambda c, k, hook, cta, sec: ("Shop the new collection now.", 0.001))
    monkeypatch.setattr(video_providers, "generate_voiceover",
                        lambda text, out, **kw: (Path(out).write_bytes(b"A"),
                                                 {"provider": "minimax-tts", "model": "m",
                                                  "path": str(out), "cost_usd": 0.003})[1])
    merged = {}
    monkeypatch.setattr(video_providers, "merge_audio_onto_video",
                        lambda v, a, out, **kw: (merged.update(done=True), Path(out).write_bytes(b"M"),
                                                 {"provider": "fal-ffmpeg", "model": "m",
                                                  "path": str(out), "cost_usd": 0.002})[2])

    rec = pipeline.video_smoke(run_id="vid", prompt="hero shot", duration=10,
                               voiceover=True, kit=brand_kit, client=object(),
                               log=lambda *_: None)
    assert calls["generate_audio"] is True               # native audio on by default
    assert merged.get("done") is True                    # voiceover muxed on
    assert rec.path.endswith("video_voiceover.mp4")      # final = the VO'd clip
    rows = (tmp_path / "vid" / "ledger.jsonl").read_text("utf-8")
    assert "voiceover" in rows and "audio_merge" in rows


def test_no_logo_skips_logo(monkeypatch, tmp_path, envelope_path, brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)
    logo_called = []
    monkeypatch.setattr(logo_mod, "generate_logo",
                        lambda *a, **k: logo_called.append(1))

    m = pipeline.run(data_path=envelope_path, run_id="rnl", mode="auto", images=1,
                     no_logo=True, log=lambda *_: None)
    assert logo_called == []                              # logo never generated
    assert not (tmp_path / "rnl" / "logo.png").exists()
    assert [a for a in m.assets if a.kind == "logo"] == []
    assert m.brand_kit.logo.asset_path is None


def test_refs_condition_the_background(monkeypatch, tmp_path, envelope_path, brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    pipeline.run(data_path=envelope_path, run_id="r6", mode="auto", images=1,
                 refs=["/winner1.png", "/winner2.png"], log=lambda *_: None)
    assert bg_calls[0]["refs"] == ["/winner1.png", "/winner2.png"]
    assert bg_calls[0]["primary"] == "flux"


def test_product_image_routes_through_product_shot(monkeypatch, tmp_path, envelope_path,
                                                   brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    def fake_cutout(src, out):
        _png(out, size=(300, 300))
        return {"provider": "birefnet", "model": "m", "path": str(out), "cost_usd": 0.0}

    monkeypatch.setattr(image_providers, "cutout", fake_cutout)

    pipeline.run(data_path=envelope_path, run_id="r7", mode="auto", images=1,
                 product_image="/my_product.jpg", log=lambda *_: None)
    assert bg_calls[0]["primary"] == "product"
    assert bg_calls[0]["refs"][0].endswith("product_cutout.png")     # the cutout, not raw


def test_meta_account_pulls_winner_refs(monkeypatch, tmp_path, envelope_path,
                                        brand_kit, concepts):
    """Grounding is ON by default and pulls BOTH ROAS tails; only WINNER stills are used
    as reference pixels (conditioning on a loser's pixels would be self-defeating), and
    both tails are recorded in pickings.json."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setenv("META_ACCESS_TOKEN", "tok")
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    from ai_layer import meta_creatives
    monkeypatch.setattr(meta_creatives, "fetch_creative_cohort",
                        lambda *a, **k: [
                            meta_creatives.CreativeAsset("a1", "Win", 6.0, "image", "/w1.png",
                                                         cohort="winner"),
                            meta_creatives.CreativeAsset("a2", "Lose", 0.4, "image", "/l1.png",
                                                         cohort="loser")])

    pipeline.run(data_path=envelope_path, run_id="r8", mode="auto", images=1,
                 meta_account="act_1", log=lambda *_: None)
    assert bg_calls[0]["refs"] == ["/w1.png"]            # winners condition; losers never do

    picks = json.loads((tmp_path / "r8" / "pickings.json").read_text("utf-8"))
    assert picks["grounded"] is True
    assert [w["ad_id"] for w in picks["winners"]] == ["a1"]
    assert [l["ad_id"] for l in picks["losers"]] == ["a2"]
