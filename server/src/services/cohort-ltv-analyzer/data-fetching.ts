/**
 * Cohort LTV Analyzer — Shopify order data fetching
 */

// ============ DATA FETCHING ============

export interface ShopifyOrderRaw {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  customer?: {
    id: number;
    email: string;
    created_at: string;
  };
  note_attributes?: Array<{ name: string; value: string }>;
  cancelled_at?: string;
  financial_status: string;
}

export async function fetchAllOrders(
  store: string,
  token: string,
  since: Date
): Promise<ShopifyOrderRaw[]> {
  const allOrders: ShopifyOrderRaw[] = [];
  let nextUrl: string | null = `https://${store}/admin/api/2024-10/orders.json?status=any&created_at_min=${since.toISOString()}&limit=250`;
  let page = 0;
  const maxPages = 20; // Up to 5000 orders

  while (nextUrl && page < maxPages) {
    page++;

    const fetchRes: Response = await fetch(nextUrl, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!fetchRes.ok) {
      throw new Error(`Shopify API error: ${fetchRes.status}`);
    }

    const data = await fetchRes.json();
    const orders = data.orders || [];
    allOrders.push(...orders);

    // Check for next page
    const linkHeader: string = fetchRes.headers.get('Link') || '';
    const linkMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = linkMatch ? linkMatch[1] : null;
  }

  return allOrders;
}
