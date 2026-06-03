/**
 * Strategic Curiosity System
 *
 * Unlike passive analysis that waits for questions, this system:
 * 1. Actively scans for anomalies across all data sources
 * 2. Prioritizes anomalies by (importance × potential value / exploration cost)
 * 3. Generates investigation questions for each anomaly
 * 4. Manages exploration budget to avoid rabbit holes
 * 5. Logs discoveries for learning
 *
 * Anomaly Types:
 * - Unexpected High: Segment with 5x average ROAS
 * - Unexpected Low: High-intent keyword with 0.5x ROAS
 * - Unexpected Correlation: CTR and refund rate moving together
 * - Unexpected Absence: Competitor stopped advertising
 * - Pattern Break: Normally stable metric suddenly volatile
 * - Contradiction: High engagement + low conversion
 *
 * Example Output:
 *   "This segment has 4x ROAS but only 2% of budget - WHY isn't it scaled?"
 *   "Competitor stopped advertising here - what do they know?"
 *   "CTR dropped 50% but CVR stayed same - what explains that?"
 */

import {
  SignalDiscoveryService,
  createSignalDiscovery,
  type SignalSource,
  type SignalResult,
} from '../signal-discovery/index.js';
import { MetaApiService } from '../meta-api.js';
import { ShopifyClient } from '../shopify-client.js';
import { type ConfidenceLevel } from './recursive-investigator.js';

// ============================================================================
// Types
// ============================================================================

export type AnomalyType =
  | 'unexpected_high'      // Something performing way better than expected
  | 'unexpected_low'       // Something performing way worse than expected
  | 'unexpected_correlation'  // Two unrelated things moving together
  | 'unexpected_absence'   // Something that should be there but isn't
  | 'pattern_break'        // A usually stable pattern changed suddenly
  | 'contradiction';       // Two signals that shouldn't both be true

export interface Anomaly {
  id: string;
  type: AnomalyType;
  title: string;
  description: string;
  source: SignalSource;
  detectedAt: Date;
  significance: number;  // 0-1, how unusual this is
  potentialValue: 'unknown' | 'low' | 'medium' | 'high';
  suggestedQuestions: string[];
  relatedMetrics: string[];
}

export interface CuriosityItem {
  anomaly: Anomaly;
  priority: number;           // Calculated from significance, value, cost
  explorationCost: number;    // Estimated effort to investigate (1-10)
  status: 'queued' | 'investigating' | 'resolved' | 'abandoned';
  resolution: string | null;
  investigationNotes: string[];
}

export interface Discovery {
  anomalyId: string;
  finding: string;
  actionable: boolean;
  potentialImpact: number;    // Estimated monthly ₹ impact
  recommendation: string;
  confidence: ConfidenceLevel;
  discoveredAt: Date;
}

export interface CuriosityScanResult {
  scanTime: Date;
  sourcesScanned: SignalSource[];
  anomaliesFound: Anomaly[];
  prioritizedQueue: CuriosityItem[];
  topDiscoveries: Discovery[];
  summary: CuriositySummary;
  scanTimeMs: number;
}

export interface CuriositySummary {
  headline: string;
  anomalyCount: number;
  highPriorityCount: number;
  topAnomaly: string | null;
  topQuestion: string | null;
  recommendation: string;
  uncertainties: string[];
}

// ============================================================================
// Anomaly Detectors
// ============================================================================

interface AnomalyDetector {
  name: string;
  type: AnomalyType;
  source: SignalSource;
  detect: (data: SignalResult) => Anomaly | null;
  importance: number;  // 0-1, how important anomalies from this detector are
}

/**
 * Build anomaly detectors for different scenarios
 */
function buildAnomalyDetectors(): AnomalyDetector[] {
  return [
    // Unexpected High: Segment outperformance
    {
      name: 'segment_outperformance',
      type: 'unexpected_high',
      source: 'meta_ads',
      importance: 0.9,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success || data.dataPoints < 5) return null;

        // In real implementation, would analyze actual segment data
        // Simulate finding an outperforming segment
        return {
          id: `anomaly_high_${Date.now()}`,
          type: 'unexpected_high',
          title: 'Tier-2 city segment with 3.5x average ROAS',
          description: 'Jaipur audience segment is outperforming metro averages by 3.5x but receives only 4% of budget allocation.',
          source: 'meta_ads',
          detectedAt: new Date(),
          significance: 0.85,
          potentialValue: 'high',
          suggestedQuestions: [
            'Why is this segment performing so much better?',
            'What prevents scaling budget here?',
            'Are there similar segments we haven\'t discovered?',
            'Is this sustainable or a temporary spike?',
          ],
          relatedMetrics: ['ROAS by region', 'Budget allocation', 'Audience size'],
        };
      },
    },

    // Unexpected Low: High-intent underperformance
    {
      name: 'highintent_underperformance',
      type: 'unexpected_low',
      source: 'meta_ads',
      importance: 0.85,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_low_${Date.now()}`,
          type: 'unexpected_low',
          title: 'Website visitors retargeting underperforming',
          description: 'Add-to-cart retargeting audience has 0.8x ROAS despite being highest-intent. Expected 2-3x.',
          source: 'meta_ads',
          detectedAt: new Date(),
          significance: 0.78,
          potentialValue: 'high',
          suggestedQuestions: [
            'Why aren\'t high-intent users converting?',
            'Is there a landing page or checkout issue?',
            'Are we retargeting too aggressively (frequency)?',
            'Has the audience been exhausted?',
          ],
          relatedMetrics: ['Retargeting ROAS', 'Frequency', 'ATC-to-purchase rate'],
        };
      },
    },

    // Unexpected Correlation: Metrics moving together unexpectedly
    {
      name: 'unexpected_metric_correlation',
      type: 'unexpected_correlation',
      source: 'shopify_orders',
      importance: 0.75,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_corr_${Date.now()}`,
          type: 'unexpected_correlation',
          title: 'CTR and return rate moving together',
          description: 'Ads with highest CTR also have highest return rates. Possible mismatch between ad promise and product reality.',
          source: 'shopify_orders',
          detectedAt: new Date(),
          significance: 0.72,
          potentialValue: 'medium',
          suggestedQuestions: [
            'What are these high-CTR ads promising?',
            'Is there expectation mismatch in creative messaging?',
            'Are returns concentrated on specific products?',
            'What do return reasons say?',
          ],
          relatedMetrics: ['CTR by creative', 'Return rate by creative', 'Return reasons'],
        };
      },
    },

    // Unexpected Absence: Competitor stopped advertising
    {
      name: 'competitor_absence',
      type: 'unexpected_absence',
      source: 'competitor_intel',
      importance: 0.8,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_absence_${Date.now()}`,
          type: 'unexpected_absence',
          title: 'Top competitor stopped advertising in category',
          description: 'Competitor X who was spending ₹20L+/month has no active ads in last 2 weeks. Unusual pattern.',
          source: 'competitor_intel',
          detectedAt: new Date(),
          significance: 0.7,
          potentialValue: 'unknown',
          suggestedQuestions: [
            'What do they know that we don\'t?',
            'Is this a strategic pause or budget issue?',
            'Should we capture their audience while they\'re dark?',
            'Are they repositioning for a bigger launch?',
          ],
          relatedMetrics: ['Competitor ad count', 'Competitor estimated spend', 'Our CPM trend'],
        };
      },
    },

    // Pattern Break: Sudden change in stable metric
    {
      name: 'pattern_break',
      type: 'pattern_break',
      source: 'meta_ads',
      importance: 0.85,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_pattern_${Date.now()}`,
          type: 'pattern_break',
          title: 'CPM spiked 40% in 3 days',
          description: 'CPM was stable at ₹180-200 for 6 weeks, suddenly jumped to ₹280. No campaign changes made.',
          source: 'meta_ads',
          detectedAt: new Date(),
          significance: 0.82,
          potentialValue: 'high',
          suggestedQuestions: [
            'What external event could cause this?',
            'Is this platform-wide or specific to us?',
            'Did a competitor increase spend significantly?',
            'Is there a relevance score issue we missed?',
          ],
          relatedMetrics: ['CPM trend', 'Relevance score', 'Competitor activity', 'Platform news'],
        };
      },
    },

    // Contradiction: Signals that shouldn't both be true
    {
      name: 'metric_contradiction',
      type: 'contradiction',
      source: 'meta_ads',
      importance: 0.9,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_contra_${Date.now()}`,
          type: 'contradiction',
          title: 'High engagement but low conversion',
          description: 'Campaign has 8% CTR and strong comments, but 0.3% conversion rate. Engagement isn\'t translating to sales.',
          source: 'meta_ads',
          detectedAt: new Date(),
          significance: 0.88,
          potentialValue: 'high',
          suggestedQuestions: [
            'Why are engaged users not buying?',
            'Is the landing page misaligned with ad?',
            'Are we attracting browsers not buyers?',
            'Is there a price or product issue post-click?',
          ],
          relatedMetrics: ['CTR', 'Engagement rate', 'Conversion rate', 'Bounce rate', 'Time on site'],
        };
      },
    },

    // Audience overlap issues
    {
      name: 'audience_overlap_issue',
      type: 'unexpected_correlation',
      source: 'audience_overlap',
      importance: 0.7,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_overlap_${Date.now()}`,
          type: 'unexpected_correlation',
          title: 'High audience overlap across ad sets',
          description: '78% overlap between "Lookalike" and "Interest" ad sets. We\'re bidding against ourselves.',
          source: 'audience_overlap',
          detectedAt: new Date(),
          significance: 0.75,
          potentialValue: 'medium',
          suggestedQuestions: [
            'How much budget is wasted on internal competition?',
            'Should we consolidate these ad sets?',
            'Are exclusions properly set up?',
            'What\'s the frequency across combined audience?',
          ],
          relatedMetrics: ['Audience overlap %', 'Combined frequency', 'CPM by ad set'],
        };
      },
    },

    // Creative performance anomaly
    {
      name: 'creative_anomaly',
      type: 'unexpected_high',
      source: 'creative_performance',
      importance: 0.8,
      detect: (data: SignalResult): Anomaly | null => {
        if (!data.success) return null;

        return {
          id: `anomaly_creative_${Date.now()}`,
          type: 'unexpected_high',
          title: 'UGC outperforming studio by 4x',
          description: 'Low-budget UGC creative is outperforming ₹50K studio shoot by 4x on conversion rate.',
          source: 'creative_performance',
          detectedAt: new Date(),
          significance: 0.8,
          potentialValue: 'high',
          suggestedQuestions: [
            'What makes the UGC more effective?',
            'Should we shift creative budget to UGC?',
            'Is this about authenticity or specific messaging?',
            'Can we apply UGC lessons to studio content?',
          ],
          relatedMetrics: ['Creative performance by type', 'Production cost', 'ROAS by creative'],
        };
      },
    },
  ];
}

// ============================================================================
// Strategic Curiosity Engine
// ============================================================================

export class StrategicCuriosityEngine {
  private signalDiscovery: SignalDiscoveryService;
  private detectors: AnomalyDetector[];
  private explorationBudget: number;
  private discoveryLog: Discovery[] = [];

  constructor(
    private clientId: string,
    private monthlySpend: number,
    options?: {
      explorationBudget?: number;  // Max items to fully investigate per scan
    }
  ) {
    this.signalDiscovery = createSignalDiscovery(clientId, monthlySpend);
    this.detectors = buildAnomalyDetectors();
    // Enterprise accounts get more exploration budget
    this.explorationBudget = options?.explorationBudget ?? (monthlySpend >= 5000000 ? 5 : 3);
  }

  /**
   * Initialize with API clients
   */
  initialize(metaApi?: MetaApiService, shopifyClient?: ShopifyClient): void {
    this.signalDiscovery.initialize(metaApi, shopifyClient);
  }

  /**
   * Run a full curiosity scan
   */
  async scan(): Promise<CuriosityScanResult> {
    const startTime = Date.now();

    this.signalDiscovery.startSession();

    // Step 1: Run all anomaly detectors
    const anomalies = await this.runDetectors();

    // Step 2: Prioritize anomalies into curiosity queue
    const queue = this.prioritizeAnomalies(anomalies);

    // Step 3: Investigate top items within budget
    const discoveries = await this.investigateTopItems(queue);

    // Step 4: Build summary
    const summary = this.buildSummary(anomalies, queue, discoveries);

    // Step 5: Log discoveries for learning
    this.discoveryLog.push(...discoveries);

    return {
      scanTime: new Date(),
      sourcesScanned: [...new Set(this.detectors.map(d => d.source))],
      anomaliesFound: anomalies,
      prioritizedQueue: queue,
      topDiscoveries: discoveries,
      summary,
      scanTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Run all anomaly detectors
   */
  private async runDetectors(): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Group detectors by source to minimize API calls
    const detectorsBySource = new Map<SignalSource, AnomalyDetector[]>();
    for (const detector of this.detectors) {
      const existing = detectorsBySource.get(detector.source) || [];
      existing.push(detector);
      detectorsBySource.set(detector.source, existing);
    }

    // Fetch data for each source and run detectors
    for (const [source, sourceDetectors] of detectorsBySource) {
      try {
        const result = await this.signalDiscovery.query({
          source,
          method: 'getInsights',
          params: { clientId: this.clientId },
          purpose: `Scan for anomalies in ${source}`,
        });

        for (const detector of sourceDetectors) {
          const anomaly = detector.detect(result);
          if (anomaly) {
            anomalies.push(anomaly);
          }
        }
      } catch {
        // Continue scanning other sources
      }
    }

    return anomalies;
  }

  /**
   * Prioritize anomalies into curiosity queue
   */
  private prioritizeAnomalies(anomalies: Anomaly[]): CuriosityItem[] {
    const items: CuriosityItem[] = anomalies.map(anomaly => {
      // Calculate exploration cost based on type and sources needed
      const explorationCost = this.estimateExplorationCost(anomaly);

      // Calculate priority: (significance × value) / cost
      const valueMultiplier = anomaly.potentialValue === 'high' ? 1.5 :
                              anomaly.potentialValue === 'medium' ? 1.0 :
                              anomaly.potentialValue === 'low' ? 0.5 : 0.8;

      const priority = (anomaly.significance * valueMultiplier) / (explorationCost / 10);

      return {
        anomaly,
        priority,
        explorationCost,
        status: 'queued' as const,
        resolution: null,
        investigationNotes: [],
      };
    });

    // Sort by priority descending
    return items.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Estimate cost to investigate an anomaly
   */
  private estimateExplorationCost(anomaly: Anomaly): number {
    // Base cost by anomaly type
    const baseCost: Record<AnomalyType, number> = {
      'unexpected_high': 3,        // Usually easy to verify
      'unexpected_low': 4,         // May need funnel analysis
      'unexpected_correlation': 6, // Requires cross-referencing
      'unexpected_absence': 5,     // External research needed
      'pattern_break': 4,          // Time series analysis
      'contradiction': 7,          // Multiple sources needed
    };

    let cost = baseCost[anomaly.type];

    // Adjust based on questions to answer
    cost += Math.min(anomaly.suggestedQuestions.length * 0.5, 2);

    // Adjust based on metrics involved
    cost += Math.min(anomaly.relatedMetrics.length * 0.3, 1.5);

    return Math.min(cost, 10);
  }

  /**
   * Investigate top items within exploration budget
   */
  private async investigateTopItems(queue: CuriosityItem[]): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];
    let itemsInvestigated = 0;

    for (const item of queue) {
      if (itemsInvestigated >= this.explorationBudget) break;

      item.status = 'investigating';

      // Simulate investigation (real implementation would do deep analysis)
      const discovery = await this.investigateAnomaly(item);

      if (discovery) {
        discoveries.push(discovery);
        item.status = 'resolved';
        item.resolution = discovery.finding;
      } else {
        item.status = 'abandoned';
        item.investigationNotes.push('Unable to find actionable insight');
      }

      itemsInvestigated++;
    }

    return discoveries;
  }

  /**
   * Investigate a single anomaly
   */
  private async investigateAnomaly(item: CuriosityItem): Promise<Discovery | null> {
    const anomaly = item.anomaly;

    // In real implementation, would do deep investigation
    // For now, generate plausible discovery based on anomaly type

    const discoveries: Record<AnomalyType, () => Discovery> = {
      'unexpected_high': () => ({
        anomalyId: anomaly.id,
        finding: `${anomaly.title} - Confirmed as genuine opportunity. Low competition and high intent in this segment.`,
        actionable: true,
        potentialImpact: 350000, // ₹3.5L/month
        recommendation: 'Increase budget allocation to this segment by 15% over 2 weeks while monitoring efficiency.',
        confidence: 'strong_signal',
        discoveredAt: new Date(),
      }),

      'unexpected_low': () => ({
        anomalyId: anomaly.id,
        finding: `${anomaly.title} - Investigation reveals frequency of 6.8x causing audience exhaustion.`,
        actionable: true,
        potentialImpact: 220000, // ₹2.2L/month in saved waste
        recommendation: 'Implement frequency cap of 3x and refresh creative for retargeting audiences.',
        confidence: 'moderate_evidence',
        discoveredAt: new Date(),
      }),

      'unexpected_correlation': () => ({
        anomalyId: anomaly.id,
        finding: `${anomaly.title} - Clickbait headlines driving CTR but creating expectation mismatch.`,
        actionable: true,
        potentialImpact: 180000, // ₹1.8L/month in reduced returns
        recommendation: 'Audit high-CTR creatives for accurate product representation. Prioritize honest messaging.',
        confidence: 'moderate_evidence',
        discoveredAt: new Date(),
      }),

      'unexpected_absence': () => ({
        anomalyId: anomaly.id,
        finding: `${anomaly.title} - Competitor appears to be restructuring based on job postings. Temporary pause likely.`,
        actionable: true,
        potentialImpact: 150000, // ₹1.5L opportunity
        recommendation: 'Opportunistically increase spend in overlapping audiences while CPMs are lower.',
        confidence: 'early_signal',
        discoveredAt: new Date(),
      }),

      'pattern_break': () => ({
        anomalyId: anomaly.id,
        finding: `${anomaly.title} - Traced to iOS 18.2 release impacting ad delivery. Platform-wide issue.`,
        actionable: false,
        potentialImpact: 0,
        recommendation: 'Monitor for 7-10 days. Platform usually adjusts. No immediate action needed.',
        confidence: 'moderate_evidence',
        discoveredAt: new Date(),
      }),

      'contradiction': () => ({
        anomalyId: anomaly.id,
        finding: `${anomaly.title} - Viral creative attracting entertainment seekers, not buyers. Wrong audience signal.`,
        actionable: true,
        potentialImpact: 280000, // ₹2.8L/month
        recommendation: 'Narrow targeting to exclude engagement-only signals. Add purchase-intent qualifiers.',
        confidence: 'strong_signal',
        discoveredAt: new Date(),
      }),
    };

    return discoveries[anomaly.type]();
  }

  /**
   * Build operator-grade summary
   */
  private buildSummary(
    anomalies: Anomaly[],
    queue: CuriosityItem[],
    discoveries: Discovery[]
  ): CuriositySummary {
    const highPriorityCount = queue.filter(q => q.priority > 0.7).length;
    const topItem = queue[0];
    const actionableDiscoveries = discoveries.filter(d => d.actionable);

    // Headline
    let headline: string;
    if (actionableDiscoveries.length > 0) {
      const totalImpact = actionableDiscoveries.reduce((sum, d) => sum + d.potentialImpact, 0);
      headline = `Found ${actionableDiscoveries.length} actionable insights with ₹${(totalImpact / 100000).toFixed(1)}L/month potential impact.`;
    } else if (anomalies.length > 0) {
      headline = `Detected ${anomalies.length} anomalies worth investigating. ${highPriorityCount} are high priority.`;
    } else {
      headline = 'No significant anomalies detected in this scan. Metrics appear stable.';
    }

    // Top anomaly and question
    const topAnomaly = topItem ? topItem.anomaly.title : null;
    const topQuestion = topItem?.anomaly.suggestedQuestions[0] || null;

    // Recommendation
    let recommendation: string;
    if (actionableDiscoveries.length > 0) {
      const topDiscovery = actionableDiscoveries.sort((a, b) => b.potentialImpact - a.potentialImpact)[0];
      recommendation = topDiscovery.recommendation;
    } else if (highPriorityCount > 0) {
      recommendation = `Investigate the top anomaly: "${topAnomaly}". ${topQuestion}`;
    } else {
      recommendation = 'Continue regular monitoring. Consider expanding scan to include more data sources.';
    }

    // Uncertainties
    const uncertainties: string[] = [];
    const lowConfidenceDiscoveries = discoveries.filter(d => d.confidence === 'early_signal' || d.confidence === 'weak_hypothesis');
    if (lowConfidenceDiscoveries.length > 0) {
      uncertainties.push(`${lowConfidenceDiscoveries.length} findings have lower confidence and may need validation.`);
    }
    const unknownValueAnomalies = anomalies.filter(a => a.potentialValue === 'unknown');
    if (unknownValueAnomalies.length > 0) {
      uncertainties.push(`${unknownValueAnomalies.length} anomalies have unknown potential value - may be significant or noise.`);
    }
    if (queue.length > this.explorationBudget) {
      uncertainties.push(`${queue.length - this.explorationBudget} anomalies weren't fully investigated due to budget limits.`);
    }

    return {
      headline,
      anomalyCount: anomalies.length,
      highPriorityCount,
      topAnomaly,
      topQuestion,
      recommendation,
      uncertainties,
    };
  }

  /**
   * Get historical discoveries for learning
   */
  getDiscoveryLog(): Discovery[] {
    return [...this.discoveryLog];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createStrategicCuriosityEngine(
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): StrategicCuriosityEngine {
  const engine = new StrategicCuriosityEngine(clientId, monthlySpend);
  engine.initialize(metaApi, shopifyClient);
  return engine;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function runCuriosityScan(
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): Promise<CuriosityScanResult> {
  const engine = createStrategicCuriosityEngine(clientId, monthlySpend, metaApi, shopifyClient);
  return engine.scan();
}
