/**
 * Shopify Data Ingestion - Fetches data from Shopify Admin API
 */

import type { ShopifySnapshot, ProductPerformance, AuditConfig } from './types.js';

const API_VERSION = '2024-01';

// OOS Detection Types
export interface OOSProduct {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  inventoryQuantity: number;
  handle: string;
  productUrl: string;
}

export interface InventorySnapshot {
  capturedAt: string;
  shopDomain: string;
  totalProducts: number;
  totalVariants: number;
  oosProducts: OOSProduct[];
  lowStockProducts: OOSProduct[]; // inventory < 5
}

interface ShopifyIngestionOptions {
  shopDomain: string;
  accessToken: string;
  datePreset: AuditConfig['datePreset'];
}

/**
 * Fetch complete Shopify snapshot for audit
 */
export async function fetchShopifySnapshot(options: ShopifyIngestionOptions): Promise<ShopifySnapshot> {
  const { shopDomain, accessToken, datePreset } = options;
  const dateRange = getDateRange(datePreset);

  const baseUrl = `https://${shopDomain}/admin/api/${API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  // Fetch in parallel
  const [ordersData, productsData] = await Promise.all([
    fetchOrders(baseUrl, headers, dateRange),
    fetchTopProducts(baseUrl, headers, dateRange),
  ]);

  // Calculate metrics
  const totalRevenue = ordersData.orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
  const totalOrders = ordersData.orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Customer metrics
  const customerIds = new Set<string>();
  const newCustomerIds = new Set<string>();
  const returningCustomerIds = new Set<string>();

  for (const order of ordersData.orders) {
    if (order.customer?.id) {
      const customerId = String(order.customer.id);
      if (customerIds.has(customerId)) {
        returningCustomerIds.add(customerId);
      } else {
        if (order.customer.orders_count <= 1) {
          newCustomerIds.add(customerId);
        } else {
          returningCustomerIds.add(customerId);
        }
      }
      customerIds.add(customerId);
    }
  }

  const newCustomers = newCustomerIds.size;
  const returningCustomers = returningCustomerIds.size;
  const repeatPurchaseRate = customerIds.size > 0
    ? (returningCustomers / customerIds.size) * 100
    : 0;

  return {
    capturedAt: new Date().toISOString(),
    dateRange,
    shopDomain,
    totalRevenue,
    totalOrders,
    averageOrderValue,
    newCustomers,
    returningCustomers,
    repeatPurchaseRate,
    topProducts: productsData,
    cartAbandonmentRate: null, // Requires additional API calls
    checkoutAbandonmentRate: null,
  };
}

/**
 * Fetch orders within date range
 */
async function fetchOrders(
  baseUrl: string,
  headers: Record<string, string>,
  dateRange: { start: string; end: string }
): Promise<{ orders: any[] }> {
  const url = `${baseUrl}/orders.json?` +
    `status=any&` +
    `created_at_min=${dateRange.start}T00:00:00Z&` +
    `created_at_max=${dateRange.end}T23:59:59Z&` +
    `limit=250`;

  const resp = await fetch(url, { headers });
  const data = await resp.json();

  if (data.errors) {
    throw new Error(`Shopify API Error: ${JSON.stringify(data.errors)}`);
  }

  return { orders: data.orders || [] };
}

/**
 * Fetch top products by revenue
 */
async function fetchTopProducts(
  baseUrl: string,
  headers: Record<string, string>,
  dateRange: { start: string; end: string }
): Promise<ProductPerformance[]> {
  // First get orders with line items
  const ordersUrl = `${baseUrl}/orders.json?` +
    `status=any&` +
    `created_at_min=${dateRange.start}T00:00:00Z&` +
    `created_at_max=${dateRange.end}T23:59:59Z&` +
    `fields=id,line_items&` +
    `limit=250`;

  const resp = await fetch(ordersUrl, { headers });
  const data = await resp.json();

  if (data.errors) {
    return [];
  }

  // Aggregate by product
  const productMap = new Map<string, {
    productId: string;
    title: string;
    revenue: number;
    unitsSold: number;
    prices: number[];
    variants: Set<string>;
  }>();

  for (const order of data.orders || []) {
    for (const item of order.line_items || []) {
      const productId = String(item.product_id);
      const existing = productMap.get(productId);

      if (existing) {
        existing.revenue += parseFloat(item.price || '0') * (item.quantity || 1);
        existing.unitsSold += item.quantity || 1;
        existing.prices.push(parseFloat(item.price || '0'));
        if (item.variant_id) existing.variants.add(String(item.variant_id));
      } else {
        productMap.set(productId, {
          productId,
          title: item.title || 'Unknown',
          revenue: parseFloat(item.price || '0') * (item.quantity || 1),
          unitsSold: item.quantity || 1,
          prices: [parseFloat(item.price || '0')],
          variants: new Set(item.variant_id ? [String(item.variant_id)] : []),
        });
      }
    }
  }

  // Sort by revenue and return top 10
  return Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(p => ({
      productId: p.productId,
      title: p.title,
      revenue: p.revenue,
      unitsSold: p.unitsSold,
      averagePrice: p.prices.length > 0
        ? p.prices.reduce((a, b) => a + b, 0) / p.prices.length
        : 0,
      variantCount: p.variants.size,
    }));
}

// ============ OOS DETECTION ============

interface FetchInventoryOptions {
  shopDomain: string;
  accessToken: string;
  lowStockThreshold?: number; // default 5
}

/**
 * Fetch all products and identify OOS/low stock items
 * Ported from Agency-automation-smashed ShopifyPull
 */
export async function fetchInventorySnapshot(options: FetchInventoryOptions): Promise<InventorySnapshot> {
  const { shopDomain, accessToken, lowStockThreshold = 5 } = options;

  const baseUrl = `https://${shopDomain}/admin/api/${API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  const oosProducts: OOSProduct[] = [];
  const lowStockProducts: OOSProduct[] = [];
  let totalProducts = 0;
  let totalVariants = 0;

  let pageInfo: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const url: string = pageInfo
      ? `${baseUrl}/products.json?limit=250&page_info=${pageInfo}`
      : `${baseUrl}/products.json?limit=250`;

    const resp: Response = await fetch(url, { headers });

    if (!resp.ok) {
      throw new Error(`Shopify API Error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as { products?: any[] };
    const products = data.products || [];

    for (const product of products) {
      totalProducts++;
      const variants = product.variants || [];

      for (const variant of variants) {
        totalVariants++;
        const qty = variant.inventory_quantity ?? 0;

        const oosItem: OOSProduct = {
          productId: String(product.id),
          variantId: String(variant.id),
          title: product.title || 'Unknown',
          variantTitle: variant.title || 'Default',
          sku: variant.sku || '',
          inventoryQuantity: qty,
          handle: product.handle || '',
          productUrl: `https://${shopDomain}/products/${product.handle}`,
        };

        if (qty <= 0) {
          oosProducts.push(oosItem);
        } else if (qty < lowStockThreshold) {
          lowStockProducts.push(oosItem);
        }
      }
    }

    // Handle pagination via Link header
    const linkHeader: string | null = resp.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match: RegExpMatchArray | null = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
      pageInfo = match ? match[1] : null;
      hasMore = !!pageInfo;
    } else {
      hasMore = false;
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    shopDomain,
    totalProducts,
    totalVariants,
    oosProducts,
    lowStockProducts,
  };
}

/**
 * Quick check: Get only fully OOS products (all variants out of stock)
 * More efficient for daily watchdog checks
 */
export async function fetchFullyOOSProducts(options: FetchInventoryOptions): Promise<{
  products: Array<{
    productId: string;
    title: string;
    handle: string;
    productUrl: string;
    variantCount: number;
  }>;
  totalChecked: number;
}> {
  const { shopDomain, accessToken } = options;

  const baseUrl = `https://${shopDomain}/admin/api/${API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  const fullyOOS: Array<{
    productId: string;
    title: string;
    handle: string;
    productUrl: string;
    variantCount: number;
  }> = [];
  let totalChecked = 0;

  let pageInfo: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const url: string = pageInfo
      ? `${baseUrl}/products.json?limit=250&page_info=${pageInfo}`
      : `${baseUrl}/products.json?limit=250`;

    const resp: Response = await fetch(url, { headers });

    if (!resp.ok) {
      throw new Error(`Shopify API Error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as { products?: any[] };
    const products = data.products || [];

    for (const product of products) {
      totalChecked++;
      const variants = product.variants || [];

      // Check if ALL variants are OOS
      const allOOS = variants.length > 0 && variants.every((v: any) => (v.inventory_quantity ?? 0) <= 0);

      if (allOOS) {
        fullyOOS.push({
          productId: String(product.id),
          title: product.title || 'Unknown',
          handle: product.handle || '',
          productUrl: `https://${shopDomain}/products/${product.handle}`,
          variantCount: variants.length,
        });
      }
    }

    // Handle pagination
    const linkHeader: string | null = resp.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match: RegExpMatchArray | null = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
      pageInfo = match ? match[1] : null;
      hasMore = !!pageInfo;
    } else {
      hasMore = false;
    }
  }

  return { products: fullyOOS, totalChecked };
}

// ============ HELPERS ============

function getDateRange(datePreset: string): { start: string; end: string } {
  const end = new Date();
  let start = new Date();

  switch (datePreset) {
    case 'last_7d':
      start.setDate(end.getDate() - 7);
      break;
    case 'last_14d':
      start.setDate(end.getDate() - 14);
      break;
    case 'last_30d':
      start.setDate(end.getDate() - 30);
      break;
    case 'last_90d':
      start.setDate(end.getDate() - 90);
      break;
    case 'maximum':
      start.setFullYear(end.getFullYear() - 1);
      break;
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}
