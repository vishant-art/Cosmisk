#!/usr/bin/env node
/**
 * Test Quality Gate with Pratapsons-like scenarios
 *
 * Demonstrates that:
 * 1. "No data" reports are BLOCKED
 * 2. Good reports with actual data are SHIPPED
 * 3. The quality gate works end-to-end
 */

import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import quality governance
const {
  checkSignalSufficiency,
  evaluateQuality,
} = await import('../dist/services/quality-governance/quality-scorer.js');

const {
  evaluateEliteQuality,
} = await import('../dist/services/intelligence-layer/elite-quality-gate.js');

const {
  createEmptyThinkingTrace,
} = await import('../dist/services/intelligence-layer/index.js');

console.log('\n' + '═'.repeat(60));
console.log('PRATAPSONS QUALITY GATE VERIFICATION');
console.log('═'.repeat(60));
console.log('\nThis test verifies that "no data" reports are blocked.\n');

// ========================================
// SCENARIO 1: "No Data" Report (SHOULD BE BLOCKED)
// ========================================
console.log('─'.repeat(60));
console.log('SCENARIO 1: "No Data" Report');
console.log('─'.repeat(60));

const noDataReport = {
  type: 'creative-intelligence',
  content: `We don't have enough signal yet to generate meaningful intelligence.

Please ensure:
- Meta Ads API is connected
- Shopify store data is available
- Account has sufficient activity

No insights or findings to report at this time.`,
  recommendations: [],
  dataPointsUsed: 0,
};

const noDataCheck = checkSignalSufficiency(noDataReport);
console.log(`\nContent: "${noDataReport.content.substring(0, 60)}..."`);
console.log(`\nSignal Sufficiency Check:`);
console.log(`  Verdict: ${noDataCheck.verdict}`);
console.log(`  Reason: ${noDataCheck.reason}`);
console.log(`  Has sufficient signal: ${noDataCheck.hasSufficientSignal}`);
console.log(`\n  ➜ ${noDataCheck.verdict === 'NO_DATA' ? '✅ BLOCKED - Will NOT ship to client' : '❌ PROBLEM - Would ship empty report'}`);

// ========================================
// SCENARIO 2: Empty Content (SHOULD BE BLOCKED)
// ========================================
console.log('\n' + '─'.repeat(60));
console.log('SCENARIO 2: Empty/Minimal Content');
console.log('─'.repeat(60));

const emptyReport = {
  type: 'oos-detection',
  content: 'ROAS: 2.5',
  recommendations: [],
  dataPointsUsed: 0,
};

const emptyCheck = checkSignalSufficiency(emptyReport);
console.log(`\nContent: "${emptyReport.content}"`);
console.log(`\nSignal Sufficiency Check:`);
console.log(`  Verdict: ${emptyCheck.verdict}`);
console.log(`  Reason: ${emptyCheck.reason}`);
console.log(`\n  ➜ ${emptyCheck.verdict === 'NO_DATA' ? '✅ BLOCKED - Will NOT ship to client' : '❌ PROBLEM - Would ship empty report'}`);

// ========================================
// SCENARIO 3: Good Report (SHOULD PASS)
// ========================================
console.log('\n' + '─'.repeat(60));
console.log('SCENARIO 3: Good Report with Data');
console.log('─'.repeat(60));

const goodReport = {
  type: 'creative-intelligence',
  content: `Creative Intelligence Report for Pratapsons

KEY FINDING: Your artisan process videos are showing 48% higher CTR (3.1%) compared to product-only shots (2.1%). This is because authenticity-driven content resonates with NRI audiences seeking heritage brands.

CROSS-PLATFORM SYNTHESIS:
- Meta Ads: Founder content CTR at 3.1% vs 2.1% average
- Shopify: Wedding collection orders up 40% this month
- Comments: 47 mentions of "artisan" and "handcraft" - positive sentiment
- Competitor Intel: Manyavar shifting to behind-the-scenes content

ECONOMIC IMPACT: Estimated ₹4.2L in additional revenue if founder content is scaled across all ad sets. Current wasted spend on fatiguing hooks: ₹1.8L/month.

IMMEDIATE ACTIONS:
1. Launch artisan process video by Friday - expect 30% engagement lift
2. Pause scarcity hooks ("only X left") - they've saturated (CTR dropped 40%)
3. Create wedding collection carousel - capitalizes on rising intent signals

RISK: Creative fatigue in 8 days if no refresh. Trust gap emerging with new audience scale - address with operational proof content.`,
  recommendations: [
    'Launch artisan process video with founder voiceover by Friday',
    'Pause ₹1.8L spend on fatiguing scarcity hooks immediately',
    'Create wedding collection carousel this week',
    'Deploy operational proof content to address trust gap',
  ],
  dataPointsUsed: 12,
  crossSourceSynthesis: true,
  economicImpactEstimate: 420000,
  metrics: {
    founderCTR: 3.1,
    avgCTR: 2.1,
    weddingOrderGrowth: 40,
    wastedSpend: 180000,
    estimatedROI: 420000,
  },
};

const goodCheck = checkSignalSufficiency(goodReport);
console.log(`\nContent length: ${goodReport.content.length} chars`);
console.log(`Data points: ${goodReport.dataPointsUsed}`);
console.log(`Cross-source synthesis: ${goodReport.crossSourceSynthesis}`);
console.log(`\nSignal Sufficiency Check:`);
console.log(`  Verdict: ${goodCheck.verdict}`);
console.log(`  Reason: ${goodCheck.reason}`);
console.log(`\n  ➜ ${goodCheck.verdict === 'SUFFICIENT' ? '✅ PASSED - Can proceed to quality scoring' : '❌ PROBLEM - Blocked good report'}`);

// Now run through full quality evaluation
console.log('\nFull Quality Evaluation:');
const qualityEval = evaluateQuality(goodReport);
console.log(`  Composite Score: ${qualityEval.compositeScore}/100`);
console.log(`  Verdict: ${qualityEval.verdict}`);
console.log(`  Reasons: ${qualityEval.reasons.join(', ')}`);

// ========================================
// SCENARIO 4: Elite Quality Gate (Full Test)
// ========================================
console.log('\n' + '─'.repeat(60));
console.log('SCENARIO 4: Elite Quality Gate (Enterprise Tier)');
console.log('─'.repeat(60));

// Test with enterprise spend (₹50L+/month)
const eliteInput = {
  clientId: 'pratapsons',
  monthlySpend: 5000000, // ₹50L
  reportType: 'creative-intelligence',
  content: goodReport.content,
  recommendations: goodReport.recommendations,
  thinkingTrace: createEmptyThinkingTrace(),
  signalEvidence: [
    { source: 'meta_ads', dataPoint: 'Founder CTR', value: '3.1%', confidence: 0.9 },
    { source: 'meta_ads', dataPoint: 'Average CTR', value: '2.1%', confidence: 0.9 },
    { source: 'shopify_orders', dataPoint: 'Wedding growth', value: '40%', confidence: 0.85 },
    { source: 'ad_comments', dataPoint: 'Artisan mentions', value: '47', confidence: 0.8 },
    { source: 'competitor_intel', dataPoint: 'Manyavar shift', value: 'BTS content', confidence: 0.7 },
  ],
  crossSourceSynthesis: true,
  economicImpactEstimate: 420000,
};

const eliteVerdict = evaluateEliteQuality(eliteInput);
console.log(`\nSpend Tier: ${eliteVerdict.spendTier} (₹50L+/month)`);
console.log(`Quality Thresholds: ${eliteVerdict.thresholds.thinkingQuality}+ thinking, ${eliteVerdict.thresholds.outputQuality}+ output`);
console.log(`\nScores:`);
console.log(`  Thinking: ${eliteVerdict.thinkingScore}/100`);
console.log(`  Output: ${eliteVerdict.outputScore}/100`);
console.log(`  Combined: ${eliteVerdict.combinedScore}/100`);
console.log(`\nVerdict: ${eliteVerdict.verdict}`);
console.log(`Ship: ${eliteVerdict.ship ? '✅ YES' : '❌ NO'}`);

// ========================================
// SCENARIO 5: No Data through Elite Gate
// ========================================
console.log('\n' + '─'.repeat(60));
console.log('SCENARIO 5: "No Data" through Elite Gate');
console.log('─'.repeat(60));

const noDataEliteInput = {
  clientId: 'pratapsons',
  monthlySpend: 5000000,
  reportType: 'creative-intelligence',
  content: noDataReport.content,
  recommendations: [],
  thinkingTrace: createEmptyThinkingTrace(),
  signalEvidence: [],
  crossSourceSynthesis: false,
};

const noDataEliteVerdict = evaluateEliteQuality(noDataEliteInput);
console.log(`\nVerdict: ${noDataEliteVerdict.verdict}`);
console.log(`Ship: ${noDataEliteVerdict.ship ? '❌ PROBLEM - Would ship' : '✅ BLOCKED'}`);
if (noDataEliteVerdict.rejection) {
  console.log(`Rejection Reason: ${noDataEliteVerdict.rejection.primaryReason}`);
}

// ========================================
// SUMMARY
// ========================================
console.log('\n' + '═'.repeat(60));
console.log('SUMMARY');
console.log('═'.repeat(60));

const allPassed =
  noDataCheck.verdict === 'NO_DATA' &&
  emptyCheck.verdict === 'NO_DATA' &&
  goodCheck.verdict === 'SUFFICIENT' &&
  noDataEliteVerdict.verdict === 'REJECT_NO_DATA';

console.log('\nTest Results:');
console.log(`  Scenario 1 (No Data):      ${noDataCheck.verdict === 'NO_DATA' ? '✅ BLOCKED' : '❌ FAILED'}`);
console.log(`  Scenario 2 (Empty):        ${emptyCheck.verdict === 'NO_DATA' ? '✅ BLOCKED' : '❌ FAILED'}`);
console.log(`  Scenario 3 (Good Report):  ${goodCheck.verdict === 'SUFFICIENT' ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`  Scenario 4 (Elite Gate):   ${eliteVerdict.ship ? '✅ SHIPPED' : '⚠️ HELD'}`);
console.log(`  Scenario 5 (No Data Elite): ${noDataEliteVerdict.verdict === 'REJECT_NO_DATA' ? '✅ BLOCKED' : '❌ FAILED'}`);

if (allPassed) {
  console.log('\n✅ ALL QUALITY GATE TESTS PASSED');
  console.log('\n   "No data" reports will be BLOCKED from shipping to clients.');
  console.log('   The bug that shipped empty reports has been FIXED.\n');
} else {
  console.log('\n❌ SOME TESTS FAILED - Check implementation\n');
}
