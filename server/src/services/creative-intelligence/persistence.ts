// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

import { getDbAdapter } from '../../db/adapter.js';
import type { CrossAgentCreativeContext, QualityValidation } from './types.js';

export async function saveCreativeContext(context: CrossAgentCreativeContext): Promise<void> {
  await getDbAdapter().run(`
    INSERT INTO creative_intelligence_context (
      client_id, last_updated, fatigue_signals, ltv_signals, cohort_signals,
      competitor_signals, audience_signals, retention_signals, emotional_signals,
      pricing_signals, product_signals, performance_signals, synthesis_output,
      next_creative_recommendation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      last_updated = excluded.last_updated,
      fatigue_signals = excluded.fatigue_signals,
      ltv_signals = excluded.ltv_signals,
      cohort_signals = excluded.cohort_signals,
      competitor_signals = excluded.competitor_signals,
      audience_signals = excluded.audience_signals,
      retention_signals = excluded.retention_signals,
      emotional_signals = excluded.emotional_signals,
      pricing_signals = excluded.pricing_signals,
      product_signals = excluded.product_signals,
      performance_signals = excluded.performance_signals,
      synthesis_output = excluded.synthesis_output,
      next_creative_recommendation = excluded.next_creative_recommendation
  `, [
    context.clientId,
    context.lastUpdated,
    JSON.stringify(context.fatigueSignals),
    JSON.stringify(context.ltvSignals),
    JSON.stringify(context.cohortSignals),
    JSON.stringify(context.competitorSignals),
    JSON.stringify(context.audienceSignals),
    JSON.stringify(context.retentionSignals),
    JSON.stringify(context.emotionalSignals),
    JSON.stringify(context.pricingSignals),
    JSON.stringify(context.productSignals),
    JSON.stringify(context.performanceSignals),
    JSON.stringify(context.synthesisOutput),
    context.synthesisOutput.nextCreativeRecommendation,
  ]);
}

export async function saveQualityScore(validation: QualityValidation): Promise<void> {
  const id = `quality_${validation.creativeId}_${Date.now()}`;
  await getDbAdapter().run(`
    INSERT INTO creative_quality_scores (
      id, client_id, creative_id, scored_at, sophistication_score, typography_score,
      emotional_impact_score, brand_consistency_score, ai_artifact_score,
      layout_intelligence_score, competitor_benchmark_score, overall_quality_score,
      auto_rejected, rejection_reasons, benchmark_creative_ids, human_override, human_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    '',  // Would need client context
    validation.creativeId,
    validation.validatedAt,
    validation.sophisticationScore,
    validation.typographyScore,
    validation.emotionalImpactScore,
    validation.brandConsistencyScore,
    validation.aiArtifactScore,
    validation.layoutIntelligenceScore,
    validation.competitorBenchmarkScore,
    validation.overallQualityScore,
    validation.autoRejected ? 1 : 0,
    JSON.stringify(validation.rejectionReasons),
    JSON.stringify(validation.comparedToBrands),
    0,
    null,
  ]);
}
