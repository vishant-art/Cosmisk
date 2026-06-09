/**
 * Comment Mining Agent — shared types (leaf module)
 */

export interface RawComment {
  id: string;
  source: 'meta_ad' | 'meta_page' | 'instagram_post' | 'shopify_review' | 'support_ticket';
  sourceId: string; // ad ID, post ID, product ID, ticket ID
  text: string;
  author?: string;
  timestamp: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  engagement?: {
    likes?: number;
    replies?: number;
  };
}

export interface ClassifiedComment extends RawComment {
  category: CommentCategory;
  subcategory?: string;
  emotionalTriggers: string[];
  keyPhrases: string[];
  intensity: 'low' | 'medium' | 'high';
  creativeRelevance: number; // 0-100
}

export type CommentCategory =
  | 'objection'      // "Is this worth the price?" → objection-handling ads
  | 'desire'         // "I need this for my wedding" → aspiration ads
  | 'praise'         // "Best purchase ever" → social proof ads
  | 'comparison'     // "Better than Brand X" → differentiation ads
  | 'use_case'       // "Wore to sister's engagement" → scenario ads
  | 'question'       // "Does this come in blue?" → FAQ content
  | 'frustration'    // "Shipping took forever" → process improvement
  | 'other';

export interface CommentPattern {
  pattern: string;
  frequency: number;
  category: CommentCategory;
  exampleComments: string[];
  emotionalWeight: number;
  creativeAngle?: string;
}

export interface CustomerLanguage {
  emotionalDescriptors: Array<{ phrase: string; count: number }>;
  painPointsSolved: Array<{ phrase: string; count: number }>;
  purchaseTriggers: Array<{ phrase: string; count: number }>;
  comparisons: Array<{ phrase: string; competitor?: string; count: number }>;
  useCases: Array<{ phrase: string; occasion?: string; count: number }>;
}

export type ConceptType =
  | 'objection_handler'  // "Is it worth ₹X?" → answer the doubt
  | 'social_proof'       // "Best purchase ever" → show others agree
  | 'aspiration'         // "I want to look like..." → dream state
  | 'differentiation'    // "Better than X" → competitive angle
  | 'scenario'           // "Wore to my wedding" → use case
  | 'fear_reversal'      // "What if it doesn't fit?" → eliminate risk
  | 'desire_amplifier'   // "I NEED this" → intensify want
  | 'urgency_trigger'    // "Almost sold out" → scarcity
  | 'transformation'     // "Before/after" → change story
  | 'community';         // "Everyone's wearing" → belonging

export type AdFormat = 'ugc_script' | 'static_image' | 'carousel' | 'video_hook' | 'story_ad';

export interface CreativeConceptFromComments {
  id: string;
  type: ConceptType;
  hook: string;
  hookSource: 'exact_quote' | 'derived' | 'synthesized';
  sourceComments: string[]; // IDs of comments that inspired this
  visualDirection: string;
  copyPoints: string[];
  targetEmotion: string;
  confidence: number;
  estimatedImpact: string;
  // Enhanced fields
  adFormats: AdFormat[];
  primaryCopy: string;
  secondaryCopy?: string;
  cta: string;
  ugcScript?: string;
  priority: number; // 1-10, higher = create first
  emotionalArc?: string;
}

export interface WhatToCreateNext {
  priority: number; // 1 = create first
  conceptType: ConceptType;
  reason: string;
  dataPoints: number; // how many comments support this
  estimatedROI: 'high' | 'medium' | 'low';
  suggestedFormats: AdFormat[];
  deadline?: string; // "This week", "ASAP", etc.
}

export interface CommentMiningReport {
  clientId: string;
  minedAt: string;
  totalComments: number;
  classifiedComments: number;
  categories: Record<CommentCategory, number>;
  topPatterns: CommentPattern[];
  customerLanguage: CustomerLanguage;
  creativeConcepts: CreativeConceptFromComments[];
  urgentInsights: string[];
  // Enhanced fields
  whatToCreateNext: WhatToCreateNext[];
  emotionalHeatmap: Record<string, number>; // emotion → count
  objectionMap: Array<{ objection: string; frequency: number; currentlyAddressed: boolean }>;
}
