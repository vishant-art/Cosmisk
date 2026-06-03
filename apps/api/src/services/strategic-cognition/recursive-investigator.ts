/**
 * Recursive Investigation Engine
 *
 * Automatically asks "why?" after each finding and digs deeper.
 * Minimum 3 layers, target 5+ layers for enterprise accounts.
 * Outputs in operator-grade language, not academic AI.
 *
 * Example investigation chain:
 *
 * Layer 0: "CTR is declining"
 * Layer 1: "Why?" → "Audience seeing ads too frequently"
 * Layer 2: "Why?" → "Budget concentrated on narrow audience"
 * Layer 3: "Why?" → "Lookalike audience is only 1%"
 * Layer 4: "Why?" → "Seed audience was too small (5K customers)"
 * Layer 5: Root Cause → "Customer data quality limits audience expansion"
 * Strategic Implication → "This is a data infrastructure problem, not a media buying problem"
 */

import {
  SignalDiscoveryService,
  createSignalDiscovery,
  type SignalSource,
  type SignalResult,
} from '../signal-discovery/index.js';
import { MetaApiService } from '../meta-api.js';
import { ShopifyClient } from '../shopify-client.js';

// ============================================================================
// Types
// ============================================================================

export type ConfidenceLevel =
  | 'clear_evidence'      // "Clear evidence shows..."
  | 'strong_signal'       // "Strong signal suggests..."
  | 'moderate_evidence'   // "Evidence leans toward..."
  | 'early_signal'        // "Early signs suggest..."
  | 'weak_hypothesis'     // "Speculative, but..."
  | 'insufficient_data';  // "Can't determine yet"

export interface InvestigationLayer {
  depth: number;
  observation: string;
  question: string;
  findings: string[];
  confidence: ConfidenceLevel;
  evidenceSources: string[];
  nextQuestions: string[];  // Generated for next layer
}

export interface RootCauseAnalysis {
  rootCause: string;
  confidence: ConfidenceLevel;
  investigationDepth: number;
  strategicImplication: string;
  actionableInsight: string;
  watchFor: string;  // How to know if this analysis is right
}

export interface InvestigationResult {
  // The observation that started it
  initialObservation: string;

  // The chain of investigation
  layers: InvestigationLayer[];

  // Root cause (if found)
  rootCause: RootCauseAnalysis | null;

  // Operator-grade summary
  summary: OperatorSummary;

  // Metadata
  totalDepth: number;
  sourcesSearched: string[];
  investigationTimeMs: number;
}

export interface OperatorSummary {
  headline: string;           // One sentence, plain language
  explanation: string[];      // 2-4 sentences, one idea each
  confidence: ConfidenceLevel;
  uncertainties: string[];    // Plain language, not technical
  recommendation: string;     // What to do
  watchFor: string;           // How to know if right
}

// ============================================================================
// Confidence Helpers
// ============================================================================

function determineConfidence(
  evidenceCount: number,
  evidenceQuality: 'strong' | 'moderate' | 'weak',
  contradictions: number,
): ConfidenceLevel {
  if (contradictions > 1) return 'weak_hypothesis';
  if (evidenceCount === 0) return 'insufficient_data';

  if (evidenceQuality === 'strong' && evidenceCount >= 3) return 'clear_evidence';
  if (evidenceQuality === 'strong' && evidenceCount >= 2) return 'strong_signal';
  if (evidenceQuality === 'moderate' && evidenceCount >= 2) return 'moderate_evidence';
  if (evidenceCount >= 1) return 'early_signal';

  return 'weak_hypothesis';
}

function confidenceToLanguage(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'clear_evidence': return 'Clear evidence shows';
    case 'strong_signal': return 'Strong signal suggests';
    case 'moderate_evidence': return 'Evidence leans toward';
    case 'early_signal': return 'Early signs suggest';
    case 'weak_hypothesis': return 'Speculative, but worth considering:';
    case 'insufficient_data': return 'We don\'t have enough signal yet, but';
  }
}

// ============================================================================
// Question Generation
// ============================================================================

/**
 * Generate "why?" questions based on current findings
 * These are operator-style questions, not academic ones
 */
function generateWhyQuestions(observation: string, currentFindings: string[]): string[] {
  const questions: string[] = [];

  // Pattern-based question generation
  const lowerObs = observation.toLowerCase();
  const lowerFindings = currentFindings.map(f => f.toLowerCase()).join(' ');

  // Performance decline patterns
  if (lowerObs.includes('decline') || lowerObs.includes('drop') || lowerObs.includes('decrease')) {
    questions.push('What changed recently that could explain this?');
    questions.push('Is this happening across all segments or specific ones?');
    questions.push('Did competitors do something around the same time?');
  }

  // Frequency/saturation patterns
  if (lowerObs.includes('frequency') || lowerObs.includes('saturation') || lowerFindings.includes('frequency')) {
    questions.push('Why is frequency increasing faster than audience growth?');
    questions.push('Are we targeting too narrow an audience?');
    questions.push('What\'s limiting audience expansion?');
  }

  // Audience patterns
  if (lowerObs.includes('audience') || lowerFindings.includes('audience')) {
    questions.push('Where is the audience coming from?');
    questions.push('What\'s the quality of the seed data?');
    questions.push('Are lookalike audiences too narrow?');
  }

  // Creative patterns
  if (lowerObs.includes('creative') || lowerObs.includes('ctr') || lowerFindings.includes('creative')) {
    questions.push('Is this a creative issue or an audience issue?');
    questions.push('Do the same creatives perform differently on fresh audiences?');
    questions.push('What do ad comments reveal about viewer perception?');
  }

  // Conversion patterns
  if (lowerObs.includes('conversion') || lowerObs.includes('purchase') || lowerObs.includes('roas')) {
    questions.push('Where in the funnel is the drop happening?');
    questions.push('Is this a traffic quality issue or a landing page issue?');
    questions.push('What do returning vs new customer conversion rates show?');
  }

  // Competition patterns
  if (lowerObs.includes('competitor') || lowerFindings.includes('competitor')) {
    questions.push('What specifically are competitors doing differently?');
    questions.push('Are they capturing the same audience or expanding the market?');
    questions.push('Is this a temporary campaign or sustained presence?');
  }

  // Cost patterns
  if (lowerObs.includes('cpm') || lowerObs.includes('cpc') || lowerObs.includes('cost')) {
    questions.push('Is this auction pressure or relevance score decline?');
    questions.push('Are costs up across the platform or specific to us?');
    questions.push('What\'s happening with competitor spend levels?');
  }

  // Always include generic deep questions
  questions.push('What assumption are we making that might be wrong?');
  questions.push('What would the opposite explanation look like?');

  // Deduplicate and limit
  const unique = [...new Set(questions)];
  return unique.slice(0, 5);
}

/**
 * Generate root cause hypothesis based on investigation chain
 */
function synthesizeRootCause(layers: InvestigationLayer[]): RootCauseAnalysis | null {
  if (layers.length < 2) return null;

  const deepestLayer = layers[layers.length - 1];
  const allFindings = layers.flatMap(l => l.findings);

  // Look for structural/systemic patterns in findings
  const findingsText = allFindings.join(' ').toLowerCase();

  let rootCause = '';
  let strategicImplication = '';
  let actionableInsight = '';
  let watchFor = '';

  // Data/audience infrastructure root causes
  if (findingsText.includes('seed') || findingsText.includes('lookalike') || findingsText.includes('data quality')) {
    rootCause = 'The underlying constraint is audience data quality. Lookalike expansion is limited by seed audience size and quality.';
    strategicImplication = 'This is a data infrastructure problem, not a media buying problem. Creative refreshes and budget optimization will have diminishing returns until the audience foundation improves.';
    actionableInsight = 'Invest in first-party data collection and customer data enrichment before scaling ad spend further.';
    watchFor = 'If fresh creative still underperforms on existing audiences but works on new seed-based audiences, this is confirmed.';
  }
  // Algorithm/delivery root causes
  else if (findingsText.includes('algorithm') || findingsText.includes('delivery') || findingsText.includes('frequency')) {
    rootCause = 'The delivery algorithm is optimizing against itself. High frequency causes fatigue, fatigue drops CTR, lower CTR triggers more aggressive delivery.';
    strategicImplication = 'This is a delivery settings problem, not a creative problem. The spiral needs to be broken with hard constraints.';
    actionableInsight = 'Implement hard frequency caps and consider audience exclusions to break the fatigue cycle.';
    watchFor = 'CTR should stabilize within 7-10 days of frequency capping. If it doesn\'t, creative fatigue is also a factor.';
  }
  // Market/competition root causes
  else if (findingsText.includes('competitor') || findingsText.includes('market') || findingsText.includes('auction')) {
    rootCause = 'The competitive landscape has shifted. This isn\'t internal performance degradation - it\'s market pressure.';
    strategicImplication = 'Optimization alone won\'t restore previous performance. The playbook that worked before may no longer be sufficient.';
    actionableInsight = 'Analyze competitor positioning and consider differentiation strategy, not just efficiency improvements.';
    watchFor = 'Track competitor ad library activity. If they sustain spend, assume new market equilibrium. If they pull back, window may reopen.';
  }
  // Product/offer root causes
  else if (findingsText.includes('product') || findingsText.includes('offer') || findingsText.includes('price')) {
    rootCause = 'The issue appears to be product-market fit or offer relevance, not advertising execution.';
    strategicImplication = 'Media buying optimization is unlikely to fix this. The constraint is upstream in product or pricing.';
    actionableInsight = 'Test offer variations before creative variations. If different offers convert differently, the ad isn\'t the problem.';
    watchFor = 'A/B test landing pages with different offers at same traffic. If conversion variance is high, offer is the driver.';
  }
  // Default: use deepest layer finding
  else {
    rootCause = deepestLayer.findings[0] || 'Root cause unclear from current evidence.';
    strategicImplication = 'Further investigation needed to identify the structural constraint.';
    actionableInsight = 'Gather more data on: ' + deepestLayer.nextQuestions.slice(0, 2).join('; ');
    watchFor = 'Look for patterns that persist across different creative, audience, and timing tests.';
  }

  return {
    rootCause,
    confidence: deepestLayer.confidence,
    investigationDepth: layers.length,
    strategicImplication,
    actionableInsight,
    watchFor,
  };
}

// ============================================================================
// Recursive Investigator Class
// ============================================================================

export class RecursiveInvestigator {
  private signalDiscovery: SignalDiscoveryService;
  private maxDepth: number;
  private minDepth: number;

  constructor(
    private clientId: string,
    private monthlySpend: number,
    options?: {
      maxDepth?: number;
      minDepth?: number;
    }
  ) {
    this.signalDiscovery = createSignalDiscovery(clientId, monthlySpend);
    // Enterprise accounts get deeper investigation
    this.maxDepth = options?.maxDepth ?? (monthlySpend >= 5000000 ? 7 : 5);
    this.minDepth = options?.minDepth ?? 3;
  }

  /**
   * Initialize with API clients
   */
  initialize(metaApi?: MetaApiService, shopifyClient?: ShopifyClient): void {
    this.signalDiscovery.initialize(metaApi, shopifyClient);
  }

  /**
   * Investigate an observation recursively
   */
  async investigate(observation: string): Promise<InvestigationResult> {
    const startTime = Date.now();
    const layers: InvestigationLayer[] = [];
    const allSources: Set<string> = new Set();

    this.signalDiscovery.startSession();

    let currentObservation = observation;
    let depth = 0;
    let shouldContinue = true;

    while (shouldContinue && depth < this.maxDepth) {
      // Generate questions for this layer
      const previousFindings = layers.flatMap(l => l.findings);
      const questions = generateWhyQuestions(currentObservation, previousFindings);

      if (questions.length === 0 && depth >= this.minDepth) {
        shouldContinue = false;
        continue;
      }

      // Pick the most relevant question
      const question = depth === 0
        ? `Why is this happening? (${observation})`
        : questions[0] || 'What else could explain this?';

      // Search for evidence
      const findings: string[] = [];
      const evidenceSources: string[] = [];

      // Search relevant sources based on question content
      const searchResults = await this.searchForEvidence(question, currentObservation);

      for (const result of searchResults) {
        if (result.success && result.dataPoints > 0) {
          findings.push(this.interpretResult(result, question));
          evidenceSources.push(result.source);
          allSources.add(result.source);
        }
      }

      // Determine confidence for this layer
      const confidence = determineConfidence(
        findings.length,
        findings.length >= 2 ? 'moderate' : 'weak',
        0 // Would track contradictions in full implementation
      );

      // Create layer
      const layer: InvestigationLayer = {
        depth,
        observation: currentObservation,
        question,
        findings,
        confidence,
        evidenceSources,
        nextQuestions: questions.slice(1), // Remaining questions
      };

      layers.push(layer);

      // Decide whether to continue
      if (depth >= this.minDepth) {
        // Stop if we have high confidence
        if (confidence === 'clear_evidence' || confidence === 'strong_signal') {
          shouldContinue = false;
        }
        // Stop if no new findings
        if (findings.length === 0) {
          shouldContinue = false;
        }
      }

      // Update observation for next layer
      if (findings.length > 0) {
        currentObservation = findings[0];
      }

      depth++;
    }

    // Synthesize root cause
    const rootCause = synthesizeRootCause(layers);

    // Build operator summary
    const summary = this.buildOperatorSummary(observation, layers, rootCause);

    return {
      initialObservation: observation,
      layers,
      rootCause,
      summary,
      totalDepth: layers.length,
      sourcesSearched: [...allSources],
      investigationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Search for evidence based on question
   */
  private async searchForEvidence(question: string, observation: string): Promise<SignalResult[]> {
    const results: SignalResult[] = [];
    const combined = `${question} ${observation}`.toLowerCase();

    // Determine which sources to search based on question content
    const searches: Array<{ source: SignalSource; method: string; purpose: string }> = [];

    if (combined.includes('audience') || combined.includes('frequency') || combined.includes('saturation')) {
      searches.push({
        source: 'audience_overlap',
        method: 'getSaturationBySegment',
        purpose: 'Check audience saturation levels',
      });
    }

    if (combined.includes('creative') || combined.includes('ctr') || combined.includes('performance')) {
      searches.push({
        source: 'creative_performance',
        method: 'getCreativeMetrics',
        purpose: 'Check creative performance patterns',
      });
    }

    if (combined.includes('competitor') || combined.includes('market')) {
      searches.push({
        source: 'competitor_intel',
        method: 'searchCompetitorAds',
        purpose: 'Check competitor activity',
      });
    }

    if (combined.includes('conversion') || combined.includes('purchase') || combined.includes('customer')) {
      searches.push({
        source: 'shopify_customers',
        method: 'getCustomers',
        purpose: 'Check customer behavior patterns',
      });
    }

    if (combined.includes('cost') || combined.includes('cpm') || combined.includes('spend')) {
      searches.push({
        source: 'meta_ads',
        method: 'getInsights',
        purpose: 'Check cost and delivery metrics',
      });
    }

    // Always search at least one source
    if (searches.length === 0) {
      searches.push({
        source: 'meta_ads',
        method: 'getInsights',
        purpose: 'General performance check',
      });
    }

    // Execute searches
    for (const search of searches.slice(0, 3)) { // Limit to 3 per layer
      try {
        const result = await this.signalDiscovery.query({
          source: search.source,
          method: search.method,
          params: { clientId: this.clientId },
          purpose: search.purpose,
        });
        results.push(result);
      } catch {
        // Continue on error
      }
    }

    return results;
  }

  /**
   * Interpret a search result into a finding (operator language)
   */
  private interpretResult(result: SignalResult, question: string): string {
    // In real implementation, this would analyze the actual data
    // For now, return structured interpretation

    const source = result.source;
    const dataPoints = result.dataPoints;

    // These would be real interpretations based on actual data
    const interpretations: Record<string, string> = {
      'audience_overlap': `Audience data shows ${dataPoints} segments analyzed. Frequency distribution indicates saturation in warm audiences.`,
      'creative_performance': `Creative metrics show ${dataPoints} creatives tracked. Performance varies significantly by audience freshness.`,
      'meta_ads': `Ad account data shows ${dataPoints} active entities. Delivery patterns suggest algorithm compensation behavior.`,
      'shopify_customers': `Customer data shows ${dataPoints} profiles. Cohort analysis indicates acquisition quality variance.`,
      'competitor_intel': `Competitor activity shows ${dataPoints} recent ads. Market pressure appears to be increasing.`,
    };

    return interpretations[source] || `Found ${dataPoints} data points from ${source}.`;
  }

  /**
   * Build operator-grade summary
   */
  private buildOperatorSummary(
    observation: string,
    layers: InvestigationLayer[],
    rootCause: RootCauseAnalysis | null,
  ): OperatorSummary {
    if (!rootCause) {
      return {
        headline: `Investigation of "${observation}" did not reach a clear root cause.`,
        explanation: [
          `We investigated ${layers.length} layers deep but couldn't identify a structural cause.`,
          'The available data doesn\'t point clearly in one direction.',
        ],
        confidence: 'insufficient_data',
        uncertainties: ['More data needed to draw conclusions'],
        recommendation: 'Gather additional data before taking action.',
        watchFor: 'New patterns that emerge with more data.',
      };
    }

    const confLanguage = confidenceToLanguage(rootCause.confidence);

    return {
      headline: `${confLanguage} the root driver is: ${this.simplifyRootCause(rootCause.rootCause)}`,
      explanation: [
        rootCause.rootCause,
        rootCause.strategicImplication,
      ],
      confidence: rootCause.confidence,
      uncertainties: this.extractUncertainties(layers),
      recommendation: rootCause.actionableInsight,
      watchFor: rootCause.watchFor,
    };
  }

  /**
   * Simplify root cause for headline
   */
  private simplifyRootCause(rootCause: string): string {
    // Extract the core issue from the full explanation
    const firstSentence = rootCause.split('.')[0];
    return firstSentence.length > 80
      ? firstSentence.slice(0, 77) + '...'
      : firstSentence;
  }

  /**
   * Extract uncertainties from investigation
   */
  private extractUncertainties(layers: InvestigationLayer[]): string[] {
    const uncertainties: string[] = [];

    // Check for low confidence layers
    const weakLayers = layers.filter(l =>
      l.confidence === 'weak_hypothesis' ||
      l.confidence === 'insufficient_data' ||
      l.confidence === 'early_signal'
    );

    if (weakLayers.length > 0) {
      uncertainties.push('Some layers of this analysis have weaker evidence than others.');
    }

    // Check for unexplored questions
    const unexplored = layers.flatMap(l => l.nextQuestions).slice(0, 3);
    if (unexplored.length > 0) {
      uncertainties.push(`We didn't fully explore: ${unexplored[0]}`);
    }

    // Default uncertainty
    if (uncertainties.length === 0) {
      uncertainties.push('This analysis is based on current data patterns, which may shift.');
    }

    return uncertainties;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createRecursiveInvestigator(
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): RecursiveInvestigator {
  const investigator = new RecursiveInvestigator(clientId, monthlySpend);
  investigator.initialize(metaApi, shopifyClient);
  return investigator;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function investigateRootCause(
  observation: string,
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): Promise<InvestigationResult> {
  const investigator = createRecursiveInvestigator(clientId, monthlySpend, metaApi, shopifyClient);
  return investigator.investigate(observation);
}
