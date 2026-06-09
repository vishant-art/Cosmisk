/**
 * Comment Mining Agent — "What To Create Next" recommendation engine.
 */

import type {
  CommentCategory,
  CommentPattern,
  CreativeConceptFromComments,
  WhatToCreateNext,
} from './types.js';

/**
 * Generate prioritized "What To Create Next" recommendations
 * This is the strategic layer that tells the brand WHAT ads to make
 */
export function generateWhatToCreateNext(
  patterns: CommentPattern[],
  categoryCount: Record<CommentCategory, number>,
  concepts: CreativeConceptFromComments[]
): WhatToCreateNext[] {
  const recommendations: WhatToCreateNext[] = [];
  const totalComments = Object.values(categoryCount).reduce((a, b) => a + b, 0);

  // 1. Check for high-frequency objections (URGENT)
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

  // 2. Check for frustration spike (REPUTATION RISK)
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

  // 3. Leverage high praise for social proof
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

  // 4. Desire amplification opportunity
  if (categoryCount.desire >= 5) {
    const topDesire = patterns.find(p => p.category === 'desire');
    if (topDesire) {
      recommendations.push({
        priority: recommendations.length + 1,
        conceptType: 'desire_amplifier',
        reason: `${categoryCount.desire} desire comments — customers want this, help them commit`,
        dataPoints: categoryCount.desire,
        estimatedROI: 'medium',
        suggestedFormats: ['video_hook', 'story_ad'],
        deadline: 'Next sprint'
      });
    }
  }

  // 5. Scenario expansion for use cases
  if (categoryCount.use_case >= 3) {
    const occasions = patterns
      .filter(p => p.category === 'use_case')
      .slice(0, 2)
      .map(p => p.pattern)
      .join(', ');

    recommendations.push({
      priority: recommendations.length + 1,
      conceptType: 'scenario',
      reason: `Customers mentioning: ${occasions} — expand targeting to these occasions`,
      dataPoints: categoryCount.use_case,
      estimatedROI: 'medium',
      suggestedFormats: ['carousel', 'ugc_script'],
      deadline: 'Next sprint'
    });
  }

  // 6. Competitive differentiation
  if (categoryCount.comparison >= 2) {
    const competitors = patterns
      .filter(p => p.category === 'comparison')
      .slice(0, 2);

    recommendations.push({
      priority: recommendations.length + 1,
      conceptType: 'differentiation',
      reason: `Customers comparing to competitors — capitalize on switches`,
      dataPoints: categoryCount.comparison,
      estimatedROI: 'medium',
      suggestedFormats: ['carousel', 'static_image'],
      deadline: 'Next sprint'
    });
  }

  // 7. Community/belonging angle if high engagement
  const praiseRate = (categoryCount.praise / totalComments) * 100;
  if (praiseRate > 20 && categoryCount.praise >= 10) {
    recommendations.push({
      priority: recommendations.length + 1,
      conceptType: 'community',
      reason: `${Math.round(praiseRate)}% positive sentiment — build community angle`,
      dataPoints: categoryCount.praise,
      estimatedROI: 'medium',
      suggestedFormats: ['video_hook', 'carousel'],
      deadline: 'Next month'
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  // Renumber priorities to be sequential
  recommendations.forEach((r, i) => {
    r.priority = i + 1;
  });

  return recommendations.slice(0, 8); // Max 8 recommendations
}
