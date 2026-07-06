"""Apply Alembic migrations. Run: `python -m ai_layer.db.migrate` (uses
MIGRATION_DATABASE_URL). NOT invoked on container boot — deploy/demo runs it once."""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from ai_layer.db.engine import SCHEMA


def include_name(name, type_, parent_names):
    """Alembic reflection filter: only the ai_layer schema (never public/drizzle)."""
    if type_ == "schema":
        return name == SCHEMA
    return True


def include_object(obj, name, type_, reflected, compare_to):
    """Alembic autogenerate filter: only tables in the ai_layer schema."""
    if type_ == "table":
        return getattr(obj, "schema", None) == SCHEMA
    return True


def upgrade_head() -> None:
    root = Path(__file__).resolve().parents[2]  # apps/ai-layer
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    upgrade_head()
    print("ai_layer migrations applied (head).")
