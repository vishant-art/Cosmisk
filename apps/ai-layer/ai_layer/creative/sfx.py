"""Sound effects, synthesized rather than licensed.

The roadmap listed "licensed SFX pack" as a line item with a rights problem attached.
A punch is a short low sine with a fast decay. A whoosh is band-limited pink noise
with a fade either side. A click is a very short high sine. All three are three lines
of ffmpeg `lavfi`, cost nothing, need no licence, and are byte-identical on every run,
which makes them testable.

If a real pack is licensed later, `synthesize()` becomes `load()` and nothing else in
the editor changes.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

SfxKind = Literal["punch", "whoosh", "click"]

# lavfi graphs. Each yields a short mono waveform. Tuned by ear against a phone speaker,
# which is where these will actually be heard.
_GRAPHS: dict[str, str] = {
    # a low thump on the beat: 170Hz, gone in a tenth of a second
    "punch": "sine=frequency=170:duration=0.14,afade=t=out:st=0.02:d=0.12",
    # air moving past the mic on a cut: pink noise, highs only, faded both ends
    "whoosh": ("anoisesrc=d=0.35:c=pink:a=0.6,highpass=f=700,"
               "afade=t=in:d=0.15,afade=t=out:st=0.2:d=0.15"),
    # a UI tick for a caption pop or a product reveal
    "click": "sine=frequency=1400:duration=0.03,afade=t=out:st=0.005:d=0.025",
}

KINDS: tuple[str, ...] = tuple(_GRAPHS)


def synthesize(kind: str, out_path, *, sample_rate: int = 44100) -> str:
    """Render one effect to a mono wav. Deterministic: same kind, same bytes."""
    if kind not in _GRAPHS:
        raise ValueError(f"unknown sfx {kind!r}; expected one of {KINDS}")
    import subprocess                   # lazy
    import imageio_ffmpeg              # lazy

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-f", "lavfi", "-i", _GRAPHS[kind],
           "-ar", str(sample_rate), "-ac", "1", str(out)]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0 or not out.exists():
        tail = (proc.stderr or b"").decode("utf-8", "replace")[-400:]
        raise RuntimeError(f"sfx synthesis failed for {kind!r}:\n{tail}")
    return str(out)


def ensure(kinds, cache_dir) -> dict[str, str]:
    """Materialize each requested kind once into `cache_dir`. Returns kind -> path."""
    cache = Path(cache_dir)
    out: dict[str, str] = {}
    for k in sorted(set(kinds)):
        p = cache / f"{k}.wav"
        if not p.exists():
            synthesize(k, p)
        out[k] = str(p)
    return out
