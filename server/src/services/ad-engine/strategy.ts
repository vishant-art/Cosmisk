/**
 * Strategy Engine
 * Selects products, matches templates, generates copy
 */

import { logger } from '../../utils/logger.js';
import {
  getClient,
  getCreativeScorerStore,
  getCompetitorIntelStore,
  type ServiceClient,
} from '../service-clients.js';
import type {
  StrategyInput,
  StrategyOutput,
  ProductBrief,
  TemplateType,
  AdCopy,
  ShopifyCredentials,
  ShopifyProduct,
} from './types.js';

const SHOPIFY_VERSION = '2024-10';

// ============================================================================
// Main Strategy Function
// ============================================================================

export async function generateStrategy(input: StrategyInput): Promise<StrategyOutput> {
  const { clientId, count = 12 } = input;

  // Get client data
  const client = getClient(clientId);
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  logger.info({ clientId, brandName: client.brandName }, '[Strategy] Starting');

  // Get intelligence stores
  const creativeStore = getCreativeScorerStore(clientId);
  const competitorStore = getCompetitorIntelStore(clientId);

  const winningPatterns = creativeStore?.winningPatterns || [];
  const competitorGaps = competitorStore?.clientCreativeStyle?.gaps || [];

  // Fetch Shopify products
  const credentials = getShopifyCredentials(client);
  if (!credentials) {
    throw new Error(`No Shopify credentials for client: ${clientId}`);
  }

  // Fetch more candidates to account for filtering losses
  let products = await fetchBestsellers(credentials, count * 5);

  // If bestsellers < target, supplement with recent products
  if (products.length < count) {
    logger.warn(
      { bestsellers: products.length, target: count },
      '[Strategy] Not enough bestsellers, fetching all products'
    );
    products = await fetchAllProducts(credentials, count, products);
  }

  logger.info({ count: products.length }, '[Strategy] Fetched products');

  // Match products to templates and generate copy
  const productBriefs = products.slice(0, count).map((product, index) => {
    const template = selectTemplate(product, index, winningPatterns);
    const copy = generateCopy(product, template, client);

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      price: product.price,
      originalPrice: product.compareAtPrice,
      discountPercent: product.discountPercent,
      imageUrl: product.imageUrl,
      salesRank: index + 1,
      template,
      copy,
    } as ProductBrief;
  });

  const uniqueTemplates = Array.from(new Set(productBriefs.map(p => p.template)));
  logger.info(
    { briefs: productBriefs.length, templates: uniqueTemplates },
    '[Strategy] Generated briefs'
  );

  return {
    clientId,
    brandName: client.brandName,
    products: productBriefs,
    winningPatterns,
    competitorGaps,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Shopify Integration
// ============================================================================

function getShopifyCredentials(client: ServiceClient): ShopifyCredentials | null {
  if (!client.shopifyStore) return null;

  // Parse shopifyStore - could be string or JSON object
  let domain: string;
  try {
    const storeData = JSON.parse(client.shopifyStore);
    // Prefer India store, fallback to global, or first available
    domain = storeData.india || storeData.global || Object.values(storeData)[0] as string;
  } catch {
    // Plain string
    domain = client.shopifyStore;
  }

  if (!domain) {
    logger.warn({ clientId: client.id }, '[Strategy] No valid Shopify domain');
    return null;
  }

  // Check environment for token
  const envKey = `SHOPIFY_TOKEN_${client.brandName.toUpperCase().replace(/\s+/g, '_')}`;
  const token = process.env[envKey] || process.env['SHOPIFY_ACCESS_TOKEN'];

  if (!token) {
    logger.warn({ clientId: client.id, envKey }, '[Strategy] No Shopify token found');
    return null;
  }

  return {
    domain,
    token,
  };
}

async function fetchBestsellers(
  credentials: ShopifyCredentials,
  limit: number
): Promise<ShopifyProduct[]> {
  const { domain, token } = credentials;

  // Fetch recent orders to calculate bestsellers
  const ordersResp = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_VERSION}/orders.json?status=any&limit=250`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );

  if (!ordersResp.ok) {
    throw new Error(`Shopify orders fetch failed: ${ordersResp.status}`);
  }

  const ordersData = await ordersResp.json();

  // Count product sales
  const productSales: Record<string, { qty: number; revenue: number; productId?: string }> = {};

  for (const order of ordersData.orders || []) {
    for (const item of order.line_items || []) {
      const title = item.title;
      if (!productSales[title]) {
        productSales[title] = { qty: 0, revenue: 0 };
      }
      productSales[title].qty += item.quantity;
      productSales[title].revenue += parseFloat(item.price) * item.quantity;
      if (item.product_id) {
        productSales[title].productId = String(item.product_id);
      }
    }
  }

  // Get top sellers
  const topTitles = Object.entries(productSales)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, limit * 2);

  // Fetch product details for top sellers
  const productsResp = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_VERSION}/products.json?limit=250`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );

  if (!productsResp.ok) {
    throw new Error(`Shopify products fetch failed: ${productsResp.status}`);
  }

  const productsData = await productsResp.json();
  const productMap = new Map<string, any>();

  for (const p of productsData.products || []) {
    productMap.set(p.title, p);
    productMap.set(String(p.id), p);
  }

  // Match bestsellers with product data
  const results: ShopifyProduct[] = [];

  for (const [title, sales] of topTitles) {
    const product = productMap.get(title) || (sales.productId ? productMap.get(sales.productId) : null);
    if (!product) continue;

    const variant = product.variants?.[0];
    if (!variant) continue;

    const price = parseFloat(variant.price) || 0;
    const compareAtPrice = variant.compare_at_price ? parseFloat(variant.compare_at_price) : null;
    const discountPercent = compareAtPrice && compareAtPrice > price
      ? Math.round((1 - price / compareAtPrice) * 100)
      : 0;

    const imageUrl = product.image?.src || product.images?.[0]?.src;
    if (!imageUrl) {
      logger.warn({ title: product.title }, '[Strategy] Product missing image, skipping');
      continue;
    }

    results.push({
      id: String(product.id),
      title: product.title,
      handle: product.handle,
      imageUrl,
      price,
      compareAtPrice,
      discountPercent,
      inventory: variant.inventory_quantity || 0,
      salesCount: sales.qty,
    });

    // Don't break early - collect all valid products, slice later
  }

  return results.slice(0, limit);
}

/**
 * Fallback: Fetch all products when bestsellers are insufficient
 */
async function fetchAllProducts(
  credentials: ShopifyCredentials,
  limit: number,
  existingProducts: ShopifyProduct[]
): Promise<ShopifyProduct[]> {
  const { domain, token } = credentials;
  const existingIds = new Set(existingProducts.map(p => p.id));

  const productsResp = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_VERSION}/products.json?limit=250&status=active`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );

  if (!productsResp.ok) {
    logger.error({ status: productsResp.status }, '[Strategy] Failed to fetch all products');
    return existingProducts;
  }

  const productsData = await productsResp.json();
  const results = [...existingProducts];

  for (const product of productsData.products || []) {
    if (results.length >= limit) break;
    if (existingIds.has(String(product.id))) continue;

    const variant = product.variants?.[0];
    if (!variant) continue;

    const imageUrl = product.image?.src || product.images?.[0]?.src;
    if (!imageUrl) continue;

    const price = parseFloat(variant.price) || 0;
    const compareAtPrice = variant.compare_at_price ? parseFloat(variant.compare_at_price) : null;
    const discountPercent = compareAtPrice && compareAtPrice > price
      ? Math.round((1 - price / compareAtPrice) * 100)
      : 0;

    results.push({
      id: String(product.id),
      title: product.title,
      handle: product.handle,
      imageUrl,
      price,
      compareAtPrice,
      discountPercent,
      inventory: variant.inventory_quantity || 0,
    });
  }

  logger.info(
    { total: results.length, added: results.length - existingProducts.length },
    '[Strategy] Supplemented with all products'
  );

  return results;
}

// ============================================================================
// Template Selection
// ============================================================================

function selectTemplate(
  product: ShopifyProduct,
  index: number,
  winningPatterns: string[]
): TemplateType {
  const templates: TemplateType[] = [
    'whatsapp-conversation',
    'product-hero',
    'testimonial',
    'urgency-sale',
    'social-proof',
    'comparison',
  ];

  // Rule-based selection with variety
  // WhatsApp is high-converting for fashion/lifestyle - use for top sellers
  const rules: Array<{ condition: boolean; template: TemplateType }> = [
    // Top bestseller -> WhatsApp (authentic social proof format)
    { condition: index === 0, template: 'whatsapp-conversation' },
    // High discount -> urgency
    { condition: product.discountPercent >= 40, template: 'urgency-sale' },
    // Top 3 bestsellers -> social proof
    { condition: index < 3, template: 'social-proof' },
    // Products with compare price -> comparison
    { condition: product.compareAtPrice !== null && product.discountPercent > 0, template: 'comparison' },
  ];

  // Check rules first
  for (const rule of rules) {
    if (rule.condition) {
      return rule.template;
    }
  }

  // Distribute products across ALL templates for variety
  // Include whatsapp and testimonial in rotation
  const rotation: TemplateType[] = [
    'product-hero',
    'social-proof',
    'whatsapp-conversation',
    'urgency-sale',
    'comparison',
    'testimonial',
  ];

  return rotation[index % rotation.length];
}

// ============================================================================
// Copy Generation
// ============================================================================

function generateCopy(
  product: ShopifyProduct,
  template: TemplateType,
  client: ServiceClient
): AdCopy {
  const brandName = client.brandName;
  const price = formatPrice(product.price);
  const originalPrice = product.compareAtPrice ? formatPrice(product.compareAtPrice) : null;
  const discount = product.discountPercent > 0 ? `${product.discountPercent}% OFF` : null;

  // Template-specific copy patterns
  const copyPatterns: Record<TemplateType, () => AdCopy> = {
    'whatsapp-conversation': () => ({
      headline: product.title.split(' ').slice(0, 5).join(' '),
      hook: "your outfit is SO pretty!! where is it from??",
      cta: `it's from ${brandName}, sending you the link rn`,
      socialProof: "everyone's asking about this one",
    }),

    'product-hero': () => ({
      headline: product.title,
      hook: discount || 'New Arrival',
      cta: 'Shop Now',
    }),

    'testimonial': () => ({
      headline: `"Best purchase I made this year"`,
      hook: product.title,
      cta: 'Shop Now',
      socialProof: '500+ 5-star reviews',
    }),

    'urgency-sale': () => ({
      headline: discount || 'Limited Offer',
      hook: `${price}${originalPrice ? ` (was ${originalPrice})` : ''}`,
      cta: 'Shop Now',
      urgency: 'While stocks last',
    }),

    'social-proof': () => ({
      headline: 'Customer Favorite',
      hook: product.title,
      cta: 'Shop Now',
      // Use impressive numbers: minimum 500, round up to nearest 100
      socialProof: `${Math.max(500, Math.ceil((product.salesCount || 500) / 100) * 100)}+ happy customers`,
    }),

    'comparison': () => ({
      headline: `Save ${discount || '₹' + Math.round((product.compareAtPrice || 0) - product.price)}`,
      hook: `${originalPrice} → ${price}`,
      cta: 'Get This Deal',
    }),
  };

  return copyPatterns[template]();
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return `₹${price.toLocaleString('en-IN')}`;
  }
  return `₹${price}`;
}

// ============================================================================
// Exports
// ============================================================================

export { fetchBestsellers, fetchAllProducts, selectTemplate, generateCopy };
