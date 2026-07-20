"""fal-only image providers: arg shaping, refs, product-shot, fallback, outpaint.
fal_client / requests are lazily imported, so we inject fakes via sys.modules."""
from __future__ import annotations

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import config  # noqa: E402
import image_providers as ip  # noqa: E402


def _install_fake_fal(monkeypatch, captured, *, url="https://fal.media/img.png"):
    fal = types.ModuleType("fal_client")

    def subscribe(endpoint, arguments=None, with_logs=False):
        captured["endpoint"] = endpoint
        captured["args"] = arguments
        return {"images": [{"url": url}]}

    def upload_file(p):
        captured.setdefault("uploads", []).append(str(p))
        return f"https://fal.media/up/{Path(p).name}"

    fal.subscribe = subscribe
    fal.upload_file = upload_file
    monkeypatch.setitem(sys.modules, "fal_client", fal)

    req = types.ModuleType("requests")

    class _R:
        content = b"IMGBYTES"

    req.get = lambda url, timeout=None: _R()
    monkeypatch.setitem(sys.modules, "requests", req)


def test_flux_flex_is_default_and_shapes_call(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    res = ip.generate_image("a teal product scene", tmp_path / "a.png",
                            aspect="1:1", negative="text, logo")
    assert cap["endpoint"] == config.IMAGE_MODEL_FLEX
    assert cap["args"]["image_size"] == {"width": 1024, "height": 1024}
    # FLUX.2 ignores negatives, so the negative list is NOT folded into the prompt: naming
    # "text, logo" there would prime the model to draw them. Text-free comes from the scene.
    assert "Must NOT appear" not in cap["args"]["prompt"]
    assert "a teal product scene" in cap["args"]["prompt"]
    assert res["provider"] == "flux"
    assert (tmp_path / "a.png").read_bytes() == b"IMGBYTES"


def test_flux_uploads_refs_as_image_urls(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    logo = tmp_path / "logo.png"
    logo.write_bytes(b"L")
    ip.generate_image("scene", tmp_path / "b.png", refs=[logo])
    assert cap["args"]["image_urls"] == [f"https://fal.media/up/{logo.name}"]


def test_flux_cost_includes_reference_input_mp(monkeypatch, tmp_path):
    from PIL import Image
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    r1 = tmp_path / "r1.png"; Image.new("RGB", (1024, 1024), "white").save(r1)
    r2 = tmp_path / "r2.png"; Image.new("RGB", (1024, 1024), "white").save(r2)
    res = ip.generate_image("scene", tmp_path / "o.png", aspect="1:1", refs=[r1, r2])
    assert res["cost_usd"] == 0.15           # 1MP output + 2x 1MP refs = 3MP * $0.05
    bare = ip.generate_image("scene", tmp_path / "o2.png", aspect="1:1")
    assert bare["cost_usd"] == 0.05          # no refs -> output only


def test_pro_flag_routes_to_flux_pro(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    res = ip.generate_image("scene", tmp_path / "c.png", provider="flux", pro=True)
    assert cap["endpoint"] == config.IMAGE_MODEL_PRO
    assert res["provider"] == "flux_pro"


def test_product_shot_requires_a_ref(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    try:
        ip.generate_image("scene", tmp_path / "d.png", provider="product")
        assert False, "expected RuntimeError without a product ref"
    except RuntimeError as e:
        assert "product" in str(e).lower()


def test_product_shot_shapes_call(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    prod = tmp_path / "prod.png"
    prod.write_bytes(b"P")
    ip.generate_image("on a marble shelf, warm light", tmp_path / "e.png",
                      provider="product", refs=[prod])
    assert cap["endpoint"] == config.IMAGE_MODEL_PRODUCT
    assert cap["args"]["image_url"].endswith(prod.name)
    assert "marble shelf" in cap["args"]["scene_description"]


def test_outpaint_blur_extends_deterministically(monkeypatch, tmp_path):
    from PIL import Image
    cap = {}
    _install_fake_fal(monkeypatch, cap)              # installed but must NOT be called
    src = tmp_path / "bg.png"
    Image.new("RGB", (1024, 1024), "white").save(src)
    res = ip.outpaint(src, tmp_path / "story.png", fmt="9:16")       # default mode=blur
    assert res["provider"] == "reframe-blur" and res["cost_usd"] == 0.0
    assert "endpoint" not in cap                     # no fal call -> can't hallucinate text
    out = Image.open(tmp_path / "story.png")
    assert out.size == (1080, 1920)                  # target dims
    # the sharp source is centred and white; centre pixel stays white
    assert out.getpixel((540, 960)) == (255, 255, 255)


def test_outpaint_generative_mode_uses_mask(monkeypatch, tmp_path):
    from PIL import Image
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    src = tmp_path / "bg.png"
    Image.new("RGB", (1024, 1024), "white").save(src)
    ip.outpaint(src, tmp_path / "story.png", fmt="9:16", mode="generative")
    assert cap["endpoint"] == config.IMAGE_OUTPAINT_MODEL
    assert "image_url" in cap["args"] and "mask_url" in cap["args"]
    assert Image.open(tmp_path / "story_canvas.png").size == (1080, 1920)


def test_cutout_calls_birefnet(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    # birefnet returns {"image": {"url": ...}}
    monkeypatch.setitem(sys.modules, "fal_client", sys.modules["fal_client"])
    src = tmp_path / "prod.jpg"
    src.write_bytes(b"P")
    # override subscribe to return the birefnet shape
    fal = sys.modules["fal_client"]
    fal.subscribe = lambda endpoint, arguments=None, with_logs=False: (
        cap.__setitem__("endpoint", endpoint) or {"image": {"url": "https://fal.media/cut.png"}})
    res = ip.cutout(src, tmp_path / "cut.png")
    assert cap["endpoint"] == config.IMAGE_CUTOUT_MODEL
    assert (tmp_path / "cut.png").read_bytes() == b"IMGBYTES"
    assert res["provider"] == "birefnet"


def test_fallback_registered():
    assert ip._FALLBACK["flux"] == "flux_pro"
    assert ip._FALLBACK["product"] == "flux"


def test_fallback_on_primary_error(monkeypatch, tmp_path):
    def boom(*a, **k):
        raise RuntimeError("flex down")

    def ok(prompt, out_path, **k):
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"PNG")
        return {"provider": "flux_pro", "model": "m", "path": str(out_path), "cost_usd": 0.03}

    monkeypatch.setitem(ip._PROVIDERS, "flux", boom)
    monkeypatch.setitem(ip._PROVIDERS, "flux_pro", ok)
    res = ip.generate_with_fallback("p", tmp_path / "f.png", primary="flux", log=lambda *_: None)
    assert res["provider"] == "flux_pro"
    assert res["fell_back_from"] == "flux"
