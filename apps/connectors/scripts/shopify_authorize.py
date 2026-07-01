"""One-time helper: mint a Shopify Admin API token via the OAuth **authorization code grant**.

Why this exists: `client_credentials` grant (POST straight to /admin/oauth/access_token)
only works when the Shopify org that owns the custom app also owns the store. For a
custom app installed on a *client's* store, Shopify rejects it with
`shop_not_permitted: Client credentials cannot be performed on this shop`. Authorization
code grant is the path Shopify actually supports for that case, and it also yields a
non-expiring token instead of the 24h client_credentials token.

Usage:
    python apps/connectors/scripts/shopify_authorize.py

Prereqs (Dev Dashboard -> your app -> Configuration):
  - Add `http://localhost:8787/oauth/callback` (or your SHOPIFY_OAUTH_PORT) to
    "Allowed redirection URL(s)", then Save + Release.
  - .env has SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET.

This opens a browser for a one-time merchant approval, catches the callback on a local
server, verifies `state` + Shopify's `hmac` signature, exchanges the code for a token,
and upserts SHOPIFY_ADMIN_TOKEN into the repo-root .env.
"""
from __future__ import annotations

import hashlib
import hmac as hmac_lib
import os
import secrets
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse

import httpx
from dotenv import find_dotenv, load_dotenv

DEFAULT_SCOPES = (
    "read_orders,read_products,read_marketing_events,read_price_rules,"
    "read_discounts,read_inventory,read_locations"
)


def _env(key: str) -> str | None:
    v = os.getenv(key)
    return v.strip() if v and v.strip() else None


def _verify_hmac(params: dict, secret: str) -> bool:
    received = params.pop("hmac", None)
    if not received:
        return False
    message = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    digest = hmac_lib.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac_lib.compare_digest(digest, received)


def _upsert_env(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text().splitlines(keepends=True) if path.exists() else []
    remaining = dict(updates)
    for i, line in enumerate(lines):
        for key in list(remaining):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={remaining.pop(key)}\n"
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    for key, value in remaining.items():
        lines.append(f"{key}={value}\n")
    path.write_text("".join(lines))


class _CallbackResult:
    code: str | None = None
    error: str | None = None


def _make_handler(shop: str, state: str, client_secret: str, result: _CallbackResult):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):  # quiet
            pass

        def do_GET(self):
            query = dict(parse_qsl(urlparse(self.path).query))
            if query.get("shop") not in (shop, None) or query.get("state") != state:
                result.error = "state mismatch or wrong shop in callback"
            elif not _verify_hmac(dict(query), client_secret):
                result.error = "hmac verification failed on callback"
            elif "code" not in query:
                result.error = f"no code in callback: {query}"
            else:
                result.code = query["code"]

            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            body = "Authorized — you can close this tab." if result.code else f"Error: {result.error}"
            self.wfile.write(f"<html><body>{body}</body></html>".encode())

    return Handler


def main() -> int:
    try:
        load_dotenv(find_dotenv(usecwd=True))
    except Exception:  # noqa: BLE001 -- dotenv is best-effort
        pass

    shop = _env("SHOPIFY_SHOP_DOMAIN")
    client_id = _env("SHOPIFY_CLIENT_ID")
    client_secret = _env("SHOPIFY_CLIENT_SECRET")
    missing = [k for k, v in {
        "SHOPIFY_SHOP_DOMAIN": shop, "SHOPIFY_CLIENT_ID": client_id,
        "SHOPIFY_CLIENT_SECRET": client_secret,
    }.items() if not v]
    if missing:
        print(f"Missing in .env: {', '.join(missing)}", file=sys.stderr)
        return 1

    port = int(_env("SHOPIFY_OAUTH_PORT") or "8787")
    redirect_uri = f"http://localhost:{port}/oauth/callback"
    scopes = _env("SHOPIFY_SCOPES") or DEFAULT_SCOPES
    state = secrets.token_urlsafe(24)

    authorize_url = f"https://{shop}/admin/oauth/authorize?" + urlencode({
        "client_id": client_id, "scope": scopes, "redirect_uri": redirect_uri, "state": state,
    })

    print(f"Redirect URI (must be in the app's Allowed redirection URL(s)): {redirect_uri}")
    print(f"Opening browser for merchant approval:\n{authorize_url}\n")
    webbrowser.open(authorize_url)

    result = _CallbackResult()
    httpd = HTTPServer(("localhost", port), _make_handler(shop, state, client_secret, result))
    print(f"Waiting for callback on {redirect_uri} ...")
    httpd.handle_request()
    httpd.server_close()

    if result.error:
        print(f"Authorization failed: {result.error}", file=sys.stderr)
        return 1

    resp = httpx.post(
        f"https://{shop}/admin/oauth/access_token",
        data={"client_id": client_id, "client_secret": client_secret, "code": result.code},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30.0,
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]

    env_path = Path(find_dotenv(usecwd=True) or (Path(__file__).resolve().parents[3] / ".env"))
    _upsert_env(env_path, {"SHOPIFY_SHOP_DOMAIN": shop, "SHOPIFY_ADMIN_TOKEN": token})
    print(f"Wrote SHOPIFY_ADMIN_TOKEN to {env_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
