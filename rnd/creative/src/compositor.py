"""Deterministic compositor (Pillow only -- rebuild plan decision D2).

Takes a TEXT-FREE background + a LayoutSpec + a CopySet (+ optional logo) and draws
the finished static ad: exact copy in brand fonts/colors, a contrast scrim where the
background is busy, a rounded CTA button, and the logo with clear-space. No browser,
no web fonts -- ships a brand .ttf (or falls back to a bundled DejaVu Sans).

Brand fonts: drop .ttf/.otf files in rnd/creative/assets/fonts/ and they win.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import saliency  # noqa: E402
from schemas import BrandKit, CompositedAd, CopySet, LayoutSpec  # noqa: E402

_FONTS_DIR = config.CREATIVE_DIR / "assets" / "fonts"
_LINE_SPACING = 1.25


# --- fonts --------------------------------------------------------------------

def _font_path() -> str | None:
    if _FONTS_DIR.exists():
        ttfs = sorted(_FONTS_DIR.glob("*.ttf")) + sorted(_FONTS_DIR.glob("*.otf"))
        if ttfs:
            return str(ttfs[0])
    try:                                  # reliable scalable fallback (ships with matplotlib)
        from matplotlib import font_manager
        return font_manager.findfont("DejaVu Sans")
    except Exception:                     # noqa: BLE001
        return None


def _font(size: int):
    from PIL import ImageFont             # lazy
    p = _font_path()
    if p:
        try:
            return ImageFont.truetype(p, size)
        except Exception:                 # noqa: BLE001
            pass
    return ImageFont.load_default(size)


# --- text measurement / fitting ----------------------------------------------

def _text_size(draw, text: str, font):
    l, t, r, b = draw.textbbox((0, 0), text or " ", font=font)
    return r - l, b - t


def wrap_text(draw, text: str, font, max_w: int) -> list[str]:
    lines: list[str] = []
    cur = ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if not cur or _text_size(draw, trial, font)[0] <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or [text]


def fit_font(draw, text: str, *, max_w: int, max_h: int, max_pt: int, min_pt: int = 12):
    """Largest font (<= max_pt) at which `text` wraps within (max_w, max_h)."""
    pt = max_pt
    while pt >= min_pt:
        font = _font(pt)
        lines = wrap_text(draw, text, font, max_w)
        line_h = _text_size(draw, "Ag", font)[1] * _LINE_SPACING
        widest = max((_text_size(draw, ln, font)[0] for ln in lines), default=0)
        if line_h * len(lines) <= max_h and widest <= max_w:
            return font, lines
        pt -= 4
    font = _font(min_pt)
    return font, wrap_text(draw, text, font, max_w)


# --- drawing primitives -------------------------------------------------------

def _palette(kit: BrandKit, role: str, default: str) -> str:
    for c in kit.palette:
        if c.role == role:
            return c.css()
    return default


def _draw_scrim(canvas, x, y, w, h, *, pad=22, alpha=130) -> None:
    from PIL import Image, ImageDraw      # lazy
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [x - pad, y - pad, x + w + pad, y + h + pad], radius=pad, fill=(0, 0, 0, alpha))
    canvas.alpha_composite(layer)


def _draw_text_block(draw, text, x, y, w, h, *, max_pt, color, align) -> None:
    font, lines = fit_font(draw, text, max_w=w, max_h=h, max_pt=max_pt)
    line_h = _text_size(draw, "Ag", font)[1] * _LINE_SPACING
    cy = y
    for ln in lines:
        lw, _ = _text_size(draw, ln, font)
        lx = x + (w - lw) // 2 if align == "center" else (x + w - lw if align == "right" else x)
        draw.text((lx, cy), ln, font=font, fill=color)
        cy += line_h


def _draw_cta(draw, text, x, y, w, h, *, fill, text_color, max_pt) -> None:
    draw.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=fill)
    font, _ = fit_font(draw, text, max_w=w - 24, max_h=h - 12, max_pt=max_pt or 36)
    tw, th = _text_size(draw, text, font)
    draw.text((x + (w - tw) // 2, y + (h - th) // 2), text, font=font, fill=text_color)


def _paste_logo(canvas, logo_path, x, y, w, h, *, pad_frac=0.15) -> None:
    from PIL import Image                 # lazy
    logo = Image.open(logo_path).convert("RGBA")
    pad = int(min(w, h) * pad_frac)       # clear-space around the mark
    logo.thumbnail((max(w - 2 * pad, 1), max(h - 2 * pad, 1)))
    px = x + (w - logo.width) // 2        # centre within the (clear-space) box
    py = y + (h - logo.height) // 2
    canvas.alpha_composite(logo, (px, py))


# --- the compositor -----------------------------------------------------------

_TEXT_FOR_ROLE = {"headline": "headline", "subhead": "subhead",
                  "cta": "cta_label", "legal": "legal"}


def compose(background, spec: LayoutSpec, copy: CopySet, out_path, *, kit: BrandKit,
            logo_path: str | None = None, saliency_check: bool = True,
            concept_title: str | None = None) -> CompositedAd:
    from PIL import Image, ImageDraw      # lazy
    W, H = spec.width, spec.height
    bg = Image.open(background).convert("RGB").resize((W, H))
    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")

    ink = _palette(kit, "primary", "#111111")
    cta_fill = _palette(kit, "accent", ink)
    bg_color = _palette(kit, "bg", "#FFFFFF")
    scrim_used = False

    for box in sorted(spec.boxes, key=lambda b: b.z):
        bx, by = int(box.x * W), int(box.y * H)
        bw, bh = int(box.w * W), int(box.h * H)

        if box.role == "logo":
            if logo_path:
                _paste_logo(canvas, logo_path, bx, by, bw, bh)
            continue
        if box.role == "product":
            continue                      # product comes from the background scene itself

        text = getattr(copy, _TEXT_FOR_ROLE[box.role], None)
        if not text:
            continue

        if box.role == "cta":
            _draw_cta(draw, text, bx, by, bw, bh, fill=cta_fill,
                      text_color=bg_color, max_pt=box.max_font_pt or 36)
            continue

        busy = box.scrim or (saliency_check and
                             saliency.needs_scrim(bg, (box.x, box.y, box.w, box.h)))
        if busy and box.role in ("headline", "subhead"):
            _draw_scrim(canvas, bx, by, bw, bh)
            scrim_used = True
        color = "#FFFFFF" if busy else ink
        _draw_text_block(draw, text, bx, by, bw, bh,
                         max_pt=box.max_font_pt or 96, color=color, align=box.align)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out)
    return CompositedAd(path=str(out), fmt=spec.fmt, width=W, height=H,
                        background_path=str(background), concept_title=concept_title,
                        scrim_used=scrim_used)


def render_overlay(spec: LayoutSpec, copy: CopySet, kit: BrandKit, out_path, *,
                   width: int | None = None, height: int | None = None,
                   logo_path: str | None = None) -> str:
    """A TRANSPARENT PNG of copy + CTA (+ optional logo), NO background -- to burn
    onto a moving video as a lower-third. Boxes are relative, so pass the actual
    video width/height. Text always gets a scrim (the video background is unknown)."""
    from PIL import Image, ImageDraw      # lazy
    W = width or spec.width
    H = height or spec.height
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")
    cta_fill = _palette(kit, "accent", "#B87333")
    bg_color = _palette(kit, "bg", "#FFFFFF")

    for box in sorted(spec.boxes, key=lambda b: b.z):
        bx, by = int(box.x * W), int(box.y * H)
        bw, bh = int(box.w * W), int(box.h * H)
        if box.role == "logo":
            if logo_path:
                _paste_logo(canvas, logo_path, bx, by, bw, bh)
            continue
        if box.role == "product":
            continue
        text = getattr(copy, _TEXT_FOR_ROLE[box.role], None)
        if not text:
            continue
        if box.role == "cta":
            _draw_cta(draw, text, bx, by, bw, bh, fill=cta_fill,
                      text_color=bg_color, max_pt=box.max_font_pt or 36)
            continue
        if box.role in ("headline", "subhead"):
            _draw_scrim(canvas, bx, by, bw, bh)        # always, over arbitrary motion
        _draw_text_block(draw, text, bx, by, bw, bh,
                         max_pt=box.max_font_pt or 96, color="#FFFFFF", align=box.align)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    return str(out)
