"""Generate the brand logo once, as an image asset, then re-reference it on every
ad so the mark stays stable (re-referencing holds it steadier than re-describing).
"""
from __future__ import annotations

import sys
from pathlib import Path

from ai_layer.creative import image_providers
from ai_layer.creative import prompt_builder
from ai_layer.creative.schemas import BrandKit  # noqa: E402


def generate_logo(kit: BrandKit, out_path, *, provider="flux", size="2K",
                  pro=False, log=print) -> dict:
    prompt = prompt_builder.build_logo_prompt(kit)
    res = image_providers.generate_with_fallback(
        prompt, out_path, primary=provider, refs=None, aspect="1:1",
        size=size, pro=pro, log=log)
    kit.logo.asset_path = res["path"]    # mutate the kit so downstream ads reference it
    return res
