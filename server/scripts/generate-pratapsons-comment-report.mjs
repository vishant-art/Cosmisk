import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { decryptToken } from '../dist/services/token-crypto.js';
import {
  collectMetaAdComments,
  classifyComments,
  extractPatterns,
  generateCreativeConcepts,
  generateHTMLReport
} from '../dist/services/comment-mining-agent.js';

const db = new Database('./data/cosmisk.db');

const row = db.prepare(`
  SELECT mt.encrypted_access_token FROM meta_tokens mt
  JOIN users u ON u.id = mt.user_id
  WHERE u.role = 'admin' LIMIT 1
`).get();

const token = decryptToken(row.encrypted_access_token);

console.log('Mining comments for Pratapsons...');
const rawComments = await collectMetaAdComments(token, 'act_1738503939658460', { limit: 500 });
console.log('Mined', rawComments.length, 'comments');

console.log('Classifying comments with Gemini...');
const classified = await classifyComments(rawComments);
console.log('Classified', classified.length, 'comments');

console.log('Extracting patterns...');
const { patterns, language } = extractPatterns(classified);
console.log('Found', patterns.length, 'patterns');

console.log('Generating creative concepts (with AI)...');
const brandContext = { name: 'Pratapsons Heritage', category: 'Fashion & Ethnic Wear' };
// Pass classified comments as 4th param for AI context
const concepts = await generateCreativeConcepts(patterns, language, brandContext, classified);
console.log('Generated', concepts.length, 'concepts');

// Build category counts
const categories = {
  objection: 0,
  desire: 0,
  praise: 0,
  comparison: 0,
  use_case: 0,
  question: 0,
  frustration: 0,
  other: 0
};
for (const c of classified) {
  const cat = c.category.toLowerCase();
  if (categories[cat] !== undefined) {
    categories[cat]++;
  } else {
    categories.other++;
  }
}

// Build emotional heatmap
const emotionalHeatmap = {};
for (const c of classified) {
  for (const emotion of c.emotionalTriggers || []) {
    emotionalHeatmap[emotion] = (emotionalHeatmap[emotion] || 0) + 1;
  }
}

// Build objection map
const objectionMap = patterns
  .filter(p => p.category === 'objection' || p.category === 'question')
  .slice(0, 10)
  .map(p => ({
    objection: p.pattern,
    frequency: p.frequency,
    currentlyAddressed: false
  }));

// Generate "What To Create Next" recommendations
const whatToCreateNext = generateWhatToCreateNextLocal(patterns, categories, concepts);

// Generate urgent insights
const urgentInsights = [];
const topObjection = patterns.find(p => p.category === 'objection' && p.frequency >= 5);
if (topObjection) {
  urgentInsights.push(`${topObjection.frequency} comments mention "${topObjection.pattern}" — create objection-handling ad immediately`);
}
const topPraise = patterns.find(p => p.category === 'praise' && p.frequency >= 10);
if (topPraise) {
  urgentInsights.push(`"${topPraise.pattern}" mentioned ${topPraise.frequency}+ times — strong social proof hook available`);
}
const frustrationCount = categories.frustration;
if (frustrationCount > classified.length * 0.1) {
  urgentInsights.push(`${frustrationCount} frustration comments (${Math.round(frustrationCount / classified.length * 100)}%) — review and address`);
}
const topPriority = whatToCreateNext.find(w => w.priority === 1);
if (topPriority) {
  urgentInsights.push(`TOP PRIORITY: Create ${topPriority.conceptType} ad — ${topPriority.reason}`);
}

// Build full report
const report = {
  clientId: 'pratapsons',
  minedAt: new Date().toISOString(),
  totalComments: rawComments.length,
  classifiedComments: classified.length,
  categories,
  topPatterns: patterns.slice(0, 15),
  customerLanguage: language,
  creativeConcepts: concepts,
  urgentInsights,
  whatToCreateNext,
  emotionalHeatmap,
  objectionMap
};

// Use the new enhanced HTML generator
const html = generateHTMLReport(report, 'Pratapsons Heritage');

const filename = 'comment-report-pratapsons-' + Date.now() + '.html';
writeFileSync(filename, html);
console.log('\n✅ Report saved to:', filename);

// Also log key stats
console.log('\n📊 Summary:');
console.log('  - Comments analyzed:', classified.length);
console.log('  - Patterns found:', patterns.length);
console.log('  - Concepts generated:', concepts.length);
console.log('  - What To Create Next:', whatToCreateNext.length, 'recommendations');
console.log('\n📋 Category breakdown:');
Object.entries(categories).sort((a,b) => b[1] - a[1]).forEach(([cat, count]) => {
  if (count > 0) console.log(`  - ${cat}: ${count} (${Math.round(count/classified.length*100)}%)`);
});

if (whatToCreateNext.length > 0) {
  console.log('\n🎯 Top 3 Creative Priorities:');
  whatToCreateNext.slice(0, 3).forEach(w => {
    console.log(`  ${w.priority}. ${w.conceptType.replace(/_/g, ' ')} — ${w.reason}`);
  });
}

// Local implementation of whatToCreateNext since it's not exported
function generateWhatToCreateNextLocal(patterns, categoryCount, concepts) {
  const recommendations = [];
  const totalComments = Object.values(categoryCount).reduce((a, b) => a + b, 0);

  // Check for high-frequency objections (URGENT)
  const topObjections = patterns
    .filter(p => p.category === 'objection' && p.frequency >= 3)
    .slice(0, 3);

  for (let i = 0; i < topObjections.length; i++) {
    const obj = topObjections[i];
    recommendations.push({
      priority: i + 1,
      conceptType: 'objection_handler',
      reason: `"${obj.pattern}" asked ${obj.frequency}x — potential customers are hesitating`,
      dataPoints: obj.frequency,
      estimatedROI: obj.frequency >= 5 ? 'high' : 'medium',
      suggestedFormats: ['ugc_script', 'video_hook'],
      deadline: obj.frequency >= 5 ? 'ASAP' : 'This week'
    });
  }

  // Check for frustration spike
  const frustrationRate = (categoryCount.frustration / totalComments) * 100;
  if (frustrationRate > 15) {
    recommendations.push({
      priority: 1,
      conceptType: 'fear_reversal',
      reason: `${Math.round(frustrationRate)}% frustration rate — address before it spreads`,
      dataPoints: categoryCount.frustration,
      estimatedROI: 'high',
      suggestedFormats: ['ugc_script', 'static_image'],
      deadline: 'ASAP'
    });
  }

  // Leverage high praise for social proof
  const topPraise = patterns
    .filter(p => p.category === 'praise' && p.frequency >= 3)
    .slice(0, 2);

  for (const praise of topPraise) {
    const existingPriorities = recommendations.map(r => r.priority);
    const nextPriority = existingPriorities.length > 0 ? Math.max(...existingPriorities) + 1 : 3;

    recommendations.push({
      priority: nextPriority,
      conceptType: 'social_proof',
      reason: `"${praise.pattern}" resonates — ${praise.frequency} customers already saying it`,
      dataPoints: praise.frequency,
      estimatedROI: praise.frequency >= 5 ? 'high' : 'medium',
      suggestedFormats: ['carousel', 'static_image', 'ugc_script'],
      deadline: 'This week'
    });
  }

  // Sort by priority and renumber
  recommendations.sort((a, b) => a.priority - b.priority);
  recommendations.forEach((r, i) => { r.priority = i + 1; });

  return recommendations.slice(0, 8);
}
