import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import type { SprintRow, JobRow, AssetRow } from '../types/index.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

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
    ).get(userId, weekAgo) as any;

    const jobsThisWeek = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(cost_cents) as total_cost_cents
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
    `).get(userId, weekAgo) as any;

    const topFormats = db.prepare(`
      SELECT format, COUNT(*) as count
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
      GROUP BY format ORDER BY count DESC LIMIT 5
    `).all(userId, weekAgo) as any[];

    const totalSprints = (db.prepare(
      'SELECT COUNT(*) as c FROM creative_sprints WHERE user_id = ?'
    ).get(userId) as any).c;

    const totalCreatives = (db.prepare(
      'SELECT COUNT(*) as c FROM creative_jobs WHERE user_id = ?'
    ).get(userId) as any).c;

    // Best performing assets this week
    const topAssets = db.prepare(`
      SELECT format, predicted_score, dna_tags, actual_metrics
      FROM creative_assets
      WHERE user_id = ? AND created_at >= ? AND actual_metrics IS NOT NULL
      ORDER BY json_extract(actual_metrics, '$.roas') DESC
      LIMIT 5
    `).all(userId, weekAgo) as any[];

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
        top_performers: topAssets.map((a: any) => ({
          format: a.format,
          predicted_score: a.predicted_score,
          dna_tags: a.dna_tags ? JSON.parse(a.dna_tags) : null,
          actual_metrics: a.actual_metrics ? JSON.parse(a.actual_metrics) : null,
        })),
      },
    };
  });

  /* ---- POST /generate — Generate platform-specific content ---- */
  app.post('/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { platforms, topic, tone, transcript } = request.body as {
      platforms?: string[];     // ['twitter', 'linkedin', 'instagram']
      topic?: string;           // optional: specific topic to focus on
      tone?: string;            // 'technical' | 'casual' | 'motivational' | 'data-driven'
      transcript?: string;      // optional: transcript from screen recording
    };

    const db = getDb();
    const userId = request.user.id;
    const targetPlatforms = platforms || ['twitter', 'linkedin', 'instagram'];
    const contentTone = tone || 'casual';

    // Gather Cosmisk data context
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').split('.')[0];

    const recentSprints = db.prepare(
      'SELECT name, status, total_creatives, completed_creatives, actual_cost_cents, created_at FROM creative_sprints WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(userId) as any[];

    const weekStats = db.prepare(`
      SELECT COUNT(*) as jobs, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
    `).get(userId, weekAgo) as any;

    const topFormats = db.prepare(`
      SELECT format, COUNT(*) as count FROM creative_jobs WHERE user_id = ? AND status = 'completed'
      GROUP BY format ORDER BY count DESC LIMIT 5
    `).all(userId) as any[];

    // Build data context
    const dataContext = `
COSMISK WEEKLY DATA:
- Sprints this week: ${recentSprints.filter((s: any) => s.created_at >= weekAgo).length}
- Creatives generated: ${weekStats?.jobs || 0}
- Creatives completed: ${weekStats?.completed || 0}
- Recent sprints: ${recentSprints.map((s: any) => `"${s.name}" (${s.status}, ${s.completed_creatives}/${s.total_creatives} done)`).join(', ') || 'None yet'}
- Most used formats: ${topFormats.map((f: any) => `${f.format} (${f.count})`).join(', ') || 'N/A'}
${topic ? `\nSPECIFIC TOPIC: ${topic}` : ''}
${transcript ? `\nTRANSCRIPT FROM SCREEN RECORDING:\n${transcript.slice(0, 3000)}` : ''}`;

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
        messages: [{ role: 'user', content: `Generate content for these platforms: ${targetPlatforms.join(', ')}\n\n${dataContext}` }],
      });

      const textBlock = response.content.find((b: any) => b.type === 'text');
      const text = textBlock ? (textBlock as any).text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          ...parsed,
          data_context_used: {
            sprints_referenced: recentSprints.length,
            week_creatives: weekStats?.completed || 0,
            top_formats: topFormats.map((f: any) => f.format),
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
    const { platform, content_type, title, body, hashtags, media_notes, scheduled_for, source } = request.body as {
      platform: string;
      content_type?: string;
      title?: string;
      body: string;
      hashtags?: string[];
      media_notes?: string;
      scheduled_for?: string;
      source?: string;
    };

    if (!platform || !body) {
      return reply.status(400).send({ success: false, error: 'platform and body are required' });
    }

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
    const { items } = request.body as {
      items: Array<{
        platform: string;
        content_type?: string;
        title?: string;
        body: string;
        hashtags?: string[];
        media_notes?: string;
      }>;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ success: false, error: 'items array is required' });
    }

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
  app.get('/bank', { preHandler: [app.authenticate] }, async (request) => {
    const { platform, status, limit, offset } = request.query as {
      platform?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    const db = getDb();
    const userId = request.user.id;
    const conditions = ['user_id = ?'];
    const params: any[] = [userId];

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const where = conditions.join(' AND ');
    const lim = Math.min(Math.max(1, parseInt(limit || '50', 10) || 50), 100);
    const off = Math.max(0, parseInt(offset || '0', 10) || 0);

    const total = (db.prepare(`SELECT COUNT(*) as c FROM content_bank WHERE ${where}`).get(...params) as any).c;

    const items = db.prepare(`
      SELECT * FROM content_bank WHERE ${where}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, lim, off) as any[];

    return {
      success: true,
      total,
      items: items.map((row: any) => ({
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
    const { id } = request.params as { id: string };
    const updates = request.body as {
      status?: string;
      body?: string;
      title?: string;
      hashtags?: string[];
      media_notes?: string;
      scheduled_for?: string;
      posted_at?: string;
    };

    const db = getDb();
    const existing = db.prepare('SELECT id FROM content_bank WHERE id = ? AND user_id = ?').get(id, request.user.id);
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Content not found' });
    }

    const fields: string[] = [];
    const values: any[] = [];

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
    const { id } = request.params as { id: string };
    const db = getDb();
    const result = db.prepare('DELETE FROM content_bank WHERE id = ? AND user_id = ?').run(id, request.user.id);

    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Content not found' });
    }

    return { success: true, deleted: id };
  });

  /* ---- POST /trigger-weekly — n8n webhook trigger: generate weekly content batch ---- */
  app.post('/trigger-weekly', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const userId = request.user.id;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').split('.')[0];

    // Gather stats
    const recentSprints = db.prepare(
      'SELECT name, status, total_creatives, completed_creatives, created_at FROM creative_sprints WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(userId) as any[];

    const weekStats = db.prepare(`
      SELECT COUNT(*) as jobs, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
      FROM creative_jobs WHERE user_id = ? AND created_at >= ?
    `).get(userId, weekAgo) as any;

    const topFormats = db.prepare(`
      SELECT format, COUNT(*) as count FROM creative_jobs WHERE user_id = ? AND status = 'completed'
      GROUP BY format ORDER BY count DESC LIMIT 5
    `).all(userId) as any[];

    const dataContext = `
COSMISK WEEKLY DATA:
- Sprints this week: ${recentSprints.filter((s: any) => s.created_at >= weekAgo).length}
- Creatives generated: ${weekStats?.jobs || 0}
- Creatives completed: ${weekStats?.completed || 0}
- Recent sprints: ${recentSprints.map((s: any) => `"${s.name}" (${s.status}, ${s.completed_creatives}/${s.total_creatives} done)`).join(', ') || 'None yet'}
- Most used formats: ${topFormats.map((f: any) => `${f.format} (${f.count})`).join(', ') || 'N/A'}`;

    const platforms = ['twitter', 'linkedin', 'instagram'];

    // Fetch user profile for multi-tenant persona
    const userProfile = db.prepare(
      'SELECT name, brand_name, goals FROM users WHERE id = ?'
    ).get(userId) as { name: string; brand_name?: string; goals?: string } | undefined;

    const userName = userProfile?.name || 'the user';
    const brandName = userProfile?.brand_name || 'their brand';
    const userGoals = userProfile?.goals ? JSON.parse(userProfile.goals) as string[] : [];
    const contentPillars = userGoals.length > 0
      ? userGoals.join(', ')
      : 'Industry Insights, Building in Public, Team & Operations, Performance Marketing, Product Updates';

    const systemPrompt = `You are a weekly content batch generator for ${userName}, who runs ${brandName}.

Generate 7 days of content — one post per platform per day (21 total pieces).

VOICE: Direct, conversational, data-backed. No banned words (revolutionary, game changer, cutting-edge, synergy, ecosystem, robust, seamless, deep dive, etc.)

HOOK FORMULAS: Number-First, Credential+Insight, Pattern Interrupt, Contrarian.

PLATFORM RULES:
- Twitter: Short, punchy. No emojis. Under 280 chars for singles.
- LinkedIn: Hook line + 2-3 paragraphs. Close with question or takeaway.
- Instagram: Caption + reel idea. Emojis ok.

CONTENT PILLARS: ${contentPillars}. Rotate through these across the week.

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
        messages: [{ role: 'user', content: `Generate this week's content batch.\n\n${dataContext}` }],
      });

      const textBlock = response.content.find((b: any) => b.type === 'text');
      const text = textBlock ? (textBlock as any).text : '';
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
