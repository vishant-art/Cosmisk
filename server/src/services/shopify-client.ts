/**
 * Shopify Client — Comprehensive Shopify Admin API integration
 *
 * Ported from Agency-automation-smashed/services/lib/shopify-pull.mjs
 * with TypeScript types and Cosmisk integration.
 *
 * Features:
 * - Token validation
 * - Products with inventory data
 * - Orders with line items, refunds, discounts
 * - Customers with lifetime value
 * - Abandoned checkouts
 * - Proper pagination with Link headers
 * - Rate limit handling
 */

import { logger } from '../utils/logger.js';

const API_VERSION = '2024-10';

// ============ TYPES ============

export interface ShopInfo {
  id: string;
  name: string;
  email: string;
  domain: string;
  currency: string;
  timezone: string;
  plan: string;
  country: string;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  inventoryQuantity: number;
  inventoryPolicy: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  type: string;
  tags: string;
  status: string;
  created: string;
  variants: ProductVariant[];
  imageUrl: string | null;
  variantCount: number;
  totalInventory: number;
  minPrice: number;
  maxPrice: number;
  anyOOS: boolean;
  allOOS: boolean;
}

export interface OrderLineItem {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  price: number;
}

export interface DiscountCode {
  code: string;
  amount: number;
  type: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  date: string;
  total: number;
  subtotal: number;
  discounts: number;
  tax: number;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  cancelled: boolean;
  gateway: string;
  discountCodes: DiscountCode[];
  customerId: string | null;
  customerEmail: string | null;
  customerOrdersCount: number;
  customerTotalSpent: number;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingCountry: string | null;
  shippingZip: string | null;
  lineItems: OrderLineItem[];
  refundAmount: number;
  hasRefund: boolean;
  itemCount: number;
  tags: string;
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  name: string;
  ordersCount: number;
  totalSpent: number;
  created: string;
  lastUpdated: string;
  tags: string;
  city: string | null;
  province: string | null;
  country: string | null;
}

export interface AbandonedCheckout {
  id: string;
  createdAt: string;
  completedAt: string | null;
  total: number;
  currency: string;
  email: string | null;
  customerId: string | null;
  abandonedUrl: string | null;
  lineItems: Array<{
    productId: string;
    variantId: string;
    title: string;
    quantity: number;
    price: number;
  }>;
  itemCount: number;
}

export interface MonthlyOrderCount {
  month: string;
  orders: number;
}

export interface ShopifySummary {
  shop: string;
  currency: string;
  plan: string;
  totalProducts: number;
  oosProducts: number;
  oosRate: number;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  refundRate: number;
  customerCount: number;
  repeatCustomers: number;
  repeatRate: number;
  abandonedCheckouts: number;
}

export interface ShopifyFullPull {
  summary: ShopifySummary;
  products: ShopifyProduct[];
  orders: ShopifyOrder[];
  customers: ShopifyCustomer[];
  abandonedCheckouts: AbandonedCheckout[];
  monthlyCounts: MonthlyOrderCount[];
}

// ============ HELPERS ============

async function shopifyGet<T>(
  store: string,
  token: string,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`https://${store}/admin/api/${API_VERSION}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
  }

  // Rate limiting
  const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
  if (callLimit) {
    const [used, max] = callLimit.split('/').map(Number);
    if (used >= max - 2) {
      logger.debug(`[Shopify] Rate limit close (${used}/${max}), waiting 1s`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return res.json();
}

interface PaginatedResponse<T> {
  body: T;
  headers: Headers;
}

async function shopifyGetWithHeaders<T>(
  store: string,
  token: string,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<PaginatedResponse<T>> {
  const url = new URL(`https://${store}/admin/api/${API_VERSION}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
  }

  // Rate limiting
  const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
  if (callLimit) {
    const [used, max] = callLimit.split('/').map(Number);
    if (used >= max - 2) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { body: await res.json(), headers: res.headers };
}

async function shopifyGetAllPages<T>(
  store: string,
  token: string,
  endpoint: string,
  rootKey: string,
  params: Record<string, string> = {},
  maxPages = 80
): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = null;
  let page = 0;

  while (page < maxPages) {
    page++;
    let res: PaginatedResponse<any>;

    if (page === 1) {
      res = await shopifyGetWithHeaders<any>(store, token, endpoint, { ...params, limit: '250' });
    } else {
      const fetchRes = await fetch(nextUrl!, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(60000),
      });
      if (!fetchRes.ok) break;

      const callLimit = fetchRes.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (callLimit) {
        const [used, max] = callLimit.split('/').map(Number);
        if (used >= max - 2) await new Promise(r => setTimeout(r, 1000));
      }

      res = { body: await fetchRes.json(), headers: fetchRes.headers };
    }

    const items = res.body[rootKey] || [];
    all.push(...items);

    if (page % 10 === 0) {
      logger.debug(`[Shopify] ...${all.length} ${rootKey} so far (page ${page})`);
    }

    if (items.length < 250) break;

    // Parse Link header for next page URL
    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (!nextMatch) break;
    nextUrl = nextMatch[1];
  }

  return all;
}

// ============ SHOPIFY CLIENT CLASS ============

export class ShopifyClient {
  private store: string;
  private token: string;

  constructor(store: string, token: string) {
    this.store = store.replace('https://', '').replace(/\/$/, '');
    this.token = token;
  }

  /** Quick token validation — returns true if Shopify access works */
  async validateAccess(timeoutMs = 10000): Promise<boolean> {
    try {
      const url = new URL(`https://${this.store}/admin/api/${API_VERSION}/shop.json`);
      const res = await fetch(url.toString(), {
        headers: {
          'X-Shopify-Access-Token': this.token,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Pull shop info */
  async getShopInfo(): Promise<ShopInfo> {
    const res = await shopifyGet<{ shop: any }>(this.store, this.token, '/shop.json');
    const shop = res.shop;
    return {
      id: String(shop.id),
      name: shop.name,
      email: shop.email,
      domain: shop.domain,
      currency: shop.currency,
      timezone: shop.iana_timezone,
      plan: shop.plan_name,
      country: shop.country_name,
    };
  }

  /** Pull all products with variants and inventory */
  async getProducts(maxPages = 80): Promise<ShopifyProduct[]> {
    logger.info('[Shopify] Pulling products...');

    const products = await shopifyGetAllPages<any>(
      this.store,
      this.token,
      '/products.json',
      'products',
      { fields: 'id,title,handle,product_type,tags,status,variants,images,created_at,updated_at' },
      maxPages
    );

    return products.map(p => ({
      id: String(p.id),
      title: p.title,
      handle: p.handle,
      type: p.product_type,
      tags: p.tags,
      status: p.status,
      created: p.created_at,
      variants: (p.variants || []).map((v: any) => ({
        id: String(v.id),
        title: v.title,
        sku: v.sku || '',
        price: parseFloat(v.price || '0'),
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        inventoryQuantity: v.inventory_quantity || 0,
        inventoryPolicy: v.inventory_policy || 'deny',
      })),
      imageUrl: p.images?.[0]?.src || null,
      variantCount: p.variants?.length || 0,
      totalInventory: (p.variants || []).reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0),
      minPrice: Math.min(...(p.variants || [{ price: '0' }]).map((v: any) => parseFloat(v.price || '0'))),
      maxPrice: Math.max(...(p.variants || [{ price: '0' }]).map((v: any) => parseFloat(v.price || '0'))),
      anyOOS: (p.variants || []).some((v: any) => v.inventory_quantity <= 0),
      allOOS: (p.variants || []).every((v: any) => v.inventory_quantity <= 0),
    }));
  }

  /** Pull orders with line items, customer, shipping, discounts, refunds */
  async getOrders(months = 12, maxPages = 80): Promise<ShopifyOrder[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    logger.info(`[Shopify] Pulling orders since ${since.toISOString().split('T')[0]}...`);

    const orders = await shopifyGetAllPages<any>(
      this.store,
      this.token,
      '/orders.json',
      'orders',
      {
        status: 'any',
        created_at_min: since.toISOString(),
        fields: 'id,name,created_at,total_price,subtotal_price,total_discounts,total_tax,currency,financial_status,fulfillment_status,line_items,customer,shipping_address,discount_codes,refunds,gateway,cancelled_at,tags',
      },
      maxPages
    );

    return orders.map(o => ({
      id: String(o.id),
      name: o.name,
      date: o.created_at,
      total: parseFloat(o.total_price || '0'),
      subtotal: parseFloat(o.subtotal_price || '0'),
      discounts: parseFloat(o.total_discounts || '0'),
      tax: parseFloat(o.total_tax || '0'),
      currency: o.currency,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status,
      cancelled: !!o.cancelled_at,
      gateway: o.gateway || '',
      discountCodes: (o.discount_codes || []).map((d: any) => ({
        code: d.code,
        amount: parseFloat(d.amount || '0'),
        type: d.type,
      })),
      customerId: o.customer?.id ? String(o.customer.id) : null,
      customerEmail: o.customer?.email || null,
      customerOrdersCount: o.customer?.orders_count || 0,
      customerTotalSpent: parseFloat(o.customer?.total_spent || '0'),
      shippingCity: o.shipping_address?.city || null,
      shippingProvince: o.shipping_address?.province || null,
      shippingCountry: o.shipping_address?.country || null,
      shippingZip: o.shipping_address?.zip || null,
      lineItems: (o.line_items || []).map((li: any) => ({
        productId: String(li.product_id),
        variantId: String(li.variant_id),
        title: li.title,
        variantTitle: li.variant_title || '',
        sku: li.sku || '',
        quantity: li.quantity,
        price: parseFloat(li.price || '0'),
      })),
      refundAmount: (o.refunds || []).reduce((sum: number, r: any) =>
        sum + (r.transactions || []).reduce((s: number, t: any) => s + parseFloat(t.amount || '0'), 0), 0),
      hasRefund: (o.refunds || []).length > 0,
      itemCount: (o.line_items || []).reduce((sum: number, li: any) => sum + li.quantity, 0),
      tags: o.tags || '',
    }));
  }

  /** Pull customers */
  async getCustomers(maxPages = 80): Promise<ShopifyCustomer[]> {
    logger.info('[Shopify] Pulling customers...');

    const customers = await shopifyGetAllPages<any>(
      this.store,
      this.token,
      '/customers.json',
      'customers',
      { fields: 'id,email,first_name,last_name,orders_count,total_spent,created_at,updated_at,tags,default_address' },
      maxPages
    );

    return customers.map(c => ({
      id: String(c.id),
      email: c.email || '',
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      ordersCount: c.orders_count || 0,
      totalSpent: parseFloat(c.total_spent || '0'),
      created: c.created_at,
      lastUpdated: c.updated_at,
      tags: c.tags || '',
      city: c.default_address?.city || null,
      province: c.default_address?.province || null,
      country: c.default_address?.country || null,
    }));
  }

  /** Pull abandoned checkouts */
  async getAbandonedCheckouts(months = 3): Promise<AbandonedCheckout[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    logger.info('[Shopify] Pulling abandoned checkouts...');

    const checkouts = await shopifyGetAllPages<any>(
      this.store,
      this.token,
      '/checkouts.json',
      'checkouts',
      { created_at_min: since.toISOString() }
    );

    return checkouts.map(c => ({
      id: String(c.id),
      createdAt: c.created_at,
      completedAt: c.completed_at || null,
      total: parseFloat(c.total_price || '0'),
      currency: c.currency,
      email: c.email || null,
      customerId: c.customer?.id ? String(c.customer.id) : null,
      abandonedUrl: c.abandoned_checkout_url || null,
      lineItems: (c.line_items || []).map((li: any) => ({
        productId: String(li.product_id),
        variantId: String(li.variant_id),
        title: li.title,
        quantity: li.quantity,
        price: parseFloat(li.price || '0'),
      })),
      itemCount: (c.line_items || []).reduce((sum: number, li: any) => sum + li.quantity, 0),
    }));
  }

  /** Pull order count by month (fast — uses count endpoint) */
  async getOrderCountsByMonth(months = 12): Promise<MonthlyOrderCount[]> {
    const counts: MonthlyOrderCount[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const res = await shopifyGet<{ count: number }>(this.store, this.token, '/orders/count.json', {
        status: 'any',
        created_at_min: start.toISOString(),
        created_at_max: end.toISOString(),
      });

      counts.unshift({
        month: start.toISOString().slice(0, 7),
        orders: res.count || 0,
      });
    }

    return counts;
  }

  /** Get OOS products (all variants out of stock) */
  async getOOSProducts(): Promise<ShopifyProduct[]> {
    const products = await this.getProducts();
    return products.filter(p => p.allOOS);
  }

  /** Get low stock products (any variant < threshold) */
  async getLowStockProducts(threshold = 5): Promise<ShopifyProduct[]> {
    const products = await this.getProducts();
    return products.filter(p =>
      p.variants.some(v => v.inventoryQuantity > 0 && v.inventoryQuantity < threshold)
    );
  }

  /** Full pull — everything for services */
  async pullAll(orderMonths = 12, checkoutMonths = 3): Promise<ShopifyFullPull> {
    logger.info(`[Shopify] Pulling all data for ${this.store}...`);

    const shopInfo = await this.getShopInfo();
    logger.info(`[Shopify] Shop: ${shopInfo.name} (${shopInfo.plan})`);

    const [products, orders, customers, abandonedCheckouts, monthlyCounts] = await Promise.all([
      this.getProducts().then(r => { logger.info(`[Shopify] Products: ${r.length}`); return r; }),
      this.getOrders(orderMonths).then(r => { logger.info(`[Shopify] Orders: ${r.length}`); return r; }),
      this.getCustomers().then(r => { logger.info(`[Shopify] Customers: ${r.length}`); return r; }),
      this.getAbandonedCheckouts(checkoutMonths).then(r => { logger.info(`[Shopify] Abandoned: ${r.length}`); return r; }),
      this.getOrderCountsByMonth(orderMonths).then(r => { logger.info(`[Shopify] Monthly counts: ${r.length}`); return r; }),
    ]);

    // Compute summary stats
    const totalRevenue = orders.filter(o => !o.cancelled).reduce((s, o) => s + o.total, 0);
    const totalOrders = orders.filter(o => !o.cancelled).length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const refundedOrders = orders.filter(o => o.hasRefund);
    const refundRate = totalOrders > 0 ? refundedOrders.length / totalOrders : 0;
    const oosProducts = products.filter(p => p.allOOS).length;
    const totalProducts = products.length;

    const summary: ShopifySummary = {
      shop: shopInfo.name,
      currency: shopInfo.currency,
      plan: shopInfo.plan,
      totalProducts,
      oosProducts,
      oosRate: totalProducts > 0 ? oosProducts / totalProducts : 0,
      totalOrders,
      totalRevenue,
      avgOrderValue,
      refundRate,
      customerCount: customers.length,
      repeatCustomers: customers.filter(c => c.ordersCount > 1).length,
      repeatRate: customers.length > 0 ? customers.filter(c => c.ordersCount > 1).length / customers.length : 0,
      abandonedCheckouts: abandonedCheckouts.length,
    };

    return { summary, products, orders, customers, abandonedCheckouts, monthlyCounts };
  }
}

// ============ HELPER: Get client from stored token ============

import { getDb } from '../db/index.js';
import { decryptToken } from '../utils/encryption.js';

interface ShopifyTokenRow {
  user_id: string;
  encrypted_access_token: string;
  shop_domain: string;
  shop_name: string | null;
}

/**
 * Get Shopify client for a user from stored OAuth token
 */
export function getShopifyClientForUser(userId: string): ShopifyClient | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM shopify_tokens WHERE user_id = ?').get(userId) as ShopifyTokenRow | undefined;

  if (!row) return null;

  const token = decryptToken(row.encrypted_access_token);
  return new ShopifyClient(row.shop_domain, token);
}

/**
 * Check if user has Shopify connected
 */
export function hasShopifyConnected(userId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT user_id FROM shopify_tokens WHERE user_id = ?').get(userId);
  return !!row;
}
