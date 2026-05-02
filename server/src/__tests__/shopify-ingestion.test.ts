/**
 * Tests for shopify-ingestion.ts — Shopify Data Ingestion
 *
 * Tests fetchShopifySnapshot, fetchInventorySnapshot, and fetchFullyOOSProducts.
 * Mocks global fetch to simulate Shopify Admin API responses.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();

// Import after setting up mocks
import {
  fetchShopifySnapshot,
  fetchInventorySnapshot,
  fetchFullyOOSProducts,
  type OOSProduct,
  type InventorySnapshot,
} from '../audit/shopify-ingestion.js';

// Helper to create mock fetch responses
const createMockResponse = (data: any, options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) => ({
  ok: options.ok !== false,
  status: options.status || 200,
  statusText: options.status === 404 ? 'Not Found' : 'OK',
  json: async () => data,
  headers: {
    get: (name: string) => options.headers?.[name] || null,
  },
});

describe('Shopify Ingestion', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ============ fetchShopifySnapshot TESTS ============

  describe('fetchShopifySnapshot', () => {
    const baseOptions = {
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test_token',
      datePreset: 'last_30d' as const,
    };

    it('returns complete snapshot structure', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/orders.json') && url.includes('fields=id,line_items')) {
          // fetchTopProducts call
          return createMockResponse({ orders: [] });
        }
        if (url.includes('/orders.json')) {
          // fetchOrders call
          return createMockResponse({ orders: [] });
        }
        return createMockResponse({ data: [] });
      });

      const result = await fetchShopifySnapshot(baseOptions);

      expect(result).toHaveProperty('capturedAt');
      expect(result).toHaveProperty('dateRange');
      expect(result).toHaveProperty('shopDomain', 'test-store.myshopify.com');
      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('averageOrderValue');
      expect(result).toHaveProperty('newCustomers');
      expect(result).toHaveProperty('returningCustomers');
      expect(result).toHaveProperty('repeatPurchaseRate');
      expect(result).toHaveProperty('topProducts');
    });

    it('calculates revenue and AOV correctly', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('fields=id,line_items')) {
          return createMockResponse({ orders: [] });
        }
        if (url.includes('/orders.json')) {
          return createMockResponse({
            orders: [
              { id: 'order1', total_price: '100.00' },
              { id: 'order2', total_price: '200.00' },
              { id: 'order3', total_price: '300.00' },
            ],
          });
        }
        return createMockResponse({ data: [] });
      });

      const result = await fetchShopifySnapshot(baseOptions);

      expect(result.totalRevenue).toBe(600);
      expect(result.totalOrders).toBe(3);
      expect(result.averageOrderValue).toBe(200);
    });

    it('identifies new vs returning customers', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('fields=id,line_items')) {
          return createMockResponse({ orders: [] });
        }
        if (url.includes('/orders.json')) {
          return createMockResponse({
            orders: [
              { id: 'o1', total_price: '100', customer: { id: 'c1', orders_count: 1 } }, // new
              { id: 'o2', total_price: '100', customer: { id: 'c2', orders_count: 5 } }, // returning
              { id: 'o3', total_price: '100', customer: { id: 'c3', orders_count: 1 } }, // new
              { id: 'o4', total_price: '100', customer: { id: 'c2', orders_count: 6 } }, // same returning customer
            ],
          });
        }
        return createMockResponse({ data: [] });
      });

      const result = await fetchShopifySnapshot(baseOptions);

      expect(result.newCustomers).toBe(2); // c1, c3
      expect(result.returningCustomers).toBe(1); // c2
    });

    it('calculates repeat purchase rate', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('fields=id,line_items')) {
          return createMockResponse({ orders: [] });
        }
        if (url.includes('/orders.json')) {
          return createMockResponse({
            orders: [
              { id: 'o1', total_price: '100', customer: { id: 'c1', orders_count: 1 } },
              { id: 'o2', total_price: '100', customer: { id: 'c2', orders_count: 3 } },
              { id: 'o3', total_price: '100', customer: { id: 'c3', orders_count: 2 } },
              { id: 'o4', total_price: '100', customer: { id: 'c4', orders_count: 1 } },
            ],
          });
        }
        return createMockResponse({ data: [] });
      });

      const result = await fetchShopifySnapshot(baseOptions);

      // 2 returning (c2, c3) out of 4 customers = 50%
      expect(result.repeatPurchaseRate).toBe(50);
    });

    it('returns top products by revenue', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('fields=id,line_items')) {
          return createMockResponse({
            orders: [
              {
                id: 'o1',
                line_items: [
                  { product_id: 'p1', title: 'Product A', price: '100', quantity: 2, variant_id: 'v1' },
                  { product_id: 'p2', title: 'Product B', price: '50', quantity: 1, variant_id: 'v2' },
                ],
              },
              {
                id: 'o2',
                line_items: [
                  { product_id: 'p1', title: 'Product A', price: '100', quantity: 1, variant_id: 'v1' },
                ],
              },
            ],
          });
        }
        if (url.includes('/orders.json')) {
          return createMockResponse({ orders: [] });
        }
        return createMockResponse({ data: [] });
      });

      const result = await fetchShopifySnapshot(baseOptions);

      expect(result.topProducts).toHaveLength(2);
      expect(result.topProducts[0].productId).toBe('p1'); // Higher revenue
      expect(result.topProducts[0].revenue).toBe(300); // 100*2 + 100*1
      expect(result.topProducts[0].unitsSold).toBe(3);
      expect(result.topProducts[1].productId).toBe('p2');
      expect(result.topProducts[1].revenue).toBe(50);
    });

    it('handles empty orders gracefully', async () => {
      mockFetch.mockImplementation(async () => createMockResponse({ orders: [] }));

      const result = await fetchShopifySnapshot(baseOptions);

      expect(result.totalRevenue).toBe(0);
      expect(result.totalOrders).toBe(0);
      expect(result.averageOrderValue).toBe(0);
      expect(result.repeatPurchaseRate).toBe(0);
    });

    it('handles orders without customers', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('fields=id,line_items')) {
          return createMockResponse({ orders: [] });
        }
        if (url.includes('/orders.json')) {
          return createMockResponse({
            orders: [
              { id: 'o1', total_price: '100' }, // no customer
              { id: 'o2', total_price: '200', customer: null },
            ],
          });
        }
        return createMockResponse({ data: [] });
      });

      const result = await fetchShopifySnapshot(baseOptions);

      expect(result.totalOrders).toBe(2);
      expect(result.newCustomers).toBe(0);
      expect(result.returningCustomers).toBe(0);
    });

    it('throws on API error', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('fields=id,line_items')) {
          return createMockResponse({ orders: [] });
        }
        return createMockResponse({ errors: 'Invalid access token' });
      });

      await expect(fetchShopifySnapshot(baseOptions)).rejects.toThrow('Shopify API Error');
    });

    it('uses correct date range for different presets', async () => {
      mockFetch.mockImplementation(async () => createMockResponse({ orders: [] }));

      const result7d = await fetchShopifySnapshot({ ...baseOptions, datePreset: 'last_7d' });
      const result90d = await fetchShopifySnapshot({ ...baseOptions, datePreset: 'last_90d' });

      // Both should have valid date ranges
      expect(result7d.dateRange.start).toBeDefined();
      expect(result7d.dateRange.end).toBeDefined();
      expect(result90d.dateRange.start).toBeDefined();
    });
  });

  // ============ fetchInventorySnapshot TESTS ============

  describe('fetchInventorySnapshot', () => {
    const baseOptions = {
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test_token',
    };

    it('returns inventory snapshot structure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result).toHaveProperty('capturedAt');
      expect(result).toHaveProperty('shopDomain', 'test-store.myshopify.com');
      expect(result).toHaveProperty('totalProducts');
      expect(result).toHaveProperty('totalVariants');
      expect(result).toHaveProperty('oosProducts');
      expect(result).toHaveProperty('lowStockProducts');
    });

    it('identifies OOS products (inventory <= 0)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'OOS Product',
            handle: 'oos-product',
            variants: [
              { id: 'v1', title: 'Default', sku: 'SKU1', inventory_quantity: 0 },
              { id: 'v2', title: 'Large', sku: 'SKU2', inventory_quantity: -5 },
            ],
          },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.oosProducts).toHaveLength(2);
      expect(result.oosProducts[0].inventoryQuantity).toBe(0);
      expect(result.oosProducts[1].inventoryQuantity).toBe(-5);
    });

    it('identifies low stock products (0 < inventory < threshold)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Low Stock Product',
            handle: 'low-stock',
            variants: [
              { id: 'v1', title: 'Small', sku: 'SKU1', inventory_quantity: 2 },
              { id: 'v2', title: 'Medium', sku: 'SKU2', inventory_quantity: 4 },
              { id: 'v3', title: 'Large', sku: 'SKU3', inventory_quantity: 10 }, // Not low stock
            ],
          },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.lowStockProducts).toHaveLength(2);
      expect(result.oosProducts).toHaveLength(0);
    });

    it('respects custom low stock threshold', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Product',
            handle: 'product',
            variants: [
              { id: 'v1', title: 'A', inventory_quantity: 8 },
              { id: 'v2', title: 'B', inventory_quantity: 12 },
            ],
          },
        ],
      }));

      const result = await fetchInventorySnapshot({
        ...baseOptions,
        lowStockThreshold: 10,
      });

      expect(result.lowStockProducts).toHaveLength(1); // Only v1 (8 < 10)
    });

    it('counts products and variants correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Product 1',
            handle: 'p1',
            variants: [
              { id: 'v1', inventory_quantity: 10 },
              { id: 'v2', inventory_quantity: 5 },
            ],
          },
          {
            id: 'p2',
            title: 'Product 2',
            handle: 'p2',
            variants: [
              { id: 'v3', inventory_quantity: 0 },
            ],
          },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.totalProducts).toBe(2);
      expect(result.totalVariants).toBe(3);
    });

    it('builds correct product URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Test Product',
            handle: 'test-product',
            variants: [{ id: 'v1', inventory_quantity: 0 }],
          },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.oosProducts[0].productUrl).toBe('https://test-store.myshopify.com/products/test-product');
    });

    it('handles pagination correctly', async () => {
      // First page with next link
      mockFetch.mockResolvedValueOnce(createMockResponse(
        {
          products: [
            { id: 'p1', title: 'Product 1', handle: 'p1', variants: [{ id: 'v1', inventory_quantity: 0 }] },
          ],
        },
        { headers: { 'Link': '<https://shop.myshopify.com/products.json?page_info=next123>; rel="next"' } }
      ));

      // Second page (no next)
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          { id: 'p2', title: 'Product 2', handle: 'p2', variants: [{ id: 'v2', inventory_quantity: 0 }] },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.totalProducts).toBe(2);
      expect(result.oosProducts).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        { error: 'Unauthorized' },
        { ok: false, status: 401 }
      ));

      await expect(fetchInventorySnapshot(baseOptions)).rejects.toThrow('Shopify API Error: 401');
    });

    it('handles products without variants', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          { id: 'p1', title: 'No Variants', handle: 'no-variants', variants: [] },
          { id: 'p2', title: 'Missing Variants', handle: 'missing' },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.totalProducts).toBe(2);
      expect(result.totalVariants).toBe(0);
      expect(result.oosProducts).toHaveLength(0);
    });

    it('handles missing inventory quantity (defaults to 0)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Product',
            handle: 'product',
            variants: [
              { id: 'v1', title: 'Default' }, // No inventory_quantity
            ],
          },
        ],
      }));

      const result = await fetchInventorySnapshot(baseOptions);

      expect(result.oosProducts).toHaveLength(1);
      expect(result.oosProducts[0].inventoryQuantity).toBe(0);
    });
  });

  // ============ fetchFullyOOSProducts TESTS ============

  describe('fetchFullyOOSProducts', () => {
    const baseOptions = {
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test_token',
    };

    it('returns fully OOS products structure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('totalChecked');
      expect(Array.isArray(result.products)).toBe(true);
    });

    it('identifies products where ALL variants are OOS', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Fully OOS',
            handle: 'fully-oos',
            variants: [
              { id: 'v1', inventory_quantity: 0 },
              { id: 'v2', inventory_quantity: -2 },
            ],
          },
          {
            id: 'p2',
            title: 'Partially OOS',
            handle: 'partial',
            variants: [
              { id: 'v3', inventory_quantity: 0 },
              { id: 'v4', inventory_quantity: 5 }, // In stock
            ],
          },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].productId).toBe('p1');
      expect(result.products[0].title).toBe('Fully OOS');
      expect(result.totalChecked).toBe(2);
    });

    it('returns correct variant count', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'OOS Product',
            handle: 'oos',
            variants: [
              { id: 'v1', inventory_quantity: 0 },
              { id: 'v2', inventory_quantity: 0 },
              { id: 'v3', inventory_quantity: 0 },
            ],
          },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products[0].variantCount).toBe(3);
    });

    it('builds correct product URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Test',
            handle: 'test-product',
            variants: [{ id: 'v1', inventory_quantity: 0 }],
          },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products[0].productUrl).toBe('https://test-store.myshopify.com/products/test-product');
    });

    it('skips products with no variants', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          { id: 'p1', title: 'No Variants', handle: 'no', variants: [] },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products).toHaveLength(0);
      expect(result.totalChecked).toBe(1);
    });

    it('handles pagination correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        {
          products: [
            { id: 'p1', title: 'OOS 1', handle: 'oos1', variants: [{ id: 'v1', inventory_quantity: 0 }] },
          ],
        },
        { headers: { 'Link': '<url?page_info=next123>; rel="next"' } }
      ));

      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          { id: 'p2', title: 'OOS 2', handle: 'oos2', variants: [{ id: 'v2', inventory_quantity: 0 }] },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products).toHaveLength(2);
      expect(result.totalChecked).toBe(2);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        { error: 'Not Found' },
        { ok: false, status: 404 }
      ));

      await expect(fetchFullyOOSProducts(baseOptions)).rejects.toThrow('Shopify API Error: 404');
    });

    it('handles missing inventory_quantity as 0 (OOS)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'No Inventory Field',
            handle: 'no-inv',
            variants: [
              { id: 'v1' }, // No inventory_quantity
            ],
          },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products).toHaveLength(1);
    });

    it('handles products with single variant', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        products: [
          {
            id: 'p1',
            title: 'Single Variant OOS',
            handle: 'single-oos',
            variants: [{ id: 'v1', inventory_quantity: 0 }],
          },
          {
            id: 'p2',
            title: 'Single Variant In Stock',
            handle: 'single-in',
            variants: [{ id: 'v2', inventory_quantity: 10 }],
          },
        ],
      }));

      const result = await fetchFullyOOSProducts(baseOptions);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].productId).toBe('p1');
    });
  });
});
