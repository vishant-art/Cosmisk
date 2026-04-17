#!/usr/bin/env npx tsx
/**
 * CLI Runner for Adaptive Audit System
 *
 * Usage:
 *   npx tsx scripts/run-audit.ts --brand=casorro
 *   npx tsx scripts/run-audit.ts --account=act_1221854506209666
 *   npx tsx scripts/run-audit.ts --brand=casorro --days=7
 *   npx tsx scripts/run-audit.ts --brand=casorro --format=json
 */

import { config } from 'dotenv';
import { runAudit } from '../src/audit/index.js';

config();

async function main() {
  const args = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ADAPTIVE AUDIT SYSTEM - Phase 1                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Determine brand ID
  let brandId = args.brand || args.account;

  if (!brandId) {
    console.error('\n❌ Error: Please provide --brand=<name> or --account=<act_id>');
    console.log('\nExamples:');
    console.log('  npx tsx scripts/run-audit.ts --brand=casorro');
    console.log('  npx tsx scripts/run-audit.ts --account=act_1221854506209666');
    console.log('  npx tsx scripts/run-audit.ts --brand=casorro --days=7');
    console.log('  npx tsx scripts/run-audit.ts --brand=casorro --format=json');
    process.exit(1);
  }

  // Map brand names to account IDs (temporary until DB is set up)
  const brandMap: Record<string, string> = {
    'casorro': 'act_1221854506209666',
    'pratap-sons': 'act_1738503939658460',
    'salt-attire': 'act_26408351442104125',
  };

  // If brand name provided, map to account ID
  if (!brandId.startsWith('act_')) {
    const accountId = brandMap[brandId.toLowerCase()];
    if (accountId) {
      brandId = accountId;
      console.log(`\n📍 Mapped brand "${args.brand}" to account ${accountId}`);
    } else {
      console.error(`\n❌ Unknown brand: ${brandId}`);
      console.log('   Known brands:', Object.keys(brandMap).join(', '));
      process.exit(1);
    }
  }

  // Determine date preset
  let datePreset: 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'maximum' = 'last_30d';
  if (args.days) {
    const days = parseInt(args.days);
    if (days <= 7) datePreset = 'last_7d';
    else if (days <= 14) datePreset = 'last_14d';
    else if (days <= 30) datePreset = 'last_30d';
    else if (days <= 90) datePreset = 'last_90d';
    else datePreset = 'maximum';
  }

  // Determine output format
  const format = (args.format || 'markdown') as 'markdown' | 'json' | 'both';

  try {
    const result = await runAudit({
      brandId,
      datePreset,
      outputFormat: format,
      saveToDisk: true,
      outputPath: './data/audits',
    });

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('AUDIT SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Health Score: ${result.audit.summary.healthScore}/100`);
    console.log(`Wasted Spend: ₹${result.audit.summary.wastedSpend.toLocaleString('en-IN')}`);
    console.log(`Best CPA: ₹${result.audit.summary.bestCpa.toLocaleString('en-IN')}`);
    console.log(`\nTop Findings:`);
    result.audit.summary.topFindings.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f}`);
    });
    console.log(`\n🎯 Top Priority: ${result.audit.summary.topPriority}`);

    // Print winners/losers counts
    console.log(`\n📊 Winners: ${result.audit.creativeAnalysis.winners.length}`);
    console.log(`📊 Losers: ${result.audit.creativeAnalysis.losers.length}`);
    console.log(`📊 Recommendations: ${result.audit.creativeAnalysis.recommendations.length}`);

  } catch (error) {
    console.error('\n❌ Audit failed:', error);
    process.exit(1);
  }
}

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || 'true';
    }
  }

  return args;
}

main().catch(console.error);
