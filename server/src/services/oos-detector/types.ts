/**
 * OOS Detector - Shared Types
 *
 * Leaf module: public interfaces shared across the oos-detector modules.
 */

// ============ TYPES ============

export interface OOSAdMatch {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  productId: string;
  productTitle: string;
  productUrl: string;
  spend: number;
  impressions: number;
  clicks: number;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;
}

export interface OOSReport {
  capturedAt: string;
  shopDomain: string;
  accountId: string;
  totalOOSProducts: number;
  totalAdsChecked: number;
  oosAdsFound: number;
  totalWastedSpend: number;
  matches: OOSAdMatch[];
}

export interface DetectOOSAdsOptions {
  shopDomain: string;
  shopifyToken: string;
  metaAccountId: string;
  metaToken: string;
  days?: number;
}

// ============ CATALOG-BASED OOS DETECTION ============

export interface CatalogOOSProduct {
  productId: string;
  retailerId: string;
  name: string;
  availability: string;
}

export interface CatalogOOSReport {
  capturedAt: string;
  catalogId: string;
  totalProducts: number;
  oosProducts: CatalogOOSProduct[];
  oosCount: number;
  oosRate: number;
  hasCatalogAds: boolean;
  estimatedWastedImpressions: number;
}

export interface CatalogOOSOptions {
  catalogId: string;
  metaAccountId: string;
  metaToken: string;
}

// ============ PER-PRODUCT SPEND ANALYSIS (Async Reports) ============

export interface ProductSpendData {
  productId: string;
  productName: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

export interface ShopifySalesData {
  orders: number;
  quantity: number;
  revenue: number;
}

export interface EnhancedOOSProduct {
  productId: string;
  productName: string;
  issueType: 'SYNC_ISSUE' | 'TRUE_OOS' | 'CATALOG_ONLY';
  currentInventory: number | null;
  // Meta ad data
  metaSpend: number;
  metaImpressions: number;
  metaClicks: number;
  metaPurchases: number;
  metaRevenue: number;
  // Shopify verified data
  shopifyOrders: number;
  shopifyQuantity: number;
  shopifyRevenue: number;
  // Analysis
  verifiedWasted: boolean;
  wastedSpend: number;
  roas: number;
}

export interface EnhancedOOSReport {
  capturedAt: string;
  accountId: string;
  catalogId: string;
  dateRange: string;
  // Summary
  totalOOSProducts: number;
  totalAdSpend: number;
  verifiedWastedSpend: number;
  productsWithShopifySales: number;
  productsNoSales: number;
  syncIssues: number;
  trueOOS: number;
  // Details
  products: EnhancedOOSProduct[];
}

export interface EnhancedOOSOptions {
  catalogId: string;
  metaAccountId: string;
  metaToken: string;
  shopDomain?: string;
  shopifyToken?: string;
  days?: number;
}

export interface CatalogProductData {
  id: string;
  name: string;
  retailer_id: string;         // Shopify variant_id
  retailer_product_group_id: string; // Shopify product_id (parent)
  availability: string;
}

export interface ProductGroupSpend {
  productGroupId: string;        // Shopify product_id
  productName: string;
  variants: string[];            // All variant IDs in this product
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

// ============ WATCHDOG INTEGRATION ============

export interface OOSWatchdogResult {
  hasIssues: boolean;
  wastedSpend: number;
  verifiedWastedSpend: number;
  topMatches: OOSAdMatch[];
  summary: string;
  catalogOOS?: {
    oosCount: number;
    oosRate: number;
    hasCatalogAds: boolean;
  };
  enhanced?: {
    totalOOSProducts: number;
    productsWithShopifySales: number;
    productsNoSales: number;
    topWasted: Array<{
      productId: string;
      productName: string;
      wastedSpend: number;
      shopifyOrders: number;
    }>;
  };
}

export interface RunOOSCheckOptions extends DetectOOSAdsOptions {
  catalogId?: string; // Optional: for DPA/catalog ads
}

// ============ CLIENT-AWARE OOS DETECTION ============

export interface ClientOOSReport extends OOSWatchdogResult {
  clientId: string;
  clientName: string;
  revenueLevel: string | null;
  alertThreshold: number;
  shouldAlert: boolean;
  newOOSProducts: string[];
  previouslyKnown: string[];
}
