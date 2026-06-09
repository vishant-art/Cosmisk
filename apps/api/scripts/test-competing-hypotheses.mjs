#!/usr/bin/env node
/**
 * Test script for Competing Hypothesis Framework
 *
 * Demonstrates how the system:
 * 1. Generates multiple competing hypotheses
 * 2. Tests predictions for each
 * 3. Updates probabilities based on evidence
 * 4. Reports in operator-grade language
 */

import { evaluateCompetingHypotheses } from '../dist/services/strategic-cognition/competing-hypotheses.js';

async function main() {
  console.log('='.repeat(80));
  console.log('COMPETING HYPOTHESIS FRAMEWORK TEST');
  console.log('='.repeat(80));
  console.log();

  // Test Case 1: ROAS Decline
  console.log('TEST CASE 1: ROAS Decline Observation');
  console.log('-'.repeat(60));
  console.log();

  const roasResult = await evaluateCompetingHypotheses(
    'ROAS dropped from 3.2x to 2.4x over 14 days',
    'test-client-001',
    3000000 // ₹30L/month spend
  );

  console.log('OBSERVATION:', roasResult.observation);
  console.log();

  console.log('HYPOTHESES EVALUATED:');
  for (const h of roasResult.hypotheses) {
    const probPercent = (h.currentProbability * 100).toFixed(1);
    const priorPercent = (h.priorProbability * 100).toFixed(1);
    console.log(`  [${h.status.toUpperCase()}] ${h.id}`);
    console.log(`    Prior: ${priorPercent}% → Current: ${probPercent}%`);
    console.log(`    Statement: ${h.statement.slice(0, 70)}...`);
    console.log(`    Supporting: ${h.supportingEvidence.length} | Contradicting: ${h.contradictingEvidence.length}`);
    console.log();
  }

  console.log('PROBABILITY UPDATES (Bayesian-style):');
  for (const update of roasResult.probabilityHistory.slice(0, 5)) {
    const prevPercent = (update.previousProbability * 100).toFixed(1);
    const newPercent = (update.newProbability * 100).toFixed(1);
    console.log(`  ${update.hypothesisId}: ${prevPercent}% → ${newPercent}%`);
    console.log(`    Reason: ${update.reason.slice(0, 60)}...`);
  }
  if (roasResult.probabilityHistory.length > 5) {
    console.log(`  ... and ${roasResult.probabilityHistory.length - 5} more updates`);
  }
  console.log();

  console.log('CONCLUSION:');
  console.log(`  Convergence Achieved: ${roasResult.conclusion.convergenceAchieved ? 'YES' : 'NO'}`);
  console.log(`  Confidence Level: ${roasResult.conclusion.confidenceLevel}`);
  if (roasResult.conclusion.dominant) {
    console.log(`  Dominant Hypothesis: ${roasResult.conclusion.dominant.id} (${(roasResult.conclusion.dominant.currentProbability * 100).toFixed(1)}%)`);
  }
  if (roasResult.conclusion.secondary) {
    console.log(`  Secondary Hypothesis: ${roasResult.conclusion.secondary.id} (${(roasResult.conclusion.secondary.currentProbability * 100).toFixed(1)}%)`);
  }
  if (roasResult.conclusion.combinedExplanation) {
    console.log(`  Combined Explanation: ${roasResult.conclusion.combinedExplanation.slice(0, 100)}...`);
  }
  console.log(`  Recommended Investigation: ${roasResult.conclusion.recommendedInvestigation}`);
  console.log();

  console.log('OPERATOR SUMMARY (What founders see):');
  console.log('-'.repeat(60));
  console.log();
  console.log(`HEADLINE: ${roasResult.operatorSummary.headline}`);
  console.log();
  console.log(`PRIMARY: ${roasResult.operatorSummary.primaryExplanation}`);
  if (roasResult.operatorSummary.alternativeExplanation) {
    console.log(`ALTERNATIVE: ${roasResult.operatorSummary.alternativeExplanation}`);
  }
  console.log();
  console.log(`CONFIDENCE: ${roasResult.operatorSummary.confidence}`);
  console.log(`EVIDENCE: ${roasResult.operatorSummary.evidenceStrength}`);
  console.log();
  console.log('WHAT WE CHECKED:');
  for (const check of roasResult.operatorSummary.whatWeChecked.slice(0, 3)) {
    console.log(`  • ${check}`);
  }
  console.log();
  console.log('UNCERTAINTIES:');
  for (const u of roasResult.operatorSummary.uncertainties) {
    console.log(`  • ${u}`);
  }
  console.log();
  console.log(`RECOMMENDATION: ${roasResult.operatorSummary.recommendation}`);
  console.log(`WATCH FOR: ${roasResult.operatorSummary.watchFor}`);
  console.log();
  console.log(`Evaluation Time: ${roasResult.evaluationTimeMs}ms`);
  console.log();

  // Test Case 2: CTR Decline
  console.log('='.repeat(80));
  console.log('TEST CASE 2: CTR Decline Observation');
  console.log('-'.repeat(60));
  console.log();

  const ctrResult = await evaluateCompetingHypotheses(
    'CTR dropped 40% across all campaigns in the last 2 weeks',
    'test-client-002',
    5000000 // ₹50L/month (enterprise)
  );

  console.log('OBSERVATION:', ctrResult.observation);
  console.log();

  console.log('HYPOTHESES (sorted by probability):');
  const sorted = [...ctrResult.hypotheses].sort((a, b) => b.currentProbability - a.currentProbability);
  for (const h of sorted) {
    const probPercent = (h.currentProbability * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(h.currentProbability * 20));
    console.log(`  ${bar.padEnd(20)} ${probPercent}% - ${h.id} [${h.status}]`);
  }
  console.log();

  console.log('OPERATOR SUMMARY:');
  console.log('-'.repeat(60));
  console.log(`HEADLINE: ${ctrResult.operatorSummary.headline}`);
  console.log(`CONFIDENCE: ${ctrResult.operatorSummary.confidence}`);
  console.log(`RECOMMENDATION: ${ctrResult.operatorSummary.recommendation}`);
  console.log();

  // Test Case 3: CPA Spike
  console.log('='.repeat(80));
  console.log('TEST CASE 3: CPA Spike Observation');
  console.log('-'.repeat(60));
  console.log();

  const cpaResult = await evaluateCompetingHypotheses(
    'CPA jumped from ₹850 to ₹1,400 in 5 days',
    'test-client-003',
    2000000 // ₹20L/month
  );

  console.log('OBSERVATION:', cpaResult.observation);
  console.log();

  console.log('HYPOTHESES (sorted by probability):');
  const cpaSorted = [...cpaResult.hypotheses].sort((a, b) => b.currentProbability - a.currentProbability);
  for (const h of cpaSorted) {
    const probPercent = (h.currentProbability * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(h.currentProbability * 20));
    console.log(`  ${bar.padEnd(20)} ${probPercent}% - ${h.id} [${h.status}]`);
  }
  console.log();

  console.log('OPERATOR SUMMARY:');
  console.log('-'.repeat(60));
  console.log(`HEADLINE: ${cpaResult.operatorSummary.headline}`);
  console.log(`CONFIDENCE: ${cpaResult.operatorSummary.confidence}`);
  console.log(`RECOMMENDATION: ${cpaResult.operatorSummary.recommendation}`);
  console.log();

  // Summary
  console.log('='.repeat(80));
  console.log('KEY DIFFERENCES FROM SINGLE-HYPOTHESIS APPROACH:');
  console.log('='.repeat(80));
  console.log();
  console.log('1. MULTIPLE EXPLANATIONS: Instead of jumping to one conclusion,');
  console.log('   we track 4-5 competing hypotheses simultaneously.');
  console.log();
  console.log('2. BAYESIAN UPDATES: Evidence updates probabilities, not just');
  console.log('   confirms/denies. Weak evidence = small update, strong = large.');
  console.log();
  console.log('3. UNCERTAINTY ACKNOWLEDGED: Reports say "most likely (38%) but');
  console.log('   can\'t rule out (28%)" instead of false certainty.');
  console.log();
  console.log('4. OPERATOR LANGUAGE: No fake percentages like "73.5% confident".');
  console.log('   Uses: "strong signal", "evidence leans toward", "early signs".');
  console.log();
  console.log('5. COMBINED EXPLANATIONS: Recognizes when multiple factors together');
  console.log('   explain the observation better than any single hypothesis.');
  console.log();
}

main().catch(console.error);
