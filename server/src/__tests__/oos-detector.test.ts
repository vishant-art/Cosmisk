/**
 * Tests for oos-detector.ts — OOS (Out-of-Stock) Detection
 *
 * Tests fuzzy matching logic, ad text extraction, OOS detection,
 * and Watchdog integration. Mocks Shopify and Meta API calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock shopify-ingestion
vi.mock('../audit/shopify-ingestion.js', () => ({
  fetchFullyOOSProducts: vi.fn(),
}));

// Mock MetaApiService - need to use a class for constructor
const mockMetaGet = vi.fn();
vi.mock('../services/meta-api.js', () => ({
  MetaApiService: class MockMetaApiService {
    get = mockMetaGet;
  },
}));

// Import after mocks
import {
  detectOOSAds,
  detectCatalogOOS,
  runOOSCheck,
  type OOSAdMatch,
  type OOSReport,
  type CatalogOOSReport,
} from '../services/oos-detector.js';
import { fetchFullyOOSProducts } from '../audit/shopify-ingestion.js';

// Get typed mocks
const mockFetchFullyOOSProducts = fetchFullyOOSProducts as Mock;

describe('OOS Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMetaGet.mockReset();
    mockFetchFullyOOSProducts.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============ FUZZY MATCHING TESTS ============
  // (Tested indirectly through detectOOSAds)

  describe('fuzzyMatch (via detectOOSAds)', () => {
    const baseOptions = {
      shopDomain: 'test-shop.myshopify.com',
      shopifyToken: 'shpat_test',
      metaAccountId: 'act_123',
      metaToken: 'meta_token',
      days: 7,
    };

    it('matches exact substring (high confidence)', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Blue Denim Jacket', productUrl: '/products/blue-denim' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Shop Blue Denim Jacket Now', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', campaign_name: 'Summer Sale', spend: '150.50', impressions: '1000', clicks: '50' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(1);
      expect(result.matches[0].matchConfidence).toBe('high');
      expect(result.matches[0].matchReason).toBe('exact_substring');
    });

    it('matches by word overlap (medium confidence)', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Premium Cotton T-Shirt White', productUrl: '/products/cotton-tshirt' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Cotton T-Shirt Collection', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', campaign_name: 'Basics', spend: '200', impressions: '2000', clicks: '100' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(1);
      expect(result.matches[0].matchConfidence).toBe('medium');
      expect(result.matches[0].matchReason).toMatch(/word_match/);
    });

    it('does not match unrelated products', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Leather Wallet Brown', productUrl: '/products/wallet' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Summer Beach Sandals', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', campaign_name: 'Footwear', spend: '300', impressions: '3000', clicks: '150' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(0);
      expect(result.matches).toHaveLength(0);
    });

    it('handles missing ad text gracefully', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Test Product', productUrl: '/products/test' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: null, campaign_id: 'c1', creative: null },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '100', impressions: '1000', clicks: '50' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(0);
    });

    it('handles missing product title gracefully', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: '', productUrl: '/products/empty' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Great Product Ad', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '100', impressions: '1000', clicks: '50' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(0);
    });
  });

  // ============ EXTRACT AD TEXT TESTS ============

  describe('extractAdText (via detectOOSAds)', () => {
    const baseOptions = {
      shopDomain: 'test-shop.myshopify.com',
      shopifyToken: 'shpat_test',
      metaAccountId: 'act_123',
      metaToken: 'meta_token',
    };

    it('extracts text from creative title and body', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Wireless Headphones', productUrl: '/products/headphones' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            {
              id: 'ad1',
              name: 'Audio Ad',
              campaign_id: 'c1',
              creative: {
                title: 'Best Wireless Headphones',
                body: 'Premium sound quality',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '500', impressions: '5000', clicks: '250' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(1);
      expect(result.matches[0].productTitle).toBe('Wireless Headphones');
    });

    it('extracts text from object_story_spec link_data', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Running Shoes', productUrl: '/products/shoes' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            {
              id: 'ad1',
              name: 'Shoe Ad',
              campaign_id: 'c1',
              creative: {
                object_story_spec: {
                  link_data: {
                    message: 'Shop Running Shoes Today',
                    name: 'Premium Running Shoes',
                  },
                },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '250', impressions: '2500', clicks: '125' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.oosAdsFound).toBe(1);
    });
  });

  // ============ DETECT OOS ADS TESTS ============

  describe('detectOOSAds', () => {
    const baseOptions = {
      shopDomain: 'test-shop.myshopify.com',
      shopifyToken: 'shpat_test',
      metaAccountId: 'act_123',
      metaToken: 'meta_token',
      days: 7,
    };

    it('returns complete OOS report structure', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Test Product', productUrl: '/products/test' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await detectOOSAds(baseOptions);

      expect(result).toHaveProperty('capturedAt');
      expect(result).toHaveProperty('shopDomain', 'test-shop.myshopify.com');
      expect(result).toHaveProperty('accountId', 'act_123');
      expect(result).toHaveProperty('totalOOSProducts', 1);
      expect(result).toHaveProperty('totalAdsChecked', 0);
      expect(result).toHaveProperty('oosAdsFound', 0);
      expect(result).toHaveProperty('totalWastedSpend', 0);
      expect(result).toHaveProperty('matches');
    });

    it('calculates total wasted spend correctly', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Product One', productUrl: '/products/one' },
          { productId: 'p2', title: 'Product Two', productUrl: '/products/two' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Product One Sale', campaign_id: 'c1', creative: {} },
            { id: 'ad2', name: 'Product Two Deal', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '100.50', impressions: '1000', clicks: '50' },
            { ad_id: 'ad2', spend: '200.25', impressions: '2000', clicks: '100' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.totalWastedSpend).toBeCloseTo(300.75, 2);
    });

    it('sorts matches by spend (highest first)', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Low Spend Product', productUrl: '/products/low' },
          { productId: 'p2', title: 'High Spend Product', productUrl: '/products/high' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Low Spend Product Ad', campaign_id: 'c1', creative: {} },
            { id: 'ad2', name: 'High Spend Product Ad', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '50', impressions: '500', clicks: '25' },
            { ad_id: 'ad2', spend: '500', impressions: '5000', clicks: '250' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.matches[0].spend).toBe(500);
      expect(result.matches[1].spend).toBe(50);
    });

    it('filters out ads with zero spend', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Test Product', productUrl: '/products/test' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Test Product Ad', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '0', impressions: '0', clicks: '0' },
          ],
        });

      const result = await detectOOSAds(baseOptions);

      expect(result.totalAdsChecked).toBe(0);
      expect(result.oosAdsFound).toBe(0);
    });

    it('handles empty OOS products list', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [],
      });

      mockMetaGet
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await detectOOSAds(baseOptions);

      expect(result.totalOOSProducts).toBe(0);
      expect(result.oosAdsFound).toBe(0);
    });

    it('handles empty ads list', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'Test Product', productUrl: '/products/test' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await detectOOSAds(baseOptions);

      expect(result.totalAdsChecked).toBe(0);
      expect(result.oosAdsFound).toBe(0);
    });
  });

  // ============ CATALOG OOS DETECTION TESTS ============

  describe('detectCatalogOOS', () => {
    const baseOptions = {
      catalogId: 'catalog_123',
      metaAccountId: 'act_123',
      metaToken: 'meta_token',
    };

    it('returns catalog OOS report structure', async () => {
      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'prod1', name: 'Product 1', retailer_id: 'SKU1', availability: 'in stock' },
            { id: 'prod2', name: 'Product 2', retailer_id: 'SKU2', availability: 'out of stock' },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      const result = await detectCatalogOOS(baseOptions);

      expect(result).toHaveProperty('capturedAt');
      expect(result).toHaveProperty('catalogId', 'catalog_123');
      expect(result).toHaveProperty('totalProducts', 2);
      expect(result).toHaveProperty('oosCount', 1);
      expect(result).toHaveProperty('oosRate', 50);
      expect(result).toHaveProperty('oosProducts');
      expect(result).toHaveProperty('hasCatalogAds');
    });

    it('identifies OOS products correctly', async () => {
      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'prod1', name: 'In Stock Item', retailer_id: 'SKU1', availability: 'in stock' },
            { id: 'prod2', name: 'Out of Stock Item', retailer_id: 'SKU2', availability: 'out of stock' },
            { id: 'prod3', name: 'Discontinued Item', retailer_id: 'SKU3', availability: 'discontinued' },
          ],
        })
        .mockResolvedValueOnce({ data: [] });

      const result = await detectCatalogOOS(baseOptions);

      expect(result.oosCount).toBe(2); // out of stock + discontinued
      expect(result.totalProducts).toBe(3);
      expect(result.oosRate).toBeCloseTo(66.67, 1);
    });

    it('detects catalog ads by name pattern', async () => {
      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'prod1', name: 'Product', retailer_id: 'SKU1', availability: 'out of stock' },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Catalog - Dynamic Product Ad', effective_status: 'ACTIVE' },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { spend: '1000', impressions: '10000' },
          ],
        });

      const result = await detectCatalogOOS(baseOptions);

      expect(result.hasCatalogAds).toBe(true);
    });

    it('detects catalog ads by template syntax', async () => {
      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'prod1', name: 'Product', retailer_id: 'SKU1', availability: 'out of stock' },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: '{{product.name}} - Buy Now', effective_status: 'ACTIVE' },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { spend: '500', impressions: '5000' },
          ],
        });

      const result = await detectCatalogOOS(baseOptions);

      expect(result.hasCatalogAds).toBe(true);
    });

    it('limits OOS products to 50', async () => {
      const manyProducts = Array.from({ length: 100 }, (_, i) => ({
        id: `prod${i}`,
        name: `Product ${i}`,
        retailer_id: `SKU${i}`,
        availability: 'out of stock',
      }));

      mockMetaGet
        .mockResolvedValueOnce({ data: manyProducts })
        .mockResolvedValueOnce({ data: [] });

      const result = await detectCatalogOOS(baseOptions);

      expect(result.oosCount).toBe(100);
      expect(result.oosProducts).toHaveLength(50);
    });

    it('handles API errors gracefully', async () => {
      mockMetaGet.mockRejectedValueOnce(new Error('API rate limit'));

      await expect(detectCatalogOOS(baseOptions)).rejects.toThrow('API rate limit');
    });
  });

  // ============ WATCHDOG INTEGRATION TESTS ============

  describe('runOOSCheck', () => {
    const baseOptions = {
      shopDomain: 'test-shop.myshopify.com',
      shopifyToken: 'shpat_test',
      metaAccountId: 'act_123',
      metaToken: 'meta_token',
    };

    it('returns no issues when no OOS ads found', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({ products: [] });
      mockMetaGet
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await runOOSCheck(baseOptions);

      expect(result.hasIssues).toBe(false);
      expect(result.wastedSpend).toBe(0);
      expect(result.summary).toBe('No OOS issues detected.');
    });

    it('flags issues when wasted spend exceeds threshold', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'OOS Product', productUrl: '/products/oos' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'OOS Product Ad', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '150', impressions: '1500', clicks: '75' },
          ],
        });

      const result = await runOOSCheck(baseOptions);

      expect(result.hasIssues).toBe(true);
      expect(result.wastedSpend).toBe(150);
      expect(result.summary).toContain('1 ads on OOS products');
      expect(result.summary).toContain('Rs 150');
    });

    it('does not flag issues below Rs 100 threshold', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'OOS Product', productUrl: '/products/oos' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'OOS Product Ad', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '50', impressions: '500', clicks: '25' },
          ],
        });

      const result = await runOOSCheck(baseOptions);

      expect(result.hasIssues).toBe(false);
      expect(result.wastedSpend).toBe(50);
    });

    it('limits topMatches to 5', async () => {
      const products = Array.from({ length: 10 }, (_, i) => ({
        productId: `p${i}`,
        title: `Product ${i}`,
        productUrl: `/products/${i}`,
      }));

      const ads = Array.from({ length: 10 }, (_, i) => ({
        id: `ad${i}`,
        name: `Product ${i} Ad`,
        campaign_id: 'c1',
        creative: {},
      }));

      const insights = Array.from({ length: 10 }, (_, i) => ({
        ad_id: `ad${i}`,
        spend: `${100 + i * 10}`,
        impressions: '1000',
        clicks: '50',
      }));

      mockFetchFullyOOSProducts.mockResolvedValueOnce({ products });
      mockMetaGet
        .mockResolvedValueOnce({ data: ads })
        .mockResolvedValueOnce({ data: insights });

      const result = await runOOSCheck(baseOptions);

      expect(result.topMatches).toHaveLength(5);
    });

    it('includes catalog OOS when catalogId provided', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({ products: [] });
      mockMetaGet
        .mockResolvedValueOnce({ data: [] }) // ads for detectOOSAds (no ads = no insights call)
        .mockResolvedValueOnce({
          data: [
            { id: 'prod1', name: 'Product', retailer_id: 'SKU1', availability: 'out of stock' },
          ],
        }) // catalog products
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'Catalog DPA', effective_status: 'ACTIVE' },
          ],
        }) // catalog ads
        .mockResolvedValueOnce({
          data: [{ spend: '1000' }],
        }); // catalog insights

      const result = await runOOSCheck({
        ...baseOptions,
        catalogId: 'catalog_123',
      });

      expect(result.catalogOOS).toBeDefined();
      expect(result.catalogOOS?.oosCount).toBe(1);
      expect(result.hasIssues).toBe(true); // OOS + catalog ads = issue
    });

    it('handles errors gracefully', async () => {
      mockFetchFullyOOSProducts.mockRejectedValueOnce(new Error('Shopify API down'));

      const result = await runOOSCheck(baseOptions);

      expect(result.hasIssues).toBe(false);
      expect(result.summary).toContain('OOS check failed');
      expect(result.summary).toContain('Shopify API down');
    });

    it('continues if catalog check fails', async () => {
      mockFetchFullyOOSProducts.mockResolvedValueOnce({
        products: [
          { productId: 'p1', title: 'OOS Product', productUrl: '/products/oos' },
        ],
      });

      mockMetaGet
        .mockResolvedValueOnce({
          data: [
            { id: 'ad1', name: 'OOS Product Ad', campaign_id: 'c1', creative: {} },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { ad_id: 'ad1', spend: '200', impressions: '2000', clicks: '100' },
          ],
        })
        .mockRejectedValueOnce(new Error('Catalog API error')); // catalog check fails

      const result = await runOOSCheck({
        ...baseOptions,
        catalogId: 'catalog_123',
      });

      expect(result.hasIssues).toBe(true);
      expect(result.wastedSpend).toBe(200);
      expect(result.catalogOOS).toBeUndefined();
    });
  });
});
