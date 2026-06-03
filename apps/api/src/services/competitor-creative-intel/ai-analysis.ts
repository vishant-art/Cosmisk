/**
 * Competitor Creative Intelligence — AI Creative Analysis
 */

import { extractText } from '../../utils/claude-helpers.js';
import { logger } from '../../utils/logger.js';
import { anthropic, gemini } from './ai-clients.js';
import { parseAnalysisResult } from './classifiers.js';
import type { AdLibraryAd, BrandContext, CreativeAnalysis } from './types.js';

const CREATIVE_ANALYSIS_PROMPT = `You are a creative strategist analyzing competitor ads. Extract patterns from this ad.

Return a JSON object with these fields:
{
  "hookType": "problem_first|social_proof|discount_lead|curiosity|fear|aspiration|transformation|testimonial|question|statistic|story|other",
  "hookText": "The actual hook text (first line that grabs attention)",
  "ctaType": "urgency|benefit|curiosity|social_proof|scarcity|free_offer|discount|learn_more|shop_now|other",
  "ctaText": "The actual CTA text",
  "offerType": "percentage_discount|flat_discount|free_shipping|bundle|trial|gift|bogo|none|other",
  "offerDetails": "Specific offer (e.g., '20% off', 'Free shipping over ₹499')",
  "creativeFormat": "ugc_video|studio_video|static_image|carousel|gif|catalog_dpa|other",
  "emotionalTriggers": ["fomo", "trust", "excitement", "fear", "aspiration", "belonging", "curiosity"],
  "targetAudience": "Brief description of who this ad targets"
}

Be precise. If unsure, use "other" or "unknown".`;

export async function analyzeCreativeWithAI(ad: AdLibraryAd): Promise<Partial<CreativeAnalysis>> {
  const adContent = {
    primaryText: ad.ad_creative_bodies?.[0] || '',
    headline: ad.ad_creative_link_titles?.[0] || '',
    caption: ad.ad_creative_link_captions?.[0] || '',
    platforms: ad.publisher_platforms || [],
  };

  // Skip if no content to analyze
  if (!adContent.primaryText && !adContent.headline) {
    return {
      hookType: 'unknown',
      hookText: '',
      ctaType: 'unknown',
      ctaText: '',
      offerType: 'none',
      offerDetails: '',
      creativeFormat: 'unknown',
      emotionalTriggers: [],
      targetAudience: 'unknown',
    };
  }

  const userPrompt = `Analyze this ad:\n\nPrimary Text: ${adContent.primaryText}\n\nHeadline: ${adContent.headline}\n\nCaption: ${adContent.caption}\n\nPlatforms: ${adContent.platforms.join(', ')}`;

  const fullText = `${adContent.primaryText} ${adContent.headline} ${adContent.caption}`.trim();
  const contentForRules = { text: fullText, platforms: adContent.platforms };

  // Try Anthropic first
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      temperature: 0,
      system: CREATIVE_ANALYSIS_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = extractText(response, '{}');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parseAnalysisResult(parsed, contentForRules);
    }
  } catch (err) {
    logger.warn({ err }, '[CreativeIntel] Anthropic analysis failed, trying Gemini');
  }

  // Fallback to Gemini
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(`${CREATIVE_ANALYSIS_PROMPT}\n\n${userPrompt}`);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parseAnalysisResult(parsed, contentForRules);
      }
    } catch (err) {
      logger.warn({ err }, '[CreativeIntel] Gemini analysis also failed');
    }
  }

  // Pure rule-based fallback when AI completely fails
  return parseAnalysisResult({}, contentForRules);
}

/** Analyze ad text with Gemini AI */
export async function analyzeAdWithGemini(ad: CreativeAnalysis, brandContext?: BrandContext): Promise<Partial<CreativeAnalysis>> {
  if (!gemini) return {};

  const prompt = `Analyze this ad. Return JSON only:
TEXT: ${ad.primaryText || ''}
HEADLINE: ${ad.headline || ''}
${brandContext ? `BRAND: ${brandContext.industry}, Keywords: ${brandContext.keywords?.slice(0, 3).join(', ')}` : ''}

{"hookType":"problem_first|social_proof|discount_lead|curiosity|aspiration|transformation|question|other","hookText":"first line","ctaType":"urgency|benefit|scarcity|discount|shop_now|other","offerType":"percentage_discount|flat_discount|free_shipping|bundle|none","emotionalTriggers":["fomo","trust","excitement"],"relevanceScore":0-100,"competitorType":"direct|indirect|irrelevant","relevanceReason":"why"}`;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* ignore */ }
  return {};
}
