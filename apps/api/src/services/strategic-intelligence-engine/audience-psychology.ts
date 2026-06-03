/**
 * Strategic Intelligence Engine — Audience Psychology Analyzer
 */

import type { AudienceState, AudiencePsychologyReport, CommentSignalInput } from './types.js';

/**
 * Analyze audience psychology from signals — not just summarize
 */
export function analyzeAudiencePsychology(
  commentSignals: CommentSignalInput[],
  categoryContext: { name: string; pricePoint: 'premium' | 'mid' | 'value' }
): AudiencePsychologyReport {

  // Calculate state indicators
  const totalComments = commentSignals.reduce((sum, s) => sum + s.frequency, 0);

  const frustrationRate = commentSignals
    .filter(s => s.category === 'frustration')
    .reduce((sum, s) => sum + s.frequency, 0) / totalComments;

  const objectionRate = commentSignals
    .filter(s => s.category === 'objection' || s.category === 'question')
    .reduce((sum, s) => sum + s.frequency, 0) / totalComments;

  const praiseRate = commentSignals
    .filter(s => s.category === 'praise')
    .reduce((sum, s) => sum + s.frequency, 0) / totalComments;

  // Detect specific psychological signals
  const trustSignals = commentSignals.filter(s =>
    s.pattern.toLowerCase().match(/fraud|fake|scam|legit|real|trust|genuine|authentic/)
  );
  const hasTrustCrisis = trustSignals.reduce((sum, s) => sum + s.frequency, 0) > totalComments * 0.05;

  const pricingSignals = commentSignals.filter(s =>
    s.pattern.toLowerCase().match(/price|expensive|cost|worth|afford|cheap/)
  );
  const hasPriceSensitivity = pricingSignals.reduce((sum, s) => sum + s.frequency, 0) > totalComments * 0.08;

  const qualitySignals = commentSignals.filter(s =>
    s.pattern.toLowerCase().match(/quality|material|fabric|last|durable/)
  );

  // Determine dominant state
  let dominantState: AudienceState;

  if (hasTrustCrisis && frustrationRate > 0.3) {
    dominantState = 'trust_contamination';
  } else if (hasTrustCrisis) {
    dominantState = 'legitimacy_skepticism';
  } else if (frustrationRate > 0.4) {
    dominantState = 'trust_erosion';
  } else if (objectionRate > 0.3 && hasPriceSensitivity) {
    dominantState = 'purchase_anxiety';
  } else if (hasPriceSensitivity) {
    dominantState = 'price_sensitivity_spike';
  } else if (praiseRate > 0.3) {
    dominantState = 'community_formation';
  } else if (objectionRate > 0.2) {
    dominantState = 'curiosity_rising';
  } else {
    dominantState = 'trust_intact';
  }

  // Detect state transitions
  const stateTransitions: AudiencePsychologyReport['stateTransitions'] = [];

  if (hasTrustCrisis && trustSignals.length > 0) {
    stateTransitions.push({
      from: 'curiosity_rising',
      to: 'legitimacy_skepticism',
      confidence: 0.8,
      evidence: trustSignals.map(s => `"${s.pattern}" mentioned ${s.frequency}x`)
    });
  }

  if (frustrationRate > 0.3 && objectionRate > 0.2) {
    stateTransitions.push({
      from: 'trust_intact',
      to: 'trust_erosion',
      confidence: 0.7,
      evidence: [`${Math.round(frustrationRate * 100)}% frustration rate`, `${Math.round(objectionRate * 100)}% objection rate`]
    });
  }

  // Build trust landscape
  let overallTrust: AudiencePsychologyReport['trustLandscape']['overallTrust'];
  if (hasTrustCrisis && frustrationRate > 0.3) {
    overallTrust = 'contaminated';
  } else if (hasTrustCrisis || frustrationRate > 0.25) {
    overallTrust = 'eroding';
  } else if (objectionRate > 0.2) {
    overallTrust = 'fragile';
  } else if (praiseRate > 0.2) {
    overallTrust = 'strong';
  } else {
    overallTrust = 'stable';
  }

  const trustThreats: string[] = [];
  const trustOpportunities: string[] = [];

  if (hasTrustCrisis) {
    trustThreats.push('Legitimacy skepticism is contaminating cold audience perception before website visit');
  }
  if (frustrationRate > 0.3) {
    trustThreats.push('Operational friction is eroding brand credibility in public comments');
  }
  if (qualitySignals.length > 0) {
    trustOpportunities.push('Quality validation content can convert skeptics into advocates');
  }
  if (praiseRate > 0.15) {
    trustOpportunities.push('Existing customer praise is under-leveraged as trust infrastructure');
  }

  // Build emotional landscape
  const dominantEmotions: string[] = [];
  const emergingEmotions: string[] = [];

  if (frustrationRate > 0.2) dominantEmotions.push('frustration');
  if (objectionRate > 0.2) dominantEmotions.push('skepticism');
  if (hasTrustCrisis) dominantEmotions.push('distrust');
  if (hasPriceSensitivity) dominantEmotions.push('price_anxiety');
  if (praiseRate > 0.15) dominantEmotions.push('satisfaction');

  if (hasTrustCrisis && categoryContext.pricePoint === 'premium') {
    emergingEmotions.push('legitimacy_verification_mode');
  }

  // Build buying friction analysis
  const primaryBlockers: string[] = [];
  const hiddenFriction: string[] = [];

  if (hasTrustCrisis) {
    primaryBlockers.push('Pre-purchase trust verification required');
    hiddenFriction.push('Cold audiences are researching brand legitimacy before even viewing products');
  }
  if (hasPriceSensitivity) {
    primaryBlockers.push('Value justification not clear');
    hiddenFriction.push('Price objections may mask deeper quality/trust concerns');
  }
  if (frustrationRate > 0.3) {
    primaryBlockers.push('Public negative sentiment affecting new buyer confidence');
    hiddenFriction.push('Operational issues becoming brand perception issues');
  }

  const frictionTrend: AudiencePsychologyReport['buyingFriction']['frictionTrend'] =
    frustrationRate > 0.3 || hasTrustCrisis ? 'increasing' :
    praiseRate > 0.2 ? 'decreasing' : 'stable';

  // Generate strategic interpretation
  let strategicInterpretation = '';

  if (dominantState === 'trust_contamination') {
    strategicInterpretation = `The audience has entered a legitimacy-verification state. Public distrust signals in comments are contaminating cold-audience perception before users even evaluate products. This is no longer a customer service issue—it is a brand trust infrastructure problem that will compound CAC and reduce conversion across all channels if not addressed systemically.`;
  } else if (dominantState === 'legitimacy_skepticism') {
    strategicInterpretation = `Rising legitimacy skepticism indicates the audience is transitioning from product evaluation to brand verification. First-time buyers are allocating cognitive resources to "is this real?" before "is this right for me?" This psychological shift requires trust-first creative systems before product-benefit messaging.`;
  } else if (dominantState === 'purchase_anxiety') {
    strategicInterpretation = `The audience demonstrates clear purchase intent blocked by specific anxieties. The desire exists—the friction is psychological, not informational. Reassurance-driven creative systems can unlock conversion that aspiration-focused content cannot reach.`;
  } else if (dominantState === 'trust_erosion') {
    strategicInterpretation = `Gradual trust erosion is occurring through accumulated small friction points. No single crisis, but consistent negative signal accumulation is shifting audience perception. Requires proactive trust-building before erosion reaches contamination threshold.`;
  } else if (dominantState === 'community_formation') {
    strategicInterpretation = `Positive audience signals indicate community formation potential. Customer advocacy is emerging organically—this represents a strategic asset that can be systematized into trust infrastructure for cold audience acquisition.`;
  } else {
    strategicInterpretation = `Audience psychology is in a stable state with manageable friction points. Standard optimization approach is viable, but monitoring for state transitions remains important.`;
  }

  return {
    dominantState,
    stateTransitions,
    trustLandscape: {
      overallTrust,
      trustThreats,
      trustOpportunities
    },
    emotionalLandscape: {
      dominantEmotions,
      emergingEmotions,
      fadingEmotions: [],
      emotionalShifts: stateTransitions.map(t => `${t.from} → ${t.to}`)
    },
    buyingFriction: {
      primaryBlockers,
      hiddenFriction,
      frictionTrend
    },
    strategicInterpretation
  };
}
