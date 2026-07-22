from __future__ import annotations
import os
import asyncpg
import pytest
from creative_studio.config import get_settings
from creative_studio.contracts import CreativeSpec, Product
from creative_studio.contracts.base import new_id
from creative_studio.storage.repositories import make_repositories

def _resolve_migration_dsn() -> str:
    try:
        return get_settings().migration_database_url
    except Exception:
        return os.environ.get("MIGRATION_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not _resolve_migration_dsn(),
    reason="MIGRATION_DATABASE_URL not set; skipping live Postgres repository tests",
)
asyncio_session = pytest.mark.asyncio(loop_scope="session")

@pytest.fixture(scope="session")
def repos(repo_pool):
    pool, schema = repo_pool
    return make_repositories(pool, schema)

def make_product(**over):
    d = dict(id=new_id("product"), commercial={"title": "Suit", "price": "199"},
             original_assets={"images": [{"r2Uri": "r2://b/k.png"}]})
    d.update(over)
    return Product(**d)

def make_creative_spec(**over):
    d = dict(id=new_id("creative"),
             generation_context={"creativePreference": "Luxury UGC", "language": "English"},
             product={"productId": "product_1"}, messaging={"cta": "Shop Now"})
    d.update(over)
    return CreativeSpec(**d)

@asyncio_session
async def test_product_round_trip(repos):
    product = make_product()
    await repos.products.insert(product)
    fetched = await repos.products.get(product.id)
    assert fetched.to_doc() == product.to_doc()

@asyncio_session
async def test_insert_only_repo_rejects_duplicate(repos):
    spec = make_creative_spec()
    await repos.creative_specs.insert(spec)
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await repos.creative_specs.insert(spec)

@asyncio_session
async def test_mutable_repo_upserts(repos):
    product = make_product()
    await repos.products.upsert(product)
    updated = make_product(id=product.id, commercial={"title": "Suit", "price": "249"})
    await repos.products.upsert(updated)
    fetched = await repos.products.get(product.id)
    assert fetched.to_doc() == updated.to_doc()

def test_planning_repos_have_no_upsert(repos):
    assert not hasattr(repos.creative_specs, "upsert")
    assert hasattr(repos.products, "upsert")

@asyncio_session
async def test_list_ids_returns_inserted(repos):
    spec1 = make_creative_spec()
    spec2 = make_creative_spec()
    await repos.creative_specs.insert(spec1)
    await repos.creative_specs.insert(spec2)
    ids = await repos.creative_specs.list_ids()
    assert spec1.id in ids
    assert spec2.id in ids
