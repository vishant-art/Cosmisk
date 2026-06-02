/**
 * Fatigue Detection Service
 * Analyzes creative performance to detect fatigue signals before performance tanks.
 *
 * Fatigue Signals:
 * - Frequency > 3.5 = warning, > 4.5 = critical
 * - CTR declining (7-day trend)
 * - CPM spiking
 * - Days running > 14 with declining metrics
 */

import { logger } from '../utils/logger.js';
import {
  getClientContext, getFatigueDetectorStore, updateFatigueDetectorStore,
  getFatigueFrequencyThreshold, createRecommendation, type ServiceClient,
} from './service-clients.js';
// CLOSED-LOOP OPERATING SYSTEM
import { agentRecommend } from './recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from './agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from './strategic-memory.js';
import { v4 as uuidv4 } from 'uuid';

export interface CreativeMetrics {
  id: string;
  name: string;
  thumbnailUrl?: string;
  format: 'video' | 'image' | 'carousel';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  frequency: number;
  ctr: number;
  cpm: number;
  roas: number;
  daysActive: number;
  // Trend data (last 7 days)
  dailyCtr?: number[];
  dailyCpm?: number[];
}

export interface FatigueAlert {
  id: string;
  creativeId: string;
  creativeName: string;
  severity: 'critical' | 'warning';
  reason: string;
  frequency: number;
  ctrDecline: number;
  cpmIncrease: number;
  predictedDeath: string;
}

export type CreativeStatus = 'scaling' | 'healthy' | 'watch' | 'fatiguing' | 'dead';

export interface AnalyzedCreative extends CreativeMetrics {
  status: CreativeStatus;
}

/**
 * Analyze a list of creatives and detect fatigue
 */
export function analyzeCreatives(creatives: CreativeMetrics[]): AnalyzedCreative[] {
  return creatives.map(creative => {
    const status = determineStatus(creative);
    return { ...creative, status };
  });
}

/**
 * Determine the status of a creative based on its metrics
 */
function determineStatus(creative: CreativeMetrics): CreativeStatus {
  // Dead: zero conversions and high spend
  if (creative.conversions === 0 && creative.spend > 1000) {
    return 'dead';
  }

  // Critical fatigue: frequency > 4.5 or severe CTR decline
  if (creative.frequency > 4.5) {
    return 'fatiguing';
  }

  // Check CTR trend if available
  if (creative.dailyCtr && creative.dailyCtr.length >= 3) {
    const ctrDecline = computeDecline(creative.dailyCtr);
    if (ctrDecline > 20) {
      return 'fatiguing';
    }
  }

  // Watch: frequency between 3.5 and 4.5
  if (creative.frequency > 3.5) {
    return 'watch';
  }

  // Check for mild CTR decline
  if (creative.dailyCtr && creative.dailyCtr.length >= 3) {
    const ctrDecline = computeDecline(creative.dailyCtr);
    if (ctrDecline > 10) {
      return 'watch';
    }
  }

  // Scaling: high ROAS and recent
  if (creative.roas > 3 && creative.daysActive < 7) {
    return 'scaling';
  }

  // Healthy: good metrics
  if (creative.roas >= 1 && creative.frequency <= 3.5) {
    return 'healthy';
  }

  return 'watch';
}

/**
 * Generate fatigue alerts for creatives that need attention
 */
export function generateFatigueAlerts(creatives: CreativeMetrics[]): FatigueAlert[] {
  const alerts: FatigueAlert[] = [];

  for (const creative of creatives) {
    const alert = checkForFatigue(creative);
    if (alert) {
      alerts.push(alert);
    }
  }

  // Sort by severity (critical first) then by frequency
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.frequency - a.frequency;
  });
}

/**
 * Check a single creative for fatigue signals
 */
function checkForFatigue(creative: CreativeMetrics): FatigueAlert | null {
  const reasons: string[] = [];
  let severity: 'critical' | 'warning' = 'warning';

  // Check frequency
  if (creative.frequency > 4.5) {
    reasons.push(`Frequency at ${creative.frequency.toFixed(1)} (critical threshold: 4.5)`);
    severity = 'critical';
  } else if (creative.frequency > 3.5) {
    reasons.push(`Frequency approaching limit at ${creative.frequency.toFixed(1)}`);
  }

  // Check CTR decline
  let ctrDecline = 0;
  if (creative.dailyCtr && creative.dailyCtr.length >= 3) {
    ctrDecline = computeDecline(creative.dailyCtr);
    if (ctrDecline > 20) {
      reasons.push(`CTR dropped ${ctrDecline.toFixed(0)}% in last 3 days`);
      severity = 'critical';
    } else if (ctrDecline > 10) {
      reasons.push(`CTR declining (${ctrDecline.toFixed(0)}% drop)`);
    }
  }

  // Check CPM spike
  let cpmIncrease = 0;
  if (creative.dailyCpm && creative.dailyCpm.length >= 3) {
    cpmIncrease = computeIncrease(creative.dailyCpm);
    if (cpmIncrease > 30) {
      reasons.push(`CPM spiked ${cpmIncrease.toFixed(0)}%`);
      if (severity !== 'critical') severity = 'critical';
    } else if (cpmIncrease > 15) {
      reasons.push(`CPM increasing (${cpmIncrease.toFixed(0)}% up)`);
    }
  }

  // Check days active with low performance
  if (creative.daysActive > 14 && creative.roas < 1) {
    reasons.push(`Running ${creative.daysActive} days with below break-even ROAS`);
    severity = 'critical';
  }

  if (reasons.length === 0) {
    return null;
  }

  // Predict death timing
  let predictedDeath = '5-7 days';
  if (severity === 'critical') {
    if (creative.frequency > 5 || ctrDecline > 25) {
      predictedDeath = '24-48 hours';
    } else {
      predictedDeath = '48-72 hours';
    }
  } else {
    if (creative.frequency > 4) {
      predictedDeath = '3-5 days';
    }
  }

  return {
    id: `alert-${creative.id}`,
    creativeId: creative.id,
    creativeName: creative.name,
    severity,
    reason: reasons.join('. '),
    frequency: creative.frequency,
    ctrDecline,
    cpmIncrease,
    predictedDeath,
  };
}

/**
 * Compute percentage decline in a metric over its recent values
 * Compares last value to first value
 */
function computeDecline(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return 0;
  const decline = ((first - last) / first) * 100;
  return Math.max(0, decline); // Only return positive decline
}

/**
 * Compute percentage increase in a metric over its recent values
 */
function computeIncrease(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return 0;
  const increase = ((last - first) / first) * 100;
  return Math.max(0, increase); // Only return positive increase
}

/**
 * Calculate summary metrics for the command center
 */
export interface CommandSummary {
  brief: string;
  spend: { value: number; change: number; sparkline: number[] };
  roas: { value: number; change: number; sparkline: number[] };
  savings: { value: number; change: number };
  fatigueCount: number;
  winnerCount: number;
  wastedSpend: number;
}

export function generateSummary(
  creatives: AnalyzedCreative[],
  alerts: FatigueAlert[],
  dailySpend: number[],
  dailyRoas: number[]
): CommandSummary {
  // Calculate totals
  const totalSpend = creatives.reduce((sum, c) => sum + c.spend, 0);
  const totalRevenue = creatives.reduce((sum, c) => sum + c.revenue, 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Calculate change (compare last 3 days to previous 3 days)
  const spendChange = computeRecentChange(dailySpend);
  const roasChange = computeRecentChange(dailyRoas);

  // Count winners and fatiguing
  const winnerCount = creatives.filter(c => c.status === 'scaling' || (c.status === 'healthy' && c.roas > 3)).length;
  const fatigueCount = alerts.length;

  // Calculate wasted spend (dead creatives)
  const wastedSpend = creatives
    .filter(c => c.status === 'dead' || c.roas < 0.5)
    .reduce((sum, c) => sum + c.spend, 0);

  // Generate brief
  const brief = generateBrief(creatives, alerts, avgRoas, wastedSpend);

  return {
    brief,
    spend: { value: totalSpend, change: spendChange, sparkline: dailySpend.slice(-7) },
    roas: { value: avgRoas, change: roasChange, sparkline: dailyRoas.slice(-7) },
    savings: { value: wastedSpend, change: 0 }, // Potential savings
    fatigueCount,
    winnerCount,
    wastedSpend,
  };
}

function computeRecentChange(values: number[]): number {
  if (values.length < 6) return 0;
  const recent = values.slice(-3);
  const prior = values.slice(-6, -3);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (priorAvg === 0) return 0;
  return ((recentAvg - priorAvg) / priorAvg) * 100;
}

function generateBrief(
  creatives: AnalyzedCreative[],
  alerts: FatigueAlert[],
  avgRoas: number,
  wastedSpend: number
): string {
  const lines: string[] = [];

  // Fatigue alerts
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  if (criticalCount > 0) {
    lines.push(`⚠️ ${criticalCount} ad(s) need replacement in the next 48-72 hours`);
  } else if (alerts.length > 0) {
    lines.push(`📊 ${alerts.length} ad(s) showing early fatigue signals — monitor closely`);
  }

  // Winners
  const topPerformers = creatives.filter(c => c.roas > 5).sort((a, b) => b.roas - a.roas).slice(0, 2);
  if (topPerformers.length > 0) {
    const names = topPerformers.map(c => c.name.slice(0, 25)).join(', ');
    lines.push(`📈 Top performers: ${names} (${topPerformers[0].roas.toFixed(1)}x ROAS)`);
  }

  // Wasted spend
  if (wastedSpend > 1000) {
    lines.push(`🛑 Rs ${Math.round(wastedSpend / 100) * 100} wasted on underperforming ads — consider pausing`);
  }

  // Overall health
  if (avgRoas > 3) {
    lines.push(`✅ Overall account ROAS at ${avgRoas.toFixed(1)}x — performing well`);
  } else if (avgRoas < 1) {
    lines.push(`⚡ Account ROAS at ${avgRoas.toFixed(1)}x — needs optimization`);
  }

  // Recommendation
  if (criticalCount > 0) {
    lines.push(`\n💡 Priority: Generate replacement creatives for fatiguing ads`);
  } else if (topPerformers.length > 0) {
    lines.push(`\n💡 Recommendation: Create more creatives for your winning products`);
  }

  return lines.join('\n');
}

// ============ CLIENT-AWARE FATIGUE DETECTION ============

export interface ClientFatigueReport {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  frequencyThreshold: number;
  creatives: AnalyzedCreative[];
  alerts: FatigueAlert[];
  newFatiguedCreatives: string[];   // IDs not previously flagged
  previouslyKnown: string[];        // IDs we already knew about
  summary: {
    total: number;
    scaling: number;
    healthy: number;
    watch: number;
    fatiguing: number;
    dead: number;
  };
  shouldAlert: boolean;
  alertReason?: string;
  checkedAt: string;
}

/**
 * Detect creative fatigue for a specific client
 * - Uses client's frequency threshold based on revenue level
 * - Tracks known fatigued creatives for deduplication
 * - Generates client-specific recommendations
 */
export async function detectFatigueForClient(
  clientId: string,
  creatives: CreativeMetrics[],
): Promise<ClientFatigueReport | null> {
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[Fatigue Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const fatigueStore = await getFatigueDetectorStore(clientId);

  // === STRATEGIC MEMORY: Load context from previous runs ===
  const strategicContext = await getStrategicContextForAgent(clientId);
  if (strategicContext) {
    logger.info({ contextLength: strategicContext.length }, '[Fatigue] Loaded strategic context');
  }

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
    creativesCount: creatives.length,
  }, '[Fatigue Client] Starting detection');

  // Get frequency threshold for this client
  const frequencyThreshold = getFatigueFrequencyThreshold(client);
  logger.info({ frequencyThreshold }, '[Fatigue Client] Using frequency threshold');

  // Analyze creatives
  const analyzedCreatives = analyzeCreatives(creatives);

  // Generate alerts (using standard function)
  const alerts = generateFatigueAlerts(creatives);

  // Count by status
  const summary = {
    total: analyzedCreatives.length,
    scaling: analyzedCreatives.filter(c => c.status === 'scaling').length,
    healthy: analyzedCreatives.filter(c => c.status === 'healthy').length,
    watch: analyzedCreatives.filter(c => c.status === 'watch').length,
    fatiguing: analyzedCreatives.filter(c => c.status === 'fatiguing').length,
    dead: analyzedCreatives.filter(c => c.status === 'dead').length,
  };

  // Find creatives above client's frequency threshold
  const fatiguedIds = analyzedCreatives
    .filter(c => c.frequency >= frequencyThreshold || c.status === 'fatiguing' || c.status === 'dead')
    .map(c => c.id);

  // Identify NEW fatigued creatives vs previously known
  const knownIds = fatigueStore?.knownFatiguedCreatives || [];
  const newFatiguedCreatives = fatiguedIds.filter(id => !knownIds.includes(id));
  const previouslyKnown = fatiguedIds.filter(id => knownIds.includes(id));

  // Determine if we should alert
  const shouldAlert = newFatiguedCreatives.length > 0;
  const alertReason = shouldAlert
    ? `${newFatiguedCreatives.length} new creatives above ${frequencyThreshold} frequency threshold`
    : undefined;

  logger.info({
    totalFatigued: fatiguedIds.length,
    newFatigued: newFatiguedCreatives.length,
    shouldAlert,
  }, '[Fatigue Client] Alert decision');

  // Update fatigue store
  const allKnownIds = [...new Set([...knownIds, ...fatiguedIds])];
  await updateFatigueDetectorStore(clientId, {
    lastCheckedAt: new Date().toISOString(),
    knownFatiguedCreatives: allKnownIds,
    totalFatiguedCount: (fatigueStore?.totalFatiguedCount || 0) + newFatiguedCreatives.length,
    alertsSent: shouldAlert ? (fatigueStore?.alertsSent || 0) + 1 : fatigueStore?.alertsSent || 0,
    lastAlertAt: shouldAlert ? new Date().toISOString() : fatigueStore?.lastAlertAt,
  });

  // Create recommendation if new fatigued creatives found
  if (shouldAlert) {
    await createRecommendation(clientId, 'fatigue_detector', 'replace_fatigued_creatives', {
      newFatiguedCount: newFatiguedCreatives.length,
      frequencyThreshold,
      topFatigued: analyzedCreatives
        .filter(c => newFatiguedCreatives.includes(c.id))
        .slice(0, 5)
        .map(c => ({ name: c.name, frequency: c.frequency, status: c.status })),
    });

    // === STRATEGIC MEMORY: Record episode for fatigue detection ===
    recordEpisode(
      'system',
      'watchdog',
      `Fatigue Alert: ${newFatiguedCreatives.length} creatives exceeded threshold (${frequencyThreshold}) for ${client.brandName}`,
      JSON.stringify({ newFatigued: newFatiguedCreatives.length, totalAnalyzed: creatives.length, frequencyThreshold }),
      'pending'
    ).catch(epErr => logger.warn({ err: epErr }, '[Fatigue] Episode recording failed'));

    // === CLOSED-LOOP OPERATING SYSTEM ===
    const topFatigued = analyzedCreatives.find(c => newFatiguedCreatives.includes(c.id));
    if (topFatigued) {
      try {
        await agentRecommend(clientId, 'fatigue_detector', {
          type: 'refresh_creative',
          entityType: 'creative',
          entityId: topFatigued.id,
          entityName: topFatigued.name,
          action: 'Replace fatigued creatives with fresh variants',
          reasoning: `${newFatiguedCreatives.length} creatives have exceeded frequency threshold (${frequencyThreshold}). Top: ${topFatigued.name} at ${topFatigued.frequency} frequency`,
          evidence: [
            `${newFatiguedCreatives.length} creatives fatigued`,
            `Frequency threshold: ${frequencyThreshold}`,
            `Top fatigued: ${topFatigued.name} (freq: ${topFatigued.frequency})`,
            `Status: ${topFatigued.status}`,
          ],
          confidence: 80,
          predictedSavings: 0, // Hard to estimate savings from fatigue
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[Fatigue] Closed-loop tracking failed');
      }
    }
  }

  // === STRATEGIC MEMORY: Record report summary ===
  try {
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: 'fatigue-detection',
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: `Fatigue Report: ${summary.fatiguing} fatiguing, ${summary.dead} dead creatives`,
      keyInsights: [
        `Frequency threshold: ${frequencyThreshold}`,
        `Status: ${summary.scaling} scaling, ${summary.healthy} healthy, ${summary.watch} watch`,
        shouldAlert ? `${newFatiguedCreatives.length} creatives need replacement` : 'No immediate action needed',
      ],
      recommendations: shouldAlert ? [`Replace ${newFatiguedCreatives.length} fatigued creatives`] : [],
      metricsSnapshot: { ...summary, frequencyThreshold },
      qualityScore: 80,
      wasShipped: shouldAlert,
      shipDecision: shouldAlert ? 'SHIP' : 'HOLD',
      deliveredVia: [],
    };
    await recordReport(reportRecord);
  } catch (repErr) {
    logger.warn({ err: repErr }, '[Fatigue] Report recording failed');
  }

  return {
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel || 'unknown',
    frequencyThreshold,
    creatives: analyzedCreatives,
    alerts,
    newFatiguedCreatives,
    previouslyKnown,
    summary,
    shouldAlert,
    alertReason,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Generate Smashed-branded HTML report for Fatigue Detection
 */
export function generateFatigueHTMLReport(report: ClientFatigueReport, client: ServiceClient): string {
  const statusColors: Record<CreativeStatus, string> = {
    scaling: '#22c55e',
    healthy: '#3b82f6',
    watch: '#eab308',
    fatiguing: '#f97316',
    dead: '#ef4444',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Creative Fatigue Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .status-bar { display: flex; justify-content: center; gap: 20px; margin-top: 30px; flex-wrap: wrap; }
    .status-item { text-align: center; padding: 16px 24px; background: #151515; border-radius: 12px; min-width: 100px; }
    .status-count { font-size: 28px; font-weight: 700; }
    .status-label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 4px; }
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }
    .creatives-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .creative-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; }
    .creative-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .creative-name { font-size: 14px; color: #fff; font-weight: 600; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .creative-status { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #000; }
    .creative-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .creative-stat { text-align: center; padding: 8px; background: #1a1a1a; border-radius: 6px; }
    .creative-stat-value { font-size: 16px; font-weight: 700; color: #EC8A23; }
    .creative-stat-label { font-size: 10px; color: #666; text-transform: uppercase; }
    .new-badge { background: #ef4444; color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; }
    .alert-section { background: #1a1a1a; border: 1px solid #ef4444; border-radius: 12px; padding: 24px; margin: 40px 0; }
    .alert-title { color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
    .alert-item { padding: 12px 0; border-bottom: 1px solid #2a2a2a; }
    .alert-item:last-child { border-bottom: none; }
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Creative Fatigue Report</h1>
    <div class="subtitle">${client.brandName} — Frequency Threshold: ${report.frequencyThreshold}+</div>
    <div class="status-bar">
      <div class="status-item">
        <div class="status-count" style="color: ${statusColors.scaling}">${report.summary.scaling}</div>
        <div class="status-label">Scaling</div>
      </div>
      <div class="status-item">
        <div class="status-count" style="color: ${statusColors.healthy}">${report.summary.healthy}</div>
        <div class="status-label">Healthy</div>
      </div>
      <div class="status-item">
        <div class="status-count" style="color: ${statusColors.watch}">${report.summary.watch}</div>
        <div class="status-label">Watch</div>
      </div>
      <div class="status-item">
        <div class="status-count" style="color: ${statusColors.fatiguing}">${report.summary.fatiguing}</div>
        <div class="status-label">Fatiguing</div>
      </div>
      <div class="status-item">
        <div class="status-count" style="color: ${statusColors.dead}">${report.summary.dead}</div>
        <div class="status-label">Dead</div>
      </div>
    </div>
  </div>

  <div class="container">
    ${report.alerts.length > 0 ? `
    <div class="alert-section">
      <div class="alert-title">⚠️ ${report.alerts.length} Fatigue Alerts</div>
      ${report.alerts.map(a => `
        <div class="alert-item">
          <div style="font-weight:600;color:#fff;">${a.creativeName}</div>
          <div style="font-size:13px;color:#aaa;margin-top:4px;">${a.reason}</div>
          <div style="font-size:12px;color:#888;margin-top:4px;">Frequency: ${a.frequency.toFixed(1)} | CTR Decline: ${a.ctrDecline.toFixed(1)}% | Predicted: ${a.predictedDeath}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">All Creatives (${report.summary.total})</h2>
      <div class="creatives-grid">
        ${report.creatives.map(c => `
          <div class="creative-card" style="border-left: 4px solid ${statusColors[c.status]};">
            <div class="creative-header">
              <span class="creative-name">${c.name}${report.newFatiguedCreatives.includes(c.id) ? '<span class="new-badge">NEW</span>' : ''}</span>
              <span class="creative-status" style="background: ${statusColors[c.status]}">${c.status}</span>
            </div>
            <div class="creative-stats">
              <div class="creative-stat">
                <div class="creative-stat-value">${c.frequency.toFixed(1)}</div>
                <div class="creative-stat-label">Frequency</div>
              </div>
              <div class="creative-stat">
                <div class="creative-stat-value">${c.ctr.toFixed(2)}%</div>
                <div class="creative-stat-label">CTR</div>
              </div>
              <div class="creative-stat">
                <div class="creative-stat-value">${c.roas.toFixed(1)}x</div>
                <div class="creative-stat-label">ROAS</div>
              </div>
              <div class="creative-stat">
                <div class="creative-stat-value">₹${c.spend.toLocaleString('en-IN')}</div>
                <div class="creative-stat-label">Spend</div>
              </div>
              <div class="creative-stat">
                <div class="creative-stat-value">${c.daysActive}d</div>
                <div class="creative-stat-label">Active</div>
              </div>
              <div class="creative-stat">
                <div class="creative-stat-value">${c.conversions}</div>
                <div class="creative-stat-label">Conv.</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${report.shouldAlert ? `
    <div class="section">
      <h2 class="section-title">Recommendation</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #EC8A23;border-radius:12px;padding:24px;">
        <div style="font-size:11px;color:#EC8A23;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Action Required</div>
        <div style="font-size:16px;color:#fff;margin-bottom:12px;">
          ${report.newFatiguedCreatives.length} creatives have crossed the ${report.frequencyThreshold} frequency threshold for ${client.brandName}'s revenue level.
        </div>
        <div style="font-size:14px;color:#6ee7b7;">
          → Create replacement creatives for fatiguing ads. Consider new angles, hooks, or formats to refresh the creative mix.
        </div>
      </div>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
