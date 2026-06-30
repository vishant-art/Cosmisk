"""HTTP surface for the Creative Studio generation pipeline (M4 Generative Engine).

A run takes minutes and costs real money, so generation is async: POST /creative/generate
schedules a background job and returns a job_id immediately; the caller polls
GET /creative/jobs/{job_id}. Finished assets are served from the ai-layer's own static
mount (ephemeral — durable object storage is the deferred DB phase; see
dev_reports/ai_serv/creative/creative-studio-db-design.md).

Auth/token follow the rest of the ai-layer: the X-API-Key gate is applied where this router
is mounted, and the caller's per-request Meta token arrives as X-Meta-Token.
"""
from __future__ import annotations

import json
import os
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field

from ai_layer import meta_live
from ai_layer.creative import config, pipeline

router = APIRouter(prefix="/creative", tags=["creative"])

# In-process job store (single uvicorn worker). Fine for the first cut; a durable
# job table is part of the deferred DB phase.
_JOBS: dict[str, dict] = {}


class CreativeRequest(BaseModel):
    account_id: str | None = Field(None, description="act_<id>; conditions on real winners")
    brief: dict | None = Field(None, description="product brief; designs the brand kit from it")
    strategy: str = "top-roas"
    images: int = Field(2, ge=1, le=8, description="number of concepts")
    formats: list[str] = ["1:1", "4:5", "9:16"]
    with_video: bool = False
    voiceover: bool = False
    ground: bool = Field(False, description="ground the brand kit in Meta winners (vision pass)")
    no_logo: bool = False
    product_image: str | None = None


def _brief_summary(brief: dict) -> str:
    """Compress a Creative Studio product brief into the factual block the brand brain
    reasons from (same role as a campaign summary, but product-led)."""
    parts = [f"BRAND: {brief.get('brand_name', '?')}",
             f"PRODUCT: {brief.get('product_name', '?')}",
             f"DESCRIPTION: {brief.get('product_description', '')}",
             f"TARGET AUDIENCE: {brief.get('target_audience', '')}"]
    feats = brief.get("key_features") or []
    if feats:
        parts.append("KEY FEATURES: " + "; ".join(feats))
    if brief.get("price"):
        parts.append(f"PRICE: {brief['price']}")
    return "\n".join(p for p in parts if p)


def _asset_url(job_id: str, path) -> str:
    return f"/creative/assets/{job_id}/{Path(path).name}"


def _run_job(job_id: str, req: CreativeRequest, token: str | None) -> None:
    job = _JOBS[job_id]
    job["status"] = "running"

    def stage(msg: str) -> None:
        job["stage"] = msg
        job["progress"].append(msg)

    try:
        run_dir = config.OUTPUT_DIR / job_id
        run_dir.mkdir(parents=True, exist_ok=True)

        # 1. Brand-kit input. Brief mode: design from the product brief. Campaign mode:
        #    derive from a live Meta envelope (or the bundled mock). In brief mode we still
        #    pull Meta winners for conditioning when an account + token are supplied.
        summary = account_name = data_path = None
        if req.brief:
            summary = _brief_summary(req.brief)
            account_name = req.brief.get("brand_name") or "Creative Studio"
        elif req.account_id and token:
            env = meta_live.fetch_envelope(token, account=req.account_id, preset="last_30d")
            dp = run_dir / "_input.json"
            dp.write_text(json.dumps(env), encoding="utf-8")
            data_path = str(dp)
        else:
            data_path = str(config.DEFAULT_DATA)

        # 2. Static multi-format ads (brand kit -> backgrounds -> composite -> QA gate).
        m = pipeline.run(
            data_path=data_path, summary=summary, account_name=account_name, run_id=job_id,
            strategy=req.strategy, mode="auto", images=req.images, formats=req.formats,
            qa_retries=1, run_vlm=True, no_logo=req.no_logo, product_image=req.product_image,
            meta_account=req.account_id, meta_token=token, ground_from_meta=req.ground,
            top_creatives=12, on_stage=stage, log=lambda *_: None)
        job["run_id"] = job_id
        job["rejected"] = m.rejected
        job["assets"] = [
            {"concept": a.concept_title, "fmt": a.fmt, "url": _asset_url(job_id, a.path),
             "copy": a.ad_copy.model_dump() if a.ad_copy else None}
            for a in m.ads
        ]
        job["cost_usd"] = m.total_cost_usd

        # 3. Optional video (Seedance i2v from a text-free bg + native audio + overlay + VO).
        if req.with_video and m.ads:
            copy = next((a.ad_copy for a in m.ads if a.ad_copy), None)
            v = pipeline.video_smoke(
                run_id=job_id, prompt="slow cinematic push-in, premium on-brand mood",
                duration=config.VIDEO_DURATION_DEFAULT, aspect="9:16", copy=copy,
                kit=m.brand_kit, generate_audio=True, voiceover=req.voiceover,
                client=pipeline._client(), on_stage=stage, log=lambda *_: None)
            if v is not None:
                job["video"] = {"url": _asset_url(job_id, v.path)}

        stage("Done")
        job["status"] = "complete"
    except Exception as e:  # noqa: BLE001 -- surface failure on the job, never crash the worker
        job["status"] = "failed"
        job["error"] = f"{e}"
        traceback.print_exc()


@router.post("/generate")
def generate(req: CreativeRequest, background: BackgroundTasks,
             x_meta_token: str | None = Header(default=None)):
    token = x_meta_token or os.getenv("META_ACCESS_TOKEN")
    job_id = uuid.uuid4().hex
    _JOBS[job_id] = {"job_id": job_id, "status": "queued", "stage": "Queued",
                     "progress": [], "run_id": None, "assets": [], "video": None,
                     "cost_usd": 0.0, "rejected": [], "error": None}
    background.add_task(_run_job, job_id, req, token)
    return {"job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
