"""Captions: alignment, the fail-closed drift gate, cue grouping, and rendering.

All offline and $0. Planning is pure arithmetic over word timings; rendering is Pillow.
Nothing here asks a model whether the captions are right, which is the point: caption/
audio agreement is a string comparison, not a judgment.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import captions  # noqa: E402
from schemas import CaptionCue, CaptionStyle, CaptionWord  # noqa: E402

SCRIPT = "I genuinely did not expect this to work"


def _asr(script=SCRIPT, *, step=0.4):
    return [{"text": w, "start": i * step, "end": i * step + step * 0.8}
            for i, w in enumerate(script.split())]


# --- alignment + the drift gate -------------------------------------------------

def test_perfect_transcript_has_zero_drift():
    assert captions.drift(SCRIPT, _asr()) == 0.0


def test_drift_ignores_case_and_punctuation():
    """Whisper returns 'Expect,' where we wrote 'expect'. That is transcription noise,
    not disagreement, and treating it as drift would make the gate fire constantly."""
    noisy = _asr("i GENUINELY did not Expect, this to work!")
    assert captions.drift(SCRIPT, noisy) == 0.0


def test_drift_rises_when_the_audio_says_something_else():
    assert captions.drift(SCRIPT, _asr("completely different words entirely")) > 0.5


def test_text_comes_from_the_script_when_the_two_agree(brand_kit):
    """Whisper knows WHEN a word was said. It does not know how the brand is spelled."""
    words, d = captions.align("Lumen is genuinely good",
                              _asr("lumen is genuinely good"))
    assert d == 0.0
    assert [w.text for w in words] == ["Lumen", "is", "genuinely", "good"]
    assert words[0].start == 0.0                       # timing still comes from ASR


def test_text_comes_from_the_audio_when_they_disagree():
    """A caption that contradicts what is audible is the one thing worse than an ugly
    caption, so on any disagreement we display what was actually said."""
    words, d = captions.align("shop the new range", _asr("shop the old range"))
    assert d > 0.0
    assert [w.text for w in words] == ["shop", "the", "old", "range"]


def test_drift_gate_is_fail_closed():
    d = captions.drift(SCRIPT, _asr("completely different words entirely"))
    with pytest.raises(captions.CaptionDriftError, match="Refusing to burn"):
        captions.verify_agreement(d, strict=True)


def test_drift_gate_permits_small_transcription_noise():
    d = captions.drift(SCRIPT, _asr("I genuinely did not expect this to werk"))
    captions.verify_agreement(d, strict=True)          # must not raise


def test_plan_refuses_a_mismatched_voiceover():
    with pytest.raises(captions.CaptionDriftError):
        captions.plan(SCRIPT, _asr("nothing at all like it"))


def test_strict_false_lets_a_caller_opt_out():
    cues, d = captions.plan(SCRIPT, _asr("nothing at all like it"), strict=False)
    assert cues and d > 0.5


# --- cue grouping ---------------------------------------------------------------

def _words(spans):
    return [CaptionWord(text=t, start=s, end=e) for t, s, e in spans]


def test_cues_hold_at_most_three_words():
    cues = captions.plan_cues(_words([(w, i * 0.3, i * 0.3 + 0.25)
                                      for i, w in enumerate("a b c d e f g".split())]))
    assert all(len(c.words) <= 3 for c in cues)
    assert [c.text for c in cues] == ["a b c", "d e f", "g"]


def test_a_silence_breaks_the_cue():
    """A gap is a sentence boundary. Running the last word of one sentence together
    with the first of the next is how machine captions announce themselves."""
    cues = captions.plan_cues(_words([("end", 0.0, 0.3), ("Next", 1.5, 1.8)]),
                              max_gap_s=0.6)
    assert [c.text for c in cues] == ["end", "Next"]


def test_a_long_word_breaks_the_cue_on_duration():
    cues = captions.plan_cues(_words([("aa", 0.0, 1.4), ("bb", 1.4, 2.9)]),
                              max_gap_s=5.0, max_cue_s=2.0)
    assert len(cues) == 2


def test_a_cue_holds_until_the_next_one_starts():
    """Captions that blink off in the gaps between phrases read as broken."""
    cues = captions.plan_cues(_words([("a", 0.0, 0.3), ("b", 2.0, 2.3)]), max_gap_s=0.5)
    assert cues[0].end == pytest.approx(2.0)           # not 0.3
    assert cues[1].end == pytest.approx(2.3 + 0.35)    # last cue gets the tail


def test_no_words_no_cues():
    assert captions.plan_cues([]) == []


# --- the active word ------------------------------------------------------------

def test_active_word_advances_with_time():
    cue = CaptionCue(words=_words([("a", 0.0, 0.3), ("b", 0.4, 0.7), ("c", 0.8, 1.1)]),
                     start=0.0, end=1.5)
    assert cue.active_index(0.1) == 0
    assert cue.active_index(0.5) == 1
    assert cue.active_index(0.9) == 2


def test_between_words_the_previous_word_stays_lit():
    """Otherwise the highlight strobes off in every inter-word gap."""
    cue = CaptionCue(words=_words([("a", 0.0, 0.3), ("b", 0.9, 1.2)]), start=0.0, end=1.5)
    assert cue.active_index(0.6) == 0                  # in the gap, 'a' remains active


def test_state_is_none_when_nothing_is_on_screen():
    cues = captions.plan_cues(_words([("a", 1.0, 1.3)]))
    assert captions.state_at(cues, 0.2) is None
    assert captions.state_at(cues, 1.1) == (0, 0)


# --- rendering ------------------------------------------------------------------

def test_rendered_cue_is_transparent_outside_the_text():
    cue = CaptionCue(words=_words([("hello", 0.0, 0.5)]), start=0.0, end=1.0)
    png = captions.render_cue_png(cue, 0, (240, 400), CaptionStyle())
    img = Image.open(__import__("io").BytesIO(png))
    assert img.mode == "RGBA" and img.size == (240, 400)
    assert img.getchannel("A").getpixel((5, 5)) == 0        # corner untouched
    assert img.getchannel("A").getextrema()[1] == 255       # text is opaque somewhere


def test_active_word_is_drawn_in_a_different_colour():
    cue = CaptionCue(words=_words([("aaa", 0.0, 0.4), ("bbb", 0.4, 0.8)]),
                     start=0.0, end=1.0)
    style = CaptionStyle(color="#FFFFFF", active_color="#FF0000")
    first = captions.render_cue_png(cue, 0, (320, 320), style)
    second = captions.render_cue_png(cue, 1, (320, 320), style)
    assert first != second, "highlighting a different word must change the frame"


def test_style_takes_the_highlight_from_the_brand_accent(brand_kit):
    style = CaptionStyle.from_kit(brand_kit)
    assert style.active_color == "#FFB703"                   # the kit's accent
    assert style.color == "#FFFFFF", "caption body stays white for contrast over video"


def test_frame_sequence_covers_the_clip_and_is_numbered(tmp_path):
    cues = captions.plan_cues(_words([("a", 0.0, 0.3), ("b", 0.4, 0.7)]))
    n, fps = captions.render_frames(cues, (64, 64), tmp_path, duration=2.0, fps=10)
    assert n == 20 and fps == 10
    assert (tmp_path / "cap_00000.png").exists()
    assert (tmp_path / "cap_00019.png").exists()


def test_frames_with_no_cue_are_fully_transparent(tmp_path):
    cues = captions.plan_cues(_words([("a", 0.0, 0.2)]), tail_s=0.0)
    captions.render_frames(cues, (32, 32), tmp_path, duration=1.0, fps=10)
    late = Image.open(tmp_path / "cap_00009.png")             # t = 0.9s, nothing on screen
    assert late.getchannel("A").getextrema() == (0, 0)


def test_identical_states_share_one_encode(tmp_path):
    """A 15s voiceover has ~40 states and ~360 frames. Rendering per state is a 9x
    saving with a byte-identical result."""
    cues = captions.plan_cues(_words([("hold", 0.0, 1.0)]), tail_s=0.0)
    captions.render_frames(cues, (48, 48), tmp_path, duration=1.0, fps=10)
    a = (tmp_path / "cap_00002.png").read_bytes()
    b = (tmp_path / "cap_00003.png").read_bytes()
    assert a == b
