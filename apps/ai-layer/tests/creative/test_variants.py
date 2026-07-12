"""Structural variants (T10): hold everything fixed, vary one axis.

The point of these tests is the EXPERIMENT DISCIPLINE, not the plumbing. A variant set is
only useful if a performance difference between its members is attributable to a single
named cause, so the tests assert exactly that: siblings differ on one axis and nothing
else, the set rejects mixed axes and duplicate values, and every variant carries the tag
that lets T11 join it back to a real ad's outcome.

The edit-axis tests run real ffmpeg (one render, cut N ways, $0 model spend). The
structural-axis tests use a fake client.
"""
from __future__ import annotations

import json

from pathlib import Path

import numpy as np
import pytest

from ai_layer.creative import editor  # noqa: E402
from ai_layer.creative import story_brain  # noqa: E402
from ai_layer.creative import variants  # noqa: E402
from ai_layer.creative.schemas import Script, ScriptBeat, Variant, VariantSet  # noqa: E402


# --- the experiment discipline (schema) --------------------------------------------------

def test_a_variant_id_is_a_stable_slug_of_base_axis_value():
    """Durable, because it is the key that joins a shipped ad's outcome back to (axis,
    value). A uuid would sever that join."""
    v = variants.build_variant("run7", "hook_type", "pattern_interrupt")
    assert v.variant_id == "run7__hook_type__pattern_interrupt"
    assert v.kind == "structural"


def test_kind_is_derived_from_the_axis_never_passed():
    assert variants.build_variant("r", "caption_style", "bottom_white").kind == "edit"
    assert variants.build_variant("r", "aesthetic", "clean").kind == "edit"


def test_a_set_varying_two_axes_is_rejected():
    """A difference across two axes is attributable to neither. This is the whole reason
    the set exists rather than a list of ideas."""
    a = variants.build_variant("r", "hook_type", "question")
    b = variants.build_variant("r", "aesthetic", "clean")
    with pytest.raises(Exception, match="ONE axis"):
        VariantSet(base_id="r", axis="hook_type", variants=[a, b])


def test_a_set_with_duplicate_values_is_rejected():
    """Two identical variants are one datapoint wearing two labels."""
    a = variants.build_variant("r", "hook_type", "question")
    with pytest.raises(Exception, match="distinct"):
        VariantSet(base_id="r", axis="hook_type", variants=[a, a])


def test_a_variant_cannot_mislabel_an_edit_axis_as_structural():
    with pytest.raises(Exception, match="is edit"):
        Variant(variant_id="x", base_id="r", axis="aesthetic", value="clean",
                kind="structural")


def test_a_set_needs_at_least_two_members():
    a = variants.build_variant("r", "hook_type", "question")
    with pytest.raises(Exception):
        VariantSet(base_id="r", axis="hook_type", variants=[a])


# --- structural: hook variants -----------------------------------------------------------

def _base_script():
    return Script(beats=[
        ScriptBeat(purpose="hook", text="I genuinely thought this was a scam."),
        ScriptBeat(purpose="problem", text="My hallway was always dark."),
        ScriptBeat(purpose="demo", text="You just twist it and it warms up."),
        ScriptBeat(purpose="cta", text="Shop the new collection."),
    ])


class _RehookClient:
    """Returns a hook line that names the requested approach, and records the prompt."""
    def __init__(self):
        self.seen = []
        outer = self

        class _C:
            @staticmethod
            def create(**kw):
                system = kw["messages"][0]["content"]
                outer.seen.append(system)
                # echo the approach token so the test can tell variants apart
                approach = system.split("APPROACH (")[1].split(")")[0]
                text = f"A {approach} styled opening line."

                class R:
                    choices = [type("X", (), {"message": type("M", (), {
                        "content": json.dumps({"text": text})})})]
                return R()
        self.chat = type("Chat", (), {"completions": _C()})()


def test_revary_hook_changes_only_the_hook(brand_kit):
    base = _base_script()
    out, _cost = story_brain.revary_hook(_RehookClient(), brand_kit, base, "bold_claim")
    assert out.beats[0].purpose == "hook"
    assert out.beats[0].text != base.beats[0].text        # the hook changed
    assert out.beats[1:] == base.beats[1:]                # everything else is identical


def test_revary_hook_names_the_requested_approach_in_the_prompt(brand_kit):
    c = _RehookClient()
    story_brain.revary_hook(c, brand_kit, _base_script(), "pattern_interrupt")
    assert "APPROACH (pattern_interrupt)" in c.seen[0]
    assert "stops the scroll" in c.seen[0]                 # its guidance


def test_revary_hook_rejects_an_off_taxonomy_hook_type(brand_kit):
    with pytest.raises(Exception, match="not one of"):
        story_brain.revary_hook(_RehookClient(), brand_kit, _base_script(), "vibes")


def test_hook_variant_set_produces_matched_scripts(brand_kit):
    vset, scripts, cost = variants.hook_variant_set(
        _RehookClient(), brand_kit, _base_script(),
        ["pattern_interrupt", "question", "bold_claim"], base_id="run1")

    assert vset.axis == "hook_type" and len(vset.variants) == 3
    assert len(scripts) == 3

    # every variant shares beats 2..K with every other; only the hook differs
    tails = [tuple(s.beats[1:]) for s in scripts.values()]
    assert all(t == tails[0] for t in tails), "the non-hook beats must be identical"
    hooks = [s.beats[0].text for s in scripts.values()]
    assert len(set(hooks)) == 3, "the hooks must actually differ"


def test_hook_variant_set_needs_at_least_two_hooks(brand_kit):
    with pytest.raises(ValueError, match="at least two"):
        variants.hook_variant_set(_RehookClient(), brand_kit, _base_script(),
                                  ["question"], base_id="r")


# --- edit: caption-style variants (real ffmpeg, one render cut N ways) -------------------

def _smooth(seed, n=192):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    img = 60 + 120 * (xx / n) + 40 * np.sin(yy / n * 3.14 * (1 + seed * 0.3))
    for _ in range(3):
        cy, cx, r = rng.uniform(0, n), rng.uniform(0, n), rng.uniform(n * 0.1, n * 0.3)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        img = img + 70 * np.exp(-(d / r) ** 2) * rng.choice([-1, 1])
    img = np.clip(img, 0, 255).astype(np.uint8)
    return np.dstack([img, np.roll(img, 7, 0), np.roll(img, 13, 1)])


def _clip(path, seconds=3.0, size=(192, 192)):
    import imageio_ffmpeg
    base = _smooth(1)
    w = imageio_ffmpeg.write_frames(str(path), size, fps=10, macro_block_size=1)
    w.send(None)
    for i in range(int(seconds * 10)):
        w.send(np.roll(base, i * 3, axis=1).tobytes())
    w.close()
    return str(path)


@pytest.fixture
def voiced_clip(tmp_path):
    """A finished-looking clip with an audio track, as caption variants require."""
    from ai_layer.creative.schemas import SfxCue
    silent = _clip(tmp_path / "silent.mp4")
    out = tmp_path / "voiced.mp4"
    editor.add_sfx(silent, out, [SfxCue(at_s=0.1, kind="click"),
                                 SfxCue(at_s=1.5, kind="whoosh")], log=lambda *_: None)
    return str(out)


SCRIPT_TEXT = "one two three four five six"


def _fake_asr(cost=0.0002):
    calls = {"n": 0}

    def _t(audio, **kw):
        calls["n"] += 1
        words = SCRIPT_TEXT.split()
        step = 2.5 / len(words)
        return ([{"text": w, "start": i * step, "end": i * step + step * 0.7}
                 for i, w in enumerate(words)], cost)
    _t.calls = calls
    return _t


def test_caption_variants_share_a_single_asr(voiced_clip, tmp_path):
    """The $0 claim made concrete: N caption variants, ONE transcription. The marginal
    cost of each extra variant is an ffmpeg pass, not a model call."""
    asr = _fake_asr()
    vset, clips = variants.caption_variant_set(
        voiced_clip, SCRIPT_TEXT, ["bottom_white", "center_pop", "lower_third"],
        base_id="run1", out_dir=tmp_path / "v", transcribe=asr, log=lambda *_: None)

    assert asr.calls["n"] == 1, "ASR must run once for the whole set, not once per variant"
    assert vset.axis == "caption_style" and len(clips) == 3
    for p in clips.values():
        assert Path(p).exists()


def test_caption_variants_actually_differ(voiced_clip, tmp_path):
    """Different style -> different pixels. A no-op would pass every other assertion."""
    _vset, clips = variants.caption_variant_set(
        voiced_clip, SCRIPT_TEXT, ["bottom_white", "center_pop"],
        base_id="run1", out_dir=tmp_path / "v", transcribe=_fake_asr(),
        log=lambda *_: None)
    paths = list(clips.values())
    assert Path(paths[0]).read_bytes() != Path(paths[1]).read_bytes()


def test_caption_variants_preserve_length_and_audio(voiced_clip, tmp_path):
    _vset, clips = variants.caption_variant_set(
        voiced_clip, SCRIPT_TEXT, ["bottom_white", "lower_third"],
        base_id="run1", out_dir=tmp_path / "v", transcribe=_fake_asr(),
        log=lambda *_: None)
    before = editor.probe(voiced_clip)
    for p in clips.values():
        m = editor.probe(p)
        assert m["duration"] == pytest.approx(before["duration"], abs=0.25)
        assert m["has_audio"] is True


def test_caption_variants_refuse_a_silent_base(tmp_path):
    silent = _clip(tmp_path / "s.mp4")
    with pytest.raises(ValueError, match="silent"):
        variants.caption_variant_set(silent, SCRIPT_TEXT, ["bottom_white", "center_pop"],
                                     base_id="r", out_dir=tmp_path / "v",
                                     transcribe=_fake_asr(), log=lambda *_: None)


def test_an_unknown_caption_style_is_an_error():
    with pytest.raises(ValueError, match="unknown caption style"):
        variants.caption_style("neon_sparkle")


# --- edit: aesthetic variants (real ffmpeg) ----------------------------------------------

def test_aesthetic_variants_regrade_the_same_footage(voiced_clip, tmp_path):
    vset, clips = variants.aesthetic_variant_set(
        voiced_clip, ["clean", "film_grain", "warm_clip"], base_id="run1",
        out_dir=tmp_path / "v", log=lambda *_: None)
    assert vset.axis == "aesthetic" and len(clips) == 3
    for p in clips.values():
        assert Path(p).exists()


def test_aesthetic_variants_preserve_timing_and_audio(voiced_clip, tmp_path):
    """Timing-preserving is the whole reason these are safe on a finished timeline: a
    speed change would desync the baked-in captions and voiceover."""
    _vset, clips = variants.aesthetic_variant_set(
        voiced_clip, ["clean", "film_grain"], base_id="run1", out_dir=tmp_path / "v",
        log=lambda *_: None)
    before = editor.probe(voiced_clip)
    for p in clips.values():
        m = editor.probe(p)
        assert m["duration"] == pytest.approx(before["duration"], abs=0.25)
        assert m["has_audio"] is True


def test_grain_variant_actually_changes_the_pixels(voiced_clip, tmp_path):
    _vset, clips = variants.aesthetic_variant_set(
        voiced_clip, ["clean", "film_grain"], base_id="run1", out_dir=tmp_path / "v",
        log=lambda *_: None)
    ids = sorted(clips)
    assert Path(clips[ids[0]]).read_bytes() != Path(clips[ids[1]]).read_bytes()


def test_an_unknown_aesthetic_is_an_error():
    with pytest.raises(ValueError, match="unknown aesthetic"):
        variants.aesthetic_plan("sepia_dream")


# --- the experiment record --------------------------------------------------------------

def test_the_record_maps_variant_id_to_artifact(voiced_clip, tmp_path):
    """What T11 joins against: a shipped ad's meta_ad_id is stamped onto its variant_id,
    and the (axis, value) is right here. Without it, N ads are N unattributable numbers."""
    vset, clips = variants.aesthetic_variant_set(
        voiced_clip, ["clean", "film_grain"], base_id="run1", out_dir=tmp_path / "v",
        log=lambda *_: None)
    record = variants.write_record(tmp_path, vset, clips)

    loaded = json.loads(Path(record).read_text("utf-8"))
    assert loaded["set"]["axis"] == "aesthetic"
    assert set(loaded["artifacts"]) == set(clips)
    by_id = {v["variant_id"]: v for v in loaded["set"]["variants"]}
    for vid in clips:
        assert by_id[vid]["value"] in ("clean", "film_grain")


def test_the_record_round_trips_into_a_variant_set(voiced_clip, tmp_path):
    vset, clips = variants.aesthetic_variant_set(
        voiced_clip, ["clean", "warm_clip"], base_id="run1", out_dir=tmp_path / "v",
        log=lambda *_: None)
    record = variants.write_record(tmp_path, vset, clips)
    loaded = json.loads(Path(record).read_text("utf-8"))
    assert VariantSet.model_validate(loaded["set"]) == vset
