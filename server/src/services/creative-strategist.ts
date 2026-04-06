/**
 * Creative Strategist Agent — thinks contextually about what UGC concepts
 * will work for a specific brand, learns from feedback loops.
 *
 * Uses 3-tier memory (core/episodic/entity), creative patterns taxonomy,
 * and optional Meta ad data to reason about strategy.
 */

import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import {
  buildContextWindow, recordEpisode, recordDecisionEpisode,
  setCoreMemory, reinforceEpisode, penalizeEpisode,
} from './agent-memory.js';
import { notifyAlert } from './notifications.js';
import { CREATIVE_PATTERNS } from './creative-patterns.js';
import { config } from '../config.js';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import type { MetaTokenRow } from '../types/index.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BrandContext {
  brandName: string;
  products: Array<{ name: string; price: string; url?: string }>;
  targetAudience: string;
  market: string;
  category: string;
  brief?: string;
  accountId?: string;
  numConcepts?: number;
}

export interface ConceptStrategy {
  format: string;
  hook: string;
  demo: string;
  tone: string;
  whyThisBrand: string;
  confidence: 'high' | 'medium' | 'low';
  sourceMemory?: string;
}

export interface AntiPattern {
  avoid: string;
  reason: string;
  sourceMemory?: string;
}

export interface StrategistOutput {
  brandAnalysis: string;
  conceptStrategies: ConceptStrategy[];
  antiPatterns: AntiPattern[];
  culturalAdaptations: string[];
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function runCreativeStrategist(
  userId: string,
  brandContext: BrandContext,
): Promise<string> {
  const db = getDb();
  const runId = uuidv4();

  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'creative_strategist', ?, 'running', datetime('now'))
  `).run(runId, userId);

  try {
    // 1. Build memory context
    const memoryContext = buildContextWindow(userId, 'creative_strategist', {
      maxEpisodes: 20,
      entityTypes: ['brand', 'pattern', 'audience', 'campaign'],
    });

    // 2. Pull ad data if account provided
    let adSummary = '';
    if (brandContext.accountId) {
      adSummary = await gatherAdData(userId, brandContext.accountId);
    }

    // 3. Build prompt and call Claude Opus
    const prompt = buildStrategistPrompt(brandContext, memoryContext, adSummary);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 3000,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = extractText(response);
    let output: Partial<StrategistOutput> = {};

    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) output = JSON.parse(match[0]);
    } catch {
      output.brandAnalysis = rawText?.slice(0, 500) || 'Strategy generated';
    }

    const fullOutput: StrategistOutput = {
      brandAnalysis: output.brandAnalysis || '',
      conceptStrategies: output.conceptStrategies || [],
      antiPatterns: output.antiPatterns || [],
      culturalAdaptations: output.culturalAdaptations || [],
    };

    // 4. Record each concept strategy as a decision
    for (let i = 0; i < fullOutput.conceptStrategies.length; i++) {
      const concept = fullOutput.conceptStrategies[i];
      const decisionId = uuidv4();
      db.prepare(`
        INSERT INTO agent_decisions (id, run_id, user_id, type, target_name,
          reasoning, confidence, urgency, suggested_action, status, created_at)
        VALUES (?, ?, ?, 'concept_strategy', ?, ?, ?, 'low', ?, 'pending', datetime('now'))
      `).run(
        decisionId, runId, userId,
        `${brandContext.brandName} #${i + 1}: ${concept.format}`,
        concept.whyThisBrand,
        concept.confidence,
        `${concept.format} | Hook: ${concept.hook} | Demo: ${concept.demo} | Tone: ${concept.tone}`,
      );

      // Record as episodic memory for future learning
      recordDecisionEpisode(userId, 'creative_strategist', {
        type: 'concept_strategy',
        targetName: `${brandContext.brandName} #${i + 1}`,
        suggestedAction: `${concept.format}: ${concept.hook}`,
        reasoning: concept.whyThisBrand,
      }).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordDecisionEpisode failed'));
    }

    // 5. Update run as completed
    const summary = `Creative strategy for ${brandContext.brandName}: ${fullOutput.conceptStrategies.length} concepts, ${fullOutput.antiPatterns.length} anti-patterns. Market: ${brandContext.market}`;

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ?, raw_context = ? WHERE id = ?
    `).run(summary, JSON.stringify(fullOutput), runId);

    // 6. Record overall episode
    await recordEpisode(
      userId, 'creative_strategist',
      `Generated strategy for ${brandContext.brandName} (${brandContext.category}, ${brandContext.market}). ${fullOutput.conceptStrategies.length} concepts: ${fullOutput.conceptStrategies.map(c => c.format).join(', ')}`,
      memoryContext,
    ).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed'));

    // 7. Notify
    await notifyAlert(userId, {
      type: 'creative_strategy',
      title: `Creative Strategy Ready — ${brandContext.brandName}`,
      content: summary,
      severity: 'info',
    }).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'notifyAlert failed'));

    logger.info(`[CreativeStrategist] Completed for ${brandContext.brandName} (${userId})`);
    return runId;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(`
      UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(`Error: ${message}`, runId);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Feedback — how the agent learns from outcomes                      */
/* ------------------------------------------------------------------ */

export function processConceptFeedback(
  userId: string,
  runId: string,
  conceptIndex: number,
  outcome: 'approved' | 'rejected',
  reason?: string,
): void {
  const db = getDb();

  // Find the decision for this concept
  const decisions = db.prepare(`
    SELECT id, target_name, suggested_action FROM agent_decisions
    WHERE run_id = ? AND user_id = ? AND type = 'concept_strategy'
    ORDER BY created_at ASC
  `).all(runId, userId) as Array<{ id: string; target_name: string; suggested_action: string }>;

  const decision = decisions[conceptIndex];
  if (!decision) return;

  // Update decision status
  db.prepare(`
    UPDATE agent_decisions SET status = ?, outcome = ? WHERE id = ?
  `).run(outcome, reason || outcome, decision.id);

  // Find associated episode
  const episode = db.prepare(`
    SELECT id FROM agent_episodes
    WHERE user_id = ? AND agent_type = 'creative_strategist'
    AND event LIKE ?
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, `%${decision.target_name}%`) as { id: string } | undefined;

  if (episode) {
    if (outcome === 'approved') {
      reinforceEpisode(episode.id, 0.5);
    } else {
      penalizeEpisode(episode.id, 0.4);
    }
  }

  // Record the feedback as a new episode for future learning
  const feedbackEvent = outcome === 'approved'
    ? `Concept APPROVED: ${decision.suggested_action}`
    : `Concept REJECTED: ${decision.suggested_action}`;

  recordEpisode(
    userId, 'creative_strategist',
    feedbackEvent,
    reason || undefined,
    outcome,
  ).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'feedback recordEpisode failed'));
}

/* ------------------------------------------------------------------ */
/*  Seed initial memory                                                */
/* ------------------------------------------------------------------ */

export function seedCreativeStrategistMemory(userId: string): void {
  setCoreMemory(userId, 'creative_strategist', 'production_constraints',
    'UGC only. Creator films on phone. No animations, split-screen, documentary footage, professional cinematography. Creator must be on camera. No location shoots — home/outdoors only.');

  setCoreMemory(userId, 'creative_strategist', 'concept_quality',
    'Every concept needs a unique DEMO (physical action on camera). Different hooks on same demo = same concept. Verify all math from live website. Reference videos must match concept format.');

  setCoreMemory(userId, 'creative_strategist', 'format_diversity',
    'NEVER make all concepts follow the same structure. Mix formats: GRWM, myth buster, reaction, street interview, comment response, third-person narrative, confession/storytime, challenge, routine. If all concepts feel templated, the deck will be rejected.');

  setCoreMemory(userId, 'creative_strategist', 'cultural_awareness',
    'Adapt hooks to the target market. Indian audience: hydrafacial, glass skin, salon-at-home resonate. Western hooks like "skin barrier" or "microbiome" may not land. Always ask: would a creator in THIS market actually say this?');

  setCoreMemory(userId, 'creative_strategist', 'tone_rule',
    'Tone must be CREATOR voice, not brand voice. Test: would a real person say this to their friend? If it sounds like ad copy or a brand manifesto, rewrite it. Preachy/educational tone kills engagement.');

  // Seed initial episodes from past work
  recordEpisode(userId, 'creative_strategist',
    'SkinQ R1: All 9 concepts rejected by client',
    'Root causes: (1) Same template structure — all followed shocking-claim→science→demo→CTA. (2) Western hooks not culturally relevant for Indian market. (3) Brand/preachy voice instead of creator voice. Client feedback via creative strategist Dimple.',
    'rejected — full deck rewrite needed',
  ).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'seed episode failed'));

  recordEpisode(userId, 'creative_strategist',
    'HATB R1: 8 scripts approved — diverse concepts with unique demos',
    'Success factors: Each concept had genuinely different physical demo (ick factor test, taste test, comparison pour, training treat). Indian humor hooks. Creator voice throughout. Variety of formats (reaction, challenge, educational, testimonial).',
    'approved — all 8 scripts sent to creators',
  ).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'seed episode failed'));

  recordEpisode(userId, 'creative_strategist',
    'Oud Arabia R1: Product terminology confusion caused rewrites',
    'Called perfumes "attars" and "incense" incorrectly. "Dagger" is bottle type, not product. Brand name is "Oud Arabia" not "Oudh Arabia". Always verify exact product terminology from brand website before writing.',
    'fixed after rewrite — 6 scripts delivered',
  ).catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'seed episode failed'));

  logger.info(`[CreativeStrategist] Seeded memory for user ${userId}`);
}

/* ------------------------------------------------------------------ */
/*  Gather ad performance data                                         */
/* ------------------------------------------------------------------ */

async function gatherAdData(userId: string, accountId: string): Promise<string> {
  try {
    const db = getDb();
    const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?')
      .get(userId) as MetaTokenRow | undefined;
    if (!tokenRow) return 'No Meta token — ad data unavailable.';

    const meta = new MetaApiService(decryptToken(tokenRow.encrypted_access_token));

    const insights = await meta.get<any>(`/${accountId}/insights`, {
      fields: 'ad_name,spend,impressions,clicks,actions,action_values,purchase_roas',
      level: 'ad', date_preset: 'last_30d', limit: '30',
      sort: 'spend_descending',
    }).catch(() => ({ data: [] }));

    if (!insights.data?.length) return 'No recent ad data available.';

    const lines = insights.data.slice(0, 15).map((ad: any) => {
      const m = parseInsightMetrics(ad);
      return `- ${ad.ad_name || 'Unknown'}: Spend=$${m.spend.toFixed(0)}, ROAS=${m.roas.toFixed(2)}x, CTR=${(m.ctr * 100).toFixed(2)}%`;
    });

    return `AD PERFORMANCE (last 30 days):\n${lines.join('\n')}`;
  } catch {
    return 'Ad data fetch failed.';
  }
}

/* ------------------------------------------------------------------ */
/*  Build the strategist prompt                                        */
/* ------------------------------------------------------------------ */

function buildStrategistPrompt(
  brand: BrandContext,
  memoryContext: string,
  adSummary: string,
): string {
  const productList = brand.products.map(p =>
    `- ${p.name}: ${p.price}${p.url ? ` (${p.url})` : ''}`
  ).join('\n');

  const numConcepts = brand.numConcepts || 10;

  return `You are a Creative Strategist with memory. You learn from every brand you work with.

Your job: Given a brand brief and your accumulated memory, decide what UGC concepts will work for THIS specific brand. Not templates — contextual strategy.

REASONING RULES:
1. Start with the BRAND, not your playbook. What does their audience respond to?
2. Check your memory — have you worked with similar brands? What worked/failed?
3. Every concept must have a UNIQUE DEMO (physical action on camera). Different hooks on the same demo = same concept.
4. Tone must match the CREATOR, not the brand. Would a real person say this to their friend?
5. Cultural context matters — a hook that works in the US may bomb in India.
6. Format diversity is mandatory — if all concepts follow the same structure, the deck will be rejected.
7. Cite your memory when making decisions. "Based on [episode], I'm recommending..."

AGENT MEMORY:
${memoryContext || 'No prior context.'}

BRAND BRIEF:
- Brand: ${brand.brandName}
- Category: ${brand.category}
- Market: ${brand.market}
- Target Audience: ${brand.targetAudience}
- Products:
${productList}
${brand.brief ? `- Client Notes: ${brand.brief}` : ''}

${adSummary || ''}

AVAILABLE CREATIVE PATTERNS:
- Hooks: ${CREATIVE_PATTERNS.hook.join(', ')}
- Visual Styles: ${CREATIVE_PATTERNS.visual_style.join(', ')}
- Audio: ${CREATIVE_PATTERNS.audio.join(', ')}

Generate exactly ${numConcepts} concept strategies. For each, provide a specific format, hook angle, unique physical demo, tone, and contextual reasoning for why it fits THIS brand.

Also provide anti-patterns (what to AVOID for this brand) and cultural adaptations for the ${brand.market} market.

Respond in JSON:
{
  "brandAnalysis": "2-3 paragraphs analyzing what this brand specifically needs",
  "conceptStrategies": [
    {
      "format": "e.g. GRWM, Myth Buster, Street Interview",
      "hook": "the specific hook angle",
      "demo": "the unique physical demo/visual action",
      "tone": "e.g. playful creator, authority, vulnerable confession",
      "whyThisBrand": "contextual reasoning citing memory if relevant",
      "confidence": "high|medium|low",
      "sourceMemory": "which past learning informed this (if any)"
    }
  ],
  "antiPatterns": [
    {
      "avoid": "what to avoid",
      "reason": "why, citing memory if relevant",
      "sourceMemory": "episode reference if any"
    }
  ],
  "culturalAdaptations": ["market-specific adjustments"]
}`;
}
