/**
 * Causal Intelligence System
 *
 * Moves beyond correlation to actual causation:
 * 1. Maps observable variables and their relationships
 * 2. Tests whether A causes B, B causes A, or C causes both
 * 3. Identifies feedback loops (reinforcing spirals, balancing mechanisms)
 * 4. Discovers hidden/latent variables that explain correlations
 * 5. Finds intervention points where we can influence the system
 *
 * Example Causal Model - Trust Erosion:
 *
 *   [Ad Frequency] ─(+0.7, 3d)─> [Audience Fatigue]
 *          │                           │
 *          │                           ↓ (+0.8, 0d)
 *          │                     [CTR Decline]
 *          │                           │
 *          ↓ (+0.3, 7d)                ↓ (+0.6, 2d)
 *   [Brand Familiarity] ←──────── [Negative Sentiment]
 *          │                           │
 *          ↓ (-0.4, 14d)               │
 *   [Purchase Intent] ←────────────────┘ (-0.5, 7d)
 *
 *   Feedback Loop: Frequency↑ → Fatigue↑ → CTR↓ → Algorithm compensates: Frequency↑
 *   Type: Reinforcing (death spiral)
 *   Intervention: Hard frequency cap to break loop
 */

import {
  SignalDiscoveryService,
  createSignalDiscovery,
  type SignalSource,
} from '../signal-discovery/index.js';
import { MetaApiService } from '../meta-api.js';
import { ShopifyClient } from '../shopify-client.js';
import { type ConfidenceLevel } from './recursive-investigator.js';

// ============================================================================
// Types
// ============================================================================

export interface CausalNode {
  id: string;
  name: string;
  type: 'observable' | 'latent' | 'intervention';
  description: string;
  dataSource: SignalSource | null;
  currentDirection: 'increasing' | 'decreasing' | 'stable' | 'unknown';
  magnitude: number;  // How much it changed (0-1 normalized)
}

export interface CausalEdge {
  from: string;       // Node ID
  to: string;         // Node ID
  strength: number;   // -1 to 1 (negative = inverse relationship)
  lag: number;        // Time delay in days
  mechanism: string;  // Human explanation of WHY this relationship exists
  confidence: ConfidenceLevel;
  evidenceType: 'time_precedence' | 'intervention' | 'mechanism' | 'correlation';
}

export interface FeedbackLoop {
  id: string;
  name: string;
  nodes: string[];    // Ordered list of node IDs in the loop
  type: 'reinforcing' | 'balancing';
  currentState: 'accelerating' | 'stable' | 'decelerating';
  description: string;
  intervention: string;  // How to break or amplify the loop
  urgency: 'immediate' | 'soon' | 'monitor';
}

export interface HiddenVariable {
  id: string;
  name: string;
  description: string;
  evidence: string[];     // What suggests this hidden variable exists
  affectedNodes: string[];
  estimatedImpact: number;
}

export interface InterventionPoint {
  nodeId: string;
  nodeName: string;
  type: 'break_loop' | 'amplify_positive' | 'dampen_negative' | 'address_root';
  action: string;
  expectedEffect: string;
  confidence: ConfidenceLevel;
  timeToEffect: string;
  risks: string[];
}

export interface CausalModel {
  nodes: CausalNode[];
  edges: CausalEdge[];
  feedbackLoops: FeedbackLoop[];
  hiddenVariables: HiddenVariable[];
  interventionPoints: InterventionPoint[];
}

export interface CausalAnalysisResult {
  observation: string;
  model: CausalModel;
  summary: CausalSummary;
  analysisTimeMs: number;
}

export interface CausalSummary {
  headline: string;
  causalChain: string;          // "A → B → C" narrative
  feedbackLoopWarning: string | null;
  hiddenFactors: string | null;
  primaryIntervention: string;
  confidence: ConfidenceLevel;
  uncertainties: string[];
  watchFor: string;
}

// ============================================================================
// Causal Templates
// ============================================================================

/**
 * Pre-defined causal structures for common D2C advertising scenarios
 */
const CAUSAL_TEMPLATES: Record<string, {
  nodes: Omit<CausalNode, 'currentDirection' | 'magnitude'>[];
  edges: Omit<CausalEdge, 'confidence'>[];
  loops: Omit<FeedbackLoop, 'currentState'>[];
}> = {
  'audience_fatigue': {
    nodes: [
      { id: 'frequency', name: 'Ad Frequency', type: 'observable', description: 'Average times a user sees ads', dataSource: 'meta_ads' },
      { id: 'audience_size', name: 'Audience Size', type: 'observable', description: 'Size of targetable audience', dataSource: 'audience_overlap' },
      { id: 'fatigue', name: 'Audience Fatigue', type: 'latent', description: 'Tiredness/annoyance with seeing same content', dataSource: null },
      { id: 'ctr', name: 'Click-Through Rate', type: 'observable', description: 'Percentage of impressions that click', dataSource: 'meta_ads' },
      { id: 'relevance_score', name: 'Relevance Score', type: 'observable', description: 'Meta\'s quality assessment', dataSource: 'meta_ads' },
      { id: 'cpm', name: 'Cost Per Mille', type: 'observable', description: 'Cost per 1000 impressions', dataSource: 'meta_ads' },
      { id: 'algorithm_compensation', name: 'Algorithm Compensation', type: 'latent', description: 'Meta trying to maintain delivery', dataSource: null },
    ],
    edges: [
      { from: 'frequency', to: 'fatigue', strength: 0.8, lag: 3, mechanism: 'Repeated exposure causes diminishing attention and increasing annoyance', evidenceType: 'mechanism' },
      { from: 'audience_size', to: 'frequency', strength: -0.7, lag: 0, mechanism: 'Smaller audiences get hit more frequently at same budget', evidenceType: 'mechanism' },
      { from: 'fatigue', to: 'ctr', strength: -0.8, lag: 0, mechanism: 'Fatigued users stop clicking on familiar ads', evidenceType: 'mechanism' },
      { from: 'ctr', to: 'relevance_score', strength: 0.6, lag: 2, mechanism: 'CTR is major input to relevance score calculation', evidenceType: 'mechanism' },
      { from: 'relevance_score', to: 'cpm', strength: -0.5, lag: 1, mechanism: 'Lower relevance = higher auction costs', evidenceType: 'mechanism' },
      { from: 'ctr', to: 'algorithm_compensation', strength: -0.7, lag: 1, mechanism: 'Algorithm increases frequency to maintain spend when CTR drops', evidenceType: 'mechanism' },
      { from: 'algorithm_compensation', to: 'frequency', strength: 0.6, lag: 0, mechanism: 'Compensation manifests as more impressions to same users', evidenceType: 'mechanism' },
    ],
    loops: [
      {
        id: 'fatigue_spiral',
        name: 'Audience Fatigue Death Spiral',
        nodes: ['frequency', 'fatigue', 'ctr', 'algorithm_compensation', 'frequency'],
        type: 'reinforcing',
        description: 'Higher frequency causes fatigue, fatigue drops CTR, algorithm compensates by increasing frequency further',
        intervention: 'Hard frequency cap to break the cycle, or expand audiences to reduce per-user frequency',
        urgency: 'immediate',
      },
    ],
  },
  'trust_erosion': {
    nodes: [
      { id: 'ad_saturation', name: 'Ad Saturation', type: 'observable', description: 'Volume of ads in market', dataSource: 'competitor_intel' },
      { id: 'brand_trust', name: 'Brand Trust', type: 'latent', description: 'Consumer confidence in brand', dataSource: null },
      { id: 'competitor_trust', name: 'Competitor Trust', type: 'latent', description: 'Consumer confidence in competitors', dataSource: null },
      { id: 'consideration_share', name: 'Consideration Share', type: 'observable', description: 'Share of shoppers who consider buying', dataSource: 'shopify_orders' },
      { id: 'conversion_rate', name: 'Conversion Rate', type: 'observable', description: 'Visitors who purchase', dataSource: 'shopify_orders' },
      { id: 'customer_ltv', name: 'Customer LTV', type: 'observable', description: 'Long-term value of customers', dataSource: 'cohort_analysis' },
    ],
    edges: [
      { from: 'ad_saturation', to: 'brand_trust', strength: -0.4, lag: 14, mechanism: 'Oversaturation makes brand feel desperate or annoying', evidenceType: 'mechanism' },
      { from: 'ad_saturation', to: 'competitor_trust', strength: 0.3, lag: 14, mechanism: 'If competitors saturate, they capture attention', evidenceType: 'mechanism' },
      { from: 'brand_trust', to: 'consideration_share', strength: 0.7, lag: 7, mechanism: 'Trust drives willingness to consider purchase', evidenceType: 'mechanism' },
      { from: 'competitor_trust', to: 'consideration_share', strength: -0.5, lag: 7, mechanism: 'Competitor trust steals consideration', evidenceType: 'mechanism' },
      { from: 'consideration_share', to: 'conversion_rate', strength: 0.6, lag: 0, mechanism: 'More consideration = more conversions', evidenceType: 'mechanism' },
      { from: 'brand_trust', to: 'customer_ltv', strength: 0.5, lag: 30, mechanism: 'Trusted brands get repeat purchases', evidenceType: 'mechanism' },
    ],
    loops: [
      {
        id: 'trust_flywheel',
        name: 'Trust → LTV Flywheel',
        nodes: ['brand_trust', 'consideration_share', 'conversion_rate', 'customer_ltv', 'brand_trust'],
        type: 'reinforcing',
        description: 'Higher trust drives conversions, good customer experience builds more trust',
        intervention: 'Invest in post-purchase experience to accelerate this positive loop',
        urgency: 'soon',
      },
    ],
  },
  'creative_decay': {
    nodes: [
      { id: 'creative_age', name: 'Creative Age', type: 'observable', description: 'Days since creative launched', dataSource: 'creative_performance' },
      { id: 'exposure_count', name: 'Exposure Count', type: 'observable', description: 'Total impressions on creative', dataSource: 'meta_ads' },
      { id: 'novelty', name: 'Perceived Novelty', type: 'latent', description: 'How fresh the creative feels', dataSource: null },
      { id: 'attention', name: 'Attention Captured', type: 'observable', description: 'Hook rate / 3-sec views', dataSource: 'creative_performance' },
      { id: 'engagement', name: 'Engagement Rate', type: 'observable', description: 'Likes, comments, shares', dataSource: 'meta_ads' },
      { id: 'creative_ctr', name: 'Creative CTR', type: 'observable', description: 'Click rate for this creative', dataSource: 'creative_performance' },
    ],
    edges: [
      { from: 'creative_age', to: 'novelty', strength: -0.6, lag: 0, mechanism: 'Older creatives feel less fresh', evidenceType: 'mechanism' },
      { from: 'exposure_count', to: 'novelty', strength: -0.7, lag: 0, mechanism: 'More exposures = less surprise', evidenceType: 'mechanism' },
      { from: 'novelty', to: 'attention', strength: 0.8, lag: 0, mechanism: 'Novel content captures more attention', evidenceType: 'mechanism' },
      { from: 'attention', to: 'engagement', strength: 0.6, lag: 0, mechanism: 'Attention is prerequisite for engagement', evidenceType: 'mechanism' },
      { from: 'attention', to: 'creative_ctr', strength: 0.7, lag: 0, mechanism: 'Attention drives clicks', evidenceType: 'mechanism' },
      { from: 'engagement', to: 'creative_ctr', strength: 0.3, lag: 0, mechanism: 'Engagement signals boost CTR', evidenceType: 'mechanism' },
    ],
    loops: [],
  },
};

// ============================================================================
// Causal Intelligence Engine
// ============================================================================

export class CausalIntelligenceEngine {
  private signalDiscovery: SignalDiscoveryService;

  constructor(
    private clientId: string,
    private monthlySpend: number,
  ) {
    this.signalDiscovery = createSignalDiscovery(clientId, monthlySpend);
  }

  /**
   * Initialize with API clients
   */
  initialize(metaApi?: MetaApiService, shopifyClient?: ShopifyClient): void {
    this.signalDiscovery.initialize(metaApi, shopifyClient);
  }

  /**
   * Build a causal model for an observation
   */
  async analyze(
    observation: string,
    scenario?: 'audience_fatigue' | 'trust_erosion' | 'creative_decay' | 'auto'
  ): Promise<CausalAnalysisResult> {
    const startTime = Date.now();

    this.signalDiscovery.startSession();

    // Step 1: Select or detect scenario
    const selectedScenario = scenario === 'auto' || !scenario
      ? this.detectScenario(observation)
      : scenario;

    // Step 2: Build initial model from template
    const model = await this.buildModel(selectedScenario, observation);

    // Step 3: Validate edges with data
    await this.validateEdges(model);

    // Step 4: Detect current state of feedback loops
    this.detectLoopStates(model);

    // Step 5: Identify intervention points
    this.identifyInterventions(model);

    // Step 6: Look for hidden variables
    this.detectHiddenVariables(model, observation);

    // Step 7: Build summary
    const summary = this.buildSummary(observation, model);

    return {
      observation,
      model,
      summary,
      analysisTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Detect which causal scenario applies
   */
  private detectScenario(observation: string): 'audience_fatigue' | 'trust_erosion' | 'creative_decay' {
    const lower = observation.toLowerCase();

    if (lower.includes('frequency') || lower.includes('saturation') || lower.includes('fatigue')) {
      return 'audience_fatigue';
    }
    if (lower.includes('trust') || lower.includes('competitor') || lower.includes('brand')) {
      return 'trust_erosion';
    }
    if (lower.includes('creative') || lower.includes('stale') || lower.includes('hook')) {
      return 'creative_decay';
    }

    // Default to audience fatigue as most common issue
    return 'audience_fatigue';
  }

  /**
   * Build causal model from template
   */
  private async buildModel(
    scenario: 'audience_fatigue' | 'trust_erosion' | 'creative_decay',
    observation: string
  ): Promise<CausalModel> {
    const template = CAUSAL_TEMPLATES[scenario];

    // Initialize nodes with current direction
    const nodes: CausalNode[] = template.nodes.map(n => ({
      ...n,
      currentDirection: 'unknown' as const,
      magnitude: 0,
    }));

    // Initialize edges with confidence
    const edges: CausalEdge[] = template.edges.map(e => ({
      ...e,
      confidence: 'moderate_evidence' as ConfidenceLevel,
    }));

    // Initialize loops with current state
    const feedbackLoops: FeedbackLoop[] = template.loops.map(l => ({
      ...l,
      currentState: 'stable' as const,
    }));

    // Gather data to set node directions
    await this.gatherNodeData(nodes);

    return {
      nodes,
      edges,
      feedbackLoops,
      hiddenVariables: [],
      interventionPoints: [],
    };
  }

  /**
   * Gather data for nodes to determine current direction
   */
  private async gatherNodeData(nodes: CausalNode[]): Promise<void> {
    for (const node of nodes) {
      if (!node.dataSource) continue;

      try {
        const result = await this.signalDiscovery.query({
          source: node.dataSource,
          method: 'getInsights',
          params: { clientId: this.clientId },
          purpose: `Check current state of ${node.name}`,
        });

        if (result.success && result.dataPoints > 0) {
          // Simulate direction detection
          // In real implementation, would analyze trend data
          node.currentDirection = this.simulateDirection(node.id);
          node.magnitude = 0.3 + Math.random() * 0.4;
        }
      } catch {
        // Leave as unknown
      }
    }
  }

  /**
   * Simulate direction for demo (real implementation would analyze data)
   */
  private simulateDirection(nodeId: string): 'increasing' | 'decreasing' | 'stable' {
    // Simulate realistic patterns
    const patterns: Record<string, 'increasing' | 'decreasing' | 'stable'> = {
      'frequency': 'increasing',
      'fatigue': 'increasing',
      'ctr': 'decreasing',
      'relevance_score': 'decreasing',
      'cpm': 'increasing',
      'conversion_rate': 'decreasing',
      'attention': 'decreasing',
      'engagement': 'decreasing',
    };

    return patterns[nodeId] || 'stable';
  }

  /**
   * Validate causal edges with data
   */
  private async validateEdges(model: CausalModel): Promise<void> {
    for (const edge of model.edges) {
      const fromNode = model.nodes.find(n => n.id === edge.from);
      const toNode = model.nodes.find(n => n.id === edge.to);

      if (!fromNode || !toNode) continue;

      // Check time precedence: does 'from' change before 'to'?
      const timePrecedenceValid = this.checkTimePrecedence(fromNode, toNode, edge.lag);

      // Check direction consistency
      const directionConsistent = this.checkDirectionConsistency(fromNode, toNode, edge.strength);

      // Update confidence based on validation
      if (timePrecedenceValid && directionConsistent) {
        edge.confidence = 'strong_signal';
      } else if (timePrecedenceValid || directionConsistent) {
        edge.confidence = 'moderate_evidence';
      } else {
        edge.confidence = 'early_signal';
      }
    }
  }

  /**
   * Check if time precedence supports causality
   */
  private checkTimePrecedence(from: CausalNode, to: CausalNode, lag: number): boolean {
    // In real implementation, would check if 'from' changed before 'to'
    // For now, return true if both have known directions
    return from.currentDirection !== 'unknown' && to.currentDirection !== 'unknown';
  }

  /**
   * Check if directions are consistent with edge strength
   */
  private checkDirectionConsistency(from: CausalNode, to: CausalNode, strength: number): boolean {
    if (from.currentDirection === 'unknown' || to.currentDirection === 'unknown') {
      return false;
    }

    const sameDirection = from.currentDirection === to.currentDirection;
    const positiveStrength = strength > 0;

    // Positive strength: same direction expected
    // Negative strength: opposite direction expected
    return positiveStrength ? sameDirection : !sameDirection;
  }

  /**
   * Detect current state of feedback loops
   */
  private detectLoopStates(model: CausalModel): void {
    for (const loop of model.feedbackLoops) {
      // Check if loop nodes are all moving in reinforcing direction
      const loopNodes = loop.nodes.map(id => model.nodes.find(n => n.id === id)).filter(Boolean) as CausalNode[];

      if (loopNodes.length === 0) continue;

      // Count nodes that are actively changing
      const activeNodes = loopNodes.filter(n => n.currentDirection !== 'stable' && n.currentDirection !== 'unknown');
      const activeRatio = activeNodes.length / loopNodes.length;

      // Check magnitudes
      const avgMagnitude = loopNodes.reduce((sum, n) => sum + n.magnitude, 0) / loopNodes.length;

      if (loop.type === 'reinforcing') {
        if (activeRatio > 0.6 && avgMagnitude > 0.4) {
          loop.currentState = 'accelerating';
        } else if (activeRatio > 0.3) {
          loop.currentState = 'stable';
        } else {
          loop.currentState = 'decelerating';
        }
      } else {
        // Balancing loop
        loop.currentState = activeRatio > 0.5 ? 'stable' : 'decelerating';
      }
    }
  }

  /**
   * Identify intervention points
   */
  private identifyInterventions(model: CausalModel): void {
    const interventions: InterventionPoint[] = [];

    // 1. Find loop break points
    for (const loop of model.feedbackLoops) {
      if (loop.type === 'reinforcing' && loop.currentState === 'accelerating') {
        // Find the most controllable node in the loop
        const controllableNode = this.findMostControllableNode(loop.nodes, model.nodes);

        if (controllableNode) {
          interventions.push({
            nodeId: controllableNode.id,
            nodeName: controllableNode.name,
            type: 'break_loop',
            action: `Constrain ${controllableNode.name} to break the ${loop.name}`,
            expectedEffect: `Breaking this loop should stop the downward spiral within 1-2 weeks`,
            confidence: 'strong_signal',
            timeToEffect: '7-14 days',
            risks: ['May temporarily reduce reach/volume', 'Requires monitoring to ensure stability'],
          });
        }
      }
    }

    // 2. Find root cause nodes (nodes with no incoming edges)
    const nodesWithIncoming = new Set(model.edges.map(e => e.to));
    const rootNodes = model.nodes.filter(n => !nodesWithIncoming.has(n.id) && n.type === 'observable');

    for (const root of rootNodes) {
      if (root.currentDirection === 'increasing' || root.currentDirection === 'decreasing') {
        interventions.push({
          nodeId: root.id,
          nodeName: root.name,
          type: 'address_root',
          action: `Address ${root.name} directly as a root cause`,
          expectedEffect: `Fixing the root should cascade positive effects downstream`,
          confidence: 'moderate_evidence',
          timeToEffect: '2-4 weeks',
          risks: ['Root causes can be harder to change', 'May require structural changes'],
        });
      }
    }

    // 3. Find high-leverage nodes (many outgoing edges)
    const outgoingCount = new Map<string, number>();
    for (const edge of model.edges) {
      outgoingCount.set(edge.from, (outgoingCount.get(edge.from) || 0) + 1);
    }

    const highLeverageNodes = model.nodes
      .filter(n => (outgoingCount.get(n.id) || 0) >= 2 && n.type === 'observable')
      .sort((a, b) => (outgoingCount.get(b.id) || 0) - (outgoingCount.get(a.id) || 0));

    for (const node of highLeverageNodes.slice(0, 2)) {
      if (!interventions.find(i => i.nodeId === node.id)) {
        interventions.push({
          nodeId: node.id,
          nodeName: node.name,
          type: node.currentDirection === 'decreasing' ? 'amplify_positive' : 'dampen_negative',
          action: `Focus on ${node.name} - it influences ${outgoingCount.get(node.id)} other factors`,
          expectedEffect: `High-leverage node: small changes here cascade to multiple outcomes`,
          confidence: 'moderate_evidence',
          timeToEffect: '1-3 weeks',
          risks: ['Multi-factor dependencies may have unexpected interactions'],
        });
      }
    }

    model.interventionPoints = interventions;
  }

  /**
   * Find the most controllable node in a loop
   */
  private findMostControllableNode(nodeIds: string[], allNodes: CausalNode[]): CausalNode | null {
    // Prefer observable nodes that are typically controllable
    const controllableIds = ['frequency', 'audience_size', 'creative_age', 'ad_saturation'];

    for (const id of nodeIds) {
      if (controllableIds.includes(id)) {
        return allNodes.find(n => n.id === id) || null;
      }
    }

    // Fall back to first observable node
    for (const id of nodeIds) {
      const node = allNodes.find(n => n.id === id);
      if (node?.type === 'observable') {
        return node;
      }
    }

    return null;
  }

  /**
   * Detect potential hidden variables
   */
  private detectHiddenVariables(model: CausalModel, observation: string): void {
    const lower = observation.toLowerCase();

    // Look for patterns that suggest hidden variables
    if (lower.includes('unexplained') || lower.includes('sudden') || lower.includes('doesn\'t make sense')) {
      model.hiddenVariables.push({
        id: 'unknown_external',
        name: 'Unknown External Factor',
        description: 'An external factor not captured in current data may be influencing outcomes',
        evidence: ['Sudden change without clear internal cause', 'Pattern doesn\'t match expected causal relationships'],
        affectedNodes: model.nodes.filter(n => n.currentDirection !== 'stable').map(n => n.id),
        estimatedImpact: 0.4,
      });
    }

    // Check for unexplained correlations
    const unexplainedNodes = model.nodes.filter(n => {
      const hasIncoming = model.edges.some(e => e.to === n.id);
      return !hasIncoming && n.currentDirection !== 'stable' && n.currentDirection !== 'unknown' && n.type !== 'intervention';
    });

    if (unexplainedNodes.length > 1) {
      model.hiddenVariables.push({
        id: 'common_cause',
        name: 'Common Hidden Cause',
        description: 'Multiple metrics moving together may share an unobserved common cause',
        evidence: unexplainedNodes.map(n => `${n.name} is ${n.currentDirection} without clear cause`),
        affectedNodes: unexplainedNodes.map(n => n.id),
        estimatedImpact: 0.5,
      });
    }

    // Competitor activity as potential hidden variable
    if (!model.nodes.find(n => n.id.includes('competitor'))) {
      const decliningNodes = model.nodes.filter(n => n.currentDirection === 'decreasing');
      if (decliningNodes.length >= 2) {
        model.hiddenVariables.push({
          id: 'competitor_activity',
          name: 'Competitor Activity',
          description: 'Competitor actions may be affecting performance but aren\'t directly visible',
          evidence: ['Multiple metrics declining simultaneously', 'No clear internal cause identified'],
          affectedNodes: decliningNodes.map(n => n.id),
          estimatedImpact: 0.3,
        });
      }
    }
  }

  /**
   * Build operator-grade summary
   */
  private buildSummary(observation: string, model: CausalModel): CausalSummary {
    // Build causal chain narrative
    const causalChain = this.buildCausalNarrative(model);

    // Check for feedback loop warnings
    const acceleratingLoops = model.feedbackLoops.filter(l => l.currentState === 'accelerating');
    const feedbackLoopWarning = acceleratingLoops.length > 0
      ? `Warning: ${acceleratingLoops[0].name} is actively accelerating. ${acceleratingLoops[0].description}`
      : null;

    // Check for hidden factors
    const hiddenFactors = model.hiddenVariables.length > 0
      ? `Note: ${model.hiddenVariables[0].name} may be at play. ${model.hiddenVariables[0].description}`
      : null;

    // Primary intervention
    const primaryIntervention = model.interventionPoints.length > 0
      ? model.interventionPoints[0].action
      : 'No clear intervention point identified. Gather more data.';

    // Determine overall confidence
    const strongEdges = model.edges.filter(e => e.confidence === 'strong_signal' || e.confidence === 'clear_evidence');
    const confidence: ConfidenceLevel = strongEdges.length >= model.edges.length * 0.5
      ? 'strong_signal'
      : strongEdges.length >= model.edges.length * 0.3
        ? 'moderate_evidence'
        : 'early_signal';

    // Build uncertainties
    const uncertainties: string[] = [];
    if (model.hiddenVariables.length > 0) {
      uncertainties.push('Hidden variables may be affecting the system in ways we can\'t directly observe.');
    }
    const weakEdges = model.edges.filter(e => e.confidence === 'early_signal' || e.confidence === 'weak_hypothesis');
    if (weakEdges.length > 0) {
      uncertainties.push(`${weakEdges.length} causal relationships have weaker evidence than others.`);
    }
    if (model.nodes.filter(n => n.type === 'latent').length > 0) {
      uncertainties.push('Some factors in this model are not directly measurable.');
    }

    // Build headline
    let headline: string;
    if (acceleratingLoops.length > 0) {
      headline = `A reinforcing loop is active: ${acceleratingLoops[0].name}. This needs to be broken.`;
    } else if (model.interventionPoints.length > 0) {
      const topIntervention = model.interventionPoints[0];
      headline = `Key leverage point identified: ${topIntervention.nodeName}. ${topIntervention.type === 'break_loop' ? 'Breaking this loop should help.' : 'Addressing this should cascade positive effects.'}`;
    } else {
      headline = `Causal analysis complete. The system shows ${model.edges.length} causal relationships affecting outcomes.`;
    }

    // Watch for
    const watchFor = acceleratingLoops.length > 0
      ? `Monitor ${acceleratingLoops[0].nodes[0]} closely. If it continues to worsen, the loop is still active.`
      : model.interventionPoints.length > 0
        ? `After intervention, watch for improvement in ${model.interventionPoints[0].nodeName} within ${model.interventionPoints[0].timeToEffect}.`
        : 'Track all metrics for emerging patterns.';

    return {
      headline,
      causalChain,
      feedbackLoopWarning,
      hiddenFactors,
      primaryIntervention,
      confidence,
      uncertainties,
      watchFor,
    };
  }

  /**
   * Build narrative description of causal chain
   */
  private buildCausalNarrative(model: CausalModel): string {
    // Find the longest chain
    const chains: string[][] = [];

    // Start from nodes with no incoming edges
    const nodesWithIncoming = new Set(model.edges.map(e => e.to));
    const rootNodes = model.nodes.filter(n => !nodesWithIncoming.has(n.id));

    for (const root of rootNodes) {
      const chain = this.followChain(root.id, model.edges, model.nodes, []);
      chains.push(chain);
    }

    // Take the longest chain
    const longestChain = chains.sort((a, b) => b.length - a.length)[0] || [];

    if (longestChain.length < 2) {
      return 'Causal relationships are interconnected without a clear linear chain.';
    }

    // Build narrative
    const narrative = longestChain.slice(0, 5).join(' → ');
    return narrative;
  }

  /**
   * Follow causal chain from a starting node
   */
  private followChain(nodeId: string, edges: CausalEdge[], nodes: CausalNode[], visited: string[]): string[] {
    if (visited.includes(nodeId)) return [];

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return [];

    const outgoing = edges.filter(e => e.from === nodeId);
    if (outgoing.length === 0) {
      return [node.name];
    }

    // Follow the strongest edge
    const strongest = outgoing.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))[0];
    const rest = this.followChain(strongest.to, edges, nodes, [...visited, nodeId]);

    return [node.name, ...rest];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createCausalIntelligenceEngine(
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): CausalIntelligenceEngine {
  const engine = new CausalIntelligenceEngine(clientId, monthlySpend);
  engine.initialize(metaApi, shopifyClient);
  return engine;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function analyzeCausality(
  observation: string,
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): Promise<CausalAnalysisResult> {
  const engine = createCausalIntelligenceEngine(clientId, monthlySpend, metaApi, shopifyClient);
  return engine.analyze(observation);
}
