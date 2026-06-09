/**
 * Self-Improving Cognition System — Default Reasoning Patterns
 *
 * Shared module-level seed data used by the engine constructor.
 */

import { type ReasoningPattern } from './types.js';

// ============================================================================
// Default Reasoning Patterns
// ============================================================================

export const DEFAULT_REASONING_PATTERNS: Omit<ReasoningPattern, 'id'>[] = [
  {
    name: 'Geographic Expansion Analysis',
    description: 'Reasoning about expanding to new geographic markets',
    contexts: ['geographic'],
    successRate: 0.65,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Good at identifying low-competition areas'],
    weaknesses: ['Often underestimates logistics costs'],
    antiPatterns: ['Assuming metro patterns apply to Tier-2/3'],
    adjustments: [],
  },
  {
    name: 'Creative Performance Prediction',
    description: 'Predicting which creative approaches will perform best',
    contexts: ['creative'],
    successRate: 0.55,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Identifying broad creative themes'],
    weaknesses: ['Hard to predict viral potential'],
    antiPatterns: ['Assuming past winners will continue winning indefinitely'],
    adjustments: [],
  },
  {
    name: 'Audience Fatigue Detection',
    description: 'Identifying when audiences are becoming fatigued',
    contexts: ['audience'],
    successRate: 0.70,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Frequency-based signals are reliable'],
    weaknesses: ['Hard to distinguish fatigue from external factors'],
    antiPatterns: ['Ignoring seasonal effects on engagement'],
    adjustments: [],
  },
  {
    name: 'Competitive Response Prediction',
    description: 'Predicting how competitors will respond to our actions',
    contexts: ['competitive'],
    successRate: 0.45,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Pattern recognition from historical behavior'],
    weaknesses: ['Competitors can be unpredictable'],
    antiPatterns: ['Assuming competitors will maintain same strategy'],
    adjustments: [],
  },
  {
    name: 'Pricing Elasticity Analysis',
    description: 'Understanding price sensitivity and optimal pricing',
    contexts: ['pricing'],
    successRate: 0.60,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Historical price-demand relationships'],
    weaknesses: ['Market conditions can shift elasticity'],
    antiPatterns: ['Ignoring competitive pricing context'],
    adjustments: [],
  },
  {
    name: 'Timing/Seasonality Analysis',
    description: 'Understanding temporal patterns and optimal timing',
    contexts: ['timing'],
    successRate: 0.75,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Historical patterns are often repeated'],
    weaknesses: ['Unexpected events can disrupt patterns'],
    antiPatterns: ['Over-relying on last year\'s exact patterns'],
    adjustments: [],
  },
];
