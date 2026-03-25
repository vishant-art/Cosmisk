import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { SprintRow, JobRow, AssetRow, ContentBankRow, CountRow, FormatCountRow, MetaTokenRow } from '../types/index.js';
import { validate, contentSaveSchema, contentBankQuerySchema, contentUpdateSchema, idParamSchema, contentGenerateRequestSchema, contentSaveBatchSchema } from '../validation/schemas.js';
import { extractText } from '../utils/claude-helpers.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/** Aggregated job stats for a time window */
interface JobStatsRow {
  total: number;
  completed: number;
  total_cost_cents: number;
}

/** Week stats (jobs + completed) used in /generate and /trigger-weekly */
interface WeekStatsRow {
  jobs: number;
  completed: number;
}

/** Top-performing asset fields selected in /weekly-stats */
interface TopAssetRow {
  format: string;
  predicted_score: number | null;
  dna_tags: string | null;
  actual_metrics: string | null;
}

/** Recent sprint summary fields */
interface RecentSprintRow {
  name: string;
  status: string;
  total_creatives: number;
  completed_creatives: number;
  actual_cost_cents: number;
  created_at: string;
}

/** Trimmed sprint row for /trigger-weekly (no actual_cost_cents) */
interface TriggerSprintRow {
  name: string;
  status: string;
  total_creatives: number;
  completed_creatives: number;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Meta performance data helper                                       */
/* ------------------------------------------------------------------ */

interface MetaPerformanceSummary {
  weekSpend: number;
  weekRevenue: number;
  weekRoas: number;
  weekConversions: number;
  weekClicks: number;
  weekImpressions: number;
  weekCpa: number;
}

async function fetchMetaPerformance(userId: string): Promise<MetaPerformanceSummary | null> {
  const db = getDb();
  const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!tokenRow) return null;

  try {
    const token = decryptToken(tokenRow.encrypted_access_token);
    const meta = new MetaApiService(token);

    const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id', limit: '10' });
    const accounts = accountsResp.data || [];
    if (accounts.length === 0) return null;

    let weekSpend = 0, weekRevenue = 0, weekConversions = 0, weekClicks = 0, weekImpressions = 0;

    const results = await Promise.allSettled(
      accounts.slice(0, 5).map(async (account: any) => {
        const weekData = await meta.get<any>(`/${account.id}/insights`, {
          fields: 'spend,actions,action_values,purchase_roas,impressions,clicks',
          date_preset: 'last_7d',
          level: 'account',
        }).catch(() => ({ data: [] }));
        return parseInsightMetrics(weekData.data?.[0] || {});
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      weekSpend += result.value.spend;
      weekRevenue += result.value.revenue;
      weekConversions += result.value.conversions;
      weekClicks += result.value.clicks;
      weekImpressions += result.value.impressions;
    }

    return {
      weekSpend,
      weekRevenue,
      weekRoas: weekSpend > 0 ? Math.round((weekRevenue / weekSpend) * 100) / 100 : 0,
      weekConversions,
      weekClicks,
      weekImpressions,
      weekCpa: weekConversions > 0 ? Math.round((weekSpend / weekConversions) * 100) / 100 : 0,
    };
  } catch {
    return null;
  }
}

function formatMetaPerformanceSection(perf: MetaPerformanceSummary): string {
  return `
PERFORMANCE DATA (Last 7 Days — from your live Meta Ads accounts):
- Ad Spend: $${perf.weekSpend.toFixed(2)}
- Revenue: $${perf.weekRevenue.toFixed(2)}
- ROAS: ${perf.weekRoas}x
- Conversions: ${perf.weekConversions}
- CPA: $${perf.weekCpa.toFixed(2)}
- Clicks: ${perf.weekClicks.toLocaleString()}
- Impressions: ${perf.weekImpressions.toLocaleString()}

USE THIS DATA in content. "We hit ${perf.weekRoas}x ROAS this week" is 10x more powerful than generic claims. Reference real numbers — spend milestones, conversion counts, CPA improvements. If ROAS is strong, lead with it. If CPA dropped, celebrate that. Make the data the story.`;
}

/* ------------------------------------------------------------------ */
/*  Content Generator — Personal branding content from Cosmisk data    */
/* ------------------------------------------------------------------ */

export async function contentRoutes(app: FastifyInstance) {

  /* ---- GET /weekly-stats — Raw data summary for content generation ---- */
  app.get('/weekly-stats', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const userId = request.user.id;

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').split('.')[0];

    const sprintsThisWeek = db.prepare(
      'SELECT COUNT(*) as c FROM creative_sprints WHERE user_id = ? AND created_at >= ?'
    ).get(userId, weekAgo) as CountRow | undefined;

    const jobsThisWeek = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(cost_cents) as total_cost_cents
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
    `).get(userId, weekAgo) as JobStatsRow | undefined;

    const topFormats = db.prepare(`
      SELECT format, COUNT(*) as count
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
      GROUP BY format ORDER BY count DESC LIMIT 5
    `).all(userId, weekAgo) as FormatCountRow[];

    const totalSprints = (db.prepare(
      'SELECT COUNT(*) as c FROM creative_sprints WHERE user_id = ?'
    ).get(userId) as CountRow).c;

    const totalCreatives = (db.prepare(
      'SELECT COUNT(*) as c FROM creative_jobs WHERE user_id = ?'
    ).get(userId) as CountRow).c;

    // Best performing assets this week
    const topAssets = db.prepare(`
      SELECT format, predicted_score, dna_tags, actual_metrics
      FROM creative_assets
      WHERE user_id = ? AND created_at >= ? AND actual_metrics IS NOT NULL
      ORDER BY json_extract(actual_metrics, '$.roas') DESC
      LIMIT 5
    `).all(userId, weekAgo) as TopAssetRow[];

    return {
      success: true,
      stats: {
        week: {
          sprints: sprintsThisWeek?.c || 0,
          creatives_generated: jobsThisWeek?.total || 0,
          creatives_completed: jobsThisWeek?.completed || 0,
          cost_cents: jobsThisWeek?.total_cost_cents || 0,
          top_formats: topFormats,
        },
        all_time: {
          total_sprints: totalSprints,
          total_creatives: totalCreatives,
        },
        top_performers: topAssets.map((a) => ({
          format: a.format,
          predicted_score: a.predicted_score,
          dna_tags: a.dna_tags ? JSON.parse(a.dna_tags) : null,
          actual_metrics: a.actual_metrics ? JSON.parse(a.actual_metrics) : null,
        })),
      },
    };
  });

  /* ---- POST /generate — Generate platform-specific content ---- */
  app.post('/generate', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(contentGenerateRequestSchema, request.body, reply);
    if (!parsed) return;
    const { platforms, topic, tone, transcript } = parsed;

    const db = getDb();
    const userId = request.user.id;
    const targetPlatforms = platforms || ['twitter', 'linkedin', 'instagram'];
    const contentTone = tone || 'casual';

    // Gather Cosmisk data context
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').split('.')[0];

    const recentSprints = db.prepare(
      'SELECT name, status, total_creatives, completed_creatives, actual_cost_cents, created_at FROM creative_sprints WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(userId) as RecentSprintRow[];

    const weekStats = db.prepare(`
      SELECT COUNT(*) as jobs, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
    `).get(userId, weekAgo) as WeekStatsRow | undefined;

    const topFormats = db.prepare(`
      SELECT format, COUNT(*) as count FROM creative_jobs WHERE user_id = ? AND status = 'completed'
      GROUP BY format ORDER BY count DESC LIMIT 5
    `).all(userId) as FormatCountRow[];

    // Build data context
    const dataContext = `
COSMISK WEEKLY DATA:
- Sprints this week: ${recentSprints.filter((s) => s.created_at >= weekAgo).length}
- Creatives generated: ${weekStats?.jobs || 0}
- Creatives completed: ${weekStats?.completed || 0}
- Recent sprints: ${recentSprints.map((s) => `"${s.name}" (${s.status}, ${s.completed_creatives}/${s.total_creatives} done)`).join(', ') || 'None yet'}
- Most used formats: ${topFormats.map((f) => `${f.format} (${f.count})`).join(', ') || 'N/A'}
${topic ? `\nSPECIFIC TOPIC: ${topic}` : ''}
${transcript ? `\nTRANSCRIPT FROM SCREEN RECORDING:\n${transcript.slice(0, 3000)}` : ''}`;

    // Fetch Meta Ads performance data (non-blocking — skip if not connected)
    const metaPerf = await fetchMetaPerformance(userId);
    const metaPerfSection = metaPerf ? formatMetaPerformanceSection(metaPerf) : '';

    // Fetch user profile for multi-tenant persona
    const userProfile = db.prepare(
      'SELECT name, brand_name, website_url, goals, competitors FROM users WHERE id = ?'
    ).get(userId) as { name: string; brand_name?: string; website_url?: string; goals?: string; competitors?: string } | undefined;

    const userName = userProfile?.name || 'the user';
    const brandName = userProfile?.brand_name || 'their brand';
    const websiteUrl = userProfile?.website_url ? `\n- Website: ${userProfile.website_url}` : '';
    const userGoals = userProfile?.goals ? `\n- Goals: ${JSON.parse(userProfile.goals).join(', ')}` : '';
    const userCompetitors = userProfile?.competitors ? `\n- Competitors: ${JSON.parse(userProfile.competitors).join(', ')}` : '';

    const toneInstruction = contentTone === 'technical'
      ? 'Technical, specific, show-don\'t-tell. Include code snippets or system design details.'
      : contentTone === 'data-driven'
      ? 'Lead with numbers. Every claim backed by a specific metric or stat.'
      : contentTone === 'motivational'
      ? 'Founder journey, real struggles, real wins. Vulnerable but confident.'
      : 'Conversational, like talking to a smart friend. Punchy. Not generic.';

    const systemPrompt = `You are a content creation agent for ${userName}, who runs ${brandName}.

PROFILE:
- Name: ${userName}
- Brand: ${brandName}${websiteUrl}${userGoals}${userCompetitors}

CONTENT TONE: ${toneInstruction}

VOICE RULES:
- Direct and action-oriented. Get to the point.
- Conversational but professional
- Data-informed — back claims with actual numbers when available
- Avoid generic motivational platitudes — be specific and grounded

BANNED WORDS (never use): revolutionary, game changer, cutting-edge, synergy, ecosystem, robust, seamless, deep dive, unlock potential, unleash, realm, tapestry, holistic, epic, limitless, groundbreaking, delve, paramount, pivotal

HOOK FORMULAS:
- Number-First: Lead with a specific metric or stat
- Credential + Insight: Establish authority, then share a non-obvious takeaway
- Pattern Interrupt: Start with something unexpected
- Contrarian: Challenge common wisdom with evidence

PLATFORM FORMATS:
- Twitter: Short, punchy. Threads have a killer first tweet. No emojis. Under 280 chars for singles.
- LinkedIn: Punchy hook line that makes them click "see more." 2-3 short paragraphs. Plain English. Close with takeaway or question.
- Instagram: Caption complements the visual. Can use emojis here. Include reel shot notes with timing.

THE TEST: Read it out loud. If it sounds like AI slop, rewrite it. Every post should feel like something ${userName} would actually say.

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "content": {
    "twitter": {
      "thread": ["tweet 1", "tweet 2", ...],
      "single_tweets": ["standalone tweet 1", "standalone tweet 2"]
    },
    "linkedin": {
      "post": "full linkedin post text"
    },
    "instagram": {
      "caption": "instagram caption",
      "reel_idea": "brief description of a reel that would pair with this"
    }
  },
  "hashtags": {
    "twitter": ["#tag1", "#tag2"],
    "linkedin": ["#tag1", "#tag2"],
    "instagram": ["#tag1", "#tag2"]
  },
  "best_posting_times": {
    "twitter": "suggested time",
    "linkedin": "suggested time",
    "instagram": "suggested time"
  }
}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate content for these platforms: ${targetPlatforms.join(', ')}\n\n${dataContext}${metaPerfSection ? `\n${metaPerfSection}` : ''}` }],
      });

      const text = extractText(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          ...parsed,
          meta_data_used: !!metaPerf,
          data_context_used: {
            sprints_referenced: recentSprints.length,
            week_creatives: weekStats?.completed || 0,
            top_formats: topFormats.map((f) => f.format),
          },
        };
      }

      return { success: true, raw_content: text };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /* ---- POST /save — Save content to the content bank ---- */
  app.post('/save', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(contentSaveSchema, request.body, reply);
    if (!parsed) return;
    const { platform, content_type, title, body, hashtags, media_notes, source } = parsed;
    const { scheduled_for } = request.body as { scheduled_for?: string };

    const db = getDb();
    const id = randomUUID();

    db.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, title, body, hashtags, media_notes, status, scheduled_for, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      request.user.id,
      platform,
      content_type || 'post',
      title || null,
      body,
      hashtags ? JSON.stringify(hashtags) : null,
      media_notes || null,
      scheduled_for ? 'scheduled' : 'draft',
      scheduled_for || null,
      source || 'manual',
    );

    return { success: true, id, status: scheduled_for ? 'scheduled' : 'draft' };
  });

  /* ---- POST /save-batch — Save multiple content items from a generation ---- */
  app.post('/save-batch', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(contentSaveBatchSchema, request.body, reply);
    if (!parsed) return;
    const { items } = parsed;

    const db = getDb();
    const ids: string[] = [];

    const insertStmt = db.prepare(`
      INSERT INTO content_bank (id, user_id, platform, content_type, title, body, hashtags, media_notes, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'ai')
    `);

    const insertMany = db.transaction((rows: typeof items) => {
      for (const item of rows) {
        const id = randomUUID();
        ids.push(id);
        insertStmt.run(
          id,
          request.user.id,
          item.platform,
          item.content_type || 'post',
          item.title || null,
          item.body,
          item.hashtags ? JSON.stringify(item.hashtags) : null,
          item.media_notes || null,
        );
      }
    });

    insertMany(items);
    return { success: true, saved: ids.length, ids };
  });

  /* ---- GET /bank — List content bank items ---- */
  app.get('/bank', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(contentBankQuerySchema, request.query, reply);
    if (!parsed) return;
    const { platform, status, limit: lim, offset: off } = parsed;

    const db = getDb();
    const userId = request.user.id;
    const conditions = ['user_id = ?'];
    const params: (string | number)[] = [userId];

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const where = conditions.join(' AND ');

    const total = (db.prepare(`SELECT COUNT(*) as c FROM content_bank WHERE ${where}`).get(...params) as CountRow).c;

    const items = db.prepare(`
      SELECT * FROM content_bank WHERE ${where}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, lim, off) as ContentBankRow[];

    return {
      success: true,
      total,
      items: items.map((row) => ({
        id: row.id,
        platform: row.platform,
        content_type: row.content_type,
        title: row.title,
        body: row.body,
        hashtags: (() => { try { return row.hashtags ? JSON.parse(row.hashtags) : []; } catch { return []; } })(),
        media_notes: row.media_notes,
        status: row.status,
        scheduled_for: row.scheduled_for,
        posted_at: row.posted_at,
        source: row.source,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    };
  });

  /* ---- PUT /bank/:id — Update content bank item status/body ---- */
  app.put('/bank/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const paramsParsed = validate(idParamSchema, request.params, reply);
    if (!paramsParsed) return;
    const { id } = paramsParsed;
    const updates = validate(contentUpdateSchema, request.body, reply);
    if (!updates) return;

    const db = getDb();
    const existing = db.prepare('SELECT id FROM content_bank WHERE id = ? AND user_id = ?').get(id, request.user.id);
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Content not found' });
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.status) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.body) { fields.push('body = ?'); values.push(updates.body); }
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.hashtags) { fields.push('hashtags = ?'); values.push(JSON.stringify(updates.hashtags)); }
    if (updates.media_notes !== undefined) { fields.push('media_notes = ?'); values.push(updates.media_notes); }
    if (updates.scheduled_for !== undefined) { fields.push('scheduled_for = ?'); values.push(updates.scheduled_for); }
    if (updates.posted_at) { fields.push('posted_at = ?'); values.push(updates.posted_at); }

    if (fields.length === 0) {
      return reply.status(400).send({ success: false, error: 'No fields to update' });
    }

    fields.push("updated_at = datetime('now')");
    values.push(id, request.user.id);

    db.prepare(`UPDATE content_bank SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);

    return { success: true, id };
  });

  /* ---- DELETE /bank/:id — Delete content bank item ---- */
  app.delete('/bank/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const paramsParsed = validate(idParamSchema, request.params, reply);
    if (!paramsParsed) return;
    const { id } = paramsParsed;
    const db = getDb();
    const result = db.prepare('DELETE FROM content_bank WHERE id = ? AND user_id = ?').run(id, request.user.id);

    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Content not found' });
    }

    return { success: true, deleted: id };
  });

  /* ---- POST /trigger-weekly — n8n webhook trigger: generate weekly content batch ---- */
  app.post('/trigger-weekly', { preHandler: [app.authenticate], config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (request, reply) => {
    const db = getDb();
    const userId = request.user.id;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').split('.')[0];

    // Gather stats
    const recentSprints = db.prepare(
      'SELECT name, status, total_creatives, completed_creatives, created_at FROM creative_sprints WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(userId) as TriggerSprintRow[];

    const weekStats = db.prepare(`
      SELECT COUNT(*) as jobs, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
    `).get(userId, weekAgo) as WeekStatsRow | undefined;

    const topFormats = db.prepare(`
      SELECT format, COUNT(*) as count FROM creative_jobs WHERE user_id = ? AND status = 'completed'
      GROUP BY format ORDER BY count DESC LIMIT 5
    `).all(userId) as FormatCountRow[];

    const dataContext = `
COSMISK WEEKLY DATA:
- Sprints this week: ${recentSprints.filter((s) => s.created_at >= weekAgo).length}
- Creatives generated: ${weekStats?.jobs || 0}
- Creatives completed: ${weekStats?.completed || 0}
- Recent sprints: ${recentSprints.map((s) => `"${s.name}" (${s.status}, ${s.completed_creatives}/${s.total_creatives} done)`).join(', ') || 'None yet'}
- Most used formats: ${topFormats.map((f) => `${f.format} (${f.count})`).join(', ') || 'N/A'}`;

    const platforms = ['twitter', 'linkedin', 'instagram'];

    // Fetch user profile for multi-tenant persona
    const userProfile = db.prepare(
      'SELECT name, brand_name, website_url, goals, competitors FROM users WHERE id = ?'
    ).get(userId) as { name: string; brand_name?: string; website_url?: string; goals?: string; competitors?: string } | undefined;

    const userName = userProfile?.name || 'the user';
    const brandName = userProfile?.brand_name || 'their brand';
    const websiteUrl = userProfile?.website_url ? `\n- Website: ${userProfile.website_url}` : '';
    const userGoals = userProfile?.goals ? JSON.parse(userProfile.goals) as string[] : [];
    const userCompetitors = userProfile?.competitors ? `\n- Competitors: ${JSON.parse(userProfile.competitors).join(', ')}` : '';
    const contentPillars = userGoals.length > 0
      ? userGoals.join(', ')
      : 'Industry Insights, Client Results, Lessons Learned, Behind the Scenes, Product Updates';

    // Fetch Meta Ads performance data (non-blocking — skip if not connected)
    const metaPerf = await fetchMetaPerformance(userId);
    const metaPerfSection = metaPerf ? formatMetaPerformanceSection(metaPerf) : '';

    const systemPrompt = `You are a weekly content batch generator for ${userName}, who runs ${brandName}.

PROFILE:
- Name: ${userName}
- Brand: ${brandName}${websiteUrl}${userCompetitors}

Generate 7 days of content — one post per platform per day (21 total pieces).

VOICE RULES:
- Direct and action-oriented. Get to the point.
- Conversational but professional
- Data-informed — back claims with actual numbers when available
- Avoid generic motivational platitudes — be specific and grounded

BANNED WORDS (never use): revolutionary, game changer, cutting-edge, synergy, ecosystem, robust, seamless, deep dive, unlock potential, unleash, realm, tapestry, holistic, epic, limitless, groundbreaking, delve, paramount, pivotal

HOOK FORMULAS:
- Number-First: Lead with a specific metric or stat
- Credential + Insight: Establish authority, then share a non-obvious takeaway
- Pattern Interrupt: Start with something unexpected
- Contrarian: Challenge common wisdom with evidence

PLATFORM RULES:
- Twitter: Short, punchy. Threads have a killer first tweet. No emojis. Under 280 chars for singles.
- LinkedIn: Punchy hook line that makes them click "see more." 2-3 short paragraphs. Plain English. Close with takeaway or question.
- Instagram: Caption complements the visual. Can use emojis here. Include reel shot notes with timing.

CONTENT PILLARS: ${contentPillars}. Rotate through these across the week.

THE TEST: Read it out loud. If it sounds like AI slop, rewrite it. Every post should feel like something ${userName} would actually say.

OUTPUT — respond with ONLY valid JSON:
{
  "weekly_content": [
    {
      "day": 1,
      "theme": "content pillar for this day",
      "twitter": { "post": "tweet text", "thread": ["tweet1", "tweet2"] },
      "linkedin": { "post": "linkedin post text" },
      "instagram": { "caption": "ig caption", "reel_idea": "reel description" }
    }
  ]
}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate this week's content batch.\n\n${dataContext}${metaPerfSection ? `\n${metaPerfSection}` : ''}` }],
      });

      const text = extractText(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return reply.status(500).send({ success: false, error: 'Failed to parse AI response' });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const weeklyContent = parsed.weekly_content || [];

      // Auto-save all items to content bank
      const insertStmt = db.prepare(`
        INSERT INTO content_bank (id, user_id, platform, content_type, title, body, hashtags, media_notes, status, source, generation_context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'ai-weekly', ?)
      `);

      const savedIds: string[] = [];
      const insertAll = db.transaction(() => {
        for (const day of weeklyContent) {
          const context = JSON.stringify({ day: day.day, theme: day.theme });

          // Twitter single
          if (day.twitter?.post) {
            const id = randomUUID();
            savedIds.push(id);
            insertStmt.run(id, userId, 'twitter', 'post', `Day ${day.day}: ${day.theme}`, day.twitter.post, null, null, context);
          }
          // Twitter thread
          if (day.twitter?.thread?.length) {
            const id = randomUUID();
            savedIds.push(id);
            insertStmt.run(id, userId, 'twitter', 'thread', `Day ${day.day}: ${day.theme} (Thread)`, day.twitter.thread.join('\n---\n'), null, null, context);
          }
          // LinkedIn
          if (day.linkedin?.post) {
            const id = randomUUID();
            savedIds.push(id);
            insertStmt.run(id, userId, 'linkedin', 'post', `Day ${day.day}: ${day.theme}`, day.linkedin.post, null, null, context);
          }
          // Instagram
          if (day.instagram?.caption) {
            const id = randomUUID();
            savedIds.push(id);
            insertStmt.run(id, userId, 'instagram', 'post', `Day ${day.day}: ${day.theme}`, day.instagram.caption, null, day.instagram.reel_idea || null, context);
          }
        }
      });

      insertAll();

      return {
        success: true,
        days_generated: weeklyContent.length,
        total_pieces: savedIds.length,
        saved_ids: savedIds,
        weekly_content: weeklyContent,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
