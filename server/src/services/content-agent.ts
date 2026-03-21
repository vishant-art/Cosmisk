/**
 * Content Brief Agent — analyzes top-performing creatives, cross-references memory
 * to avoid formats that underperformed, and generates data-driven content briefs.
 *
 * Uses DNA cache, swipe file, and creative patterns to build briefs.
 * Memory tracks which formats/hooks have worked — avoids repeating failures.
 */

import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import { buildContextWindow, recordEpisode, recordDecisionEpisode } from './agent-memory.js';
import { notifyAlert } from './notifications.js';
import { CREATIVE_PATTERNS } from './creative-patterns.js';
import { config } from '../config.js';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { MetaTokenRow } from '../types/index.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContentBrief {
  accountId: string;
  accountName: string;
  recommendedFormats: Array<{
    format: string;
    hookPatterns: string[];
    visualStyle: string[];
    audioStyle: string[];
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  avoidFormats: Array<{ format: string; reason: string }>;
  competitorInsights: string[];
  weeklyTheme: string;
  estimatedCreatives: number;
}

/* ------------------------------------------------------------------ */
/*  Run content agent for all users                                    */
/* ------------------------------------------------------------------ */

export async function runContentAgentAll(): Promise<number> {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as { id: string }[];

  let completed = 0;
  for (const user of users) {
    try {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(user.id) as MetaTokenRow | undefined;
      if (!tokenRow) continue;

      const accessToken = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(accessToken);

      const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'account_id,name', limit: '20' });
      const accounts = accountsResp.data || [];

      for (const acct of accounts.slice(0, 5)) {
        try {
          await runContentAgent(user.id, acct.account_id || acct.id, meta);
          completed++;
        } catch (err: unknown) {
          console.error(`[ContentAgent] Failed for account ${acct.account_id}:`, err);
        }
      }
    } catch (err: unknown) {
      console.error(`[ContentAgent] Failed for user ${user.id}:`, err);
    }
  }
  return completed;
}

/* ------------------------------------------------------------------ */
/*  Run content agent for single user+account                          */
/* ------------------------------------------------------------------ */

export async function runContentAgent(userId: string, accountId: string, metaService?: MetaApiService): Promise<string> {
  const db = getDb();
  const runId = uuidv4();

  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'content', ?, 'running', datetime('now'))
  `).run(runId, userId);

  try {
    // Build memory context — past format performance is key
    const memoryContext = buildContextWindow(userId, 'content', {
      maxEpisodes: 15,
      entityTypes: ['campaign', 'pattern', 'ad'],
    });

    // Get Meta API
    let meta = metaService;
    if (!meta) {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
      if (!tokenRow) throw new Error('No Meta token found');
      meta = new MetaApiService(decryptToken(tokenRow.encrypted_access_token));
    }

    // 1. Gather top-performing creatives from DNA cache
    const topCreatives = db.prepare(`
      SELECT ad_name, hook, visual, audio, visual_analysis FROM dna_cache
      WHERE account_id = ? AND visual_analysis IS NOT NULL
      ORDER BY rowid DESC LIMIT 20
    `).all(accountId) as Array<{ ad_name: string; hook: string; visual: string; audio: string; visual_analysis: string }>;

    // 2. Gather recent ad performance
    const adPerformance = await meta.get<any>(`/${accountId}/insights`, {
      fields: 'ad_name,ad_id,spend,impressions,clicks,actions,action_values,purchase_roas',
      level: 'ad', date_preset: 'last_7d', limit: '50',
      sort: 'spend_descending',
    }).catch(() => ({ data: [] }));

    // 3. Get swipe file patterns for inspiration
    const swipePatterns = db.prepare(`
      SELECT hook_dna, visual_dna, audio_dna, brand FROM swipe_file
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 15
    `).all(userId) as Array<{ hook_dna: string; visual_dna: string; audio_dna: string; brand: string }>;

    // 4. Get completed creative assets and their DNA
    const recentAssets = db.prepare(`
      SELECT ca.format, ca.dna_tags, ca.predicted_score, ca.actual_metrics, ca.status
      FROM creative_assets ca
      WHERE ca.user_id = ? AND ca.account_id = ?
      ORDER BY ca.created_at DESC LIMIT 20
    `).all(userId, accountId) as Array<{ format: string; dna_tags: string; predicted_score: number | null; actual_metrics: string | null; status: string }>;

    // 5. Account info
    const accountInfo = await meta.get<any>(`/${accountId}`, { fields: 'name' }).catch(() => ({ name: accountId }));

    // Build Claude prompt
    const prompt = buildContentBriefPrompt(
      accountInfo.name || accountId,
      topCreatives, adPerformance.data || [],
      swipePatterns, recentAssets, memoryContext,
    );

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0];
    let brief: Partial<ContentBrief> = {};

    try {
      const jsonStr = (text as any).text.trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) brief = JSON.parse(match[0]);
    } catch {
      brief.weeklyTheme = (text as any).text?.slice(0, 300) || 'Content brief generated';
    }

    // Build full brief
    const fullBrief: ContentBrief = {
      accountId,
      accountName: accountInfo.name || accountId,
      recommendedFormats: brief.recommendedFormats || [],
      avoidFormats: brief.avoidFormats || [],
      competitorInsights: brief.competitorInsights || [],
      weeklyTheme: brief.weeklyTheme || 'Performance-optimized creative mix',
      estimatedCreatives: brief.estimatedCreatives || 5,
    };

    // Record decisions for each recommended format
    for (const rec of fullBrief.recommendedFormats.slice(0, 5)) {
      recordDecisionEpisode(userId, 'content', {
        type: 'format_recommendation',
        targetName: rec.format,
        suggestedAction: `Create ${rec.format} with hooks: ${rec.hookPatterns.join(', ')}`,
        reasoning: rec.rationale,
      }).catch(() => {});
    }

    // Update agent run
    const summary = `Content brief for ${fullBrief.accountName}: ${fullBrief.recommendedFormats.length} format recommendations, ${fullBrief.avoidFormats.length} formats to avoid. Theme: ${fullBrief.weeklyTheme}`;

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ?, raw_context = ? WHERE id = ?
    `).run(summary, JSON.stringify(fullBrief), runId);

    // Record episode for future briefs
    const formatNames = fullBrief.recommendedFormats.map(f => f.format).join(', ');
    await recordEpisode(
      userId, 'content',
      `Generated content brief for ${fullBrief.accountName}. Recommended: ${formatNames}. Avoid: ${fullBrief.avoidFormats.map(f => f.format).join(', ')}. Theme: ${fullBrief.weeklyTheme}`,
      memoryContext,
    ).catch(() => {});

    // Notify
    await notifyAlert(userId, {
      type: 'content_brief',
      title: `Content Brief Ready — ${fullBrief.accountName}`,
      content: summary,
      severity: 'info',
      accountId,
    }).catch(() => {});

    console.log(`[ContentAgent] Completed brief for ${fullBrief.accountName} (${userId})`);
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
/*  Build Claude prompt                                                */
/* ------------------------------------------------------------------ */

function buildContentBriefPrompt(
  accountName: string,
  topCreatives: any[],
  adPerformance: any[],
  swipePatterns: any[],
  recentAssets: any[],
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
