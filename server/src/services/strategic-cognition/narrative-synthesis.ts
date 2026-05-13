/**
 * Strategic Narrative Synthesis
 *
 * Instead of delivering disconnected findings, this system:
 * 1. Aggregates findings from hypotheses, causal models, and curiosity scans
 * 2. Identifies themes that emerge across multiple signals
 * 3. Resolves contradictions between conflicting findings
 * 4. Builds a coherent worldview model
 * 5. Projects forward: what happens if current trends continue
 * 6. Identifies inflection points where the story might change
 * 7. Synthesizes strategic imperatives
 * 8. Acknowledges uncertainties honestly
 *
 * Example Output:
 *   "Market is maturing. You hold strong position in metros but are losing
 *    ground in Tier-2 to competitors. Trust erosion is accelerating.
 *    Key inflection: competitor Tier-2 launch in 3-6 months (60% probability).
 *    Strategic imperative: Expand to Tier-2 NOW before window closes."
 */

import { type ConfidenceLevel } from './recursive-investigator.js';
import { type HypothesisEvaluationResult, type Hypothesis } from './competing-hypotheses.js';
import { type CausalAnalysisResult, type FeedbackLoop, type InterventionPoint } from './causal-intelligence.js';
import { type CuriosityScanResult, type Discovery, type Anomaly } from './strategic-curiosity.js';

// ============================================================================
// Types
// ============================================================================

export type MarketState = 'growing' | 'maturing' | 'disrupting' | 'declining';
export type CompetitivePosition = 'leading' | 'challenging' | 'defending' | 'retreating';
export type TimeHorizon = 'immediate' | 'short_term' | 'medium_term' | 'long_term';
export type ForceDirection = 'favorable' | 'unfavorable' | 'neutral';

export interface WorldviewModel {
  marketState: MarketState;
  marketStateEvidence: string[];
  competitivePosition: CompetitivePosition;
  competitiveEvidence: string[];
  customerBehavior: string;
  keyRisks: string[];
  keyOpportunities: string[];
  overallSentiment: 'optimistic' | 'cautious' | 'concerning' | 'critical';
}

export interface StrategicForce {
  id: string;
  name: string;
  direction: ForceDirection;
  strength: number;  // 0-1
  timeHorizon: TimeHorizon;
  description: string;
  evidence: string[];
  implications: string[];
}

export interface InflectionPoint {
  id: string;
  description: string;
  timing: string;
  probability: number;  // 0-1
  impactIfOccurs: string;
  impactSeverity: 'low' | 'medium' | 'high' | 'critical';
  preparatoryAction: string;
  earlyWarningSignals: string[];
}

export interface StrategicImperative {
  id: string;
  priority: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  action: string;
  rationale: string;
  riskOfInaction: string;
  dependencies: string[];
  successMetrics: string[];
}

export interface NarrativeUncertainty {
  area: string;
  description: string;
  confidenceRange: string;  // e.g., "±30%"
  whatCouldGoWrong: string;
  howToVerify: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  supportingFindings: string[];
  strength: number;  // 0-1, how much evidence supports this
}

export interface Contradiction {
  finding1: string;
  source1: string;
  finding2: string;
  source2: string;
  resolution: 'finding1_correct' | 'finding2_correct' | 'both_partially_true' | 'unresolved';
  explanation: string;
}

export interface StrategicNarrative {
  generatedAt: Date;
  timeframe: string;
  worldview: WorldviewModel;
  themes: Theme[];
  keyForces: StrategicForce[];
  dominantTrend: string;
  inflectionPoints: InflectionPoint[];
  strategicImperatives: StrategicImperative[];
  contradictionsResolved: Contradiction[];
  uncertainties: NarrativeUncertainty[];
  executiveSummary: ExecutiveSummary;
}

export interface ExecutiveSummary {
  headline: string;
  situation: string;
  implications: string;
  recommendation: string;
  confidence: ConfidenceLevel;
  watchFor: string;
}

export interface NarrativeInputs {
  hypothesisResults?: HypothesisEvaluationResult[];
  causalResults?: CausalAnalysisResult[];
  curiosityResults?: CuriosityScanResult[];
  additionalFindings?: string[];
  clientContext?: {
    industry: string;
    monthlySpend: number;
    competitorNames?: string[];
    recentChanges?: string[];
  };
}

export interface NarrativeSynthesisResult {
  narrative: StrategicNarrative;
  synthesisTimeMs: number;
  inputsUsed: {
    hypotheses: number;
    causalModels: number;
    curiosityScans: number;
    additionalFindings: number;
  };
}

// ============================================================================
// Theme Templates
// ============================================================================

/**
 * Common strategic themes in D2C advertising
 */
const THEME_PATTERNS: Array<{
  id: string;
  name: string;
  keywords: string[];
  forceDirection: ForceDirection;
}> = [
  {
    id: 'trust_erosion',
    name: 'Trust Erosion',
    keywords: ['fatigue', 'frequency', 'saturation', 'decline', 'exhaustion', 'worn'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'market_maturation',
    name: 'Market Maturation',
    keywords: ['cac', 'competition', 'saturated', 'crowded', 'consolidation'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'expansion_opportunity',
    name: 'Expansion Opportunity',
    keywords: ['tier-2', 'untapped', 'underserved', 'opportunity', 'outperforming'],
    forceDirection: 'favorable',
  },
  {
    id: 'creative_performance',
    name: 'Creative Performance',
    keywords: ['creative', 'ugc', 'content', 'hook', 'engagement'],
    forceDirection: 'neutral',
  },
  {
    id: 'competitor_pressure',
    name: 'Competitor Pressure',
    keywords: ['competitor', 'cpm', 'auction', 'bidding', 'share'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'attribution_complexity',
    name: 'Attribution Complexity',
    keywords: ['attribution', 'ios', 'tracking', 'measurement', 'pixel'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'customer_quality',
    name: 'Customer Quality',
    keywords: ['ltv', 'repeat', 'retention', 'loyalty', 'cohort'],
    forceDirection: 'neutral',
  },
  {
    id: 'operational_efficiency',
    name: 'Operational Efficiency',
    keywords: ['efficiency', 'automation', 'scale', 'process', 'optimization'],
    forceDirection: 'favorable',
  },
];

// ============================================================================
// Narrative Synthesizer
// ============================================================================

export class NarrativeSynthesizer {
  private themes: Theme[] = [];
  private forces: StrategicForce[] = [];
  private inflections: InflectionPoint[] = [];
  private imperatives: StrategicImperative[] = [];
  private contradictions: Contradiction[] = [];
  private uncertainties: NarrativeUncertainty[] = [];
  private allFindings: string[] = [];

  constructor(
    private clientId: string,
    private monthlySpend: number,
  ) {}

  /**
   * Synthesize a strategic narrative from multiple inputs
   */
  async synthesize(inputs: NarrativeInputs): Promise<NarrativeSynthesisResult> {
    const startTime = Date.now();

    // Reset state
    this.themes = [];
    this.forces = [];
    this.inflections = [];
    this.imperatives = [];
    this.contradictions = [];
    this.uncertainties = [];
    this.allFindings = [];

    // Step 1: Aggregate all findings
    this.aggregateFindings(inputs);

    // Step 2: Identify themes
    this.identifyThemes();

    // Step 3: Resolve contradictions
    this.resolveContradictions(inputs);

    // Step 4: Build worldview
    const worldview = this.buildWorldview(inputs);

    // Step 5: Identify strategic forces
    this.identifyForces(inputs);

    // Step 6: Project inflection points
    this.projectInflectionPoints(inputs);

    // Step 7: Synthesize imperatives
    this.synthesizeImperatives(worldview);

    // Step 8: Acknowledge uncertainties
    this.acknowledgeUncertainties(inputs);

    // Step 9: Build executive summary
    const executiveSummary = this.buildExecutiveSummary(worldview);

    // Step 10: Determine dominant trend
    const dominantTrend = this.determineDominantTrend();

    const narrative: StrategicNarrative = {
      generatedAt: new Date(),
      timeframe: this.determineTimeframe(),
      worldview,
      themes: this.themes,
      keyForces: this.forces,
      dominantTrend,
      inflectionPoints: this.inflections,
      strategicImperatives: this.imperatives,
      contradictionsResolved: this.contradictions,
      uncertainties: this.uncertainties,
      executiveSummary,
    };

    return {
      narrative,
      synthesisTimeMs: Date.now() - startTime,
      inputsUsed: {
        hypotheses: inputs.hypothesisResults?.length || 0,
        causalModels: inputs.causalResults?.length || 0,
        curiosityScans: inputs.curiosityResults?.length || 0,
        additionalFindings: inputs.additionalFindings?.length || 0,
      },
    };
  }

  /**
   * Step 1: Aggregate all findings from different sources
   */
  private aggregateFindings(inputs: NarrativeInputs): void {
    // From hypothesis evaluations
    if (inputs.hypothesisResults) {
      for (const result of inputs.hypothesisResults) {
        // Add dominant hypothesis finding
        if (result.conclusion.dominant) {
          this.allFindings.push(
            `Hypothesis (${result.conclusion.confidenceLevel}): ${result.conclusion.dominant.statement}`
          );
        }
        // Add combined explanation if available
        if (result.conclusion.combinedExplanation) {
          this.allFindings.push(`Combined: ${result.conclusion.combinedExplanation}`);
        }
        // Add operator summary headline
        this.allFindings.push(`Analysis: ${result.operatorSummary.headline}`);
      }
    }

    // From causal analyses
    if (inputs.causalResults) {
      for (const result of inputs.causalResults) {
        // Add causal chain
        this.allFindings.push(`Causal chain: ${result.summary.causalChain}`);
        // Add feedback loop warnings
        if (result.summary.feedbackLoopWarning) {
          this.allFindings.push(`Feedback loop: ${result.summary.feedbackLoopWarning}`);
        }
        // Add intervention points
        for (const intervention of result.model.interventionPoints) {
          this.allFindings.push(`Intervention: ${intervention.action}`);
        }
      }
    }

    // From curiosity scans
    if (inputs.curiosityResults) {
      for (const result of inputs.curiosityResults) {
        // Add discoveries
        for (const discovery of result.topDiscoveries) {
          this.allFindings.push(`Discovery: ${discovery.finding}`);
        }
        // Add top anomalies
        for (const item of result.prioritizedQueue.slice(0, 3)) {
          this.allFindings.push(`Anomaly: ${item.anomaly.title}`);
        }
      }
    }

    // Add additional findings
    if (inputs.additionalFindings) {
      this.allFindings.push(...inputs.additionalFindings);
    }
  }

  /**
   * Step 2: Identify themes across all findings
   */
  private identifyThemes(): void {
    const findingsLower = this.allFindings.map(f => f.toLowerCase()).join(' ');

    for (const pattern of THEME_PATTERNS) {
      const matchCount = pattern.keywords.filter(kw => findingsLower.includes(kw)).length;
      const strength = matchCount / pattern.keywords.length;

      if (matchCount >= 2 || strength >= 0.3) {
        // Find supporting findings
        const supporting = this.allFindings.filter(f => {
          const lower = f.toLowerCase();
          return pattern.keywords.some(kw => lower.includes(kw));
        });

        this.themes.push({
          id: pattern.id,
          name: pattern.name,
          description: this.generateThemeDescription(pattern.id, supporting),
          supportingFindings: supporting,
          strength,
        });
      }
    }

    // Sort by strength
    this.themes.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Generate description for a theme
   */
  private generateThemeDescription(themeId: string, findings: string[]): string {
    const descriptions: Record<string, string> = {
      'trust_erosion': 'Audience trust and engagement are declining due to overexposure and saturation.',
      'market_maturation': 'The market is transitioning from growth to maturation with increasing competition.',
      'expansion_opportunity': 'Underserved segments present significant growth opportunities.',
      'creative_performance': 'Creative strategy is a key lever for performance improvement.',
      'competitor_pressure': 'Competitive intensity is affecting costs and market share.',
      'attribution_complexity': 'Measurement challenges are creating uncertainty in decision-making.',
      'customer_quality': 'Customer lifetime value and retention patterns are evolving.',
      'operational_efficiency': 'Operational improvements can unlock additional value.',
    };

    return descriptions[themeId] || `Theme identified from ${findings.length} supporting findings.`;
  }

  /**
   * Step 3: Resolve contradictions between findings
   */
  private resolveContradictions(inputs: NarrativeInputs): void {
    // Look for contradictory patterns in findings
    const contradictoryPairs: Array<{ pattern1: string; pattern2: string }> = [
      { pattern1: 'improving', pattern2: 'declining' },
      { pattern1: 'opportunity', pattern2: 'risk' },
      { pattern1: 'favorable', pattern2: 'unfavorable' },
      { pattern1: 'growth', pattern2: 'contraction' },
    ];

    for (const pair of contradictoryPairs) {
      const findings1 = this.allFindings.filter(f =>
        f.toLowerCase().includes(pair.pattern1)
      );
      const findings2 = this.allFindings.filter(f =>
        f.toLowerCase().includes(pair.pattern2)
      );

      if (findings1.length > 0 && findings2.length > 0) {
        // Attempt resolution
        this.contradictions.push({
          finding1: findings1[0],
          source1: this.detectSource(findings1[0]),
          finding2: findings2[0],
          source2: this.detectSource(findings2[0]),
          resolution: this.resolveContradiction(findings1[0], findings2[0]),
          explanation: this.explainResolution(findings1[0], findings2[0]),
        });
      }
    }
  }

  /**
   * Detect source of a finding
   */
  private detectSource(finding: string): string {
    if (finding.startsWith('Hypothesis')) return 'hypothesis_engine';
    if (finding.startsWith('Causal')) return 'causal_model';
    if (finding.startsWith('Feedback')) return 'causal_model';
    if (finding.startsWith('Discovery')) return 'curiosity_scan';
    if (finding.startsWith('Anomaly')) return 'curiosity_scan';
    if (finding.startsWith('Intervention')) return 'causal_model';
    return 'unknown';
  }

  /**
   * Resolve a contradiction
   */
  private resolveContradiction(
    finding1: string,
    finding2: string
  ): 'finding1_correct' | 'finding2_correct' | 'both_partially_true' | 'unresolved' {
    // Check confidence levels embedded in findings
    const hasStrong1 = finding1.toLowerCase().includes('strong') || finding1.toLowerCase().includes('clear');
    const hasStrong2 = finding2.toLowerCase().includes('strong') || finding2.toLowerCase().includes('clear');

    if (hasStrong1 && !hasStrong2) return 'finding1_correct';
    if (hasStrong2 && !hasStrong1) return 'finding2_correct';

    // Different sources often capture different aspects
    return 'both_partially_true';
  }

  /**
   * Explain the resolution
   */
  private explainResolution(finding1: string, finding2: string): string {
    const resolution = this.resolveContradiction(finding1, finding2);

    if (resolution === 'both_partially_true') {
      return 'Both findings capture different aspects of reality. The situation is nuanced with both positive and negative elements coexisting.';
    }
    if (resolution === 'finding1_correct') {
      return 'First finding has stronger evidence support and takes precedence.';
    }
    if (resolution === 'finding2_correct') {
      return 'Second finding has stronger evidence support and takes precedence.';
    }
    return 'Unable to resolve contradiction with available evidence. Both should be monitored.';
  }

  /**
   * Step 4: Build worldview model
   */
  private buildWorldview(inputs: NarrativeInputs): WorldviewModel {
    const findingsLower = this.allFindings.join(' ').toLowerCase();

    // Determine market state
    const marketState = this.determineMarketState(findingsLower);

    // Determine competitive position
    const competitivePosition = this.determineCompetitivePosition(findingsLower);

    // Synthesize customer behavior
    const customerBehavior = this.synthesizeCustomerBehavior(findingsLower);

    // Extract risks
    const keyRisks = this.extractKeyRisks(inputs);

    // Extract opportunities
    const keyOpportunities = this.extractKeyOpportunities(inputs);

    // Determine overall sentiment
    const overallSentiment = this.determineOverallSentiment(keyRisks, keyOpportunities);

    return {
      marketState,
      marketStateEvidence: this.findEvidenceFor(marketState),
      competitivePosition,
      competitiveEvidence: this.findEvidenceFor(competitivePosition),
      customerBehavior,
      keyRisks,
      keyOpportunities,
      overallSentiment,
    };
  }

  /**
   * Determine market state from findings
   */
  private determineMarketState(findings: string): MarketState {
    const growthSignals = ['growing', 'expansion', 'opportunity', 'untapped'].filter(s => findings.includes(s)).length;
    const maturitySignals = ['saturation', 'competition', 'crowded', 'consolidation'].filter(s => findings.includes(s)).length;
    const disruptionSignals = ['disruption', 'new entrant', 'shift', 'transformation'].filter(s => findings.includes(s)).length;
    const declineSignals = ['declining', 'shrinking', 'exit', 'contraction'].filter(s => findings.includes(s)).length;

    const max = Math.max(growthSignals, maturitySignals, disruptionSignals, declineSignals);

    if (max === growthSignals && growthSignals > 0) return 'growing';
    if (max === maturitySignals && maturitySignals > 0) return 'maturing';
    if (max === disruptionSignals && disruptionSignals > 0) return 'disrupting';
    if (max === declineSignals && declineSignals > 0) return 'declining';

    return 'maturing'; // Default for D2C advertising
  }

  /**
   * Determine competitive position
   */
  private determineCompetitivePosition(findings: string): CompetitivePosition {
    const leadingSignals = ['leading', 'dominant', 'best', 'outperforming'].filter(s => findings.includes(s)).length;
    const challengingSignals = ['gaining', 'growing', 'opportunity', 'underserved'].filter(s => findings.includes(s)).length;
    const defendingSignals = ['pressure', 'competition', 'losing', 'declining'].filter(s => findings.includes(s)).length;
    const retreatingSignals = ['retreat', 'exit', 'abandon', 'critical'].filter(s => findings.includes(s)).length;

    const max = Math.max(leadingSignals, challengingSignals, defendingSignals, retreatingSignals);

    if (max === leadingSignals && leadingSignals > 0) return 'leading';
    if (max === challengingSignals && challengingSignals > 0) return 'challenging';
    if (max === defendingSignals && defendingSignals > 0) return 'defending';
    if (max === retreatingSignals && retreatingSignals > 0) return 'retreating';

    return 'defending'; // Default - most D2C brands are defending position
  }

  /**
   * Synthesize customer behavior description
   */
  private synthesizeCustomerBehavior(findings: string): string {
    const behaviors: string[] = [];

    if (findings.includes('fatigue') || findings.includes('saturation')) {
      behaviors.push('showing ad fatigue');
    }
    if (findings.includes('price') || findings.includes('discount')) {
      behaviors.push('price-sensitive');
    }
    if (findings.includes('trust') || findings.includes('brand')) {
      behaviors.push('seeking trust signals');
    }
    if (findings.includes('ugc') || findings.includes('authentic')) {
      behaviors.push('preferring authentic content');
    }
    if (findings.includes('mobile') || findings.includes('app')) {
      behaviors.push('mobile-first');
    }

    if (behaviors.length === 0) {
      return 'Customer behavior patterns are stable with no significant shifts detected.';
    }

    return `Customers are ${behaviors.join(', ')}.`;
  }

  /**
   * Extract key risks from inputs
   */
  private extractKeyRisks(inputs: NarrativeInputs): string[] {
    const risks: string[] = [];

    // From causal analysis - feedback loops
    if (inputs.causalResults) {
      for (const result of inputs.causalResults) {
        for (const loop of result.model.feedbackLoops) {
          if (loop.type === 'reinforcing' && loop.currentState === 'accelerating') {
            risks.push(`${loop.name} is accelerating and needs intervention`);
          }
        }
      }
    }

    // From themes
    const unfavorableThemes = this.themes.filter(t => {
      const pattern = THEME_PATTERNS.find(p => p.id === t.id);
      return pattern?.forceDirection === 'unfavorable' && t.strength > 0.4;
    });

    for (const theme of unfavorableThemes) {
      risks.push(theme.description);
    }

    // From curiosity anomalies
    if (inputs.curiosityResults) {
      for (const result of inputs.curiosityResults) {
        const negativeAnomalies = result.anomaliesFound.filter(
          a => a.type === 'unexpected_low' || a.type === 'pattern_break'
        );
        for (const anomaly of negativeAnomalies.slice(0, 2)) {
          risks.push(anomaly.title);
        }
      }
    }

    return risks.slice(0, 5); // Top 5 risks
  }

  /**
   * Extract key opportunities from inputs
   */
  private extractKeyOpportunities(inputs: NarrativeInputs): string[] {
    const opportunities: string[] = [];

    // From curiosity discoveries
    if (inputs.curiosityResults) {
      for (const result of inputs.curiosityResults) {
        const actionable = result.topDiscoveries.filter(d => d.actionable && d.potentialImpact > 100000);
        for (const discovery of actionable) {
          opportunities.push(`${discovery.recommendation} (₹${(discovery.potentialImpact / 100000).toFixed(1)}L potential)`);
        }
      }
    }

    // From causal intervention points
    if (inputs.causalResults) {
      for (const result of inputs.causalResults) {
        const positiveInterventions = result.model.interventionPoints.filter(
          i => i.type === 'amplify_positive'
        );
        for (const intervention of positiveInterventions) {
          opportunities.push(intervention.action);
        }
      }
    }

    // From favorable themes
    const favorableThemes = this.themes.filter(t => {
      const pattern = THEME_PATTERNS.find(p => p.id === t.id);
      return pattern?.forceDirection === 'favorable' && t.strength > 0.3;
    });

    for (const theme of favorableThemes) {
      opportunities.push(theme.description);
    }

    return opportunities.slice(0, 5); // Top 5 opportunities
  }

  /**
   * Determine overall sentiment
   */
  private determineOverallSentiment(
    risks: string[],
    opportunities: string[]
  ): 'optimistic' | 'cautious' | 'concerning' | 'critical' {
    const riskCount = risks.length;
    const oppCount = opportunities.length;

    if (riskCount === 0 && oppCount > 2) return 'optimistic';
    if (riskCount <= 2 && oppCount >= riskCount) return 'cautious';
    if (riskCount > oppCount && riskCount <= 3) return 'concerning';
    return 'critical';
  }

  /**
   * Find evidence for a state determination
   */
  private findEvidenceFor(state: string): string[] {
    return this.allFindings
      .filter(f => f.toLowerCase().includes(state.toLowerCase().replace('_', ' ')))
      .slice(0, 3);
  }

  /**
   * Step 5: Identify strategic forces
   */
  private identifyForces(inputs: NarrativeInputs): void {
    // Convert themes to forces
    for (const theme of this.themes) {
      const pattern = THEME_PATTERNS.find(p => p.id === theme.id);
      if (!pattern) continue;

      this.forces.push({
        id: `force_${theme.id}`,
        name: theme.name,
        direction: pattern.forceDirection,
        strength: theme.strength,
        timeHorizon: this.determineTimeHorizon(theme),
        description: theme.description,
        evidence: theme.supportingFindings.slice(0, 3),
        implications: this.deriveImplications(theme),
      });
    }

    // Add causal-derived forces
    if (inputs.causalResults) {
      for (const result of inputs.causalResults) {
        for (const loop of result.model.feedbackLoops) {
          if (loop.currentState === 'accelerating') {
            this.forces.push({
              id: `force_loop_${loop.id}`,
              name: loop.name,
              direction: loop.type === 'reinforcing' ? 'unfavorable' : 'neutral',
              strength: 0.8,
              timeHorizon: loop.urgency === 'immediate' ? 'immediate' : 'short_term',
              description: loop.description,
              evidence: [result.summary.feedbackLoopWarning || loop.description],
              implications: [loop.intervention],
            });
          }
        }
      }
    }

    // Sort by strength
    this.forces.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Determine time horizon for a theme
   */
  private determineTimeHorizon(theme: Theme): TimeHorizon {
    const findingsLower = theme.supportingFindings.join(' ').toLowerCase();

    if (findingsLower.includes('immediate') || findingsLower.includes('urgent') || findingsLower.includes('now')) {
      return 'immediate';
    }
    if (findingsLower.includes('week') || findingsLower.includes('soon')) {
      return 'short_term';
    }
    if (findingsLower.includes('month') || findingsLower.includes('quarter')) {
      return 'medium_term';
    }
    return 'long_term';
  }

  /**
   * Derive implications from a theme
   */
  private deriveImplications(theme: Theme): string[] {
    const implications: Record<string, string[]> = {
      'trust_erosion': [
        'Reduce ad frequency to rebuild engagement',
        'Refresh creative strategy with new angles',
        'Consider audience expansion to reach fresh users',
      ],
      'market_maturation': [
        'Focus on efficiency over growth',
        'Differentiate through customer experience',
        'Consider adjacent market expansion',
      ],
      'expansion_opportunity': [
        'Allocate budget to high-performing segments',
        'Test incremental scaling cautiously',
        'Document what makes these segments work',
      ],
      'creative_performance': [
        'Double down on winning creative formats',
        'Increase creative testing velocity',
        'Analyze what makes top creatives work',
      ],
      'competitor_pressure': [
        'Monitor competitor activity closely',
        'Find differentiation opportunities',
        'Consider defensive positioning',
      ],
      'attribution_complexity': [
        'Implement first-party tracking solutions',
        'Use incrementality testing',
        'Focus on directional rather than precise metrics',
      ],
      'customer_quality': [
        'Segment customers by LTV potential',
        'Optimize for quality over quantity',
        'Invest in retention alongside acquisition',
      ],
      'operational_efficiency': [
        'Automate routine optimizations',
        'Scale proven processes',
        'Document and systematize wins',
      ],
    };

    return implications[theme.id] || ['Monitor this theme for developments'];
  }

  /**
   * Step 6: Project inflection points
   */
  private projectInflectionPoints(inputs: NarrativeInputs): void {
    // Competitor-based inflections
    if (inputs.clientContext?.competitorNames?.length) {
      this.inflections.push({
        id: 'inflection_competitor_launch',
        description: 'Major competitor launches new product/campaign',
        timing: '3-6 months',
        probability: 0.6,
        impactIfOccurs: 'CPMs could increase 20-30%, market share pressure intensifies',
        impactSeverity: 'high',
        preparatoryAction: 'Build competitive differentiation now, secure advantageous positions early',
        earlyWarningSignals: ['Competitor job postings increase', 'Competitor testing new creatives', 'Industry news'],
      });
    }

    // Trust erosion inflection
    const trustTheme = this.themes.find(t => t.id === 'trust_erosion');
    if (trustTheme && trustTheme.strength > 0.5) {
      this.inflections.push({
        id: 'inflection_trust_collapse',
        description: 'Audience trust drops below recovery threshold',
        timing: '1-3 months if unchecked',
        probability: 0.4,
        impactIfOccurs: 'ROAS could drop 40%+, requiring 3-6 months to rebuild',
        impactSeverity: 'critical',
        preparatoryAction: 'Implement frequency caps and creative refresh immediately',
        earlyWarningSignals: ['Negative comments increase', 'CTR decline accelerates', 'Frequency exceeds 5x'],
      });
    }

    // Market maturation inflection
    const maturationTheme = this.themes.find(t => t.id === 'market_maturation');
    if (maturationTheme && maturationTheme.strength > 0.4) {
      this.inflections.push({
        id: 'inflection_market_shift',
        description: 'Market transitions from growth to efficiency mode',
        timing: '6-12 months',
        probability: 0.5,
        impactIfOccurs: 'CAC could double, only efficient operators survive',
        impactSeverity: 'high',
        preparatoryAction: 'Build operational efficiency now, optimize unit economics',
        earlyWarningSignals: ['Industry CAC benchmarks rise', 'VC funding in category slows', 'Consolidation news'],
      });
    }

    // Platform change inflection
    this.inflections.push({
      id: 'inflection_platform_change',
      description: 'Meta algorithm or policy change affects delivery',
      timing: 'Unknown (could be any time)',
      probability: 0.3,
      impactIfOccurs: 'Sudden performance shifts requiring rapid adaptation',
      impactSeverity: 'medium',
      preparatoryAction: 'Diversify channels, maintain creative testing velocity, stay informed',
      earlyWarningSignals: ['Meta announcements', 'Industry reports', 'Sudden performance changes'],
    });

    // Sort by probability × severity
    const severityScore: Record<string, number> = {
      'low': 1, 'medium': 2, 'high': 3, 'critical': 4,
    };
    this.inflections.sort((a, b) =>
      (b.probability * severityScore[b.impactSeverity]) -
      (a.probability * severityScore[a.impactSeverity])
    );
  }

  /**
   * Step 7: Synthesize strategic imperatives
   */
  private synthesizeImperatives(worldview: WorldviewModel): void {
    // Immediate imperatives from risks
    for (const risk of worldview.keyRisks.slice(0, 2)) {
      this.imperatives.push({
        id: `imperative_risk_${this.imperatives.length}`,
        priority: 'immediate',
        action: `Address: ${risk}`,
        rationale: 'This risk requires immediate attention based on current evidence.',
        riskOfInaction: 'Continued deterioration of performance if not addressed.',
        dependencies: [],
        successMetrics: ['Risk indicator stabilizes or improves within 2 weeks'],
      });
    }

    // Short-term imperatives from opportunities
    for (const opp of worldview.keyOpportunities.slice(0, 2)) {
      this.imperatives.push({
        id: `imperative_opp_${this.imperatives.length}`,
        priority: 'short_term',
        action: opp,
        rationale: 'This opportunity offers high potential value based on analysis.',
        riskOfInaction: 'Opportunity may be captured by competitors or window may close.',
        dependencies: ['Immediate risks addressed'],
        successMetrics: ['Measurable improvement in target metric within 30 days'],
      });
    }

    // Medium-term imperatives from inflection points
    for (const inflection of this.inflections.filter(i => i.probability > 0.4).slice(0, 2)) {
      this.imperatives.push({
        id: `imperative_prep_${this.imperatives.length}`,
        priority: 'medium_term',
        action: inflection.preparatoryAction,
        rationale: `Preparing for possible inflection: ${inflection.description}`,
        riskOfInaction: inflection.impactIfOccurs,
        dependencies: ['Short-term actions completed'],
        successMetrics: ['Preparedness indicators in place', 'Early warning monitoring active'],
      });
    }

    // Long-term imperative based on competitive position
    if (worldview.competitivePosition === 'defending' || worldview.competitivePosition === 'retreating') {
      this.imperatives.push({
        id: 'imperative_position',
        priority: 'long_term',
        action: 'Invest in sustainable competitive advantages (brand, data, efficiency)',
        rationale: 'Current position requires building durable moats for long-term survival.',
        riskOfInaction: 'Gradual market share erosion to better-positioned competitors.',
        dependencies: ['Medium-term preparations complete'],
        successMetrics: ['Market position stabilizes or improves', 'Unit economics strengthen'],
      });
    }
  }

  /**
   * Step 8: Acknowledge uncertainties
   */
  private acknowledgeUncertainties(inputs: NarrativeInputs): void {
    // Uncertainty from hypothesis evaluations
    if (inputs.hypothesisResults) {
      for (const result of inputs.hypothesisResults) {
        if (!result.conclusion.convergenceAchieved) {
          this.uncertainties.push({
            area: 'Diagnosis',
            description: `Analysis for "${result.observation}" did not converge to a single explanation.`,
            confidenceRange: '±30%',
            whatCouldGoWrong: 'We may be addressing the wrong root cause.',
            howToVerify: result.conclusion.recommendedInvestigation,
          });
        }
      }
    }

    // Uncertainty from hidden variables
    if (inputs.causalResults) {
      for (const result of inputs.causalResults) {
        if (result.model.hiddenVariables.length > 0) {
          for (const hidden of result.model.hiddenVariables) {
            this.uncertainties.push({
              area: 'Causal Model',
              description: `Hidden variable "${hidden.name}" may be affecting outcomes.`,
              confidenceRange: `±${Math.round(hidden.estimatedImpact * 100)}%`,
              whatCouldGoWrong: 'Interventions may not work if hidden variable is the true cause.',
              howToVerify: 'Monitor for patterns that don\'t match our causal model.',
            });
          }
        }
      }
    }

    // General market uncertainty
    this.uncertainties.push({
      area: 'Market',
      description: 'External market conditions can change unpredictably.',
      confidenceRange: '±25%',
      whatCouldGoWrong: 'Competitor actions, platform changes, or macro events could invalidate assumptions.',
      howToVerify: 'Regular monitoring of industry news and competitor activity.',
    });

    // Data quality uncertainty
    this.uncertainties.push({
      area: 'Data',
      description: 'Attribution and measurement may have systematic errors.',
      confidenceRange: '±15%',
      whatCouldGoWrong: 'Decisions based on inaccurate data could be counterproductive.',
      howToVerify: 'Cross-reference Meta data with Shopify actuals, run incrementality tests.',
    });
  }

  /**
   * Step 9: Build executive summary
   */
  private buildExecutiveSummary(worldview: WorldviewModel): ExecutiveSummary {
    // Headline
    const headline = this.buildHeadline(worldview);

    // Situation
    const situation = this.buildSituation(worldview);

    // Implications
    const implications = this.buildImplications(worldview);

    // Recommendation
    const recommendation = this.buildRecommendation();

    // Confidence
    const confidence = this.determineNarrativeConfidence();

    // Watch for
    const watchFor = this.buildWatchFor();

    return {
      headline,
      situation,
      implications,
      recommendation,
      confidence,
      watchFor,
    };
  }

  /**
   * Build headline for executive summary
   */
  private buildHeadline(worldview: WorldviewModel): string {
    const positionMap: Record<CompetitivePosition, string> = {
      'leading': 'Strong position with opportunities to extend lead',
      'challenging': 'Growth trajectory with clear opportunities ahead',
      'defending': 'Competitive pressure requires strategic response',
      'retreating': 'Critical situation requiring immediate intervention',
    };

    return positionMap[worldview.competitivePosition];
  }

  /**
   * Build situation description
   */
  private buildSituation(worldview: WorldviewModel): string {
    return `Market is ${worldview.marketState}. ${worldview.customerBehavior} ` +
           `You face ${worldview.keyRisks.length} key risks and have ${worldview.keyOpportunities.length} opportunities. ` +
           `Overall outlook is ${worldview.overallSentiment}.`;
  }

  /**
   * Build implications
   */
  private buildImplications(worldview: WorldviewModel): string {
    if (worldview.overallSentiment === 'critical') {
      return 'Immediate action required to prevent further deterioration. Focus on stopping the bleeding before pursuing growth.';
    }
    if (worldview.overallSentiment === 'concerning') {
      return 'Several issues need attention. Prioritize addressing risks while maintaining current performance.';
    }
    if (worldview.overallSentiment === 'cautious') {
      return 'Solid foundation with room for improvement. Balance risk mitigation with opportunity capture.';
    }
    return 'Favorable conditions for growth. Focus on capitalizing on opportunities while maintaining vigilance.';
  }

  /**
   * Build recommendation
   */
  private buildRecommendation(): string {
    const immediateImperatives = this.imperatives.filter(i => i.priority === 'immediate');
    if (immediateImperatives.length > 0) {
      return immediateImperatives[0].action;
    }

    const shortTermImperatives = this.imperatives.filter(i => i.priority === 'short_term');
    if (shortTermImperatives.length > 0) {
      return shortTermImperatives[0].action;
    }

    return 'Continue current strategy while monitoring for changes.';
  }

  /**
   * Determine overall narrative confidence
   */
  private determineNarrativeConfidence(): ConfidenceLevel {
    const unresolvedContradictions = this.contradictions.filter(c => c.resolution === 'unresolved').length;
    const highUncertainties = this.uncertainties.filter(u => u.confidenceRange.includes('30') || u.confidenceRange.includes('40')).length;
    const strongThemes = this.themes.filter(t => t.strength > 0.6).length;

    if (unresolvedContradictions >= 2 || highUncertainties >= 3) {
      return 'early_signal';
    }
    if (strongThemes >= 2 && unresolvedContradictions === 0) {
      return 'strong_signal';
    }
    if (strongThemes >= 1) {
      return 'moderate_evidence';
    }
    return 'weak_hypothesis';
  }

  /**
   * Build watch for section
   */
  private buildWatchFor(): string {
    const topInflection = this.inflections[0];
    if (topInflection) {
      return `Watch for: ${topInflection.earlyWarningSignals.slice(0, 2).join(', ')}. ` +
             `If ${topInflection.description.toLowerCase()}, the situation changes significantly.`;
    }
    return 'Monitor key metrics for sudden changes that could invalidate current assumptions.';
  }

  /**
   * Determine dominant trend
   */
  private determineDominantTrend(): string {
    const topTheme = this.themes[0];
    const topForce = this.forces[0];

    if (topForce && topForce.strength > 0.6) {
      const directionWord = topForce.direction === 'favorable' ? 'positive' :
                           topForce.direction === 'unfavorable' ? 'challenging' : 'neutral';
      return `${topForce.name} is the dominant ${directionWord} force shaping outcomes.`;
    }

    if (topTheme) {
      return `${topTheme.name} is the primary theme emerging from analysis.`;
    }

    return 'No single trend dominates. Multiple factors are at play.';
  }

  /**
   * Determine timeframe for the narrative
   */
  private determineTimeframe(): string {
    const immediateForces = this.forces.filter(f => f.timeHorizon === 'immediate').length;
    const shortTermForces = this.forces.filter(f => f.timeHorizon === 'short_term').length;

    if (immediateForces >= 2) {
      return 'Next 2-4 weeks';
    }
    if (shortTermForces >= 2) {
      return 'Next 1-3 months';
    }
    return 'Next quarter (Q3 2026)';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createNarrativeSynthesizer(
  clientId: string,
  monthlySpend: number,
): NarrativeSynthesizer {
  return new NarrativeSynthesizer(clientId, monthlySpend);
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function synthesizeNarrative(
  inputs: NarrativeInputs,
  clientId: string,
  monthlySpend: number,
): Promise<NarrativeSynthesisResult> {
  const synthesizer = createNarrativeSynthesizer(clientId, monthlySpend);
  return synthesizer.synthesize(inputs);
}
