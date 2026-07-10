"""SQLAlchemy engine + Session factory for the `ai_layer` Neon schema.

Runtime uses the pooled DATABASE_URL (PgBouncer) with prepared statements OFF;
migrations use the direct MIGRATION_DATABASE_URL. No SQLite fallback."""
from __future__ import annotations

import os
import time

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

SCHEMA = "ai_layer"


def to_psycopg3(url: str) -> str:
    if not url:
        raise RuntimeError("DATABASE_URL is required (ai-layer has no SQLite fallback)")
    if url.startswith("postgresql+"):
        return url
    return url.replace("postgres://", "postgresql+psycopg://", 1).replace(
        "postgresql://", "postgresql+psycopg://", 1)


_engine: Engine | None = None
_Session: sessionmaker | None = None


def get_engine() -> Engine:
    global _engine, _Session
    if _engine is None:
        url = to_psycopg3(os.environ.get("DATABASE_URL", ""))
        _engine = create_engine(
            url,
            pool_pre_ping=True,   # Neon scale-to-zero kills idle conns
            pool_recycle=300,
            pool_size=5,
            max_overflow=5,
            # PgBouncer transaction pooling rejects prepared statements AND the
            # `options=search_path` startup param, so neither is set here — every table
            # is schema-qualified via MetaData(schema="ai_layer") instead.
            connect_args={"prepare_threshold": None},
        )
        _Session = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Session:
    get_engine()
    assert _Session is not None
    return _Session()


def preflight(retries: int = 3, delay: float = 1.5) -> bool:
    eng = get_engine()
    last: Exception | None = None
    for i in range(1, retries + 1):
        try:
            with eng.connect() as c:
                c.execute(text("SELECT 1"))
            return True
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(delay * i)
    raise RuntimeError(f"Neon preflight failed after {retries} tries: {last}")


def reset_engine() -> None:
    """Dispose the cached engine so a later call re-reads DATABASE_URL (tests)."""
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _Session = None
