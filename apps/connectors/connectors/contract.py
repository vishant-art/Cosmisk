"""The abstract contract the AI layer consumes — and the ONLY thing it should import.

Nothing here knows about Meta/Shopify/Google internals. A connector failing is not an
exception to the caller: it surfaces as a `ConnectorStatus` and the snapshot still carries
whatever else succeeded. Pure data (pydantic) — no I/O.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["meta", "shopify", "google"]
ConnState = Literal["ok", "degraded", "skipped", "failed"]


class DateWindow(BaseModel):
    """Inclusive [since, until] in ISO YYYY-MM-DD."""
    since: str
    until: str

    @classmethod
    def last_n_days(cls, n: int, *, today: str | None = None) -> "DateWindow":
        end = date.fromisoformat(today) if today else _today()
        return cls(since=(end - timedelta(days=n - 1)).isoformat(), until=end.isoformat())


def _today() -> date:
    # Isolated so tests can pass an explicit `today` and stay deterministic.
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).date()


class BrandRef(BaseModel):
    """Identifies a brand + its per-platform account ids. Any id left None falls back to
    the corresponding value in config (single-tenant .env mode)."""
    brand_id: str
    meta_account_id: str | None = None
    shopify_domain: str | None = None
    google_customer_id: str | None = None


class UnifiedFact(BaseModel):
    """One platform × entity × day row — a flat superset preserving CampaignDayFact titles.
    Every numeric is a non-null float (the brain is not None-safe); metrics a platform does not
    measure are 0.0 and disambiguated by the capability sets (see connectors.capabilities).
    Only true residue (currency transport, platform-unique keys) lives in platform_extra."""
    # identity
    platform: Platform
    account_id: str
    entity_id: str
    entity_name: str = ""
    date: str                           # ISO YYYY-MM-DD
    # delivery
    spend: float = 0.0
    impressions: float = 0.0            # float for parity with CampaignDayFact
    reach: float = 0.0                  # Meta only
    frequency: float = 0.0              # Meta only
    # all-clicks (secondary)
    clicks: float = 0.0                 # float for parity
    ctr: float = 0.0
    cpc: float = 0.0
    # link-clicks (headline traffic)
    link_clicks: float = 0.0
    link_ctr: float = 0.0
    cost_per_link_click: float = 0.0
    # efficiency
    cpm: float = 0.0
    # funnel
    add_to_cart: float = 0.0            # Meta pixel; Shopify/Google N/A
    checkout: float = 0.0               # Meta pixel; Shopify/Google N/A
    conversions: float = 0.0            # Meta purchases / Shopify orders / Google conversions
    revenue: float = 0.0
    # derived (STORED — parity with CampaignDayFact)
    roas: float = 0.0                   # revenue / spend (DERIVED, never a reported field)
    cpa: float = 0.0                    # spend / conversions
    # residue only
    platform_extra: dict = Field(default_factory=dict)


class Blended(BaseModel):
    """Cross-platform reconciliation — the numbers the Meta-only layer could never produce."""
    spend: float = 0.0                  # Meta + Google ad spend
    revenue_meta_pixel: float = 0.0     # Meta pixel-attributed revenue
    revenue_shopify: float = 0.0        # Shopify revenue (the truth side)
    blended_roas: float = 0.0           # truth revenue / total ad spend
    revenue_gap_pct: float = 0.0        # (shopify - meta_pixel) / shopify * 100
    currency: str = ""                  # currency the blended figures are expressed in
    currency_mismatch: bool = False     # True if platforms disagreed and no FX was applied


class ConnectorStatus(BaseModel):
    """How each connector fared. `skipped` = no creds; `failed`/`degraded` = logged + tolerated."""
    platform: Platform
    state: ConnState
    detail: str | None = None
    fact_count: int = 0
    asset_count: int = 0
    elapsed_ms: int = 0
    currency: str | None = None         # account currency this connector reported (funnel-surfaced)


class AssetRecord(BaseModel):
    """A downloaded creative asset + the stat line that makes it a 'winner'."""
    platform: Platform
    entity_id: str
    entity_name: str = ""
    kind: Literal["image", "video"] = "image"
    local_path: str | None = None       # downloaded file (image still / video thumbnail)
    durable_ref: str | None = None      # stable hash / video_id to re-resolve later
    source_url: str | None = None       # video source/permalink (time-limited; re-resolve via durable_ref)
    roas: float = 0.0
    stats: UnifiedFact | None = None


class UnifiedSnapshot(BaseModel):
    """The single object the AI layer receives. Partial by design."""
    brand_id: str
    since: str
    until: str
    currency: str = ""                  # set by the funnel from the connectors' reported currencies
    facts: list[UnifiedFact] = Field(default_factory=list)
    blended: Blended = Field(default_factory=Blended)
    assets: list[AssetRecord] = Field(default_factory=list)
    statuses: list[ConnectorStatus] = Field(default_factory=list)

    @property
    def ok_platforms(self) -> list[str]:
        return [s.platform for s in self.statuses if s.state in ("ok", "degraded")]

    def status_for(self, platform: str) -> ConnectorStatus | None:
        return next((s for s in self.statuses if s.platform == platform), None)
