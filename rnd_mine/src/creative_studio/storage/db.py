from __future__ import annotations
import asyncpg
from creative_studio.config import asyncpg_dsn

async def connect(dsn: str) -> asyncpg.Connection:
    return await asyncpg.connect(asyncpg_dsn(dsn))

async def create_pool(dsn: str, min_size: int = 1, max_size: int = 5) -> asyncpg.Pool:
    return await asyncpg.create_pool(asyncpg_dsn(dsn), min_size=min_size, max_size=max_size)
