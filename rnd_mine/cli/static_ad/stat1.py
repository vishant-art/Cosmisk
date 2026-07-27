"""Standalone static-ad generator.

One self-contained file: no imports from creative_studio. Reads keys from the
repo root .env, asks for every variable field interactively, prints each
intermediate result, and writes all artifacts to runs/<timestamp>/ next to
this file. Disk only -- no database of any kind.

Pipeline (the static-ad slice of Creative Studio v2):

    inputs -> [LLM] creative spec -> [LLM] character persona -> [LLM] product shot plan
           -> [FLUX.2] reference portrait
           -> [FLUX.2] scene keyframe with a generic placeholder garment (portrait as reference)
           -> [BiRefNet] transparent cutout of the real product photo
           -> [BRIA product-shot] real product placed into the scene  ==> static ad

Every prompt used along the way is defined inline below, editable.

Usage:  ../../.venv/Scripts/python static_ad.py   (from this folder; any cwd works)

Ground-truth notes baked in from the pipeline build:
- FLUX gets the RAW prompt only. NEGATIVE_TERMS is documented reference; folding
  negative phrasing into a FLUX prompt NAMES the unwanted tokens and can prime
  the model to draw them, so it is deliberately never sent.
- BRIA product-shot: image_url = the PRODUCT cutout, ref_image_url = the SCENE.
  placement_type "manual_placement" -- "automatic" costs ~10x (one call per 10
  candidate positions).
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Models and prices (verified against the working pipeline, July 2026)
# ---------------------------------------------------------------------------

PLANNER_MODEL = "openai/gpt-5.4-mini"          # via OpenRouter (sub-cent per run)
IMAGE_MODEL = "fal-ai/flux-2-flex"             # portrait + keyframe
SWAP_MODEL = "google/gemini-3-pro-image"       # Nano Banana 2 Pro via OpenRouter -- PRIMARY garment swap
#SWAP_MODEL = "google/gemini-3.1-flash-image"  # flash tier -- cheaper/faster, swap back if pro isn't worth it
CUTOUT_MODEL = "fal-ai/birefnet/v2"            # product background removal  (fallback path)
PLACEMENT_MODEL = "fal-ai/bria/product-shot"   # real product into scene     (fallback path)
UPSCALE_MODEL = "clarityai/crystal-upscaler"   # final upscale, face-optimised ($0.016/MP)

# Highest-quality resolution knobs. FLUX.2 flex accepts 512-2048 px/side, <=4 MP;
# 1152x2048 is the largest true 9:16 frame. The final ad is then upscaled toward 4K.
KEYFRAME_SIZE = {"width": 1152, "height": 2048}
UPSCALE_TARGET_LONG_EDGE = 3840                # ~4K on the long edge

EST_COST_LINES = [
    "  reference portrait (FLUX.2)          ~ $0.05",
    "  scene keyframe (FLUX.2, 1152x2048)   ~ $0.06",
    "  garment swap (Nano Banana 2 Pro)     ~ $0.10-0.15  [OpenRouter, not fal]",
    "    fallback if it fails: BiRefNet+BRIA ~ $0.06  [fal]",
    "  final upscale to ~4K (Crystal)       ~ $0.10-0.15  [fal, $0.016/MP]",
    "  text: scene analysis (Gemini vision) ~ $0.01-0.02  [OpenRouter]",
    "  LLM planning + ad copy (GPT-5.4-mini) < $0.02",
    "  total                                ~ $0.35-0.60",
]

# ---------------------------------------------------------------------------
# PROMPTS -- everything the pipeline uses up to the static ad, inlined.
# Placeholders use <<name>>; render() substitutes them in a single pass.
# ---------------------------------------------------------------------------

CREATIVE_SYSTEM = """\
You are a senior performance-marketing creative strategist for e-commerce brands.
You must return ONLY a JSON object -- no prose, no markdown fences. Use camelCase keys.
Return exactly these top-level keys:

{
  "marketingObjective": {"objective": "string", "primaryGoal": "string"},
  "audience": {"persona": "string", "ageRange": "string", "painPoints": ["string"], "motivations": ["string"]},
  "messaging": {"coreMessage": "string", "hook": "string", "supportingPoints": ["string"], "cta": "string"},
  "creativeDirection": {"style": "string", "visualMood": "string", "lighting": "string", "cameraStyle": "string", "editingStyle": "string", "pacing": "string"},
  "constraints": {"productMustAppear": true, "showBrandLogo": false, "avoidTextHeavyFrames": true}
}

Ground every choice in the provided brand and product context. Never invent product
facts. constraints values are fixed as shown; do not change them.
"""

CREATIVE_TEMPLATE = """\
## BRAND
<<brand>>

## PRODUCT
<<product>>

## USER CREATIVE PREFERENCE (verbatim)
<<preference>>

## HISTORICAL AD PERFORMANCE
<<meta>>

Produce the creative specification JSON for a single STATIC advertisement image
of this product for social media (9:16 portrait format).
"""

CHARACTER_SYSTEM = """\
You are a casting director defining ONE reusable advertising persona.
Return ONLY a JSON object, camelCase keys, exactly these top-level keys:

{
  "identity": {"gender": "string", "approximateAge": 27, "ethnicity": "string", "role": "string"},
  "appearance": {"hair": {"color": "string", "length": "string", "style": "string"}, "eyes": {"color": "string"}, "skinTone": "string", "bodyType": "string", "facialFeatures": ["string"]},
  "wardrobe": {"style": "string", "accessories": ["string"], "avoid": ["string"]},
  "personality": {"traits": ["string"], "energy": "string", "overallPresence": "string"},
  "expressions": {"default": "string", "allowed": ["string"]}
}

HARD RULE: wardrobe must NOT mention or describe the advertised product or its
category -- the product garment is inserted separately by a different system.
Keep the persona consistent with the target audience demographics.
"""

CHARACTER_TEMPLATE = """\
## CREATIVE SPEC
<<creative_spec>>

## BRAND SUMMARY
<<brand>>

Define the advertising persona JSON. Remember the HARD RULE: wardrobe must not
reference the advertised product or its category (<<category>>).
"""

SHOT_SYSTEM = """\
You are a UGC advertising art director planning ONE static product shot.
Return ONLY a JSON object, camelCase keys, exactly these top-level keys:

{
  "narrative": {"summary": "string -- one sentence, what is happening in the frame", "viewerEmotion": "string"},
  "camera": {"shotType": "Medium Close-Up or Medium -- NEVER Wide or Full body", "angle": "string, e.g. Eye Level", "lens": "portrait lens, e.g. 85mm"},
  "character": {"expression": "string", "pose": "string", "action": "string -- what the person is doing"},
  "composition": {"subjectPosition": "string, e.g. Center", "background": "string -- keep it simple, the person is the focus"}
}

This is the PRODUCT shot: the garment is the hero of the frame, worn by the
character. FRAMING RULES (critical): the subject must DOMINATE the frame and fill
most of it, shown from roughly the waist up so the garment reads large and clear.
Use shotType "Medium Close-Up" or "Medium" only -- never "Wide", "Full body", or
"Long shot", which shrink the person in this tall 9:16 format. Prefer a portrait
lens (85mm). Keep the background simple so it does not compete with the subject.
The summary must end with a period.
"""

SHOT_TEMPLATE = """\
## CREATIVE SPEC
<<creative_spec>>

## CHARACTER
<<character>>

Plan the single static product shot JSON for this ad.
"""

# Deterministic builder vocabulary (mirrors the pipeline's golden-tested builders)

QUALITY_TOKENS = "ultra realistic, high detail, professional photography, cinematic, sharp focus"

# Framing backstop -- always sent, independent of what the LLM shot plan returns.
# Counteracts small-subject results in the tall 9:16 frame by forcing the person
# to dominate. Edit here to make the model larger/smaller in the final ad.
FRAMING_DIRECTIVE = (
    "the subject dominates and fills most of the frame, shown from the waist up, "
    "product large and prominent, tight flattering crop, minimal uncluttered background"
)

# Reference only -- deliberately NEVER sent to FLUX (see module docstring).
NEGATIVE_TERMS = (
    "low quality, blurry, extra fingers, extra arms, deformed anatomy, poor lighting, "
    "cropped face, duplicate body, watermark, text, logo, artifacts, incorrect clothing folds"
)

PORTRAIT_CLOSING = (
    "photographed against a neutral studio background with soft diffused lighting, "
    "natural expression, photorealistic"
)


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------

def say(msg: str = "") -> None:
    print(msg, flush=True)


def hr() -> None:
    say("-" * 72)


def render(template: str, **vars) -> str:
    """Single-pass <<name>> substitution (values are inert text)."""
    pattern = re.compile(r"<<([a-zA-Z_][a-zA-Z0-9_]*)>>")
    missing = [m for m in pattern.findall(template) if m not in vars]
    if missing:
        raise ValueError(f"missing template vars: {missing}")
    return pattern.sub(lambda m: str(vars[m.group(1)]), template)


def find_root_env(start: Path) -> Path:
    for parent in [start, *start.parents]:
        candidate = parent / ".env"
        if candidate.is_file() and (parent / "rnd_mine").is_dir():
            return candidate
    raise SystemExit("could not locate the repo root .env (looked upward from this file)")


def load_env(path: Path) -> dict[str, str]:
    """Minimal .env parser: KEY=VALUE lines, later assignments win, values stripped."""
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def ask(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        raw = input(f"{label}{suffix}: ").strip()
    except EOFError:
        raise SystemExit("aborted: no more input (EOF)")
    return raw or default


def ask_required(label: str, default: str = "") -> str:
    while True:
        value = ask(label, default)
        if value:
            return value
        say("  (required)")


def save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def download(url: str, dest: Path) -> Path:
    with httpx.Client(follow_redirects=True, timeout=120) as client:
        resp = client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


# ---------------------------------------------------------------------------
# OpenRouter planning
# ---------------------------------------------------------------------------

def plan_json(env: dict, system: str, user: str, stage: str) -> dict:
    """One planning call; retries once with the parse error appended."""
    url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1") + "/chat/completions"
    headers = {"Authorization": f"Bearer {env['OPENROUTER_API_KEY']}"}
    prompt_user = user
    last_err = ""
    for attempt in (1, 2):
        body = {
            "model": PLANNER_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt_user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.4,
        }
        with httpx.Client(timeout=120) as client:
            resp = client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            raise SystemExit(f"{stage}: OpenRouter returned {resp.status_code}: {resp.text[:200]}")
        content = resp.json()["choices"][0]["message"]["content"]
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            last_err = str(exc)
            prompt_user = (
                user
                + f"\n\nYour previous reply was not valid JSON ({exc}). Return ONLY corrected JSON."
            )
    raise SystemExit(f"{stage}: model did not return valid JSON after 2 attempts ({last_err})")


VIBE_SYSTEM = (
    "You infer a brand's positioning and creative vibe. Return ONLY a JSON object "
    '{"vibe": "one concise sentence -- positioning + tone + aesthetic"}. '
    "Base it on the brand name and the product; do not invent facts you cannot "
    "reasonably infer."
)


def infer_brand_vibe(env: dict, brand_name: str, product_context: str) -> str:
    """One sub-cent LLM call to draft the brand positioning/vibe (user overridable)."""
    user = f"Brand: {brand_name}\nProduct: {product_context}\n\nInfer the brand vibe."
    try:
        result = plan_json(env, VIBE_SYSTEM, user, "brand vibe")
        return str(result.get("vibe", "")).strip()
    except SystemExit:
        return ""  # never block the run on the optional vibe suggestion


# ---------------------------------------------------------------------------
# Garment swap -- PRIMARY renderer (Nano Banana 2 / Gemini 3.1 Flash Image via
# OpenRouter). One instruction-driven edit: keep the person + scene, swap only
# the outfit for the real product. This is what avoids the "second model" that
# BRIA product-shot introduces. BiRefNet+BRIA remain as a fallback in main().
# ---------------------------------------------------------------------------

SWAP_INSTRUCTION = (
    "Edit the FIRST image. The person is wearing a plain placeholder outfit. "
    "Replace ONLY their outfit with the exact garment shown in the SECOND image -- "
    "match its colour, pattern, embroidery, and cut precisely. Keep the SAME single "
    "person (face, hair, skin, body, hands, pose), the SAME background and framing. "
    "Do not add any extra people. "
    "Make the person look as human and photorealistic as possible: preserve real skin "
    "texture, pores, and film grain; do not smooth, retouch, or beautify. "
    "Light the scene with bright, clean, neutral-white lighting -- keep the whole image "
    "light and airy with true whites and no warm or orange colour cast; push the exposure "
    "slightly brighter and strongly minimise any glow, bloom, or haze. "
    "Output one photorealistic image at the same aspect ratio."
)
# Previous version (texture-only, matched original lighting) -- swap back to revert:
# SWAP_INSTRUCTION = (
#     "Edit the FIRST image. The person is wearing a plain placeholder outfit. "
#     "Replace ONLY their outfit with the exact garment shown in the SECOND image -- "
#     "match its colour, pattern, embroidery, and cut precisely. Keep the SAME single "
#     "person (face, hair, skin, body, hands, pose), the SAME background, lighting, and "
#     "framing. Do not add any extra people. "
#     "Preserve the original photographic skin texture, pores, and film grain; do not "
#     "smooth, retouch, or beautify; match the exact original lighting. "
#     "Output one photorealistic image at the same aspect ratio."
# )


def _data_uri(path: Path) -> str:
    import base64
    mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def nano_banana_swap(env: dict, person_path: Path, product_path: Path, out_path: Path) -> Path:
    """Swap the placeholder outfit for the real product via Nano Banana 2 (OpenRouter).
    Raises on any failure so main() can fall back to BiRefNet+BRIA."""
    import base64

    url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1") + "/chat/completions"
    body = {
        "model": SWAP_MODEL,
        "modalities": ["image", "text"],
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": SWAP_INSTRUCTION},
            {"type": "image_url", "image_url": {"url": _data_uri(person_path)}},
            {"type": "image_url", "image_url": {"url": _data_uri(product_path)}},
        ]}],
    }
    with httpx.Client(timeout=300) as client:
        resp = client.post(url, headers={"Authorization": f"Bearer {env['OPENROUTER_API_KEY']}"}, json=body)
    if resp.status_code != 200:
        raise RuntimeError(f"nano-banana swap HTTP {resp.status_code}: {resp.text[:200]}")
    images = (resp.json()["choices"][0]["message"].get("images") or [])
    if not images:
        raise RuntimeError("nano-banana swap returned no image")
    data_url = images[0].get("image_url", {}).get("url", "")
    if data_url.startswith("data:"):
        out_path.write_bytes(base64.b64decode(data_url.split(",", 1)[1]))
    elif data_url:
        download(data_url, out_path)
    else:
        raise RuntimeError("nano-banana swap image had no url")
    return out_path


# ---------------------------------------------------------------------------
# fal calls (sync client)
# ---------------------------------------------------------------------------

def fal_run(model: str, arguments: dict, stage: str) -> dict:
    import fal_client  # imported after FAL_KEY is placed in the environment

    started = time.time()
    say(f"    submitting to {model} ...")
    result = fal_client.subscribe(model, arguments=arguments)
    say(f"    done in {time.time() - started:.1f}s")
    if not isinstance(result, dict):
        raise SystemExit(f"{stage}: unexpected fal result type {type(result).__name__}")
    return result


def first_image_url(result: dict, stage: str) -> str:
    image = result.get("image") or (result.get("images") or [{}])[0]
    url = image.get("url") if isinstance(image, dict) else None
    if not url:
        raise SystemExit(f"{stage}: no image url in fal result (keys: {sorted(result.keys())})")
    return url


def fal_upload(path: Path) -> str:
    import fal_client

    return fal_client.upload_file(str(path))


def write_ledger(here: Path, run_dir: Path, record: dict) -> None:
    """Persist this run's cost to disk -- the ONLY place spend is recorded. Writes a
    per-run cost.json plus one appended line in the global runs/ledger.jsonl. The fal
    balance delta is EXACT when FAL_ADMIN_KEY is set; otherwise 'spent' is null."""
    try:
        save_json(run_dir / "cost.json", record)
        ledger = here / "runs" / "ledger.jsonl"
        with ledger.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:                    # a ledger failure must never break a run
        say(f"    (ledger write failed: {type(exc).__name__})")


def fal_upscale(src: Path, out_path: Path, target_long: int = UPSCALE_TARGET_LONG_EDGE) -> tuple[Path, int, int]:
    """Upscale an image toward ~4K on its long edge via the fal Crystal upscaler
    (face-optimised). Returns (out_path, new_w, new_h). Raises on failure so the
    caller can keep the un-upscaled image for the text variants."""
    from PIL import Image

    w, h = Image.open(src).size
    scale = max(1.0, round(target_long / max(w, h), 2))
    src_url = fal_upload(src)
    result = fal_run(UPSCALE_MODEL, {
        "image_url": src_url,
        "scale_factor": scale,
        "output_format": "png",
    }, "upscale")
    up_url = first_image_url(result, "upscale")
    download(up_url, out_path)
    nw, nh = Image.open(out_path).size
    return out_path, nw, nh


def read_balance(env: dict) -> float | None:
    key = env.get("FAL_ADMIN_KEY", "").strip()
    if not key:
        return None
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                "https://api.fal.ai/v1/account/billing",
                params={"expand": "credits"},
                headers={"Authorization": f"Key {key}"},
            )
        body = resp.json() if resp.status_code == 200 else {}
        value = (body.get("credits") or {}).get("current_balance") if isinstance(body, dict) else None
        return float(value) if value is not None else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Meta ad grounding (gated: silently skips when the token is invalid/absent)
# ---------------------------------------------------------------------------

META_API_VERSION = "v23.0"


def _meta_ad_account(env: dict, token: str) -> str | None:
    """Resolve the ad account id (act_...). Uses META_AD_ACCOUNT if set, else
    discovers the first account on /me/adaccounts. Returns None on failure."""
    acct = env.get("META_AD_ACCOUNT", "").strip()
    if acct:
        return acct if acct.startswith("act_") else f"act_{acct}"
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"https://graph.facebook.com/{META_API_VERSION}/me/adaccounts",
                params={"fields": "id", "limit": 1, "access_token": token},
            )
        if resp.status_code != 200:
            return None
        data = resp.json().get("data", [])
        return data[0]["id"] if data else None
    except Exception:
        return None


def fetch_meta_grounding(env: dict, run_dir: Path) -> str | None:
    """Best-effort: distill real winning ad creatives into a text block for the
    creative-spec prompt. Returns None (and the pipeline proceeds ungrounded)
    whenever the token is missing/revoked, no ad account resolves, or the API
    errors. Unverified live -- the account's token is currently revoked; this is
    wired to activate the moment a valid post-password-change token is present."""
    token = env.get("META_ACCESS_TOKEN", "").strip()
    if not token:
        return None
    account = _meta_ad_account(env, token)
    if not account:
        say("    meta grounding: skipped (no valid token / ad account)")
        return None
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.get(
                f"https://graph.facebook.com/{META_API_VERSION}/{account}/ads",
                params={
                    "fields": "name,creative{title,body,call_to_action_type},"
                              "insights.limit(1){ctr,impressions,clicks,spend}",
                    "limit": 25,
                    "access_token": token,
                },
            )
        if resp.status_code != 200:
            err = resp.json().get("error", {})
            say(f"    meta grounding: skipped ({err.get('message', 'API error')[:80]})")
            return None
        rows = []
        for ad in resp.json().get("data", []):
            creative = ad.get("creative", {}) or {}
            hook = creative.get("title") or creative.get("body")
            if not hook:
                continue
            insights = (ad.get("insights", {}) or {}).get("data", [{}])
            ctr = float(insights[0].get("ctr", 0) or 0) if insights else 0.0
            rows.append((ctr, hook.strip(), creative.get("call_to_action_type", "")))
        if not rows:
            say("    meta grounding: skipped (no usable ad creatives)")
            return None
        rows.sort(key=lambda r: r[0], reverse=True)
        lines = [f'- "{hook}" (CTR {ctr:.2f}%, CTA {cta or "n/a"})' for ctr, hook, cta in rows[:5]]
        block = (
            "Real winning ad creatives from this brand's Meta ad history, best CTR "
            "first -- ground the hook and messaging in what has actually performed:\n"
            + "\n".join(lines)
        )
        (run_dir / "00_meta_grounding.txt").write_text(block, encoding="utf-8")
        say(f"    meta grounding: {len(rows)} real ad creatives fetched (top {len(lines)} used)")
        return block
    except Exception as exc:
        say(f"    meta grounding: skipped ({type(exc).__name__})")
        return None


# ---------------------------------------------------------------------------
# Deterministic prompt builders (static-ad versions of the pipeline builders)
# ---------------------------------------------------------------------------

def gender_noun(gender: str) -> str:
    g = (gender or "").lower()
    return "woman" if g.startswith("f") else "man" if g.startswith("m") else "person"


def build_portrait_prompt(character: dict) -> str:
    identity = character.get("identity", {})
    appearance = character.get("appearance", {})
    hair = appearance.get("hair", {})
    parts = [
        f"Professional portrait photograph of a {identity.get('approximateAge', 27)}-year-old "
        f"{identity.get('ethnicity', '')} {gender_noun(identity.get('gender', ''))}".replace("  ", " ")
    ]
    if hair.get("length") or hair.get("color"):
        parts.append(f"with {hair.get('length', '')} {hair.get('color', '')} hair".replace("  ", " ").lower())
    if appearance.get("skinTone"):
        parts.append(f"{appearance['skinTone'].lower()} skin tone")
    features = [f.lower() for f in appearance.get("facialFeatures", []) if f]
    if features:
        parts.append(", ".join(features))
    return ", ".join(p.strip() for p in parts if p.strip()) + ", " + PORTRAIT_CLOSING


def build_keyframe_prompt(spec: dict, character: dict, shot: dict, category: str) -> str:
    identity = character.get("identity", {})
    appearance = character.get("appearance", {})
    hair = appearance.get("hair", {})
    direction = spec.get("creativeDirection", {})
    camera = shot.get("camera", {})
    comp = shot.get("composition", {})
    who = shot.get("character", {})

    blocks: list[str] = []
    narrative = (shot.get("narrative", {}).get("summary") or "").rstrip(".!? ")
    if narrative:
        blocks.append(narrative)
    action = (who.get("action") or "").rstrip(".!? ")
    if action:
        blocks.append(action[0].upper() + action[1:])
    persona_bits = [
        f"{identity.get('approximateAge', 27)}-year-old {identity.get('ethnicity', '')} "
        f"{gender_noun(identity.get('gender', ''))}".replace("  ", " ").strip(),
        f"{hair.get('length', '')} {hair.get('color', '')} hair".replace("  ", " ").strip().lower(),
        f"{who.get('expression', 'natural')} expression".lower(),
    ]
    blocks.append(", ".join(b for b in persona_bits if b and b != "hair"))
    cam_bits = [
        f"{camera.get('shotType', 'Medium Close-Up') or 'Medium Close-Up'} shot",
        f"{camera.get('angle', 'Eye Level')} angle",
        f"{camera.get('lens', '85mm') or '85mm'} lens",
    ]
    blocks.append(", ".join(cam_bits).lower())
    if comp.get("background"):
        blocks.append(comp["background"])
    if direction.get("lighting"):
        blocks.append(f"{direction['lighting']} lighting".lower())
    style_bits = [direction.get("style", ""), "social media advertisement aesthetic"]
    blocks.append(", ".join(s for s in style_bits if s))
    if comp.get("subjectPosition"):
        blocks.append(f"subject positioned {comp['subjectPosition'].lower()}")
    blocks.append(f"wearing a plain generic {category.lower() or 'garment'}")
    blocks.append(FRAMING_DIRECTIVE)
    blocks.append(QUALITY_TOKENS)
    return ". ".join(b.strip() for b in blocks if b and b.strip())


# ---------------------------------------------------------------------------
# Product sources
# ---------------------------------------------------------------------------

def shopify_shop_name(env: dict) -> str | None:
    """Fetch the store's display name from Shopify (used as the brand-name default).
    Returns None if creds are missing or the call fails -- never blocks the run."""
    store, token = env.get("SHOPIFY_STORE"), env.get("SHOPIFY_TOKEN")
    version = env.get("SHOPIFY_API_VERSION", "2026-07")
    if not store or not token:
        return None
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"https://{store}/admin/api/{version}/graphql.json",
                headers={"X-Shopify-Access-Token": token},
                json={"query": "{ shop { name } }"},
            )
        if resp.status_code != 200:
            return None
        return (resp.json().get("data", {}).get("shop", {}) or {}).get("name") or None
    except Exception:
        return None


def shopify_pick(env: dict, run_dir: Path) -> tuple[str, Path, str]:
    """Search live Shopify, let the user pick; returns (title, local image, category guess)."""
    store, token = env.get("SHOPIFY_STORE"), env.get("SHOPIFY_TOKEN")
    version = env.get("SHOPIFY_API_VERSION", "2026-07")
    if not store or not token:
        raise SystemExit("SHOPIFY_STORE / SHOPIFY_TOKEN missing from .env")
    query = ask_required("Shopify search text (product title contains)")
    gql = {
        "query": """
        query($q: String!) { products(first: 5, query: $q) { nodes {
            title productType
            featuredMedia { ... on MediaImage { image { url } } }
        } } }""",
        "variables": {"q": f"title:*{query}*"},
    }
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"https://{store}/admin/api/{version}/graphql.json",
            headers={"X-Shopify-Access-Token": token},
            json=gql,
        )
    if resp.status_code != 200:
        raise SystemExit(f"Shopify returned {resp.status_code}")
    nodes = resp.json().get("data", {}).get("products", {}).get("nodes", [])
    nodes = [n for n in nodes if (n.get("featuredMedia") or {}).get("image", {}).get("url")]
    if not nodes:
        raise SystemExit("no products with images matched that search")
    for i, n in enumerate(nodes, 1):
        say(f"  [{i}] {n['title']}")
    while True:
        pick = ask_required("Pick a product number", "1")
        if pick.isdigit() and 1 <= int(pick) <= len(nodes):
            break
        say("  (enter a listed number)")
    node = nodes[int(pick) - 1]
    url = node["featuredMedia"]["image"]["url"]
    local = download(url, run_dir / "00_product_source.jpg")
    return node["title"], local, node.get("productType") or ""


def resolve_product_image(env: dict, run_dir: Path) -> tuple[str, Path, str]:
    say("Product image source:")
    say("  [1] local file path")
    say("  [2] image URL")
    say("  [3] search live Shopify store")
    choice = ask_required("Choose 1/2/3", "1")
    if choice == "3":
        return shopify_pick(env, run_dir)
    if choice == "2":
        url = ask_required("Product image URL")
        local = download(url, run_dir / "00_product_source.jpg")
        return "", local, ""
    while True:
        raw = ask_required("Local product image path")
        src = Path(raw.strip('"'))
        if src.is_file():
            break
        say("  (file not found)")
    dest = run_dir / ("00_product_source" + (src.suffix or ".jpg"))
    dest.write_bytes(src.read_bytes())
    return src.stem.replace("-", " ").replace("_", " "), dest, ""


# ---------------------------------------------------------------------------
# Text stage: Gemini vision (scene analysis) -> LLM ad copy -> programmatic
# Pillow overlay. Produces the clean ad PLUS one image per archetype.
# ---------------------------------------------------------------------------

VISION_MODEL = "google/gemini-2.5-flash"   # image -> JSON scene analysis (via OpenRouter);
# 2.5-flash returns clean complete JSON for spatial tasks; 3.x-flash's reasoning mode truncated it.
ARCHETYPES = ("promo", "editorial", "catalog", "signature", "custom")

# Meta unified 9:16 safe zone (2026): keep text out of the top UI band and the
# bottom action stack. Fractions of image height/width.
_SIDE_MARGIN = 0.07
_TOP_SAFE = 0.10
_BOTTOM_SAFE = 0.84

_FONTS_DIR = r"C:\Windows\Fonts"
_LOCAL_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
# Body/headline typeface is Georgia Bold everywhere. The "script" kind is an elegant
# cursive for the signature archetype's hook line only: bundled Great Vibes first
# (fonts/), then Windows calligraphic fallbacks (Monotype Corsiva, Edwardian, Segoe
# Script). (timesbd.ttf is only a fallback if Georgia is missing.)
_FONT_CANDIDATES = {
    "impact":   ["georgiab.ttf", "timesbd.ttf"],
    "sansbold": ["georgiab.ttf", "timesbd.ttf"],
    "sans":     ["georgiab.ttf", "timesbd.ttf"],
    "serif":    ["georgiab.ttf", "timesbd.ttf"],
    "script":   ["GreatVibes-Regular.ttf", "MTCORSVA.TTF", "ITCEDSCR.TTF", "segoesc.ttf"],
}

VISION_INSTRUCTION = (
    "Analyse this vertical advertising image and return ONLY a JSON object describing where "
    "text can safely be placed. All coordinates are [ymin,xmin,ymax,xmax] normalised 0-1000. "
    "Return exactly: "
    '{"person_box":[ymin,xmin,ymax,xmax],"face_box":[ymin,xmin,ymax,xmax],'
    '"top_clear":true|false,"bottom_clear":true|false}. '
    "person_box bounds the main person; face_box bounds their face; top_clear/bottom_clear say "
    "whether the top/bottom third is relatively free of the face and clutter for a text overlay. "
    "If there is no person, use zeros for the boxes."
)

COPY_SYSTEM = (
    "You are an e-commerce ad copywriter. Return ONLY a JSON object with short copy for four ad "
    "archetypes. Every line must be punchy (2-6 words), no hashtags, no brand names as logos, and "
    "NO emojis (plain text only, even if a source hook contains an emoji). Exact shape:\n"
    '{"promo":{"headline":"","urgency":"","cta":""},'
    '"editorial":{"collection":"","line":"","cta":""},'
    '"catalog":{"productName":"","price":"","cta":""},'
    '"signature":{"headline":"","tagline":""},'
    '"custom":{"headline":"","tagline":""}}\n'
    "promo = bold offer/hook + urgency + short CTA. editorial = elegant collection tag + one refined "
    "line + soft CTA. catalog = product name + price + shop CTA. If the price is unknown, set it to "
    '"". signature = an upscale, aspirational hook in Title Case (headline, 2-4 words, meant to be set '
    "in an elegant cursive script) + a refined tagline (2-5 words); it MUST be DISTINCT from the promo/"
    "editorial/catalog copy -- do not reuse their words or phrasing. "
    "custom: leave custom.headline as \"\" (it is filled from the user's exact text in code). If the user "
    "supplied explicit ad text, write custom.tagline as a short complementary supporting line (2-5 words) "
    "that pairs with that text; otherwise set custom.tagline to \"\". "
    "If the user supplied explicit ad text, use it as the promo headline and the editorial line, "
    "adapting the rest around it. Ground the promo hook in the historical winning hooks when given.\n"
    "BANNED: never output \"Shop Now\" (in any casing) as a CTA -- it is forbidden. Use fresher CTAs "
    "instead, e.g. Get Yours, Grab It, Own It, See More, Explore, Discover."
)


def gemini_scene_analysis(env: dict, image_path: Path) -> dict:
    """Ask a Gemini vision model where text can go. Returns a dict; on any failure
    returns safe defaults so the overlay never blocks."""
    default = {"person_box": [0, 250, 1000, 750], "face_box": [80, 380, 340, 620],
               "top_clear": True, "bottom_clear": True}
    url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1") + "/chat/completions"
    body = {
        "model": VISION_MODEL,
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": VISION_INSTRUCTION},
            {"type": "image_url", "image_url": {"url": _data_uri(image_path)}},
        ]}],
    }
    try:
        with httpx.Client(timeout=120) as client:
            resp = client.post(url, headers={"Authorization": f"Bearer {env['OPENROUTER_API_KEY']}"}, json=body)
        if resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code}")
        content = resp.json()["choices"][0]["message"]["content"]
        i, j = content.find("{"), content.rfind("}")   # tolerate ``` fences / prose
        parsed = json.loads(content[i:j + 1] if i != -1 and j > i else content)
        return {**default, **parsed}
    except Exception as exc:
        say(f"    scene analysis fell back to defaults ({type(exc).__name__})")
        return default


def generate_ad_copy(env: dict, spec: dict, product_name: str, price: str,
                     user_text: str, meta_block: str | None) -> dict:
    """LLM copy for all three archetypes (reuses the JSON planner)."""
    msg = spec.get("messaging", {})
    user = (
        f"Product name: {product_name}\nPrice: {price or 'unknown'}\n"
        f"Creative hook: {msg.get('hook', '')}\nCore message: {msg.get('coreMessage', '')}\n"
        f"Planned CTA: {msg.get('cta', '')}\n"
        f"User-provided ad text: {user_text or '(none -- you decide)'}\n"
        f"{meta_block or ''}\n\nWrite the three-archetype ad copy JSON."
    )
    try:
        return plan_json(env, COPY_SYSTEM, user, "ad copy")
    except SystemExit:
        return {"promo": {}, "editorial": {}, "catalog": {}}


# --- Pillow overlay helpers ------------------------------------------------

_EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿←-⇿︀-️‍]")
_BANNED_CTA_RE = re.compile(r"\bshop\s*now\b", re.IGNORECASE)  # "shop now" is forbidden


def _clean(text: str) -> str:
    """Normalise punctuation and drop glyphs the TTF fonts can't render (emoji,
    arrows, variation selectors). Keeps latin, common punctuation, and currency.
    Also enforces the banned-CTA rule at render time as a hard backstop."""
    if not isinstance(text, str):
        return ""
    t = (text.replace("—", "-").replace("–", "-")
             .replace("’", "'").replace("‘", "'")
             .replace("“", '"').replace("”", '"'))
    t = _BANNED_CTA_RE.sub("Get Yours", t)   # never let "Shop Now" reach the canvas
    return " ".join(_EMOJI_RE.sub("", t).split())


def _load_font(kind: str, size: int):
    from PIL import ImageFont
    for name in _FONT_CANDIDATES.get(kind, ["arial.ttf"]):
        for base in (_LOCAL_FONTS_DIR, _FONTS_DIR):   # bundled fonts win over system
            p = os.path.join(base, name)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    continue
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if not cur or draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or [""]


_WHITE, _BLACK = (255, 255, 255, 255), (0, 0, 0, 255)


def _stack(draw, lines, W: int, y: int, fill, gap: int, stroke_ratio: int = 16) -> int:
    """Draw centered lines legibly with a crisp outline -- no box, no scrim.
    stroke_ratio: smaller = thicker outline (heavier for CTAs)."""
    for text, font in lines:
        if not text:
            continue
        sw = max(2, font.size // stroke_ratio)
        tw = draw.textlength(text, font=font)
        x = (W - tw) / 2
        draw.text((x, y), text, font=font, fill=fill, stroke_width=sw, stroke_fill=_BLACK)
        y += sum(font.getmetrics()) + gap
    return y


# Text is confined to the lower 30% of the image (top of the band at 0.70 H).
_TEXT_TOP = 0.70


def _text_top_floor(H: int) -> int:
    """Highest y at which text may begin: never above the lower 30% of the image.
    This is the hard 'lower 30% only' guarantee for every archetype."""
    return int(H * _TEXT_TOP)


def _text_zone(scene: dict, W: int, H: int) -> tuple[int, int]:
    """Vision-driven safe band for text: strictly BELOW the detected face AND never
    above the lower 35% of the image, down to the bottom safe margin. Keeps text
    off the model's head and confined to the bottom band."""
    face = scene.get("face_box") or [0, 0, 0, 0]
    face_bottom = int(face[2] / 1000 * H)
    bottom = int(H * _BOTTOM_SAFE)
    # below the face, but clamped so it can never rise above the lower 35%
    top = max(_text_top_floor(H), face_bottom + int(H * 0.03))
    if bottom - top < int(H * 0.14):          # face reaches deep -- keep a minimum band
        top = bottom - int(H * 0.14)
    return top, bottom


# Curated accent palette -- bright, tasteful tints that read over the black outline
# and pair well with rich apparel tones. The accent is chosen dynamically from the
# dominant hue of the text band via a designer-pairing lookup (a raw complement, e.g.
# blue on purple, is high-contrast but clashes; these are pairings that look good).
_ACCENT_GOLD  = (234, 201, 124, 255)   # champagne gold -- royal partner for blue / purple
_ACCENT_CREAM = (247, 240, 224, 255)   # warm ivory     -- clean on yellows / neutrals
_ACCENT_CORAL = (242, 166, 140, 255)   # soft coral     -- warms up greens / teals
_ACCENT_TEAL  = (118, 205, 199, 255)   # bright teal    -- cool pop on warm oranges / browns
_ACCENT_BLUSH = (242, 193, 203, 255)   # rose blush     -- soft partner for reds / crimsons


def _dominant_rgb(region) -> tuple[float, float, float]:
    """Dominant colour of a region as 0-1 floats (median-cut quantise; falls back to
    the mean if quantise is unavailable). Dominant reads truer than a flat average."""
    try:
        q = region.quantize(colors=6).convert("RGB")
        pal = q.getcolors(maxcolors=100000) or []
        r, g, b = max(pal, key=lambda c: c[0])[1]
    except Exception:
        px = list(region.getdata())
        n = len(px) or 1
        r = sum(p[0] for p in px) / n
        g = sum(p[1] for p in px) / n
        b = sum(p[2] for p in px) / n
    return r / 255, g / 255, b / 255


def _accent_color(img, zone: tuple[int, int]) -> tuple[int, int, int, int]:
    """Pick a text accent that HARMONISES with the dominant colour of the text band,
    inferred dynamically from that colour's hue (not a raw complement, which can
    clash). Fine-grained designer-pairing lookup across the whole hue wheel, so
    different products get different accents. Returns a bright tint legible over the
    black outline."""
    import colorsys
    W, H = img.size
    top, bottom = zone
    region = img.convert("RGB").crop((0, max(0, top), W, min(H, bottom))).resize((48, 48))
    r, g, b = _dominant_rgb(region)
    h, s, _ = colorsys.rgb_to_hsv(r, g, b)
    if s < 0.15:                               # near-greyscale -- warm ivory, not gold
        return _ACCENT_CREAM
    deg = h * 360
    if deg >= 345 or deg < 15:                 # red / crimson        -> rose blush
        return _ACCENT_BLUSH
    if deg < 45:                               # orange / terracotta / brown / taupe -> teal
        return _ACCENT_TEAL
    if deg < 70:                               # amber / yellow       -> cream
        return _ACCENT_CREAM
    if deg < 200:                              # green / teal / cyan  -> coral
        return _ACCENT_CORAL
    # blue, indigo, violet, purple, magenta (200-345) -> champagne gold
    return _ACCENT_GOLD


# Two fixed sizes, consistent across every archetype: the lower line is the base,
# the upper line (the hook) is 15% bigger. Base carries a +5% overall bump.
_TEXT_SIZE = 0.0525        # lower line (0.05 base, +5% overall)
_HOOK_SCALE = 1.15         # upper line is 15% bigger than the lower -- it's the hook


def _two_line(img, scene: dict, top_text: str, bottom_text: str,
              top_kind: str = "sansbold", top_mult: float = 1.0) -> None:
    """Shared layout: exactly two text blocks inside the lower-30% safe band. Upper
    line = white and 15% bigger (the hook); lower line = image-derived accent colour.
    The two blocks are stacked sequentially (upper, then lower below it) and centred
    in the band, so they never overlap. Lower line is always Georgia Bold; the upper
    line uses top_kind (e.g. "script" for the signature archetype), scaled by top_mult
    since cursive faces sit smaller at the same point size."""
    from PIL import ImageDraw
    W, H = img.size
    d = ImageDraw.Draw(img)
    margin = int(W * _SIDE_MARGIN)
    max_w = W - 2 * margin
    zt, zb = _text_zone(scene, W, H)
    accent = _accent_color(img, (zt, zb))
    gap = int(H * 0.004)
    head_font = _load_font(top_kind, int(W * _TEXT_SIZE * _HOOK_SCALE * top_mult))  # hook
    sub_font = _load_font("sansbold", int(W * _TEXT_SIZE))                 # lower line

    tlines = _wrap(d, top_text.strip(), head_font, max_w) if (top_text or "").strip() else []
    blines = _wrap(d, bottom_text.strip(), sub_font, max_w) if (bottom_text or "").strip() else []
    top_h = len(tlines) * (sum(head_font.getmetrics()) + gap)
    bot_h = len(blines) * (sum(sub_font.getmetrics()) + gap)
    inter = int(H * 0.012) if tlines and blines else 0
    total = top_h + inter + bot_h

    # start at the top of the band, but centre the stack when there is spare room
    y = zt + max(0, ((zb - zt) - total) // 2)
    if tlines:
        y = _stack(d, [(l, head_font) for l in tlines], W, y, _WHITE, gap) + inter
    if blines:
        _stack(d, [(l, sub_font) for l in blines], W, y, accent, gap)


def _render_promo(img, c: dict, scene: dict) -> None:
    # bold hook (white) over urgency/CTA (accent); CTA is the fallback if no urgency
    head = (c.get("headline") or "LIMITED DROP").upper()
    lower = (c.get("urgency") or c.get("cta") or "GET YOURS").upper()
    _two_line(img, scene, head, lower)


def _render_editorial(img, c: dict, scene: dict) -> None:
    # collection tag (white) over the refined line (accent)
    coll = (c.get("collection") or "").upper()
    line = (c.get("line") or c.get("cta") or "DISCOVER").upper()
    _two_line(img, scene, coll, line)


def _render_catalog(img, c: dict, scene: dict) -> None:
    # product name (white) over price (accent); CTA replaces price only if none given
    name = (c.get("productName") or "").upper()
    price = c.get("price") or ""
    lower = price if price else (c.get("cta") or "GET YOURS").upper()
    _two_line(img, scene, name, lower)


def _render_signature(img, c: dict, scene: dict) -> None:
    # elegant cursive hook (white, Title Case -- NOT uppercased, scripts read badly in
    # all-caps) over a refined tagline (accent) in Georgia Bold, uppercased like the rest
    head = c.get("headline") or "Timeless Grace"
    lower = (c.get("tagline") or c.get("line") or "New Arrivals").upper()
    _two_line(img, scene, head, lower, top_kind="script", top_mult=1.9)


def _render_custom(img, c: dict, scene: dict) -> None:
    # the user's OWN text, verbatim (case preserved), as the hook; optional short
    # complementary tagline (accent) below in Georgia Bold
    head = c.get("headline") or ""
    lower = (c.get("tagline") or "").upper()
    _two_line(img, scene, head, lower)


_RENDERERS = {"promo": _render_promo, "editorial": _render_editorial,
              "catalog": _render_catalog, "signature": _render_signature,
              "custom": _render_custom}
_VARIANT_FILES = {"promo": "08_ad_promo.png", "editorial": "09_ad_editorial.png",
                  "catalog": "10_ad_catalog.png", "signature": "11_ad_signature.png",
                  "custom": "12_ad_custom.png"}


def add_text_variants(clean_path: Path, run_dir: Path, copy: dict, scene: dict) -> list[Path]:
    from PIL import Image
    out = []
    for key in ARCHETYPES:
        fields = {k: _clean(v) for k, v in (copy.get(key) or {}).items()}
        # the custom archetype is rendered ONLY when the user supplied explicit text
        if key == "custom" and not (fields.get("headline") or "").strip():
            continue
        img = Image.open(clean_path).convert("RGBA")
        try:
            _RENDERERS[key](img, fields, scene)
        except Exception as exc:
            say(f"    {key} overlay error: {type(exc).__name__}: {exc}")
        dest = run_dir / _VARIANT_FILES[key]
        img.convert("RGB").save(dest)
        out.append(dest)
    return out


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

def main() -> int:
    # LLM/Meta text carries em-dashes and curly quotes; force UTF-8 so printing
    # them never crashes a cp1252 Windows console.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    here = Path(__file__).resolve().parent
    env = load_env(find_root_env(here))
    for required in ("OPENROUTER_API_KEY", "FAL_KEY"):
        if not env.get(required):
            raise SystemExit(f"{required} missing from the root .env")
    os.environ["FAL_KEY"] = env["FAL_KEY"]

    run_dir = here / "runs" / datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)

    hr()
    say("STATIC AD GENERATOR (standalone) -- artifacts: " + str(run_dir))
    balance = read_balance(env)
    if balance is not None:
        say(f"fal balance: ${balance:.2f}")
    hr()

    # ------------------------------------------------------------- inputs --
    title_default, product_image, category_default = resolve_product_image(env, run_dir)
    product_name = ask_required("Product name", title_default or "")
    category = ask_required("Product category (e.g. kurta set, blazer, saree)", category_default or "")
    description = ask("Short product description (optional)")
    product_context = f"{product_name} (category: {category})" + (
        f"\n{description}" if description else ""
    )

    # brand name: fetched from Shopify, still overridable
    brand_name = ask_required("Brand name", shopify_shop_name(env) or "")

    # brand vibe: LLM-drafted from brand + product, shown as an editable default
    say("  inferring brand vibe (LLM; press Enter to accept, or type your own) ...")
    brand_vibe = ask_required("Brand positioning / vibe", infer_brand_vibe(env, brand_name, product_context))

    # creative preference: user-provided (no seeded default)
    preference = ask_required("Creative preference")
    audience_hint = ask("Audience hint (optional)", "")

    # optional: exact text to put in the image. Blank -> the LLM writes the copy.
    text_request = ask("Text to put in the image? (blank = let AI decide)")

    inputs = {
        "productName": product_name,
        "category": category,
        "description": description,
        "brandName": brand_name,
        "brandVibe": brand_vibe,
        "creativePreference": preference,
        "audienceHint": audience_hint,
        "textRequest": text_request,
        "productImage": product_image.name,
    }
    save_json(run_dir / "00_inputs.json", inputs)

    brand_context = f"{brand_name} -- {brand_vibe}" + (
        f"\nAudience hint: {audience_hint}" if audience_hint else ""
    )

    # ----------------------------------------------------------- planning --
    prompts_log: list[str] = []

    def log_prompt(stage: str, system: str, user: str) -> None:
        prompts_log.append(f"{'=' * 30} {stage} SYSTEM {'=' * 30}\n{system}\n"
                           f"{'=' * 30} {stage} USER {'=' * 30}\n{user}\n")

    hr()
    say("[0/6] Meta ad grounding")
    meta_grounding = fetch_meta_grounding(env, run_dir)

    say("[1/6] Creative spec (LLM)")
    user = render(
        CREATIVE_TEMPLATE,
        brand=brand_context,
        product=product_context,
        preference=preference,
        meta=meta_grounding or "No historical ad data available.",
    )
    log_prompt("CREATIVE", CREATIVE_SYSTEM, user)
    spec = plan_json(env, CREATIVE_SYSTEM, user, "creative spec")
    spec.setdefault("constraints", {})["showBrandLogo"] = False  # standing rule: never logos
    save_json(run_dir / "01_creative_spec.json", spec)
    say("    hook: " + str(spec.get("messaging", {}).get("hook", "")))
    say("    style: " + str(spec.get("creativeDirection", {}).get("style", "")))

    say("[2/6] Character persona (LLM)")
    user = render(CHARACTER_TEMPLATE, creative_spec=json.dumps(spec, ensure_ascii=False),
                  brand=brand_context, category=category)
    log_prompt("CHARACTER", CHARACTER_SYSTEM, user)
    character = plan_json(env, CHARACTER_SYSTEM, user, "character")
    save_json(run_dir / "02_character.json", character)
    identity = character.get("identity", {})
    say(f"    persona: {identity.get('approximateAge')}yo {identity.get('ethnicity', '')} "
        f"{gender_noun(identity.get('gender', ''))}, {identity.get('role', '')}")

    say("[3/6] Product shot plan (LLM)")
    user = render(SHOT_TEMPLATE, creative_spec=json.dumps(spec, ensure_ascii=False),
                  character=json.dumps(character, ensure_ascii=False))
    log_prompt("SHOT", SHOT_SYSTEM, user)
    shot = plan_json(env, SHOT_SYSTEM, user, "shot plan")
    save_json(run_dir / "03_shot_plan.json", shot)
    say("    scene: " + str(shot.get("narrative", {}).get("summary", "")))

    portrait_prompt = build_portrait_prompt(character)
    keyframe_prompt = build_keyframe_prompt(spec, character, shot, category)
    prompts_log.append(f"{'=' * 30} PORTRAIT (FLUX raw prompt) {'=' * 30}\n{portrait_prompt}\n")
    prompts_log.append(f"{'=' * 30} KEYFRAME (FLUX raw prompt) {'=' * 30}\n{keyframe_prompt}\n")
    prompts_log.append(f"{'=' * 30} NEGATIVE TERMS (reference only, never sent) {'=' * 30}\n{NEGATIVE_TERMS}\n")
    (run_dir / "prompts_used.txt").write_text("\n".join(prompts_log), encoding="utf-8")
    say("    portrait prompt : " + portrait_prompt[:100] + "...")
    say("    keyframe prompt : " + keyframe_prompt[:100] + "...")
    say("    (full prompts saved to prompts_used.txt)")

    # --------------------------------------------------------- spend gate --
    hr()
    say("Paid generation next. Estimated spend:")
    for line in EST_COST_LINES:
        say(line)
    if balance is not None:
        say(f"  current fal balance: ${balance:.2f}")
    if ask("Proceed with paid generation? (y/N)", "N").lower() != "y":
        say("Aborted before any paid call. Planning artifacts kept in " + str(run_dir))
        write_ledger(here, run_dir, {
            "run_id": run_dir.name,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "aborted": True,
            "renderer": None,
            "stages": ["planning"],
            "balance_before": balance,
            "balance_after": balance,
            "spent": 0.0,
            "product": product_name,
            "brand": brand_name,
        })
        return 1

    # ---------------------------------------------------------- generation --
    hr()
    say("[4/7] Reference portrait (FLUX.2, 1024x1024)")
    result = fal_run(IMAGE_MODEL, {
        "prompt": portrait_prompt,
        "image_size": {"width": 1024, "height": 1024},
    }, "portrait")
    portrait_url = first_image_url(result, "portrait")
    download(portrait_url, run_dir / "04_portrait.png")
    say("    saved 04_portrait.png")

    say(f"[5/7] Scene keyframe (FLUX.2, {KEYFRAME_SIZE['width']}x{KEYFRAME_SIZE['height']}, portrait as reference)")
    result = fal_run(IMAGE_MODEL, {
        "prompt": keyframe_prompt,
        "image_size": KEYFRAME_SIZE,
        "image_urls": [portrait_url],
    }, "keyframe")
    keyframe_url = first_image_url(result, "keyframe")
    download(keyframe_url, run_dir / "05_keyframe_raw.png")
    say("    saved 05_keyframe_raw.png")

    say("[6/7] Garment swap")
    final_path = run_dir / "07_static_ad.png"
    keyframe_path = run_dir / "05_keyframe_raw.png"
    try:
        say("    primary: Nano Banana 2 swap (OpenRouter) ...")
        nano_banana_swap(env, keyframe_path, product_image, final_path)
        renderer = "nano-banana-2"
        say("    saved 07_static_ad.png (nano-banana-2)")
    except Exception as exc:
        say(f"    Nano Banana swap failed ({exc})")
        say("    fallback: BiRefNet cutout + BRIA placement ...")
        product_url = fal_upload(product_image)
        result = fal_run(CUTOUT_MODEL, {"image_url": product_url}, "cutout")
        cutout_url = first_image_url(result, "cutout")
        download(cutout_url, run_dir / "06_product_cutout.png")
        result = fal_run(PLACEMENT_MODEL, {
            "image_url": cutout_url,        # the PRODUCT (verified mapping)
            "ref_image_url": keyframe_url,  # the SCENE
            "placement_type": "manual_placement",
            "manual_placement_selection": "bottom_center",
        }, "placement")
        final_url = first_image_url(result, "placement")
        download(final_url, final_path)
        renderer = "birefnet+bria (fallback)"
        say("    saved 07_static_ad.png (BRIA fallback)")

    # ------------------------------------------------------------- upscale --
    # The clean ad is saved BEFORE (07_static_ad.png) and AFTER (07u_...) the
    # upscaler so both are inspectable. Text variants are built on whichever is the
    # highest-quality image available (upscaled if it succeeded).
    from PIL import Image
    bw, bh = Image.open(final_path).size
    say(f"[7/7] Upscale to ~4K (fal Crystal, paid) -- before: {bw}x{bh}")
    upscaled_path = run_dir / "07u_static_ad_upscaled.png"
    overlay_base, upscaled_ok = final_path, False
    try:
        _, uw, uh = fal_upscale(final_path, upscaled_path)
        overlay_base, upscaled_ok = upscaled_path, True
        say(f"    saved 07u_static_ad_upscaled.png -- after: {uw}x{uh}")
    except Exception as exc:
        say(f"    upscale failed ({type(exc).__name__}: {exc}); variants use the un-upscaled image")

    # ---------------------------------------------------------- text stage --
    hr()
    say("TEXT VARIANTS (clean ad + 3 archetypes)")
    say("    scene analysis (Gemini vision) ...")
    scene = gemini_scene_analysis(env, overlay_base)
    save_json(run_dir / "07b_scene_analysis.json", scene)
    say("    ad copy (LLM) ...")
    ad_copy = generate_ad_copy(env, spec, product_name, "", text_request, meta_grounding)
    # the 5th (custom) render uses the user's exact text verbatim as its hook; rendered
    # only when text was supplied (add_text_variants skips it otherwise)
    if text_request.strip():
        ad_copy.setdefault("custom", {})["headline"] = text_request.strip()
    save_json(run_dir / "07c_ad_copy.json", ad_copy)
    variants = add_text_variants(overlay_base, run_dir, ad_copy, scene)
    for v in variants:
        say("    saved " + v.name)

    hr()
    say(f"DONE. Clean static ad: {final_path}  [renderer: {renderer}]")
    say("Text variants: " + ", ".join(v.name for v in variants))
    new_balance = read_balance(env)
    spent = round(balance - new_balance, 4) if (balance is not None and new_balance is not None) else None
    if spent is not None:
        say(f"fal balance: ${balance:.2f} -> ${new_balance:.2f} (spent ${spent:.2f})")
    else:
        say("fal balance: unavailable (set FAL_ADMIN_KEY to record exact spend)")

    swap_stage = "swap:nano" if renderer == "nano-banana-2" else "swap:bria"
    stages = ["planning", "portrait", "keyframe", swap_stage]
    if upscaled_ok:
        stages.append("upscale")
    stages.append("text")
    write_ledger(here, run_dir, {
        "run_id": run_dir.name,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "aborted": False,
        "renderer": renderer,
        "upscaled": upscaled_ok,
        "stages": stages,
        "balance_before": balance,
        "balance_after": new_balance,
        "spent": spent,
        "product": product_name,
        "brand": brand_name,
    })
    say("    ledger updated: runs/ledger.jsonl (+ cost.json in this run)")

    say("All artifacts in: " + str(run_dir))
    for artifact in sorted(run_dir.iterdir()):
        say("  " + artifact.name)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        say("\ninterrupted")
        sys.exit(130)
