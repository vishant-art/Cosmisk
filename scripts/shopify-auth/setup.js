#!/usr/bin/env node

/**
 * Shopify OAuth Setup
 *
 * Gets a permanent offline access token via browser authorization.
 * Shopify offline tokens never expire — no refresh needed.
 *
 * Usage:
 *   node setup.js --shop pratap-sons-international
 *   node setup.js --shop pratap-sons-international --client-id XXX --client-secret YYY
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, ".shopify-token.json");

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const SHOP = getArg("shop") || process.env.SHOPIFY_SHOP;
const CLIENT_ID = getArg("client-id") || process.env.SHOPIFY_CLIENT_ID || "e0e533d947468ccbb8c680361f9b8d38";
const CLIENT_SECRET = getArg("client-secret") || process.env.SHOPIFY_CLIENT_SECRET || "";
const SCOPES = "read_orders,read_all_orders,read_products,read_customers,read_analytics,read_inventory";
const REDIRECT_URI = "http://localhost:8080/callback";
const PORT = 8080;

if (!SHOP) {
  console.error("Usage: node setup.js --shop <store-name>");
  console.error("Example: node setup.js --shop pratap-sons-international");
  process.exit(1);
}

if (!CLIENT_SECRET) {
  console.error("Set --client-secret or SHOPIFY_CLIENT_SECRET environment variable.");
  console.error("Find it at: https://partners.shopify.com → Apps → Pratap Ind → Client credentials");
  process.exit(1);
}

const mode = args.includes("test") ? "test" : "auth";

if (mode === "test") {
  await testToken();
} else {
  await startAuth();
}

async function startAuth() {
  // Generate a random nonce for CSRF protection
  const nonce = Math.random().toString(36).substring(2, 15);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: nonce,
  });

  const authUrl = `https://${SHOP}.myshopify.com/admin/oauth/authorize?${params}`;

  console.log("\n=== Shopify OAuth Setup ===\n");
  console.log(`Shop: ${SHOP}.myshopify.com`);
  console.log(`Scopes: ${SCOPES}\n`);

  // Start local server to catch the callback
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const hmac = url.searchParams.get("hmac");

      if (state !== nonce) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>State mismatch — possible CSRF. Try again.</h1>");
        server.close();
        process.exit(1);
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>No authorization code received.</h1>");
        server.close();
        process.exit(1);
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Authorizing... check your terminal.</h1><script>setTimeout(()=>window.close(),2000)</script>");

      await exchangeCode(code);
      server.close();
      process.exit(0);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(PORT, () => {
    console.log(`Callback server listening on http://localhost:${PORT}\n`);
    console.log("Opening browser for authorization...\n");

    // Open browser
    try {
      if (process.platform === "darwin") execSync(`open "${authUrl}"`);
      else if (process.platform === "linux") execSync(`xdg-open "${authUrl}"`);
      else if (process.platform === "win32") execSync(`start "${authUrl}"`);
    } catch {
      // Browser open failed
    }

    console.log("If browser didn't open, visit:\n");
    console.log(authUrl);
    console.log("\nWaiting for callback...\n");
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.error("\nTimed out waiting for authorization callback.");
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000);
}

async function exchangeCode(code) {
  console.log("Exchanging authorization code for access token...");

  const res = await fetch(
    `https://${SHOP}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    console.error("Token exchange failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const tokenData = {
    shop: `${SHOP}.myshopify.com`,
    access_token: data.access_token,
    scope: data.scope,
    created_at: new Date().toISOString(),
    note: "Shopify offline tokens are permanent — no expiry, no refresh needed.",
  };

  writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log(`\nAccess token saved to ${TOKEN_FILE}`);
  console.log(`Scope: ${data.scope}`);

  // Test the token
  await verifyToken(data.access_token);
}

async function verifyToken(token) {
  console.log("\nVerifying token against Shopify API...");

  const res = await fetch(
    `https://${SHOP}.myshopify.com/admin/api/2024-10/shop.json`,
    {
      headers: { "X-Shopify-Access-Token": token },
    }
  );

  if (res.ok) {
    const { shop } = await res.json();
    console.log(`Connected to: ${shop.name} (${shop.myshopify_domain})`);
    console.log(`Plan: ${shop.plan_name}`);
    console.log(`Currency: ${shop.currency}`);

    // Quick order count
    const ordersRes = await fetch(
      `https://${SHOP}.myshopify.com/admin/api/2024-10/orders/count.json?status=any`,
      { headers: { "X-Shopify-Access-Token": token } }
    );
    if (ordersRes.ok) {
      const { count } = await ordersRes.json();
      console.log(`Total orders: ${count}`);
    }

    console.log("\nShopify connection is working!");
    console.log("\nNext steps:");
    console.log("1. Update your MCP config with the access token");
    console.log(`2. Token: ${token.substring(0, 10)}...${token.substring(token.length - 4)}`);
  } else {
    console.error(`API test failed (${res.status}):`, await res.text());
  }
}

async function testToken() {
  if (!existsSync(TOKEN_FILE)) {
    console.error("No token file found. Run setup.js first.");
    process.exit(1);
  }

  const { access_token, shop } = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
  console.log(`Testing token for ${shop}...`);
  await verifyToken(access_token);
}
