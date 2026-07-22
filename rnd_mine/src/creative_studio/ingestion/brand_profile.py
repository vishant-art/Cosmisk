# src/creative_studio/ingestion/brand_profile.py
from pathlib import Path
import copy
import yaml
from creative_studio.contracts import BrandContext, new_id


def load_brand_profile(path: Path | None = None) -> dict:
    """Load brand profile from YAML file.

    Args:
        path: Path to YAML file. Defaults to fixtures/brand_profile.yaml

    Returns:
        dict with keys: branding, audience, creativeGuidelines, userPreferences

    Raises:
        ValueError: If any required section is missing
    """
    if path is None:
        path = Path(__file__).parent / "fixtures" / "brand_profile.yaml"

    with open(path, "r") as f:
        profile = yaml.safe_load(f)

    if not isinstance(profile, dict):
        raise ValueError(f"brand profile at {path} must be a YAML mapping, got {type(profile).__name__}")

    required_keys = {"branding", "audience", "creativeGuidelines", "userPreferences"}
    missing_keys = required_keys - set(profile.keys())

    if missing_keys:
        raise ValueError(f"Missing required sections: {missing_keys}")

    return profile


def build_brand_context(shop_meta: dict, profile: dict, connections: dict) -> BrandContext:
    """Build BrandContext from shop metadata and brand profile.

    Args:
        shop_meta: Shopify shop metadata (name, url, industry, description)
        profile: Brand profile dict from load_brand_profile()
        connections: Platform connections dict (e.g., {"shopify": {"connected": True}})

    Returns:
        BrandContext instance

    Raises:
        ValueError: If validation fails (pydantic)
    """
    business = {
        "brandName": shop_meta.get("name"),
        "website": shop_meta.get("url"),
        "industry": shop_meta.get("industry", "Fashion & Apparel"),
    }

    description = shop_meta.get("description", "")
    if description:
        business["description"] = description

    brand_ctx = BrandContext(
        id=new_id("brand"),
        business=business,
        branding=copy.deepcopy(profile["branding"]),
        audience=copy.deepcopy(profile["audience"]),
        creative_guidelines=copy.deepcopy(profile["creativeGuidelines"]),
        user_preferences=copy.deepcopy(profile["userPreferences"]),
        platform_connections=copy.deepcopy(connections),
        source="ingestion",
    )

    return brand_ctx
