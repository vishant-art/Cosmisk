/**
 * Generate "What Should We Create Next?" Report
 *
 * Combines signals from:
 * - Comment Mining (patterns)
 * - Performance Data (Meta ads)
 * - Competitor Intelligence
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { decryptToken } from '../dist/services/token-crypto.js';
import {
  collectMetaAdComments,
  classifyComments,
  extractPatterns
} from '../dist/services/comment-mining-agent.js';
import {
  generateOpportunityQueue,
  generateOpportunityHTML
} from '../dist/services/creative-opportunity-engine.js';

const db = new Database('./data/cosmisk.db');

// Get Meta token
const row = db.prepare(`
  SELECT mt.encrypted_access_token FROM meta_tokens mt
  JOIN users u ON u.id = mt.user_id
  WHERE u.role = 'admin' LIMIT 1
`).get();

const token = decryptToken(row.encrypted_access_token);
const accountId = 'act_1738503939658460'; // Pratapsons

console.log('📊 Generating "What Should We Create Next?" report...\n');

// Step 1: Gather comment signals
console.log('Step 1: Mining comments...');
const rawComments = await collectMetaAdComments(token, accountId, { limit: 200 });
console.log(`  Mined ${rawComments.length} comments`);

const classified = await classifyComments(rawComments);
console.log(`  Classified ${classified.length} comments`);

const { patterns } = extractPatterns(classified);
console.log(`  Found ${patterns.length} patterns`);

// Convert patterns to comment signals
const commentSignals = patterns.slice(0, 20).map(p => ({
  pattern: p.pattern,
  category: p.category,
  frequency: p.frequency,
  emotionalIntensity: p.sentiment === 'negative' ? 80 : p.sentiment === 'positive' ? 60 : 50,
  exampleComments: p.exampleComments.slice(0, 2)
}));

// Step 2: Mock fatigue signals (would come from fatigue-detector.ts in production)
console.log('\nStep 2: Checking creative fatigue...');
const fatigueSignals = [
  {
    creativeId: 'mock-1',
    creativeName: 'Summer Collection UGC',
    fatigueScore: 75,
    daysSinceDecline: 5,
    currentCTR: 0.8,
    peakCTR: 1.5,
    spend: 45000
  }
];
console.log(`  Found ${fatigueSignals.length} fatigued creatives`);

// Step 3: Mock performance signals (would come from meta-api.ts in production)
console.log('\nStep 3: Analyzing performance data...');
const performanceSignals = {
  topCreatives: [
    { id: 'top-1', name: 'Ethnic Kurta Testimonial', roas: 4.2, spend: 125000, format: 'video' }
  ],
  underperforming: [],
  formatBreakdown: {
    'video': { count: 15, avgRoas: 3.2 },
    'image': { count: 25, avgRoas: 2.8 },
    'carousel': { count: 3, avgRoas: 3.5 }
  }
};
console.log(`  Top creative ROAS: ${performanceSignals.topCreatives[0]?.roas || 'N/A'}x`);

// Step 4: Mock competitor signals (would come from competitor-creative-intel.ts)
console.log('\nStep 4: Checking competitor gaps...');
const competitorSignals = [
  {
    competitorName: 'Competitor A',
    gap: 'No sizing guides in ads',
    description: 'Competitors are not addressing sizing concerns visually',
    opportunity: 'Create sizing guide carousel that builds confidence'
  }
];
console.log(`  Found ${competitorSignals.length} competitor gaps`);

// Step 5: Generate opportunity queue
console.log('\n🎯 Generating opportunity queue...');
const result = await generateOpportunityQueue('pratapsons', {
  fatigue: fatigueSignals,
  comments: commentSignals,
  competitors: competitorSignals,
  performance: performanceSignals
});

console.log(`\n📋 Summary:`);
console.log(`  - Critical: ${result.summary.critical}`);
console.log(`  - High: ${result.summary.high}`);
console.log(`  - Medium: ${result.summary.medium}`);
console.log(`  - Low: ${result.summary.low}`);
console.log(`  - Total opportunities: ${result.opportunities.length}`);

if (result.opportunities.length > 0) {
  console.log(`\n🚨 Top Priority: ${result.summary.topPriority}`);

  console.log(`\n🎯 Top 5 Opportunities:`);
  result.opportunities.slice(0, 5).forEach((opp, i) => {
    console.log(`  ${i + 1}. [${opp.urgency.toUpperCase()}] ${opp.title}`);
  });
}

// Generate HTML report
const html = generateOpportunityHTML(result, 'Pratapsons Heritage');
const filename = `opportunity-report-pratapsons-${Date.now()}.html`;
writeFileSync(filename, html);
console.log(`\n✅ Report saved to: ${filename}`);
