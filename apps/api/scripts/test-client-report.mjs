#!/usr/bin/env node
/**
 * Test: Full Client Report Generation
 *
 * This demonstrates what CLIENTS actually see:
 * 1. Cognitive systems do the thinking (internal)
 * 2. Report generator transforms into actionable format (external)
 * 3. Output as HTML email or WhatsApp message
 */

import { investigateRootCause } from '../dist/services/strategic-cognition/recursive-investigator.js';
import { evaluateCompetingHypotheses } from '../dist/services/strategic-cognition/competing-hypotheses.js';
import { analyzeCausality } from '../dist/services/strategic-cognition/causal-intelligence.js';
import { runCuriosityScan } from '../dist/services/strategic-cognition/strategic-curiosity.js';
import { generateClientReport, reportToWhatsApp, reportToHTML } from '../dist/services/strategic-cognition/client-report-generator.js';
import { writeFileSync } from 'fs';

async function main() {
  console.log('='.repeat(80));
  console.log('CLIENT REPORT GENERATION - END-TO-END DEMO');
  console.log('='.repeat(80));
  console.log();
  console.log('This shows what CLIENTS actually receive, not internal analysis.');
  console.log();

  const clientName = 'Pratapsons Fashion';
  const clientId = 'pratapsons-001';
  const monthlySpend = 3000000; // ₹30L/month

  // Step 1: Run cognitive systems (internal - clients don't see this)
  console.log('STEP 1: Running cognitive systems (internal processing)...');
  console.log('-'.repeat(60));

  console.log('  → Investigating root cause...');
  const investigation = await investigateRootCause(
    'ROAS dropped from 3.2x to 2.1x over 3 weeks',
    clientId,
    monthlySpend
  );
  console.log(`     ✓ Investigation complete (${investigation.totalDepth} layers deep)`);

  console.log('  → Evaluating competing hypotheses...');
  const hypotheses = await evaluateCompetingHypotheses(
    'ROAS dropped from 3.2x to 2.1x over 3 weeks',
    clientId,
    monthlySpend
  );
  console.log(`     ✓ Hypotheses evaluated (${hypotheses.hypotheses.length} competing explanations)`);

  console.log('  → Analyzing causal relationships...');
  const causalAnalysis = await analyzeCausality(
    'Frequency increasing, CTR declining - checking for fatigue loops',
    clientId,
    monthlySpend
  );
  console.log(`     ✓ Causal model built (${causalAnalysis.model.nodes.length} nodes, ${causalAnalysis.model.feedbackLoops.length} loops)`);

  console.log('  → Running curiosity scan...');
  const curiosityScan = await runCuriosityScan(clientId, monthlySpend);
  console.log(`     ✓ Scan complete (${curiosityScan.anomaliesFound.length} anomalies, ${curiosityScan.topDiscoveries.length} discoveries)`);

  console.log();

  // Step 2: Generate client report
  console.log('STEP 2: Generating client report...');
  console.log('-'.repeat(60));

  const report = generateClientReport(clientName, {
    investigation,
    hypotheses,
    causalAnalysis,
    curiosityScan,
  }, 'weekly_briefing');

  console.log(`  Report type: ${report.reportType}`);
  console.log(`  Sections: ${report.sections.length}`);
  console.log(`  Action items: ${report.actionItems.length}`);
  console.log(`  Confidence: ${report.confidence}`);
  console.log();

  // Step 3: Show WhatsApp format (what client sees on phone)
  console.log('='.repeat(80));
  console.log('WHAT CLIENT SEES ON WHATSAPP:');
  console.log('='.repeat(80));
  console.log();
  const whatsappMessage = reportToWhatsApp(report);
  console.log(whatsappMessage);
  console.log();

  // Step 4: Generate HTML report
  console.log('='.repeat(80));
  console.log('HTML REPORT (saved to file):');
  console.log('='.repeat(80));
  console.log();
  const htmlReport = reportToHTML(report);
  const htmlPath = `./client-report-${clientId}-${Date.now()}.html`;
  writeFileSync(htmlPath, htmlReport);
  console.log(`  ✓ HTML report saved to: ${htmlPath}`);
  console.log('  Open this file in browser to see the branded report.');
  console.log();

  // Step 5: Show executive summary
  console.log('='.repeat(80));
  console.log('EXECUTIVE SUMMARY (what founder reads first):');
  console.log('='.repeat(80));
  console.log();
  console.log(`📌 HEADLINE: ${report.executiveSummary.headline}`);
  console.log();
  console.log('KEY FINDINGS:');
  report.executiveSummary.keyFindings.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });
  console.log();
  if (report.executiveSummary.urgentActions.length > 0) {
    console.log('⚡ URGENT ACTIONS:');
    report.executiveSummary.urgentActions.forEach(a => {
      console.log(`  → ${a}`);
    });
    console.log();
  }
  console.log(`💡 BOTTOM LINE: ${report.executiveSummary.bottomLine}`);
  console.log();

  // Step 6: Show action items
  console.log('='.repeat(80));
  console.log('ACTION ITEMS (prioritized):');
  console.log('='.repeat(80));
  console.log();
  report.actionItems.forEach((item, i) => {
    const emoji = item.priority === 'immediate' ? '🔴' : item.priority === 'this_week' ? '🟡' : '🟢';
    console.log(`${emoji} [${item.priority.toUpperCase()}] ${item.action}`);
    console.log(`   Why: ${item.why}`);
    console.log(`   Expected: ${item.expectedOutcome}`);
    console.log();
  });

  // Step 7: Show caveats
  if (report.caveats.length > 0) {
    console.log('='.repeat(80));
    console.log('IMPORTANT NOTES (honesty about uncertainty):');
    console.log('='.repeat(80));
    console.log();
    report.caveats.forEach(c => {
      console.log(`  ⚠️  ${c}`);
    });
    console.log();
  }

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY: WHAT CLIENTS GET');
  console.log('='.repeat(80));
  console.log();
  console.log('1. WHATSAPP ALERT: Immediate notification with key findings');
  console.log('   → Sent when urgent issues detected');
  console.log('   → Founder can reply "details" for full report');
  console.log();
  console.log('2. HTML REPORT: Branded email with full analysis');
  console.log('   → Executive summary at top');
  console.log('   → Detailed sections with metrics');
  console.log('   → Prioritized action items');
  console.log('   → Confidence level and caveats');
  console.log();
  console.log('3. WEEKLY BRIEFING: Aggregated summary');
  console.log('   → All findings from the week');
  console.log('   → Progress on previous action items');
  console.log('   → Upcoming concerns to watch');
  console.log();
  console.log('The cognitive systems (investigation, hypotheses, causal analysis,');
  console.log('curiosity scan) run INTERNALLY. Clients never see percentages,');
  console.log('Bayesian updates, or causal graphs. They see actionable reports.');
  console.log();
}

main().catch(console.error);
