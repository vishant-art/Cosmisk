/**
 * Cohort LTV Analyzer — customer map construction
 */

import type { AcquisitionSource } from './types.js';
import type { ShopifyOrderRaw } from './data-fetching.js';
import { normalizeSource } from './source-normalization.js';

// ============ CUSTOMER MAP ============

export interface CustomerData {
  customerId: number;
  email: string;
  firstOrderDate: string;
  acquisitionSource: AcquisitionSource;
  orders: Array<{
    orderId: number;
    date: string;
    amount: number;
    source: AcquisitionSource;
  }>;
  totalSpent: number;
}

export function buildCustomerMap(orders: ShopifyOrderRaw[]): Map<number, CustomerData> {
  const customerMap = new Map<number, CustomerData>();

  // Sort orders by date (oldest first) to determine first order
  const sortedOrders = [...orders]
    .filter(o => !o.cancelled_at && o.financial_status !== 'refunded')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const order of sortedOrders) {
    const customerId = order.customer?.id;
    if (!customerId) continue;

    const noteAttrs = order.note_attributes || [];
    const utmSource = noteAttrs.find(n => n.name === 'utm_source')?.value || '';
    const utmTerm = noteAttrs.find(n => n.name === 'utm_term')?.value || '';
    const source = normalizeSource(utmSource, utmTerm);
    const amount = parseFloat(order.total_price);

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        email: order.customer?.email || '',
        firstOrderDate: order.created_at,
        acquisitionSource: source,
        orders: [],
        totalSpent: 0,
      });
    }

    const customer = customerMap.get(customerId)!;
    customer.orders.push({
      orderId: order.id,
      date: order.created_at,
      amount,
      source,
    });
    customer.totalSpent += amount;

    // Update acquisition source if this order is earlier
    if (new Date(order.created_at) < new Date(customer.firstOrderDate)) {
      customer.firstOrderDate = order.created_at;
      customer.acquisitionSource = source;
    }
  }

  return customerMap;
}
