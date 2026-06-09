/**
 * Comment Mining Agent — comment classification.
 */

import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import type { RawComment, ClassifiedComment } from './types.js';

/**
 * Classify comments using Gemini (fallback from Claude)
 */
export async function classifyComments(
  comments: RawComment[]
): Promise<ClassifiedComment[]> {
  if (comments.length === 0) return [];

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const gemini = new GoogleGenerativeAI(config.geminiApiKey || '');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Process in batches of 30 for Gemini
  const batchSize = 30;
  const classified: ClassifiedComment[] = [];

  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);

    const commentList = batch.map((c, idx) =>
      `${idx + 1}. [${c.source}] "${c.text}"`
    ).join('\n');

    try {
      const prompt = `Classify these customer comments from a D2C brand. For each, provide:
- category: objection | desire | praise | comparison | use_case | question | frustration | other
- emotionalTriggers: emotions expressed (max 3)
- keyPhrases: memorable phrases that could be ad copy (max 3)
- intensity: low | medium | high (how strong is the emotion/intent?)
- creativeRelevance: 0-100 (how useful for creating ads?)

Comments:
${commentList}

Return ONLY valid JSON array, no markdown:
[{"index": 1, "category": "praise", "emotionalTriggers": ["joy", "satisfaction"], "keyPhrases": ["fits like a dream"], "intensity": "high", "creativeRelevance": 85}]`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const results = JSON.parse(jsonStr);

      for (const r of results) {
        const originalComment = batch[r.index - 1];
        if (originalComment) {
          classified.push({
            ...originalComment,
            category: r.category || 'other',
            emotionalTriggers: r.emotionalTriggers || [],
            keyPhrases: r.keyPhrases || [],
            intensity: r.intensity || 'low',
            creativeRelevance: r.creativeRelevance || 0
          });
        }
      }

      logger.info({ batchIndex: i, classified: results.length }, '[CommentMining] Classified batch with Gemini');

    } catch (err: any) {
      logger.warn({ err: err.message, batchIndex: i }, '[CommentMining] Classification batch failed');
      // Add unclassified
      for (const comment of batch) {
        classified.push({
          ...comment,
          category: 'other',
          emotionalTriggers: [],
          keyPhrases: [],
          intensity: 'low',
          creativeRelevance: 0
        });
      }
    }
  }

  return classified;
}
