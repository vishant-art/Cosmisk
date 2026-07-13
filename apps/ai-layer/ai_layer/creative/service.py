"""HTTP surface for the Creative Studio (M4 Generative Engine).

Two pipelines, both async because a run takes minutes and costs real money:

  STATIC ADS   POST /creative/generate        -> job_id; poll GET /creative/jobs/{id}
  UGC VIDEO    POST /creative/video/plan      -> script + storyboard + a COST QUOTE ($0, LLM only)
               POST /creative/video/generate  -> job_id; renders the planned board (PAID)

The video path is deliberately split. `plan` is free and returns the shot list plus what the
render WOULD cost, so nobody pays Seedance without first seeing what they are buying;
`generate` is the only call that spends, and it refuses to start when the live fal balance
cannot cover the planned clips (fal_billing.affordable -> 402).

Everything else is ON by default: Meta cohort grounding (both ROAS tails), the winner
teardown, Shopify product sourcing, the VLM quality critic, and, on the video side,
voiceover + SFX + burned-in per-word captions + the repair ladder + the temporal QA gate.
Each grounding source degrades gracefully (and loudly) when its credentials are absent.

Jobs are persisted to Neon (`creative_jobs`, via ai_layer.db.repository) so they survive a
restart, with an in-process mirror so the service still works when no database is configured.

Auth follows the rest of the ai-layer: the X-API-Key gate is applied where this router is
mounted, and the caller's per-request Meta token arrives as X-Meta-Token.
"""
from __future__ import annotations

import json
import logging
import os
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field

from ai_layer import meta_live
from ai_layer.creative import config, fal_billing, pipeline
from ai_layer.creative.schemas import CreatorKit, Storyboard, UGCStyle

log = logging.getLogger("ai_layer.creative.service")

router = APIRouter(prefix="/creative", tags=["creative"])

# In-process mirror of the job table. Neon is the durable record (jobs survive a restart);
# this keeps the service fully functional when DATABASE_URL is unset, and saves a read on
# the hot polling path.
_JOBS: dict[str, dict] = {}


# --- job persistence (Neon + in-process mirror) --------------------------------

def _save(job: dict) -> None:
    """Mirror in-process, then persist to Neon. A DB outage must never fail a run: the
    generation already happened and the bytes are on disk."""
    _JOBS[job["job_id"]] = job
    try:
        from ai_layer.db import repository
        repository.save_job(job)
    except Exception:  # noqa: BLE001 -- no DB configured, or a transient write failure
        log.debug("creative_jobs write skipped (no DB or write failed)", exc_info=True)


def _load(job_id: str) -> dict | None:
    """The in-process copy if this worker owns it, else the durable Neon row."""
    job = _JOBS.get(job_id)
    if job is not None:
        return job
    try:
        from ai_layer.db import repository
        return repository.load_job(job_id)
    except Exception:  # noqa: BLE001
        log.debug("creative_jobs read skipped (no DB)", exc_info=True)
        return None


class CreativeRequest(BaseModel):
    """Static-ad generation. Every grounding source defaults ON."""
    account_id: str | None = Field(None, description="act_<id>; grounds on the real cohort")
    brief: dict | None = Field(None, description="product brief; designs the brand kit from it")
    strategy: str = "top-roas"
    images: int = Field(4, ge=1, le=8, description="number of concepts")
    formats: list[str] = ["1:1", "4:5", "9:16", "16:9"]
    # --- grounding: all on. Each degrades loudly to UNGROUNDED without creds. ---
    ground: bool = Field(True, description="ground the brand kit in Meta winners (vision pass)")
    use_shopify: bool = Field(True, description="source the product image from the store's bestseller")
    top_creatives: int = 12
    bottom_creatives: int = 5
    min_spend: float = 100.0
    run_vlm: bool = Field(True, description="VLM quality critic on every ad")
    qa_retries: int = 1
    # A logo is never generated: lemon's standing rule for every creative run.
    no_logo: bool = True
    product_image: str | None = None
    # ON by default, like everything else. This is the single-clip smoke (one Seedance
    # render + VO + captions). It is balance-guarded before it spends, and SKIPPED (not
    # failed) when the balance cannot cover it, so a static-ad run never dies over the
    # video bolt-on. The full storyboard-driven path remains /creative/video/*, which
    # quotes its cost first.
    with_video: bool = True
    voiceover: bool = True


class VideoPlanRequest(BaseModel):
    """$0. LLM only: script -> storyboard, plus what the render would cost."""
    job_id: str = Field(..., description="an existing run (from /creative/generate)")
    seconds: int = Field(config.STORY_DEFAULT_SECONDS, ge=6, le=90)
    # WHO is in the ad. Persisted to the run, so the render cannot disagree with the script
    # about who is speaking. Reuse the same object across runs to reuse the same creator.
    creator: CreatorKit | None = None


class VideoRenderRequest(BaseModel):
    """PAID. Renders the storyboard that /creative/video/plan produced."""
    job_id: str
    aspect: str = "9:16"
    resolution: str = "720p"
    ugc_style: bool = Field(True, description="handheld/window/imperfect capture + grain, shake, recompress")
    voiceover: bool = True
    captions: bool = True
    sfx: bool = True
    strict: bool = Field(True, description="fail-closed QA: an inconclusive check fails the gate")
    single_pass: bool = False
    guard_balance: bool = Field(True, description="refuse to start if the fal balance can't cover it")
    variant_axis: str | None = Field(None, description="caption_style | aesthetic | hook_type")
    variant_values: list[str] | None = None
    # The persona. Falls back to the run's creator_kit.json (written by /video/plan).
    creator: CreatorKit | None = None
    # EXPERIMENT, off by default. i2v-seeds every non-hero shot from one generated still of
    # the creator, the only lever Seedance offers for holding a face. It may trip the same
    # content filter that rejects a person in a ref2v reference -- unverified, because the
    # fal balance is empty. When the seed IS dropped the render logs loudly rather than
    # quietly shipping five different faces. Costs one extra FLUX still per persona.
    pin_face: bool = Field(False, description="try to hold the creator's face across shots")


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


def _new_job(job_id: str, req: BaseModel, account_id: str | None) -> dict:
    return {"job_id": job_id, "status": "queued", "stage": "Queued", "progress": [],
            "run_id": job_id, "assets": [], "video": None, "brand_kit": None,
            "winners": [], "cost_usd": 0.0, "rejected": [], "error": None,
            "account_id": account_id, "request": json.loads(req.model_dump_json())}


# --- static ads ----------------------------------------------------------------

def _run_job(job_id: str, req: CreativeRequest, token: str | None) -> None:
    job = _JOBS[job_id]
    job["status"] = "running"

    def stage(msg: str) -> None:
        job["stage"] = msg
        job["progress"].append(msg)
        _save(job)

    try:
        run_dir = config.OUTPUT_DIR / job_id
        run_dir.mkdir(parents=True, exist_ok=True)

        # Brand-kit input. Brief mode: design from the product brief. Campaign mode: derive
        # from a live Meta envelope (or the bundled mock). In brief mode we still pull the
        # Meta cohort for conditioning when an account + token are supplied.
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

        m = pipeline.run(
            data_path=data_path, summary=summary, account_name=account_name, run_id=job_id,
            strategy=req.strategy, mode="auto", images=req.images, formats=req.formats,
            qa_retries=req.qa_retries, run_vlm=req.run_vlm, no_logo=req.no_logo,
            product_image=req.product_image, use_shopify=req.use_shopify,
            meta_account=req.account_id, meta_token=token, ground_from_meta=req.ground,
            top_creatives=req.top_creatives, bottom_creatives=req.bottom_creatives,
            min_spend=req.min_spend, on_stage=stage, log=lambda *_: None)

        job["rejected"] = m.rejected
        job["assets"] = [
            {"concept": a.concept_title, "fmt": a.fmt, "url": _asset_url(job_id, a.path),
             "copy": a.ad_copy.model_dump() if a.ad_copy else None}
            for a in m.ads
        ]
        job["cost_usd"] = m.total_cost_usd
        job["brand_kit"] = m.brand_kit.model_dump() if m.brand_kit else None
        wdir = run_dir / "winners"
        job["winners"] = ([{"url": f"/creative/assets/{job_id}/winners/{p.name}"}
                           for p in sorted(wdir.glob("*.png"))] if wdir.exists() else [])
        job["pickings"] = _read_json(run_dir / "pickings.json")
        job["template"] = _read_json(run_dir / "template.json")

        # Single-clip smoke, on by default. Balance-guarded: when fal cannot cover the one
        # clip we SKIP it and say so, rather than half-spending or failing the whole run.
        # The storyboard-driven path (/creative/video/*) is the one that quotes first.
        if req.with_video and m.ads:
            g = fal_billing.affordable(1)
            if g["enabled"] and not g["ok"]:
                stage(f"Video skipped: fal balance ${g['balance']:.2f} short "
                      f"${g['shortfall']:.2f} of the ~${g['needed']:.2f} one clip needs")
                job["video"] = {"skipped": "insufficient fal balance",
                                "needed_usd": g["needed"], "balance_usd": g["balance"]}
            else:
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
    _save(job)


def _read_json(path: Path):
    try:
        return json.loads(path.read_text("utf-8")) if path.exists() else None
    except (json.JSONDecodeError, OSError):
        return None


@router.post("/generate")
def generate(req: CreativeRequest, background: BackgroundTasks,
             x_meta_token: str | None = Header(default=None)):
    token = x_meta_token or os.getenv("META_ACCESS_TOKEN")
    job_id = uuid.uuid4().hex
    job = _new_job(job_id, req, req.account_id)
    _save(job)
    background.add_task(_run_job, job_id, req, token)
    return {"job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = _load(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


# --- UGC video: plan ($0) then render (paid) -----------------------------------

@router.post("/video/plan")
def video_plan(req: VideoPlanRequest):
    """Script -> Storyboard for an existing run. Costs one LLM call, renders no pixels.

    Returns the shot list AND the quote: what rendering this board would cost, and whether
    the live fal balance covers it. This is the whole point of splitting plan from generate.
    """
    run_dir = config.OUTPUT_DIR / req.job_id
    if not (run_dir / "brand_kit.json").exists():
        raise HTTPException(status_code=409,
                            detail=f"run {req.job_id!r} has no brand kit; POST /creative/generate first")
    try:
        script, board = pipeline.plan_story(run_id=req.job_id, seconds=req.seconds,
                                            creator=req.creator, log=lambda *_: None)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"planning failed: {e}") from e

    quote = fal_billing.affordable(len(board.shots))
    job = _load(req.job_id) or _new_job(req.job_id, req, None)
    job["script"] = script.model_dump()
    job["storyboard"] = board.model_dump()
    _save(job)

    return {
        "job_id": req.job_id,
        "script": script.model_dump(),
        "storyboard": board.model_dump(),
        "shots": len(board.shots),
        "duration_s": board.duration_s,
        "grounded": (run_dir / "template.json").exists(),
        "quote": {"clips": len(board.shots),
                  "estimated_usd": round(len(board.shots) * fal_billing.SEEDANCE_CLIP_USD, 4),
                  "balance_usd": quote["balance"], "affordable": quote["ok"],
                  "guard_enabled": quote["enabled"], "shortfall_usd": quote["shortfall"]},
    }


def _run_video_job(job_id: str, req: VideoRenderRequest) -> None:
    job = _JOBS[job_id]
    job["status"] = "running"

    def stage(msg: str) -> None:
        job["stage"] = msg
        job["progress"].append(msg)
        _save(job)

    try:
        run_dir = config.OUTPUT_DIR / job_id
        style = UGCStyle(**config.UGC_STYLE_DEFAULT) if req.ugc_style else None

        stage("Rendering shots")
        timeline, board, rlog = pipeline.render_story(
            run_id=job_id, style=style, aspect=req.aspect, resolution=req.resolution,
            single_pass=req.single_pass, strict=req.strict, finish=True,
            guard_balance=req.guard_balance, creator=req.creator, pin_face=req.pin_face,
            log=lambda *_: None)

        stage("Verifying the timeline")
        report = pipeline.qa_video(run_id=job_id, strict=req.strict, run_vlm=True,
                                   log=lambda *_: None)

        job["video"] = {"url": _asset_url(job_id, timeline),
                        "duration_s": board.duration_s, "shots": len(board.shots)}
        job["qa"] = {"verdict": report.verdict,
                     "checks": [c.model_dump() for c in report.checks],
                     "retry_hint": report.retry_hint}
        job["repair"] = rlog.model_dump() if rlog else None

        if req.variant_axis and req.variant_values:
            stage(f"Cutting {len(req.variant_values)} {req.variant_axis} variants")
            vset, record = pipeline.make_variants(
                run_id=job_id, axis=req.variant_axis, values=req.variant_values,
                log=lambda *_: None)
            job["variants"] = {"axis": req.variant_axis, "record": str(record),
                               "variants": [v.model_dump() for v in vset.variants]}

        job["cost_usd"] = _run_cost(run_dir)
        job["actuals"] = _read_json(run_dir / "fal_actuals.json")
        stage("Done")
        job["status"] = "complete"
    except Exception as e:  # noqa: BLE001
        job["status"] = "failed"
        job["error"] = f"{e}"
        traceback.print_exc()
    _save(job)


def _run_cost(run_dir: Path) -> float:
    """The run's estimated spend, from the ledger's TOTAL rows."""
    led = run_dir / "ledger.jsonl"
    if not led.exists():
        return 0.0
    total = 0.0
    for line in led.read_text("utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("op") != "TOTAL":
            total += row.get("cost_usd", 0.0)
    return round(total, 6)


@router.post("/video/generate")
def video_generate(req: VideoRenderRequest, background: BackgroundTasks):
    """Render the planned storyboard. THIS is the call that spends money.

    Refuses (402) rather than starting a run the fal balance cannot finish: a half-rendered
    board is the worst outcome, because the clips it did render are already paid for.
    """
    run_dir = config.OUTPUT_DIR / req.job_id
    board_file = run_dir / "storyboard.json"
    if not board_file.exists():
        raise HTTPException(status_code=409,
                            detail=f"run {req.job_id!r} has no storyboard; POST /creative/video/plan first")
    board = Storyboard.model_validate_json(board_file.read_text("utf-8"))

    if req.guard_balance:
        g = fal_billing.affordable(len(board.shots))
        if g["enabled"] and not g["ok"]:
            raise HTTPException(status_code=402, detail={
                "error": "insufficient fal balance",
                "clips": len(board.shots), "needed_usd": g["needed"],
                "balance_usd": g["balance"], "shortfall_usd": g["shortfall"],
                "hint": "top up at fal.ai/dashboard/billing, or retry with guard_balance=false"})

    job = _load(req.job_id) or _new_job(req.job_id, req, None)
    job.update(status="queued", stage="Queued", error=None)
    job.setdefault("progress", [])
    _JOBS[req.job_id] = job
    _save(job)
    background.add_task(_run_video_job, req.job_id, req)
    return {"job_id": req.job_id, "status": "queued", "clips": len(board.shots)}
