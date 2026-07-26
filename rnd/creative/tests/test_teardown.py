"""Teardown: shot detection, ASR-derived speech, and the closed-taxonomy gate.

$0 and offline. The video is synthesized at test time with the bundled ffmpeg (see
conftest.synth_video), so shot boundaries have a GROUND TRUTH to assert against rather
than a plausible-looking number. Network seams (`video_providers.transcribe_words`,
`teardown._classify`) are patched at the module attribute, matching how the image and
video providers are already tested.

The most important test here is `test_refuses_to_invent_a_category`. Everything else
checks that we measure what we claim to measure; that one checks that we refuse to
claim anything else.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import taxonomy  # noqa: E402
import teardown  # noqa: E402
import video_providers  # noqa: E402
from schemas import CreativeTemplate, UGCStyle  # noqa: E402

SYNTH_SHOT_SECONDS = 1.0        # mirrors conftest.synth_video's ground truth


# --- 1. MEASURED FROM FRAMES ---------------------------------------------------

def test_detects_the_synthesized_cuts(synth_video):
    shots, duration, stats = teardown.detect_shots(synth_video)
    assert len(shots) == 3, f"expected 3 shots, got {[s.model_dump() for s in shots]}"

    # cuts at 1.0s and 2.0s, within one sampled frame (1/TEARDOWN_SAMPLE_FPS)
    tol = 1.0 / 8 + 0.02
    assert shots[0].start_s == 0.0
    assert abs(shots[1].start_s - SYNTH_SHOT_SECONDS) < tol
    assert abs(shots[2].start_s - 2 * SYNTH_SHOT_SECONDS) < tol
    assert duration == pytest.approx(3.0, abs=0.2)


def test_solid_colour_shots_have_no_micro_shake(synth_video):
    """Within a solid-colour shot every frame is identical, so the inter-frame diff is
    zero. If this drifts above zero the metric is picking up encoder noise, and any
    shake we later 'measure' off a real ad is partly the codec."""
    _, _, stats = teardown.detect_shots(synth_video)
    assert stats["micro_shake"] == pytest.approx(0.0, abs=1.0)


def test_measure_style_reports_only_what_it_measured(synth_video):
    _, _, stats = teardown.detect_shots(synth_video)
    style = teardown.measure_style(stats)
    assert isinstance(style, UGCStyle)
    # prompt-half is a classification, not a measurement: it must stay empty here
    assert style.camera is None and style.lighting is None and style.framing is None
    # grain/recompress have no honest estimator yet, so they must not be invented
    assert style.grain == 0.0 and style.recompress is False


def test_single_shot_video_yields_one_shot_and_no_cut(tmp_path):
    import imageio_ffmpeg
    import numpy as np
    out = tmp_path / "flat.mp4"
    w = imageio_ffmpeg.write_frames(str(out), (64, 64), fps=10, macro_block_size=1)
    w.send(None)
    frame = np.full((64, 64, 3), 128, dtype=np.uint8)
    for _ in range(20):
        w.send(frame.tobytes())
    w.close()

    shots, duration, _ = teardown.detect_shots(str(out))
    assert len(shots) == 1
    assert shots[0].start_s == 0.0


# --- 2. MEASURED FROM ASR ------------------------------------------------------

def test_spoken_hook_is_the_words_before_the_first_cut(fake_words):
    got = teardown.derive_speech(fake_words, first_cut_s=1.0)
    assert got["spoken_hook"] == "I genuinely did not expect"       # all start < 1.0
    assert "this" not in got["spoken_hook"]                          # starts at 1.2


def test_cta_start_is_a_measured_timestamp_not_a_guess(fake_words):
    got = teardown.derive_speech(fake_words, first_cut_s=1.0)
    assert got["cta_start_s"] == pytest.approx(2.3, abs=0.01)        # "shop now" @ 2.3


def test_no_cta_phrase_means_none_not_a_plausible_number():
    words = [{"text": w, "start": i * 0.3, "end": i * 0.3 + 0.2}
             for i, w in enumerate(["this", "smells", "quite", "nice"])]
    got = teardown.derive_speech(words, first_cut_s=1.0)
    assert got["cta_start_s"] is None, "an absent CTA must be None, never an estimate"


def test_wpm_measured_over_the_speech_span_not_the_clip():
    """10 words from t=0.0 to t=5.0 is 120 wpm, whether the clip is 6s or 60s. Dividing
    by clip duration would make a talky ad with a long silent outro look slow-paced."""
    words = [{"text": "w", "start": i * 0.5, "end": i * 0.5 + 0.5} for i in range(10)]
    assert words[-1]["end"] - words[0]["start"] == pytest.approx(5.0)
    got = teardown.derive_speech(words, first_cut_s=0.5)
    assert got["words_per_minute"] == pytest.approx(120.0, abs=0.5)


def test_silence_yields_empty_speech_fields():
    got = teardown.derive_speech([], first_cut_s=1.0)
    assert got == {"spoken_hook": None, "words_per_minute": None, "cta_start_s": None}


def test_silent_video_has_no_audio_track(synth_video, tmp_path):
    assert teardown.extract_audio(synth_video, tmp_path / "a.wav") is None


# --- 3. CLASSIFIED, CLOSED SET -------------------------------------------------

class _FakeResp:
    """OpenAI-shaped enough for _classify: .choices[0].message.content + .model_dump()."""
    def __init__(self, payload, cost):
        content = json.dumps(payload)
        self.choices = [type("C", (), {"message": type("M", (), {"content": content})()})()]
        self._cost = cost

    def model_dump(self):
        return {"usage": {"cost": self._cost}}


class _FakeVisionClient:
    """Returns whatever JSON it is constructed with. No network, no spend."""
    def __init__(self, payload, cost=0.0002):
        self.chat = type("Chat", (), {"completions": self})()
        self._payload, self._cost = payload, cost

    def create(self, **kw):
        return _FakeResp(self._payload, self._cost)


_GOOD = {"ad_format": "ugc_testimonial", "hook_type": "pattern_interrupt",
         "camera": "selfie", "lighting": "window", "framing": "imperfect"}


def test_classify_accepts_in_set_labels(synth_video):
    _, _, stats = teardown.detect_shots(synth_video)
    labels, cost = teardown._classify(_FakeVisionClient(_GOOD),
                                      teardown._contact_sheet(stats["keyframes"]))
    assert labels == _GOOD
    assert cost == pytest.approx(0.0002)


def test_classify_tolerates_case_and_spacing_drift(synth_video):
    _, _, stats = teardown.detect_shots(synth_video)
    drifted = {**_GOOD, "hook_type": "Pattern Interrupt", "ad_format": "UGC-Testimonial"}
    labels, _ = teardown._classify(_FakeVisionClient(drifted),
                                   teardown._contact_sheet(stats["keyframes"]))
    assert labels["hook_type"] == "pattern_interrupt"
    assert labels["ad_format"] == "ugc_testimonial"


def test_refuses_to_invent_a_category(synth_video):
    """The whole point of the closed set. An off-set label is a FAILED classification,
    not a new category, and it must never be coerced to the nearest neighbour."""
    _, _, stats = teardown.detect_shots(synth_video)
    off_set = {**_GOOD, "hook_type": "aspirational_soft_sell_undertone"}
    with pytest.raises(taxonomy.TaxonomyError, match="Refusing to invent"):
        teardown._classify(_FakeVisionClient(off_set),
                           teardown._contact_sheet(stats["keyframes"]))


# --- the contract ---------------------------------------------------------------

def test_template_forbids_fabricated_fields():
    """product_first_appears_s is the canonical example: a VLM will emit it happily and
    no test will ever catch it lying. extra='forbid' makes the provenance rule mechanical."""
    with pytest.raises(Exception):
        CreativeTemplate(ad_id="1", cohort="winner", product_first_appears_s=2.1)


def test_template_requires_a_cohort():
    """UGC-D5: a corpus with no negative class cannot support an effect estimate."""
    with pytest.raises(Exception):
        CreativeTemplate(ad_id="1")


def test_brief_omits_what_was_not_measured():
    tpl = CreativeTemplate(ad_id="123", cohort="winner", shot_count=4, duration_s=12.0,
                           avg_shot_length_s=3.0)
    brief = tpl.to_brief()
    assert "4 shots" in brief
    assert "words/min" not in brief          # wpm was never measured -> never claimed
    assert "call to action" not in brief
    assert "thumb-stop" not in brief


# --- end to end, offline --------------------------------------------------------

def test_analyze_degrades_honestly_without_client_or_audio(synth_video, tmp_path):
    tpl = teardown.analyze(synth_video, ad_id="ad_1", cohort="winner", client=None,
                           work_dir=tmp_path, log=lambda *_: None)
    assert tpl.shot_count == 3
    assert tpl.ad_format is None and tpl.hook_type is None    # no client -> no labels
    assert tpl.spoken_hook is None                            # silent -> no hook
    assert tpl.style.micro_shake == pytest.approx(0.0, abs=1.0)


def test_analyze_uses_asr_and_classifier_when_available(synth_video, tmp_path, monkeypatch,
                                                        fake_words):
    monkeypatch.setattr(teardown, "extract_audio", lambda *a, **k: str(tmp_path / "a.wav"))
    monkeypatch.setattr(video_providers, "transcribe_words",
                        lambda *a, **k: (fake_words, 0.00001))

    tpl = teardown.analyze(synth_video, ad_id="ad_2", cohort="loser",
                           client=_FakeVisionClient(_GOOD), work_dir=tmp_path,
                           metrics={"thumb_stop_rate": 0.31, "roas": 0.4, "spend": 400.0},
                           log=lambda *_: None)
    assert tpl.cohort == "loser"
    assert tpl.hook_type == "pattern_interrupt"
    assert tpl.style.camera == "selfie"              # prompt-half filled by the classifier
    assert tpl.spoken_hook.startswith("I genuinely")
    assert tpl.cta_start_s == pytest.approx(2.3, abs=0.01)
    assert tpl.thumb_stop_rate == pytest.approx(0.31)
    assert "LOSER" in tpl.to_brief()


def test_asr_failure_never_breaks_the_teardown(synth_video, tmp_path, monkeypatch):
    monkeypatch.setattr(teardown, "extract_audio", lambda *a, **k: str(tmp_path / "a.wav"))

    def _boom(*a, **k):
        raise RuntimeError("fal is down")
    monkeypatch.setattr(video_providers, "transcribe_words", _boom)

    tpl = teardown.analyze(synth_video, ad_id="ad_3", cohort="winner", client=None,
                           work_dir=tmp_path, log=lambda *_: None)
    assert tpl.shot_count == 3           # frame measurements survive
    assert tpl.spoken_hook is None       # speech fields stay empty, run continues
