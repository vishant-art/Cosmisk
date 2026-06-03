/**
 * Shopify Routes — OAuth and data endpoints
 *
 * OAuth flow:
 * 1. GET /shopify/install?shop=mystore.myshopify.com — Redirects to Shopify OAuth
 * 2. GET /shopify/callback — Handles OAuth callback, stores token
 * 3. GET /shopify/status — Check connection status
 * 4. DELETE /shopify/disconnect — Remove connection
 *
 * Data endpoints:
 * 5. GET /shopify/products — Get products with inventory
 * 6. GET /shopify/oos — Get out-of-stock products
 * 7. GET /shopify/orders — Get recent orders
 * 8. GET /shopify/summary — Get full shop summary
 *
 * BLOCKED: OAuth flow requires auth security fix (see docs/ROADMAP_COMING_SOON.md)
 * Once fixed, add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to config
 */

import type { FastifyInstance } from 'fastify';
import { getDbAdapter } from '../db/adapter.js';
import { encryptToken, decryptToken } from '../utils/encryption.js';
import { ShopifyClient, getShopifyClientForUser, hasShopifyConnected } from '../services/shopify-client.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// Shopify OAuth config (add to config.ts when ready)
const SHOPIFY_SCOPES = [
  'read_products',
  'read_orders',
  'read_customers',
  'read_inventory',
  'read_checkouts',
].join(',');

interface ShopifyTokenRow {
  user_id: string;
  encrypted_access_token: string;
  shop_domain: string;
  shop_name: string | null;
  created_at: string;
}

export async function shopifyRoutes(app: FastifyInstance) {
  // ============ OAuth Flow ============

  // GET /shopify/install — Start OAuth flow
  app.get('/install', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { shop } = request.query as { shop?: string };

    if (!shop) {
      return reply.status(400).send({
        success: false,
        error: 'Missing shop parameter. Use ?shop=mystore.myshopify.com',
      });
    }

    // Validate shop domain
    const cleanShop = shop.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    if (!cleanShop.includes('.myshopify.com')) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid shop domain. Must be yourstore.myshopify.com',
      });
    }

    // Check if Shopify OAuth is configured
    const shopifyApiKey = config.shopifyApiKey;
    const shopifyApiSecret = config.shopifyApiSecret;

    if (!shopifyApiKey || !shopifyApiSecret) {
      return reply.status(503).send({
        success: false,
        error: 'Shopify integration not configured. Contact support.',
        code: 'SHOPIFY_NOT_CONFIGURED',
      });
    }

    // Generate state token to prevent CSRF
    const state = Buffer.from(JSON.stringify({
      userId: request.user.id,
      shop: cleanShop,
      timestamp: Date.now(),
    })).toString('base64');

    const redirectUri = `${config.appUrl}/api/shopify/callback`;

    const installUrl = `https://${cleanShop}/admin/oauth/authorize?` +
      `client_id=${shopifyApiKey}&` +
      `scope=${SHOPIFY_SCOPES}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    return { success: true, installUrl };
  });

  // GET /shopify/callback — Handle OAuth callback
  app.get('/callback', async (request, reply) => {
    const { code, shop, state, hmac } = request.query as {
      code?: string;
      shop?: string;
      state?: string;
      hmac?: string;
    };

    if (!code || !shop || !state) {
      return reply.status(400).send({
        success: false,
        error: 'Missing OAuth parameters',
      });
    }

    // Decode state
    let stateData: { userId: string; shop: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return reply.status(400).send({ success: false, error: 'Invalid state parameter' });
    }

    // Verify state isn't too old (15 min max)
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return reply.status(400).send({ success: false, error: 'OAuth session expired' });
    }

    // Verify shop matches
    const cleanShop = shop.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    if (cleanShop !== stateData.shop) {
      return reply.status(400).send({ success: false, error: 'Shop mismatch' });
    }

    const shopifyApiKey = config.shopifyApiKey;
    const shopifyApiSecret = config.shopifyApiSecret;

    // TODO: Verify HMAC signature for security
    // This is BLOCKED until auth security fix lands

    // Exchange code for access token
    try {
      const tokenUrl = `https://${cleanShop}/admin/oauth/access_token`;
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: shopifyApiKey,
          client_secret: shopifyApiSecret,
          code,
        }),
      });

      if (!resp.ok) {
        const error = await resp.text();
        logger.error({ status: resp.status, error }, '[Shopify] Token exchange failed');
        return reply.status(400).send({ success: false, error: 'Failed to get access token' });
      }

      const data = await resp.json() as { access_token: string; scope: string };

      // Validate token
      const client = new ShopifyClient(cleanShop, data.access_token);
      const shopInfo = await client.getShopInfo();

      // Store encrypted token
      const encryptedToken = encryptToken(data.access_token);

      await getDbAdapter().run(`
        INSERT INTO shopify_tokens (user_id, encrypted_access_token, shop_domain, shop_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          encrypted_access_token = excluded.encrypted_access_token,
          shop_domain = excluded.shop_domain,
          shop_name = excluded.shop_name,
          created_at = datetime('now')
      `, [stateData.userId, encryptedToken, cleanShop, shopInfo.name]);

      logger.info(`[Shopify] Connected ${cleanShop} for user ${stateData.userId}`);

      // Redirect to frontend success page
      return reply.redirect(`${config.appUrl}/settings/integrations?shopify=connected`);
    } catch (err: any) {
      logger.error({ err: err.message }, '[Shopify] OAuth callback failed');
      return reply.redirect(`${config.appUrl}/settings/integrations?shopify=error`);
    }
  });

  // GET /shopify/status — Check connection status
  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const row = await getDbAdapter().get<Partial<ShopifyTokenRow>>(
      'SELECT shop_domain, shop_name, created_at FROM shopify_tokens WHERE user_id = ?',
      [request.user.id]
    );

    if (!row) {
      return {
        success: true,
        connected: false,
      };
    }

    // Validate token still works
    const client = await getShopifyClientForUser(request.user.id);
    const isValid = client ? await client.validateAccess() : false;

    return {
      success: true,
      connected: isValid,
      shop: {
        domain: row.shop_domain,
        name: row.shop_name,
        connectedAt: row.created_at,
      },
      needsReconnect: !isValid,
    };
  });

  // DELETE /shopify/disconnect — Remove connection
  app.delete('/disconnect', { preHandler: [app.authenticate] }, async (request) => {
    const result = await getDbAdapter().run('DELETE FROM shopify_tokens WHERE user_id = ?', [request.user.id]);

    if (result.changes === 0) {
      return { success: true, message: 'No Shopify connection found' };
    }

    logger.info(`[Shopify] Disconnected for user ${request.user.id}`);
    return { success: true, message: 'Shopify disconnected' };
  });

  // ============ Data Endpoints ============

  // GET /shopify/products — Get products with inventory
  app.get('/products', { preHandler: [app.authenticate] }, async (request, reply) => {
    const client = await getShopifyClientForUser(request.user.id);

    if (!client) {
      return reply.status(400).send({
        success: false,
        error: 'Shopify not connected',
        code: 'SHOPIFY_NOT_CONNECTED',
      });
    }

    try {
      const products = await client.getProducts();
      return {
        success: true,
        products,
        count: products.length,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, '[Shopify] Failed to fetch products');
      return reply.status(500).send({ success: false, error: 'Failed to fetch products' });
    }
  });

  // GET /shopify/oos — Get out-of-stock products
  app.get('/oos', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { lowStock } = request.query as { lowStock?: string };
    const client = await getShopifyClientForUser(request.user.id);

    if (!client) {
      return reply.status(400).send({
        success: false,
        error: 'Shopify not connected',
        code: 'SHOPIFY_NOT_CONNECTED',
      });
    }

    try {
      const oosProducts = await client.getOOSProducts();
      const lowStockProducts = lowStock === 'true' ? await client.getLowStockProducts() : [];

      return {
        success: true,
        oosProducts,
        oosCount: oosProducts.length,
        lowStockProducts,
        lowStockCount: lowStockProducts.length,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, '[Shopify] Failed to fetch OOS products');
      return reply.status(500).send({ success: false, error: 'Failed to fetch OOS products' });
    }
  });

  // GET /shopify/orders — Get recent orders
  app.get('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { months } = request.query as { months?: string };
    const client = await getShopifyClientForUser(request.user.id);

    if (!client) {
      return reply.status(400).send({
        success: false,
        error: 'Shopify not connected',
        code: 'SHOPIFY_NOT_CONNECTED',
      });
    }

    try {
      const orderMonths = parseInt(months || '3', 10);
      const orders = await client.getOrders(orderMonths);
      return {
        success: true,
        orders,
        count: orders.length,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, '[Shopify] Failed to fetch orders');
      return reply.status(500).send({ success: false, error: 'Failed to fetch orders' });
    }
  });

  // GET /shopify/summary — Get full shop summary
  app.get('/summary', { preHandler: [app.authenticate] }, async (request, reply) => {
    const client = await getShopifyClientForUser(request.user.id);

    if (!client) {
      return reply.status(400).send({
        success: false,
        error: 'Shopify not connected',
        code: 'SHOPIFY_NOT_CONNECTED',
      });
    }

    try {
      const data = await client.pullAll();
      return {
        success: true,
        summary: data.summary,
        monthlyCounts: data.monthlyCounts,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, '[Shopify] Failed to fetch summary');
      return reply.status(500).send({ success: false, error: 'Failed to fetch summary' });
    }
  });

  // GET /shopify/abandoned-checkouts — Get abandoned checkouts
  app.get('/abandoned-checkouts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { months } = request.query as { months?: string };
    const client = await getShopifyClientForUser(request.user.id);

    if (!client) {
      return reply.status(400).send({
        success: false,
        error: 'Shopify not connected',
        code: 'SHOPIFY_NOT_CONNECTED',
      });
    }

    try {
      const checkoutMonths = parseInt(months || '3', 10);
      const checkouts = await client.getAbandonedCheckouts(checkoutMonths);

      // Calculate abandoned cart value
      const totalAbandonedValue = checkouts.reduce((sum, c) => sum + c.total, 0);

      return {
        success: true,
        checkouts,
        count: checkouts.length,
        totalAbandonedValue,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, '[Shopify] Failed to fetch abandoned checkouts');
      return reply.status(500).send({ success: false, error: 'Failed to fetch checkouts' });
    }
  });
}
