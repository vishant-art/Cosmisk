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

from ai_layer import meta_live, storage
from ai_layer.creative import config, fal_billing, pipeline, thumbs
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
    # Operator art-direction guide. When set, the run casts ONE concrete person from it (via
    # story_brain.creator_from_direction) and persists it, so the static concept ads AND the
    # later UGC video show the same human. Optional; without it concepts are uncast, as before.
    direction: str | None = Field(None, description="art-direction guide; casts one person across ads + video")


class VoicePreviewRequest(BaseModel):
    voice_id: str | None = None
    text: str = "Wait — this anarkali has actual pockets."


class VideoPlanRequest(BaseModel):
    """$0. LLM only: script -> storyboard, plus what the render would cost."""
    job_id: str = Field(..., description="an existing run (from /creative/generate)")
    seconds: int = Field(config.STORY_DEFAULT_SECONDS, ge=6, le=90)
    # WHO is in the ad. Persisted to the run, so the render cannot disagree with the script
    # about who is speaking. Reuse the same object across runs to reuse the same creator.
    creator: CreatorKit | None = None
    # The operator's free-text guide for how the ad should look and feel. The SAME string
    # steers the script AND the shot prompts, so words and pictures share one intent.
    # Persisted, so the render uses the direction the script was written to.
    direction: str | None = Field(None, description="e.g. 'cozy handheld, morning light, slow'")
    # Pin the shot count (e.g. 3). Also caps how many clips the paid render will cost.
    n_shots: int | None = Field(None, ge=1, le=12, description="exact number of shots/clips")


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
    # The look/feel guide. Falls back to the run's direction.txt (written by /video/plan),
    # so a render inherits the same direction the plan was made with unless overridden here.
    direction: str | None = Field(None, description="art-direction guide; overrides the plan's")
    # EXPERIMENT, off by default. i2v-seeds every non-hero shot from one generated still of
    # the creator, the only lever Seedance offers for holding a face. It may trip the same
    # content filter that rejects a person in a ref2v reference -- unverified, because the
    # fal balance is empty. When the seed IS dropped the render logs loudly rather than
    # quietly shipping five different faces. Costs one extra FLUX still per persona.
    pin_face: bool = Field(False, description="try to hold the creator's face across shots")
    # OPT-IN (default off): for hero product shots WITH a creator, seed the person wearing/holding
    # the product instead of a person-free plate. Better i2v/face consistency, but a possible
    # product-fidelity tradeoff vs the person-free seed -- needs a live run to validate on.
    hero_with_creator: bool = Field(False, description="seed the creator with the product on hero shots")


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


_CT = {".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4",
       ".mp3": "audio/mpeg", ".json": "application/json"}


def _add_thumbs(job_id: str, run_dir: Path, assets: list[dict]) -> None:
    """Best-effort ~512px JPEG thumbnails for image assets; adds `thumb_url` to each dict so
    the grid loads small and fetches full-res only on open. A failed thumb just leaves the
    field unset (the UI falls back to `url`); it never fails the job."""
    for a in assets:
        try:
            src = run_dir / Path(a["url"]).name
            dst = run_dir / "thumbs" / (src.stem + ".jpg")
            thumbs.image_thumb(src, dst)
            a["thumb_url"] = f"/creative/assets/{job_id}/thumbs/{dst.name}"
        except Exception:  # noqa: BLE001 -- a thumbnail is never worth failing a run over
            log.warning("thumb skipped for %s", a.get("url"), exc_info=True)


def _add_poster(job_id: str, run_dir: Path, video: dict | None) -> None:
    """Best-effort poster frame for a video dict; adds `poster_url`. Same fail-open contract."""
    if not (video and video.get("url")):
        return
    try:
        src = run_dir / Path(video["url"]).name
        dst = run_dir / "thumbs" / (src.stem + ".jpg")
        thumbs.video_poster(src, dst)
        video["poster_url"] = f"/creative/assets/{job_id}/thumbs/{dst.name}"
    except Exception:  # noqa: BLE001 -- a poster is never worth failing a run over
        log.warning("poster skipped for %s", video.get("url"), exc_info=True)


def _publish_assets(job_id: str, run_dir: Path) -> None:
    """Mirror the run's delivered files to R2 under {job_id}/{relpath}. No-op when storage
    is off (local disk stays the source of truth). Best-effort: an upload failure must never
    fail a job whose bytes already exist on disk.

    ponytail: glob the delivered set only — top-level ad_*.png (NOT concept/logo/cutout
    scratch), *.mp4, winners/*.png, thumbs/*.jpg, and the variant tree — so scratch never
    leaves disk.
    """
    if not storage.enabled():
        return
    delivered = [*run_dir.glob("ad_*.png"), *run_dir.glob("*.mp4"),
                 *run_dir.glob("winners/*.png"), *run_dir.glob("thumbs/*.jpg"),
                 *run_dir.glob("variants/*.mp4"),
                 *run_dir.glob("variants/*.script.json"), *run_dir.glob("variants_*.json")]
    for f in delivered:
        try:
            rel = f.relative_to(run_dir).as_posix()
            storage.put_file(storage.asset_key(job_id, rel), f, _CT.get(f.suffix, "application/octet-stream"))
        except Exception:  # noqa: BLE001 -- bytes are on disk; a failed mirror is not a failed job
            log.warning("asset upload skipped for %s", f, exc_info=True)


def _new_job(job_id: str, req: BaseModel, account_id: str | None) -> dict:
    return {"job_id": job_id, "status": "queued", "stage": "Queued", "progress": [],
            "run_id": job_id, "assets": [], "video": None, "brand_kit": None,
            "winners": [], "cost_usd": 0.0, "rejected": [], "error": None,
            "qa_passed": None,
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
            env = meta_live.fetch_envelope_preset(token, account=req.account_id, preset="last_30d")
            dp = run_dir / "_input.json"
            dp.write_text(json.dumps(env), encoding="utf-8")
            data_path = str(dp)
        else:
            data_path = str(config.DEFAULT_DATA)

        # The loop closes HERE: what this account measured last time conditions what we
        # make this time. None for a new account, and a run without a prior is exactly the
        # run we did before this feature existed.
        prior = _prior_for(req.account_id)
        graph_prior = _graph_for(req.account_id)
        if prior is not None:
            stage(f"Applying {len(prior.findings)} learned finding(s) from past ads")
        if graph_prior is not None:
            stage(f"Applying {len(graph_prior.atoms)} structural pattern(s) from "
                  f"{graph_prior.n_winners} winners vs {graph_prior.n_losers} losers")

        m = pipeline.run(
            data_path=data_path, summary=summary, account_name=account_name, run_id=job_id,
            strategy=req.strategy, mode="auto", images=req.images, formats=req.formats,
            qa_retries=req.qa_retries, run_vlm=req.run_vlm, no_logo=req.no_logo,
            product_image=req.product_image, use_shopify=req.use_shopify,
            meta_account=req.account_id, meta_token=token, ground_from_meta=req.ground,
            top_creatives=req.top_creatives, bottom_creatives=req.bottom_creatives,
            min_spend=req.min_spend, prior=prior, graph_prior=graph_prior,
            direction=req.direction, on_stage=stage, log=lambda *_: None)

        job["rejected"] = m.rejected
        job["assets"] = [
            {"concept": a.concept_title, "fmt": a.fmt, "url": _asset_url(job_id, a.path),
             "copy": a.ad_copy.model_dump() if a.ad_copy else None}
            for a in m.ads
        ]
        job["cost_usd"] = m.total_cost_usd
        job["ledger"] = _run_ledger(run_dir)
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

        _add_thumbs(job_id, run_dir, job["assets"])
        _add_poster(job_id, run_dir, job.get("video"))
        _publish_assets(job_id, run_dir)
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
    job0 = _load(req.job_id) or {}
    try:
        script, board = pipeline.plan_story(
            run_id=req.job_id, seconds=req.seconds, creator=req.creator,
            direction=req.direction, n_shots=req.n_shots,
            prior=_prior_for(job0.get("account_id")),
            graph_prior=_graph_for(job0.get("account_id")), log=lambda *_: None)
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
            hero_with_creator=req.hero_with_creator,
            direction=req.direction, log=lambda *_: None)

        stage("Verifying the timeline")
        report = pipeline.qa_video(run_id=job_id, strict=req.strict, run_vlm=True,
                                   log=lambda *_: None)

        job["video"] = {"url": _asset_url(job_id, timeline),
                        "duration_s": board.duration_s, "shots": len(board.shots)}
        job["qa"] = {"verdict": report.verdict,
                     "checks": [c.model_dump() for c in report.checks],
                     "retry_hint": report.retry_hint}
        # Explicit pass/fail flag. The gate returns a "fail" VERDICT (it does not raise),
        # so the video is already attached above: a QA-failed render still ships, marked.
        job["qa_passed"] = report.verdict == "pass"
        job["repair"] = rlog.model_dump() if rlog else None

        if req.variant_axis and req.variant_values:
            stage(f"Cutting {len(req.variant_values)} {req.variant_axis} variants")
            vset, record = pipeline.make_variants(
                run_id=job_id, axis=req.variant_axis, values=req.variant_values,
                log=lambda *_: None)
            job["variants"] = {
                "axis": req.variant_axis,
                "record": _asset_url(job_id, record),
                # edit-axis variants are {id}.mp4; structural (hook) are {id}.script.json.
                "variants": [{**v.model_dump(),
                              "url": f"/creative/assets/{job_id}/variants/{v.variant_id}."
                                     + ("mp4" if v.kind == "edit" else "script.json")}
                             for v in vset.variants],
            }
            # Persist them NOW, with no meta_ad_id and no metrics. The row has to exist
            # before there is anything for an operator to stamp -- this is the front half
            # of the closed loop (T11).
            _save_variants(vset, job.get("account_id"))

        job["cost_usd"] = _run_cost(run_dir)
        job["ledger"] = _run_ledger(run_dir)
        job["actuals"] = _read_json(run_dir / "fal_actuals.json")
        _add_poster(job_id, run_dir, job.get("video"))
        _publish_assets(job_id, run_dir)
        stage("Done")
        job["status"] = "complete"
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        salvaged = _salvage_partial(job_id)
        if salvaged is not None:
            # Clips were already rendered (paid). A strict-QA raise or a finish-step error
            # must NOT discard them: attach the partial render and flag QA as not passed,
            # rather than returning a bare "failed" with nothing (the render is the money).
            run_dir = config.OUTPUT_DIR / job_id
            job["video"] = salvaged
            job["qa_passed"] = False
            job["qa"] = {"verdict": "fail", "checks": [],
                         "retry_hint": f"render did not complete cleanly: {e}"}
            job["cost_usd"] = _run_cost(run_dir)
            job["ledger"] = _run_ledger(run_dir)
            job["actuals"] = _read_json(run_dir / "fal_actuals.json")
            _publish_assets(job_id, run_dir)
            job["error"] = None
            stage("Done (QA not passed; partial render attached)")
            job["status"] = "complete"
        else:
            job["status"] = "failed"
            job["error"] = f"{e}"
    _save(job)


def _salvage_partial(job_id: str) -> dict | None:
    """The most-finished on-disk render for a video job whose render RAISED after clips
    were already paid for (recovery exhausted, or a finish step erroring). Returns a
    job["video"] payload, or None when nothing has rendered yet -- a raise before any
    spend (balance guard, missing storyboard) stays a genuine failure.

    Never throw away a paid Seedance render over a QA raise: the clips are the expensive
    part and they are already on disk.
    """
    run_dir = config.OUTPUT_DIR / job_id
    clip = next((run_dir / n for n in pipeline._FINAL_CLIP_NAMES
                 if (run_dir / n).exists()), None)
    if clip is None:                      # no assembled timeline yet: the newest raw shot
        renders = sorted(run_dir.glob("renders/*.mp4"), key=lambda p: p.stat().st_mtime)
        clip = renders[-1] if renders else None
    if clip is None:
        return None

    shots = dur = None
    for name in ("storyboard_rendered.json", "storyboard.json"):
        try:
            board = Storyboard.model_validate_json((run_dir / name).read_text("utf-8"))
            shots, dur = len(board.shots), board.duration_s
            break
        except Exception:  # noqa: BLE001 -- best-effort metadata; the clip is what matters
            continue
    if dur is None:
        from ai_layer.creative import editor
        dur = editor.media_duration(clip)

    rel = clip.relative_to(run_dir).as_posix()
    return {"url": f"/creative/assets/{job_id}/{rel}",
            "duration_s": dur, "shots": shots, "partial": True}


def _run_cost(run_dir: Path) -> float:
    """The run's estimated spend: the sum of the ledger's per-op rows. Deliberately NOT
    the TOTAL row -- a run that crashed or resumed may never have been finalized."""
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


def _run_ledger(run_dir: Path) -> dict | None:
    """The finalized TOTAL row -- grand total plus the per-op breakdown. Rides to Neon on
    the job's `ledger` key (repository maps it to creative_jobs.ledger_json), because
    ledger.jsonl lives on the run's ephemeral disk and does not survive a redeploy. That
    is what makes 'was the displayed run cost right?' answerable after the fact."""
    led = run_dir / "ledger.jsonl"
    if not led.exists():
        return None
    for line in reversed(led.read_text("utf-8").splitlines()):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("op") == "TOTAL":
            return row
    return None


# --- the closed loop (T11): publish -> stamp -> harvest -> prior ----------------

def _save_variants(vset, account_id: str | None) -> None:
    """Front half of the loop. Best-effort, like every other DB write here."""
    try:
        from ai_layer.db import repository
        repository.save_variants(
            [{**v.model_dump(), "base_id": vset.base_id} for v in vset.variants],
            brand_id=account_id)
    except Exception:  # noqa: BLE001
        log.debug("creative_variants write skipped (no DB)", exc_info=True)


def _prior_for(account_id: str | None):
    """The account's learned prior, or None. Never fails a generation: an account with no
    history, or no database, simply generates without a prior, which is what it did before
    this feature existed."""
    if not account_id:
        return None
    try:
        from ai_layer.creative import outcomes
        prior = outcomes.build_prior(account_id)
        return prior if prior.n_observed else None
    except Exception:  # noqa: BLE001
        log.debug("prior unavailable (no DB or no history)", exc_info=True)
        return None


def _graph_for(account_id: str | None):
    """The account's structural graph (what winners do differently from losers), or None.

    Weaker evidence than the prior and injected as such. None for an account whose teardown
    library has no losers in it -- a winner-only corpus cannot support a claim.
    """
    if not account_id:
        return None
    try:
        from ai_layer.creative import graph as graph_mod
        g = graph_mod.build_graph(account_id)
        return g if g.identifiable and g.atoms else None
    except Exception:  # noqa: BLE001
        log.debug("graph unavailable (no DB or no teardowns)", exc_info=True)
        return None


@router.get("/graph/{account_id}")
def get_graph(account_id: str):
    """The creative graph: every choice this account's winners made, contrasted against its
    losers. Answers "which hook works here", which a folder of MP4s cannot.

    `brief` is verbatim what the brain is told, and it is EMPTY unless the library contains
    losers -- because "pattern interrupt appears in 60% of winners" is exactly as true, and
    exactly as meaningless, as "60% of winners ran on a Tuesday".
    """
    from ai_layer.creative import graph as graph_mod
    try:
        g = graph_mod.build_graph(account_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"no database: {e}") from e
    return {**g.model_dump(), "identifiable": g.identifiable, "brief": g.to_brief()}


class PublishedRequest(BaseModel):
    meta_ad_id: str = Field(..., description="the Meta ad this variant became")


@router.post("/variants/{variant_id}/published")
def mark_published(variant_id: str, req: PublishedRequest):
    """Stamp which Meta ad a variant became. THE JOIN.

    Manual by necessity: nothing in this codebase publishes an ad (the Meta layer is
    GET-only), so a human ships it and records the id here. Without this call the variant
    is an unattributable number and the loop never closes.
    """
    try:
        from ai_layer.db import repository
        ok = repository.stamp_published(variant_id, req.meta_ad_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"no database: {e}") from e
    if not ok:
        raise HTTPException(status_code=404, detail=f"variant {variant_id!r} not found")
    return {"variant_id": variant_id, "meta_ad_id": req.meta_ad_id, "status": "published"}


class LearnRequest(BaseModel):
    account_id: str
    preset: str = "last_30d"


@router.post("/learn")
def learn(req: LearnRequest, x_meta_token: str | None = Header(default=None)):
    """Harvest realized performance for every published variant, then rebuild the prior.

    Returns the prior AS THE BRAIN WILL SEE IT (`brief`), which is empty when nothing has
    cleared the significance bar. That emptiness is the honest answer for a young account,
    and it is deliberately visible here rather than hidden behind an average.
    """
    token = x_meta_token or os.getenv("META_ACCESS_TOKEN")
    if not token:
        raise HTTPException(status_code=400, detail="no Meta token; cannot harvest outcomes")
    from ai_layer.creative import outcomes
    try:
        stats = outcomes.harvest(req.account_id, req.account_id, token, preset=req.preset,
                                 log=lambda *_: None)
        prior = outcomes.build_prior(req.account_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"learn failed: {e}") from e
    return {"account_id": req.account_id, **stats,
            "prior": prior.model_dump(), "brief": prior.to_brief()}


@router.get("/prior/{account_id}")
def get_prior(account_id: str):
    """What this account has actually learned. `brief` is verbatim what the brain is told."""
    from ai_layer.creative import outcomes
    try:
        prior = outcomes.build_prior(account_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"no database: {e}") from e
    return {**prior.model_dump(), "brief": prior.to_brief()}


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


@router.post("/voice/preview")
def voice_preview(req: VoicePreviewRequest):
    """A short spoken sample of the persona's voice, so the picker is a guarantee you can
    HEAR before you pay. Returns the fal-hosted audio URL; the browser plays it directly."""
    from ai_layer.creative import video_providers
    try:
        return video_providers.voice_preview(req.voice_id, req.text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"voice preview failed: {e}") from e
