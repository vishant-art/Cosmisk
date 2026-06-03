/**
 * Test All Intelligence Agents
 *
 * Demonstrates output from:
 * 1. Comment Mining Agent (AI-powered UGC scripts)
 * 2. Strategic Intelligence Engine (psychology-driven insights)
 * 3. Organic→Paid Intelligence (CCP scoring)
 */

import { writeFileSync } from 'fs';

// Import agents
import {
  analyzeAudiencePsychology,
  generateStrategicIntelligence,
  generateStrategicIntelligenceHTML
} from '../dist/services/strategic-intelligence-engine.js';

import {
  scoreCCP,
  extractCreatorDNA,
  analyzeCommentDeep,
  analyzeTrendTiming,
  determineAdaptations
} from '../dist/services/organic-paid-intelligence.js';

console.log('🧠 Testing All Intelligence Agents\n');
console.log('═'.repeat(60));

// ============================================================================
// 1. STRATEGIC INTELLIGENCE ENGINE
// ============================================================================
console.log('\n📊 AGENT 1: Strategic Intelligence Engine');
console.log('─'.repeat(60));

// Sample classified comments (simulating comment-mining output)
// For Strategic Intelligence Engine - needs CommentSignalInput format
const commentSignals = [
  { pattern: 'Is this genuine silk or synthetic?', category: 'question', frequency: 5, emotionalIntensity: 60 },
  { pattern: 'Ordered weeks ago still waiting bad experience', category: 'frustration', frequency: 8, emotionalIntensity: 85 },
  { pattern: 'Price seems too good to be true for real silk', category: 'objection', frequency: 4, emotionalIntensity: 70 },
  { pattern: 'Wow this looks amazing ordering now', category: 'praise', frequency: 12, emotionalIntensity: 75 },
  { pattern: 'Can you show close-up of the fabric quality?', category: 'question', frequency: 6, emotionalIntensity: 50 },
  { pattern: 'Is this legit or fake product?', category: 'question', frequency: 3, emotionalIntensity: 80 },
  { pattern: 'Shipping charges are ridiculous lost customer', category: 'frustration', frequency: 7, emotionalIntensity: 90 },
  { pattern: 'Does it shrink after washing? Material quality?', category: 'question', frequency: 4, emotionalIntensity: 55 },
  { pattern: 'Beautiful what sizes available?', category: 'praise', frequency: 10, emotionalIntensity: 65 },
  { pattern: 'Looks cheap like Amazon fake products', category: 'objection', frequency: 2, emotionalIntensity: 75 },
];

// For Organic→Paid Comment Intelligence - needs raw comment format
const rawComments = [
  { text: 'Is this genuine silk or synthetic?', category: 'product_question', sentiment: 'neutral', emotionalTriggers: ['skepticism'] },
  { text: 'Ordered 2 weeks ago, still waiting. Bad experience', category: 'complaint', sentiment: 'negative', emotionalTriggers: ['frustration', 'anger'] },
  { text: 'Price seems too good to be true for pure silk', category: 'price_objection', sentiment: 'negative', emotionalTriggers: ['skepticism', 'distrust'] },
  { text: 'Wow this looks amazing! Ordering now', category: 'purchase_intent', sentiment: 'positive', emotionalTriggers: ['excitement', 'desire'] },
  { text: 'Can you show a close-up of the fabric?', category: 'product_question', sentiment: 'neutral', emotionalTriggers: ['curiosity'] },
  { text: 'My friend bought this and loved it', category: 'social_proof', sentiment: 'positive', emotionalTriggers: ['trust', 'confidence'] },
  { text: 'Shipping charges are ridiculous. Lost a customer.', category: 'complaint', sentiment: 'negative', emotionalTriggers: ['frustration', 'anger'] },
  { text: 'Does it shrink after washing?', category: 'product_question', sentiment: 'neutral', emotionalTriggers: ['concern', 'skepticism'] },
  { text: 'Beautiful! What sizes available?', category: 'purchase_intent', sentiment: 'positive', emotionalTriggers: ['excitement'] },
  { text: 'Looks exactly like the cheap ones on Amazon', category: 'price_objection', sentiment: 'negative', emotionalTriggers: ['skepticism', 'distrust'] },
];

// Analyze audience psychology
const categoryContext = { name: 'Ethnic Wear', pricePoint: 'premium' };
const psychologyReport = analyzeAudiencePsychology(commentSignals, categoryContext);

console.log('\n🧠 Audience Psychology Analysis:');
console.log('─'.repeat(40));
console.log(`\nTrust Landscape:`);
console.log(`  Overall Trust: ${psychologyReport.trustLandscape.overallTrust}`);
console.log(`  Trust Threats: ${psychologyReport.trustLandscape.trustThreats.join(', ') || 'None'}`);
console.log(`  Trust Opportunities: ${psychologyReport.trustLandscape.trustOpportunities.join(', ') || 'None'}`);

console.log(`\nEmotional Landscape:`);
console.log(`  Dominant Emotions: ${psychologyReport.emotionalLandscape.dominantEmotions.join(', ') || 'None'}`);
console.log(`  Emerging Emotions: ${psychologyReport.emotionalLandscape.emergingEmotions.join(', ') || 'None'}`);
console.log(`  Emotional Shifts: ${psychologyReport.emotionalLandscape.emotionalShifts.join(', ') || 'None'}`);

console.log(`\nBuying Friction:`);
console.log(`  Trend: ${psychologyReport.buyingFriction.frictionTrend}`);
console.log(`  Primary Blockers: ${psychologyReport.buyingFriction.primaryBlockers.join(', ') || 'None detected'}`);
console.log(`  Hidden Friction: ${psychologyReport.buyingFriction.hiddenFriction.join(', ') || 'None detected'}`);

console.log(`\nStrategic Interpretation:`);
console.log(`  "${psychologyReport.strategicInterpretation}"`);

// Generate strategic report
const strategicData = {
  commentSignals: commentSignals,
  fatigueSignals: [{
    creativeId: 'test-1',
    creativeName: 'Summer Collection UGC',
    fatigueScore: 75,
    daysSinceDecline: 5,
    currentCTR: 0.8,
    peakCTR: 1.5,
    spend: 45000
  }],
  performanceSignals: {
    topCreatives: [{ id: 'top-1', name: 'Ethnic Kurta Testimonial', roas: 4.2, spend: 125000, format: 'video' }],
    underperforming: [],
    formatBreakdown: { video: { count: 15, avgRoas: 3.2 } }
  },
  competitorGaps: [
    'No sizing guides in ads',
    'Competitors not addressing fabric quality concerns',
    'No behind-the-scenes content showing craftsmanship'
  ],
  categoryContext: categoryContext
};

const strategicReport = await generateStrategicIntelligence('pratapsons', strategicData);

console.log('\n📈 Strategic Report Generated:');
console.log('─'.repeat(40));
console.log(`  Risks Identified: ${strategicReport.risks.length}`);
console.log(`  Opportunities Found: ${strategicReport.opportunities.length}`);

if (strategicReport.risks.length > 0) {
  console.log(`\n🚨 Top Risk:`);
  const topRisk = strategicReport.risks[0];
  console.log(`  Type: ${topRisk.riskType} (${topRisk.severity})`);
  console.log(`  Observation: ${topRisk.observation}`);
  console.log(`  Interpretation: ${topRisk.interpretation}`);
  console.log(`  Business Impact: ${topRisk.businessImpact}`);
}

if (strategicReport.opportunities.length > 0) {
  console.log(`\n🎯 Top Opportunity:`);
  const topOpp = strategicReport.opportunities[0];
  console.log(`  Type: ${topOpp.opportunityType} (${topOpp.leverage})`);
  console.log(`  Signal: ${topOpp.signal}`);
  console.log(`  Strategic Value: ${topOpp.strategicValue}`);
}

// ============================================================================
// 2. ORGANIC→PAID INTELLIGENCE
// ============================================================================
console.log('\n\n📱 AGENT 2: Organic→Paid Intelligence');
console.log('─'.repeat(60));

// Test CCP Score calculation
const ccpInput = {
  hasDesireCreation: true,
  hasObjectionHandling: true,
  hasUrgency: false,
  hasProductValueClarity: true,
  hasEmotionalHook: true,
  engagementRate: 8.5,
  commentSentimentRatio: 0.7,
  savesSharesRatio: 0.15,
  audienceMatchScore: 85
};

const ccpScore = scoreCCP(ccpInput);
console.log('\n💰 Commercial Conversion Potential (CCP) Score:');
console.log('─'.repeat(40));
console.log(`  Total Score: ${ccpScore.total}/100`);
console.log(`  Purchase Psychology: ${ccpScore.breakdown.purchasePsychology}/25`);
console.log(`  Trust Transferability: ${ccpScore.breakdown.trustTransferability}/25`);
console.log(`  Cold Audience Viability: ${ccpScore.breakdown.coldAudienceViability}/20`);
console.log(`  Scalability: ${ccpScore.breakdown.scalability}/15`);
console.log(`  Comment Signals: ${ccpScore.breakdown.commentSignals}/15`);
console.log(`  Verdict: ${ccpScore.verdict}`);
console.log(`  Reasoning: ${ccpScore.reasoning}`);

// Test Creator DNA extraction
const creatorInput = {
  trustSignals: ['consistent posting', 'responds to comments', 'shows real results'],
  audienceAlignment: 85,
  contentStyle: 'authentic testimonial',
  engagementQuality: 'high comment depth',
  niche: 'fashion/lifestyle',
  followerCount: 125000,
  avgEngagement: 4.2
};

const creatorDNA = extractCreatorDNA(creatorInput);
console.log('\n🧬 Creator DNA Extraction:');
console.log('─'.repeat(40));
console.log(`  Trust Score: ${creatorDNA.trustScore}/100`);
console.log(`  Trust Transferable: ${creatorDNA.trustTransferable ? 'YES' : 'NO'}`);
console.log(`  Reason: ${creatorDNA.transferabilityReason}`);
console.log(`  Ideal Collab Format: ${creatorDNA.idealCollabFormat}`);

// Test Comment Intelligence (single comment analysis)
const sampleComment = 'Price seems too good to be true for pure silk';
const sampleClassification = {
  category: 'objection',
  sentiment: 'negative',
  emotionalTriggers: ['skepticism', 'distrust']
};
const commentIntel = analyzeCommentDeep(sampleComment, sampleClassification);
console.log('\n💬 Deep Comment Intelligence:');
console.log('─'.repeat(40));
console.log(`  Comment: "${sampleComment}"`);
console.log(`  Has Purchase Intent: ${commentIntel.hasPurchaseIntent ? 'YES' : 'NO'}`);
console.log(`  Objection Type: ${commentIntel.objectionType || 'None'}`);
console.log(`  Objection Severity: ${commentIntel.objectionSeverity}/10`);
console.log(`  Trust Signal: ${commentIntel.trustSignal || 'None'}`);
console.log(`  Competitive Mention: ${commentIntel.competitiveMention || 'None'}`);
console.log(`  Commercial Value: ${commentIntel.commercialValue}`);

// Test Trend Timing
const trendInput = {
  firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
  peakDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),  // 2 days ago
  currentEngagement: 15000,
  peakEngagement: 25000,
  searchVolumeTrend: 'declining',
  copycatCount: 12
};

const brandContext = {
  productionSpeed: 'medium',
  brandVoice: 'premium',
  targetAge: '25-40'
};

const trendTiming = analyzeTrendTiming(trendInput, brandContext);
console.log('\n⏱️ Trend Timing Analysis:');
console.log('─'.repeat(40));
console.log(`  Current Phase: ${trendTiming.phase}`);
console.log(`  Days Remaining: ${trendTiming.daysRemaining}`);
console.log(`  Action: ${trendTiming.action}`);
console.log(`  Risk Level: ${trendTiming.riskLevel}`);

// Test Adaptation Pipeline
const adaptationInput = {
  hookWorksIn3Seconds: true,
  trustRequiresCreator: false,
  requiresDemonstration: false,
  emotionalArcLength: 25,
  addressesObjections: true,
  hasVisualProofMoment: true
};

const adaptations = determineAdaptations(adaptationInput);
console.log('\n🔄 Adaptation Pipeline:');
console.log('─'.repeat(40));
console.log(`  Primary Format: ${adaptations.primaryFormat}`);
console.log(`  All Formats: ${adaptations.formats.join(', ')}`);
console.log(`  Notes: ${adaptations.adaptationNotes}`);

// ============================================================================
// 3. GENERATE HTML REPORT
// ============================================================================
console.log('\n\n📄 Generating Strategic Intelligence HTML Report...');
console.log('─'.repeat(60));

const html = generateStrategicIntelligenceHTML(strategicReport, 'Pratapsons Heritage');
const filename = `strategic-intelligence-report-${Date.now()}.html`;
writeFileSync(filename, html);
console.log(`✅ Report saved to: ${filename}`);

// Open the report
import { exec } from 'child_process';
exec(`open ${filename}`);

console.log('\n═'.repeat(60));
console.log('🎉 All Intelligence Agents tested successfully!');
console.log('═'.repeat(60));
