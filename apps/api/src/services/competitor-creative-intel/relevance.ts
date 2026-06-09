/**
 * Competitor Creative Intelligence — Relevance Scoring
 */

import { extractText } from '../../utils/claude-helpers.js';
import { logger } from '../../utils/logger.js';
import { anthropic, gemini } from './ai-clients.js';
import type { RelevanceResult } from './types.js';

/**
 * AI AGENT: The Brain for Ad Relevance Analysis
 *
 * Instead of hardcoded rules, uses AI to understand:
 * 1. What product/service is the ad selling?
 * 2. Who is the target audience?
 * 3. How does this relate to the client's brand?
 * 4. What can be learned (messaging vs creative technique)?
 *
 * Classifications:
 * - DIRECT: Same product category → Copy their hooks, offers, messaging
 * - INDIRECT: Different product, same audience OR great creative → Experiment with their format
 * - IRRELEVANT: Wrong audience, wrong product, nothing useful
 */
export async function scoreRelevance(
  ad: { pageName: string; primaryText: string; headline: string; caption: string; creativeFormat: string },
  brandContext: { industry: string; keywords: string[]; description: string }
): Promise<RelevanceResult> {
  const adContent = `Page: ${ad.pageName}\nHeadline: ${ad.headline}\nText: ${ad.primaryText}\nCaption: ${ad.caption}`;
  const brandInfo = `Industry: ${brandContext.industry}\nProducts/Keywords: ${brandContext.keywords.join(', ')}\nDescription: ${brandContext.description}`;

  const prompt = `You are a competitive intelligence analyst for D2C brands. Analyze this ad's relevance to a client's brand.

## CLIENT BRAND
${brandInfo}

## AD TO ANALYZE
${adContent}

## YOUR TASK
1. What product/service is this ad selling?
2. Who is the target audience?
3. Is this relevant to the client?

## CLASSIFICATION RULES
- **DIRECT** (score 75-100): Ad sells SAME or very similar product category as client.
  Example: Client sells sarees → Ad sells sarees/lehengas = DIRECT
  Example: Client sells skincare → Ad sells skincare/beauty = DIRECT
  Action: Copy their messaging, hooks, offers, CTAs

- **INDIRECT** (score 45-70): Ad sells DIFFERENT product but:
  a) Targets the SAME audience (brides, moms, professionals, etc.), OR
  b) Has a creative TECHNIQUE worth adapting (transition, hook style, storytelling)
  Example: Client sells sarees → Ad sells bridal jewelry = INDIRECT (same bride audience)
  Example: Client sells skincare → Ad has great before/after transition = INDIRECT (creative technique)
  Action: Experiment with their creative format, not their messaging

- **IRRELEVANT** (score 0-40): Different product AND different audience. Nothing to learn.
  Example: Client sells sarees → Ad sells men's tuxedos = IRRELEVANT
  Example: Client sells skincare → Ad sells car insurance = IRRELEVANT

## RESPOND WITH JSON ONLY
{
  "productSold": "<what the ad is selling>",
  "targetAudience": "<who the ad targets>",
  "score": <number 0-100>,
  "type": "direct" | "indirect" | "irrelevant",
  "reason": "<1 sentence explaining why this classification>",
  "creativeInsight": "<for INDIRECT: specific technique to learn, e.g. 'Product reveal zoom transition' or 'Before/after split screen'. For DIRECT: leave empty>"
}`;

  try {
    // Use Gemini for cost efficiency (this runs per ad)
    if (gemini) {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
          type: ['direct', 'indirect', 'irrelevant'].includes(parsed.type) ? parsed.type : 'irrelevant',
          reason: parsed.reason || 'No reason provided',
          creativeInsight: parsed.creativeInsight,
        };
      }
    }

    // Fallback to Anthropic if Gemini fails
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = extractText(response, '{}');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
        type: ['direct', 'indirect', 'irrelevant'].includes(parsed.type) ? parsed.type : 'irrelevant',
        reason: parsed.reason || 'No reason provided',
        creativeInsight: parsed.creativeInsight,
      };
    }
  } catch (err) {
    logger.warn({ err }, '[CreativeIntel] Relevance scoring failed');
  }

  // Rule-based fallback
  return scoreRelevanceByRules(ad, brandContext);
}

/**
 * Rule-based relevance scoring (fast fallback)
 *
 * SCALABLE APPROACH:
 * - Uses client's keywords dynamically (no hardcoded industry rules)
 * - Direct: Ad contains 2+ client keywords OR same product category
 * - Indirect: Different product but same target audience/occasion
 * - Irrelevant: No meaningful overlap
 */
function scoreRelevanceByRules(
  ad: { pageName: string; primaryText: string; headline: string; caption: string },
  brandContext: { industry: string; keywords: string[] }
): RelevanceResult {
  const adText = `${ad.pageName} ${ad.primaryText} ${ad.headline} ${ad.caption}`.toLowerCase();
  const clientKeywords = brandContext.keywords.map(k => k.toLowerCase());
  const industry = brandContext.industry.toLowerCase();

  // Step 1: Count keyword matches (most reliable signal)
  let keywordMatches = 0;
  const matchedKeywords: string[] = [];
  for (const kw of clientKeywords) {
    // Only match if keyword is 3+ chars (avoid matching "a", "an", etc.)
    if (kw.length >= 3 && adText.includes(kw)) {
      keywordMatches++;
      matchedKeywords.push(kw);
    }
  }

  // Step 2: DIRECT - Strong keyword match (2+ keywords OR industry name in ad)
  if (keywordMatches >= 2 || adText.includes(industry)) {
    return {
      score: 70 + (keywordMatches * 5),
      type: 'direct',
      reason: `Matches keywords: ${matchedKeywords.join(', ')}`,
    };
  }

  // Step 3: Check if ad mentions a DIFFERENT product category
  // This is a generic approach - extract what the ad is selling
  const productSignals = extractProductSignals(adText);
  const clientProductSignals = extractProductSignals(clientKeywords.join(' '));

  // If ad is clearly selling something different, mark as irrelevant
  if (productSignals.category && clientProductSignals.category &&
      productSignals.category !== clientProductSignals.category) {
    // But check if same target audience (could be indirect)
    if (productSignals.audience && clientProductSignals.audience &&
        productSignals.audience === clientProductSignals.audience) {
      return {
        score: 50,
        type: 'indirect',
        reason: `Different product (${productSignals.category}) but same audience (${productSignals.audience})`,
        creativeInsight: 'Study their creative format and audience messaging',
      };
    }
    return {
      score: 20,
      type: 'irrelevant',
      reason: `Different product category: ${productSignals.category} vs ${clientProductSignals.category}`,
    };
  }

  // Step 4: Single keyword match - could be indirect
  if (keywordMatches === 1) {
    return {
      score: 45,
      type: 'indirect',
      reason: `Partial match: ${matchedKeywords[0]}`,
      creativeInsight: 'May have transferable creative techniques',
    };
  }

  // Step 5: No keyword match - default to irrelevant
  return {
    score: 15,
    type: 'irrelevant',
    reason: 'No keyword or audience overlap detected',
  };
}

/**
 * Extract product category and target audience signals from text
 * This is generic and works for any industry
 */
function extractProductSignals(text: string): { category?: string; audience?: string } {
  const lower = text.toLowerCase();
  const result: { category?: string; audience?: string } = {};

  // Product category detection (generic)
  const categories: Record<string, RegExp> = {
    'ethnic_wear': /saree|lehenga|kurti|salwar|ethnic|traditional indian|dupatta|anarkali/i,
    'western_wear': /tuxedo|suit|blazer|formal wear|western|gown|dress|jeans|shirt/i,
    'jewelry': /jewelry|jewellery|gold|diamond|necklace|earring|ring|bangle|pendant/i,
    'beauty': /skincare|makeup|cosmetic|serum|cream|lipstick|foundation|beauty/i,
    'electronics': /phone|laptop|computer|gadget|electronics|camera|headphone/i,
    'home': /furniture|decor|mattress|sofa|table|chair|home/i,
    'food': /food|restaurant|snack|beverage|drink|meal|recipe/i,
  };

  for (const [cat, regex] of Object.entries(categories)) {
    if (regex.test(lower)) {
      result.category = cat;
      break;
    }
  }

  // Target audience detection (generic)
  const audiences: Record<string, RegExp> = {
    'brides': /bridal|bride|wedding|shaadi|vivah|dulhan|mehendi/i,
    'mothers': /mom|mother|maternity|baby|kids|parenting/i,
    'professionals': /office|work|professional|corporate|business/i,
    'youth': /teen|college|student|young|gen.?z/i,
    'luxury': /premium|luxury|exclusive|high.?end|elite/i,
  };

  for (const [aud, regex] of Object.entries(audiences)) {
    if (regex.test(lower)) {
      result.audience = aud;
      break;
    }
  }

  return result;
}
