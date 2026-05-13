#!/usr/bin/env node
/**
 * Test script for Causal Intelligence System
 *
 * Demonstrates how the system:
 * 1. Maps causal relationships between variables
 * 2. Detects feedback loops (reinforcing spirals)
 * 3. Identifies intervention points
 * 4. Discovers potential hidden variables
 */

import { analyzeCausality } from '../dist/services/strategic-cognition/causal-intelligence.js';

async function main() {
  console.log('='.repeat(80));
  console.log('CAUSAL INTELLIGENCE SYSTEM TEST');
  console.log('='.repeat(80));
  console.log();

  // Test Case 1: Audience Fatigue Scenario
  console.log('TEST CASE 1: Audience Fatigue Analysis');
  console.log('-'.repeat(60));
  console.log();

  const fatigueResult = await analyzeCausality(
    'Frequency is increasing and CTR is declining - possible audience fatigue',
    'test-client-001',
    3000000 // ₹30L/month
  );

  console.log('OBSERVATION:', fatigueResult.observation);
  console.log();

  console.log('CAUSAL MODEL:');
  console.log(`  Nodes: ${fatigueResult.model.nodes.length}`);
  console.log(`  Edges: ${fatigueResult.model.edges.length}`);
  console.log(`  Feedback Loops: ${fatigueResult.model.feedbackLoops.length}`);
  console.log(`  Hidden Variables: ${fatigueResult.model.hiddenVariables.length}`);
  console.log(`  Intervention Points: ${fatigueResult.model.interventionPoints.length}`);
  console.log();

  console.log('NODES (Variables):');
  for (const node of fatigueResult.model.nodes) {
    const direction = node.currentDirection === 'unknown' ? '?' :
                      node.currentDirection === 'increasing' ? '↑' :
                      node.currentDirection === 'decreasing' ? '↓' : '—';
    const type = node.type === 'latent' ? '[latent]' : node.type === 'intervention' ? '[ctrl]' : '';
    console.log(`  ${direction} ${node.name} ${type}`);
    console.log(`      ${node.description}`);
  }
  console.log();

  console.log('CAUSAL EDGES:');
  for (const edge of fatigueResult.model.edges.slice(0, 5)) {
    const fromNode = fatigueResult.model.nodes.find(n => n.id === edge.from);
    const toNode = fatigueResult.model.nodes.find(n => n.id === edge.to);
    const sign = edge.strength > 0 ? '+' : '-';
    console.log(`  ${fromNode?.name} ─(${sign}${Math.abs(edge.strength).toFixed(1)}, ${edge.lag}d)─> ${toNode?.name}`);
    console.log(`      Why: ${edge.mechanism.slice(0, 60)}...`);
    console.log(`      Confidence: ${edge.confidence}`);
  }
  if (fatigueResult.model.edges.length > 5) {
    console.log(`  ... and ${fatigueResult.model.edges.length - 5} more edges`);
  }
  console.log();

  if (fatigueResult.model.feedbackLoops.length > 0) {
    console.log('FEEDBACK LOOPS DETECTED:');
    for (const loop of fatigueResult.model.feedbackLoops) {
      const stateEmoji = loop.currentState === 'accelerating' ? '🔴' :
                         loop.currentState === 'decelerating' ? '🟢' : '🟡';
      console.log(`  ${stateEmoji} ${loop.name}`);
      console.log(`      Type: ${loop.type} | State: ${loop.currentState.toUpperCase()}`);
      console.log(`      Path: ${loop.nodes.join(' → ')}`);
      console.log(`      Description: ${loop.description}`);
      console.log(`      Intervention: ${loop.intervention}`);
      console.log(`      Urgency: ${loop.urgency}`);
    }
    console.log();
  }

  if (fatigueResult.model.interventionPoints.length > 0) {
    console.log('INTERVENTION POINTS:');
    for (const intervention of fatigueResult.model.interventionPoints) {
      console.log(`  [${intervention.type.toUpperCase()}] ${intervention.nodeName}`);
      console.log(`      Action: ${intervention.action}`);
      console.log(`      Expected: ${intervention.expectedEffect}`);
      console.log(`      Time to Effect: ${intervention.timeToEffect}`);
      console.log(`      Confidence: ${intervention.confidence}`);
      if (intervention.risks.length > 0) {
        console.log(`      Risks: ${intervention.risks[0]}`);
      }
    }
    console.log();
  }

  if (fatigueResult.model.hiddenVariables.length > 0) {
    console.log('POTENTIAL HIDDEN VARIABLES:');
    for (const hidden of fatigueResult.model.hiddenVariables) {
      console.log(`  ⚠️  ${hidden.name}`);
      console.log(`      ${hidden.description}`);
      console.log(`      Evidence: ${hidden.evidence[0]}`);
    }
    console.log();
  }

  console.log('OPERATOR SUMMARY:');
  console.log('-'.repeat(60));
  console.log(`HEADLINE: ${fatigueResult.summary.headline}`);
  console.log();
  console.log(`CAUSAL CHAIN: ${fatigueResult.summary.causalChain}`);
  console.log();
  if (fatigueResult.summary.feedbackLoopWarning) {
    console.log(`⚠️  FEEDBACK LOOP WARNING:`);
    console.log(`    ${fatigueResult.summary.feedbackLoopWarning}`);
    console.log();
  }
  if (fatigueResult.summary.hiddenFactors) {
    console.log(`🔍 HIDDEN FACTORS:`);
    console.log(`    ${fatigueResult.summary.hiddenFactors}`);
    console.log();
  }
  console.log(`PRIMARY INTERVENTION: ${fatigueResult.summary.primaryIntervention}`);
  console.log(`CONFIDENCE: ${fatigueResult.summary.confidence}`);
  console.log();
  console.log('UNCERTAINTIES:');
  for (const u of fatigueResult.summary.uncertainties) {
    console.log(`  • ${u}`);
  }
  console.log();
  console.log(`WATCH FOR: ${fatigueResult.summary.watchFor}`);
  console.log();
  console.log(`Analysis Time: ${fatigueResult.analysisTimeMs}ms`);
  console.log();

  // Test Case 2: Trust Erosion Scenario
  console.log('='.repeat(80));
  console.log('TEST CASE 2: Trust Erosion Analysis');
  console.log('-'.repeat(60));
  console.log();

  const trustResult = await analyzeCausality(
    'Competitor launched aggressive campaign, our brand trust declining',
    'test-client-002',
    5000000 // ₹50L/month
  );

  console.log('OBSERVATION:', trustResult.observation);
  console.log();
  console.log(`MODEL: ${trustResult.model.nodes.length} nodes, ${trustResult.model.edges.length} edges`);
  console.log(`LOOPS: ${trustResult.model.feedbackLoops.length} (${trustResult.model.feedbackLoops.map(l => l.name).join(', ') || 'none'})`);
  console.log();
  console.log('SUMMARY:');
  console.log(`  ${trustResult.summary.headline}`);
  console.log(`  Causal Chain: ${trustResult.summary.causalChain}`);
  console.log(`  Intervention: ${trustResult.summary.primaryIntervention}`);
  console.log();

  // Test Case 3: Creative Decay Scenario
  console.log('='.repeat(80));
  console.log('TEST CASE 3: Creative Decay Analysis');
  console.log('-'.repeat(60));
  console.log();

  const creativeResult = await analyzeCausality(
    'Creative performance declining, hook rate dropping on older ads',
    'test-client-003',
    2000000 // ₹20L/month
  );

  console.log('OBSERVATION:', creativeResult.observation);
  console.log();
  console.log(`MODEL: ${creativeResult.model.nodes.length} nodes, ${creativeResult.model.edges.length} edges`);
  console.log();
  console.log('CAUSAL CHAIN:', creativeResult.summary.causalChain);
  console.log();
  console.log('INTERVENTIONS:');
  for (const i of creativeResult.model.interventionPoints.slice(0, 2)) {
    console.log(`  • ${i.action}`);
  }
  console.log();

  // Summary
  console.log('='.repeat(80));
  console.log('KEY CAPABILITIES OF CAUSAL INTELLIGENCE:');
  console.log('='.repeat(80));
  console.log();
  console.log('1. CAUSAL vs CORRELATION: Maps actual cause-effect relationships,');
  console.log('   not just "these metrics move together".');
  console.log();
  console.log('2. FEEDBACK LOOPS: Detects reinforcing spirals (death spirals)');
  console.log('   and balancing mechanisms that maintain equilibrium.');
  console.log();
  console.log('3. HIDDEN VARIABLES: Identifies latent factors that aren\'t');
  console.log('   directly measurable but influence observable metrics.');
  console.log();
  console.log('4. INTERVENTION POINTS: Pinpoints where to act for maximum');
  console.log('   leverage - break loops, address roots, amplify positives.');
  console.log();
  console.log('5. TIME LAGS: Understands that A → B may take 3 days, 7 days,');
  console.log('   or 14 days to manifest - crucial for correct intervention timing.');
  console.log();
  console.log('6. MECHANISM EXPLANATION: Every edge explains WHY the relationship');
  console.log('   exists, not just that it exists.');
  console.log();
}

main().catch(console.error);
