"""One-time helper: mint a Google Ads API **refresh token** via the OAuth authorization
code grant (desktop/loopback flow).

Why this exists: the connector reads GOOGLE_ADS_REFRESH_TOKEN from .env; Google issues
refresh tokens only through a one-time user consent. This runs that consent against a
localhost callback and upserts the token into the repo-root .env — no google_auth_oauthlib
needed (stdlib + httpx, same pattern as shopify_authorize.py).

Read-only note: Google Ads API has a single OAuth scope (`.../auth/adwords`) — there is no
read-only scope. Safety is enforced in code: the connector only ever calls
GoogleAdsService.search_stream with SELECT GAQL; no mutate service is used anywhere.

Usage:
    python apps/connectors/scripts/google_authorize.py

Prereqs (Google Cloud Console -> APIs & Services):
  - OAuth client of type **Desktop app** (loopback redirects are implicitly allowed).
    For a "Web application" client instead, add http://localhost:8788/oauth/callback
    (or your GOOGLE_OAUTH_PORT) to its Authorized redirect URIs.
  - .env has GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET.

Heads-up: if the OAuth consent screen is in "Testing" status, Google expires refresh
tokens after 7 days — publish it to "In production" for a durable token.
"""
from __future__ import annotations

import os
import secrets
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse

import httpx
from dotenv import find_dotenv, load_dotenv

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/adwords"


def _env(key: str) -> str | None:
    v = os.getenv(key)
    return v.strip() if v and v.strip() else None


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


def _make_handler(state: str, result: _CallbackResult):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):  # quiet
            pass

        def do_GET(self):
            query = dict(parse_qsl(urlparse(self.path).query))
            if query.get("state") != state:
                result.error = "state mismatch on callback"
            elif "error" in query:
                result.error = f"consent denied/failed: {query['error']}"
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

    client_id = _env("GOOGLE_ADS_CLIENT_ID")
    client_secret = _env("GOOGLE_ADS_CLIENT_SECRET")
    missing = [k for k, v in {
        "GOOGLE_ADS_CLIENT_ID": client_id, "GOOGLE_ADS_CLIENT_SECRET": client_secret,
    }.items() if not v]
    if missing:
        print(f"Missing in .env: {', '.join(missing)}", file=sys.stderr)
        return 1

    port = int(_env("GOOGLE_OAUTH_PORT") or "8788")
    redirect_uri = f"http://localhost:{port}/oauth/callback"
    state = secrets.token_urlsafe(24)

    authorize_url = AUTH_URL + "?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
    })

    print(f"Redirect URI (Desktop-app clients allow loopback implicitly): {redirect_uri}")
    print(f"Open this URL in your browser to approve (read consent, single adwords scope):\n{authorize_url}\n")
    try:
        webbrowser.open(authorize_url)
    except Exception:  # noqa: BLE001 -- headless/WSL: manual open via the printed URL
        pass

    result = _CallbackResult()
    httpd = HTTPServer(("localhost", port), _make_handler(state, result))
    print(f"Waiting for callback on {redirect_uri} ...")
    httpd.handle_request()
    httpd.server_close()

    if result.error:
        print(f"Authorization failed: {result.error}", file=sys.stderr)
        return 1

    resp = httpx.post(TOKEN_URL, data={
        "code": result.code, "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    }, timeout=30.0)
    resp.raise_for_status()
    payload = resp.json()
    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        print("No refresh_token in response (was consent previously granted without "
              "prompt=consent? Revoke app access at myaccount.google.com/permissions and retry).",
              file=sys.stderr)
        return 1

    env_path = Path(find_dotenv(usecwd=True) or (Path(__file__).resolve().parents[3] / ".env"))
    _upsert_env(env_path, {"GOOGLE_ADS_REFRESH_TOKEN": refresh_token})
    print(f"Wrote GOOGLE_ADS_REFRESH_TOKEN to {env_path}")
    print("Reminder: consent screen in 'Testing' status → token expires in 7 days; "
          "publish to 'In production' for a durable one.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
