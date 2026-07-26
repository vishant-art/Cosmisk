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
CUTOUT_MODEL = "fal-ai/birefnet/v2"            # product background removal
PLACEMENT_MODEL = "fal-ai/bria/product-shot"   # real product into scene

EST_COST_LINES = [
    "  reference portrait (FLUX.2)      ~ $0.05",
    "  scene keyframe (FLUX.2)          ~ $0.05",
    "  product cutout (BiRefNet)        ~ $0.02",
    "  product placement (BRIA)         ~ $0.04",
    "  LLM planning (GPT-5.4-mini)      < $0.01",
    "  total                            ~ $0.15-0.40",
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
  "camera": {"shotType": "string, e.g. Medium", "angle": "string, e.g. Eye Level", "lens": "string, e.g. 35mm"},
  "character": {"expression": "string", "pose": "string", "action": "string -- what the person is doing"},
  "composition": {"subjectPosition": "string, e.g. Center", "background": "string -- the setting"}
}

This is the PRODUCT shot: the garment is the hero of the frame, worn by the
character, clearly visible on the upper body / full figure. The summary must end
with a period.
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
    raw = input(f"{label}{suffix}: ").strip()
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
        f"{camera.get('shotType', 'Medium')} shot",
        f"{camera.get('angle', 'Eye Level')} angle",
        f"{camera.get('lens', '35mm')} lens",
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
    blocks.append(QUALITY_TOKENS)
    return ". ".join(b.strip() for b in blocks if b and b.strip())


# ---------------------------------------------------------------------------
# Product sources
# ---------------------------------------------------------------------------

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
# Main flow
# ---------------------------------------------------------------------------

def main() -> int:
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
    brand_name = ask("Brand name", "Pratap Sons")
    brand_vibe = ask("Brand positioning / vibe", "Premium Indian ethnic wear; warm, heritage-proud")
    preference = ask("Creative preference", "Festive wedding-season UGC, warm natural light")
    audience_hint = ask("Audience hint (optional)", "")

    inputs = {
        "productName": product_name,
        "category": category,
        "description": description,
        "brandName": brand_name,
        "brandVibe": brand_vibe,
        "creativePreference": preference,
        "audienceHint": audience_hint,
        "productImage": product_image.name,
    }
    save_json(run_dir / "00_inputs.json", inputs)

    brand_context = f"{brand_name} -- {brand_vibe}" + (
        f"\nAudience hint: {audience_hint}" if audience_hint else ""
    )
    product_context = f"{product_name} (category: {category})" + (
        f"\n{description}" if description else ""
    )

    # ----------------------------------------------------------- planning --
    prompts_log: list[str] = []

    def log_prompt(stage: str, system: str, user: str) -> None:
        prompts_log.append(f"{'=' * 30} {stage} SYSTEM {'=' * 30}\n{system}\n"
                           f"{'=' * 30} {stage} USER {'=' * 30}\n{user}\n")

    hr()
    say("[1/6] Creative spec (LLM)")
    user = render(CREATIVE_TEMPLATE, brand=brand_context, product=product_context, preference=preference)
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
        return 1

    # ---------------------------------------------------------- generation --
    hr()
    say("[4/6] Reference portrait (FLUX.2, 1024x1024)")
    result = fal_run(IMAGE_MODEL, {
        "prompt": portrait_prompt,
        "image_size": {"width": 1024, "height": 1024},
    }, "portrait")
    portrait_url = first_image_url(result, "portrait")
    download(portrait_url, run_dir / "04_portrait.png")
    say("    saved 04_portrait.png")

    say("[5/6] Scene keyframe (FLUX.2, 1080x1920, portrait as reference)")
    result = fal_run(IMAGE_MODEL, {
        "prompt": keyframe_prompt,
        "image_size": {"width": 1080, "height": 1920},
        "image_urls": [portrait_url],
    }, "keyframe")
    keyframe_url = first_image_url(result, "keyframe")
    download(keyframe_url, run_dir / "05_keyframe_raw.png")
    say("    saved 05_keyframe_raw.png")

    say("[6/6] Product truth: cutout + placement")
    product_url = fal_upload(product_image)
    result = fal_run(CUTOUT_MODEL, {"image_url": product_url}, "cutout")
    cutout_url = first_image_url(result, "cutout")
    download(cutout_url, run_dir / "06_product_cutout.png")
    say("    saved 06_product_cutout.png")

    result = fal_run(PLACEMENT_MODEL, {
        "image_url": cutout_url,        # the PRODUCT (verified mapping)
        "ref_image_url": keyframe_url,  # the SCENE
        "placement_type": "manual_placement",
        "manual_placement_selection": "bottom_center",
    }, "placement")
    final_url = first_image_url(result, "placement")
    final_path = run_dir / "07_static_ad.png"
    download(final_url, final_path)

    hr()
    say("DONE. Static ad: " + str(final_path))
    new_balance = read_balance(env)
    if balance is not None and new_balance is not None:
        say(f"fal balance: ${balance:.2f} -> ${new_balance:.2f} (spent ${balance - new_balance:.2f})")
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
