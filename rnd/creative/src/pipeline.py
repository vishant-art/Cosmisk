"""Orchestrate the experiment: campaigns -> brand kit -> logo -> on-brand images.

Modes:
  auto   -- kit + logo + N images in one shot.
  review -- kit + logo only, then STOP. The user edits output/<run>/brand_kit.json
            and reruns with resume() to generate images from the edited kit.

Pipeline functions call the brain/provider MODULES by attribute (brand_brain.*,
image_providers.*, logo.*), so tests monkeypatch those module attributes to run
the whole flow with zero spend.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))  # rnd/src (Meta layer)
import brand_brain  # noqa: E402
import campaign_select as cs  # noqa: E402
import captions as captions_mod  # noqa: E402
import meta_creatives  # noqa: E402
import compositor  # noqa: E402
import config  # noqa: E402
import editor  # noqa: E402
import image_providers  # noqa: E402
import layout as layout_mod  # noqa: E402
import logo as logo_mod  # noqa: E402
import prompt_builder  # noqa: E402
import sequencer  # noqa: E402
import story_brain  # noqa: E402
import storyboard as sb_mod  # noqa: E402
import variants  # noqa: E402
import teardown  # noqa: E402
import verifier  # noqa: E402
import verifier_video  # noqa: E402
import video_providers  # noqa: E402
from ledger import Ledger  # noqa: E402
from schemas import (  # noqa: E402
    AssetRecord, BrandKit, CreativeTemplate, QAReport, RunManifest, Script, Storyboard,
)

DEFAULT_FORMATS = ["4:5"]                # base shape; pass more to fan out (1:1/9:16/16:9)


def _slug(fmt: str) -> str:
    return fmt.replace(":", "x")


def _meta_cohort(account, *, preset, top_n, run_dir, token=None, bottom_n=5,
                 min_spend=100.0, log=print):
    """Pull BOTH tails of the account's ROAS distribution (UGC-D5).

    Returns (ref_images, assets). `ref_images` are WINNER stills only, because those
    condition generation and we do not want to condition on a loser's pixels. `assets`
    carries the whole cohort, including losers and including MP4s, because the teardown
    learns from the contrast.

    Never blocks a run: no token, or a Meta hiccup, yields ([], []) and a log line.
    """
    token = token or os.getenv("META_ACCESS_TOKEN")
    if not token:
        log("[meta] META_ACCESS_TOKEN not set; skipping cohort fetch")
        return [], []
    try:
        assets = meta_creatives.fetch_creative_cohort(
            token, account, preset=preset, top_n=top_n, bottom_n=bottom_n,
            min_spend=min_spend, out_dir=Path(run_dir) / "winners", log=log)
    except Exception as e:  # noqa: BLE001 -- never let Meta hiccups break a run
        log(f"[meta] cohort fetch failed ({e!s:.120}); proceeding without refs")
        return [], []
    # Winner stills condition FLUX. Loser stills deliberately do not.
    imgs = [a.local_path for a in assets if a.cohort == "winner" and a.local_path]
    log(f"[meta] {len(imgs)} winning image ref(s) from {account}")
    return imgs, assets


def _teardown_winner(assets, *, client, run_dir, led, log=print):
    """Tear down the best winner that has a playable MP4. Returns a CreativeTemplate
    or None.

    The MP4s were already being downloaded here and then dropped on the floor by a
    `kind == "image"` filter that never opened them. This is the fix, and it costs one
    Whisper call plus one vision call.
    """
    with_video = [a for a in assets if a.cohort == "winner" and a.video_path]
    if not with_video:
        log("[teardown] no winner has a playable MP4; concepts will be ungrounded")
        return None
    best = max(with_video, key=lambda a: a.roas)
    try:
        return teardown.analyze(best.video_path, ad_id=best.ad_id, ad_name=best.ad_name,
                                cohort=best.cohort, metrics=best.metrics, client=client,
                                led=led, work_dir=Path(run_dir) / "teardown", log=log)
    except Exception as e:  # noqa: BLE001 -- a teardown must never break a run
        log(f"[teardown] failed for {best.ad_id} ({e!s:.120}); concepts will be ungrounded")
        return None


def _client() -> OpenAI:
    # dummy key keeps construction offline-safe in tests (patched brain never calls out)
    return OpenAI(api_key=config.OPENROUTER_API_KEY or "sk-test",
                  base_url=config.OPENROUTER_BASE_URL)


def _write_manifest(run_dir: Path, manifest: RunManifest) -> None:
    (run_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2),
                                           encoding="utf-8")


def _write_kit(run_dir: Path, kit: BrandKit) -> None:
    (run_dir / "brand_kit.json").write_text(kit.model_dump_json(indent=2),
                                            encoding="utf-8")


def run(*, data_path: str, run_id: str, strategy="top-roas", n_campaigns=5,
        mode="auto", images=4, image_provider="flux", formats=None,
        qa_retries=1, run_vlm=False, pro=False, refs=None, product_image=None,
        meta_account=None, ground_from_meta=True, meta_preset="last_30d",
        top_creatives=5, bottom_creatives=5, min_spend=100.0, style=None,
        no_logo=False, log=print) -> RunManifest:
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    led = Ledger(run_dir)

    ds = cs.load_dataset(data_path)
    subset = cs.select_campaigns(ds, strategy, n_campaigns)
    summary = cs.summarize(ds, subset)
    log(f"[1/4] {ds.account_name}: {len(subset)} campaigns via '{strategy}'")

    # Pull the real creative cohort from Meta (both tails) to ground generation.
    winner_refs, cohort = (_meta_cohort(meta_account, preset=meta_preset,
                                        top_n=top_creatives, bottom_n=bottom_creatives,
                                        min_spend=min_spend, run_dir=run_dir, log=log)
                           if meta_account else ([], []))
    if refs is None and winner_refs:
        refs = winner_refs                       # condition backgrounds on real winners
    # Grounding is ON by default now. The vision pass is the only place the brain ever
    # looks at what actually converted for this account, and it used to be off.
    ground_images = winner_refs if (ground_from_meta and winner_refs) else None

    client = _client()
    log("[2/4] generating brand kit...")
    kit, kit_cost = brand_brain.generate_brand_kit(client, summary, ground_images=ground_images)
    led.record("brandkit", "openrouter", config.TEXT_MODEL, kit_cost)
    _write_kit(run_dir, kit)

    # Structural teardown of the top winner's MP4 -> the template that conditions concepts.
    template = _teardown_winner(cohort, client=client, run_dir=run_dir, led=led,
                                log=log) if cohort else None
    if template:
        (run_dir / "template.json").write_text(template.model_dump_json(indent=2),
                                               encoding="utf-8")

    manifest = RunManifest(
        run_id=run_id, account_name=ds.account_name, select_strategy=strategy,
        mode=mode, status="awaiting_review", brand_kit=kit, formats=formats,
    )
    if no_logo:
        kit.logo.asset_path = None            # no logo generated or composited
        log("[3/4] skipping logo (--no-logo)")
    else:
        log("[3/4] generating logo...")
        logo_res = logo_mod.generate_logo(kit, run_dir / "logo.png",
                                          provider=image_provider, log=log)
        led.record("logo", logo_res["provider"], logo_res["model"],
                   logo_res["cost_usd"], path=logo_res["path"])
        _write_kit(run_dir, kit)   # re-write now that logo.asset_path is set
        manifest.assets.append(AssetRecord(kind="logo", **_asset(logo_res)))

    if mode == "review":
        manifest.total_cost_usd = led.total
        led.finalize()
        _write_manifest(run_dir, manifest)
        log(f"[review] kit + logo written to {run_dir}. Edit brand_kit.json then "
            f"resume with --resume {run_id}.")
        return manifest

    _generate_ads(client, kit, summary, run_dir, manifest, led, images=images,
                  image_provider=image_provider, formats=formats, qa_retries=qa_retries,
                  run_vlm=run_vlm, pro=pro, refs=refs, product_image=product_image,
                  template=template, style=style, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    led.finalize()
    _write_manifest(run_dir, manifest)
    log(f"[done] {len(manifest.ads)} ads across {len(formats)} format(s), "
        f"{len(manifest.rejected)} rejected, est ${led.total:.3f} -> {run_dir}")
    return manifest


def resume(*, run_id: str, data_path: str, images=4, image_provider="flux",
           formats=None, qa_retries=1, run_vlm=False, pro=False, refs=None,
           product_image=None, style=None, log=print) -> RunManifest:
    """Generate ads from a (possibly user-edited) brand_kit.json in output/<run>."""
    formats = list(formats) if formats else list(DEFAULT_FORMATS)
    run_dir = config.OUTPUT_DIR / run_id
    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    led = Ledger(run_dir)
    # Reuse the run's teardown rather than re-downloading and re-analyzing the winner.
    tpl_file = run_dir / "template.json"
    template = (CreativeTemplate.model_validate_json(tpl_file.read_text("utf-8"))
                if tpl_file.exists() else None)
    ds = cs.load_dataset(data_path)
    summary = cs.summarize(ds, cs.select_campaigns(ds, "all", 0))

    logo_path = run_dir / "logo.png"
    if kit.logo.asset_path is None and logo_path.exists():
        kit.logo.asset_path = str(logo_path)

    manifest = RunManifest(run_id=run_id, account_name=ds.account_name,
                           select_strategy="resume", mode="review",
                           status="awaiting_review", brand_kit=kit, formats=formats)
    if logo_path.exists():
        manifest.assets.append(AssetRecord(kind="logo", provider="?",
                               model="?", path=str(logo_path)))

    client = _client()
    _generate_ads(client, kit, summary, run_dir, manifest, led, images=images,
                  image_provider=image_provider, formats=formats, qa_retries=qa_retries,
                  run_vlm=run_vlm, pro=pro, refs=refs, product_image=product_image,
                  template=template, style=style, log=log)
    manifest.status = "complete"
    manifest.total_cost_usd = led.total
    led.finalize()
    _write_manifest(run_dir, manifest)
    log(f"[done] resumed: {len(manifest.ads)} ads, est ${led.total:.3f} -> {run_dir}")
    return manifest


def plan_story(*, run_id: str, data_path: str, seconds: int = None, log=print
               ) -> tuple[Script, "sb_mod.Storyboard"]:
    """Script -> Storyboard, written to the run dir. No pixels, no renderer (T6).

    Standalone-valuable: a shot list a human creator could shoot is a deliverable even
    if we never render a frame (OQ3). The renderer moves down the stack and becomes a
    detail; the sequence IS the creative.

    Reuses the run's teardown (template.json) so the argument is grounded in the
    structure of a real winner rather than invented from a brand kit.
    """
    seconds = config.STORY_DEFAULT_SECONDS if seconds is None else seconds
    run_dir = config.OUTPUT_DIR / run_id
    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    led = Ledger(run_dir)

    tpl_file = run_dir / "template.json"
    template = (CreativeTemplate.model_validate_json(tpl_file.read_text("utf-8"))
                if tpl_file.exists() else None)
    if template is None:
        log("[story] no teardown for this run; the script will be ungrounded")

    ds = cs.load_dataset(data_path)
    summary = cs.summarize(ds, cs.select_campaigns(ds, "all", 0))

    script, s_cost = story_brain.generate_script(client=(client := _client()), kit=kit,
                                                 summary=summary, seconds=seconds,
                                                 template=template)
    led.record("script", "openrouter", config.TEXT_MODEL, s_cost, beats=len(script.beats))
    (run_dir / "script.json").write_text(script.model_dump_json(indent=2), encoding="utf-8")

    board, b_cost = story_brain.generate_storyboard(client, kit, script, seconds=seconds,
                                                    template=template, log=log)
    led.record("storyboard", "openrouter", config.TEXT_MODEL, b_cost, shots=len(board.shots))
    (run_dir / "storyboard.json").write_text(board.model_dump_json(indent=2), encoding="utf-8")

    led.finalize()
    log(f"[story] {len(script.beats)} beats -> {len(board.shots)} shots, "
        f"{board.duration_s:.1f}s (est ${led.total:.3f}) -> {run_dir}")
    log(sb_mod.as_shot_list(board))
    return script, board


def _run_script(run_dir: Path) -> Script | None:
    """The run's Script artifact, if plan_story has been run."""
    f = run_dir / "script.json"
    return Script.model_validate_json(f.read_text("utf-8")) if f.exists() else None


# Preference order for "the clip that ships": the most post-processed one wins.
_FINAL_CLIP_NAMES = ("video_captioned.mp4", "video_voiceover.mp4",
                     "video_overlay.mp4", "timeline.mp4", "video.mp4")


def render_story(*, run_id: str, style=None, aspect: str = "9:16", resolution: str = "720p",
                 single_pass: bool = False, strict: bool = True, finish: bool = True,
                 log=print):
    """Render a planned storyboard into a timeline (T7). Costs real money.

    Reads the run's storyboard.json and brand_kit.json, renders every shot with repair
    (T9.5), edits each one (T7.5), concatenates, then verifies the assembled timeline
    against the plan (T9). The clip that ships is the clip that gets verified.
    """
    run_dir = config.OUTPUT_DIR / run_id
    board = Storyboard.model_validate_json(
        (run_dir / "storyboard.json").read_text("utf-8"))
    kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
    script = _run_script(run_dir)
    cut = run_dir / "product_cutout.png"
    cutout = str(cut) if cut.exists() else None
    led = Ledger(run_dir)

    if single_pass:
        timeline = sequencer.render_single_pass(board, kit=kit, run_dir=run_dir,
                                                style=style, aspect=aspect,
                                                resolution=resolution, led=led, log=log)
        rlog = None
    else:
        client = _client()
        timeline, board, rlog = sequencer.render_storyboard(
            board, kit=kit, run_dir=run_dir, script=script, style=style,
            cutout_path=cutout, aspect=aspect, resolution=resolution,
            replan=lambda shot, reason: story_brain.replan_shot(
                client, kit, shot, reason=reason)[0],
            strict=strict, led=led, log=log)
        (run_dir / "storyboard_rendered.json").write_text(
            board.model_dump_json(indent=2), encoding="utf-8")
        (run_dir / "repair_log.json").write_text(rlog.model_dump_json(indent=2),
                                                 encoding="utf-8")

    if finish and script is not None:
        timeline = finish_timeline(timeline, board, script, kit, run_dir,
                                   client=_client(), led=led, log=log)

    billed, used = sequencer.billed_seconds(board)
    led.finalize()
    log(f"[render] {timeline} ({used:g}s of ad, {billed:g}s billed, "
        f"est ${led.total:.2f})")
    return timeline, board, rlog


def finish_timeline(timeline, board: Storyboard, script: Script, kit: BrandKit, run_dir, *,
                    client=None, sfx: bool = True, voiceover: bool = True,
                    captions: bool = True, led=None, log=print) -> str:
    """Voiceover, SFX and captions over the ASSEMBLED timeline, not per shot.

    One voiceover across the whole ad, muxed once. Splicing per-shot audio at every cut
    produces exactly the seams the cuts were meant to hide, and per-shot captions cannot
    know where a sentence crosses a boundary.

    Order matters: the VO lands first so the SFX have something to mix against, and the
    captions go last because they are checked against the audio that ships.
    """
    run_dir = Path(run_dir)
    out = timeline

    if voiceover:
        try:
            spoken = script.spoken()
            vo = video_providers.generate_voiceover(spoken, run_dir / "voiceover.mp3",
                                                    log=log)
            if led:
                led.record("voiceover", vo["provider"], vo["model"], vo["cost_usd"],
                           chars=len(spoken))
            merged = video_providers.merge_audio_onto_video(
                out, vo["path"], run_dir / "timeline_voiceover.mp4",
                seconds=board.duration_s, log=log)
            if led:
                led.record("audio_merge", merged["provider"], merged["model"],
                           merged["cost_usd"])
            out = merged["path"]
        except Exception as e:  # noqa: BLE001 -- a silent ad is still an ad
            log(f"[finish] voiceover failed ({e!s:.100}); the timeline stays silent")
            voiceover = False

    if sfx:
        try:
            cues = editor.sfx_cues_for(board)
            out = editor.add_sfx(out, run_dir / "timeline_sfx.mp4", cues, log=log)
        except Exception as e:  # noqa: BLE001
            log(f"[finish] sfx failed ({e!s:.100}); continuing without them")

    if captions and voiceover:
        try:
            out = editor.caption_clip(out, run_dir / "video_captioned.mp4",
                                      script.spoken(), run_dir / "voiceover.mp3",
                                      kit=kit, led=led, log=log)[0]
        except captions_mod.CaptionDriftError as e:
            log(f"[captions] REFUSED by the drift gate: {e!s:.140}")
        except Exception as e:  # noqa: BLE001
            log(f"[captions] burn failed ({e!s:.100}); shipping uncaptioned")

    log(f"[finish] {Path(out).name}")
    return str(out)


def make_variants(*, run_id: str, axis: str, values: list, base_clip=None, log=print):
    """Produce a matched variant set for a run (T10).

    Edit axes (`caption_style`, `aesthetic`) cut the run's finished timeline N ways for
    zero marginal model cost and write the clips. The `hook_type` axis regenerates N
    matched scripts and writes them for the operator to render (each is a full render, so
    the pipeline does not spend that money implicitly).

    Writes the experiment record either way: that is the point of T10, the clean tag that
    lets performance be attributed back to (axis, value) later.
    """
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    vdir = run_dir / "variants"

    if axis == "hook_type":
        script = _run_script(run_dir)
        if script is None:
            raise FileNotFoundError(f"{run_dir}/script.json not found; run --storyboard")
        kit = BrandKit.model_validate_json((run_dir / "brand_kit.json").read_text("utf-8"))
        tpl_file = run_dir / "template.json"
        template = (CreativeTemplate.model_validate_json(tpl_file.read_text("utf-8"))
                    if tpl_file.exists() else None)
        vset, scripts, cost = variants.hook_variant_set(
            _client(), kit, script, values, base_id=run_id, template=template)
        led.record("variant_scripts", "openrouter", config.TEXT_MODEL, cost)
        vdir.mkdir(parents=True, exist_ok=True)
        artifacts = {}
        for vid, s in scripts.items():
            p = vdir / f"{vid}.script.json"
            p.write_text(s.model_dump_json(indent=2), encoding="utf-8")
            artifacts[vid] = str(p)
        record = variants.write_record(run_dir, vset, artifacts,
                                       extra={"note": "render each with --resume/--render"})
    else:
        clip = base_clip or next(
            (run_dir / n for n in _FINAL_CLIP_NAMES if (run_dir / n).exists()), None)
        if clip is None:
            raise FileNotFoundError(f"no rendered clip in {run_dir}; run --render first")
        if axis == "caption_style":
            script = _run_script(run_dir)
            text = script.spoken() if script else ""
            vset, artifacts = variants.caption_variant_set(
                clip, text, values, base_id=run_id, out_dir=vdir, led=led, log=log)
        elif axis == "aesthetic":
            vset, artifacts = variants.aesthetic_variant_set(
                clip, values, base_id=run_id, out_dir=vdir, log=log)
        else:
            raise ValueError(f"unknown variant axis {axis!r}")
        record = variants.write_record(run_dir, vset, artifacts)

    led.finalize()
    log(f"[variants] {len(vset.variants)} {axis} variant(s) -> {record}")
    return vset, record


def qa_video(*, run_id: str, clip=None, cutout=None, shot_paths=None, strict: bool = True,
             run_vlm: bool = False, log=print) -> QAReport:
    """Run the temporal QA gate over a run's finished clip (T9).

    Verifies the artifact that SHIPS, chosen as the most post-processed clip in the run
    dir. Verifying an earlier intermediate would miss every defect the editor introduced,
    which is most of the ones worth catching.
    """
    run_dir = config.OUTPUT_DIR / run_id
    board_file = run_dir / "storyboard.json"
    if not board_file.exists():
        raise FileNotFoundError(f"{board_file} not found; run --storyboard first")
    board = Storyboard.model_validate_json(board_file.read_text("utf-8"))

    if clip is None:
        clip = next((run_dir / n for n in _FINAL_CLIP_NAMES if (run_dir / n).exists()), None)
    if clip is None:
        raise FileNotFoundError(f"no rendered clip in {run_dir}")

    if cutout is None:
        cut = run_dir / "product_cutout.png"
        cutout = str(cut) if cut.exists() else None

    led = Ledger(run_dir)
    report = verifier_video.verify(
        clip, board, _run_script(run_dir), client=(_client() if run_vlm else None),
        cutout_path=cutout, shot_paths=shot_paths, strict=strict, led=led,
        work_dir=run_dir / "qa", log=log)
    (run_dir / "qa_report.json").write_text(report.model_dump_json(indent=2),
                                            encoding="utf-8")
    led.finalize()
    log(f"[qa] {Path(clip).name}: {report.verdict} -> {run_dir / 'qa_report.json'}")
    if report.retry_hint:
        log(f"[qa] {report.retry_hint}")
    return report


def video_smoke(*, run_id: str, prompt: str, image=None,
                duration=config.VIDEO_DURATION_DEFAULT, resolution="720p", aspect="9:16",
                copy=None, kit=None, logo_path=None, generate_audio=True,
                voiceover=False, captions=True, client=None, log=print) -> AssetRecord:
    """Explicit, budget-gated single-clip smoke (Seedance i2v -> t2v fallback).
    Seeds from a TEXT-FREE background of this run so the clip matches the static ad.
    - `generate_audio` (default True): Seedance synced native audio (free).
    - `copy` (+ `kit`): burns the headline/CTA lower-third onto the clip.
    - `voiceover` (+ `client`, `kit`): brain writes a script -> fal TTS -> muxed on.
    - `captions` (default True, requires `voiceover`): word-level ASR over the
      voiceover we just generated -> burned-in per-word captions (T3). Costs one
      Whisper call, which is a rounding error beside the Seedance render."""
    run_dir = config.OUTPUT_DIR / run_id
    led = Ledger(run_dir)
    seed = image
    if seed is None:                                   # prefer a text-free bg from this run
        cands = sorted(run_dir.glob("concept_*_bg.png"))
        seed = str(cands[0]) if cands else None
    try:
        res = video_providers.generate_with_fallback(
            prompt, run_dir / "video.mp4", image=seed, duration=duration,
            resolution=resolution, aspect=aspect, generate_audio=generate_audio, log=log)
    except Exception as e:  # noqa: BLE001 -- a total video failure must not crash the run
        log(f"[video] generation failed entirely ({e!s:.140}); no clip produced")
        led.finalize()
        return None
    led.record("video", res["provider"], res["model"], res["cost_usd"],
               fell_back_from=res.get("fell_back_from"), audio=res.get("audio", generate_audio))
    log(f"[video] {res['provider']} ({'i2v' if seed else 't2v'}, "
        f"audio={'on' if res.get('audio', generate_audio) else 'off'}) -> {res['path']} "
        f"(est ${res['cost_usd']:.2f})")

    if copy is not None and kit is not None:           # burn copy/logo onto the clip
        try:
            final = editor.add_copy_overlay(
                res["path"], run_dir / "video_overlay.mp4", copy, kit,
                fmt=aspect, logo_path=logo_path)
            res["path"] = final
            log(f"[video] copy overlay -> {final}")
        except Exception as e:  # noqa: BLE001 -- overlay is best-effort
            log(f"[video] copy overlay failed ({e!s:.100}); keeping raw clip")

    script = vo = None
    if voiceover and kit is not None and client is not None:   # script -> TTS -> mux
        try:
            # Prefer the run's Script artifact (T6). Its `spoken()` text is the exact
            # ground truth the caption drift gate checks against, so the voiceover and
            # the captions cannot disagree about what was said.
            planned = _run_script(run_dir)
            if planned is not None:
                script, vo_cost = planned.spoken(), 0.0
                log(f"[video] using script.json ({len(planned.beats)} beats)")
            else:
                hook = copy.headline if copy else prompt
                cta = copy.cta_label if copy else ""
                script, vo_cost = story_brain.generate_vo_script(client, kit, hook, cta,
                                                                 duration)
            led.record("vo_script", "openrouter", config.TEXT_MODEL, vo_cost)
            vo = video_providers.generate_voiceover(script, run_dir / "voiceover.mp3", log=log)
            led.record("voiceover", vo["provider"], vo["model"], vo["cost_usd"], chars=len(script))
            merged = video_providers.merge_audio_onto_video(
                res["path"], vo["path"], run_dir / "video_voiceover.mp4",
                seconds=duration, log=log)
            led.record("audio_merge", merged["provider"], merged["model"], merged["cost_usd"])
            res["path"] = merged["path"]
            log(f"[video] voiceover ({len(script)} chars) muxed -> {merged['path']}")
        except Exception as e:  # noqa: BLE001 -- voiceover is best-effort
            script = vo = None
            log(f"[video] voiceover failed ({e!s:.100}); keeping clip without VO")

    # Burned-in per-word captions (T3). Its own error handling: a caption failure is
    # not a voiceover failure, and folding the two makes the drift gate invisible.
    if captions and script and vo:
        try:
            res["path"] = editor.caption_clip(
                res["path"], run_dir / "video_captioned.mp4", script, vo["path"],
                kit=kit, led=led, log=log)[0]
        except captions_mod.CaptionDriftError as e:
            # The gate did its job. Shipping a clip whose captions contradict its audio
            # is worse than shipping one with no captions at all.
            log(f"[captions] REFUSED by the drift gate: {e!s:.140}")
        except Exception as e:  # noqa: BLE001 -- burn-in is best-effort
            log(f"[captions] burn failed ({e!s:.100}); shipping uncaptioned")

    led.finalize()
    return AssetRecord(kind="video", **_asset(res))


def _generate_ads(client, kit, summary, run_dir, manifest, led, *, images,
                  image_provider, formats, qa_retries, run_vlm, pro, refs=None,
                  product_image=None, template=None, style=None, log=print) -> None:
    """For each concept: a text-free background (QA-gated, regenerated on fail) ->
    per-format layout -> Pillow composite -> verify. The base format is the gate;
    other formats are outpainted from the accepted background, then composited.

    Conditioning: `product_image` -> Bria product-shot (real product into the scene,
    after a BiRefNet cutout); else `refs` (e.g. real winning creatives) -> FLUX.2 flex
    reference images; else a blind text-only background.

    `template` grounds the CONCEPTS in the measured structure of a real winner (T5);
    `style` grounds the pixels in a UGC capture aesthetic (T1)."""
    log(f"[4/4] {images} concepts x {len(formats)} format(s); QA retries={qa_retries}...")
    concepts, concepts_cost = story_brain.generate_concepts(client, kit, summary, images,
                                                            template=template)
    led.record("concepts", "openrouter", config.TEXT_MODEL, concepts_cost)
    negative = prompt_builder.build_negative_prompt()
    base_fmt = formats[0]
    logo_path = kit.logo.asset_path

    # Resolve the conditioning mode once. Product cutout (background removed) makes
    # product-shot place the real product cleanly into the generated scene.
    if product_image:
        cut = run_dir / "product_cutout.png"
        try:
            cres = image_providers.cutout(product_image, cut)
            led.record("cutout", cres["provider"], cres["model"], cres["cost_usd"])
            bg_primary, bg_refs = "product", [str(cut)]
        except Exception as e:  # noqa: BLE001 -- cutout is best-effort
            log(f"  [product] cutout failed ({e!s:.80}); using raw product image")
            bg_primary, bg_refs = "product", [product_image]
    else:
        bg_primary, bg_refs = image_provider, (refs or None)

    for i, concept in enumerate(concepts, 1):
        layouts = layout_mod.plan_all_formats(concept.ad_copy, formats,
                                              has_logo=bool(logo_path))
        bg = run_dir / f"concept_{i:02d}_bg.png"
        base_spec = layouts[base_fmt]
        base_out = run_dir / f"ad_{i:02d}_{_slug(base_fmt)}.png"
        accepted = None

        for attempt in range(qa_retries + 1):
            # Background is TEXT-FREE: negative prompt suppresses text/logo. `bg_refs`
            # condition the scene on the real product / winning creatives (or None).
            prompt = prompt_builder.build_image_prompt(concept, kit, base_fmt, style=style)
            res = image_providers.generate_with_fallback(
                prompt, bg, primary=bg_primary, refs=bg_refs, aspect=base_fmt,
                negative=negative, pro=pro, log=log)
            led.record("background", res["provider"], res["model"], res["cost_usd"],
                       concept=concept.title, fell_back_from=res.get("fell_back_from"))
            comp = compositor.compose(bg, base_spec, concept.ad_copy, base_out, kit=kit,
                                      logo_path=logo_path, concept_title=concept.title)
            comp.ad_copy = concept.ad_copy        # carry copy for video overlay / VO reuse
            report = verifier.verify(comp, base_spec, concept.ad_copy,
                                     client=client if run_vlm else None, run_vlm=run_vlm,
                                     expect_logo=bool(logo_path))
            manifest.qa_reports.append(report)
            if report.cost_usd:
                led.record("qa_vlm", "openrouter", config.VISION_MODEL,
                           report.cost_usd, concept=concept.title)
            if report.approved:
                accepted = comp
                break
            log(f"  - '{concept.title}' QA fail (try {attempt + 1}): {report.retry_hint}")

        if accepted is None:
            manifest.rejected.append(concept.title)
            log(f"  - '{concept.title}' REJECTED after {qa_retries + 1} tries -- not shipped")
            continue

        for fmt in formats:
            if fmt == base_fmt:
                comp = accepted
            else:
                src = bg
                fbg = run_dir / f"concept_{i:02d}_bg_{_slug(fmt)}.png"
                try:                          # extend the accepted bg to this ratio
                    op = image_providers.outpaint(bg, fbg, fmt=fmt, negative=negative)
                    led.record("outpaint", op["provider"], op["model"], op["cost_usd"],
                               concept=concept.title)
                    src = fbg
                except Exception as e:        # noqa: BLE001 -- fall back to resizing base bg
                    log(f"    outpaint {fmt} failed ({e!s:.80}); resizing base bg")
                out = run_dir / f"ad_{i:02d}_{_slug(fmt)}.png"
                comp = compositor.compose(src, layouts[fmt], concept.ad_copy, out, kit=kit,
                                          logo_path=logo_path, concept_title=concept.title)
            manifest.ads.append(comp)
            manifest.assets.append(AssetRecord(kind="image", concept_title=concept.title,
                                               provider="composite", model="pillow",
                                               path=comp.path, cost_usd=0.0))
            led.record("composite", "pillow", "-", 0.0,
                       concept=concept.title, fmt=fmt)         # free, but logged for transparency
        log(f"  - '{concept.title}' shipped in {len(formats)} format(s)")


def _asset(res: dict) -> dict:
    return {"provider": res["provider"], "model": res["model"], "path": res["path"],
            "cost_usd": res.get("cost_usd", 0.0), "fell_back_from": res.get("fell_back_from")}
