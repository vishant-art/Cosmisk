"""Provider selection + fallback-on-error (no SDKs touched)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import image_providers as ip  # noqa: E402


def _fake(provider, model):
    def fn(prompt, out_path, *, refs=None, aspect="4:5", size="2K", pro=False):
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"PNG")
        return {"provider": provider, "model": model, "path": str(out_path), "cost_usd": 0.1}
    return fn


def test_generate_image_uses_named_provider(monkeypatch, tmp_path):
    monkeypatch.setitem(ip._PROVIDERS, "flux", _fake("flux", "fal-ai/flux-2-pro"))
    res = ip.generate_image("p", tmp_path / "a.png", provider="flux")
    assert res["provider"] == "flux"
    assert (tmp_path / "a.png").exists()


def test_cloudflare_decodes_and_saves(monkeypatch, tmp_path):
    import base64
    import config
    import requests

    monkeypatch.setattr(config, "CLOUDFLARE_ACCOUNT_ID", "acct")
    monkeypatch.setattr(config, "CLOUDFLARE_API_TOKEN", "tok")

    captured = {}

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {"result": {"image": base64.b64encode(b"PNG").decode()}}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return FakeResp()

    monkeypatch.setattr(requests, "post", fake_post)

    res = ip.generate_image("a teal product shot", tmp_path / "cf.png", provider="cloudflare")
    assert res["provider"] == "cloudflare"
    assert res["cost_usd"] == 0.0
    assert (tmp_path / "cf.png").read_bytes() == b"PNG"
    assert "acct" in captured["url"] and config.IMAGE_FREE_MODEL in captured["url"]
    assert captured["json"]["prompt"] == "a teal product shot"


def test_cloudflare_requires_keys(monkeypatch, tmp_path):
    import config
    monkeypatch.setattr(config, "CLOUDFLARE_ACCOUNT_ID", None)
    monkeypatch.setattr(config, "CLOUDFLARE_API_TOKEN", None)
    try:
        ip.generate_image("p", tmp_path / "x.png", provider="cloudflare")
        assert False, "expected RuntimeError when keys are missing"
    except RuntimeError as e:
        assert "CLOUDFLARE" in str(e)


def test_cloudflare_fallback_registered():
    assert ip._FALLBACK["cloudflare"] == "flux"


def test_fallback_on_primary_error(monkeypatch, tmp_path):
    def boom(*a, **k):
        raise RuntimeError("nano down")
    monkeypatch.setitem(ip._PROVIDERS, "nanobanana", boom)
    monkeypatch.setitem(ip._PROVIDERS, "flux", _fake("flux", "fal-ai/flux-2-pro"))

    res = ip.generate_with_fallback("p", tmp_path / "b.png", primary="nanobanana",
                                    log=lambda *_: None)
    assert res["provider"] == "flux"
    assert res["fell_back_from"] == "nanobanana"
    assert (tmp_path / "b.png").exists()
