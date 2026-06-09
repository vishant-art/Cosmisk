/**
 * Test script for Self-Improving Cognition System
 *
 * Tests prediction tracking, outcome recording, and learning reports
 */

import { createSelfImprovingCognitionEngine } from '../dist/services/strategic-cognition/self-improving-cognition.js';

async function testSelfImprovingCognition() {
  console.log('='.repeat(70));
  console.log('SELF-IMPROVING COGNITION TEST');
  console.log('='.repeat(70));
  console.log();

  const engine = createSelfImprovingCognitionEngine('pratapsons');

  // ========================================
  // Record some predictions
  // ========================================
  console.log('Recording predictions...');
  console.log();

  const pred1 = engine.recordPrediction(
    'Tier-2 expansion will yield 2x ROAS vs metros',
    2.0,
    0.75,
    'geographic'
  );
  console.log(`Prediction 1 recorded: ${pred1}`);

  const pred2 = engine.recordPrediction(
    'New UGC creative will outperform studio by 30%',
    0.30,
    0.60,
    'creative'
  );
  console.log(`Prediction 2 recorded: ${pred2}`);

  const pred3 = engine.recordPrediction(
    'Frequency cap will reduce CPA by 15%',
    0.15,
    0.70,
    'audience'
  );
  console.log(`Prediction 3 recorded: ${pred3}`);

  const pred4 = engine.recordPrediction(
    'Competitor will increase spend in Q3',
    'increase',
    0.50,
    'competitive'
  );
  console.log(`Prediction 4 recorded: ${pred4}`);

  const pred5 = engine.recordPrediction(
    'Diwali will drive 40% revenue lift',
    0.40,
    0.85,
    'timing'
  );
  console.log(`Prediction 5 recorded: ${pred5}`);

  console.log();

  // ========================================
  // Record outcomes
  // ========================================
  console.log('Recording outcomes...');
  console.log();

  // Prediction 1: Partially correct (1.6x instead of 2x)
  const outcome1 = engine.recordOutcome(pred1, 1.6);
  console.log(`Outcome 1: ${outcome1?.accuracy} (predicted 2.0, actual 1.6)`);
  if (outcome1?.errorAnalysis) {
    console.log(`  Error type: ${outcome1.errorAnalysis.errorType}`);
    console.log(`  Root cause: ${outcome1.errorAnalysis.rootCause}`);
    console.log(`  Lesson: ${outcome1.lessonLearned}`);
  }
  console.log();

  // Prediction 2: Correct (35% outperformance)
  const outcome2 = engine.recordOutcome(pred2, 0.35);
  console.log(`Outcome 2: ${outcome2?.accuracy} (predicted 0.30, actual 0.35)`);
  console.log(`  Lesson: ${outcome2?.lessonLearned}`);
  console.log();

  // Prediction 3: Wrong (CPA actually increased 5%)
  const outcome3 = engine.recordOutcome(pred3, -0.05);
  console.log(`Outcome 3: ${outcome3?.accuracy} (predicted 0.15 reduction, actual 0.05 increase)`);
  if (outcome3?.errorAnalysis) {
    console.log(`  Error type: ${outcome3.errorAnalysis.errorType}`);
    console.log(`  Missing factors: ${outcome3.errorAnalysis.missingFactors.join(', ')}`);
    console.log(`  Lesson: ${outcome3.lessonLearned}`);
  }
  console.log();

  // Prediction 4: Correct
  const outcome4 = engine.recordOutcome(pred4, 'increase');
  console.log(`Outcome 4: ${outcome4?.accuracy} (predicted "increase", actual "increase")`);
  console.log();

  // Prediction 5: Partially correct (32% instead of 40%)
  const outcome5 = engine.recordOutcome(pred5, 0.32);
  console.log(`Outcome 5: ${outcome5?.accuracy} (predicted 0.40, actual 0.32)`);
  if (outcome5?.errorAnalysis) {
    console.log(`  Lesson: ${outcome5.lessonLearned}`);
  }
  console.log();

  // ========================================
  // Track an investigation
  // ========================================
  console.log('─'.repeat(70));
  console.log('INVESTIGATION TRACKING');
  console.log('─'.repeat(70));
  console.log();

  const invId = engine.startInvestigation('OOS Detection Audit', 'general');
  console.log(`Investigation started: ${invId}`);

  // Simulate some time passing...
  await new Promise(resolve => setTimeout(resolve, 100));

  const invOutcome = engine.completeInvestigation(
    invId,
    420000,  // ₹4.2L discovered
    ['Identified 23 OOS products', 'Paused affected campaigns', 'Set up monitoring'],
    'Found significant waste in fashion category'
  );

  console.log(`Investigation completed:`);
  console.log(`  Time spent: ${invOutcome?.timeSpentMinutes || 0} minutes`);
  console.log(`  Leverage discovered: ₹${(invOutcome?.leverageDiscovered || 0) / 100000}L`);
  console.log(`  ROI: ₹${invOutcome?.roi?.toFixed(0) || 0} per minute`);
  console.log(`  Was valuable: ${invOutcome?.wasValueable}`);
  console.log(`  Should repeat: ${invOutcome?.shouldRepeat}`);
  console.log();

  // ========================================
  // Record feedback
  // ========================================
  console.log('─'.repeat(70));
  console.log('FEEDBACK PROCESSING');
  console.log('─'.repeat(70));
  console.log();

  const feedback1 = engine.recordFeedback(
    'correction',
    'Should have considered shipping costs in Tier-2 projection',
    pred1
  );
  console.log(`Feedback recorded: ${feedback1}`);

  const feedback2 = engine.recordFeedback(
    'positive',
    'Great catch on the OOS products - this is exactly what we need'
  );
  console.log(`Feedback recorded: ${feedback2}`);
  console.log();

  // ========================================
  // Generate learning report
  // ========================================
  console.log('─'.repeat(70));
  console.log('LEARNING REPORT (Last 30 Days)');
  console.log('─'.repeat(70));
  console.log();

  const report = engine.generateLearningReport(30);

  console.log(`HEADLINE: ${report.summary.headline}`);
  console.log();
  console.log(`Predictions tracked: ${report.summary.predictionsTracked}`);
  console.log(`Predictions resolved: ${report.summary.predictionsResolved}`);
  console.log(`Accuracy rate: ${(report.summary.accuracyThisPeriod * 100).toFixed(0)}%`);
  console.log(`Calibration score: ${(report.summary.calibrationThisPeriod * 100).toFixed(0)}%`);
  console.log();

  if (report.summary.topLessons.length > 0) {
    console.log('TOP LESSONS:');
    report.summary.topLessons.forEach((lesson, i) => {
      console.log(`  ${i + 1}. ${lesson}`);
    });
    console.log();
  }

  if (report.summary.areasOfImprovement.length > 0) {
    console.log('AREAS IMPROVING:');
    report.summary.areasOfImprovement.forEach(area => {
      console.log(`  - ${area}`);
    });
    console.log();
  }

  if (report.summary.areasNeedingWork.length > 0) {
    console.log('AREAS NEEDING WORK:');
    report.summary.areasNeedingWork.forEach(area => {
      console.log(`  - ${area}`);
    });
    console.log();
  }

  // Pattern insights
  console.log('─'.repeat(70));
  console.log('PATTERN INSIGHTS');
  console.log('─'.repeat(70));
  console.log();

  report.patternInsights.forEach(insight => {
    const trend = insight.trend === 'improving' ? '↑' : insight.trend === 'declining' ? '↓' : '→';
    console.log(`${trend} ${insight.pattern}: ${(insight.successRate * 100).toFixed(0)}% success`);
    console.log(`   ${insight.insight}`);
    console.log(`   → ${insight.recommendation}`);
    console.log();
  });

  // Calibration analysis
  console.log('─'.repeat(70));
  console.log('CALIBRATION ANALYSIS');
  console.log('─'.repeat(70));
  console.log();

  console.log(`Overall calibration: ${(report.calibrationAnalysis.overallCalibration * 100).toFixed(0)}%`);
  if (report.calibrationAnalysis.overconfidentBuckets.length > 0) {
    console.log(`Overconfident in: ${report.calibrationAnalysis.overconfidentBuckets.join(', ')}`);
  }
  if (report.calibrationAnalysis.underconfidentBuckets.length > 0) {
    console.log(`Underconfident in: ${report.calibrationAnalysis.underconfidentBuckets.join(', ')}`);
  }
  console.log(`Suggestion: ${report.calibrationAnalysis.suggestion}`);
  console.log();

  // Recommendations
  console.log('─'.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('─'.repeat(70));
  console.log();

  report.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.area}`);
    console.log(`   ${rec.recommendation}`);
    console.log(`   Expected impact: ${rec.expectedImpact}`);
    console.log();
  });

  // System metrics
  console.log('─'.repeat(70));
  console.log('SYSTEM METRICS');
  console.log('─'.repeat(70));
  console.log();

  const state = engine.getState();
  console.log(`Total predictions: ${state.systemMetrics.totalPredictions}`);
  console.log(`Completed: ${state.systemMetrics.completedPredictions}`);
  console.log(`Accuracy rate: ${(state.systemMetrics.accuracyRate * 100).toFixed(0)}%`);
  console.log(`Avg confidence when correct: ${(state.systemMetrics.averageConfidenceWhenCorrect * 100).toFixed(0)}%`);
  console.log(`Avg confidence when wrong: ${(state.systemMetrics.averageConfidenceWhenWrong * 100).toFixed(0)}%`);
  console.log(`Total value discovered: ₹${(state.systemMetrics.totalValueDiscovered / 100000).toFixed(1)}L`);
  console.log();
  console.log(`Top performing patterns: ${state.systemMetrics.topPerformingPatterns.join(', ')}`);
  console.log(`Underperforming patterns: ${state.systemMetrics.underperformingPatterns.join(', ')}`);
  console.log();

  console.log('='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

testSelfImprovingCognition();
