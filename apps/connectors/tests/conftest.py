"""Test helpers: a fake Http (zero network) and fake connectors, so the whole suite runs $0."""
from __future__ import annotations

import sys
from pathlib import Path

# Make the package importable without an editable install.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from connectors.base import Connector  # noqa: E402
from connectors.contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact  # noqa: E402


class FakeHttp:
    """Drop-in for base.Http. `json_map` keys are substrings matched against the URL."""

    def __init__(self, json_map=None, files=None, headers_map=None):
        self.json_map = json_map or {}
        self.files = files or {}            # url-substring -> bytes
        self.headers_map = headers_map or {}  # url-substring -> response headers dict
        self.calls = []

    async def get_with_headers(self, url, *, params=None, headers=None):
        data = await self.get_json(url, params=params, headers=headers)
        hdrs = {}
        for frag, h in self.headers_map.items():
            if frag in url:
                hdrs = h
                break
        return data, hdrs

    async def get_json(self, url, *, params=None, headers=None):
        self.calls.append(("GET", url, params))
        for frag, payload in self.json_map.items():
            if frag in url:
                return payload(params) if callable(payload) else payload
        return {"data": []}

    async def download(self, url, dest):
        Path(dest).parent.mkdir(parents=True, exist_ok=True)
        for frag, content in self.files.items():
            if frag in url:
                Path(dest).write_bytes(content)
                return str(dest)
        Path(dest).write_bytes(b"x")
        return str(dest)

    async def aclose(self):
        pass


class FakeConnector:
    """A scriptable Connector for funnel tests: succeed, raise, hang, or skip."""

    def __init__(self, platform, *, facts=None, assets=None, raise_on=None, hang=False,
                 status_state="ok"):
        self.platform = platform
        self._facts = facts or []
        self._assets = assets or []
        self._raise = raise_on
        self._hang = hang
        self._status_state = status_state

    async def health(self):
        return ConnectorStatus(platform=self.platform, state=self._status_state)

    async def fetch_facts(self, account_id, window: DateWindow):
        if self._hang:
            import asyncio
            await asyncio.sleep(60)
        if self._raise:
            raise self._raise
        return list(self._facts)

    async def fetch_assets(self, account_id, top_n):
        if self._raise:
            raise self._raise
        return list(self._assets)


def fact(platform, *, spend=0.0, revenue=0.0, conversions=0.0, date="2026-06-01",
         entity_id="e1", account_id="a1"):
    return UnifiedFact(platform=platform, account_id=account_id, entity_id=entity_id,
                       date=date, spend=spend, revenue=revenue, conversions=conversions)


# Sanity: FakeConnector satisfies the Protocol.
assert isinstance(FakeConnector("meta"), Connector)
