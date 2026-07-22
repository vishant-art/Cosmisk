# tests/ingestion/test_brand_profile.py
from pathlib import Path
import pytest
import yaml
from pydantic import ValidationError
from creative_studio.contracts import BrandContext
from creative_studio.ingestion.brand_profile import load_brand_profile, build_brand_context


def test_profile_loads_with_all_sections():
    """Default-path load returns dict with all four required sections."""
    profile = load_brand_profile()

    assert "branding" in profile
    assert "audience" in profile
    assert "creativeGuidelines" in profile
    assert "userPreferences" in profile

    assert profile["branding"]["positioning"] == "Premium Indian ethnic menswear"


def test_profile_missing_section_raises(tmp_path):
    """Missing required section raises ValueError."""
    incomplete_yaml = {
        "branding": {"positioning": "test"},
        "audience": {"gender": "male"},
        # Missing creativeGuidelines and userPreferences
    }

    yaml_file = tmp_path / "incomplete.yaml"
    with open(yaml_file, "w") as f:
        yaml.dump(incomplete_yaml, f)

    with pytest.raises(ValueError):
        load_brand_profile(yaml_file)


def test_profile_non_mapping_yaml_raises(tmp_path):
    """Non-mapping YAML (list) raises ValueError."""
    yaml_file = tmp_path / "list.yaml"
    with open(yaml_file, "w") as f:
        f.write("- a\n- b\n")

    with pytest.raises(ValueError):
        load_brand_profile(yaml_file)


def test_build_brand_context_valid():
    """build_brand_context assembles valid BrandContext."""
    shop_meta = {
        "name": "Pratap Sons",
        "url": "https://pratapsons.com",
        "industry": "Fashion & Apparel",
        "description": "Premium ethnic wear"
    }
    profile = load_brand_profile()
    connections = {
        "shopify": {"connected": True}
    }

    brand_ctx = build_brand_context(shop_meta, profile, connections)

    assert isinstance(brand_ctx, BrandContext)
    assert brand_ctx.business["brandName"] == "Pratap Sons"
    assert brand_ctx.business["website"] == "https://pratapsons.com"
    assert brand_ctx.business["industry"] == "Fashion & Apparel"
    assert brand_ctx.business["description"] == "Premium ethnic wear"

    doc = brand_ctx.to_doc()
    assert doc["creativeGuidelines"]["preferredLighting"] == "Warm natural"
    assert brand_ctx.source == "ingestion"


def test_build_brand_context_requires_connection():
    """build_brand_context raises ValidationError if no connected platform."""
    shop_meta = {
        "name": "Test Shop",
        "url": "https://test.com"
    }
    profile = load_brand_profile()
    connections = {}  # No connections

    with pytest.raises(ValidationError):
        build_brand_context(shop_meta, profile, connections)
