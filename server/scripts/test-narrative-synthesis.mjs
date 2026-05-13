/**
 * Test script for Strategic Narrative Synthesis
 *
 * Tests the NarrativeSynthesizer with sample data from:
 * - Competing Hypotheses results
 * - Causal Analysis results
 * - Curiosity Scan results
 */

import { synthesizeNarrative } from '../dist/services/strategic-cognition/narrative-synthesis.js';

async function testNarrativeSynthesis() {
  console.log('='.repeat(70));
  console.log('STRATEGIC NARRATIVE SYNTHESIS TEST');
  console.log('='.repeat(70));
  console.log();

  // Mock inputs from other cognitive systems
  const inputs = {
    // Mock hypothesis results
    hypothesisResults: [
      {
        observation: 'ROAS dropped from 3.2x to 2.4x over 14 days',
        hypotheses: [
          { id: 'audience_fatigue', statement: 'Audience fatigue is causing the decline', currentProbability: 0.38, status: 'likely' },
          { id: 'competitor_shift', statement: 'Competitor activity is capturing attention', currentProbability: 0.28, status: 'active' },
          { id: 'creative_fatigue', statement: 'Creative fatigue is causing the decline', currentProbability: 0.22, status: 'active' },
        ],
        conclusion: {
          dominant: { id: 'audience_fatigue', statement: 'Audience fatigue is causing the decline', currentProbability: 0.38 },
          secondary: { id: 'competitor_shift', statement: 'Competitor activity is capturing attention', currentProbability: 0.28 },
          combinedExplanation: 'Audience fatigue and competitor pressure are both contributing factors.',
          confidenceLevel: 'moderate_evidence',
          convergenceAchieved: false,
          recommendedInvestigation: 'Test fresh audiences to isolate fatigue vs competition effects',
        },
        operatorSummary: {
          headline: 'Evidence leans toward audience fatigue, but competitor pressure is also significant.',
          primaryExplanation: 'Strong possibility: Audience fatigue is causing the decline',
          alternativeExplanation: 'Worth considering: Competitor activity is capturing attention',
          confidence: 'moderate_evidence',
        },
        probabilityHistory: [],
        evaluationTimeMs: 1500,
      },
    ],

    // Mock causal analysis results
    causalResults: [
      {
        observation: 'Trust erosion pattern detected',
        model: {
          nodes: [
            { id: 'frequency', name: 'Ad Frequency', type: 'observable', currentDirection: 'increasing', magnitude: 0.7 },
            { id: 'fatigue', name: 'Audience Fatigue', type: 'latent', currentDirection: 'increasing', magnitude: 0.6 },
            { id: 'ctr', name: 'Click-Through Rate', type: 'observable', currentDirection: 'decreasing', magnitude: 0.5 },
          ],
          edges: [
            { from: 'frequency', to: 'fatigue', strength: 0.8, lag: 3, confidence: 'strong_signal' },
            { from: 'fatigue', to: 'ctr', strength: -0.8, lag: 0, confidence: 'strong_signal' },
          ],
          feedbackLoops: [
            {
              id: 'fatigue_spiral',
              name: 'Audience Fatigue Death Spiral',
              nodes: ['frequency', 'fatigue', 'ctr'],
              type: 'reinforcing',
              currentState: 'accelerating',
              description: 'Higher frequency causes fatigue, fatigue drops CTR, algorithm compensates by increasing frequency',
              intervention: 'Hard frequency cap to break the cycle',
              urgency: 'immediate',
            },
          ],
          hiddenVariables: [
            {
              id: 'competitor_activity',
              name: 'Competitor Activity',
              description: 'Competitor actions may be affecting performance',
              evidence: ['Multiple metrics declining simultaneously'],
              affectedNodes: ['ctr'],
              estimatedImpact: 0.3,
            },
          ],
          interventionPoints: [
            {
              nodeId: 'frequency',
              nodeName: 'Ad Frequency',
              type: 'break_loop',
              action: 'Constrain Ad Frequency to break the Audience Fatigue Death Spiral',
              expectedEffect: 'Breaking this loop should stop the downward spiral within 1-2 weeks',
              confidence: 'strong_signal',
              timeToEffect: '7-14 days',
              risks: ['May temporarily reduce reach/volume'],
            },
          ],
        },
        summary: {
          headline: 'A reinforcing loop is active: Audience Fatigue Death Spiral. This needs to be broken.',
          causalChain: 'Ad Frequency → Audience Fatigue → Click-Through Rate',
          feedbackLoopWarning: 'Warning: Audience Fatigue Death Spiral is actively accelerating.',
          hiddenFactors: 'Note: Competitor Activity may be at play.',
          primaryIntervention: 'Constrain Ad Frequency to break the Audience Fatigue Death Spiral',
          confidence: 'strong_signal',
          uncertainties: ['Hidden variables may be affecting the system'],
          watchFor: 'Monitor frequency closely. If it continues to worsen, the loop is still active.',
        },
        analysisTimeMs: 800,
      },
    ],

    // Mock curiosity scan results
    curiosityResults: [
      {
        scanTime: new Date(),
        sourcesScanned: ['meta_ads', 'shopify_orders', 'competitor_intel'],
        anomaliesFound: [
          {
            id: 'anomaly_1',
            type: 'unexpected_high',
            title: 'Tier-2 city segment with 3.5x average ROAS',
            description: 'Jaipur audience is outperforming metro averages',
            source: 'meta_ads',
            significance: 0.85,
            potentialValue: 'high',
            suggestedQuestions: ['Why is this segment performing better?', 'Can we scale budget here?'],
            relatedMetrics: ['ROAS by region', 'Budget allocation'],
          },
          {
            id: 'anomaly_2',
            type: 'unexpected_low',
            title: 'Retargeting audience underperforming',
            description: 'High-intent retargeting has 0.8x ROAS',
            source: 'meta_ads',
            significance: 0.78,
            potentialValue: 'high',
            suggestedQuestions: ['Why aren\'t high-intent users converting?'],
            relatedMetrics: ['Retargeting ROAS', 'Frequency'],
          },
        ],
        prioritizedQueue: [
          {
            anomaly: { id: 'anomaly_1', title: 'Tier-2 city segment with 3.5x average ROAS', type: 'unexpected_high' },
            priority: 0.9,
            explorationCost: 3,
            status: 'resolved',
          },
        ],
        topDiscoveries: [
          {
            anomalyId: 'anomaly_1',
            finding: 'Tier-2 opportunity confirmed - low competition and high intent in Jaipur segment',
            actionable: true,
            potentialImpact: 350000,
            recommendation: 'Increase budget allocation to Tier-2 segments by 15%',
            confidence: 'strong_signal',
            discoveredAt: new Date(),
          },
          {
            anomalyId: 'anomaly_2',
            finding: 'Retargeting frequency of 6.8x causing audience exhaustion',
            actionable: true,
            potentialImpact: 220000,
            recommendation: 'Implement frequency cap of 3x for retargeting audiences',
            confidence: 'moderate_evidence',
            discoveredAt: new Date(),
          },
        ],
        summary: {
          headline: 'Found 2 actionable insights with ₹5.7L/month potential impact.',
          anomalyCount: 2,
          highPriorityCount: 2,
          topAnomaly: 'Tier-2 city segment with 3.5x average ROAS',
          topQuestion: 'Why is this segment performing better?',
          recommendation: 'Increase budget allocation to Tier-2 segments by 15%',
          uncertainties: [],
        },
        scanTimeMs: 600,
      },
    ],

    // Client context
    clientContext: {
      industry: 'D2C Fashion',
      monthlySpend: 5000000,
      competitorNames: ['CompetitorX', 'CompetitorY'],
      recentChanges: ['Launched new collection', 'Increased ad spend 20%'],
    },

    // Additional findings
    additionalFindings: [
      'Brand search volume declining 15% MoM',
      'Competitor X increased ad spend significantly',
      'UGC content outperforming studio by 2x',
    ],
  };

  try {
    console.log('Synthesizing narrative for Pratapsons (₹50L/month spend)...');
    console.log();

    const result = await synthesizeNarrative(inputs, 'pratapsons', 5000000);

    console.log(`Synthesis completed in ${result.synthesisTimeMs}ms`);
    console.log(`Inputs used: ${result.inputsUsed.hypotheses} hypotheses, ${result.inputsUsed.causalModels} causal models, ${result.inputsUsed.curiosityScans} scans`);
    console.log();

    // Executive Summary
    console.log('─'.repeat(70));
    console.log('EXECUTIVE SUMMARY');
    console.log('─'.repeat(70));
    console.log();
    console.log(`HEADLINE: ${result.narrative.executiveSummary.headline}`);
    console.log();
    console.log(`SITUATION: ${result.narrative.executiveSummary.situation}`);
    console.log();
    console.log(`IMPLICATIONS: ${result.narrative.executiveSummary.implications}`);
    console.log();
    console.log(`RECOMMENDATION: ${result.narrative.executiveSummary.recommendation}`);
    console.log();
    console.log(`CONFIDENCE: ${result.narrative.executiveSummary.confidence}`);
    console.log();
    console.log(`WATCH FOR: ${result.narrative.executiveSummary.watchFor}`);
    console.log();

    // Worldview
    console.log('─'.repeat(70));
    console.log('WORLDVIEW MODEL');
    console.log('─'.repeat(70));
    console.log();
    console.log(`Market State: ${result.narrative.worldview.marketState}`);
    console.log(`Competitive Position: ${result.narrative.worldview.competitivePosition}`);
    console.log(`Customer Behavior: ${result.narrative.worldview.customerBehavior}`);
    console.log(`Overall Sentiment: ${result.narrative.worldview.overallSentiment}`);
    console.log();
    console.log('Key Risks:');
    result.narrative.worldview.keyRisks.forEach((risk, i) => {
      console.log(`  ${i + 1}. ${risk}`);
    });
    console.log();
    console.log('Key Opportunities:');
    result.narrative.worldview.keyOpportunities.forEach((opp, i) => {
      console.log(`  ${i + 1}. ${opp}`);
    });
    console.log();

    // Themes
    console.log('─'.repeat(70));
    console.log('THEMES IDENTIFIED');
    console.log('─'.repeat(70));
    console.log();
    result.narrative.themes.forEach((theme, i) => {
      console.log(`${i + 1}. ${theme.name} (strength: ${(theme.strength * 100).toFixed(0)}%)`);
      console.log(`   ${theme.description}`);
      console.log();
    });

    // Strategic Forces
    console.log('─'.repeat(70));
    console.log('STRATEGIC FORCES');
    console.log('─'.repeat(70));
    console.log();
    console.log(`Dominant Trend: ${result.narrative.dominantTrend}`);
    console.log();
    result.narrative.keyForces.forEach((force, i) => {
      const arrow = force.direction === 'favorable' ? '↑' : force.direction === 'unfavorable' ? '↓' : '→';
      console.log(`${i + 1}. ${arrow} ${force.name} (${force.direction}, ${(force.strength * 100).toFixed(0)}% strength)`);
      console.log(`   ${force.description}`);
      console.log(`   Horizon: ${force.timeHorizon}`);
      console.log();
    });

    // Inflection Points
    console.log('─'.repeat(70));
    console.log('INFLECTION POINTS');
    console.log('─'.repeat(70));
    console.log();
    result.narrative.inflectionPoints.forEach((inflection, i) => {
      console.log(`${i + 1}. ${inflection.description}`);
      console.log(`   Timing: ${inflection.timing} | Probability: ${(inflection.probability * 100).toFixed(0)}% | Severity: ${inflection.impactSeverity}`);
      console.log(`   Impact: ${inflection.impactIfOccurs}`);
      console.log(`   Action: ${inflection.preparatoryAction}`);
      console.log(`   Watch: ${inflection.earlyWarningSignals.join(', ')}`);
      console.log();
    });

    // Strategic Imperatives
    console.log('─'.repeat(70));
    console.log('STRATEGIC IMPERATIVES');
    console.log('─'.repeat(70));
    console.log();
    result.narrative.strategicImperatives.forEach((imp, i) => {
      console.log(`${i + 1}. [${imp.priority.toUpperCase()}] ${imp.action}`);
      console.log(`   Rationale: ${imp.rationale}`);
      console.log(`   Risk of Inaction: ${imp.riskOfInaction}`);
      console.log();
    });

    // Uncertainties
    console.log('─'.repeat(70));
    console.log('KEY UNCERTAINTIES');
    console.log('─'.repeat(70));
    console.log();
    result.narrative.uncertainties.forEach((unc, i) => {
      console.log(`${i + 1}. ${unc.area}: ${unc.description}`);
      console.log(`   Confidence: ${unc.confidenceRange}`);
      console.log(`   Risk: ${unc.whatCouldGoWrong}`);
      console.log(`   Verify: ${unc.howToVerify}`);
      console.log();
    });

    // Contradictions Resolved
    if (result.narrative.contradictionsResolved.length > 0) {
      console.log('─'.repeat(70));
      console.log('CONTRADICTIONS RESOLVED');
      console.log('─'.repeat(70));
      console.log();
      result.narrative.contradictionsResolved.forEach((c, i) => {
        console.log(`${i + 1}. Resolution: ${c.resolution}`);
        console.log(`   Finding 1: ${c.finding1}`);
        console.log(`   Finding 2: ${c.finding2}`);
        console.log(`   Explanation: ${c.explanation}`);
        console.log();
      });
    }

    console.log('='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testNarrativeSynthesis();
