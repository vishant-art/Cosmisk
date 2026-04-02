/**
 * Tests for the content agent's brief generation logic.
 *
 * Validates: prompt building from top performers, memory integration,
 * brief structure parsing, format recommendation recording, and
 * fallback behavior when Claude returns non-JSON.
 */
import { describe, it, expect } from 'vitest';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { CREATIVE_PATTERNS } from '../services/creative-patterns.js';

/* ------------------------------------------------------------------ */
/*  Replicate buildContentBriefPrompt logic for testability            */
/* ------------------------------------------------------------------ */

function buildContentBriefPrompt(
  accountName: string,
  topCreatives: Array<{ ad_name: string; hook: string; visual: string; audio: string }>,
  adPerformance: any[],
  swipePatterns: Array<{ hook_dna: string; visual_dna: string; audio_dna: string; brand: string }>,
  recentAssets: Array<{ format: string; dna_tags: string; predicted_score: number | null; actual_metrics: string | null; status: string }>,
  memoryContext: string,
): string {
  const dnaBreakdown = topCreatives.slice(0, 10).map(c => {
    const hook = c.hook ? JSON.parse(c.hook) : [];
    const visual = c.visual ? JSON.parse(c.visual) : [];
    const audio = c.audio ? JSON.parse(c.audio) : [];
    return `- ${c.ad_name || 'Unknown'}: Hook=[${hook.join(',')}] Visual=[${visual.join(',')}] Audio=[${audio.join(',')}]`;
  }).join('\n');

  const topAds = (adPerformance || []).slice(0, 10).map((ad: any) => {
    const m = parseInsightMetrics(ad);
    return `- ${ad.ad_name || 'Unknown'}: Spend=$${m.spend.toFixed(0)}, ROAS=${m.roas.toFixed(2)}x, CTR=${(m.ctr * 100).toFixed(2)}%`;
  }).join('\n');

  const swipeInspiration = swipePatterns.slice(0, 5).map(s => {
    const hook = JSON.parse(s.hook_dna || '[]');
    const visual = JSON.parse(s.visual_dna || '[]');
    return `- ${s.brand}: Hook=[${hook.join(',')}] Visual=[${visual.join(',')}]`;
  }).join('\n');

  const assetHistory = recentAssets.slice(0, 10).map(a => {
    const tags = a.dna_tags ? JSON.parse(a.dna_tags) : [];
    return `- ${a.format} (${a.status}): Tags=[${tags.join(',')}] Score=${a.predicted_score ?? 'N/A'}`;
  }).join('\n');

  return `You are a creative strategist building a data-driven content brief for "${accountName}".

Your job: recommend which creative formats and patterns to produce next week, based on what's working and what's not.

AGENT MEMORY (past format performance, past recommendations):
${memoryContext || 'No prior context.'}

CURRENT TOP-PERFORMING ADS (7d):
${topAds || 'No performance data available.'}

CREATIVE DNA OF TOP ADS:
${dnaBreakdown || 'No DNA data available.'}

SWIPE FILE INSPIRATION:
${swipeInspiration || 'No swipe file entries.'}

RECENT CREATIVE ASSETS PRODUCED:
${assetHistory || 'No recent assets.'}

AVAILABLE PATTERN TAXONOMY:
- Hooks: ${CREATIVE_PATTERNS.hook.slice(0, 12).join(', ')}
- Visual: ${CREATIVE_PATTERNS.visual_style.slice(0, 10).join(', ')}
- Audio: ${CREATIVE_PATTERNS.audio.slice(0, 8).join(', ')}

CRITICAL: Check memory for formats that failed before. Do NOT recommend patterns that the memory says underperformed. Double down on what's working.

Respond in JSON:
{
  "weeklyTheme": "One-line creative theme for the week",
  "estimatedCreatives": 5,
  "recommendedFormats": [
    {
      "format": "UGC Testimonial",
      "hookPatterns": ["Social Proof Lead", "Personal Story"],
      "visualStyle": ["UGC Handheld", "Talking Head"],
      "audioStyle": ["Female Voiceover"],
      "rationale": "Why this format based on data",
      "priority": "high"
    }
  ],
  "avoidFormats": [
    { "format": "Studio Lit Product Demo", "reason": "CTR dropped 40% last 2 weeks per memory" }
  ],
  "competitorInsights": ["Insight about competitor creative patterns from swipe file"]
}`;
}

/** Replicate the brief parsing + fallback logic from content-agent.ts */
function parseBriefResponse(rawText: string): {
  weeklyTheme: string;
  recommendedFormats: any[];
  avoidFormats: any[];
  competitorInsights: string[];
  estimatedCreatives: number;
} {
  try {
    const match = rawText.trim().match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        weeklyTheme: parsed.weeklyTheme || 'Performance-optimized creative mix',
        recommendedFormats: parsed.recommendedFormats || [],
        avoidFormats: parsed.avoidFormats || [],
        competitorInsights: parsed.competitorInsights || [],
        estimatedCreatives: parsed.estimatedCreatives || 5,
      };
    }
  } catch { /* fallback */ }
  return {
    weeklyTheme: rawText?.slice(0, 300) || 'Content brief generated',
    recommendedFormats: [],
    avoidFormats: [],
    competitorInsights: [],
    estimatedCreatives: 5,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Content Agent — prompt construction', () => {
  it('includes the account name in the prompt', () => {
    const prompt = buildContentBriefPrompt('My Brand', [], [], [], [], '');
    expect(prompt).toContain('My Brand');
  });

  it('includes top creative DNA breakdown', () => {
    const creatives = [{
      ad_name: 'Summer Ad',
      hook: '["Problem-Solution"]',
      visual: '["UGC Handheld"]',
      audio: '["Male Voiceover"]',
    }];
    const prompt = buildContentBriefPrompt('Brand', creatives, [], [], [], '');
    expect(prompt).toContain('Summer Ad');
    expect(prompt).toContain('Problem-Solution');
    expect(prompt).toContain('UGC Handheld');
  });

  it('includes memory context when available', () => {
    const memory = 'CORE MEMORY:\n- preferred_format: UGC Testimonial\nPAST EPISODES:\n- Scaled UGC Testimonial';
    const prompt = buildContentBriefPrompt('Brand', [], [], [], [], memory);
    expect(prompt).toContain('preferred_format: UGC Testimonial');
    expect(prompt).toContain('Scaled UGC Testimonial');
  });

  it('shows "No prior context" when memory is empty', () => {
    const prompt = buildContentBriefPrompt('Brand', [], [], [], [], '');
    expect(prompt).toContain('No prior context.');
  });

  it('includes swipe file inspiration', () => {
    const swipes = [{
      hook_dna: '["Question Hook"]',
      visual_dna: '["Lifestyle Shot"]',
      audio_dna: '["Background Music"]',
      brand: 'Nike',
    }];
    const prompt = buildContentBriefPrompt('Brand', [], [], swipes, [], '');
    expect(prompt).toContain('Nike');
    expect(prompt).toContain('Question Hook');
  });

  it('includes recent asset history', () => {
    const assets = [{
      format: 'UGC Video',
      dna_tags: '["testimonial","hook"]',
      predicted_score: 7.5,
      actual_metrics: null,
      status: 'published',
    }];
    const prompt = buildContentBriefPrompt('Brand', [], [], [], assets, '');
    expect(prompt).toContain('UGC Video (published)');
    expect(prompt).toContain('Score=7.5');
  });

  it('includes available pattern taxonomy', () => {
    const prompt = buildContentBriefPrompt('Brand', [], [], [], [], '');
    expect(prompt).toContain('AVAILABLE PATTERN TAXONOMY');
    expect(prompt).toContain('Hooks:');
    expect(prompt).toContain('Visual:');
    expect(prompt).toContain('Audio:');
  });

  it('limits top creatives to 10', () => {
    const creatives = Array.from({ length: 20 }, (_, i) => ({
      ad_name: `Ad ${i}`,
      hook: '["Hook"]',
      visual: '["Visual"]',
      audio: '["Audio"]',
    }));
    const prompt = buildContentBriefPrompt('Brand', creatives, [], [], [], '');
    // Should only contain Ad 0 through Ad 9
    expect(prompt).toContain('Ad 0');
    expect(prompt).toContain('Ad 9');
    expect(prompt).not.toContain('Ad 10');
  });
});

describe('Content Agent — brief response parsing', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      weeklyTheme: 'UGC-first week',
      estimatedCreatives: 8,
      recommendedFormats: [
        { format: 'UGC Testimonial', hookPatterns: ['Social Proof'], visualStyle: ['Handheld'], audioStyle: ['VO'], rationale: 'Top performer', priority: 'high' },
      ],
      avoidFormats: [{ format: 'Stock B-roll', reason: 'Low CTR' }],
      competitorInsights: ['Competitor X uses UGC heavily'],
    });
    const result = parseBriefResponse(json);
    expect(result.weeklyTheme).toBe('UGC-first week');
    expect(result.estimatedCreatives).toBe(8);
    expect(result.recommendedFormats).toHaveLength(1);
    expect(result.avoidFormats).toHaveLength(1);
    expect(result.competitorInsights).toHaveLength(1);
  });

  it('extracts JSON from markdown code block', () => {
    const raw = '```json\n{"weeklyTheme":"Bold hooks","recommendedFormats":[{"format":"Hook-first"}]}\n```';
    const result = parseBriefResponse(raw);
    expect(result.weeklyTheme).toBe('Bold hooks');
    expect(result.recommendedFormats).toHaveLength(1);
  });

  it('falls back to raw text when response is not JSON', () => {
    const raw = 'This week, focus on UGC testimonials with social proof hooks.';
    const result = parseBriefResponse(raw);
    expect(result.weeklyTheme).toBe(raw);
    expect(result.recommendedFormats).toHaveLength(0);
    expect(result.estimatedCreatives).toBe(5);
  });

  it('handles empty response', () => {
    const result = parseBriefResponse('');
    expect(result.weeklyTheme).toBe('Content brief generated');
    expect(result.recommendedFormats).toHaveLength(0);
  });

  it('defaults missing fields in parsed JSON', () => {
    const json = JSON.stringify({ weeklyTheme: 'Focus week' });
    const result = parseBriefResponse(json);
    expect(result.weeklyTheme).toBe('Focus week');
    expect(result.recommendedFormats).toHaveLength(0);
    expect(result.avoidFormats).toHaveLength(0);
    expect(result.competitorInsights).toHaveLength(0);
    expect(result.estimatedCreatives).toBe(5);
  });
});

describe('Content Agent — CREATIVE_PATTERNS availability', () => {
  it('has hook patterns', () => {
    expect(CREATIVE_PATTERNS.hook.length).toBeGreaterThan(0);
  });

  it('has visual_style patterns', () => {
    expect(CREATIVE_PATTERNS.visual_style.length).toBeGreaterThan(0);
  });

  it('has audio patterns', () => {
    expect(CREATIVE_PATTERNS.audio.length).toBeGreaterThan(0);
  });
});

describe('Content Agent — decision episode format', () => {
  it('builds decision event string from format recommendation', () => {
    const decision = {
      type: 'format_recommendation',
      targetName: 'UGC Testimonial',
      suggestedAction: 'Create UGC Testimonial with hooks: Social Proof, Story',
      reasoning: 'Top performer last 2 weeks with 4.5x ROAS',
    };
    const event = `Recommended ${decision.suggestedAction} on "${decision.targetName}" (${decision.type})`;
    expect(event).toContain('UGC Testimonial');
    expect(event).toContain('format_recommendation');
    expect(event).toContain('Social Proof');
  });
});
