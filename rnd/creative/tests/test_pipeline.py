"""End-to-end pipeline with the brain + fal providers monkeypatched (zero spend).

Backgrounds/logo are faked as REAL PNGs so the new flow's compositor + verifier run
for real: concept -> text-free bg -> layout -> composite -> verify -> (outpaint).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import brand_brain  # noqa: E402
import story_brain  # noqa: E402
import config  # noqa: E402
import image_providers  # noqa: E402
import logo as logo_mod  # noqa: E402
import pipeline  # noqa: E402
import verifier  # noqa: E402


def _png(path, size=(1080, 1350), color="white"):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color).save(path)


def _patch_all(monkeypatch, brand_kit, concepts, bg_calls):
    monkeypatch.setattr(brand_brain, "generate_brand_kit",
                        lambda c, s, ground_images=None: (brand_kit, 0.0))
    monkeypatch.setattr(story_brain, "generate_concepts",
                        lambda c, k, s, n, template=None: (concepts[:n], 0.0))

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

    from schemas import QAReport
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
    import video_providers, story_brain, schemas
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    (tmp_path / "vid").mkdir()
    (tmp_path / "vid" / "concept_01_bg.png").write_bytes(b"BG")
    calls = {}

    def fake_vid(prompt, out_path, **kw):
        calls["generate_audio"] = kw.get("generate_audio")
        Path(out_path).write_bytes(b"V")
        return {"provider": "seedance", "model": "m", "path": str(out_path), "cost_usd": 1.5}

    monkeypatch.setattr(video_providers, "generate_with_fallback", fake_vid)
    monkeypatch.setattr(story_brain, "generate_vo_script",
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
                               voiceover=True, captions=False, kit=brand_kit,
                               client=object(), log=lambda *_: None)
    assert calls["generate_audio"] is True               # native audio on by default
    assert merged.get("done") is True                    # voiceover muxed on
    assert rec.path.endswith("video_voiceover.mp4")      # final = the VO'd clip
    rows = (tmp_path / "vid" / "ledger.jsonl").read_text("utf-8")
    assert "voiceover" in rows and "audio_merge" in rows


def test_qa_video_verifies_the_clip_that_ships(monkeypatch, tmp_path, synth_video):
    """The most post-processed clip wins. Verifying an earlier intermediate would miss
    every defect the editor introduced, which is most of the ones worth catching."""
    import shutil

    import verifier_video
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "q1"
    run.mkdir()
    shutil.copy(synth_video, run / "video.mp4")
    shutil.copy(synth_video, run / "video_captioned.mp4")

    board = {"target_seconds": 3.0, "render_mode": "independent", "shots": [
        {"purpose": p, "duration_s": 1.0, "camera": "selfie", "subject": "s",
         "product_visible": "absent", "motion": "", "dialogue": None}
        for p in ("hook", "demo", "cta")]}
    (run / "storyboard.json").write_text(json.dumps(board), encoding="utf-8")

    seen = {}
    real = verifier_video.verify
    monkeypatch.setattr(verifier_video, "verify",
                        lambda clip, *a, **k: seen.update(clip=str(clip)) or real(clip, *a, **k))

    report = pipeline.qa_video(run_id="q1", strict=False, log=lambda *_: None)
    assert seen["clip"].endswith("video_captioned.mp4")
    assert (run / "qa_report.json").exists()
    assert report.verdict in ("pass", "fail")


def _sine_wav(path, seconds=3):
    import subprocess

    import imageio_ffmpeg
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-f", "lavfi", "-i",
                    f"sine=frequency=220:duration={seconds}", "-ar", "44100", "-ac", "1",
                    str(path)], capture_output=True, check=True)
    return str(path)


def test_finish_timeline_muxes_vo_then_sfx_then_captions(monkeypatch, tmp_path,
                                                         brand_kit, synth_video):
    """One voiceover across the WHOLE timeline, muxed once. Splicing per-shot audio at
    every cut produces exactly the seams the cuts were meant to hide."""
    import shutil

    import video_providers
    from schemas import Script, ScriptBeat, Shot, Storyboard

    run = tmp_path / "f1"
    run.mkdir()
    shutil.copy(synth_video, run / "timeline.mp4")
    script = Script(beats=[ScriptBeat(purpose="hook", text="one two three"),
                           ScriptBeat(purpose="cta", text="shop now")])
    board = Storyboard(target_seconds=3.0, shots=[
        Shot(purpose=p, duration_s=1.5, camera="selfie", subject="s",
             product_visible="absent") for p in ("hook", "cta")])

    spoken = {}

    def fake_tts(text, out, **kw):
        spoken["text"] = text
        return {"provider": "tts", "model": "m", "path": _sine_wav(out, 3),
                "cost_usd": 0.02}

    def fake_merge(video, audio, out, **kw):
        import subprocess

        import imageio_ffmpeg
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", str(video),
                        "-i", str(audio), "-map", "0:v", "-map", "1:a", "-shortest",
                        "-c:v", "copy", "-c:a", "aac", str(out)],
                       capture_output=True, check=True)
        return {"provider": "mux", "model": "m", "path": str(out), "cost_usd": 0.004}

    def fake_asr(audio, **kw):
        words = spoken["text"].split()
        step = 2.5 / len(words)
        return ([{"text": w, "start": i * step, "end": i * step + step * 0.8}
                 for i, w in enumerate(words)], 0.0002)

    monkeypatch.setattr(video_providers, "generate_voiceover", fake_tts)
    monkeypatch.setattr(video_providers, "merge_audio_onto_video", fake_merge)
    monkeypatch.setattr(video_providers, "transcribe_words", fake_asr)

    out = pipeline.finish_timeline(run / "timeline.mp4", board, script, brand_kit, run,
                                   log=lambda *_: None)
    assert Path(out).name == "video_captioned.mp4"
    assert spoken["text"] == "one two three shop now"    # the Script's spoken() text
    import editor
    assert editor.probe(out)["has_audio"] is True


def test_a_silent_timeline_is_still_an_ad(monkeypatch, tmp_path, brand_kit, synth_video):
    """A TTS outage must not lose the render we already paid for."""
    import shutil

    import video_providers
    from schemas import Script, ScriptBeat, Shot, Storyboard

    run = tmp_path / "f2"
    run.mkdir()
    shutil.copy(synth_video, run / "timeline.mp4")

    def boom(*a, **k):
        raise RuntimeError("fal is down")
    monkeypatch.setattr(video_providers, "generate_voiceover", boom)

    script = Script(beats=[ScriptBeat(purpose="hook", text="hi")])
    board = Storyboard(target_seconds=3.0, shots=[
        Shot(purpose="hook", duration_s=3.0, camera="selfie", subject="s",
             product_visible="absent")])
    logs = []
    out = pipeline.finish_timeline(run / "timeline.mp4", board, script, brand_kit, run,
                                   log=logs.append)
    assert Path(out).exists()
    assert any("timeline stays silent" in ln for ln in logs)


def test_make_variants_cuts_a_finished_timeline_for_free(monkeypatch, tmp_path,
                                                         synth_video):
    """The $0 edit path (T10): one rendered clip, aesthetic-graded N ways, no model call."""
    import shutil

    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "v1"
    run.mkdir()
    shutil.copy(synth_video, run / "timeline.mp4")

    vset, record = pipeline.make_variants(run_id="v1", axis="aesthetic",
                                          values=["clean", "film_grain", "warm_clip"],
                                          log=lambda *_: None)
    assert vset.axis == "aesthetic" and len(vset.variants) == 3
    loaded = json.loads(Path(record).read_text("utf-8"))
    assert all(Path(p).exists() for p in loaded["artifacts"].values())


def test_make_variants_hook_writes_matched_scripts(monkeypatch, tmp_path, brand_kit):
    """The structural path: N scripts that differ only in the hook, written for the
    operator to render separately (each is a full render, not spent implicitly)."""
    import story_brain

    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "v2"
    run.mkdir()
    (run / "brand_kit.json").write_text(brand_kit.model_dump_json(), encoding="utf-8")
    base = {"beats": [{"purpose": "hook", "text": "base hook"},
                      {"purpose": "cta", "text": "shop now"}]}
    (run / "script.json").write_text(json.dumps(base), encoding="utf-8")

    monkeypatch.setattr(story_brain, "revary_hook",
                        lambda c, k, s, ht, **kw: (
                            s.model_copy(update={"beats": [
                                s.beats[0].model_copy(update={"text": f"{ht} hook"}),
                                *s.beats[1:]]}), 0.001))
    monkeypatch.setattr(pipeline, "_client", lambda: object())

    vset, record = pipeline.make_variants(run_id="v2", axis="hook_type",
                                          values=["question", "bold_claim"],
                                          log=lambda *_: None)
    assert vset.axis == "hook_type"
    loaded = json.loads(Path(record).read_text("utf-8"))
    assert "render each" in loaded["meta"]["note"]
    for p in loaded["artifacts"].values():
        assert Path(p).exists() and p.endswith(".script.json")


def test_qa_video_needs_a_storyboard(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    (tmp_path / "q2").mkdir()
    with pytest.raises(FileNotFoundError, match="storyboard"):
        pipeline.qa_video(run_id="q2", log=lambda *_: None)


def _stub_voiceover_chain(monkeypatch, tmp_path, script="Shop the new collection now."):
    """Stub Seedance + TTS + the fal muxer. The muxer hands back a REAL clip so the
    editor's ffmpeg pass has something to burn onto."""
    import shutil

    import story_brain
    import video_providers
    src = tmp_path / "src.mp4"

    def fake_vid(prompt, out_path, **kw):
        shutil.copy(src, out_path)
        return {"provider": "seedance", "model": "m", "path": str(out_path), "cost_usd": 1.5}

    monkeypatch.setattr(video_providers, "generate_with_fallback", fake_vid)
    monkeypatch.setattr(story_brain, "generate_vo_script", lambda *a, **k: (script, 0.001))
    monkeypatch.setattr(video_providers, "generate_voiceover",
                        lambda text, out, **kw: (Path(out).write_bytes(b"A"),
                                                 {"provider": "minimax-tts", "model": "m",
                                                  "path": str(out), "cost_usd": 0.003})[1])
    monkeypatch.setattr(video_providers, "merge_audio_onto_video",
                        lambda v, a, out, **kw: (shutil.copy(v, out),
                                                 {"provider": "fal-ffmpeg", "model": "m",
                                                  "path": str(out), "cost_usd": 0.002})[1])
    return src


def test_captions_are_burned_over_the_voiceover(monkeypatch, tmp_path, brand_kit,
                                                synth_video):
    """The end-to-end T3 path with real ffmpeg: script -> TTS -> mux -> word-timed burn."""
    import shutil

    import video_providers
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    src = _stub_voiceover_chain(monkeypatch, tmp_path, "hello there friend")
    shutil.copy(synth_video, src)

    monkeypatch.setattr(video_providers, "transcribe_words", lambda audio, **kw: (
        [{"text": w, "start": i * 0.4, "end": i * 0.4 + 0.3}
         for i, w in enumerate("hello there friend".split())], 0.0001))

    rec = pipeline.video_smoke(run_id="cap", prompt="p", duration=3, voiceover=True,
                               kit=brand_kit, client=object(), log=lambda *_: None)

    assert rec.path.endswith("video_captioned.mp4")
    assert Path(rec.path).exists()
    rows = (tmp_path / "cap" / "ledger.jsonl").read_text("utf-8")
    assert '"op": "asr"' in rows                     # the Whisper call is billed


def test_drift_gate_ships_the_clip_uncaptioned_rather_than_wrong(monkeypatch, tmp_path,
                                                                 brand_kit, synth_video):
    """Fail-closed. A clip whose captions contradict its audio is worse than one with
    no captions, so the gate degrades to the muxed clip instead of raising."""
    import shutil

    import video_providers
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    src = _stub_voiceover_chain(monkeypatch, tmp_path, "shop the new collection")
    shutil.copy(synth_video, src)

    monkeypatch.setattr(video_providers, "transcribe_words", lambda audio, **kw: (
        [{"text": w, "start": i * 0.4, "end": i * 0.4 + 0.3}
         for i, w in enumerate("entirely unrelated audio track".split())], 0.0001))

    logs = []
    rec = pipeline.video_smoke(run_id="drift", prompt="p", duration=3, voiceover=True,
                               kit=brand_kit, client=object(), log=logs.append)

    assert rec.path.endswith("video_voiceover.mp4")          # captions never burned
    assert not (tmp_path / "drift" / "video_captioned.mp4").exists()
    assert any("REFUSED by the drift gate" in ln for ln in logs)


def test_a_caption_failure_is_not_reported_as_a_voiceover_failure(monkeypatch, tmp_path,
                                                                  brand_kit, synth_video):
    """These used to share one except block, which made the drift gate invisible and
    blamed the TTS for an ffmpeg problem."""
    import shutil

    import video_providers
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    src = _stub_voiceover_chain(monkeypatch, tmp_path)
    shutil.copy(synth_video, src)

    def _boom(*a, **k):
        raise RuntimeError("fal is down")
    monkeypatch.setattr(video_providers, "transcribe_words", _boom)

    logs = []
    rec = pipeline.video_smoke(run_id="cfail", prompt="p", duration=3, voiceover=True,
                               kit=brand_kit, client=object(), log=logs.append)

    assert rec.path.endswith("video_voiceover.mp4")          # the VO survived
    assert any("[captions] burn failed" in ln for ln in logs)
    assert not any("voiceover failed" in ln for ln in logs)


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
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setenv("META_ACCESS_TOKEN", "tok")
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    import meta_creatives
    monkeypatch.setattr(meta_creatives, "fetch_creative_cohort",
                        lambda *a, **k: [
                            meta_creatives.CreativeAsset("a1", "Win", 6.0, "image", "/w1.png"),
                            meta_creatives.CreativeAsset("a2", "Win2", 5.0, "video", None)])

    pipeline.run(data_path=envelope_path, run_id="r8", mode="auto", images=1,
                 meta_account="act_1", log=lambda *_: None)
    assert bg_calls[0]["refs"] == ["/w1.png"]            # only the usable image winner


def test_losers_never_condition_the_background(monkeypatch, tmp_path, envelope_path,
                                               brand_kit, concepts):
    """The cohort carries losers so the teardown can learn from the contrast. Their
    pixels must never reach FLUX: we want to generate what won, not what lost."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setenv("META_ACCESS_TOKEN", "tok")
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    import meta_creatives
    win = meta_creatives.CreativeAsset("a1", "Win", 6.0, "image", "/w1.png",
                                       cohort="winner")
    lose = meta_creatives.CreativeAsset("a2", "Lose", 0.3, "image", "/l1.png",
                                        cohort="loser")
    monkeypatch.setattr(meta_creatives, "fetch_creative_cohort", lambda *a, **k: [win, lose])

    pipeline.run(data_path=envelope_path, run_id="r9", mode="auto", images=1,
                 meta_account="act_1", log=lambda *_: None)
    assert bg_calls[0]["refs"] == ["/w1.png"]
    assert "/l1.png" not in (bg_calls[0]["refs"] or [])


def test_teardown_runs_only_when_a_winner_has_video(monkeypatch, tmp_path, envelope_path,
                                                    brand_kit, concepts):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    monkeypatch.setenv("META_ACCESS_TOKEN", "tok")
    bg_calls = []
    _patch_all(monkeypatch, brand_kit, concepts, bg_calls)

    import meta_creatives
    import teardown as td
    calls = []
    monkeypatch.setattr(meta_creatives, "fetch_creative_cohort", lambda *a, **k: [
        meta_creatives.CreativeAsset("a1", "Win", 6.0, "image", "/w1.png", cohort="winner")])
    monkeypatch.setattr(td, "analyze", lambda *a, **k: calls.append(a) or None)

    pipeline.run(data_path=envelope_path, run_id="r10", mode="auto", images=1,
                 meta_account="act_1", log=lambda *_: None)
    assert calls == [], "no winner had an MP4; teardown must not be attempted"
