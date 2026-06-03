/**
 * Test script for Uncertainty-Aware Intelligence
 *
 * Tests the UncertaintyIntelligenceEngine with sample estimates
 */

import { analyzeUncertainty, formatUncertainEstimate } from '../dist/services/strategic-cognition/uncertainty-intelligence.js';

async function testUncertaintyIntelligence() {
  console.log('='.repeat(70));
  console.log('UNCERTAINTY-AWARE INTELLIGENCE TEST');
  console.log('='.repeat(70));
  console.log();

  // Sample inputs with multiple estimates from different sources
  const inputs = [
    {
      variable: 'ROAS improvement from Tier-2 expansion',
      description: 'Expected ROAS improvement from expanding to Tier-2 cities',
      rawEstimates: [0.18, 0.22, 0.25, 0.15, 0.20],  // 5 estimates ranging 15-25%
      sources: ['Historical data', 'Competitor analysis', 'Market research', 'Pilot test', 'Team estimate'],
      assumptions: [
        'Tier-2 CAC similar to pilot (₹800)',
        'Competitor doesn\'t expand in next 90 days',
        'Seasonality effects are neutral',
      ],
      knownRisks: [
        'Competitor may respond aggressively',
        'Shipping costs in Tier-2 are 20% higher',
        'Brand awareness is lower in new markets',
      ],
    },
    {
      variable: 'CPA reduction from frequency cap',
      description: 'Expected CPA reduction from implementing 3x frequency cap',
      rawEstimates: [0.12, 0.08, 0.15, 0.10],  // 4 estimates ranging 8-15%
      sources: ['A/B test data', 'Industry benchmark', 'Historical pattern', 'Agency recommendation'],
      assumptions: [
        'Current frequency is the main issue',
        'Audience quality remains stable',
        'Algorithm adapts within 7 days',
      ],
      knownRisks: [
        'Reach may drop initially',
        'May miss some high-intent users',
      ],
    },
    {
      variable: 'Monthly revenue impact',
      description: 'Expected monthly revenue impact from combined initiatives',
      rawEstimates: [350000, 420000, 280000, 500000, 380000],  // Wide range: ₹2.8L to ₹5L
      sources: ['Bottom-up model', 'Top-down projection', 'Conservative estimate', 'Optimistic case', 'Base case'],
      assumptions: [
        'Both initiatives execute successfully',
        'No major platform changes',
        'Market conditions remain stable',
      ],
      knownRisks: [
        'Attribution may overstate impact',
        'Macro economic uncertainty',
        'Q3 seasonality unknown',
      ],
    },
  ];

  try {
    console.log('Analyzing uncertainty for Pratapsons (₹50L/month spend)...');
    console.log();

    const result = await analyzeUncertainty(inputs, 'pratapsons', 5000000);

    console.log(`Analysis completed in ${result.analysisTimeMs}ms`);
    console.log();

    // Overall Uncertainty
    console.log('─'.repeat(70));
    console.log('OVERALL UNCERTAINTY ASSESSMENT');
    console.log('─'.repeat(70));
    console.log();
    console.log(`Level: ${result.model.overallUncertainty.level.toUpperCase()}`);
    console.log(`Confidence in Conclusions: ${result.model.overallUncertainty.confidenceInConclusions}`);
    console.log();
    console.log('Primary Drivers:');
    result.model.overallUncertainty.primaryDrivers.forEach((driver, i) => {
      console.log(`  ${i + 1}. ${driver}`);
    });
    console.log();
    console.log(`Recommendation: ${result.model.overallUncertainty.recommendation}`);
    console.log();

    // Operator Report
    console.log('─'.repeat(70));
    console.log('OPERATOR REPORT');
    console.log('─'.repeat(70));
    console.log();
    console.log(`HEADLINE: ${result.model.operatorReport.headline}`);
    console.log();
    console.log('KEY ESTIMATES:');
    result.model.operatorReport.keyEstimates.forEach((est, i) => {
      console.log(`  ${i + 1}. ${est}`);
    });
    console.log();

    if (result.model.operatorReport.criticalAssumptions.length > 0) {
      console.log('CRITICAL ASSUMPTIONS:');
      result.model.operatorReport.criticalAssumptions.forEach((assumption, i) => {
        console.log(`  ${i + 1}. ${assumption}`);
      });
      console.log();
    }

    if (result.model.operatorReport.conflictsToResolve.length > 0) {
      console.log('CONFLICTS TO RESOLVE:');
      result.model.operatorReport.conflictsToResolve.forEach((conflict, i) => {
        console.log(`  ${i + 1}. ${conflict}`);
      });
      console.log();
    }

    if (result.model.operatorReport.sensitivityWarnings.length > 0) {
      console.log('SENSITIVITY WARNINGS:');
      result.model.operatorReport.sensitivityWarnings.forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning}`);
      });
      console.log();
    }

    if (result.model.operatorReport.whatCouldGoWrong.length > 0) {
      console.log('WHAT COULD GO WRONG:');
      result.model.operatorReport.whatCouldGoWrong.forEach((risk, i) => {
        console.log(`  ${i + 1}. ${risk}`);
      });
      console.log();
    }

    console.log(`RECOMMENDATION: ${result.model.operatorReport.recommendation}`);
    console.log();

    // Detailed Estimates
    console.log('─'.repeat(70));
    console.log('DETAILED ESTIMATES');
    console.log('─'.repeat(70));
    console.log();
    result.model.estimates.forEach((estimate, i) => {
      console.log(`--- Estimate ${i + 1}: ${estimate.variable} ---`);
      console.log(formatUncertainEstimate(estimate));
    });

    // Sensitivity Analysis
    console.log('─'.repeat(70));
    console.log('SENSITIVITY ANALYSIS');
    console.log('─'.repeat(70));
    console.log();
    result.model.sensitivities.forEach((sens, i) => {
      console.log(`${i + 1}. ${sens.assumption}`);
      console.log(`   Impact: ${sens.impactSeverity.toUpperCase()} | Belief: ${(sens.currentBelief * 100).toFixed(0)}%`);
      console.log(`   If wrong: ${sens.ifWrong}`);
      console.log(`   Verify: ${sens.howToVerify}`);
      console.log(`   Recommend verification: ${sens.recommendVerification ? 'YES' : 'No'}`);
      console.log();
    });

    // Conflicts
    if (result.model.conflicts.length > 0) {
      console.log('─'.repeat(70));
      console.log('EVIDENCE CONFLICTS');
      console.log('─'.repeat(70));
      console.log();
      result.model.conflicts.forEach((conflict, i) => {
        console.log(`${i + 1}. Topic: ${conflict.topic}`);
        console.log(`   Evidence 1: ${conflict.evidence1.finding} (confidence: ${(conflict.evidence1.confidence * 100).toFixed(0)}%)`);
        console.log(`   Evidence 2: ${conflict.evidence2.finding} (confidence: ${(conflict.evidence2.confidence * 100).toFixed(0)}%)`);
        console.log(`   Resolution: ${conflict.resolution}`);
        console.log(`   Reasoning: ${conflict.resolutionReasoning}`);
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

testUncertaintyIntelligence();
