/**
 * Test Signal Sufficiency Check
 * Verifies that "no data" reports are properly blocked
 */

import { checkSignalSufficiency } from '../dist/services/quality-governance/quality-scorer.js';

console.log('\n=== Signal Sufficiency Check Tests ===\n');

// Test 1: Empty content - should be NO_DATA
console.log('Test 1: Empty content');
const test1 = checkSignalSufficiency({
  type: 'test',
  content: '',
});
console.log(`  Verdict: ${test1.verdict}`);
console.log(`  Reason: ${test1.reason}`);
console.log(`  Should block: ${test1.verdict === 'NO_DATA' ? '✅ YES' : '❌ NO'}\n`);

// Test 2: "No data" message - should be NO_DATA
console.log('Test 2: "No data" message');
const test2 = checkSignalSufficiency({
  type: 'test',
  content: "We don't have enough signal yet to generate meaningful intelligence. Please ensure data sources are connected.",
});
console.log(`  Verdict: ${test2.verdict}`);
console.log(`  Reason: ${test2.reason}`);
console.log(`  Should block: ${test2.verdict === 'NO_DATA' ? '✅ YES' : '❌ NO'}\n`);

// Test 3: "Insufficient data" message - should be NO_DATA
console.log('Test 3: "Insufficient data" message');
const test3 = checkSignalSufficiency({
  type: 'test',
  content: "Insufficient data available. No insights or findings to report. Unable to generate analysis.",
});
console.log(`  Verdict: ${test3.verdict}`);
console.log(`  Reason: ${test3.reason}`);
console.log(`  Should block: ${test3.verdict === 'NO_DATA' ? '✅ YES' : '❌ NO'}\n`);

// Test 4: Very short content - should be NO_DATA
console.log('Test 4: Very short content (< 50 chars)');
const test4 = checkSignalSufficiency({
  type: 'test',
  content: "ROAS is 2.5",
});
console.log(`  Verdict: ${test4.verdict}`);
console.log(`  Reason: ${test4.reason}`);
console.log(`  Should block: ${test4.verdict === 'NO_DATA' ? '✅ YES' : '❌ NO'}\n`);

// Test 5: Good content - should be SUFFICIENT
console.log('Test 5: Good content with data');
const test5 = checkSignalSufficiency({
  type: 'test',
  content: `
    Creative Intelligence Analysis for Pratapsons

    Key Finding: Your artisan process videos are showing 48% higher CTR than product-only shots.
    This is because authenticity-driven content resonates with the NRI audience seeking heritage brands.

    The wedding season collection should be prioritized given the 2.8x ROAS in Tier-2 cities.
    We identified ₹4.2L in wasted spend on out-of-stock products over the past month.

    Recommendations:
    1. Launch founder story video by Friday - expected 30% lift in engagement
    2. Pause spending on products with < 5 units inventory
    3. Double budget on Tier-2 city targeting
  `,
  recommendations: ['Launch founder story video', 'Pause OOS products', 'Scale Tier-2'],
  dataPointsUsed: 5,
  crossSourceSynthesis: true,
});
console.log(`  Verdict: ${test5.verdict}`);
console.log(`  Reason: ${test5.reason}`);
console.log(`  Should pass: ${test5.verdict === 'SUFFICIENT' ? '✅ YES' : '❌ NO'}\n`);

// Summary
console.log('=== Summary ===');
const allPassed =
  test1.verdict === 'NO_DATA' &&
  test2.verdict === 'NO_DATA' &&
  test3.verdict === 'NO_DATA' &&
  test4.verdict === 'NO_DATA' &&
  test5.verdict === 'SUFFICIENT';

if (allPassed) {
  console.log('✅ All tests passed! Signal sufficiency check is working correctly.');
  console.log('   "No data" reports will be BLOCKED from shipping.\n');
} else {
  console.log('❌ Some tests failed. Check the implementation.\n');
}
