"""Sequenced render (T7): a Storyboard becomes a timeline.

This is the last seam. Everything downstream was built against a `render(shot, index,
attempt, hint) -> path` callable that did not exist yet. This module supplies it, and the
recovery ladder (T9.5), the temporal QA gate (T9), the deterministic editor (T7.5) and
the storyboard (T6) all light up behind it.

Per shot:

    prompt -> Seedance -> trim -> editor.apply_plan -> verify_shot -> (repair)

then `editor.concat` over the accepted clips.

THE PACING/BILLING CONFLICT, which is the interesting part of T7.

Short-form pacing wants shots of one to four seconds. Seedance accepts a DISCRETE set of
durations, {4, 5, 6, 8, 10, 12, 15}, and will not produce a clip shorter than four. So a
two-second shot is generated at four seconds, BILLED at four seconds, and trimmed to two.
Cutting every two seconds costs double.

We do not bend the storyboard to fit the renderer. Pacing is a creative decision; billing
is not. `snap_duration` rounds up to the nearest value the API accepts, `editor.trim` cuts
it back to the plan, and the ledger records both numbers so the waste is visible rather
than absorbed. That is also the real argument for UGC-D1: a single-pass 30-second model is
not merely more convenient, it is cheaper per second of finished ad at this floor.

CONTINUITY. In `sequential` mode shot N+1 is conditioned on shot N's final frame, which
reaches Seedance's `reference-to-video` endpoint. That branch has existed in
video_providers since the beginning and has never been called by anything.

`providers` is a module-level seam, so the whole sequencer runs offline at $0 in tests.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import editor  # noqa: E402
import prompt_builder  # noqa: E402
import recovery  # noqa: E402
import verifier_video  # noqa: E402
import video_providers as providers  # noqa: E402
from schemas import BrandKit, RepairLog, Script, Shot, Storyboard, UGCStyle  # noqa: E402


class SequenceError(RuntimeError):
    """The storyboard cannot be rendered as asked."""


def snap_duration(seconds: float) -> int:
    """The smallest duration the renderer accepts that is at least `seconds`.

    Not a rounding convenience: 7, 9, 11, 13 and 14 are rejected outright by the API, so
    `int(round(3.4))` would be a runtime error and `max(4, ...)` alone is not enough.
    """
    allowed = config.VIDEO_ALLOWED_DURATIONS
    for d in allowed:
        if d >= seconds - 1e-9:
            return d
    raise SequenceError(
        f"{seconds:g}s exceeds the renderer's longest clip ({allowed[-1]}s). "
        f"Split the shot, or raise config.VIDEO_MAX_CLIP_SECONDS if the model changed.")


def _gen_key(prompt: str, refs, want: int, resolution: str, aspect: str, attempt: int,
             seed=None) -> str:
    """A short hash of everything that determines the Seedance output. Same inputs -> same
    key -> reuse the cached render.

    `attempt` is IN the key on purpose. A retry (rung 0) re-rolls the SAME prompt to exploit
    the model's stochasticity, so it must NOT reuse the previous attempt's render -- a
    different attempt gives a different key and renders fresh. Across separate RUNS this
    still gives full reuse: a clean shot renders at attempt 0 both times (same key), and a
    repaired shot replays its exact ladder at $0 because every attempt's render is cached.

    `refs` are reduced to basenames so a re-run's deterministic ref paths hash stably.
    """
    ref_key = [Path(r).name for r in (refs or [])]
    seed_key = Path(seed).name if seed else ""
    payload = f"{prompt}\n{ref_key}\n{seed_key}\n{want}\n{resolution}\n{aspect}\n{attempt}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def _product_seed(shot, index: int, cutout_path, run_dir, *, kit, aspect, led, log,
                  product_desc=None) -> str:
    """A person-FREE product-only still to i2v-seed a hero shot (the product-in-video fix).

    Independent-mode t2v never puts the product on screen, and sequential ref2v is rejected
    by fal's content filter because the continuity reference contains the creator (a person).
    This sidesteps both: a still that shows ONLY the product seeds the Seedance i2v -- so the
    product actually appears in the video AND can be verified, with no person in any reference.

    Isolates the PRODUCT, not the source photo. For apparel the Shopify/featured image (and
    therefore the BiRefNet cutout) is a MODEL wearing the item, and Bria product-shot would
    relocate the whole model into the scene -- the "it picked the girl too" failure. Instead
    FLUX flex regenerates the item on its own, conditioned on the cutout for colour/pattern
    fidelity, with the person hard-excluded via prompt AND negative. `product_desc` (the
    Shopify title, when known) anchors what the item actually is.

    Cached by (scene, cutout, aspect): a re-run does not re-pay for the seed.
    """
    import image_providers                     # lazy: keeps fal_client out of the import path
    seeds = Path(run_dir) / "product_seeds"
    seeds.mkdir(parents=True, exist_ok=True)
    item = (product_desc or "the item shown in the reference").strip()
    scene = (f"Studio e-commerce product photograph of {item}, presented ON ITS OWN as a "
             f"flat-lay or on a plain ghost mannequin against a clean neutral backdrop, "
             f"centred, sharp, evenly lit. The item is the ONLY subject. {kit.visual_style}.")
    negative = "person, people, model, human, face, head, hands, arms, legs, body, skin, text"
    key = hashlib.sha1(
        f"{scene}\n{negative}\n{Path(cutout_path).name}\n{aspect}".encode()).hexdigest()[:12]
    out = seeds / f"seed_{index:02d}_{key}.png"     # KEPT: paid product still, shown in output
    if not out.exists():
        res = image_providers.generate_with_fallback(
            scene, out, primary="flux", refs=[str(cutout_path)], negative=negative,
            aspect=aspect, log=log)
        if led is not None:
            led.record("product_seed", res["provider"], res["model"], res["cost_usd"],
                       shot=index)
        log(f"[seq] shot {index} product seed ({item!r:.60}) from "
            f"{Path(cutout_path).name} (est ${res['cost_usd']:.2f})")
    return str(out)


def _persona_seed(creator, run_dir, *, kit: BrandKit, aspect, led=None, log=print) -> str:
    """One still of the creator, generated ONCE and reused to i2v-seed every shot they are
    in. The attempt at the hard half of a persona.

    Prompt text alone does not hold a face across five independent renders -- each render is
    a fresh sample and the model has no memory of the last one. Seeding every shot from the
    SAME still is the only lever Seedance offers, because its reference-to-video path is the
    one that REJECTS a reference containing a person (fal's content filter -- the same wall
    `_product_seed` exists to get around). i2v takes a single `image`, not a ref list, so a
    persona seed and a product seed cannot both condition one shot; hero shots keep the
    product, everyone else gets the face.

    THIS IS AN EXPERIMENT, not a guarantee, and it is off by default (`pin_face`): fal may
    reject a person as an i2v seed exactly as it rejects one as a ref2v reference. We have
    not been able to find out, because the account balance is empty. If it does reject,
    `generate_with_fallback` degrades silently to t2v and every shot gets a different face,
    so `render_shot` shouts about a dropped seed rather than reporting success.

    Cached by (persona, face_ref, aspect): a re-run does not re-pay for the seed, and the
    filename is content-addressed so `_gen_key` stays stable across runs.
    """
    import image_providers                     # lazy: keeps fal_client out of the import path
    seeds = Path(run_dir) / "persona_seeds"
    seeds.mkdir(parents=True, exist_ok=True)

    who = creator.to_visual_prompt()
    face_ref = creator.face_ref if creator.face_ref and Path(creator.face_ref).exists() else None
    scene = (f"Candid phone photograph of one person. {who} "
             f"Head and shoulders, looking into the lens, relaxed natural expression, "
             f"ordinary lived-in surroundings, natural light. Exactly ONE person in frame.")
    # No person-negative here, obviously. We still suppress text: a seed with letters in it
    # propagates them into every shot, and the captions are burned on later, by us.
    negative = "text, words, letters, watermark, logo, caption, subtitle, multiple people, crowd"
    key = hashlib.sha1(
        f"{scene}\n{negative}\n{Path(face_ref).name if face_ref else ''}\n{aspect}".encode()
    ).hexdigest()[:12]
    out = seeds / f"persona_{key}.png"              # KEPT: paid persona still, reused every run
    if not out.exists():
        res = image_providers.generate_with_fallback(
            scene, out, primary="flux", refs=[face_ref] if face_ref else None,
            negative=negative, aspect=aspect, log=log)
        if led is not None:
            led.record("persona_seed", res["provider"], res["model"], res["cost_usd"],
                       creator=creator.name)
        log(f"[seq] persona seed for {creator.name!r} "
            f"{'from ' + Path(face_ref).name if face_ref else '(generated)'} "
            f"(est ${res['cost_usd']:.2f})")
    return str(out)


def _playable(path) -> bool:
    try:
        return editor.probe(path)["duration"] > 0
    except Exception:  # noqa: BLE001 -- a truncated/corrupt cache entry is not a hit
        return False


def billed_seconds(board: Storyboard) -> tuple[float, float]:
    """(seconds we pay for, seconds of finished ad). The gap is the four-second floor."""
    return float(sum(snap_duration(s.duration_s) for s in board.shots)), board.duration_s


def render_shot(shot: Shot, index: int, attempt: int, hint: str | None, *,
                kit: BrandKit, run_dir, style: UGCStyle | None = None,
                aspect: str = "9:16", resolution: str = "720p",
                refs: list | None = None, seed=None, creator=None, direction=None,
                led=None, log=print) -> str:
    """Generate one shot, trim it to plan, and apply its edit. Returns the edited clip.

    Native audio is off. The concat drops audio anyway (one voiceover runs across the
    whole timeline, muxed once at the end), and Seedance rejects a clip outright when its
    auto-generated audio trips a content filter, which is a strange way to lose a shot you
    did not want the audio from.
    """
    run_dir = Path(run_dir)
    work = run_dir / ".work"
    renders = run_dir / "renders"
    for d in (run_dir, work, renders):
        d.mkdir(parents=True, exist_ok=True)   # render_shot is public; don't assume a caller made these

    prompt = prompt_builder.build_shot_prompt(shot, kit, style=style, hint=hint,
                                              creator=creator, direction=direction)
    want = snap_duration(shot.duration_s)

    # Content-addressed render cache (Phase 9.3): the Seedance output is fully determined
    # by the prompt, the references, and the clip params. Key on those and reuse the raw
    # render if it already exists -- a plain re-run of the same storyboard costs $0 in
    # video instead of re-paying. A repair (different hint) or a spec change yields a
    # different key and re-renders, as it should.
    key = _gen_key(prompt, refs, want, resolution, aspect, attempt, seed)
    raw = renders / f"gen_{key}.mp4"          # KEPT: this is the paid artifact + reuse cache

    if raw.exists() and _playable(raw):
        log(f"[seq] shot {index} ({shot.purpose}) REUSED cached render {key} ($0)")
    else:
        res = providers.generate_with_fallback(
            prompt, raw, image=seed, refs=refs, aspect=aspect, duration=want,
            resolution=resolution, generate_audio=False, log=log)
        if led is not None:
            led.record("shot_video", res["provider"], res["model"], res["cost_usd"],
                       shot=index, attempt=attempt, billed_s=want, used_s=shot.duration_s,
                       cache_key=key, dropped_conditioning=bool(res.get("fell_back_from")),
                       mode=("ref2v" if refs else "i2v" if seed else "t2v"))
        # The fallback ladder's last rung is t2v: it DROPS the seed and the references. That
        # is the right call for a content-filter rejection (a shot is better than no shot),
        # but it is silent, and when the thing dropped was the persona seed it means this
        # shot has a different face from every other one. Say so. A run that quietly ships
        # five strangers is the exact failure this feature exists to prevent.
        if res.get("fell_back_from") and (seed or refs):
            what = "persona/product seed" if seed else "continuity/product references"
            log(f"[seq] WARNING shot {index}: conditioning was DROPPED ({what} -> "
                f"{res['fell_back_from']}). This shot is unconditioned; if a creator was "
                f"being pinned, its face will not match the others.")
        log(f"[seq] shot {index} ({shot.purpose}) rendered {want}s, keeping "
            f"{shot.duration_s:g}s (est ${res['cost_usd']:.2f}, cache {key})")

    # Trim + edit are $0 ffmpeg. They rerun freely off the cached raw and land in the
    # scratch dir (Phase 9.4): only the paid raw and the final timeline survive a run.
    trimmed = work / f"shot_{index:02d}_a{attempt}_cut.mp4"
    editor.trim(str(raw), trimmed, duration=shot.duration_s, log=lambda *_: None)

    edited = work / f"shot_{index:02d}_a{attempt}.mp4"
    editor.apply_plan(trimmed, edited, editor.plan_for_shot(shot, style),
                      log=lambda *_: None)
    return str(edited)


def render_storyboard(board: Storyboard, *, kit: BrandKit, run_dir,
                      script: Script | None = None, style: UGCStyle | None = None,
                      cutout_path=None, product_desc=None, aspect: str = "9:16",
                      resolution: str = "720p", creator=None, pin_face: bool = False,
                      direction=None, replan=None, strict: bool = True, led=None, log=print
                      ) -> tuple[str, Storyboard, RepairLog]:
    """Render every shot with repair, then concatenate. Returns (timeline, board, log).

    In `sequential` mode each shot is conditioned on its predecessor's final frame via
    reference-to-video. `accepted` is pruned at every render, because a repair invalidates
    the shot being repaired and, in sequential mode, everything after it.

    `creator` names who is on camera and always reaches the PROMPT. `pin_face` additionally
    i2v-seeds every non-hero shot from one generated still of that person, which is the only
    mechanism Seedance gives us for holding a face. It is off by default because it may trip
    the same content filter that rejects a person in a ref2v reference; see `_persona_seed`.
    """
    run_dir = Path(run_dir)
    (run_dir / ".work").mkdir(parents=True, exist_ok=True)
    accepted: dict[int, str] = {}

    # Generated once, reused by every shot the creator appears in (and across runs: the
    # filename is content-addressed, so the render cache keys stay stable).
    face_seed = None
    if pin_face and creator is not None:
        face_seed = _persona_seed(creator, run_dir, kit=kit, aspect=aspect, led=led, log=log)

    billed, used = billed_seconds(board)
    if billed > used:
        log(f"[seq] {len(board.shots)} shot(s): billing {billed:g}s of video for "
            f"{used:g}s of ad ({billed / used:.2f}x). The renderer's floor is "
            f"{config.VIDEO_MIN_CLIP_SECONDS}s.")

    def _render(shot, index, attempt, hint):
        # Nothing at or after this index is accepted any more.
        for k in [k for k in accepted if k >= index]:
            accepted.pop(k)

        # Seedance takes EITHER one i2v `image` OR a ref2v `refs` list, never both, so these
        # branches are a priority order, not a menu:
        #   1. a hero product shot is a shot OF THE PRODUCT -> the product seed wins.
        #   2. otherwise, if we are pinning a face, the persona seed holds the creator.
        #   3. otherwise, sequential continuity conditions on the previous frame.
        refs, seed = None, None
        has_cutout = cutout_path and Path(cutout_path).exists()
        if shot.product_visible == "hero" and has_cutout:
            # i2v-seed the product into the shot (people-free reference; no ref2v rejection).
            seed = _product_seed(shot, index, cutout_path, run_dir, kit=kit, aspect=aspect,
                                 led=led, log=log, product_desc=product_desc)
        elif face_seed is not None:
            seed = face_seed          # the same person, every shot they are in
        elif board.render_mode == "sequential" and index > 0 and (index - 1) in accepted:
            frame = editor.last_frame(accepted[index - 1],
                                      run_dir / ".work" / f"shot_{index - 1:02d}_last.png")
            refs = [frame]
            if has_cutout:
                refs.append(str(cutout_path))

        return render_shot(shot, index, attempt, hint, kit=kit, run_dir=run_dir,
                           style=style, aspect=aspect, resolution=resolution,
                           refs=refs, seed=seed, creator=creator, direction=direction,
                           led=led, log=log)

    def _verify(path, shot, index):
        checks = verifier_video.verify_shot(path, shot, index, cutout_path=cutout_path)
        if all(c.passed for c in checks):
            accepted[index] = path
        return checks

    clips, board, rlog = recovery.render_board(
        board, render=_render, verify=_verify, script=script, replan=replan,
        strict=strict, log=log)

    timeline = editor.concat(clips, run_dir / "timeline.mp4", log=log)
    return timeline, board, rlog


def render_single_pass(board: Storyboard, *, kit: BrandKit, run_dir,
                       style: UGCStyle | None = None, aspect: str = "9:16",
                       resolution: str = "720p", seed=None, creator=None,
                       direction=None, led=None, log=print) -> str:
    """Render the whole ad as ONE clip (UGC-D1, v2b). The seam for a 30s-native model.

    Loses per-shot control: no repair, no per-shot edit, no continuity references. Worth it
    only when the model can hold a multi-shot structure by itself, which Seedance 2.0
    cannot and Seedance 2.5 claims to. Raises rather than silently truncating the ad.

    Note the irony: identity consistency is FREE here. One model call means one face and one
    room for the whole ad, with no seed, no reference and no content filter to argue with.
    Everything `pin_face` is fighting for, this path gets by construction -- and pays for by
    giving up repair, per-shot editing and the temporal QA gate's per-shot checks.
    """
    if board.duration_s > config.VIDEO_MAX_CLIP_SECONDS:
        raise SequenceError(
            f"a {board.duration_s:g}s board cannot be rendered in one pass; the renderer "
            f"caps at {config.VIDEO_MAX_CLIP_SECONDS}s. Use render_storyboard, or raise "
            f"the cap when the model does (OQ2).")

    beats = " Then ".join(f"{s.subject}" for s in board.shots)
    merged = board.shots[0].model_copy(update={
        "subject": beats, "duration_s": board.duration_s,
        "motion": "; ".join(s.motion for s in board.shots if s.motion)})
    prompt = prompt_builder.build_shot_prompt(merged, kit, style=style, creator=creator,
                                              direction=direction)
    want = snap_duration(board.duration_s)

    run_dir = Path(run_dir)
    (run_dir / "renders").mkdir(parents=True, exist_ok=True)
    raw = run_dir / "renders" / "single_raw.mp4"      # KEPT: the paid render
    res = providers.generate_with_fallback(prompt, raw, image=seed, aspect=aspect,
                                           duration=want, resolution=resolution,
                                           generate_audio=False, log=log)
    if led is not None:
        led.record("single_pass_video", res["provider"], res["model"], res["cost_usd"],
                   billed_s=want, used_s=board.duration_s)

    out = run_dir / "timeline.mp4"
    editor.trim(res["path"], out, duration=board.duration_s, log=log)
    return str(out)
