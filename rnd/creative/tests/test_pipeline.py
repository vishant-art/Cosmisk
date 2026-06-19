"""End-to-end pipeline with the brain + providers monkeypatched (zero spend).

Proves: auto mode runs through to N images and writes the manifest/kit/ledger;
review mode stops before any image is generated.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import brand_brain  # noqa: E402
import config  # noqa: E402
import image_providers  # noqa: E402
import logo as logo_mod  # noqa: E402
import pipeline  # noqa: E402
from schemas import AdConcept  # noqa: E402


def _patch_all(monkeypatch, brand_kit, concepts, calls):
    monkeypatch.setattr(brand_brain, "generate_brand_kit", lambda c, s: brand_kit)
    monkeypatch.setattr(brand_brain, "generate_concepts",
                        lambda c, k, s, n: concepts[:n])

    def fake_logo(kit, out_path, **kw):
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"PNG")
        kit.logo.asset_path = str(out_path)
        return {"provider": "nanobanana", "model": "m", "path": str(out_path), "cost_usd": 0.1}

    def fake_img(prompt, out_path, **kw):
        calls.append(out_path)
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"PNG")
        return {"provider": "nanobanana", "model": "m", "path": str(out_path), "cost_usd": 0.1}

    monkeypatch.setattr(logo_mod, "generate_logo", fake_logo)
    monkeypatch.setattr(image_providers, "generate_with_fallback", fake_img)


def test_auto_mode_full_run(monkeypatch, tmp_path, envelope_path, brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    calls = []
    _patch_all(monkeypatch, brand_kit, concepts, calls)

    m = pipeline.run(data_path=envelope_path, run_id="r1", strategy="top-roas",
                     mode="auto", images=3, log=lambda *_: None)

    assert m.status == "complete"
    imgs = [a for a in m.assets if a.kind == "image"]
    assert len(imgs) == 3 and len(calls) == 3
    run_dir = tmp_path / "r1"
    assert (run_dir / "manifest.json").exists()
    assert (run_dir / "brand_kit.json").exists()
    assert (run_dir / "ledger.jsonl").exists()
    manifest = json.loads((run_dir / "manifest.json").read_text("utf-8"))
    assert manifest["brand_kit"]["brand_name"] == "Lumen"
    assert m.total_cost_usd > 0


def test_review_mode_stops_before_images(monkeypatch, tmp_path, envelope_path,
                                         brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    calls = []
    _patch_all(monkeypatch, brand_kit, concepts, calls)

    m = pipeline.run(data_path=envelope_path, run_id="r2", mode="review",
                     images=4, log=lambda *_: None)

    assert m.status == "awaiting_review"
    assert calls == []                                    # no images generated
    assert [a for a in m.assets if a.kind == "image"] == []
    assert (tmp_path / "r2" / "brand_kit.json").exists()
    assert (tmp_path / "r2" / "logo.png").exists()
    # the on-disk kit reflects the generated logo path (not null)
    saved = json.loads((tmp_path / "r2" / "brand_kit.json").read_text("utf-8"))
    assert saved["logo"]["asset_path"] is not None


def test_resume_generates_from_saved_kit(monkeypatch, tmp_path, envelope_path,
                                         brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    calls = []
    _patch_all(monkeypatch, brand_kit, concepts, calls)
    pipeline.run(data_path=envelope_path, run_id="r3", mode="review",
                 images=4, log=lambda *_: None)

    m = pipeline.resume(run_id="r3", data_path=envelope_path, images=2,
                        log=lambda *_: None)
    assert m.status == "complete"
    assert len([a for a in m.assets if a.kind == "image"]) == 2
