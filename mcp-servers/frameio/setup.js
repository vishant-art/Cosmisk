#!/usr/bin/env node

/**
 * Frame.io OAuth Setup
 *
 * Opens browser for Adobe IMS OAuth, catches the callback,
 * exchanges code for tokens, saves to .frameio-token.json
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, ".frameio-token.json");

// Adobe IMS endpoints
const AUTH_URL = "https://ims-na1.adobelogin.com/ims/authorize/v2";
const TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";

// Credentials
const CLIENT_ID = process.env.FRAMEIO_CLIENT_ID || "174dbcfc39814439a7380afd76d60c86";
const CLIENT_SECRET = process.env.FRAMEIO_CLIENT_SECRET || "";
const REDIRECT_URI = "https://localhost:8080/callback";
const SCOPES = "offline_access,openid,email,profile,additional_info.roles";

if (!CLIENT_SECRET) {
  console.error("Set FRAMEIO_CLIENT_SECRET environment variable");
  process.exit(1);
}

const mode = process.argv[2]; // 'auth' or 'refresh'

if (mode === "refresh") {
  await refreshToken();
} else {
  await startAuth();
}

async function startAuth() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
  });

  const authUrl = `${AUTH_URL}?${params}`;

  console.log("\n=== Frame.io OAuth Setup ===\n");
  console.log("Opening browser for authorization...\n");
  console.log("If browser doesn't open, visit this URL:\n");
  console.log(authUrl);
  console.log("\nAfter authorizing, you'll be redirected to localhost.");
  console.log("The page may show an error (that's OK) — copy the 'code' parameter from the URL.\n");
  console.log("Then run:");
  console.log(`  FRAMEIO_CLIENT_SECRET='${CLIENT_SECRET}' node setup.js exchange <CODE>\n`);

  // Try to open browser
  try {
    const platform = process.platform;
    if (platform === "darwin") execSync(`open "${authUrl}"`);
    else if (platform === "linux") execSync(`xdg-open "${authUrl}"`);
    else if (platform === "win32") execSync(`start "${authUrl}"`);
  } catch {
    // Browser open failed, user can use the printed URL
  }
}

// Exchange auth code for tokens
if (mode === "exchange" && process.argv[3]) {
  await exchangeCode(process.argv[3]);
}

async function exchangeCode(code) {
  console.log("Exchanging authorization code for tokens...");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Token exchange failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    created_at: Date.now(),
  };

  writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log(`\nTokens saved to ${TOKEN_FILE}`);
  console.log(`Access token expires in ${Math.round(data.expires_in / 3600)} hours`);

  // Quick test
  console.log("\nTesting token against Frame.io API...");
  await testToken(data.access_token);
}

async function refreshToken() {
  if (!existsSync(TOKEN_FILE)) {
    console.error("No token file found. Run setup.js first (without arguments).");
    process.exit(1);
  }

  const tokens = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
  if (!tokens.refresh_token) {
    console.error("No refresh token found. Re-run OAuth flow.");
    process.exit(1);
  }

  console.log("Refreshing access token...");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Token refresh failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_in: data.expires_in,
    created_at: Date.now(),
  };

  writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log("Token refreshed and saved.");
}

async function testToken(token) {
  // Try V4 API first
  try {
    const res = await fetch("https://api.frame.io/v4/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      console.log("V4 API works! Accounts:", JSON.stringify(data, null, 2).slice(0, 200));
      return;
    }
    console.log(`V4 API returned ${res.status}, trying V2...`);
  } catch (e) {
    console.log("V4 API failed, trying V2...");
  }

  // Try V2 API
  try {
    const res = await fetch("https://api.frame.io/v2/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`V2 API works! User: ${data.name} (${data.email})`);
      return;
    }
    console.log(`V2 API returned ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.log("V2 API also failed:", e.message);
  }

  console.log("\nIf both fail with 401, your Frame.io account may not be linked to this Adobe ID.");
}
