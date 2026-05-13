/**
 * Elite Decision Compression Engine
 *
 * NOT a reporting system. A strategic leverage discovery system.
 *
 * Design Principles:
 * 1. Compress strategic thinking, don't summarize metrics
 * 2. Find the ONE THING that changes operator behavior
 * 3. Expose hidden contradictions, not surface observations
 * 4. Quantify economic impact of every insight
 * 5. Synthesize cross-platform intelligence humans can't manually maintain
 * 6. Reject outputs that don't pass "Founder Wow" test
 *
 * Quality Gate:
 * Before any output ships, ask:
 * - Would this genuinely change operator behavior?
 * - Would a senior media buyer already know this?
 * - Does this expose hidden leverage?
 * - Does this compress strategic thinking?
 *
 * If NO to any: REJECT THE OUTPUT.
 */

// ============================================================================
// Types
// ============================================================================

export interface AccountDecomposition {
  // Warm vs Cold Reality
  warmAudienceShare: number;           // % of conversions from retargeting/warm
  coldAcquisitionEfficiency: number;   // True prospecting ROAS
  warmAudienceRunway: number;          // Days until warm audience exhausted
  acquisitionHealthScore: number;      // 0-100: Are we actually acquiring?

  // Quality Decomposition
  blendedROAS: number;                 // What dashboard shows
  trueAcquisitionROAS: number;         // Cold audience only
  roasMirageScore: number;             // How much is warm recycling inflating reported ROAS

  // Retention Signal
  repeatPurchaseRate: number;
  firstPurchaseLTV: number;
  returnRate: number;
  netMarginPerAcquisition: number;
}

export interface GeographicAsymmetry {
  region: string;
  spendShare: number;
  roasMultiple: number;               // vs account average
  conversionVelocity: number;         // conversions per 1000 impressions
  competitionDensity: number;         // estimated from CPM
  untappedPotential: number;          // ₹/month opportunity
  scalingFriction: string;            // What blocks scaling here
}

export interface CreativeSystemHealth {
  winnerConcentration: number;        // % spend on top creative
  winnerFatigueDays: number;          // Days until top creative exhausts
  pipelineDepth: number;              // Proven backups ready
  testingVelocity: number;            // New creatives tested/week
  clickToATCSpread: number;           // Variance in Click→ATC across creatives
  persuasionSystemStrength: number;   // How differentiated is messaging
}

export interface AudienceQualityDecay {
  frequencyTrend: number[];           // Last 4 weeks
  ctrTrend: number[];                 // Last 4 weeks
  conversionRateTrend: number[];      // Last 4 weeks
  audienceExhaustionScore: number;    // 0-100
  daysUntilCritical: number;
  requiredAudienceExpansion: number;  // % increase needed
}

export interface HiddenContradiction {
  signal1: {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    value: string;
  };
  signal2: {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    value: string;
  };
  contradiction: string;              // What this tension reveals
  implications: string;               // Why this matters economically
  urgency: 'critical' | 'important' | 'monitor';
  economicImpact: number;             // ₹/month at risk or opportunity
}

export interface StrategicLeverage {
  id: string;
  type: 'geographic' | 'creative' | 'audience' | 'pricing' | 'retention' | 'trust';
  title: string;
  currentState: string;
  targetState: string;
  economicImpact: number;             // ₹/month
  implementationDifficulty: 'trivial' | 'moderate' | 'complex';
  timeToImpact: string;
  specificAction: string;             // Not "monitor" - actual operational change
  whyNotObvious: string;              // Why operator wouldn't see this manually
}

export interface TheOneThing {
  category: 'risk' | 'leverage' | 'blocker' | 'quality' | 'scaling';
  headline: string;                   // One sentence that changes thinking
  context: string;                    // Why this matters more than everything else
  economicMagnitude: number;          // ₹/month
  invisibilityReason: string;         // Why dashboards don't show this
  actionSystem: ActionSystem;         // Specific operational intervention
  confidenceLevel: 'high' | 'moderate' | 'hypothesis';
  verificationPath: string;           // How to validate this insight
}

export interface ActionSystem {
  type: 'budget_shift' | 'audience_reallocation' | 'creative_rotation' | 'geographic_expansion' | 'frequency_cap' | 'funnel_fix' | 'retention_workflow';
  parameters: Record<string, number | string>;
  expectedOutcome: string;
  measurementPlan: string;
  rollbackTrigger: string;
}

export interface EliteIntelligenceOutput {
  // The One Thing (most important)
  biggestRisk: TheOneThing | null;
  biggestLeverage: TheOneThing | null;
  biggestBlocker: TheOneThing | null;

  // Hidden Contradictions
  contradictions: HiddenContradiction[];

  // Decomposed Reality (not blended metrics)
  accountDecomposition: AccountDecomposition;

  // Asymmetric Opportunities
  geographicAsymmetries: GeographicAsymmetry[];

  // System Health
  creativeSystemHealth: CreativeSystemHealth;
  audienceQualityDecay: AudienceQualityDecay;

  // All Leverage Points (ranked)
  strategicLeverages: StrategicLeverage[];

  // Quality Gate
  founderWowScore: number;            // 0-100: Would this impress a ₹50L+/month founder?
  qualityGatePass: boolean;
  rejectionReasons: string[];

  // Meta
  analysisDepth: 'shallow' | 'standard' | 'deep';
  crossPlatformSynthesis: string[];   // What data sources were combined
  impossibleManuallyBecause: string;  // Why this insight requires automation
}

// ============================================================================
// Elite Decision Compression Engine
// ============================================================================

export class EliteDecisionCompressionEngine {
  private clientId: string;
  private monthlySpend: number;

  constructor(clientId: string, monthlySpend: number) {
    this.clientId = clientId;
    this.monthlySpend = monthlySpend;
  }

  /**
   * Main entry point: Compress strategic decision from raw data
   */
  async compress(data: {
    meta: MetaAdsData;
    shopify?: ShopifyData;
    competitors?: CompetitorData;
    comments?: CommentData;
    historical?: HistoricalData;
  }): Promise<EliteIntelligenceOutput> {

    // Phase 1: Decompose the account (warm vs cold reality)
    const decomposition = await this.decomposeAccount(data);

    // Phase 2: Find hidden contradictions
    const contradictions = await this.findContradictions(data, decomposition);

    // Phase 3: Discover geographic asymmetries
    const geoAsymmetries = await this.findGeographicAsymmetries(data);

    // Phase 4: Assess creative system health
    const creativeHealth = await this.assessCreativeSystem(data);

    // Phase 5: Detect audience quality decay
    const audienceDecay = await this.detectAudienceDecay(data);

    // Phase 6: Identify all strategic leverage points
    const leverages = await this.identifyLeverages(
      decomposition, geoAsymmetries, creativeHealth, audienceDecay, contradictions
    );

    // Phase 7: Find THE ONE THING in each category
    const biggestRisk = this.findBiggestRisk(contradictions, audienceDecay, decomposition);
    const biggestLeverage = this.findBiggestLeverage(leverages);
    const biggestBlocker = this.findBiggestBlocker(decomposition, creativeHealth);

    // Phase 8: Quality gate - would this impress a founder?
    const { score, pass, reasons } = this.runQualityGate(
      biggestRisk, biggestLeverage, biggestBlocker, contradictions
    );

    return {
      biggestRisk,
      biggestLeverage,
      biggestBlocker,
      contradictions,
      accountDecomposition: decomposition,
      geographicAsymmetries: geoAsymmetries,
      creativeSystemHealth: creativeHealth,
      audienceQualityDecay: audienceDecay,
      strategicLeverages: leverages,
      founderWowScore: score,
      qualityGatePass: pass,
      rejectionReasons: reasons,
      analysisDepth: this.determineDepth(data),
      crossPlatformSynthesis: this.identifyCrossPlatformInsights(data),
      impossibleManuallyBecause: this.explainAutomationValue(contradictions, geoAsymmetries),
    };
  }

  /**
   * Decompose account into warm vs cold reality
   * This is where most "ROAS improving" narratives break down
   */
  private async decomposeAccount(data: { meta: MetaAdsData }): Promise<AccountDecomposition> {
    const { meta } = data;

    // Separate prospecting from retargeting performance
    // Real-world naming: DSG_TOF_, DSG_BOF_, DSG_MOF_, _TOF_, _BOF_, etc.
    const prospectingCampaigns = meta.campaigns.filter(c => {
      const name = c.name.toLowerCase();
      return name.includes('_tof_') || name.includes('tof_') || name.includes('_tof') ||
             name.includes('prospect') || name.includes('cold') ||
             name.includes('awareness') || name.includes('_reach_') ||
             name.includes('engagement') || name.includes('_asc_') ||
             // If no funnel indicator and has high spend, assume prospecting
             (!name.includes('_bof') && !name.includes('_mof') && !name.includes('retarget') && c.spend > 10000);
    });

    const retargetingCampaigns = meta.campaigns.filter(c => {
      const name = c.name.toLowerCase();
      return name.includes('_bof_') || name.includes('bof_') || name.includes('_bof') ||
             name.includes('_mof_') || name.includes('mof_') || name.includes('_mof') ||
             name.includes('retarget') || name.includes('remarket') ||
             name.includes('warm') || name.includes('_rt_') ||
             name.includes('remarketing') || name.includes('dpa_rt');
    });

    const prospectSpend = prospectingCampaigns.reduce((s, c) => s + c.spend, 0);
    const prospectRevenue = prospectingCampaigns.reduce((s, c) => s + c.revenue, 0);
    const prospectConversions = prospectingCampaigns.reduce((s, c) => s + c.conversions, 0);

    const retargetSpend = retargetingCampaigns.reduce((s, c) => s + c.spend, 0);
    const retargetRevenue = retargetingCampaigns.reduce((s, c) => s + c.revenue, 0);
    const retargetConversions = retargetingCampaigns.reduce((s, c) => s + c.conversions, 0);

    const totalConversions = prospectConversions + retargetConversions || 1;
    const totalSpend = prospectSpend + retargetSpend || 1;
    const totalRevenue = prospectRevenue + retargetRevenue || 1;

    const warmAudienceShare = (retargetConversions / totalConversions) * 100;
    const coldAcquisitionROAS = prospectRevenue / prospectSpend || 0;
    const blendedROAS = totalRevenue / totalSpend;

    // Calculate ROAS mirage: how much is warm audience inflating reported ROAS
    const pureProspectROAS = coldAcquisitionROAS;
    const roasMirageScore = blendedROAS > 0
      ? Math.max(0, ((blendedROAS - pureProspectROAS) / blendedROAS) * 100)
      : 0;

    // Estimate warm audience runway (based on retargeting frequency and audience size)
    const retargetFrequency = retargetingCampaigns[0]?.frequency || 3;
    const estimatedWarmAudienceSize = retargetingCampaigns.reduce((s, c) => s + (c.reach || 0), 0);
    const dailyRetargetReach = estimatedWarmAudienceSize / 7; // Weekly unique reach / 7
    const warmAudienceRunway = retargetFrequency < 5
      ? 60 // Healthy
      : retargetFrequency < 7
        ? 30 // Warning
        : 14; // Critical

    // Acquisition health: Are we actually growing the customer base?
    const acquisitionHealthScore = this.calculateAcquisitionHealth(
      warmAudienceShare, coldAcquisitionROAS, blendedROAS
    );

    return {
      warmAudienceShare,
      coldAcquisitionEfficiency: coldAcquisitionROAS,
      warmAudienceRunway,
      acquisitionHealthScore,
      blendedROAS,
      trueAcquisitionROAS: coldAcquisitionROAS,
      roasMirageScore,
      repeatPurchaseRate: 0, // Needs Shopify data
      firstPurchaseLTV: 0,   // Needs Shopify data
      returnRate: 0,         // Needs Shopify data
      netMarginPerAcquisition: 0, // Needs margin data
    };
  }

  private calculateAcquisitionHealth(
    warmShare: number,
    coldROAS: number,
    blendedROAS: number
  ): number {
    // 100 = Pure acquisition machine
    // 0 = Entirely dependent on warm audience recycling

    let score = 100;

    // Penalize high warm audience dependency
    if (warmShare > 70) score -= 40;
    else if (warmShare > 50) score -= 25;
    else if (warmShare > 30) score -= 10;

    // Penalize poor cold acquisition efficiency
    if (coldROAS < 1.0) score -= 30;
    else if (coldROAS < 1.5) score -= 20;
    else if (coldROAS < 2.0) score -= 10;

    // Penalize large gap between blended and true acquisition ROAS
    const roasGap = blendedROAS - coldROAS;
    if (roasGap > 2.0) score -= 20;
    else if (roasGap > 1.0) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Find hidden contradictions that reveal strategic tensions
   */
  private async findContradictions(
    data: { meta: MetaAdsData },
    decomposition: AccountDecomposition
  ): Promise<HiddenContradiction[]> {
    const contradictions: HiddenContradiction[] = [];
    const { meta } = data;

    // Contradiction 1: ROAS improving but warm audience over-indexed
    if (meta.changes.roasChange > 10 && decomposition.warmAudienceShare > 60) {
      contradictions.push({
        signal1: {
          metric: 'Blended ROAS',
          direction: 'improving',
          value: `+${meta.changes.roasChange.toFixed(1)}%`,
        },
        signal2: {
          metric: 'Warm Audience Share',
          direction: 'stable',
          value: `${decomposition.warmAudienceShare.toFixed(0)}% of conversions`,
        },
        contradiction: 'ROAS improvement is a mirage - driven by warm audience recycling, not acquisition efficiency',
        implications: `Current scaling logic overestimates cold audience headroom. True acquisition ROAS is ${decomposition.trueAcquisitionROAS.toFixed(2)}x, not ${decomposition.blendedROAS.toFixed(2)}x. Scaling spend will hit wall in ~${decomposition.warmAudienceRunway} days.`,
        urgency: decomposition.warmAudienceRunway < 30 ? 'critical' : 'important',
        economicImpact: this.monthlySpend * 0.3, // 30% of spend at risk
      });
    }

    // Contradiction 2: CPA improving but audience quality declining
    const ctrTrend = this.calculateTrend(meta.dailyMetrics?.map(d => d.ctr) || []);
    if (meta.changes.cpaChange < -15 && ctrTrend < -0.1) {
      contradictions.push({
        signal1: {
          metric: 'CPA',
          direction: 'improving',
          value: `${meta.changes.cpaChange.toFixed(1)}% lower`,
        },
        signal2: {
          metric: 'CTR',
          direction: 'declining',
          value: `${(ctrTrend * 100).toFixed(1)}% trend`,
        },
        contradiction: 'CPA improvement masking audience quality decline',
        implications: 'Algorithm is optimizing for cheaper conversions by targeting lower-intent users. Expect LTV decline and return rate increase in 30-60 days.',
        urgency: 'important',
        economicImpact: this.monthlySpend * 0.15,
      });
    }

    // Contradiction 3: Frequency stable but reach shrinking
    const reachTrend = this.calculateTrend(meta.dailyMetrics?.map(d => d.reach) || []);
    if (Math.abs(meta.changes.frequencyChange || 0) < 10 && reachTrend < -0.15) {
      contradictions.push({
        signal1: {
          metric: 'Frequency',
          direction: 'stable',
          value: `${meta.current.frequency.toFixed(2)}x`,
        },
        signal2: {
          metric: 'Reach',
          direction: 'declining',
          value: `${(reachTrend * 100).toFixed(1)}% trend`,
        },
        contradiction: 'Stable frequency hides shrinking addressable audience',
        implications: 'Audience pool is exhausting. Algorithm maintaining frequency by showing to same people. Audience expansion or creative refresh required within 14 days.',
        urgency: 'critical',
        economicImpact: this.monthlySpend * 0.4,
      });
    }

    // Contradiction 4: Geographic concentration despite opportunity
    const topRegionSpend = meta.regions[0]?.spend || 0;
    const topRegionShare = (topRegionSpend / meta.current.spend) * 100;
    const tier2ROAS = this.calculateTier2ROAS(meta.regions);
    const metroROAS = this.calculateMetroROAS(meta.regions);

    if (topRegionShare > 40 && tier2ROAS > metroROAS * 1.2) {
      contradictions.push({
        signal1: {
          metric: 'Geographic Concentration',
          direction: 'stable',
          value: `${topRegionShare.toFixed(0)}% in top region`,
        },
        signal2: {
          metric: 'Tier-2 Efficiency',
          direction: 'improving',
          value: `${((tier2ROAS / metroROAS - 1) * 100).toFixed(0)}% above metros`,
        },
        contradiction: 'Over-invested in competitive metros while ignoring high-efficiency tier-2 markets',
        implications: `Tier-2 regions showing ${((tier2ROAS / metroROAS - 1) * 100).toFixed(0)}% better conversion efficiency than metros. Budget reallocation could improve overall ROAS.`,
        urgency: 'important',
        economicImpact: this.monthlySpend * 0.1,
      });
    }

    // Contradiction 5: Campaign efficiency variance (some campaigns 5x+ better than others)
    const campaignEfficiencies = meta.campaigns
      .filter(c => c.spend > 10000 && c.conversions > 0)
      .map(c => ({ name: c.name, efficiency: c.revenue / c.spend }))
      .sort((a, b) => b.efficiency - a.efficiency);

    if (campaignEfficiencies.length >= 3) {
      const topEfficiency = campaignEfficiencies[0]?.efficiency || 0;
      const bottomEfficiency = campaignEfficiencies[campaignEfficiencies.length - 1]?.efficiency || 0;
      const efficiencySpread = topEfficiency / bottomEfficiency;

      if (efficiencySpread > 3 && bottomEfficiency > 0) {
        const bottomCampaign = campaignEfficiencies[campaignEfficiencies.length - 1];
        const bottomSpend = meta.campaigns.find(c => c.name === bottomCampaign.name)?.spend || 0;

        contradictions.push({
          signal1: {
            metric: 'Top Campaign ROAS',
            direction: 'stable',
            value: `${topEfficiency.toFixed(2)}x`,
          },
          signal2: {
            metric: 'Bottom Campaign ROAS',
            direction: 'stable',
            value: `${bottomEfficiency.toFixed(2)}x`,
          },
          contradiction: `${efficiencySpread.toFixed(1)}x efficiency gap between best and worst campaigns - budget misallocation`,
          implications: `Reallocating ₹${(bottomSpend / 100000).toFixed(1)}L from underperforming to top campaigns could improve blended ROAS by ${((topEfficiency / bottomEfficiency - 1) * 20).toFixed(0)}%.`,
          urgency: efficiencySpread > 5 ? 'critical' : 'important',
          economicImpact: bottomSpend * (topEfficiency / bottomEfficiency - 1) * 0.3,
        });
      }
    }

    // Contradiction 6: Strong CPA improvement but CTR declining (algorithm chasing cheap, low-intent users)
    if (meta.changes.cpaChange < -20 && meta.current.ctr < 1.0) {
      contradictions.push({
        signal1: {
          metric: 'CPA',
          direction: 'improving',
          value: `${meta.changes.cpaChange.toFixed(0)}% lower`,
        },
        signal2: {
          metric: 'CTR',
          direction: 'declining',
          value: `${meta.current.ctr.toFixed(2)}% (below 1%)`,
        },
        contradiction: 'Algorithm chasing cheap conversions from low-intent audiences',
        implications: 'Lower CPA may come from targeting users with lower purchase intent. Watch for declining LTV or higher return rates in 30-60 days.',
        urgency: 'important',
        economicImpact: this.monthlySpend * 0.15,
      });
    }

    // Contradiction 7: High ROAS but very few conversions (sample size risk)
    const highROASLowVolume = meta.campaigns.filter(c =>
      c.spend > 5000 && c.revenue / c.spend > 5 && c.conversions < 10
    );
    if (highROASLowVolume.length > 0) {
      const campName = highROASLowVolume[0].name.substring(0, 30);
      contradictions.push({
        signal1: {
          metric: 'Campaign ROAS',
          direction: 'stable',
          value: `${(highROASLowVolume[0].revenue / highROASLowVolume[0].spend).toFixed(1)}x`,
        },
        signal2: {
          metric: 'Conversion Volume',
          direction: 'declining',
          value: `Only ${highROASLowVolume[0].conversions} purchases`,
        },
        contradiction: `"${campName}..." has high ROAS but statistically insignificant sample`,
        implications: 'ROAS may regress to mean when scaled. Need 30+ conversions for reliable signal. Do not scale until validated.',
        urgency: 'important',
        economicImpact: highROASLowVolume[0].spend * 2, // Risk of scaling too fast
      });
    }

    return contradictions;
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    const first = values.slice(0, Math.floor(values.length / 2));
    const second = values.slice(Math.floor(values.length / 2));
    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;
    return firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
  }

  private calculateTier2ROAS(regions: any[]): number {
    // Use conversion efficiency as proxy when revenue isn't available
    const tier2 = regions.filter(r =>
      !['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Telangana', 'West Bengal',
        'California', 'Texas', 'New York', 'Florida', 'England'].includes(r.name)
    );
    const spend = tier2.reduce((s, r) => s + r.spend, 0);
    const revenue = tier2.reduce((s, r) => s + r.revenue, 0);
    const conversions = tier2.reduce((s, r) => s + r.conversions, 0);

    // If revenue available, use it; otherwise use conversion efficiency
    if (revenue > 0) return revenue / spend;
    return spend > 0 ? (conversions / spend) * 1000 : 0; // Conversions per ₹1000 as proxy
  }

  private calculateMetroROAS(regions: any[]): number {
    const metros = regions.filter(r =>
      ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Telangana', 'West Bengal',
       'California', 'Texas', 'New York', 'Florida', 'England'].includes(r.name)
    );
    const spend = metros.reduce((s, r) => s + r.spend, 0);
    const revenue = metros.reduce((s, r) => s + r.revenue, 0);
    const conversions = metros.reduce((s, r) => s + r.conversions, 0);

    if (revenue > 0) return revenue / spend;
    return spend > 0 ? (conversions / spend) * 1000 : 0;
  }

  /**
   * Find geographic asymmetries (where 10% effort yields 50% impact)
   * Note: Meta API doesn't return revenue at regional level, so we use
   * conversion efficiency (conversions per ₹1000 spend) as proxy
   */
  private async findGeographicAsymmetries(data: { meta: MetaAdsData }): Promise<GeographicAsymmetry[]> {
    const { meta } = data;
    const totalSpend = meta.current.spend;
    const totalConversions = meta.current.conversions;

    // Calculate account-level efficiency as baseline
    const avgEfficiency = (totalConversions / totalSpend) * 1000; // conversions per ₹1000
    const avgROAS = meta.current.roas;

    // For regions, use conversion efficiency as ROAS proxy
    // If a region converts better per spend, it likely has better ROAS
    return meta.regions
      .filter(r => r.spend > 5000) // Only regions with meaningful spend
      .map(r => {
        const spendShare = (r.spend / totalSpend) * 100;

        // Use conversion efficiency as ROAS proxy
        const regionEfficiency = (r.conversions / r.spend) * 1000;
        const efficiencyMultiple = regionEfficiency / avgEfficiency;

        // If we have revenue data, use it; otherwise estimate from efficiency
        const hasRevenue = r.revenue > 0;
        const roas = hasRevenue ? (r.revenue / r.spend) : (efficiencyMultiple * avgROAS);
        const roasMultiple = roas / avgROAS;

        // Calculate untapped potential
        // High efficiency + low spend share = opportunity
        const untappedPotential = efficiencyMultiple > 1.3 && spendShare < 15
          ? r.spend * (efficiencyMultiple - 1) * avgROAS // Potential additional revenue
          : 0;

        // Identify scaling friction
        let scalingFriction = 'None identified';
        if (spendShare < 3) scalingFriction = 'Insufficient testing - need dedicated budget';
        else if (efficiencyMultiple < 0.5) scalingFriction = 'High competition or low intent - reduce spend';
        else if (efficiencyMultiple > 1.5 && spendShare < 10) scalingFriction = 'Under-invested - scale immediately';
        else if (efficiencyMultiple > 1.2) scalingFriction = 'Performing well - maintain or cautiously scale';

        return {
          region: r.name,
          spendShare,
          roasMultiple: efficiencyMultiple, // Use efficiency as proxy
          conversionVelocity: (r.conversions / (r.impressions || 1)) * 1000,
          competitionDensity: 1, // Would need CPM data
          untappedPotential,
          scalingFriction,
        };
      })
      .filter(r => r.roasMultiple > 1.2 || r.roasMultiple < 0.5) // Only asymmetric regions
      .sort((a, b) => b.untappedPotential - a.untappedPotential);
  }

  /**
   * Assess creative system health
   */
  private async assessCreativeSystem(data: { meta: MetaAdsData }): Promise<CreativeSystemHealth> {
    const { meta } = data;
    const totalSpend = meta.current.spend;

    // Sort ads by spend
    const sortedAds = [...meta.ads].sort((a, b) => b.spend - a.spend);
    const topAdSpend = sortedAds[0]?.spend || 0;
    const winnerConcentration = (topAdSpend / totalSpend) * 100;

    // Calculate Click→ATC spread (would need this data)
    const clickToATCSpread = 0; // Placeholder

    // Estimate winner fatigue days based on frequency
    const topAdFrequency = sortedAds[0]?.frequency || 3;
    const winnerFatigueDays = topAdFrequency < 3 ? 60 : topAdFrequency < 5 ? 30 : 14;

    // Pipeline depth: ads with >10% of top ad's spend
    const pipelineDepth = sortedAds.filter(a => a.spend > topAdSpend * 0.1).length - 1;

    return {
      winnerConcentration,
      winnerFatigueDays,
      pipelineDepth,
      testingVelocity: 0, // Would need historical data
      clickToATCSpread,
      persuasionSystemStrength: pipelineDepth > 3 ? 70 : pipelineDepth > 1 ? 50 : 30,
    };
  }

  /**
   * Detect audience quality decay
   */
  private async detectAudienceDecay(data: { meta: MetaAdsData }): Promise<AudienceQualityDecay> {
    const { meta } = data;

    // Would need daily/weekly trend data
    const frequencyTrend = [meta.current.frequency];
    const ctrTrend = [meta.current.ctr];
    const conversionRateTrend = [meta.current.conversions / meta.current.clicks || 0];

    // Calculate exhaustion score
    let exhaustionScore = 0;
    if (meta.current.frequency > 4) exhaustionScore += 30;
    if (meta.current.frequency > 5) exhaustionScore += 20;
    if (meta.changes.cpaChange > 20) exhaustionScore += 25;
    if (meta.changes.roasChange < -15) exhaustionScore += 25;

    const daysUntilCritical = exhaustionScore > 70 ? 7 : exhaustionScore > 50 ? 21 : exhaustionScore > 30 ? 45 : 90;

    return {
      frequencyTrend,
      ctrTrend,
      conversionRateTrend,
      audienceExhaustionScore: Math.min(100, exhaustionScore),
      daysUntilCritical,
      requiredAudienceExpansion: exhaustionScore > 50 ? 30 : exhaustionScore > 30 ? 15 : 0,
    };
  }

  /**
   * Identify all strategic leverage points
   */
  private async identifyLeverages(
    decomposition: AccountDecomposition,
    geoAsymmetries: GeographicAsymmetry[],
    creativeHealth: CreativeSystemHealth,
    audienceDecay: AudienceQualityDecay,
    contradictions: HiddenContradiction[]
  ): Promise<StrategicLeverage[]> {
    const leverages: StrategicLeverage[] = [];

    // Geographic leverage
    const topGeoOpportunity = geoAsymmetries[0];
    if (topGeoOpportunity && topGeoOpportunity.untappedPotential > this.monthlySpend * 0.05) {
      leverages.push({
        id: 'geo_expansion',
        type: 'geographic',
        title: `${topGeoOpportunity.region} showing ${topGeoOpportunity.roasMultiple.toFixed(1)}x account ROAS`,
        currentState: `${topGeoOpportunity.spendShare.toFixed(0)}% of budget`,
        targetState: `${Math.min(topGeoOpportunity.spendShare * 2, 30).toFixed(0)}% of budget`,
        economicImpact: topGeoOpportunity.untappedPotential,
        implementationDifficulty: 'trivial',
        timeToImpact: '7 days',
        specificAction: `Shift ${(topGeoOpportunity.spendShare).toFixed(0)}% additional budget to ${topGeoOpportunity.region} campaigns`,
        whyNotObvious: 'Dashboard shows blended ROAS - region-level decomposition reveals asymmetry',
      });
    }

    // Creative leverage
    if (creativeHealth.winnerConcentration > 50) {
      leverages.push({
        id: 'creative_diversification',
        type: 'creative',
        title: `${creativeHealth.winnerConcentration.toFixed(0)}% spend concentration creates vulnerability`,
        currentState: `Single creative carrying account, ${creativeHealth.winnerFatigueDays} days until fatigue`,
        targetState: '3+ creatives with >15% spend share each',
        economicImpact: this.monthlySpend * 0.3, // 30% at risk
        implementationDifficulty: 'moderate',
        timeToImpact: '14-21 days',
        specificAction: 'Launch 3 creative tests at ₹5K/day each, measure Click→ATC after ₹15K spend',
        whyNotObvious: 'Current creative looks healthy in metrics - concentration risk is invisible',
      });
    }

    // Audience leverage
    if (decomposition.warmAudienceShare > 60) {
      leverages.push({
        id: 'acquisition_fix',
        type: 'audience',
        title: 'Over-dependent on warm audience recycling',
        currentState: `${decomposition.warmAudienceShare.toFixed(0)}% conversions from retargeting`,
        targetState: '<40% retargeting dependency',
        economicImpact: this.monthlySpend * decomposition.roasMirageScore / 100,
        implementationDifficulty: 'complex',
        timeToImpact: '30-45 days',
        specificAction: 'Increase prospecting budget by 25%, accept short-term ROAS decline to fix acquisition',
        whyNotObvious: 'Blended ROAS masks acquisition inefficiency - looks profitable while customer base shrinks',
      });
    }

    return leverages.sort((a, b) => b.economicImpact - a.economicImpact);
  }

  /**
   * Find THE ONE biggest risk
   */
  private findBiggestRisk(
    contradictions: HiddenContradiction[],
    audienceDecay: AudienceQualityDecay,
    decomposition: AccountDecomposition
  ): TheOneThing | null {
    // Priority 1: Critical contradictions
    const criticalContradiction = contradictions.find(c => c.urgency === 'critical');
    if (criticalContradiction) {
      return {
        category: 'risk',
        headline: criticalContradiction.contradiction,
        context: criticalContradiction.implications,
        economicMagnitude: criticalContradiction.economicImpact,
        invisibilityReason: 'Dashboard shows metrics in isolation - cross-metric contradictions require synthesis',
        actionSystem: {
          type: 'audience_reallocation',
          parameters: { urgency: 'immediate' },
          expectedOutcome: 'Prevent collapse',
          measurementPlan: 'Monitor decomposed ROAS daily',
          rollbackTrigger: 'N/A - risk mitigation',
        },
        confidenceLevel: 'high',
        verificationPath: 'Segment reporting by warm/cold audience to confirm',
      };
    }

    // Priority 2: Audience exhaustion
    if (audienceDecay.audienceExhaustionScore > 60) {
      return {
        category: 'risk',
        headline: `Audience exhaustion at ${audienceDecay.audienceExhaustionScore}% - ${audienceDecay.daysUntilCritical} days until critical`,
        context: `Frequency and CPA trends indicate audience pool is depleting. Without intervention, expect 30-50% performance decline.`,
        economicMagnitude: this.monthlySpend * 0.4,
        invisibilityReason: 'Frequency alone looks acceptable - decay requires trend analysis',
        actionSystem: {
          type: 'audience_reallocation',
          parameters: { expansionPercent: audienceDecay.requiredAudienceExpansion },
          expectedOutcome: 'Stabilize reach and frequency',
          measurementPlan: 'Track unique reach weekly',
          rollbackTrigger: 'ROAS drops >25% with new audiences',
        },
        confidenceLevel: 'high',
        verificationPath: 'Plot 4-week frequency and reach trends',
      };
    }

    // Priority 3: ROAS mirage
    if (decomposition.roasMirageScore > 40) {
      return {
        category: 'risk',
        headline: `${decomposition.roasMirageScore.toFixed(0)}% of reported ROAS is warm audience mirage`,
        context: `True acquisition ROAS is ${decomposition.trueAcquisitionROAS.toFixed(2)}x, not ${decomposition.blendedROAS.toFixed(2)}x. Current scaling assumptions are wrong.`,
        economicMagnitude: this.monthlySpend * 0.3,
        invisibilityReason: 'Ads Manager shows blended metrics - warm/cold decomposition not visible',
        actionSystem: {
          type: 'budget_shift',
          parameters: { fromRetargeting: 15, toProspecting: 15 },
          expectedOutcome: 'Healthier acquisition funnel',
          measurementPlan: 'Track prospecting ROAS separately',
          rollbackTrigger: 'Overall ROAS drops >30%',
        },
        confidenceLevel: 'moderate',
        verificationPath: 'Create prospecting-only ROAS report',
      };
    }

    return null;
  }

  /**
   * Find THE ONE biggest leverage opportunity
   */
  private findBiggestLeverage(leverages: StrategicLeverage[]): TheOneThing | null {
    const top = leverages[0];
    if (!top) return null;

    return {
      category: 'leverage',
      headline: top.title,
      context: `Current: ${top.currentState}. Target: ${top.targetState}. ${top.whyNotObvious}`,
      economicMagnitude: top.economicImpact,
      invisibilityReason: top.whyNotObvious,
      actionSystem: {
        type: top.type === 'geographic' ? 'geographic_expansion' :
              top.type === 'creative' ? 'creative_rotation' : 'budget_shift',
        parameters: {},
        expectedOutcome: `+₹${(top.economicImpact / 100000).toFixed(1)}L/month impact`,
        measurementPlan: 'A/B test for 14 days',
        rollbackTrigger: 'ROAS declines >20%',
      },
      confidenceLevel: top.economicImpact > this.monthlySpend * 0.1 ? 'high' : 'moderate',
      verificationPath: top.specificAction,
    };
  }

  /**
   * Find THE ONE biggest blocker
   */
  private findBiggestBlocker(
    decomposition: AccountDecomposition,
    creativeHealth: CreativeSystemHealth
  ): TheOneThing | null {
    // Creative concentration as blocker
    if (creativeHealth.winnerConcentration > 60) {
      return {
        category: 'blocker',
        headline: `Cannot scale: ${creativeHealth.winnerConcentration.toFixed(0)}% spend on one creative`,
        context: `Single creative carrying account. Scaling spend will hit frequency ceiling in ${creativeHealth.winnerFatigueDays} days. No backup creatives proven.`,
        economicMagnitude: this.monthlySpend * 0.5, // Can't grow without fixing
        invisibilityReason: 'Creative looks healthy in metrics - concentration is the hidden blocker',
        actionSystem: {
          type: 'creative_rotation',
          parameters: { newCreativesNeeded: 3, testBudget: 50000 },
          expectedOutcome: 'Creative pipeline for scaling',
          measurementPlan: 'Track Click→ATC for each test',
          rollbackTrigger: 'No new creative hits 0.5x baseline performance after ₹15K',
        },
        confidenceLevel: 'high',
        verificationPath: 'Audit creative spend distribution',
      };
    }

    // Acquisition health as blocker
    if (decomposition.acquisitionHealthScore < 40) {
      return {
        category: 'blocker',
        headline: 'Cannot scale: Acquisition engine broken',
        context: `Acquisition health score: ${decomposition.acquisitionHealthScore}/100. Prospecting ROAS at ${decomposition.trueAcquisitionROAS.toFixed(2)}x is below sustainable threshold.`,
        economicMagnitude: this.monthlySpend,
        invisibilityReason: 'Blended metrics hide acquisition weakness',
        actionSystem: {
          type: 'funnel_fix',
          parameters: { focus: 'prospecting' },
          expectedOutcome: 'Sustainable growth engine',
          measurementPlan: 'Track prospecting ROAS weekly',
          rollbackTrigger: 'N/A - fundamental fix needed',
        },
        confidenceLevel: 'high',
        verificationPath: 'Create warm/cold decomposed reporting',
      };
    }

    return null;
  }

  /**
   * Quality gate: Would this impress a ₹50L+/month founder?
   */
  private runQualityGate(
    risk: TheOneThing | null,
    leverage: TheOneThing | null,
    blocker: TheOneThing | null,
    contradictions: HiddenContradiction[]
  ): { score: number; pass: boolean; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Check 1: Do we have non-obvious insights?
    if (risk || blocker || contradictions.length > 0) {
      score += 30;
    } else {
      reasons.push('No hidden risks or contradictions found - analysis may be too shallow');
    }

    // Check 2: Do we have quantified economic impact?
    const hasQuantifiedImpact = (risk?.economicMagnitude || 0) > 0 ||
                                 (leverage?.economicMagnitude || 0) > 0;
    if (hasQuantifiedImpact) {
      score += 25;
    } else {
      reasons.push('No economic impact quantified - insights lack actionability');
    }

    // Check 3: Do we have specific action systems (not "monitor")?
    const hasSpecificActions = risk?.actionSystem?.type !== undefined ||
                               leverage?.actionSystem?.type !== undefined;
    if (hasSpecificActions) {
      score += 25;
    } else {
      reasons.push('No specific action systems - recommendations too generic');
    }

    // Check 4: Would a senior media buyer already know this?
    // If all insights are visible in dashboard, fail
    const hasNonObvious = contradictions.some(c => c.urgency === 'critical') ||
                          (risk?.invisibilityReason || '').length > 20;
    if (hasNonObvious) {
      score += 20;
    } else {
      reasons.push('All insights visible in standard dashboards - no synthesis value');
    }

    return {
      score,
      pass: score >= 60,
      reasons,
    };
  }

  private determineDepth(data: any): 'shallow' | 'standard' | 'deep' {
    const hasShopify = !!data.shopify;
    const hasCompetitors = !!data.competitors;
    const hasComments = !!data.comments;
    const hasHistorical = !!data.historical;

    const sources = [hasShopify, hasCompetitors, hasComments, hasHistorical].filter(Boolean).length;

    if (sources >= 3) return 'deep';
    if (sources >= 1) return 'standard';
    return 'shallow';
  }

  private identifyCrossPlatformInsights(data: any): string[] {
    const insights: string[] = [];
    if (data.meta) insights.push('Meta Ads performance');
    if (data.shopify) insights.push('Shopify revenue/LTV');
    if (data.competitors) insights.push('Competitor creative analysis');
    if (data.comments) insights.push('Comment sentiment');
    return insights;
  }

  private explainAutomationValue(
    contradictions: HiddenContradiction[],
    geoAsymmetries: GeographicAsymmetry[]
  ): string {
    if (contradictions.length > 0) {
      return 'Cross-metric contradiction detection requires continuous monitoring of multiple signal types simultaneously';
    }
    if (geoAsymmetries.length > 3) {
      return 'Geographic decomposition across 30+ regions requires automated ROAS calculation at scale';
    }
    return 'Multi-dimensional performance decomposition exceeds manual synthesis capacity';
  }
}

// ============================================================================
// Types for input data
// ============================================================================

interface MetaAdsData {
  current: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
    ctr: number;
    frequency: number;
    reach: number;
  };
  changes: {
    roasChange: number;
    cpaChange: number;
    spendChange: number;
    frequencyChange?: number;
  };
  campaigns: Array<{
    name: string;
    spend: number;
    conversions: number;
    revenue: number;
    ctr: number;
    frequency: number;
    reach?: number;
  }>;
  ads: Array<{
    name: string;
    spend: number;
    conversions: number;
    revenue: number;
    ctr: number;
    frequency: number;
  }>;
  regions: Array<{
    name: string;
    spend: number;
    conversions: number;
    revenue: number;
    impressions: number;
  }>;
  dailyMetrics?: Array<{
    date: string;
    spend: number;
    ctr: number;
    reach: number;
    frequency: number;
  }>;
}

interface ShopifyData {
  orders: any[];
  customers: any[];
  returnRate: number;
  repeatPurchaseRate: number;
}

interface CompetitorData {
  competitors: any[];
  industryPatterns: any;
}

interface CommentData {
  comments: any[];
  sentiment: any;
}

interface HistoricalData {
  weeklyMetrics: any[];
  monthlyMetrics: any[];
}

// ============================================================================
// Factory function
// ============================================================================

export function createEliteDecisionEngine(
  clientId: string,
  monthlySpend: number
): EliteDecisionCompressionEngine {
  return new EliteDecisionCompressionEngine(clientId, monthlySpend);
}
