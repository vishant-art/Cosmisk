from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Generic, TypeVar
import asyncpg
from creative_studio.contracts import (
    ContractBase, BrandContext, Product, Campaign, CreativeSpec,
    CharacterSheet, ShotSpec, AssetManifest, QAReport,
)

_IDENTIFIER_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
T = TypeVar("T", bound=ContractBase)

class DocRepository(Generic[T]):
    def __init__(self, pool: asyncpg.Pool, table: str, model: type[T], schema: str = "creative_studio"):
        if not _IDENTIFIER_RE.match(schema):
            raise ValueError(f"invalid schema name: {schema!r}")
        if not _IDENTIFIER_RE.match(table):
            raise ValueError(f"invalid table name: {table!r}")
        self.pool = pool
        self.table = table
        self.model = model
        self.schema = schema

    async def insert(self, obj: T) -> None:
        await self.pool.execute(
            f"INSERT INTO {self.schema}.{self.table} (id, doc) VALUES ($1, $2::jsonb)",
            obj.id, json.dumps(obj.to_doc()),
        )

    async def get(self, obj_id: str) -> T | None:
        row = await self.pool.fetchrow(
            f"SELECT doc FROM {self.schema}.{self.table} WHERE id = $1", obj_id,
        )
        if row is None:
            return None
        return self.model.model_validate(json.loads(row["doc"]))

    async def list_ids(self, limit: int = 50) -> list[str]:
        rows = await self.pool.fetch(
            f"SELECT id FROM {self.schema}.{self.table} ORDER BY created_at DESC LIMIT $1", limit,
        )
        return [row["id"] for row in rows]

class MutableDocRepository(DocRepository[T]):
    async def upsert(self, obj: T) -> None:
        await self.pool.execute(
            f"INSERT INTO {self.schema}.{self.table} (id, doc) VALUES ($1, $2::jsonb) "
            f"ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()",
            obj.id, json.dumps(obj.to_doc()),
        )

@dataclass
class Repositories:
    brand_contexts: MutableDocRepository
    products: MutableDocRepository
    campaigns: MutableDocRepository
    creative_specs: DocRepository
    character_sheets: DocRepository
    shot_specs: DocRepository
    asset_manifests: DocRepository
    qa_reports: DocRepository

def make_repositories(pool: asyncpg.Pool, schema: str = "creative_studio") -> Repositories:
    return Repositories(
        brand_contexts=MutableDocRepository(pool, "brand_contexts", BrandContext, schema),
        products=MutableDocRepository(pool, "products", Product, schema),
        campaigns=MutableDocRepository(pool, "campaigns", Campaign, schema),
        creative_specs=DocRepository(pool, "creative_specs", CreativeSpec, schema),
        character_sheets=DocRepository(pool, "character_sheets", CharacterSheet, schema),
        shot_specs=DocRepository(pool, "shot_specs", ShotSpec, schema),
        asset_manifests=DocRepository(pool, "asset_manifests", AssetManifest, schema),
        qa_reports=DocRepository(pool, "qa_reports", QAReport, schema),
    )
