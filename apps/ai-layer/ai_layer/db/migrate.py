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
    # Migrations ship INSIDE the package (ai_layer/migrations) so this works both from
    # the source tree and from a pip-installed wheel / Docker image. Build the Alembic
    # Config programmatically — no on-disk alembic.ini needed at runtime (env.py guards
    # its fileConfig call on config_file_name being set).
    mig = Path(__file__).resolve().parent.parent / "migrations"  # ai_layer/migrations
    cfg = Config()
    cfg.set_main_option("script_location", str(mig))
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    upgrade_head()
    print("ai_layer migrations applied (head).")
