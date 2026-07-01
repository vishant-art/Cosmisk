"""FX-conversion seam (shipped inert). The connector stays isolated/stateless/no-DB, so it ships
ONLY this protocol + no default provider. A caching RateProvider is implemented caller-side
(ai-layer) and injected via get_snapshot(rate_provider=...). See the spec's FX provider design
(daily fetch -> 24h Neon cache -> on-demand convert; Frankfurter/ECB source)."""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class RateProvider(Protocol):
    def rate(self, base: str, quote: str) -> float:
        """Units of `quote` per 1 unit of `base` for the current day. Raises if unavailable."""
        ...
