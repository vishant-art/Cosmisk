/**
 * Cohort LTV Analyzer — channel metrics, monthly cohorts, LTV gap
 */

import type { ChannelMetrics, MonthlyCohort } from './types.js';
import type { CustomerData } from './customer-map.js';

// ============ CHANNEL METRICS ============

export function calculateChannelMetrics(
  customerMap: Map<number, CustomerData>,
  minCustomers: number
): ChannelMetrics[] {
  // Group customers by acquisition source
  const channelMap = new Map<string, CustomerData[]>();

  for (const customer of customerMap.values()) {
    const key = customer.acquisitionSource.key;
    if (!channelMap.has(key)) {
      channelMap.set(key, []);
    }
    channelMap.get(key)!.push(customer);
  }

  // Calculate overall averages for comparison
  const allCustomers = Array.from(customerMap.values());
  const overallLTV = allCustomers.reduce((s, c) => s + c.totalSpent, 0) / allCustomers.length;
  const overallRepeat = (allCustomers.filter(c => c.orders.length > 1).length / allCustomers.length) * 100;

  // Calculate metrics for each channel
  const metrics: ChannelMetrics[] = [];

  for (const [key, customers] of channelMap) {
    if (customers.length < minCustomers) continue;

    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
    const avgLTV = totalRevenue / customers.length;
    const repeatCustomers = customers.filter(c => c.orders.length > 1).length;
    const repeatRate = (repeatCustomers / customers.length) * 100;
    const totalOrders = customers.reduce((s, c) => s + c.orders.length, 0);
    const avgOrders = totalOrders / customers.length;
    const avgOrderValue = totalRevenue / totalOrders;

    const displayName = customers[0].acquisitionSource.displayName;

    metrics.push({
      channel: key,
      displayName,
      customers: customers.length,
      totalRevenue,
      avgLTV,
      repeatCustomers,
      repeatRate,
      avgOrdersPerCustomer: avgOrders,
      avgOrderValue,
      ltvVsAverage: ((avgLTV - overallLTV) / overallLTV) * 100,
      repeatVsAverage: repeatRate - overallRepeat,
    });
  }

  // Sort by number of customers (most significant first)
  metrics.sort((a, b) => b.customers - a.customers);

  return metrics;
}

// ============ MONTHLY COHORTS ============

export function calculateMonthlyCohorts(customerMap: Map<number, CustomerData>): MonthlyCohort[] {
  const cohortMap = new Map<string, CustomerData[]>();

  for (const customer of customerMap.values()) {
    const date = new Date(customer.firstOrderDate);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!cohortMap.has(month)) {
      cohortMap.set(month, []);
    }
    cohortMap.get(month)!.push(customer);
  }

  const cohorts: MonthlyCohort[] = [];

  for (const [month, customers] of cohortMap) {
    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
    const repeatCustomers = customers.filter(c => c.orders.length > 1).length;

    cohorts.push({
      month,
      newCustomers: customers.length,
      totalRevenue,
      avgLTV: totalRevenue / customers.length,
      repeatCustomers,
      repeatRate: (repeatCustomers / customers.length) * 100,
    });
  }

  // Sort by month
  cohorts.sort((a, b) => a.month.localeCompare(b.month));

  return cohorts;
}

// ============ LTV GAP ============

export function calculateLTVGap(
  channels: ChannelMetrics[],
  bestChannel: ChannelMetrics | null
): { ltvGap: number; ltvGapExplanation: string } {
  if (!bestChannel || channels.length < 2) {
    return { ltvGap: 0, ltvGapExplanation: 'Insufficient data for LTV gap calculation' };
  }

  let ltvGap = 0;
  const improvements: string[] = [];

  for (const channel of channels) {
    if (channel.channel === bestChannel.channel) continue;

    const gap = (bestChannel.avgLTV - channel.avgLTV) * channel.customers;
    if (gap > 0) {
      ltvGap += gap;
      improvements.push(`${channel.displayName}: +₹${Math.round(bestChannel.avgLTV - channel.avgLTV).toLocaleString()}/customer`);
    }
  }

  const explanation = improvements.length > 0
    ? `If all channels matched ${bestChannel.displayName}'s LTV: ${improvements.slice(0, 3).join(', ')}`
    : 'All channels performing similarly';

  return { ltvGap, ltvGapExplanation: explanation };
}
