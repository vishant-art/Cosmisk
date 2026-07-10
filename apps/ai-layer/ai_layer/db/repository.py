"""Postgres repository backing store.py + cost_ledger.py. All access goes through
engine.get_session(). brand_id defaults to account_id (single-tenant shortcut).

Call engine.get_session() module-qualified (NOT `from ... import get_session`) so the
test harness's monkeypatch of engine.get_session takes effect here."""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import fields

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ai_layer import meta_transform as mt
from ai_layer.db import engine, models as m

log = logging.getLogger("ai_layer.db.repository")

_FACT_COLS = [f.name for f in fields(mt.CampaignDayFact)]          # 20, incl. date (str)
_FACT_UPDATE = [c for c in _FACT_COLS if c not in ("campaign_id", "date")]


def _brand(brand_id: str | None, account_id: str) -> str:
    return brand_id or account_id


def upsert_dataset(ds: mt.Dataset, brand_id: str | None = None) -> int:
    bid = _brand(brand_id, ds.account_id)
    with engine.get_session() as s:
        s.execute(pg_insert(m.Brand).values(
            brand_id=bid, brand_name=ds.account_name,
            meta_account_id=ds.account_id, currency=ds.currency
        ).on_conflict_do_update(
            index_elements=[m.Brand.brand_id],
            set_={"brand_name": ds.account_name, "currency": ds.currency, "updated_at": func.now()}))
        s.execute(pg_insert(m.Account).values(
            brand_id=bid, platform="meta", account_id=ds.account_id,
            account_name=ds.account_name, currency=ds.currency
        ).on_conflict_do_update(
            index_elements=[m.Account.brand_id, m.Account.platform, m.Account.account_id],
            set_={"account_name": ds.account_name, "currency": ds.currency, "updated_at": func.now()}))
        rows = []
        for f in ds.facts:
            d = {k: getattr(f, k) for k in _FACT_COLS}
            d["date"] = dt.date.fromisoformat(d["date"])
            d.update(brand_id=bid, platform="meta", account_id=ds.account_id)
            rows.append(d)
        if rows:
            stmt = pg_insert(m.Fact).values(rows)
            set_ = {c: getattr(stmt.excluded, c) for c in _FACT_UPDATE}
            set_["updated_at"] = func.now()
            stmt = stmt.on_conflict_do_update(
                index_elements=[m.Fact.brand_id, m.Fact.platform, m.Fact.account_id,
                                m.Fact.campaign_id, m.Fact.date],
                set_=set_)
            s.execute(stmt)
        s.commit()
    return len(ds.facts)


def load_dataset(account_id: str, since: str | None = None,
                 until: str | None = None, brand_id: str | None = None) -> mt.Dataset:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        acc = s.execute(select(m.Account).where(
            m.Account.brand_id == bid, m.Account.platform == "meta",
            m.Account.account_id == account_id)).scalar_one_or_none()
        q = select(m.Fact).where(m.Fact.brand_id == bid, m.Fact.account_id == account_id)
        if since:
            q = q.where(m.Fact.date >= dt.date.fromisoformat(since))
        if until:
            q = q.where(m.Fact.date <= dt.date.fromisoformat(until))
        q = q.order_by(m.Fact.campaign_name, m.Fact.date)
        rows = list(s.execute(q).scalars().all())
    facts = tuple(
        mt.CampaignDayFact(**{**{k: getattr(r, k) for k in _FACT_COLS if k != "date"},
                              "date": r.date.isoformat()})
        for r in rows)
    dates = [f.date for f in facts]
    return mt.Dataset(
        account_id=account_id,
        account_name=acc.account_name if acc else account_id,
        currency=(acc.currency if acc else None) or "INR",
        since=min(dates) if dates else None,
        until=max(dates) if dates else None,
        level="campaign", source="store", facts=facts)


def record_cost(model: str, prompt_tokens: int, completion_tokens: int,
                op: str = "chat", account: str | None = None,
                cost_usd_actual: float | None = None,
                cache_discount_usd: float | None = None,
                brand_id: str | None = None) -> float:
    from ai_layer.cost_ledger import cost_usd as _estimate  # lazy: avoids import cycle
    pt, ct = int(prompt_tokens or 0), int(completion_tokens or 0)
    if cost_usd_actual is not None:
        c, priced = float(cost_usd_actual), "openrouter"
    else:
        c, priced = _estimate(model, pt, ct), "estimated"
    try:
        with engine.get_session() as s:
            s.add(m.CostLedgerEntry(
                brand_id=brand_id or account, account_id=account, model=model, op=op,
                prompt_tokens=pt, completion_tokens=ct, cost_usd=round(c, 6), priced=priced,
                cache_discount_usd=(round(float(cache_discount_usd), 6)
                                    if cache_discount_usd is not None else None)))
            s.commit()
    except Exception:  # noqa: BLE001 -- cost accounting must never fail the primary op
        log.exception("cost_ledger write failed (continuing)")
    return c


def total_usd(account: str | None = None, brand_id: str | None = None) -> float:
    with engine.get_session() as s:
        q = select(func.coalesce(func.sum(m.CostLedgerEntry.cost_usd), 0.0))
        if brand_id is not None:
            q = q.where(m.CostLedgerEntry.brand_id == brand_id)
        if account is not None:
            q = q.where(m.CostLedgerEntry.account_id == account)
        return round(float(s.execute(q).scalar_one()), 6)


def _ensure_brand(s, brand_id: str | None, account_id: str | None = None) -> None:
    """Insert a minimal brands row if absent, so brand_config/creative_jobs FKs hold."""
    if not brand_id:
        return
    s.execute(pg_insert(m.Brand).values(brand_id=brand_id, meta_account_id=account_id)
              .on_conflict_do_nothing(index_elements=[m.Brand.brand_id]))


def get_brand_config(brand_id: str) -> dict | None:
    with engine.get_session() as s:
        row = s.get(m.BrandConfig, brand_id)
        return dict(row.brand_kit_json) if row and row.brand_kit_json else None


def upsert_brand_config(brand_id: str, brand_kit: dict) -> None:
    with engine.get_session() as s:
        _ensure_brand(s, brand_id)
        s.execute(pg_insert(m.BrandConfig).values(brand_id=brand_id, brand_kit_json=brand_kit)
                  .on_conflict_do_update(index_elements=[m.BrandConfig.brand_id],
                                         set_={"brand_kit_json": brand_kit, "updated_at": func.now()}))
        s.commit()


# _JOBS dict key  ->  creative_jobs column
_JOB_MAP = {"progress": "progress_json", "assets": "assets_json", "video": "video_json",
            "brand_kit": "brand_kit_json", "winners": "winners_json",
            "rejected": "rejected_json", "request": "request_json", "ledger": "ledger_json"}
_JOB_DIRECT = ("status", "stage", "cost_usd", "error", "account_id")


def _job_to_columns(job: dict, brand_id: str | None) -> dict:
    bid = brand_id or job.get("brand_id") or job.get("account_id")
    cols: dict = {"job_id": job["job_id"], "brand_id": bid}
    for k in _JOB_DIRECT:
        if k in job:
            cols[k] = job[k]
    for src, col in _JOB_MAP.items():
        if src in job:
            cols[col] = job[src]
    return cols


def _columns_to_job(row: m.CreativeJob) -> dict:
    return {"job_id": row.job_id, "status": row.status, "stage": row.stage,
            "run_id": row.job_id, "cost_usd": row.cost_usd, "error": row.error,
            "account_id": row.account_id, "brand_id": row.brand_id,
            "progress": row.progress_json or [], "assets": row.assets_json or [],
            "video": row.video_json, "brand_kit": row.brand_kit_json,
            "winners": row.winners_json or [], "rejected": row.rejected_json or [],
            "request": row.request_json, "ledger": row.ledger_json}


def save_job(job: dict, brand_id: str | None = None) -> None:
    cols = _job_to_columns(job, brand_id)
    upd = {k: v for k, v in cols.items() if k != "job_id"}
    upd["updated_at"] = func.now()
    with engine.get_session() as s:
        _ensure_brand(s, cols.get("brand_id"), cols.get("account_id"))
        s.execute(pg_insert(m.CreativeJob).values(**cols)
                  .on_conflict_do_update(index_elements=[m.CreativeJob.job_id], set_=upd))
        s.commit()


def load_job(job_id: str, brand_id: str | None = None) -> dict | None:
    with engine.get_session() as s:
        row = s.get(m.CreativeJob, job_id)
        if row is None or (brand_id is not None and row.brand_id != brand_id):
            return None
        return _columns_to_job(row)


def list_jobs(brand_id: str, limit: int = 50) -> list[dict]:
    with engine.get_session() as s:
        rows = s.execute(select(m.CreativeJob)
                         .where(m.CreativeJob.brand_id == brand_id)
                         .order_by(m.CreativeJob.created_at.desc()).limit(limit)).scalars().all()
        return [_columns_to_job(r) for r in rows]
