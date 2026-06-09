/**
 * Test Script - Elite Intelligence System
 *
 * Demonstrates the multi-signal strategic intelligence system
 * with THE ONE THING prioritization.
 */

import {
  generateEliteIntelligence,
  generateQuickSummary,
  generateFormattedReport,
  generateHTMLReport,
} from '../dist/services/elite-intelligence/index.js';
import { writeFileSync } from 'fs';

// Sample data simulating a brand with trust issues and declining performance
const sampleInput = {
  clientId: 'demo-client',
  accountId: 'act_123456789',

  meta: {
    campaigns: [
      { id: 'camp_1', name: 'ASC - Bestsellers', spend: 150000, roas: 2.8, cpa: 1200, trend: 'declining', issues: ['High frequency', 'CTR dropping'] },
      { id: 'camp_2', name: 'Retargeting - Cart', spend: 45000, roas: 4.2, cpa: 650, trend: 'stable', issues: [] },
      { id: 'camp_3', name: 'Lookalike - 1%', spend: 80000, roas: 1.9, cpa: 1800, trend: 'declining', issues: ['Poor click-to-ATC'] },
    ],
    creatives: [
      { id: 'cr_1', name: 'UGC Review Compilation', spend: 75000, ctr: 2.1, clickToATC: 4.8, fatigueScore: 25, format: 'video', status: 'ACTIVE' },
      { id: 'cr_2', name: 'Product Demo Static', spend: 50000, ctr: 1.8, clickToATC: 0.9, fatigueScore: 45, format: 'image', status: 'ACTIVE' },
      { id: 'cr_3', name: 'Founder Story', spend: 40000, ctr: 2.5, clickToATC: 3.2, fatigueScore: 60, format: 'video', status: 'ACTIVE' },
      { id: 'cr_4', name: 'Lifestyle Carousel', spend: 35000, ctr: 1.2, clickToATC: 0.5, fatigueScore: 30, format: 'carousel', status: 'ACTIVE' },
    ],
    insights: {
      ctr: 1.8,
      cpc: 12.5,
      cpm: 225,
      roas: 2.5,
      cpa: 1100,
      impressions: 2500000,
      clicks: 45000,
      addToCart: 1200,
      purchases: 250,
      reach: 800000,
      frequency: 3.1,
      videoThruplay: 0.35,
      avgWatchTime: 8.5,
    },
    previousInsights: {
      ctr: 2.1,
      cpc: 10.5,
      cpm: 200,
      roas: 3.2,
      cpa: 850,
      frequency: 2.4,
      clickToATC: 3.5,
      avgWatchTime: 10.2,
    },
  },

  shopify: {
    analytics: {
      conversionRate: 2.1,
      cartAbandonRate: 78,
      returnsRate: 12,
      codRTORate: 28,
    },
    previousAnalytics: {
      conversionRate: 2.8,
      cartAbandonRate: 72,
      codRate: 55,
      aov: 2800,
      repeatRate: 18,
    },
    products: [
      { id: 'prod_1', title: 'Classic Cotton Kurta', salesVelocity: 45, trend: 'increasing', daysToOOS: 8, adSpend: 35000 },
      { id: 'prod_2', title: 'Silk Blend Saree', salesVelocity: 28, trend: 'stable', daysToOOS: 21, adSpend: 25000 },
      { id: 'prod_3', title: 'Embroidered Dupatta', salesVelocity: 12, trend: 'declining', daysToOOS: null, adSpend: 15000 },
    ],
    orders: [
      { total: 3200, paymentMethod: 'COD' },
      { total: 2800, paymentMethod: 'COD' },
      { total: 4500, paymentMethod: 'Prepaid' },
      { total: 2100, paymentMethod: 'COD' },
      { total: 3800, paymentMethod: 'Prepaid' },
      { total: 2900, paymentMethod: 'COD' },
      { total: 5200, paymentMethod: 'Prepaid' },
      { total: 2400, paymentMethod: 'COD' },
      { total: 3100, paymentMethod: 'COD' },
      { total: 4100, paymentMethod: 'Prepaid' },
    ],
    customers: [
      { ordersCount: 1 },
      { ordersCount: 1 },
      { ordersCount: 2 },
      { ordersCount: 1 },
      { ordersCount: 3 },
      { ordersCount: 1 },
      { ordersCount: 1 },
      { ordersCount: 2 },
    ],
  },

  comments: [
    { text: 'Is this brand legit? First time seeing their ads', category: 'inquiry', sentiment: 'neutral', emotionalTriggers: ['curiosity', 'skepticism'] },
    { text: 'Price seems too high for this quality', category: 'price_objection', sentiment: 'negative', emotionalTriggers: ['frustration'] },
    { text: 'Ordered last week, amazing quality! ❤️', category: 'positive_review', sentiment: 'positive', emotionalTriggers: ['satisfaction', 'trust'] },
    { text: 'Anyone received their order? How long did it take?', category: 'inquiry', sentiment: 'neutral', emotionalTriggers: ['anxiety', 'skepticism'] },
    { text: 'Looks beautiful! Where can I buy?', category: 'buying_intent', sentiment: 'positive', emotionalTriggers: ['desire', 'curiosity'] },
    { text: 'Is this real silk or fake? Too many scams these days', category: 'complaint', sentiment: 'negative', emotionalTriggers: ['skepticism', 'fear'] },
    { text: 'Bought 2 pieces, both amazing quality', category: 'positive_review', sentiment: 'positive', emotionalTriggers: ['satisfaction'] },
    { text: 'Shipping cost is ridiculous', category: 'complaint', sentiment: 'negative', emotionalTriggers: ['frustration', 'anger'] },
    { text: 'Better than XYZ brand for sure', category: 'comparison', sentiment: 'positive', emotionalTriggers: ['confidence'] },
    { text: 'Will the colors fade after wash?', category: 'objection', sentiment: 'neutral', emotionalTriggers: ['concern'] },
    { text: 'Scam alert! My friend ordered and never received', category: 'complaint', sentiment: 'negative', emotionalTriggers: ['anger', 'distrust'] },
    { text: 'Just ordered! Excited to receive 🎉', category: 'buying_intent', sentiment: 'positive', emotionalTriggers: ['excitement'] },
    { text: 'Do you have COD option?', category: 'inquiry', sentiment: 'neutral', emotionalTriggers: ['caution'] },
    { text: 'Why no return policy mentioned?', category: 'objection', sentiment: 'negative', emotionalTriggers: ['suspicion'] },
    { text: 'Is this the same brand that was on Shark Tank?', category: 'inquiry', sentiment: 'neutral', emotionalTriggers: ['curiosity'] },
  ],

  funnel: {
    adToSite: 75,
    siteToProduct: 55,
    productToCart: 12,
    cartToCheckout: 45,
    checkoutToPurchase: 65,
    sessionDuration: 95,
    pagesPerSession: 2.8,
    bounceRate: 48,
    scrollDepth: 55,
    reviewReadRate: 25,
    sizeGuideUsage: 8,
  },
};

async function runTest() {
  console.log('═'.repeat(60));
  console.log('ELITE INTELLIGENCE SYSTEM - TEST RUN');
  console.log('═'.repeat(60));
  console.log('');

  console.log('📊 Input Data Summary:');
  console.log(`   Client: ${sampleInput.clientId}`);
  console.log(`   Campaigns: ${sampleInput.meta.campaigns.length}`);
  console.log(`   Creatives: ${sampleInput.meta.creatives.length}`);
  console.log(`   Comments: ${sampleInput.comments.length}`);
  console.log(`   Products: ${sampleInput.shopify.products.length}`);
  console.log('');

  console.log('🔄 Generating Elite Intelligence...');
  console.log('');

  const startTime = Date.now();
  const output = await generateEliteIntelligence(sampleInput);
  const duration = Date.now() - startTime;

  console.log(`✅ Generated in ${duration}ms`);
  console.log('');

  // Quick Summary (for WhatsApp/Slack alerts)
  console.log('─'.repeat(60));
  console.log('QUICK SUMMARY (for alerts):');
  console.log('─'.repeat(60));
  console.log(generateQuickSummary(output));
  console.log('');

  // Full Formatted Report
  console.log('─'.repeat(60));
  console.log('FULL FORMATTED REPORT:');
  console.log('─'.repeat(60));
  console.log(generateFormattedReport(output));
  console.log('');

  // Raw JSON structure (for debugging)
  console.log('─'.repeat(60));
  console.log('KEY DATA STRUCTURES:');
  console.log('─'.repeat(60));

  console.log('\n🎯 THE ONE THING:');
  console.log(JSON.stringify(output.theOneThing, null, 2));

  console.log('\n🧠 AUDIENCE PSYCHOLOGY:');
  console.log(JSON.stringify({
    trustState: output.audiencePsychology.trustState,
    purchaseState: output.audiencePsychology.purchaseState.dominant,
    blockers: output.audiencePsychology.purchaseState.blockers.slice(0, 2),
  }, null, 2));

  console.log('\n📈 TOP PREDICTIONS:');
  console.log(JSON.stringify(output.predictions.forecasts.slice(0, 2), null, 2));

  console.log('\n🔗 CAUSAL CHAINS:');
  console.log(JSON.stringify(output.systemicAnalysis.criticalConnections.slice(0, 2), null, 2));

  console.log('\n⚠️ CONTRADICTIONS:');
  console.log(JSON.stringify(output.confidenceReport.contradictions, null, 2));

  console.log('\n📊 CONFIDENCE REPORT:');
  console.log(JSON.stringify({
    overallConfidence: output.confidenceReport.overallConfidence,
    verifiedInsights: output.confidenceReport.verifiedInsights,
    uncertainties: output.confidenceReport.uncertainties,
  }, null, 2));

  // Generate HTML Report
  const htmlReport = generateHTMLReport(output);
  const htmlPath = `elite-intelligence-report-${Date.now()}.html`;
  writeFileSync(htmlPath, htmlReport);
  console.log('');
  console.log(`📄 HTML Report saved to: ${htmlPath}`);

  console.log('');
  console.log('═'.repeat(60));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(60));
}

runTest().catch(console.error);
