"""Live (PAID) run driver for the Creative Studio HTTP API -- PREP, guarded.

Drives `ai_layer.api:app` IN-PROCESS (FastAPI TestClient) so every prompt sent to
fal/OpenRouter can be captured to a text file. Being in-process is the ONLY reason this
differs from a plain uvicorn deployment: a wrapped provider seam cannot be observed across
a process boundary, and prompt-capture is a hard requirement here. The app, routes,
pipeline, spend, and artifacts are otherwise identical to a real uvicorn run.

  SAFETY: this spends real money on fal (Seedance/FLUX) + OpenRouter.
  It does NOTHING paid unless you pass --confirm-spend.
  Without the flag it runs PREFLIGHT only: validates inputs + keys, reads the live fal
  balance, prints exactly what it would generate and the estimated cost, and exits at $0.

This run is configured (edit CONFIG below) for:
  - 3 clips, 720p, 9:16                        (n_shots=3, resolution=720p)
  - the full static image track first          (images=3 concepts x 3 formats)
  - Shopify product sourcing ON                (sources the store bestseller image)
  - Meta winner grounding ATTEMPTED            (token is outdated -> degrades to UNGROUNDED)
  - direction = "tall blonde woman"            (steers script AND shot prompts)
  - voiceover + burned-in captions + SFX ON
  - EVERY prompt + provider call + cost logged to  prompts_and_calls.txt
  - EVERY artifact kept under  live_runs/live_<stamp>/<job_id>/  (gitignored)

Run (cwd = apps/ai-layer):
  PREFLIGHT ($0):      ../../cos/Scripts/python.exe tools/creative_api_liverun.py
  LIVE (spends ~$4):   ../../cos/Scripts/python.exe tools/creative_api_liverun.py --confirm-spend
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

# ===========================================================================
# CONFIG
# ===========================================================================
# No Meta ad account is available, so Meta winner grounding is SKIPPED (there is nothing to
# query). Set to a real act_<id> to attempt it (with an outdated token it degrades anyway).
ACCOUNT_ID = None

# Brand/product context for the brand kit. Derived live from the connected Shopify store
# (bestseller title/description/price + shop/vendor identity) when True; else set BRIEF.
DERIVE_BRAND_FROM_SHOPIFY = True
BRIEF = None

DIRECTION = "beautiful indian woman"     # per lemon; steers script + shot prompts
N_SHOTS = 3                              # 3 clips
SECONDS = 12                             # 3 shots snap to >=4s each -> 12s
RESOLUTION = "720p"
ASPECT = "9:16"
IMAGES = 3                               # static concepts
FORMATS = ["1:1", "4:5", "9:16"]
# ===========================================================================

CONFIRM = "--confirm-spend" in sys.argv

# --- output dir (gitignored live_runs/), set BEFORE importing config -------------
_AILAYER = Path(__file__).resolve().parents[1]           # apps/ai-layer
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTDIR = _AILAYER / "live_runs" / f"live_{STAMP}"
OUTDIR.mkdir(parents=True, exist_ok=True)
os.environ["CREATIVE_OUTPUT_DIR"] = str(OUTDIR)          # config reads this at import

# --- imports (config.py load_dotenv fires here; real keys stay live) -------------
from fastapi.testclient import TestClient                # noqa: E402

from ai_layer import config as ai_config                 # noqa: E402
from ai_layer import shopify_products                     # noqa: E402
from ai_layer.creative import (                          # noqa: E402
    config as ccfg,
    fal_billing,
    image_providers,
    ledger as ledger_mod,
    pipeline,
    video_providers,
)
from ai_layer.api import app                             # noqa: E402

ccfg.OUTPUT_DIR = OUTDIR                                  # belt & suspenders
ai_config.AI_LAYER_API_KEY = None                        # open the in-process gate (local only)

PROMPTS_FILE = OUTDIR / "prompts_and_calls.txt"
REPORT_FILE = OUTDIR / "LIVE_RUN_REPORT.md"


# ===========================================================================
# Derive the brand/product brief from the connected Shopify store (read-only, free).
# ===========================================================================
def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _brand_from_domain(shop: str) -> str:
    # "pratap-sons.myshopify.com" -> "Pratap Sons"
    base = (shop or "").split(".")[0]
    return base.replace("-", " ").replace("_", " ").title() or "The Store"


def derive_brief_from_shopify() -> tuple[dict | None, str | None, str | None]:
    """(brief, top_product_title, note). Never raises: a store hiccup yields a minimal
    domain-only brief so the run can still proceed, mirroring how grounding degrades."""
    token, shop = ccfg.SHOPIFY_TOKEN, ccfg.SHOPIFY_STORE
    if not token or not shop:
        return None, None, "SHOPIFY_TOKEN/SHOPIFY_STORE not set"
    brand = _brand_from_domain(shop)
    brief: dict = {"brand_name": brand, "product_name": f"{brand} bestseller"}
    try:
        picks = shopify_products.fetch_bestsellers(
            token, shop, out_dir=OUTDIR / "_shopify_probe", top_n=3, log=lambda *_: None)
    except Exception as e:  # noqa: BLE001
        return brief, None, f"bestseller fetch failed ({e!s:.80}); domain-only brief"
    if not picks:
        return brief, None, "no bestsellers in recent orders; domain-only brief"
    top = picks[0]
    brief["product_name"] = top.title
    try:
        base = shopify_products._base(shop, ccfg.SHOPIFY_API_VERSION)
        body = shopify_products._api(
            f"{base}/products/{top.product_id}.json",
            {"fields": "id,title,body_html,tags,product_type,vendor,variants"},
            {"X-Shopify-Access-Token": token})
        p = body.get("product", {}) or {}
        if p.get("vendor"):
            brief["brand_name"] = p["vendor"]
        desc = _strip_html(p.get("body_html") or "")
        if desc:
            brief["product_description"] = desc[:300]
        tags = [t.strip() for t in (p.get("tags") or "").split(",") if t.strip()][:5]
        if tags:
            brief["key_features"] = tags
        elif p.get("product_type"):
            brief["key_features"] = [p["product_type"]]
        variants = p.get("variants") or []
        if variants and variants[0].get("price"):
            brief["price"] = str(variants[0]["price"])
    except Exception as e:  # noqa: BLE001
        return brief, top.title, f"product detail fetch failed ({e!s:.80}); title-only brief"
    return brief, top.title, None


def resolve_brief() -> tuple[dict | None, str | None]:
    """The effective brief + a human note about where it came from."""
    if DERIVE_BRAND_FROM_SHOPIFY:
        brief, top, note = derive_brief_from_shopify()
        src = f"Shopify (top: {top!r})" if top else "Shopify (domain-only)"
        if note:
            src += f" [{note}]"
        return brief, src
    return BRIEF, "static BRIEF constant"

# ===========================================================================
# Prompt + provider-call logging: WRAP the real seams (no repo edit). Each wrapper
# records the prompt/args/model/cost to prompts_and_calls.txt, then calls through to
# the real provider so generation actually happens.
# ===========================================================================
CALLS: list[dict] = []


def _now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _flush_prompt(entry: dict) -> None:
    """Append one call record immediately, so a crash still leaves a partial log."""
    with PROMPTS_FILE.open("a", encoding="utf-8") as f:
        f.write("=" * 88 + "\n")
        f.write(f"[{entry['t']}] #{entry['n']:03d}  {entry['seam']}\n")
        if entry.get("model"):
            f.write(f"  model: {entry['model']}\n")
        if entry.get("args"):
            f.write(f"  args:  {json.dumps(entry['args'], default=str)}\n")
        if entry.get("cost_usd") is not None:
            f.write(f"  cost_usd (estimate): {entry['cost_usd']}\n")
        if entry.get("note"):
            f.write(f"  note:  {entry['note']}\n")
        if entry.get("prompt"):
            f.write("  prompt:\n")
            for line in str(entry["prompt"]).splitlines() or [""]:
                f.write(f"    | {line}\n")
        f.write("\n")


def _record(seam, *, model=None, prompt=None, args=None, cost=None, note=None) -> None:
    entry = {"n": len(CALLS) + 1, "t": _now(), "seam": seam, "model": model,
             "prompt": prompt, "args": args, "cost_usd": cost, "note": note}
    CALLS.append(entry)
    _flush_prompt(entry)


_SALIENT = ("aspect", "duration", "resolution", "refs", "image", "voice", "seconds", "fmt",
            "fast", "generate_audio")


def _wrap_provider(mod, attr, seam):
    """Wrap image/video/audio seams. prompt is the first positional str (or prompt=/text=)."""
    orig = getattr(mod, attr)

    def w(*a, **kw):
        prompt = None
        if a and isinstance(a[0], str):
            prompt = a[0]
        prompt = kw.get("prompt", kw.get("text", prompt))
        args = {k: kw[k] for k in _SALIENT if k in kw}
        if len(a) > 1:
            args["out_path"] = str(a[1])
        try:
            res = orig(*a, **kw)
        except Exception as e:  # noqa: BLE001
            _record(seam, prompt=prompt, args=args, note=f"EXCEPTION: {e}")
            raise
        model = res.get("model") if isinstance(res, dict) else None
        cost = res.get("cost_usd") if isinstance(res, dict) else None
        _record(seam, model=model, prompt=prompt, args=args, cost=cost)
        return res

    setattr(mod, attr, w)


class _CompletionsProxy:
    def __init__(self, real):
        self._real = real

    def create(self, *, model, messages, **kw):
        sys_p = messages[0]["content"] if messages else ""
        usr_p = messages[1]["content"] if len(messages) > 1 else ""
        res = self._real.create(model=model, messages=messages, **kw)
        try:
            cost = ledger_mod.response_cost(res)
        except Exception:  # noqa: BLE001
            cost = None
        _record("LLM (OpenRouter chat)", model=model, cost=cost,
                prompt=f"SYSTEM:\n{sys_p}\n\nUSER:\n{usr_p}")
        return res


class _ChatProxy:
    def __init__(self, real):
        self.completions = _CompletionsProxy(real.completions)


class _ClientProxy:
    def __init__(self, real):
        self.chat = _ChatProxy(real.chat)


def _install_logging_wrappers() -> None:
    """Only called on the paid path. Captures every prompt/call to prompts_and_calls.txt."""
    _real_client = pipeline._client
    pipeline._client = lambda: _ClientProxy(_real_client())      # every LLM prompt
    _wrap_provider(image_providers, "generate_with_fallback", "image (FLUX bg/seed)")
    _wrap_provider(image_providers, "cutout", "image (BiRefNet cutout)")
    _wrap_provider(image_providers, "outpaint", "image (outpaint reframe)")
    _wrap_provider(video_providers, "generate_with_fallback", "video (Seedance clip)")
    _wrap_provider(video_providers, "generate_voiceover", "audio (MiniMax TTS voiceover)")
    _wrap_provider(video_providers, "transcribe_words", "audio (Whisper ASR)")
    _wrap_provider(video_providers, "merge_audio_onto_video", "audio (fal ffmpeg mux)")


# ===========================================================================
# Preflight (free): validate inputs + keys + balance, print the plan + estimate.
# ===========================================================================
def _needs_filling(brief: dict | None) -> list[str]:
    problems = []
    if not DERIVE_BRAND_FROM_SHOPIFY and not BRIEF:
        problems.append("BRIEF is not set and DERIVE_BRAND_FROM_SHOPIFY is False")
    if brief is None:
        problems.append("no brief could be resolved (Shopify creds missing?)")
    elif not brief.get("brand_name") or not brief.get("product_name"):
        problems.append("resolved brief has no brand_name / product_name")
    return problems


def preflight() -> dict:
    per_clip = fal_billing.SEEDANCE_CLIP_USD
    est_video = round(N_SHOTS * per_clip, 4)
    est_static = 0.30           # ~3 FLUX backgrounds; cutout $0; blur-outpaint $0
    est_total = round(est_video + est_static + 0.05, 4)   # +LLM/VO/ASR rounding
    keys = {k: bool(os.getenv(k)) for k in
            ("FAL_KEY", "FAL_ADMIN_KEY", "OPENROUTER_API_KEY", "SHOPIFY_STORE",
             "SHOPIFY_TOKEN", "META_ACCESS_TOKEN")}
    brief, brief_src = resolve_brief()          # live Shopify read (free)
    try:
        bal = fal_billing.balance()
    except Exception as e:  # noqa: BLE001
        bal = None
        print(f"  (balance read failed: {e})")
    guard = fal_billing.affordable(N_SHOTS)
    info = {"per_clip": per_clip, "est_video": est_video, "est_static": est_static,
            "est_total": est_total, "keys": keys, "balance": bal, "guard": guard,
            "brief": brief, "brief_src": brief_src}

    meta = f"ATTEMPTED ({ACCOUNT_ID}, token degrades)" if ACCOUNT_ID else "SKIPPED (no account id)"
    print("=" * 72)
    print("CREATIVE STUDIO -- LIVE RUN PREFLIGHT")
    print("=" * 72)
    print(f"  output dir      : {OUTDIR}")
    print(f"  clips / res     : {N_SHOTS} x {RESOLUTION} {ASPECT}   (seconds={SECONDS})")
    print(f"  static images   : {IMAGES} concepts x {FORMATS}")
    print(f"  shopify sourcing: ON   meta grounding: {meta}")
    print(f"  direction       : {DIRECTION!r}")
    print(f"  voiceover/caps/sfx: ON")
    print(f"  brief source    : {brief_src}")
    print(f"  derived brief   : {json.dumps(brief, ensure_ascii=False)}")
    print("  keys present    :")
    for k, v in keys.items():
        print(f"      {k:20} {'set' if v else 'MISSING'}")
    print(f"  fal balance     : {'$%.4f' % bal if bal is not None else 'unavailable'}")
    print(f"  est. cost       : ~${est_total}  (video ${est_video} + static ~${est_static})")
    print(f"  balance guard   : enabled={guard['enabled']} ok={guard['ok']} "
          f"needed=${guard['needed']} shortfall=${guard['shortfall']}")
    fills = _needs_filling(brief)
    if fills:
        print("  REQUIRED INPUTS MISSING:")
        for p in fills:
            print(f"      - {p}")
    print("=" * 72)
    return info


# ===========================================================================
# The paid run.
# ===========================================================================
def _poll(client, job_id, timeout=1800.0):
    """Defensive poll -- tolerates a None/absent body (the failure mode that crashed the
    previous live-API smoke driver)."""
    t0 = time.time()
    last = {}
    while time.time() - t0 < timeout:
        try:
            resp = client.get(f"/creative/jobs/{job_id}")
            body = resp.json() if resp is not None else None
        except Exception as e:  # noqa: BLE001
            print(f"  [poll] transient error: {e}")
            time.sleep(2.0)
            continue
        if not isinstance(body, dict):
            time.sleep(2.0)
            continue
        last = body
        stg = body.get("stage")
        print(f"  [{_now()}] {body.get('status'):8} {stg}")
        if body.get("status") in ("complete", "failed"):
            return last
        time.sleep(3.0)
    return last


def live_run(info: dict) -> int:
    _install_logging_wrappers()
    PROMPTS_FILE.write_text(
        f"# Creative Studio live run -- prompts + provider calls\n"
        f"# started {datetime.now().isoformat(timespec='seconds')}\n"
        f"# direction={DIRECTION!r} n_shots={N_SHOTS} res={RESOLUTION} aspect={ASPECT}\n\n",
        encoding="utf-8")
    client = TestClient(app)
    result = {"info": info, "started": datetime.now().isoformat(timespec="seconds")}

    print("\n--- POST /creative/generate (static + shopify product; meta grounding "
          f"{'attempted' if ACCOUNT_ID else 'skipped: no account'}) ---")
    brief = info["brief"]
    print(f"  brief ({info['brief_src']}): {json.dumps(brief, ensure_ascii=False)}")
    gen_body = {"brief": brief, "images": IMAGES, "formats": FORMATS,
                "ground": bool(ACCOUNT_ID), "use_shopify": True,
                "direction": DIRECTION,    # 1d: cast the SAME person into the static concept ads
                "with_video": False}       # full video comes from the /video/* track
    if ACCOUNT_ID:
        gen_body["account_id"] = ACCOUNT_ID
    r = client.post("/creative/generate", json=gen_body)
    r.raise_for_status()
    job_id = r.json()["job_id"]
    result["job_id"] = job_id
    print(f"  job_id = {job_id}")
    static = _poll(client, job_id)
    result["static"] = static

    print("\n--- POST /creative/video/plan (n_shots=3, direction) [$0, LLM only] ---")
    r = client.post("/creative/video/plan",
                    json={"job_id": job_id, "seconds": SECONDS, "n_shots": N_SHOTS,
                          "direction": DIRECTION})
    r.raise_for_status()
    plan = r.json()
    result["plan"] = plan
    print(f"  shots={plan.get('shots')} quote={json.dumps(plan.get('quote'))}")

    print("\n--- POST /creative/video/generate (PAID: 3 clips + VO + captions + SFX) ---")
    r = client.post("/creative/video/generate",
                    json={"job_id": job_id, "aspect": ASPECT, "resolution": RESOLUTION,
                          "voiceover": True, "captions": True, "sfx": True,
                          "direction": DIRECTION,   # 1d: cast; 4b hero_with_creator OFF (fal rejects a person-in-seed -> t2v)
                          "guard_balance": True})
    if r.status_code == 402:
        print(f"  402 balance guard: {json.dumps(r.json().get('detail'))}")
        result["video"] = {"status": "refused_402", "detail": r.json().get("detail")}
    else:
        r.raise_for_status()
        print(f"  ack: {json.dumps(r.json())}")
        video = _poll(client, job_id)
        result["video"] = video

    _write_report(result)
    print(f"\nreport:  {REPORT_FILE}")
    print(f"prompts: {PROMPTS_FILE}")
    print(f"artifacts: {OUTDIR / job_id}")
    ok = (result.get("video", {}).get("status") == "complete")
    return 0 if ok else 1


def _tree(run_dir: Path) -> dict:
    groups = {"images": [], "video": [], "audio": [], "json/text": [], "other": []}
    ext_map = {".png": "images", ".jpg": "images", ".jpeg": "images", ".webp": "images",
               ".mp4": "video", ".mov": "video", ".webm": "video",
               ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".aac": "audio",
               ".json": "json/text", ".jsonl": "json/text", ".txt": "json/text"}
    if run_dir.exists():
        for p in sorted(run_dir.rglob("*")):
            if p.is_file():
                groups[ext_map.get(p.suffix.lower(), "other")].append(
                    (p.relative_to(run_dir).as_posix(), p.stat().st_size))
    return groups


def _write_report(result: dict) -> None:
    job_id = result.get("job_id", "")
    run_dir = OUTDIR / job_id
    groups = _tree(run_dir)
    static = result.get("static") or {}
    plan = result.get("plan") or {}
    video = result.get("video") or {}
    L = ["# Creative Studio -- LIVE run report", "",
         f"- started: {result.get('started')}",
         f"- job_id: `{job_id}`",
         f"- output: `{run_dir}`",
         f"- prompts log: `{PROMPTS_FILE.name}` ({len(CALLS)} provider/LLM calls captured)",
         f"- direction: {DIRECTION!r}", ""]
    L += ["## Static job", "```json",
          json.dumps({"status": static.get("status"), "n_assets": len(static.get("assets") or []),
                      "brand_kit": (static.get("brand_kit") or {}).get("brand_name"),
                      "cost_usd": static.get("cost_usd"), "pickings": static.get("pickings"),
                      "error": static.get("error")}, indent=2), "```", ""]
    L += ["## Video plan quote", "```json", json.dumps(plan.get("quote"), indent=2), "```", ""]
    L += ["## Video job", "```json",
          json.dumps({"status": video.get("status"), "video": video.get("video"),
                      "qa": video.get("qa"), "cost_usd": video.get("cost_usd"),
                      "actuals": video.get("actuals"), "error": video.get("error")},
                     indent=2), "```", ""]
    L += ["## Artifacts produced"]
    for cat in ("images", "video", "audio", "json/text", "other"):
        items = groups.get(cat) or []
        if not items:
            continue
        L.append(f"### {cat} -- {len(items)} file(s)")
        L.append("```")
        L += [f"{size:>10,}  {rel}" for rel, size in items]
        L.append("```")
    REPORT_FILE.write_text("\n".join(L), encoding="utf-8")


def main() -> int:
    info = preflight()
    fills = _needs_filling(info.get("brief"))
    if not CONFIRM:
        print("\nPREFLIGHT ONLY -- no money spent. To execute the live run:")
        print("  ../../cos/Scripts/python.exe tools/creative_api_liverun.py --confirm-spend")
        if fills:
            print("Resolve the REQUIRED INPUTS above first.")
        return 0
    if fills:
        print("\nREFUSING to spend: required inputs could not be resolved:")
        for p in fills:
            print(f"  - {p}")
        return 2
    if not info["keys"]["FAL_KEY"] or not info["keys"]["OPENROUTER_API_KEY"]:
        print("\nREFUSING to spend: FAL_KEY or OPENROUTER_API_KEY missing from the env.")
        return 2
    if info["guard"]["enabled"] and not info["guard"]["ok"]:
        print(f"\nREFUSING to spend: fal balance short by ${info['guard']['shortfall']}.")
        return 2
    print("\n--confirm-spend given and preflight clean. Starting the LIVE (paid) run...\n")
    try:
        return live_run(info)
    except Exception as e:  # noqa: BLE001
        print(f"\nLIVE RUN CRASHED: {e}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
