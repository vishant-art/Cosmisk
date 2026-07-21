# Creative Studio Working Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the self-contained Creative Studio v2 working copy in `rnd_mine/` per `rnd_mine/docs/Cosmisk Creative Studio Working Copy Design.md`.

**Architecture:** Nine JSON contracts (Pydantic v2) flow through ingestion -> planning (OpenRouter) -> asyncio orchestration -> Fal generation (keyframe -> BiRefNet+BRIA replacement -> Seedance image-to-video) -> ffmpeg composition -> R2 export. Postgres JSONB persistence in a dedicated `creative_studio` schema on the existing Neon DB.

**Tech Stack:** Python 3.11+, Pydantic v2 + pydantic-settings, httpx, fal-client, asyncpg (no ORM), boto3 (R2), FastAPI + uvicorn, PyYAML, pytest + pytest-asyncio, ffmpeg/ffprobe binaries.

## Global Constraints

- Everything lives under `rnd_mine/`; never import from or modify `apps/` or `server/`.
- All contract JSON uses camelCase aliases; `schemaVersion` is exactly `"2.0"`.
- Planning objects (CreativeSpec, CharacterSheet, ShotSpec) and outputs (AssetManifest, QAReport) are immutable: repositories expose insert and get only, no update.
- DDL runs only on `MIGRATION_DATABASE_URL` (direct Neon), runtime queries only on `DATABASE_URL` (pooler).
- `FAL_ADMIN_KEY` is used only by the balance reader, never by render adapters.
- Default mode is dry-run (zero Fal spend). `--live-images` and `--live-video` gate spend; `--live-video` requires an explicit printed estimate + confirmation.
- No logo path exists anywhere: no branding overlay stage, `showBrandLogo` forced false, `logo`, `watermark`, `text` permanently in the negative prompt.
- Seedance durations are discrete `{4,5,6,8,10,12,15}` seconds; clips are generated at the smallest allowed duration >= the shot duration and trimmed to the planned duration in composition.
- Config values are stripped of surrounding whitespace (the env file has a stray leading space in one key).
- Run tests with `python -m pytest` (never bare `pytest`), from `rnd_mine/` as cwd.
- Conventional commits, one per task, scoped `rnd(creative-studio)`. Example: `feat(rnd/creative-studio): add contract base`.
- Secrets: never print env values; tests that need live keys are skipped automatically when the key is absent (`pytest.mark.skipif`).

## File Map (final state)

```
rnd_mine/
  pyproject.toml
  src/creative_studio/
    __init__.py  __main__.py  config.py
    contracts/{__init__,base,brand_context,product,campaign,creative_spec,character_sheet,shot_spec,generation_task,asset_manifest,qa_report}.py
    storage/{__init__,db,migrations_runner,repositories,r2}.py
    storage/migrations/001_init.sql
    ingestion/{__init__,brand_profile,shopify,meta,google_ads}.py
    ingestion/fixtures/{meta_campaigns.json,google_campaigns.json,shopify_products.json}
    planning/{__init__,llm,context_builder,creative_intelligence,character_generator,story_planner}.py
    prompts/{__init__,registry}.py
    prompts/definitions/{creative_intelligence.yaml,character_generator.yaml,story_planner.yaml}
    generation/{__init__,builders,workers}.py
    generation/adapters/{__init__,base,fal_image,fal_birefnet,fal_bria,fal_video,fal_tts,balance}.py
    orchestration/{__init__,run_state,orchestrator}.py
    replacement/{__init__,pipeline}.py
    qa/{__init__,checks,report}.py
    composition/{__init__,ffmpeg}.py
    export/{__init__,exporter}.py
    interfaces/{__init__,cli,api}.py
  tests/  (mirrors src; conftest.py at root)
```

---

# Phase A — Foundations

### Task 1: Package scaffold and config

**Files:**
- Create: `rnd_mine/pyproject.toml`, `rnd_mine/src/creative_studio/__init__.py`, `rnd_mine/src/creative_studio/config.py`
- Test: `rnd_mine/tests/test_config.py`, `rnd_mine/tests/conftest.py`

**Interfaces:**
- Produces: `creative_studio.config.Settings` (pydantic-settings; snake_case fields for every env key listed in the design §3), `get_settings() -> Settings` (cached), `asyncpg_dsn(raw: str) -> str` (drops `channel_binding` query param, keeps `sslmode`), `require_ffmpeg() -> None` (raises `RuntimeError` with install hint if `ffmpeg`/`ffprobe` not on PATH), `REPO_ROOT: Path`.

- [ ] **Step 1: Write pyproject**

```toml
[project]
name = "creative-studio"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.7", "pydantic-settings>=2.2", "httpx>=0.27", "fal-client>=0.5",
  "asyncpg>=0.29", "boto3>=1.34", "fastapi>=0.111", "uvicorn>=0.30", "pyyaml>=6.0",
]
[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.23"]
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
[tool.setuptools.packages.find]
where = ["src"]
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create venv and install**

Run from `rnd_mine/`: `python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"`
Expected: install succeeds. All later commands use `rnd_mine/.venv/Scripts/python`.

- [ ] **Step 3: Write failing test**

```python
# tests/test_config.py
from creative_studio.config import Settings, asyncpg_dsn, get_settings

def test_settings_load_from_root_env():
    s = get_settings()
    assert s.openrouter_api_key.startswith("sk-or-")
    assert s.fal_admin_key == s.fal_admin_key.strip()
    assert s.storage_bucket == "cosmisk-mvp-v1"

def test_asyncpg_dsn_strips_channel_binding():
    raw = "postgresql://u:p@h/db?sslmode=require&channel_binding=require"
    assert asyncpg_dsn(raw) == "postgresql://u:p@h/db?sslmode=require"
```

- [ ] **Step 4: Verify it fails** — `python -m pytest tests/test_config.py -v` → import error.

- [ ] **Step 5: Implement config.py**

```python
from __future__ import annotations
import shutil
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(REPO_ROOT / ".env"), extra="ignore")
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    creative_studio_planner_model: str = "openai/gpt-5.4-mini"  # verified in Task 12
    fal_key: str
    fal_admin_key: str = ""
    shopify_store: str
    shopify_token: str
    shopify_api_version: str = "2026-07"
    meta_access_token: str = ""
    meta_ad_account: str = ""
    database_url: str
    migration_database_url: str
    storage_endpoint: str
    storage_access_key_id: str
    storage_secret_access_key: str
    storage_bucket: str
    storage_region: str = "auto"

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

def asyncpg_dsn(raw: str) -> str:
    parts = urlparse(raw)
    q = [(k, v) for k, v in parse_qsl(parts.query) if k != "channel_binding"]
    return urlunparse(parts._replace(query=urlencode(q)))

def require_ffmpeg() -> None:
    for exe in ("ffmpeg", "ffprobe"):
        if shutil.which(exe) is None:
            raise RuntimeError(f"{exe} not found on PATH; install ffmpeg (winget install Gyan.FFmpeg)")

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 6: Verify pass** — `python -m pytest tests/test_config.py -v` → 2 passed.
- [ ] **Step 7: Commit** — `git add rnd_mine/pyproject.toml rnd_mine/src rnd_mine/tests && git commit -m "feat(rnd/creative-studio): scaffold package and config"`

### Task 2: Contract base

**Files:**
- Create: `src/creative_studio/contracts/__init__.py`, `src/creative_studio/contracts/base.py`
- Test: `tests/contracts/test_base.py`

**Interfaces:**
- Produces: `ContractBase` (pydantic model: `schema_version="2.0"`, `object_type: str`, `id: str`, `created_at`/`updated_at: str|None` ISO-8601 Z, `status: str="active"`, `source: str|None`; camelCase aliases via `alias_generator=to_camel`, `populate_by_name=True`, serialization helper `to_doc(self) -> dict` = `model_dump(mode="json", by_alias=True, exclude_none=True)`), `new_id(prefix: str) -> str` (`prefix_` + 12 hex), `utc_now() -> str`.

- [ ] **Step 1: Failing test**

```python
# tests/contracts/test_base.py
from creative_studio.contracts.base import ContractBase, new_id, utc_now

class Thing(ContractBase):
    object_type: str = "Thing"
    some_field: int = 1

def test_camel_case_round_trip():
    t = Thing(id=new_id("thing"))
    doc = t.to_doc()
    assert doc["schemaVersion"] == "2.0" and doc["objectType"] == "Thing"
    assert "someField" in doc and "createdAt" in doc
    assert Thing.model_validate(doc).some_field == 1

def test_new_id_prefix():
    assert new_id("prod").startswith("prod_") and len(new_id("prod")) == 5 + 12

def test_utc_now_is_iso_z():
    assert utc_now().endswith("Z") and "T" in utc_now()
```

- [ ] **Step 2: Verify fail** — `python -m pytest tests/contracts/test_base.py -v`
- [ ] **Step 3: Implement**

```python
# src/creative_studio/contracts/base.py
from __future__ import annotations
import secrets
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"

def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

class ContractBase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")
    schema_version: str = "2.0"
    object_type: str
    id: str
    created_at: str = Field(default_factory=utc_now)
    updated_at: str | None = None
    status: str = "active"
    source: str | None = None

    def to_doc(self) -> dict:
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)
```

- [ ] **Step 4: Verify pass**, **Step 5: Commit** `feat(rnd/creative-studio): contract base with camelCase round-trip`

### Task 3: Repository contracts (BrandContext, Product, Campaign)

**Files:**
- Create: `contracts/brand_context.py`, `contracts/product.py`, `contracts/campaign.py`
- Test: `tests/contracts/test_repository_contracts.py`

**Interfaces:**
- Produces: `BrandContext(ContractBase)` with typed sections `business: dict`, `branding: dict`, `audience: dict`, `creative_guidelines: dict`, `historical_insights: dict`, `platform_connections: dict`, `user_preferences: dict`; validator: `business["brandName"]` and `business["industry"]` present, at least one of `platform_connections` `{shopify,meta,googleAds}` has `connected: true`.
- `Product(ContractBase)` with `shopify: dict`, `commercial: dict` (title+price required), `variants: list[dict]`, `collections: list[str]`, `original_assets: dict` (>=1 image, each with `r2Uri`), `derived_assets: dict`, `placement_assets: dict`, `ai_metadata: dict`, `provider_metadata: dict`. `has_cutout` property (`derived_assets.get("transparentCutout")` truthy).
- `Campaign(ContractBase)` with `campaign_info: dict` (campaignName+objective required), `platforms: dict` (>=1 true), `products: list[str]`, `audience: dict`, `creative_summary: dict`, `performance: dict`, `learnings: dict`, `assets: dict`.
- All spec sections not individually typed remain dicts inside the JSONB doc (spec §5.3 self-contained documents; deep typing is YAGNI at this stage).

- [ ] **Step 1: Failing tests** (one happy + one violation per model)

```python
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
```

- [ ] **Step 2: Verify fail** — `python -m pytest tests/contracts/test_repository_contracts.py -v`
- [ ] **Step 3: Implement the three models** (each `object_type` defaulted, `model_validator(mode="after")` enforcing the rules above; ~40 lines each, follow the exemplar pattern below)

```python
# src/creative_studio/contracts/brand_context.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class BrandContext(ContractBase):
    object_type: str = "BrandContext"
    business: dict = Field(default_factory=dict)
    branding: dict = Field(default_factory=dict)
    audience: dict = Field(default_factory=dict)
    creative_guidelines: dict = Field(default_factory=dict)
    historical_insights: dict = Field(default_factory=dict)
    platform_connections: dict = Field(default_factory=dict)
    user_preferences: dict = Field(default_factory=dict)
    embeddings: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if not self.business.get("brandName") or not self.business.get("industry"):
            raise ValueError("business.brandName and business.industry are required")
        if not any(v.get("connected") for v in self.platform_connections.values() if isinstance(v, dict)):
            raise ValueError("at least one connected platform required")
        return self
```

Product validator: `commercial["title"]` and `commercial["price"]` present; `original_assets["images"]` non-empty and every image has `r2Uri` (allow `pending:` prefix before upload). Campaign validator: `campaign_info["campaignName"]`, `campaign_info["objective"]`, and `any(platforms.values())`.

- [ ] **Step 4: Verify pass**, **Step 5: Commit** `feat(rnd/creative-studio): repository contracts`

### Task 4: Planning contracts (CreativeSpec, CharacterSheet, ShotSpec)

**Files:**
- Create: `contracts/creative_spec.py`, `contracts/character_sheet.py`, `contracts/shot_spec.py`
- Test: `tests/contracts/test_planning_contracts.py`

**Interfaces:**
- Produces: `CreativeSpec(ContractBase)`: sections `generation_context, marketing_objective, product, audience, messaging, creative_direction, platform, voice_strategy, constraints, references` (dicts). Validators: `generation_context["creativePreference"]` and `["language"]` present; `product["productId"]` present; `messaging["cta"]` present; `constraints["showBrandLogo"]` forced to `False` always (overwrite, do not error).
- `CharacterSheet(ContractBase)`: `creative_spec_id: str` + sections `identity, appearance, wardrobe, personality, expressions, speaking_style, reference_assets, conditioning, references`. Validators: identity+appearance+personality+speaking_style non-empty; if `status == "completed"` then `reference_assets["primaryPortrait"]["r2Uri"]` must exist (portrait is attached after generation; `status="draft"` before).
- `ShotSpec(ContractBase)`: `creative_spec_id: str`, `character_id: str`, `story_structure: dict`, `timing: Timing` (`total_duration: float`, `shot_durations: list[float]`), `global_style: dict`, `shots: list[Shot]`, `transition_rules: dict`, `rendering_rules: dict`, `references: dict`. `Shot` model: `shot_number: int`, `purpose: Literal["Hook","Product","CTA"]`, `duration: float`, `narrative: dict`, `camera: dict`, `character: dict`, `product: dict`, `dialogue: dict` (`spokenText` required), `audio: dict`, `composition: dict`, `constraints: dict`. Validators: exactly 3 shots; purposes exactly `["Hook","Product","CTA"]` in order; `shot_number` 1..3 sequential; `timing.shot_durations` matches per-shot durations; total within `10 ± 0.5`.

- [ ] **Step 1: Failing tests**

```python
# tests/contracts/test_planning_contracts.py
import pytest
from pydantic import ValidationError
from creative_studio.contracts.base import new_id
from creative_studio.contracts.creative_spec import CreativeSpec
from creative_studio.contracts.shot_spec import ShotSpec, Shot, Timing

def make_spec(**over):
    d = dict(id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        marketing_objective={"objective": "Conversions"}, product={"productId": "product_1"},
        audience={}, messaging={"cta": "Shop Now"}, creative_direction={},
        platform={"platform": "Instagram", "aspectRatio": "9:16", "maxDuration": 10},
        voice_strategy={}, constraints={"showBrandLogo": True}, references={})
    d.update(over); return d

def test_logo_always_forced_false():
    assert CreativeSpec(**make_spec()).constraints["showBrandLogo"] is False

def test_preference_required():
    with pytest.raises(ValidationError):
        CreativeSpec(**make_spec(generation_context={"language": "English"}))

def make_shot(n, purpose, dur):
    return Shot(shot_number=n, purpose=purpose, duration=dur,
                narrative={"summary": "s"}, camera={"shotType": "Medium"},
                character={"expression": "Smile"}, product={"visibility": "High"},
                dialogue={"spokenText": "hello"}, audio={}, composition={}, constraints={})

def make_shotspec(durs=(3, 4, 3), purposes=("Hook", "Product", "CTA")):
    shots = [make_shot(i + 1, p, d) for i, (p, d) in enumerate(zip(purposes, durs))]
    return ShotSpec(id=new_id("shotspec"), creative_spec_id="creative_1", character_id="character_1",
                    story_structure={}, timing=Timing(total_duration=sum(durs), shot_durations=list(durs)),
                    global_style={"aspectRatio": "9:16"}, shots=shots,
                    transition_rules={}, rendering_rules={}, references={})

def test_shotspec_valid(): make_shotspec()

def test_shotspec_rejects_wrong_order():
    with pytest.raises(ValidationError):
        make_shotspec(purposes=("Product", "Hook", "CTA"))

def test_shotspec_rejects_bad_total():
    with pytest.raises(ValidationError):
        make_shotspec(durs=(5, 5, 5))
```

- [ ] **Step 2: Verify fail**, **Step 3: Implement** (ShotSpec exemplar)

```python
# src/creative_studio/contracts/shot_spec.py
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel
from .base import ContractBase

class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")

class Timing(_Camel):
    total_duration: float
    shot_durations: list[float]

class Shot(_Camel):
    shot_number: int
    purpose: Literal["Hook", "Product", "CTA"]
    duration: float
    narrative: dict; camera: dict; character: dict; product: dict
    dialogue: dict; audio: dict = Field(default_factory=dict)
    composition: dict = Field(default_factory=dict); constraints: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if not self.dialogue.get("spokenText"):
            raise ValueError("dialogue.spokenText required")
        return self

class ShotSpec(ContractBase):
    object_type: str = "ShotSpec"
    creative_spec_id: str
    character_id: str
    story_structure: dict = Field(default_factory=dict)
    timing: Timing
    global_style: dict
    shots: list[Shot]
    transition_rules: dict = Field(default_factory=dict)
    rendering_rules: dict = Field(default_factory=dict)
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if [s.purpose for s in self.shots] != ["Hook", "Product", "CTA"]:
            raise ValueError("exactly 3 shots in Hook, Product, CTA order")
        if [s.shot_number for s in self.shots] != [1, 2, 3]:
            raise ValueError("shot numbers must be 1,2,3")
        if [float(s.duration) for s in self.shots] != [float(d) for d in self.timing.shot_durations]:
            raise ValueError("timing.shotDurations must match shot durations")
        if not (9.5 <= sum(self.timing.shot_durations) <= 10.5):
            raise ValueError("total duration must be 10s ± 0.5")
        return self
```

CreativeSpec: `model_validator` checks preference/language/productId/cta then sets `self.constraints["showBrandLogo"] = False`. CharacterSheet per the Interfaces block.

- [ ] **Step 4: Verify pass**, **Step 5: Commit** `feat(rnd/creative-studio): planning contracts with three-shot invariants`

### Task 5: Execution and output contracts (GenerationTask, AssetManifest, QAReport)

**Files:**
- Create: `contracts/generation_task.py`, `contracts/asset_manifest.py`, `contracts/qa_report.py`; update `contracts/__init__.py` to re-export all nine.
- Test: `tests/contracts/test_output_contracts.py`

**Interfaces:**
- Produces: `GenerationTask(ContractBase)`: `creative_spec_id`, `context: dict`, `global_configuration: dict` (resolution "1080x1920", fps 30, duration, aspectRatio "9:16"), `shot_tasks: list[ShotTask]` (exactly 3; `ShotTask`: `shot_number, duration, purpose, image_task: dict, video_task: dict, voice_task: dict, product_task: dict, synchronization: dict`), `asset_references: dict`, `execution_rules: dict` (default `{"parallelGeneration": True, "retryLimit": 2, "requiresQA": True}`), `references: dict`. Never persisted.
- `AssetManifest(ContractBase)`: `creative_spec_id`, `generation_summary: dict`, `source_references: dict`, `image_assets: list[dict]`, `video_assets: list[dict]`, `audio_assets: list[dict]`, `deliverables: dict`, `preview_assets: dict`, `storage_metadata: dict`, `references: dict`. Validator: exactly 3 entries with `type=="shot_clip"` in video_assets, exactly 3 with `type=="keyframe"` in image_assets, `deliverables["primaryVideo"]["r2Uri"]` present.
- `QAReport(ContractBase)`: `creative_spec_id`, `overall_result: dict`, `image_qa/video_qa/voice_qa/product_qa/composition_qa: dict`, `compliance: dict`, `issues: list[dict]` (severity in {"info","warning","critical"}), `recommendations: dict`, `references: dict`. Validator: if any issue severity=="critical" then `overall_result["approvedForExport"]` must be False (raise otherwise).

- [ ] **Step 1: Failing tests** (manifest counts; QA critical-blocks-export; GenerationTask 3 shot tasks)

```python
# tests/contracts/test_output_contracts.py
import pytest
from pydantic import ValidationError
from creative_studio.contracts.base import new_id
from creative_studio.contracts.qa_report import QAReport

def test_critical_issue_blocks_export():
    with pytest.raises(ValidationError):
        QAReport(id=new_id("qa"), creative_spec_id="creative_1",
                 overall_result={"approvedForExport": True},
                 issues=[{"severity": "critical", "category": "product", "message": "misaligned"}],
                 references={})
```

(plus the two count tests, same construction style as Task 4's.)

- [ ] **Step 2-4: fail, implement per Interfaces, pass**
- [ ] **Step 5: Commit** `feat(rnd/creative-studio): execution and output contracts`

# Phase B — Storage

### Task 6: Migration runner + initial DDL

**Files:**
- Create: `storage/migrations/001_init.sql`, `storage/migrations_runner.py`, `storage/db.py`
- Test: `tests/storage/test_migrations.py`

**Interfaces:**
- Produces: `run_migrations(dsn: str, schema: str = "creative_studio") -> list[int]` (applies pending, returns versions applied; SQL files use `{{schema}}` placeholder substituted at apply time so tests can use a throwaway schema), `db.connect(dsn) -> asyncpg.Connection`, `db.pool(dsn) -> asyncpg.Pool`.
- `001_init.sql`: `CREATE SCHEMA IF NOT EXISTS {{schema}}; CREATE EXTENSION IF NOT EXISTS vector;` then `{{schema}}.schema_migrations(version int pk, applied_at timestamptz default now())`, eight doc tables (`brand_contexts, products, campaigns, creative_specs, character_sheets, shot_specs, asset_manifests, qa_reports`) each `(id text primary key, doc jsonb not null, embedding vector(1024), created_at timestamptz not null default now(), updated_at timestamptz not null default now())`, and `generation_runs(id text primary key, creative_spec_id text not null, status text not null, steps jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`.

- [ ] **Step 1: Failing test** — applies migrations into schema `creative_studio_test_<hex>`, asserts the nine tables exist via `information_schema.tables`, asserts re-run applies nothing, then `DROP SCHEMA ... CASCADE`. Uses `asyncpg_dsn(get_settings().migration_database_url)`; module-level `pytest.mark.skipif` when `MIGRATION_DATABASE_URL` unset.
- [ ] **Step 2: Verify fail**, **Step 3: Implement** (runner: read sorted `*.sql`, substitute schema, wrap each file in a transaction, insert version row; `CREATE EXTENSION` is global on Neon and idempotent).
- [ ] **Step 4: Verify pass** (live against Neon direct URL). **Step 5: Commit** `feat(rnd/creative-studio): postgres schema + migration runner`

### Task 7: Document repositories

**Files:**
- Create: `storage/repositories.py`
- Test: `tests/storage/test_repositories.py`

**Interfaces:**
- Produces: `DocRepository(pool, table: str, model: type[ContractBase], schema: str = "creative_studio")` with `async insert(obj) -> None` (`INSERT ... (id, doc) VALUES ($1, $2::jsonb)` — no upsert for planning/output tables), `async get(id) -> model|None`, `async list_ids(limit=50) -> list[str]`; `MutableDocRepository` adds `async upsert(obj)` (used only by brand_contexts/products/campaigns). Factory `make_repositories(pool, schema="creative_studio") -> Repositories` dataclass with attributes `brand_contexts, products, campaigns` (mutable) and `creative_specs, character_sheets, shot_specs, asset_manifests, qa_reports` (insert-only). `RunStateStore` lives in Task 19, not here.

- [ ] **Step 1: Failing test** — round-trip a `Product` through insert/get in a throwaway schema (reuse Task 6 fixture in `tests/storage/conftest.py`: session-scoped schema create + drop); assert `insert` twice raises (pk violation) for insert-only repo and `upsert` twice succeeds for products.
- [ ] **Step 2-4: fail, implement, pass** (serialize with `obj.to_doc()` + `json.dumps`; deserialize `model.model_validate(json.loads(row["doc"]))`).
- [ ] **Step 5: Commit** `feat(rnd/creative-studio): JSONB repositories (insert-only planning)`

### Task 8: R2 asset store

**Files:**
- Create: `storage/r2.py`
- Test: `tests/storage/test_r2.py`

**Interfaces:**
- Produces: `R2Store(settings)` with `put_bytes(key: str, data: bytes, content_type: str) -> str` (returns `r2://{bucket}/{key}`), `get_bytes(key) -> bytes`, `exists(key) -> bool`, `presign(key, expires=3600) -> str`, `key_for(kind, **parts) -> str` implementing the design §6 layout (kinds: `product_original, product_cutout, product_mask, portrait, keyframe_raw, keyframe_replaced, clip, voice, subtitles, final_video, final_static, thumbnail`). boto3 client with `endpoint_url=settings.storage_endpoint`, path-style addressing.

- [ ] **Step 1: Failing unit test** for `key_for` (pure function, exact expected keys, e.g. `key_for("keyframe_raw", generation_id="g1", shot=2) == "creative-studio/runs/g1/keyframes/shot2/raw.png"`).
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Live smoke (env-guarded)** — `test_r2_round_trip` put/get/exists/delete under `creative-studio/_smoke/`; skipif no `STORAGE_ACCESS_KEY_ID`. Run: `python -m pytest tests/storage/test_r2.py -v` → passed.
- [ ] **Step 6: Commit** `feat(rnd/creative-studio): R2 asset store with canonical key layout`

# Phase C — Ingestion

### Task 9: Brand profile seed + BrandContext assembly

**Files:**
- Create: `ingestion/brand_profile.py`, `ingestion/fixtures/brand_profile.yaml` (real content for pratapsons: positioning/tone/audience placeholders the user can edit)
- Test: `tests/ingestion/test_brand_profile.py`

**Interfaces:**
- Produces: `load_brand_profile(path: Path | None = None) -> dict` (YAML with keys `branding, audience, creativeGuidelines, userPreferences`), `build_brand_context(shop_meta: dict, profile: dict, connections: dict) -> BrandContext` (merges Shopify shop name/domain into `business`, profile sections verbatim, `platform_connections` from what's live).

- [ ] Steps: failing test (profile loads; build_brand_context yields valid BrandContext with shopify connected) → implement → pass → commit `feat(rnd/creative-studio): brand profile seed + BrandContext assembly`.

### Task 10: Shopify live client + normalizer

**Files:**
- Create: `ingestion/shopify.py`, `ingestion/fixtures/shopify_products.json` (one realistic product captured from the live store during this task)
- Test: `tests/ingestion/test_shopify.py`

**Interfaces:**
- Produces: `ShopifyClient(settings)` with `async fetch_products(limit=25) -> list[dict]` (GraphQL Admin API `POST https://{store}/admin/api/{version}/graphql.json`, header `X-Shopify-Access-Token`; query products with id, title, handle, descriptionHtml, vendor, productType, tags, status, featuredMedia, media(first:10) images, variants(first:20) (id sku price selectedOptions image), collections(first:10) titles, priceRangeV2) and `async fetch_shop() -> dict` (name, url, currencyCode); `normalize_product(raw: dict) -> Product` implementing the spec §14 mapping table (provider ids into `shopify`/`provider_metadata`, images into `original_assets.images[].sourceUrl` with `r2Uri: "pending:{sourceUrl}"` until mirrored, exactly one `featured=True`).
- `async mirror_product_assets(product: Product, r2: R2Store) -> Product`: downloads each `sourceUrl` (httpx), uploads via `key_for("product_original", ...)`, replaces `pending:` URIs.

- [ ] **Step 1: Failing normalizer test** against `fixtures/shopify_products.json` (exact assertions: title, price, >=1 image, featured count == 1, `shopify.shopifyProductId` retained).
- [ ] **Step 2: Verify fail**, **Step 3: Implement client + normalizer + mirror.**
- [ ] **Step 4: Capture the fixture** — small script step: `python -m creative_studio.ingestion.shopify --capture-fixture` (writes first live product JSON to the fixtures path; add `if __name__ == "__main__"` block). Requires live keys; run once.
- [ ] **Step 5: Tests pass** (normalizer on fixture; env-guarded live test asserts >=1 product returned).
- [ ] **Step 6: Commit** `feat(rnd/creative-studio): live Shopify ingestion + normalizer`

### Task 11: Meta + Google Ads fixtures and normalizers

**Files:**
- Create: `ingestion/meta.py`, `ingestion/google_ads.py`, `ingestion/fixtures/meta_campaigns.json`, `ingestion/fixtures/google_campaigns.json`
- Test: `tests/ingestion/test_campaign_normalizers.py`

**Interfaces:**
- Produces: `meta.load_fixture() -> list[dict]`, `meta.normalize_campaign(raw: dict, product_ids: list[str]) -> Campaign` (Graph API shape: `{id,name,objective,status,start_time,stop_time,insights:{data:[{impressions,clicks,ctr,spend,actions:[...]}]},adcreatives:{data:[{title,body,call_to_action_type}]}}` per spec §15 Meta mapping); `meta.fetch_live(settings) -> list[dict]` implemented but returning fixture data with a logged warning when `META_AD_ACCOUNT` empty. Same pattern for `google_ads` (fields: `campaign{id,name,status,advertisingChannelType}`, `metrics{impressions,clicks,ctr,conversions,costMicros}` per spec §15 Google mapping). Fixture content: 2 campaigns each, realistic values (write them in this task; hooks like "POV: You finally found the perfect suit", CTR ~5%, ROAS ~6).

- [ ] Steps: failing normalizer tests (objective mapped, performance summarized, creativeSummary.primaryHook present, platforms flag set) → implement + write fixtures → pass → commit `feat(rnd/creative-studio): campaign normalizers with Meta/Google fixtures`.

# Phase D — Planning

### Task 12: OpenRouter structured-output client

**Files:**
- Create: `planning/llm.py`
- Test: `tests/planning/test_llm.py`

**Interfaces:**
- Produces: `class PlannerLLM(settings)` with `async complete_json(system: str, user: str, model_cls: type[T], max_retries: int = 2, temperature: float = 0.4) -> T`: POST `{base}/chat/completions` with `response_format={"type":"json_object"}`, parses content as JSON, `model_cls.model_validate`; on `ValidationError` retries with the error text appended to the user message; raises `PlanningError(last_error, raw)` after retries. Also `async list_models() -> list[str]` (GET `{base}/models`, ids only).
- Model id: default `openai/gpt-5.4-mini` from Settings.

- [ ] **Step 1: Failing unit test** with a fake `httpx.AsyncClient` (transport `httpx.MockTransport`): first response invalid JSON-schema-wise, second valid → returns instance, exactly 2 POSTs; and exhaustion raises `PlanningError`.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Verify the model id live** — `python -c "...list_models()..." | findstr gpt-5.4` Expected: the exact id (e.g. `openai/gpt-5.4-mini`) present. If different, change the Settings default now and note it in the commit body.
- [ ] **Step 6: Commit** `feat(rnd/creative-studio): OpenRouter planner client with validation retry`

### Task 13: Prompt registry + planner prompt definitions

**Files:**
- Create: `prompts/registry.py`, `prompts/definitions/creative_intelligence.yaml`, `prompts/definitions/character_generator.yaml`, `prompts/definitions/story_planner.yaml`
- Test: `tests/prompts/test_registry.py`

**Interfaces:**
- Produces: `PromptDefinition` (pydantic: `prompt_id, version: int, model_hint, purpose, system_prompt, template, output_object_type, changelog: list[str]`), `PromptRegistry.load(prompt_id) -> PromptDefinition` (reads YAML from `definitions/`), `render(defn, **vars) -> str` (`str.format`-style with KeyError on missing var).
- YAML content is real prompt text (write in full in this task), grounded in the three docs: creative_intelligence covers spec §16 responsibilities and instructs "return ONLY JSON matching the CreativeSpec structure" with the section skeleton inline; character_generator covers §17 (identity/appearance/wardrobe rules, wardrobe must NOT describe the advertised product); story_planner covers §18 (exactly 3 shots Hook/Product/CTA, durations from {3,4} summing to 10, dialogue per shot, camera/lighting per creative direction).

- [ ] Steps: failing registry test (loads all three, renders template vars, unknown id raises) → implement + write YAMLs → pass → commit `feat(rnd/creative-studio): versioned prompt registry + planner prompts`.

### Task 14: Context builder + three planners

**Files:**
- Create: `planning/context_builder.py`, `planning/creative_intelligence.py`, `planning/character_generator.py`, `planning/story_planner.py`
- Test: `tests/planning/test_planners.py`

**Interfaces:**
- Consumes: `PlannerLLM.complete_json`, `PromptRegistry`, repository contracts.
- Produces: `build_context(brand: BrandContext, product: Product, campaigns: list[Campaign], preference: str, max_chars: int = 24000) -> str` (ordered sections, campaigns truncated first to fit budget); `async plan_creative_spec(llm, registry, brand, product, campaigns, preference, platform="Instagram", language="English") -> CreativeSpec` (fills `generation_context/references` itself, LLM fills the rest); `async plan_character_sheet(llm, registry, spec: CreativeSpec, brand) -> CharacterSheet` (`status="draft"`, no portrait yet); `async plan_shot_spec(llm, registry, spec, sheet) -> ShotSpec`. Each stamps `source="planner"` and records `promptId/version` into `references`.

- [ ] **Step 1: Failing tests** with `FakeLLM` (returns canned valid section JSON per call): assert lineage ids wired (`sheet.creative_spec_id == spec.id`, `shot.character_id == sheet.id`), preference propagated verbatim, ShotSpec passes contract validation.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Live smoke (env-guarded, cheap)** — one real `plan_creative_spec` against OpenRouter using fixture brand/product/campaigns; assert it validates. Run once, keep skipif-gated.
- [ ] **Step 6: Commit** `feat(rnd/creative-studio): planning layer (creative spec, character, shots)`

# Phase E — Generation

### Task 15: Fal adapter base + balance reader

**Files:**
- Create: `generation/adapters/base.py`, `generation/adapters/balance.py`
- Test: `tests/generation/test_adapter_base.py`

**Interfaces:**
- Produces: `FalAdapter(settings)` base with `async submit(model_id: str, arguments: dict) -> dict` (wraps `fal_client.subscribe_async` with `FAL_KEY` set via env, single place that touches fal), `async download(url: str) -> bytes` (httpx, raises on non-200); `MODEL_IDS` dict constant: `{"image": "fal-ai/flux-2-flex", "image_fallback": "fal-ai/flux-2-pro", "cutout": "fal-ai/birefnet/v2", "placement": "fal-ai/bria/product-shot", "video_i2v": "bytedance/seedance-2.0/image-to-video", "tts": "fal-ai/minimax/speech-02-hd"}` (ids verified against `apps/ai-layer/ai_layer/creative/config.py`, June 2026). `ALLOWED_VIDEO_DURATIONS = (4, 5, 6, 8, 10, 12, 15)`; `video_duration_for(shot_seconds: float) -> int` (smallest allowed >= ceil(shot_seconds)).
- `balance.read_balance(settings) -> float | None`: GET `https://rest.alpha.fal.ai/billing/user_balance` style endpoint — copy the exact working implementation from `apps/ai-layer/tools/creative_api_liverun.py` (it reads balance with `FAL_ADMIN_KEY`); returns None when no admin key.

- [ ] Steps: failing test for `video_duration_for` (3→4, 4→4, 4.5→5, 7→8, 15→15, 16→ValueError) and MODEL_IDS completeness → implement (read the liverun balance code first, copy verbatim minus prints) → pass → commit `feat(rnd/creative-studio): fal adapter base, model ids, balance reader`.

### Task 16: Deterministic prompt builders

**Files:**
- Create: `generation/builders.py`
- Test: `tests/generation/test_builders.py` (golden tests)

**Interfaces:**
- Consumes: contracts.
- Produces: `NEGATIVE_PROMPT: str` (the prompt doc's list joined, includes `logo`, `watermark`, `text`); `build_portrait_prompt(sheet: CharacterSheet) -> str`; `build_image_prompt(shot: Shot, sheet: CharacterSheet, spec: CreativeSpec) -> ImagePrompt` (dataclass: `prompt, negative_prompt, width=1080, height=1920, reference_image_urls: list[str]`) assembling blocks in fixed order Scene, Character, Camera, Environment, Lighting, Style, Composition, Placeholder, Quality — placeholder garment phrased from `product.aiMetadata.category` + dominant colour, never brand names; `build_video_prompt(shot: Shot, sheet: CharacterSheet) -> VideoPrompt` (`prompt, duration_seconds: int, image_url: str | None`) with motion/camera text from shot.camera + shot.character.action; `build_voice_request(shots: list[Shot], spec: CreativeSpec, sheet: CharacterSheet) -> VoiceRequest` (`text` = spokenText joined with pauses, `voice_id="Wise_Woman"`, speed/energy from voice_strategy).
- Pure functions, no I/O, no randomness: same inputs must produce byte-identical outputs.

- [ ] **Step 1: Golden failing tests** — construct the Task 4 fixture ShotSpec/CharacterSheet/CreativeSpec, assert exact expected prompt strings (write the expected strings in the test; they define the contract), assert `NEGATIVE_PROMPT` contains "logo" and "watermark", assert determinism (two calls equal).
- [ ] **Step 2-4: fail, implement, pass.** **Step 5: Commit** `feat(rnd/creative-studio): deterministic prompt builders (golden-tested)`

### Task 17: Fal adapters (image, cutout, placement, video, tts)

**Files:**
- Create: `generation/adapters/fal_image.py`, `fal_birefnet.py`, `fal_bria.py`, `fal_video.py`, `fal_tts.py`
- Test: `tests/generation/test_fal_adapters.py`

**Interfaces:**
- Consumes: `FalAdapter.submit/download`, builder dataclasses, `R2Store`.
- Produces (each `async`, each returns R2 uri + metadata dict):
  - `generate_image(adapter, r2, prompt: ImagePrompt, key: str) -> tuple[str, dict]` (arguments: `{"prompt", "negative_prompt", "image_size": {"width","height"}, "num_images": 1}` + `"image_urls"` when references given; result images[0].url downloaded → `r2.put_bytes`).
  - `remove_background(adapter, r2, image_url: str, key: str) -> tuple[str, dict]` (birefnet v2, returns transparent PNG uri + mask if provided).
  - `place_product(adapter, r2, scene_url: str, product_cutout_url: str, key: str) -> tuple[str, dict]` (bria product-shot: `{"image_url": scene, "ref_image_url": cutout, "manual_placement_selection": "automatic"}`; verify exact argument names against the fal model page during implementation and pin them in a module constant).
  - `generate_clip(adapter, r2, vp: VideoPrompt, key: str) -> tuple[str, dict]` (seedance i2v: `{"prompt", "image_url", "duration": vp.duration_seconds, "generate_audio": False}`).
  - `synthesize_voice(adapter, r2, vr: VoiceRequest, key: str) -> tuple[str, dict]` (minimax speech-02-hd: `{"text", "voice_setting": {"voice_id": vr.voice_id}}`).
- URLs passed between fal calls are presigned R2 URLs (`r2.presign`), not raw `r2://` uris.

- [ ] **Step 1: Failing unit tests** with `FakeFalAdapter` (records `(model_id, arguments)`, returns canned result dicts) asserting exact model ids and argument dicts per call, and that returned uris come from `key`.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Env-guarded live smokes, one per adapter, OFF by default** — each behind `CS_LIVE_SMOKE=1` env check in addition to key presence, so `python -m pytest` never spends by accident. Do NOT run them in this task; they run during Task 26's supervised live run.
- [ ] **Step 6: Commit** `feat(rnd/creative-studio): fal render adapters (unit-faked, live-gated)`

### Task 18: Portrait flow wiring

**Files:**
- Modify: `planning/character_generator.py`
- Test: `tests/planning/test_portrait_flow.py`

**Interfaces:**
- Produces: `async finalize_character(sheet: CharacterSheet, adapter, r2, generation_id: str, live: bool) -> CharacterSheet` — when `live`, builds portrait prompt (Task 16), calls `generate_image` with `key_for("portrait", ...)`, returns a NEW CharacterSheet (new id? No: same id, `status="completed"`, `reference_assets.primaryPortrait={assetId,r2Uri,resolution,isPrimary:True}`, `updated_at` stamped) built via `model_copy(update=...)`; when dry, returns the sheet unchanged with `reference_assets.primaryPortrait={"r2Uri": "dry-run:portrait"}` and `status="completed"` so downstream validation passes.

- [ ] Steps: failing test with FakeFalAdapter + fake r2 (dict-backed `FakeR2` added to `tests/conftest.py`: same interface as R2Store) → implement → pass → commit `feat(rnd/creative-studio): portrait generation wired into character flow`.

# Phase F — Orchestration

### Task 19: Run state store

**Files:**
- Create: `orchestration/run_state.py`
- Test: `tests/orchestration/test_run_state.py`

**Interfaces:**
- Produces: `STEP_NAMES` = `["portrait", "shot1_keyframe", "shot1_replace", "shot1_video", "shot2_keyframe", "shot2_replace", "shot2_video", "shot3_keyframe", "shot3_replace", "shot3_video", "voice", "compose", "qa", "export"]`; `StepState` (pydantic: `status: Literal["pending","running","done","failed","skipped"]`, `attempts: int = 0`, `error: str | None`, `artifacts: dict`); `RunState` (`id, creative_spec_id, status, steps: dict[str, StepState]`, `new(generation_id, creative_spec_id) -> RunState` all-pending); `RunStateStore(pool, schema)` with `async save(state)` (upsert into `generation_runs`), `async load(generation_id) -> RunState|None`, `async mark(state, step, **updates) -> RunState` (mutate + save); `reset_shot(state, shot_number)` sets that shot's 3 steps plus `compose/qa/export` back to pending.

- [ ] Steps: failing tests (new state all pending; mark persists and reloads; reset_shot resets exactly 6 steps) against throwaway schema → implement → pass → commit `feat(rnd/creative-studio): durable run state`.

### Task 20: Orchestrator engine

**Files:**
- Create: `orchestration/orchestrator.py`, `generation/workers.py`
- Test: `tests/orchestration/test_orchestrator.py`

**Interfaces:**
- Consumes: everything above via an injected `Services` dataclass (`adapter, r2, repos, run_store, settings`) plus `Workers` protocol so tests inject fakes.
- Produces: `compile_generation_task(spec, sheet, shots, product) -> GenerationTask` (fills shot_tasks from ShotSpec, asset_references from sheet portrait + product cutout, execution_rules defaults); `class Orchestrator(services, workers)` with `async run(generation_id, task: GenerationTask, mode: RunMode) -> RunState` where `RunMode` = dataclass(`live_images: bool, live_video: bool`). Execution order per shot: keyframe -> replace -> video; portrait first; voice parallel with shots (`asyncio.gather`); compose/qa/export sequential after. Per-step: skip if `done`, retry up to `execution_rules["retryLimit"]` on exception, persist transitions via `run_store.mark`. Dry mode: workers return `"dry-run:{step}"` artifact uris and video/compose/qa/export write dry stubs. `async resume(generation_id, ...)` reloads state and re-runs pending/failed only; `async regen_shot(generation_id, shot_number, ...)` = `reset_shot` + resume.
- `workers.py`: `ImageWorker/ReplaceWorker/VideoWorker/VoiceWorker` real implementations calling Task 17 adapters; each exposes `async run(task: GenerationTask, shot_number: int | None, state_artifacts: dict) -> dict` returning artifact uris.

- [ ] **Step 1: Failing tests with `FlakyFakeWorkers`** — (a) happy path: all steps done, order constraints held (replace after keyframe, video after replace; assert via recorded call log); (b) keyframe fails once then succeeds → attempts==2, run completes; (c) fails 3 times → step failed, run status failed, later steps pending; (d) resume completes it; (e) regen_shot(2) re-runs exactly shot2_* + compose/qa/export.
- [ ] **Step 2-4: fail, implement, pass.** **Step 5: Commit** `feat(rnd/creative-studio): asyncio orchestrator with resume + selective regen`

### Task 21: Replacement pipeline

**Files:**
- Create: `replacement/pipeline.py`
- Test: `tests/replacement/test_pipeline.py`

**Interfaces:**
- Consumes: `remove_background`, `place_product`, `R2Store`, `Product`.
- Produces: `async prepare_product_assets(adapter, r2, product: Product) -> Product` (idempotent: if `has_cutout` return unchanged; else download first original image → birefnet → store cutout+mask uris into `derived_assets.transparentCutout/garmentMask` + `placement_assets.productCutout`, return updated Product for upsert); `async replace_on_keyframe(adapter, r2, keyframe_uri: str, product: Product, generation_id: str, shot: int) -> str` (presign scene + cutout, bria place, store at `key_for("keyframe_replaced", ...)`).

- [ ] Steps: failing fake-adapter tests (idempotency; produced keys; correct pass-through of cutout url) → implement → pass → commit `feat(rnd/creative-studio): product truth pipeline (birefnet + bria on keyframes)`.

# Phase G — QA, Composition, Export

### Task 22: Composition (ffmpeg)

**Files:**
- Create: `composition/ffmpeg.py`
- Test: `tests/composition/test_ffmpeg.py`

**Interfaces:**
- Produces: `probe(path: Path) -> dict` (ffprobe -print_format json -show_streams -show_format); `trim(in_path, out_path, seconds: float)`; `concat(clips: list[Path], out_path)` (normalize to 1080x1920/30fps via filter_complex scale+fps then concat); `mux_voice(video: Path, voice: Path, out_path)` (aac, `-shortest`); `srt_for(shots: list[Shot], durations: list[float]) -> str` (one cue per shot spanning its window, text = `dialogue.subtitle or spokenText`); `burn_subtitles(video, srt_path, out_path)` (subtitles filter, escape Windows path colons); `thumbnail(video, out_path, at_seconds=1.0)`; `compose_ad(workdir: Path, clip_paths, shot_durations, voice_path, shots) -> Path` orchestrating trim→concat→mux→subtitles→returns final mp4. All raise `CompositionError` with stderr tail on non-zero exit.
- Test media: generate 3 tiny clips with `ffmpeg -f lavfi -i color=c=red:size=270x480:rate=30 -t 5` (and a sine-wave wav) in a fixture — no live spend, runs everywhere ffmpeg exists.

- [ ] Steps: failing tests (srt_for exact string golden; compose_ad produces file; probe says duration within 10±0.5 and 1080-scaled — use small size for speed and assert probe of the test output matches requested size) → implement → pass → commit `feat(rnd/creative-studio): ffmpeg composition (trim to plan, concat, voice, subtitles)`.

### Task 23: QA checks + report

**Files:**
- Create: `qa/checks.py`, `qa/report.py`
- Test: `tests/qa/test_checks.py`

**Interfaces:**
- Consumes: `probe`, `R2Store.exists`, contracts.
- Produces: `run_technical_checks(final_video: Path, clip_paths, shot_durations, srt_text, expected={"width":1080,"height":1920,"fps":30}) -> list[Issue]` (Issue = dict severity/category/message; checks: resolution, fps ±0.1, total duration 10±0.5, 3 clips, each trimmed clip duration matches plan ±0.2, srt cue windows inside clip windows); `run_asset_checks(r2, manifest_draft: dict) -> list[Issue]` (every referenced key exists); `build_qa_report(spec, issues: list, scores: dict | None) -> QAReport` (derives section scores 100-minus-penalties, `approvedForExport = no critical`, `recommendations` names the failed shot/stage when derivable from issue categories like `"shot2_video"`).
- VLM critic is OUT of scope for this plan (advisory only, additive later) — noted deliberately, not a placeholder.

- [ ] Steps: failing tests (fabricated probe dicts → expected issues; critical → not approved; clean → approved) → implement → pass → commit `feat(rnd/creative-studio): deterministic QA + QAReport`.

### Task 24: Exporter + AssetManifest

**Files:**
- Create: `export/exporter.py`
- Test: `tests/export/test_exporter.py`

**Interfaces:**
- Consumes: `R2Store`, contracts, run artifacts.
- Produces: `async export_run(r2, repos, spec, run_state: RunState, workdir: Path) -> AssetManifest` — uploads final mp4/static/thumbnail from workdir via `key_for`, assembles AssetManifest (3 keyframes from replace steps' artifacts, 3 clips, voiceover, deliverables.primaryVideo/primaryImage/thumbnail, generation_summary, source_references from spec/run), inserts via `repos.asset_manifests.insert`, returns it. Static deliverable = shot 2's replaced keyframe (the Product shot).

- [ ] Steps: failing test with FakeR2 + throwaway-schema repos (manifest validates, counts hold, insert happened) → implement → pass → commit `feat(rnd/creative-studio): export + AssetManifest`.

# Phase H — Interfaces

### Task 25: CLI with spend gates

**Files:**
- Create: `interfaces/cli.py`, `src/creative_studio/__main__.py` (`from creative_studio.interfaces.cli import main; main()`)
- Test: `tests/interfaces/test_cli.py`

**Interfaces:**
- Produces: argparse CLI `python -m creative_studio <cmd>`:
  - `migrate` → run_migrations on MIGRATION_DATABASE_URL.
  - `sync-shopify [--limit 10]` → fetch, normalize, mirror assets to R2, prepare_product_assets (cutout) only with `--live-images`, upsert products + brand context.
  - `seed-fixtures` → normalize Meta+Google fixtures, upsert campaigns.
  - `plan --product <id> --preference "<text>" [--platform Instagram] [--language English]` → planning chain, insert spec/sheet/shotspec, print ids + a readable summary.
  - `generate --spec <creativeSpecId> [--live-images] [--live-video] [--yes]` → compile GenerationTask, spend gate, orchestrate, print run status table.
  - `regen --run <id> --shot <n> [--yes]`, `resume --run <id>`, `status --run <id>`.
  - Spend gate: when `--live-video`, print itemized estimate (`3 clips x ~$1.21 = ~$3.63; images ~$0.20-0.60; tts ~$0.10; total ~$4-5`) + current Fal balance (Task 15) and require typed `y` unless `--yes`. When only `--live-images`, print image estimate and confirm the same way. Dry-run prints "no paid calls will be made".
  - `require_ffmpeg()` runs at CLI start for generate/regen/resume.

- [ ] Steps: failing tests (parser routes; spend gate blocks without confirmation — monkeypatch stdin; dry default) → implement → pass → commit `feat(rnd/creative-studio): CLI with dry-run default and spend gates`.

### Task 26: FastAPI facade + end-to-end verification

**Files:**
- Create: `interfaces/api.py`
- Test: `tests/interfaces/test_api.py`

**Interfaces:**
- Produces: FastAPI app factory `create_app()`: `POST /generate` body `{creativeSpecId, liveImages?: bool, liveVideo?: bool}` → 202 `{runId}` (spawns orchestrator task; live flags require header `X-Confirm-Spend: yes` else 402); `GET /runs/{id}` → RunState JSON; `GET /runs/{id}/manifest` → AssetManifest or 404. No auth (localhost R&D tool).

- [ ] **Step 1: API tests** with TestClient + fake services (routes, 402 without confirm header) → implement → pass.
- [ ] **Step 2: E2E dry-run (the acceptance gate)** — run against live Shopify + fixtures, zero spend:

```
python -m creative_studio migrate
python -m creative_studio sync-shopify --limit 5
python -m creative_studio seed-fixtures
python -m creative_studio plan --product <printed id> --preference "Luxury handheld UGC, natural light"
python -m creative_studio generate --spec <printed id>
python -m creative_studio status --run <printed id>
```

Expected: run completes in dry mode; `creative_specs/character_sheets/shot_specs` rows exist in Neon; status shows all steps done with `dry-run:` artifacts; compiled provider requests written under the run workdir.

- [ ] **Step 3: Supervised live run (user-approved spend)** — with lemon present: `generate --spec <id> --live-images --live-video`, confirm the printed estimate, verify final MP4 + static + manifest + QAReport in R2/Neon, report Fal balance delta. This is the design's success criterion 2 and also executes Task 17's live smokes implicitly.
- [ ] **Step 4: Full suite** — `python -m pytest` Expected: all green, no live tests run without env opt-in.
- [ ] **Step 5: Commit** `feat(rnd/creative-studio): FastAPI facade + e2e dry-run verified`

---

## Self-review notes

- Spec coverage: design §1-§14 all mapped (contracts T2-5, storage T6-8, ingestion T9-11, planning T12-14, generation T15-18, orchestration T19-21, QA/composition/export T22-24, interfaces T25-26). Embeddings columns ship in T6; retrieval deferred by design. VLM critic explicitly deferred (T23).
- Seedance 3s floor handled: builders emit `video_duration_for(shot)` (T15/16), composition trims to plan (T22).
- Type consistency: `RunMode`, `Services`, `Workers`, `RunState`, adapter tuple returns, and `key_for` kinds are each defined once and referenced by name in consuming tasks.
