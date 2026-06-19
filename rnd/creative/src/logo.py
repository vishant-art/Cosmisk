"""Generate the brand logo once, as an image asset, then re-reference it on every
ad so the mark stays stable (re-referencing holds it steadier than re-describing).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import image_providers  # noqa: E402
import prompt_builder  # noqa: E402
from schemas import BrandKit  # noqa: E402


def generate_logo(kit: BrandKit, out_path, *, provider="nanobanana", size="2K",
                  pro=False, log=print) -> dict:
    prompt = prompt_builder.build_logo_prompt(kit)
    res = image_providers.generate_with_fallback(
        prompt, out_path, primary=provider, refs=None, aspect="1:1",
        size=size, pro=pro, log=log)
    kit.logo.asset_path = res["path"]    # mutate the kit so downstream ads reference it
    return res
