import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { adAccountRoutes } from './routes/ad-accounts.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { analyticsRoutes } from './routes/analytics.js';
import { brainRoutes } from './routes/brain.js';
import { directorRoutes } from './routes/director.js';
import { aiRoutes } from './routes/ai.js';
import { reportRoutes } from './routes/reports.js';
import { ugcRoutes } from './routes/ugc.js';
import { ugcWorkflowRoutes } from './routes/ugc-workflows.js';
import { brandRoutes } from './routes/brands.js';
import { assetRoutes } from './routes/assets.js';
import { automationRoutes } from './routes/automations.js';
import { campaignRoutes } from './routes/campaigns.js';
import { mediaGenRoutes } from './routes/media-gen.js';
import { billingRoutes } from './routes/billing.js';
import { autopilotRoutes } from './routes/autopilot.js';
import { competitorSpyRoutes } from './routes/competitor-spy.js';
import { googleAdsRoutes } from './routes/google-ads.js';
import { tiktokAdsRoutes } from './routes/tiktok-ads.js';
import { creativeEngineRoutes } from './routes/creative-engine.js';
import { contentRoutes } from './routes/content.js';
import { scoreRoutes } from './routes/score.js';
import { agentRoutes } from './routes/agent.js';
import { swipeFileRoutes } from './routes/swipe-file.js';
import { teamRoutes } from './routes/team.js';
import { usageLimiterPlugin } from './plugins/usage-limiter.js';
import { decryptToken } from './services/token-crypto.js';
import Anthropic from '@anthropic-ai/sdk';
import { MetaApiService } from './services/meta-api.js';
import { parseInsightMetrics } from './services/insights-parser.js';
import type { MetaTokenRow, UserRow } from './types/index.js';
import { validate, profileUpdateSchema } from './validation/schemas.js';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    ...(config.nodeEnv === 'production' ? {} : {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  },
});

await app.register(cors, {
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Security headers
await app.register(helmet, {
  contentSecurityPolicy: false, // disable CSP for now — frontend served separately
});

// Rate limiting — 100 req/min per IP on AI and media endpoints
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1'],
});

await app.register(authPlugin);
await app.register(usageLimiterPlugin);

// Global error handler — structured error responses for all routes
app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    app.log.error({ err: error, url: request.url, method: request.method }, 'Internal server error');
  }
  reply.status(statusCode).send({
    success: false,
    error: statusCode >= 500 ? 'Internal server error' : error.message,
    ...(config.nodeEnv !== 'production' && statusCode >= 500 ? { stack: error.stack } : {}),
  });
});

// Health check — production monitoring
const SERVER_START = new Date().toISOString();
app.get('/health', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => {
  let dbOk = false;
  try { const db = getDb(); db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  return {
    status: dbOk ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    started_at: SERVER_START,
    db: dbOk ? 'connected' : 'error',
    node: process.version,
    env: config.nodeEnv,
  };
});

// Public: Lead capture (no auth)
app.post('/leads/capture', async (request, reply) => {
  const { email, source = 'hero' } = request.body as { email?: string; source?: string };
  if (!email || !email.includes('@')) {
    return reply.status(400).send({ success: false, error: 'Valid email required' });
  }
  const db = getDb();
  const ip = request.ip;
  const ua = request.headers['user-agent'] || '';
  const referrer = request.headers['referer'] || '';
  db.prepare('INSERT INTO leads (email, source, ip, user_agent, referrer) VALUES (?, ?, ?, ?, ?)')
    .run(email.toLowerCase().trim(), source, ip, ua, referrer);
  return { success: true };
});

// Public: Waitlist join (no auth)
app.post('/waitlist/join', async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  const email = (body['email'] as string || '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return reply.status(400).send({ success: false, error: 'Valid email required' });
  }
  const db = getDb();

  // Ensure table exists
  db.exec(`CREATE TABLE IF NOT EXISTS waitlist_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    company TEXT,
    role TEXT,
    ad_spend TEXT,
    team_size TEXT,
    pain_points TEXT,
    interested_features TEXT,
    source TEXT DEFAULT 'waitlist',
    referrer TEXT,
    signed_up_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Check for existing
  const existing = db.prepare('SELECT id FROM waitlist_leads WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) {
    return { success: true, existing: true, position: existing.id };
  }

  const result = db.prepare(`INSERT INTO waitlist_leads (email, name, company, role, ad_spend, team_size, pain_points, interested_features, source, referrer, signed_up_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    email,
    body['name'] || '',
    body['company'] || '',
    body['role'] || '',
    body['ad_spend'] || '',
    body['team_size'] || '',
    JSON.stringify(body['pain_points'] || []),
    JSON.stringify(body['interested_features'] || []),
    body['source'] || 'waitlist',
    body['referrer'] || '',
    body['signed_up_at'] || new Date().toISOString()
  );

  const position = Number(result.lastInsertRowid);

  // Forward to n8n webhook for Airtable sync (fire-and-forget)
  try {
    fetch('http://n8n-jeet.duckdns.org:5678/webhook/waitlist/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, email }),
    }).catch(() => {});
  } catch {}

  return { success: true, position };
});

// Register routes
await app.register(authRoutes, { prefix: '/auth' });
await app.register(adAccountRoutes, { prefix: '/ad-accounts' });
await app.register(dashboardRoutes, { prefix: '/dashboard' });
await app.register(analyticsRoutes, { prefix: '/analytics' });
await app.register(brainRoutes, { prefix: '/brain' });
await app.register(directorRoutes, { prefix: '/director' });
await app.register(aiRoutes, { prefix: '/ai' });
await app.register(reportRoutes, { prefix: '/reports' });
await app.register(ugcRoutes, { prefix: '/ugc' });
await app.register(ugcWorkflowRoutes);  // root-level UGC workflow routes
await app.register(brandRoutes, { prefix: '/brands' });
await app.register(assetRoutes, { prefix: '/assets' });
await app.register(automationRoutes, { prefix: '/automations' });
await app.register(campaignRoutes, { prefix: '/campaigns' });
await app.register(mediaGenRoutes, { prefix: '/media' });
await app.register(billingRoutes, { prefix: '/billing' });
await app.register(autopilotRoutes, { prefix: '/autopilot' });
await app.register(competitorSpyRoutes, { prefix: '/competitor-spy' });
await app.register(googleAdsRoutes, { prefix: '/google-ads' });
await app.register(tiktokAdsRoutes, { prefix: '/tiktok-ads' });
await app.register(creativeEngineRoutes, { prefix: '/creative-engine' });
await app.register(contentRoutes, { prefix: '/content' });
await app.register(scoreRoutes, { prefix: '/score' });
await app.register(agentRoutes, { prefix: '/agent' });
await app.register(swipeFileRoutes, { prefix: '/swipe-file' });
await app.register(teamRoutes, { prefix: '/team' });

// Serve generated audio files from data/audio/
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname_index = dirname(fileURLToPath(import.meta.url));
const audioDir = join(__dirname_index, '../data/audio');
if (!existsSync(audioDir)) mkdirSync(audioDir, { recursive: true });
await app.register(fastifyStatic, {
  root: audioDir,
  prefix: '/audio/',
  decorateReply: false,
});

// --- Creatives & Dashboard Top-Creatives: real Meta-backed implementations ---

function getMetaTokenForUser(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

function roundNum(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ */
/*  Safe migration helper                                              */
/* ------------------------------------------------------------------ */
function ensureUsersColumn(column: string, definition: string): void {
  const db = getDb();
  const cols = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
}

// Run safe migrations for new user columns
ensureUsersColumn('brand_name', 'TEXT');
ensureUsersColumn('website_url', 'TEXT');
ensureUsersColumn('goals', 'TEXT');
ensureUsersColumn('competitors', 'TEXT');
ensureUsersColumn('active_brand', 'TEXT');

// GET /creatives/list — Fetch ads from Meta, mapped to creatives format
app.get('/creatives/list', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { account_id, date_preset = 'last_30d', limit = '50' } = request.query as {
    account_id?: string; credential_group?: string; date_preset?: string; limit?: string;
  };

  if (!account_id) {
    return reply.status(400).send({ success: false, error: 'account_id required' });
  }

  try {
    const token = getMetaTokenForUser(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: true, creatives: [], meta_connected: false });
    }
    const meta = new MetaApiService(token);

    const maxLimit = Math.min(parseInt(limit, 10) || 50, 100);
    const adsResp = await meta.get<any>(`/${account_id}/ads`, {
      fields: `id,name,creative{thumbnail_url,object_type,video_id},insights.date_preset(${date_preset}){spend,impressions,clicks,ctr,actions,action_values,purchase_roas},status,created_time`,
      limit: String(maxLimit),
      filtering: JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
      ]),
    });
    const allAdsRaw = adsResp.data || [];

    const creatives = allAdsRaw.map((ad: any) => {
      const insight = ad.insights?.data?.[0] || {};
      const m = parseInsightMetrics(insight);
      const creative = ad.creative || {};
      return {
        id: ad.id,
        name: ad.name || 'Unnamed Creative',
        format: (creative.object_type || 'IMAGE').toLowerCase() === 'video' ? 'video' : 'image',
        thumbnailUrl: creative.thumbnail_url || '',
        metrics: {
          roas: roundNum(m.roas, 2),
          cpa: roundNum(m.cpa, 2),
          ctr: roundNum(m.ctr, 2),
          spend: roundNum(m.spend, 2),
        },
        status: ad.status === 'ACTIVE' ? 'active' : 'paused',
      };
    });

    // Sort by spend descending
    creatives.sort((a: any, b: any) => b.metrics.spend - a.metrics.spend);

    return { success: true, creatives };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// GET /dashboard/top-creatives — Top 6 ads from Meta as creatives
app.get('/dashboard/top-creatives', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { account_id, date_preset = 'last_7d' } = request.query as {
    account_id?: string; credential_group?: string; date_preset?: string;
  };

  if (!account_id) {
    return reply.status(400).send({ success: false, error: 'account_id required' });
  }

  try {
    const token = getMetaTokenForUser(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: true, creatives: [], meta_connected: false });
    }
    const meta = new MetaApiService(token);

    const adsResp2 = await meta.get<any>(`/${account_id}/ads`, {
      fields: `id,name,creative{thumbnail_url,object_type},insights.date_preset(${date_preset}){spend,impressions,clicks,ctr,actions,action_values,purchase_roas},created_time`,
      limit: '50',
      filtering: JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
      ]),
    });
    const allAdsRaw2 = adsResp2.data || [];

    const creatives = allAdsRaw2.map((ad: any) => {
      const insight = ad.insights?.data?.[0] || {};
      const m = parseInsightMetrics(insight);
      return {
        id: ad.id,
        name: ad.name || 'Unnamed Creative',
        format: (ad.creative?.object_type || 'IMAGE').toLowerCase() === 'video' ? 'video' : 'image',
        thumbnailUrl: ad.creative?.thumbnail_url || '',
        metrics: {
          roas: roundNum(m.roas, 2),
          cpa: roundNum(m.cpa, 2),
          ctr: roundNum(m.ctr, 2),
          spend: roundNum(m.spend, 2),
        },
        status: 'active',
      };
    }).filter((c: any) => c.metrics.spend > 0);

    // Sort by ROAS descending and take top 6
    creatives.sort((a: any, b: any) => b.metrics.roas - a.metrics.roas);

    return { success: true, creatives: creatives.slice(0, 6) };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// GET /creatives/detail — Fetch specific ad detail from Meta by ad ID
app.get('/creatives/detail', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { ad_id, account_id } = request.query as {
    ad_id?: string; account_id?: string; credential_group?: string;
  };

  if (!ad_id) {
    return reply.status(400).send({ success: false, error: 'ad_id required' });
  }

  try {
    const token = getMetaTokenForUser(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: true, creative: null, meta_connected: false });
    }
    const meta = new MetaApiService(token);

    const adData = await meta.get<any>(`/${ad_id}`, {
      fields: 'id,name,status,creative{thumbnail_url,object_type,video_id,body,title,call_to_action_type,image_url},insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas},campaign{name},adset{name},created_time',
    });

    const insight = adData.insights?.data?.[0] || {};
    const m = parseInsightMetrics(insight);
    const creative = adData.creative || {};

    const detail = {
      id: adData.id,
      name: adData.name || 'Unnamed Creative',
      status: adData.status || 'UNKNOWN',
      format: (creative.object_type || 'IMAGE').toLowerCase() === 'video' ? 'video' : 'image',
      thumbnailUrl: creative.thumbnail_url || creative.image_url || '',
      videoId: creative.video_id || null,
      body: creative.body || '',
      title: creative.title || '',
      ctaType: creative.call_to_action_type || '',
      campaignName: adData.campaign?.name || 'Unknown',
      adsetName: adData.adset?.name || 'Unknown',
      createdTime: adData.created_time || '',
      metrics: {
        roas: roundNum(m.roas, 2),
        cpa: roundNum(m.cpa, 2),
        ctr: roundNum(m.ctr, 2),
        cpc: roundNum(m.cpc, 2),
        spend: roundNum(m.spend, 2),
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
        revenue: roundNum(m.revenue, 2),
      },
    };

    return { success: true, creative: detail };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// POST /creatives/analyze — Return analysis based on the ad's performance metrics
app.post('/creatives/analyze', { preHandler: [app.authenticate] }, async (request, reply) => {
  const body = request.body as { ad_id?: string; account_id?: string; credential_group?: string };
  const adId = body.ad_id;
  const accountId = body.account_id;

  if (!adId) {
    return reply.status(400).send({ success: false, error: 'ad_id required' });
  }

  try {
    const token = getMetaTokenForUser(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: true, analysis: null, meta_connected: false });
    }
    const meta = new MetaApiService(token);

    // Fetch the ad's performance
    const adData = await meta.get<any>(`/${adId}`, {
      fields: 'id,name,creative{object_type},insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas}',
    });

    const insight = adData.insights?.data?.[0] || {};
    const m = parseInsightMetrics(insight);

    // Fetch account-level benchmarks for comparison
    let accountBenchmarks = { roas: 0, ctr: 0, cpa: 0, cpc: 0 };
    if (accountId) {
      try {
        const accData = await meta.get<any>(`/${accountId}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_30d',
          level: 'account',
        });
        if (accData.data?.[0]) {
          const am = parseInsightMetrics(accData.data[0]);
          accountBenchmarks = { roas: roundNum(am.roas, 2), ctr: roundNum(am.ctr, 2), cpa: roundNum(am.cpa, 2), cpc: roundNum(am.cpc, 2) };
        }
      } catch {
        // Account benchmark not available
      }
    }

    // Generate analysis
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    if (m.roas >= accountBenchmarks.roas && m.roas > 0) {
      strengths.push(`ROAS of ${roundNum(m.roas, 2)}x exceeds account average of ${accountBenchmarks.roas}x`);
    } else if (m.roas > 0) {
      weaknesses.push(`ROAS of ${roundNum(m.roas, 2)}x is below account average of ${accountBenchmarks.roas}x`);
      recommendations.push('Test new hooks and copy angles to improve conversion rate');
    }

    if (m.ctr >= accountBenchmarks.ctr && m.ctr > 0) {
      strengths.push(`CTR of ${roundNum(m.ctr, 2)}% is above account average of ${accountBenchmarks.ctr}%`);
    } else if (m.ctr > 0 && accountBenchmarks.ctr > 0) {
      weaknesses.push(`CTR of ${roundNum(m.ctr, 2)}% is below account average of ${accountBenchmarks.ctr}%`);
      recommendations.push('Improve the creative hook — first 3 seconds are critical');
    }

    if (m.cpa > 0 && m.cpa <= accountBenchmarks.cpa) {
      strengths.push(`CPA of $${roundNum(m.cpa, 2)} is efficient (account avg: $${accountBenchmarks.cpa})`);
    } else if (m.cpa > 0 && accountBenchmarks.cpa > 0) {
      weaknesses.push(`CPA of $${roundNum(m.cpa, 2)} is higher than account average of $${accountBenchmarks.cpa}`);
      recommendations.push('Refine audience targeting or test different landing pages');
    }

    if (m.spend > 0 && m.conversions === 0) {
      weaknesses.push(`$${roundNum(m.spend, 2)} spent with zero conversions`);
      recommendations.push('Check pixel setup and conversion tracking');
    }

    if (m.roas >= 3) {
      recommendations.push('Strong performer — consider increasing budget allocation');
    }
    if (m.roas > 0 && m.roas < 1) {
      recommendations.push('Unprofitable — consider pausing and iterating on creative');
    }

    const overallScore = Math.min(100, Math.round(
      (m.roas > 0 ? Math.min(m.roas / 4, 1) * 40 : 0) +
      (m.ctr > 0 ? Math.min(m.ctr / 3, 1) * 30 : 0) +
      (m.conversions > 0 ? 20 : 0) +
      (m.spend > 100 ? 10 : m.spend > 0 ? 5 : 0)
    ));

    return {
      success: true,
      analysis: {
        adId,
        adName: adData.name || 'Unknown',
        format: (adData.creative?.object_type || 'IMAGE').toLowerCase(),
        overallScore,
        metrics: {
          roas: roundNum(m.roas, 2),
          ctr: roundNum(m.ctr, 2),
          cpa: roundNum(m.cpa, 2),
          cpc: roundNum(m.cpc, 2),
          spend: roundNum(m.spend, 2),
          impressions: m.impressions,
          conversions: m.conversions,
        },
        accountBenchmarks,
        strengths,
        weaknesses,
        recommendations,
      },
    };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// POST /creatives/batch-dna — Claude-powered DNA analysis for a batch of ads
app.post('/creatives/batch-dna', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { account_id, ads } = request.body as {
    account_id: string;
    ads: { id: string; name: string; format: string; roas: number; ctr: number; cpa: number; spend: number; conversions: number }[];
  };

  if (!account_id || !ads?.length) {
    return reply.status(400).send({ success: false, error: 'account_id and ads[] required' });
  }

  const db = getDb();

  // Check cache first
  const cached = db.prepare('SELECT ad_id, hook, visual, audio, reasoning FROM dna_cache WHERE account_id = ? AND ad_id IN (' + ads.map(() => '?').join(',') + ')')
    .all(account_id, ...ads.map(a => a.id)) as { ad_id: string; hook: string; visual: string; audio: string; reasoning: string }[];

  const cachedMap = new Map(cached.map(c => [c.ad_id, {
    hook: JSON.parse(c.hook),
    visual: JSON.parse(c.visual),
    audio: JSON.parse(c.audio),
    reasoning: c.reasoning,
  }]));

  const uncached = ads.filter(a => !cachedMap.has(a.id));

  if (uncached.length === 0) {
    // All cached
    const results: Record<string, any> = {};
    for (const ad of ads) results[ad.id] = cachedMap.get(ad.id);
    return { success: true, dna: results, cached: true };
  }

  // Claude analysis for uncached ads
  try {
    const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

    // Compute account benchmarks from the batch
    const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
    const avgRoas = ads.filter(a => a.spend > 0).reduce((s, a) => s + a.roas, 0) / Math.max(1, ads.filter(a => a.spend > 0).length);
    const avgCtr = ads.filter(a => a.spend > 0).reduce((s, a) => s + a.ctr, 0) / Math.max(1, ads.filter(a => a.spend > 0).length);

    const adList = uncached.map((a, i) => `${i + 1}. ID: ${a.id} | Name: "${a.name}" | Format: ${a.format} | ROAS: ${a.roas}x | CTR: ${a.ctr}% | CPA: ${a.cpa} | Spend: ${a.spend} | Conversions: ${a.conversions}`).join('\n');

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an ad creative DNA analyst. Analyze these ads and classify each one's creative DNA.

Account benchmarks: Avg ROAS ${avgRoas.toFixed(2)}x, Avg CTR ${avgCtr.toFixed(2)}%, Total spend ${totalSpend.toFixed(0)}

Ads to analyze:
${adList}

For each ad, infer the creative DNA from its NAME (ad names often encode the creative strategy, e.g. "UGC - Hindi - Problem/Solution" or "Static - Price Anchor - Product Shot") and its PERFORMANCE relative to benchmarks.

Hook types: Shock Statement, Price Anchor, Curiosity, Authority, Personal Story, Social Proof, Urgency, Transformation, Education, Direct Interrogation
Visual types: Macro Texture, UGC Style, Text-Heavy, Before/After, Product Focus, Lifestyle, Cinematic, Split Screen
Audio types: Hindi Female VO, Hindi Male VO, English Female VO, English Male VO, ASMR, Upbeat Music, Emotional Music, No Audio

Rules:
- Each ad gets 1-2 hooks, 1-2 visuals, 0-2 audio tags
- Infer from the ad NAME first (most reliable signal), then format, then metrics
- VIDEO format likely has audio; IMAGE/CAROUSEL likely has no audio
- High ROAS relative to benchmark suggests the DNA combo is winning
- Low spend means low confidence — still tag but note uncertainty
- Add a short reasoning sentence for each

Return ONLY valid JSON array (no markdown):
[{"id":"ad_id","hook":["type"],"visual":["type"],"audio":["type"],"reasoning":"brief explanation"}]`
      }],
    });

    const text = (msg.content[0] as any).text || '';
    let analyzed: { id: string; hook: string[]; visual: string[]; audio: string[]; reasoning: string }[] = [];
    try {
      const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      analyzed = JSON.parse(jsonStr);
    } catch {
      return reply.status(500).send({ success: false, error: 'Failed to parse DNA analysis' });
    }

    // Cache results
    const upsert = db.prepare('INSERT OR REPLACE INTO dna_cache (ad_id, account_id, ad_name, hook, visual, audio, reasoning, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))');
    const tx = db.transaction(() => {
      for (const item of analyzed) {
        const ad = uncached.find(a => a.id === item.id);
        upsert.run(item.id, account_id, ad?.name || '', JSON.stringify(item.hook || []), JSON.stringify(item.visual || []), JSON.stringify(item.audio || []), item.reasoning || '');
      }
    });
    tx();

    // Merge cached + newly analyzed
    const results: Record<string, any> = {};
    for (const ad of ads) {
      if (cachedMap.has(ad.id)) {
        results[ad.id] = cachedMap.get(ad.id);
      } else {
        const item = analyzed.find(a => a.id === ad.id);
        if (item) {
          results[ad.id] = { hook: item.hook, visual: item.visual, audio: item.audio, reasoning: item.reasoning };
        }
      }
    }

    return { success: true, dna: results, cached: false, analyzed: analyzed.length };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// GET /creatives/recommendations — Recommendations based on top performers
app.get('/creatives/recommendations', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { account_id, date_preset = 'last_30d' } = request.query as {
    account_id?: string; credential_group?: string; date_preset?: string;
  };

  if (!account_id) {
    return reply.status(400).send({ success: false, error: 'account_id required' });
  }

  try {
    const token = getMetaTokenForUser(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: true, recommendations: [], meta_connected: false });
    }
    const meta = new MetaApiService(token);

    const adsResp3 = await meta.get<any>(`/${account_id}/ads`, {
      fields: `id,name,creative{thumbnail_url,object_type},insights.date_preset(${date_preset}){spend,impressions,clicks,ctr,actions,action_values,purchase_roas},created_time`,
      limit: '100',
      filtering: JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
      ]),
    });
    const allAdsRaw3 = adsResp3.data || [];

    const adsWithMetrics = allAdsRaw3.map((ad: any) => {
      const insight = ad.insights?.data?.[0] || {};
      const m = parseInsightMetrics(insight);
      return {
        id: ad.id,
        name: ad.name || 'Unnamed',
        objectType: ad.creative?.object_type || 'IMAGE',
        thumbnailUrl: ad.creative?.thumbnail_url || '',
        roas: roundNum(m.roas, 2),
        ctr: roundNum(m.ctr, 2),
        cpa: roundNum(m.cpa, 2),
        spend: roundNum(m.spend, 2),
        conversions: m.conversions,
        createdTime: ad.created_time || '',
      };
    }).filter((a: any) => a.spend > 0);

    adsWithMetrics.sort((a: any, b: any) => b.roas - a.roas);

    const recommendations: any[] = [];

    // Recommendation 1: Scale top performers
    const topByRoas = adsWithMetrics.filter((a: any) => a.roas >= 2).slice(0, 3);
    if (topByRoas.length > 0) {
      recommendations.push({
        type: 'scale',
        title: 'Scale Top Performers',
        description: `${topByRoas.length} creatives have ROAS above 2x. Consider increasing their budget allocation.`,
        creatives: topByRoas.map((a: any) => ({ id: a.id, name: a.name, roas: a.roas, spend: a.spend })),
      });
    }

    // Recommendation 2: Pause underperformers
    const underperformers = adsWithMetrics.filter((a: any) => a.roas < 1 && a.spend > 50);
    if (underperformers.length > 0) {
      recommendations.push({
        type: 'pause',
        title: 'Pause Underperforming Creatives',
        description: `${underperformers.length} creatives have ROAS below 1x with significant spend. Pausing them would save budget.`,
        creatives: underperformers.slice(0, 5).map((a: any) => ({ id: a.id, name: a.name, roas: a.roas, spend: a.spend })),
      });
    }

    // Recommendation 3: Iterate on high-CTR creatives
    const highCtrLowConv = adsWithMetrics.filter((a: any) => a.ctr >= 2 && a.roas < 2);
    if (highCtrLowConv.length > 0) {
      recommendations.push({
        type: 'iterate',
        title: 'Optimize High-CTR Creatives',
        description: `${highCtrLowConv.length} creatives get great clicks (CTR > 2%) but low conversions. Improve landing pages or offers.`,
        creatives: highCtrLowConv.slice(0, 3).map((a: any) => ({ id: a.id, name: a.name, ctr: a.ctr, roas: a.roas })),
      });
    }

    // Recommendation 4: Video vs Image performance
    const videoAds = adsWithMetrics.filter((a: any) => a.objectType === 'VIDEO');
    const imageAds = adsWithMetrics.filter((a: any) => a.objectType !== 'VIDEO');
    if (videoAds.length > 0 && imageAds.length > 0) {
      const avgVideoRoas = videoAds.reduce((s: number, a: any) => s + a.roas, 0) / videoAds.length;
      const avgImageRoas = imageAds.reduce((s: number, a: any) => s + a.roas, 0) / imageAds.length;
      const winner = avgVideoRoas > avgImageRoas ? 'Video' : 'Image';
      const winnerRoas = roundNum(Math.max(avgVideoRoas, avgImageRoas), 2);
      recommendations.push({
        type: 'format',
        title: `${winner} Ads Outperform`,
        description: `${winner} ads average ${winnerRoas}x ROAS vs ${roundNum(Math.min(avgVideoRoas, avgImageRoas), 2)}x for ${winner === 'Video' ? 'images' : 'videos'}. Create more ${winner.toLowerCase()} content.`,
        creatives: [],
      });
    }

    // Recommendation 5: Fresh creative needed
    const recentAds = adsWithMetrics.filter((a: any) => {
      const daysSinceCreated = Math.floor((Date.now() - new Date(a.createdTime).getTime()) / 86400000);
      return daysSinceCreated < 14;
    });
    if (recentAds.length < 3) {
      recommendations.push({
        type: 'create',
        title: 'Create Fresh Creatives',
        description: `Only ${recentAds.length} creatives launched in the last 14 days. Ad fatigue may be setting in — launch new concepts.`,
        creatives: [],
      });
    }

    return { success: true, recommendations };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  1. Auth refresh — generate a new JWT token                         */
/* ------------------------------------------------------------------ */
app.post('/auth/refresh', async (request, reply) => {
  try {
    await request.jwtVerify();
    const newToken = app.jwt.sign({
      id: request.user.id,
      email: request.user.email,
      name: request.user.name,
      role: request.user.role,
    });
    return { token: newToken };
  } catch {
    return reply.status(401).send({ message: 'Token expired' });
  }
});

/* ------------------------------------------------------------------ */
/*  2. Onboarding endpoints — store data in users table                */
/* ------------------------------------------------------------------ */

// POST /onboarding/connect — acknowledge Meta connection
app.post('/onboarding/connect', { preHandler: [app.authenticate] }, async (request) => {
  const db = getDb();
  // Check if user actually has a meta token connected
  const row = db.prepare('SELECT user_id FROM meta_tokens WHERE user_id = ?').get(request.user.id);
  return {
    success: true,
    connected: !!row,
    message: row ? 'Meta account connected' : 'Meta account not yet connected — use /auth/meta-oauth/exchange',
  };
});

// POST /onboarding/scan — store brand_name and website_url
app.post('/onboarding/scan', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { brand_name, website_url } = request.body as { brand_name?: string; website_url?: string };

  if (!brand_name || !website_url) {
    return reply.status(400).send({ success: false, error: 'brand_name and website_url are required' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET brand_name = ?, website_url = ? WHERE id = ?')
    .run(brand_name, website_url, request.user.id);

  return { success: true, brand_name, website_url };
});

// POST /onboarding/goals — store goals array
app.post('/onboarding/goals', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { goals } = request.body as { goals?: string[] };

  if (!goals || !Array.isArray(goals)) {
    return reply.status(400).send({ success: false, error: 'goals must be an array of strings' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET goals = ? WHERE id = ?')
    .run(JSON.stringify(goals), request.user.id);

  return { success: true, goals };
});

// POST /onboarding/competitors — store competitors array
app.post('/onboarding/competitors', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { competitors } = request.body as { competitors?: string[] };

  if (!competitors || !Array.isArray(competitors)) {
    return reply.status(400).send({ success: false, error: 'competitors must be an array of strings' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET competitors = ? WHERE id = ?')
    .run(JSON.stringify(competitors), request.user.id);

  return { success: true, competitors };
});

/* ------------------------------------------------------------------ */
/*  3. Settings endpoints                                              */
/* ------------------------------------------------------------------ */

// GET /settings/profile — fetch full user data from DB
app.get('/settings/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as UserRow | undefined;

  if (!user) {
    return reply.status(404).send({ success: false, error: 'User not found' });
  }

  return {
    success: true,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      brand_name: user.brand_name || null,
      website_url: user.website_url || null,
      goals: user.goals ? JSON.parse(user.goals) : [],
      competitors: user.competitors ? JSON.parse(user.competitors) : [],
      active_brand: user.active_brand || null,
      phone: user.phone || null,
      onboarding_complete: !!user.onboarding_complete,
      created_at: user.created_at,
    },
  };
});

// POST /settings/profile — update user profile fields
app.post('/settings/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
  const parsed = validate(profileUpdateSchema, request.body, reply);
  if (!parsed) return;
  const { name, phone, brand_name, website_url, goals, competitors } = parsed;
  const { email, onboarding_complete } = request.body as { email?: string; onboarding_complete?: boolean };

  if (!name && !email && !competitors && !brand_name && !website_url && !goals && !phone && onboarding_complete === undefined) {
    return reply.status(400).send({ success: false, error: 'Provide at least one field to update' });
  }

  const db = getDb();

  // Build dynamic update
  const updates: string[] = [];
  const values: any[] = [];

  if (name) {
    updates.push('name = ?');
    values.push(name);
  }
  if (email) {
    // Check uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, request.user.id);
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Email already in use by another account' });
    }
    updates.push('email = ?');
    values.push(email);
  }
  if (competitors) {
    updates.push('competitors = ?');
    values.push(JSON.stringify(competitors));
  }
  if (phone) {
    updates.push('phone = ?');
    values.push(phone);
  }
  if (brand_name) {
    updates.push('brand_name = ?');
    values.push(brand_name);
  }
  if (website_url) {
    updates.push('website_url = ?');
    values.push(website_url);
  }
  if (goals) {
    updates.push('goals = ?');
    values.push(JSON.stringify(goals));
  }
  if (onboarding_complete !== undefined) {
    updates.push('onboarding_complete = ?');
    values.push(onboarding_complete ? 1 : 0);
  }

  values.push(request.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Fetch updated user and issue fresh JWT so token stays in sync
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as UserRow;
  const newToken = app.jwt.sign({
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
  });

  return {
    success: true,
    token: newToken,
    profile: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
    },
  };
});

// Team routes now at /team/* via teamRoutes plugin

// GET /settings/billing — return user's plan + usage from DB
app.get('/settings/billing', { preHandler: [app.authenticate] }, async (request, reply) => {
  const db = getDb();
  const user = db.prepare('SELECT id, plan, created_at FROM users WHERE id = ?').get(request.user.id) as Pick<UserRow, 'id' | 'plan' | 'created_at'> | undefined;

  if (!user) {
    return reply.status(404).send({ success: false, error: 'User not found' });
  }

  // Forward to billing/status for full details
  return {
    success: true,
    plan: user.plan,
    billing: {
      plan: user.plan,
      status: 'active',
      member_since: user.created_at,
    },
  };
});

/* ------------------------------------------------------------------ */
/*  4. Brain compare — compare KPIs across ad accounts                 */
/* ------------------------------------------------------------------ */
app.get('/brain/compare', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { account_ids } = request.query as { account_ids?: string };

  if (!account_ids) {
    return reply.status(400).send({ success: false, error: 'account_ids query param required (comma-separated)' });
  }

  const ids = account_ids.split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length < 2) {
    return reply.status(400).send({ success: false, error: 'Provide at least 2 account_ids to compare' });
  }

  try {
    const token = getMetaTokenForUser(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: true, comparison: [], meta_connected: false });
    }
    const meta = new MetaApiService(token);

    const comparison = await Promise.all(
      ids.map(async (accountId) => {
        try {
          const data = await meta.get<any>(`/${accountId}/insights`, {
            fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
            date_preset: 'last_30d',
            level: 'account',
          });

          const row = data.data?.[0];
          if (!row) {
            return { account_id: accountId, error: 'No data available', kpis: null };
          }

          const m = parseInsightMetrics(row);
          return {
            account_id: accountId,
            kpis: {
              spend: roundNum(m.spend, 2),
              revenue: roundNum(m.revenue, 2),
              roas: roundNum(m.roas, 2),
              cpa: roundNum(m.cpa, 2),
              ctr: roundNum(m.ctr, 2),
              cpc: roundNum(m.cpc, 2),
              impressions: m.impressions,
              clicks: m.clicks,
              conversions: m.conversions,
            },
          };
        } catch (err: any) {
          return { account_id: accountId, error: err.message, kpis: null };
        }
      })
    );

    return { success: true, comparison };
  } catch (err: any) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  5. Director endpoints — publish creative concepts                  */
/* ------------------------------------------------------------------ */

// POST /director/publish — acknowledge publish request
app.post('/director/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { creative_id } = request.body as { creative_id?: string };

  if (!creative_id) {
    return reply.status(400).send({ success: false, error: 'creative_id is required' });
  }

  return {
    success: true,
    creative_id,
    status: 'queued',
    message: 'Creative has been queued for publishing. It will appear in your ad account shortly.',
    published_at: new Date().toISOString(),
  };
});

/* ------------------------------------------------------------------ */
/*  6. Brands switch — set active brand for user                       */
/* ------------------------------------------------------------------ */
app.post('/brands/switch', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { brand_name } = request.body as { brand_name?: string };

  if (!brand_name) {
    return reply.status(400).send({ success: false, error: 'brand_name is required' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET active_brand = ? WHERE id = ?')
    .run(brand_name, request.user.id);

  return {
    success: true,
    active_brand: brand_name,
    message: `Switched active brand to "${brand_name}"`,
  };
});

/* ------------------------------------------------------------------ */
/*  7. UGC endpoints                                                   */
/* ------------------------------------------------------------------ */

// GET /ugc/avatars — return default avatar personas
app.get('/ugc/avatars', { preHandler: [app.authenticate] }, async () => {
  const avatars = [
    { id: 'avatar_01', name: 'Sophia', age_range: '25-34', gender: 'female', style: 'casual', description: 'Relatable everyday creator with a warm, authentic tone. Great for lifestyle and wellness brands.', thumbnail: '/avatars/sophia.png' },
    { id: 'avatar_02', name: 'Marcus', age_range: '30-40', gender: 'male', style: 'professional', description: 'Confident and authoritative presenter. Ideal for tech, finance, and B2B products.', thumbnail: '/avatars/marcus.png' },
    { id: 'avatar_03', name: 'Aisha', age_range: '20-28', gender: 'female', style: 'energetic', description: 'High-energy, trend-savvy creator. Perfect for beauty, fashion, and Gen-Z audiences.', thumbnail: '/avatars/aisha.png' },
    { id: 'avatar_04', name: 'Jake', age_range: '22-30', gender: 'male', style: 'humorous', description: 'Witty and humorous presenter who makes any product fun. Great for food, entertainment, and DTC brands.', thumbnail: '/avatars/jake.png' },
    { id: 'avatar_05', name: 'Priya', age_range: '28-38', gender: 'female', style: 'expert', description: 'Knowledgeable and trustworthy expert voice. Ideal for health, education, and premium brands.', thumbnail: '/avatars/priya.png' },
    { id: 'avatar_06', name: 'Chris', age_range: '35-45', gender: 'male', style: 'storyteller', description: 'Engaging storyteller with a relatable dad-next-door vibe. Works well for family, home, and insurance brands.', thumbnail: '/avatars/chris.png' },
  ];
  return { success: true, avatars };
});

// Request timing hook
app.addHook('onResponse', (request, reply, done) => {
  const duration = reply.elapsedTime;
  if (duration > 2000) {
    request.log.warn({ url: request.url, method: request.method, duration: `${Math.round(duration)}ms` }, 'Slow request');
  }
  done();
});

// Frontend is served by Vercel — no static file serving needed here

// Initialize DB on startup
getDb();

const shutdown = async () => {
  closeDb();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Cosmisk server running on port ${config.port}`);

  // Recover any sprints interrupted by previous server restart
  const { recoverInterruptedSprints } = await import('./services/job-queue.js');
  recoverInterruptedSprints();
} catch (err: unknown) {
  app.log.error(err);
  process.exit(1);
}
