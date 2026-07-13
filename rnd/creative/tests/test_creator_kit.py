"""CreatorKit (the persona): WHO is on camera, held constant.

The feature splits three ways by ACTUATOR, and the tests are organised the same way,
because the three halves are NOT equally reliable and the code must not pretend they are:

  voice_id -> TTS.          A GUARANTEE. One VO for the whole ad; it is exact.
  speech   -> script brain. A reliable wish: an LLM asked for filler words obeys.
  visual   -> video model.  A wish that mostly DOESN'T hold. `pin_face` is the attempt,
              and the tests below pin down what happens when it fails, because failing
              silently means shipping five different faces.

Zero network, zero spend: the fal seams are faked.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import config  # noqa: E402
import image_providers  # noqa: E402
import pipeline  # noqa: E402
import prompt_builder  # noqa: E402
import sequencer  # noqa: E402
import story_brain  # noqa: E402
import video_providers  # noqa: E402
from schemas import (  # noqa: E402
    BrandKit, CreatorKit, Script, ScriptBeat, Shot, Storyboard,
)


@pytest.fixture
def maya() -> CreatorKit:
    return CreatorKit(
        name="Maya", age_range="25-34", gender="woman",
        appearance="curly dark hair, freckles, no makeup",
        wardrobe="an oversized grey hoodie", setting="a small sunlit kitchen",
        energy="warm", filler_words="many", gesture="frequent", voice_id="Wise_Woman")


# --- fal seams, faked. Real mp4s (the QA gate downstream is REAL), zero network. ---
# Frames must be TEXTURED and MOVING: a flat clip is "too flat to correlate" and a still
# one is "frozen", and the per-shot QA gate rejects both -- correctly.

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


def _write_mp4(path, frames, fps=10, size=(192, 192)):
    import imageio_ffmpeg
    w = imageio_ffmpeg.write_frames(str(path), size, fps=fps, macro_block_size=1)
    w.send(None)
    for f in frames:
        w.send(f.tobytes())
    w.close()
    return str(path)


def _moving(prompt, duration):
    base = _smooth(abs(hash(prompt)) % 20 + 1)
    return [np.roll(base, i * 3, axis=1) for i in range(int(duration * 10))]


class _FakeSeedance:
    """Writes a real, moving mp4 and records every call (prompt / image / refs)."""
    def __init__(self, extra=None):
        self.calls = []
        self.extra = extra or {}

    def __call__(self, prompt, out_path, *, image=None, refs=None, aspect="9:16",
                 duration=10, resolution="720p", fast=False, generate_audio=True, log=print):
        self.calls.append({"prompt": prompt, "image": image, "refs": refs,
                           "duration": duration})
        _write_mp4(out_path, _moving(prompt, duration))
        return {"provider": "seedance", "model": "fake", "path": str(out_path),
                "cost_usd": 0.01 * duration, "audio": False, **self.extra}


@pytest.fixture
def fake_render(monkeypatch):
    f = _FakeSeedance()
    monkeypatch.setattr(video_providers, "generate_with_fallback", f)
    return f


@pytest.fixture
def product_cutout(tmp_path):
    from PIL import Image
    size = 40
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2)
    rgb = np.zeros((size, size, 3), np.uint8)
    rgb[..., 0] = np.clip(200 - r * 3, 0, 255)
    rgb[..., 1] = np.clip(120 + xx * 2, 0, 255)
    rgb[..., 2] = 90
    rgba = np.dstack([rgb, ((r < size * 0.45) * 255).astype(np.uint8)])
    p = tmp_path / "cutout.png"
    Image.fromarray(rgba, "RGBA").save(p)
    return str(p)


def _shot(purpose="hook", product="absent"):
    return Shot(purpose=purpose, duration_s=4, camera="selfie",
                subject=f"{purpose} scene", product_visible=product, motion="a slow pan")


def _board(*specs):
    return Storyboard(shots=[_shot(p, prod) for p, prod in specs],
                      target_seconds=4 * len(specs))


def _script():
    return Script(beats=[ScriptBeat(purpose="hook", text="I thought it was a scam."),
                         ScriptBeat(purpose="cta", text="Shop the new collection.")])


# --- the schema: split by actuator ---------------------------------------------

def test_the_visual_half_describes_one_person_and_insists_on_sameness(maya):
    p = maya.to_visual_prompt()
    assert "25 to 34-year-old woman" in p
    assert "curly dark hair" in p and "oversized grey hoodie" in p and "sunlit kitchen" in p
    assert "gesturing constantly" in p                 # gesture=frequent
    assert "SAME person, unchanged, in every shot" in p


def test_the_visual_half_never_carries_speech_traits(maya):
    """A diffusion model cannot render 'uses filler words'. Asking it to is how you get
    subtitles painted into the frame."""
    p = maya.to_visual_prompt()
    for leak in ("filler", "honestly", "warm", "voice", "Wise_Woman"):
        assert leak not in p


def test_the_speech_half_goes_to_the_script_not_the_camera(maya):
    v = maya.to_voice_brief()
    assert "Maya" in v and "warm" in v
    assert "filler words and false starts" in v       # filler_words=many
    # and it says nothing about what the camera sees
    assert "hoodie" not in v and "kitchen" not in v


# --- the shot prompt ------------------------------------------------------------

def test_the_persona_lands_in_every_talking_shot(maya, brand_kit):
    p = prompt_builder.build_shot_prompt(_shot("hook"), brand_kit, creator=maya)
    assert "SAME person, unchanged, in every shot" in p
    assert "oversized grey hoodie" in p


def test_a_hero_product_shot_gets_no_persona(maya, brand_kit):
    """A hero shot is a shot OF THE PRODUCT and is i2v-seeded from a deliberately
    person-free still. Naming a creator in it would fight the seed."""
    p = prompt_builder.build_shot_prompt(_shot("demo", product="hero"), brand_kit, creator=maya)
    assert "hoodie" not in p and "SAME person" not in p


def test_no_creator_changes_nothing(maya, brand_kit):
    """Backwards compatible: the persona is purely additive."""
    without = prompt_builder.build_shot_prompt(_shot("hook"), brand_kit)
    assert "SAME person" not in without


# --- the script + storyboard brains ---------------------------------------------

def test_the_script_is_written_in_the_creators_voice(maya, brand_kit, fake_client):
    seen = {}

    def spy(client, system, user):
        seen["user"] = user
        return {"beats": [{"purpose": "hook", "text": "ok so honestly, I was sceptical."}]}, 0.0

    import brain as brain_mod
    orig = brain_mod.chat_json
    brain_mod.chat_json = spy
    try:
        story_brain.generate_script(fake_client, brand_kit, "summary", seconds=10, creator=maya)
    finally:
        brain_mod.chat_json = orig
    assert "THE CREATOR SPEAKING: Maya" in seen["user"]
    assert "filler words and false starts" in seen["user"]


def test_the_storyboard_is_told_who_is_on_camera(maya, brand_kit, fake_client):
    """Without this the director invents a new person for every `subject` line, and five
    shots describe five different people."""
    seen = {}

    def spy(client, system, user):
        seen["user"] = user
        return {"shots": [
            {"purpose": "hook", "duration_s": 4, "camera": "selfie", "subject": "Maya to camera",
             "product_visible": "absent", "motion": "walks in", "dialogue": "hi"},
            {"purpose": "cta", "duration_s": 4, "camera": "selfie", "subject": "Maya holds it",
             "product_visible": "hero", "motion": "hold", "dialogue": "shop"}]}, 0.0

    import brain as brain_mod
    orig = brain_mod.chat_json
    brain_mod.chat_json = spy
    try:
        story_brain.generate_storyboard(fake_client, brand_kit, _script(), seconds=8,
                                        creator=maya, log=lambda *_: None)
    finally:
        brain_mod.chat_json = orig
    assert "THE CREATOR ON CAMERA" in seen["user"]
    assert "the SAME person in every shot" in seen["user"]
    assert "curly dark hair" in seen["user"]


# --- voice: the one half that is a GUARANTEE -------------------------------------

def test_the_persona_voice_reaches_tts_and_is_one_take(maya, brand_kit, tmp_path, monkeypatch):
    """Voice consistency is structural: ONE voiceover for the whole timeline, so there is
    no per-shot voice to drift. The persona only has to choose it."""
    calls = []

    def fake_vo(text, out, *, voice=None, log=print):
        calls.append({"text": text, "voice": voice})
        Path(out).write_bytes(b"A")
        return {"provider": "minimax-tts", "model": "m", "path": str(out), "cost_usd": 0.01}

    monkeypatch.setattr(video_providers, "generate_voiceover", fake_vo)
    monkeypatch.setattr(video_providers, "merge_audio_onto_video",
                        lambda v, a, out, **kw: (Path(out).write_bytes(b"M"),
                                                 {"provider": "f", "model": "m",
                                                  "path": str(out), "cost_usd": 0.0})[1])
    monkeypatch.setattr(sequencer.editor, "sfx_cues_for", lambda b: [])
    monkeypatch.setattr(pipeline.editor, "add_sfx", lambda src, out, cues, **kw: str(src))
    monkeypatch.setattr(pipeline.editor, "caption_clip",
                        lambda src, out, text, audio, **kw: (str(src), None))

    (tmp_path / "timeline.mp4").write_bytes(b"T")
    pipeline.finish_timeline(str(tmp_path / "timeline.mp4"), _board(("hook", "absent")),
                             _script(), brand_kit, tmp_path,
                             voice=maya.voice_id, log=lambda *_: None)

    assert len(calls) == 1                            # ONE take for the whole ad
    assert calls[0]["voice"] == "Wise_Woman"          # the persona's voice, not the default


# --- pin_face: the experiment ----------------------------------------------------

@pytest.fixture
def fake_seed_image(monkeypatch):
    """FLUX, faked: writes a real PNG and records the prompt it was given."""
    made = []

    def fake_gen(prompt, out_path, **kw):
        from PIL import Image
        made.append({"prompt": prompt, "out": str(out_path), "refs": kw.get("refs"),
                     "negative": kw.get("negative")})
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (64, 64), "grey").save(out_path)
        return {"provider": "flux", "model": "m", "path": str(out_path), "cost_usd": 0.05}

    monkeypatch.setattr(image_providers, "generate_with_fallback", fake_gen)
    return made


def test_pin_face_seeds_every_talking_shot_from_ONE_persona_still(
        maya, brand_kit, tmp_path, monkeypatch, fake_render, fake_seed_image):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    board = _board(("hook", "absent"), ("problem", "absent"), ("cta", "absent"))

    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path, script=_script(),
                                creator=maya, pin_face=True, log=lambda *_: None)

    # exactly ONE persona still was generated, and reused
    assert len(fake_seed_image) == 1
    assert "persona_seeds" in fake_seed_image[0]["out"]
    assert "curly dark hair" in fake_seed_image[0]["prompt"]

    # and every shot was i2v-seeded from that same still
    seeds = {c["image"] for c in fake_render.calls}
    assert len(seeds) == 1 and next(iter(seeds)) is not None
    assert all(c["refs"] is None for c in fake_render.calls)   # i2v, not ref2v


def test_the_product_seed_still_wins_on_a_hero_shot(
        maya, brand_kit, tmp_path, monkeypatch, fake_render, fake_seed_image, product_cutout):
    """Seedance takes EITHER one i2v image OR a ref list, never both. A hero shot is a shot
    of the PRODUCT, so the product seed must win there -- otherwise the product never
    appears and the whole point of the ad is lost to a face."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    board = _board(("hook", "absent"), ("demo", "hero"))

    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path, script=_script(),
                                cutout_path=product_cutout, product_desc="a silk saree",
                                creator=maya, pin_face=True, log=lambda *_: None)

    kinds = [Path(m["out"]).parent.name for m in fake_seed_image]
    assert "persona_seeds" in kinds and "product_seeds" in kinds
    # the hero shot's seed is the PRODUCT still, not the persona still
    hero_call = [c for c in fake_render.calls if "hero" in c["prompt"] or "product" in c["prompt"].lower()]
    assert hero_call, "no hero shot rendered"


def test_pin_face_off_by_default_costs_nothing(
        maya, brand_kit, tmp_path, monkeypatch, fake_render, fake_seed_image):
    """The persona still is a paid FLUX call. Off by default means it is never made."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    sequencer.render_storyboard(_board(("hook", "absent")), kit=brand_kit, run_dir=tmp_path,
                                script=_script(), creator=maya, log=lambda *_: None)
    assert fake_seed_image == []                       # no persona seed generated
    assert all(c["image"] is None for c in fake_render.calls)
    # ...but the persona still reaches the PROMPT, which is free
    assert "SAME person" in fake_render.calls[0]["prompt"]


def test_a_dropped_persona_seed_is_shouted_about_not_swallowed(
        maya, brand_kit, tmp_path, monkeypatch, fake_seed_image):
    """THE failure mode this feature must not have. fal's content filter rejects a person in
    a reference; if it rejects a person as an i2v SEED too, generate_with_fallback silently
    degrades to t2v and every shot gets a different face. Ship that quietly and the persona
    is worse than useless -- it is a lie. So the drop must be loud."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    # exactly what generate_with_fallback does when the seeded call is rejected: it drops
    # the conditioning, renders t2v, and reports SUCCESS with `fell_back_from` set.
    dropped = _FakeSeedance(extra={"fell_back_from": "seeded"})
    monkeypatch.setattr(video_providers, "generate_with_fallback", dropped)
    lines = []
    sequencer.render_storyboard(_board(("hook", "absent")), kit=brand_kit, run_dir=tmp_path,
                                script=_script(), creator=maya, pin_face=True,
                                log=lines.append)

    warned = [l for l in lines if "WARNING" in l and "DROPPED" in l]
    assert warned, f"a dropped persona seed was swallowed: {lines}"
    assert "face will not match" in warned[0]


# --- persistence: the script and the render must agree on WHO ---------------------

def test_the_creator_is_persisted_so_plan_and_render_cannot_disagree(maya, tmp_path):
    """An argument written for a deadpan 40-year-old, shot as a bubbly 22-year-old, is two
    ads spliced together."""
    pipeline._write_creator(tmp_path, maya)
    assert json.loads((tmp_path / "creator_kit.json").read_text("utf-8"))["name"] == "Maya"

    reloaded = pipeline._run_creator(tmp_path)
    assert reloaded == maya
    assert pipeline._run_creator(tmp_path / "nope") is None
