/**
 * Comment Mining Agent — pattern & customer-language extraction.
 */

import type {
  ClassifiedComment,
  CommentCategory,
  CommentPattern,
  CustomerLanguage,
} from './types.js';

/**
 * Extract patterns and customer language from classified comments
 */
export function extractPatterns(
  comments: ClassifiedComment[]
): { patterns: CommentPattern[]; language: CustomerLanguage } {

  // Count phrase frequencies
  const phraseCount = new Map<string, { count: number; category: CommentCategory; examples: string[] }>();

  for (const comment of comments) {
    for (const phrase of comment.keyPhrases) {
      const normalized = phrase.toLowerCase().trim();
      const existing = phraseCount.get(normalized);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(comment.text);
        }
      } else {
        phraseCount.set(normalized, {
          count: 1,
          category: comment.category,
          examples: [comment.text]
        });
      }
    }
  }

  // Build patterns from frequent phrases
  const patterns: CommentPattern[] = [];
  for (const [phrase, data] of phraseCount.entries()) {
    if (data.count >= 2) { // At least 2 mentions
      patterns.push({
        pattern: phrase,
        frequency: data.count,
        category: data.category,
        exampleComments: data.examples,
        emotionalWeight: data.count * 10, // Simple weighting
        creativeAngle: deriveCreativeAngle(phrase, data.category)
      });
    }
  }

  // Sort by frequency
  patterns.sort((a, b) => b.frequency - a.frequency);

  // Extract customer language by category
  const language: CustomerLanguage = {
    emotionalDescriptors: [],
    painPointsSolved: [],
    purchaseTriggers: [],
    comparisons: [],
    useCases: []
  };

  // Aggregate emotional descriptors from praise
  const praiseComments = comments.filter(c => c.category === 'praise');
  const emotionalMap = new Map<string, number>();
  for (const c of praiseComments) {
    for (const phrase of c.keyPhrases) {
      emotionalMap.set(phrase, (emotionalMap.get(phrase) || 0) + 1);
    }
  }
  language.emotionalDescriptors = Array.from(emotionalMap.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Pain points from objections/frustrations resolved in praise
  const objectionPhrases = comments
    .filter(c => c.category === 'objection' || c.category === 'frustration')
    .flatMap(c => c.keyPhrases);
  const painMap = new Map<string, number>();
  for (const phrase of objectionPhrases) {
    painMap.set(phrase, (painMap.get(phrase) || 0) + 1);
  }
  language.painPointsSolved = Array.from(painMap.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Comparisons
  const comparisonComments = comments.filter(c => c.category === 'comparison');
  for (const c of comparisonComments) {
    for (const phrase of c.keyPhrases) {
      language.comparisons.push({
        phrase,
        count: 1,
        competitor: extractCompetitorName(c.text)
      });
    }
  }

  // Use cases
  const useCaseComments = comments.filter(c => c.category === 'use_case');
  for (const c of useCaseComments) {
    for (const phrase of c.keyPhrases) {
      language.useCases.push({
        phrase,
        count: 1,
        occasion: extractOccasion(c.text)
      });
    }
  }

  return { patterns, language };
}

export function deriveCreativeAngle(phrase: string, category: CommentCategory): string {
  switch (category) {
    case 'praise':
      return `Social proof ad with hook: "${phrase}"`;
    case 'objection':
      return `Objection-handling ad addressing: "${phrase}"`;
    case 'desire':
      return `Aspiration ad targeting: "${phrase}"`;
    case 'comparison':
      return `Differentiation ad highlighting: "${phrase}"`;
    case 'use_case':
      return `Scenario ad featuring: "${phrase}"`;
    default:
      return `Content addressing: "${phrase}"`;
  }
}

export function extractCompetitorName(text: string): string | undefined {
  // Simple pattern matching for competitor mentions
  const patterns = [
    /better than (\w+)/i,
    /switched from (\w+)/i,
    /unlike (\w+)/i,
    /compared to (\w+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

export function extractOccasion(text: string): string | undefined {
  const occasions = [
    'wedding', 'engagement', 'party', 'office', 'work', 'date',
    'festival', 'diwali', 'eid', 'holi', 'birthday', 'anniversary',
    'travel', 'vacation', 'interview', 'meeting', 'casual', 'daily'
  ];

  const lower = text.toLowerCase();
  for (const occasion of occasions) {
    if (lower.includes(occasion)) return occasion;
  }
  return undefined;
}
