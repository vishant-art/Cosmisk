# tests/contracts/test_repository_contracts.py
import pytest
from pydantic import ValidationError
from creative_studio.contracts.base import new_id
from creative_studio.contracts.brand_context import BrandContext
from creative_studio.contracts.product import Product
from creative_studio.contracts.campaign import Campaign

def make_brand(**over):
    d = dict(id=new_id("brand"), business={"brandName": "TailorX", "industry": "Fashion"},
             branding={}, audience={}, platform_connections={"shopify": {"connected": True}})
    d.update(over); return d

def test_brand_context_valid(): BrandContext(**make_brand())

def test_brand_context_requires_connected_platform():
    with pytest.raises(ValidationError):
        BrandContext(**make_brand(platform_connections={"shopify": {"connected": False}}))

def test_product_requires_title_price_and_image():
    with pytest.raises(ValidationError):
        Product(id=new_id("product"), commercial={"title": "Suit"}, original_assets={"images": []})
    Product(id=new_id("product"), commercial={"title": "Suit", "price": "199"},
            original_assets={"images": [{"r2Uri": "r2://b/k.png"}]})

def test_campaign_requires_platform():
    with pytest.raises(ValidationError):
        Campaign(id=new_id("campaign"), campaign_info={"campaignName": "S", "objective": "Sales"}, platforms={})


# --- Controller-resolved rule coverage (Task 3 ambiguity resolutions) ---

def test_product_pending_uri_is_accepted():
    p = Product(id=new_id("product"), commercial={"title": "Suit", "price": "199"},
                original_assets={"images": [{"r2Uri": "pending:upload-1"}]})
    assert p.object_type == "Product"

def test_product_image_missing_r2uri_rejected():
    with pytest.raises(ValidationError):
        Product(id=new_id("product"), commercial={"title": "Suit", "price": "199"},
                original_assets={"images": [{"r2Uri": ""}]})

def test_product_has_cutout_property():
    p = Product(id=new_id("product"), commercial={"title": "Suit", "price": "199"},
                original_assets={"images": [{"r2Uri": "pending:upload-1"}]})
    assert p.has_cutout is False
    p2 = Product(id=new_id("product"), commercial={"title": "Suit", "price": "199"},
                 original_assets={"images": [{"r2Uri": "pending:upload-1"}]},
                 derived_assets={"transparentCutout": {"r2Uri": "r2://b/cutout.png"}})
    assert p2.has_cutout is True

def test_brand_context_and_campaign_object_types():
    brand = BrandContext(**make_brand())
    campaign = Campaign(id=new_id("campaign"), campaign_info={"campaignName": "S", "objective": "Sales"},
                         platforms={"meta": True})
    assert brand.object_type == "BrandContext"
    assert campaign.object_type == "Campaign"
