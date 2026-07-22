# src/creative_studio/planning/context_builder.py
"""Deterministic planning-context assembly for the Creative Studio planner chain.

`build_context` renders `BrandContext` + `Product` + `Campaign` history + the
user's stated creative preference into a single plain-text block. That block
is embedded verbatim into the Creative Intelligence prompt's `<<context>>`
placeholder (see `prompts/definitions/creative_intelligence.yaml`).

Section order is fixed (`## BRAND`, `## PRODUCT`, `## CAMPAIGN HISTORY`,
`## USER CREATIVE PREFERENCE`) and content is deterministic: given the same
inputs, two calls always produce byte-identical output. Nested data is
embedded as compact `json.dumps(..., ensure_ascii=False)` blocks rather than
prose, so the LLM sees the raw structured facts instead of a lossy summary.

Budgeting: if the assembled text exceeds `max_chars`, campaigns are dropped
one at a time from the end of the list (oldest-supplied-last convention: the
caller is expected to order campaigns most-relevant-first) until it fits, or
until none remain. If it is STILL over budget with zero campaigns, the whole
text is hard-truncated so the result never exceeds `max_chars`.
"""
from __future__ import annotations

import json

from creative_studio.contracts import BrandContext, Campaign, Product

_TRUNCATION_SUFFIX = "...[truncated]"


def _json_block(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def _brand_section(brand: BrandContext) -> str:
    lines = [
        "## BRAND",
        f"business: {_json_block(brand.business)}",
        f"branding: {_json_block(brand.branding)}",
        f"audience: {_json_block(brand.audience)}",
        f"creativeGuidelines: {_json_block(brand.creative_guidelines)}",
        f"historicalInsights: {_json_block(brand.historical_insights)}",
    ]
    return "\n".join(lines)


def _product_section(product: Product) -> str:
    n_images = len(product.original_assets.get("images") or [])
    lines = [
        "## PRODUCT",
        f"commercial: {_json_block(product.commercial)}",
        f"aiMetadata: {_json_block(product.ai_metadata)}",
        f"collections: {_json_block(product.collections)}",
        f"nImages: {n_images}",
        f"nVariants: {len(product.variants)}",
    ]
    return "\n".join(lines)


def _campaign_block(campaign: Campaign) -> str:
    block: dict = {
        "campaignName": campaign.campaign_info.get("campaignName"),
        "objective": campaign.campaign_info.get("objective"),
        "performance": campaign.performance,
        "primaryHook": campaign.creative_summary.get("primaryHook"),
        "winningHooks": campaign.learnings.get("winningHooks"),
    }
    notes = campaign.learnings.get("notes")
    if notes:
        block["notes"] = notes
    return _json_block(block)


def _campaign_history_section(campaigns: list[Campaign]) -> str:
    lines = ["## CAMPAIGN HISTORY"]
    if not campaigns:
        lines.append("(no historical campaigns provided)")
    else:
        lines.extend(_campaign_block(c) for c in campaigns)
    return "\n".join(lines)


def _preference_section(preference: str) -> str:
    return f"## USER CREATIVE PREFERENCE\n{preference}"


def _assemble(brand: BrandContext, product: Product, campaigns: list[Campaign], preference: str) -> str:
    sections = [
        _brand_section(brand),
        _product_section(product),
        _campaign_history_section(campaigns),
        _preference_section(preference),
    ]
    return "\n\n".join(sections)


def build_context(
    brand: BrandContext,
    product: Product,
    campaigns: list[Campaign],
    preference: str,
    max_chars: int = 24000,
) -> str:
    """Assemble the deterministic planning-context text, fitted to `max_chars`.

    Drops trailing campaigns one at a time (down to zero) while the text
    exceeds `max_chars`; if it is still over budget with zero campaigns, hard
    -truncates the text and appends `"...[truncated]"`.
    """
    remaining = list(campaigns)

    text = _assemble(brand, product, remaining, preference)
    while len(text) > max_chars and remaining:
        remaining = remaining[:-1]
        text = _assemble(brand, product, remaining, preference)

    if len(text) <= max_chars:
        return text

    cut = max(max_chars - 15, 0)
    return text[:cut] + _TRUNCATION_SUFFIX
