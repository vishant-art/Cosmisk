/**
 * Ad Command Routes
 * Provides endpoints for the Ad Command dashboard:
 * - Summary: Daily brief + KPIs
 * - Creatives: All creatives with status
 * - Fatigue: Fatigue alerts
 * - Briefs: AI-generated creative briefs
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDbAdapter } from '../db/adapter.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import {
  analyzeCreatives,
  generateFatigueAlerts,
  generateSummary,
  type CreativeMetrics,
  type AnalyzedCreative,
  type FatigueAlert,
  type CommandSummary,
} from '../services/fatigue-detector.js';
import type { MetaTokenRow } from '../types/index.js';
import { validate, accountQuerySchema, accountIdQuerySchema } from '../validation/schemas.js';
import { internalError } from '../utils/error-response.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

interface CreativeBriefRow {
  id: string;
  user_id: string;
  account_id: string;
  product_name: string;
  product_id: string | null;
  format: string;
  length: string | null;
  hook_suggestion: string;
  cta_suggestion: string | null;
  reasoning: string;
  status: string;
  created_at: string;
}

async function getUserMetaToken(userId: string): Promise<string | null> {
  const row = await getDbAdapter().get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]);
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export async function adCommandRoutes(app: FastifyInstance) {

  // GET /ad-command/summary - Daily brief + KPIs
  app.get('/summary', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id, date_preset = 'last_7d' } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = await getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({
          success: true,
          data: {
            brief: 'Connect your Meta account to get personalized insights.',
            spend: { value: 0, change: 0, sparkline: [] },
            roas: { value: 0, change: 0, sparkline: [] },
            savings: { value: 0, change: 0 },
            fatigueCount: 0,
            winnerCount: 0,
            wastedSpend: 0,
          },
          meta_connected: false,
        });
      }

      const meta = new MetaApiService(token);

      // Fetch creative-level data + daily account data in parallel
      const [creativeData, dailyData] = await Promise.all([
        meta.get<any>(`/${account_id}/ads`, {
          fields: 'id,name,creative{thumbnail_url},insights.date_preset(' + date_preset + '){spend,impressions,clicks,actions,action_values,frequency,ctr,cpm}',
          limit: '100',
        }),
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
          time_increment: '1',
          date_preset,
          level: 'account',
        }),
      ]);

      // Parse creative metrics
      const creatives = parseCreativeData(creativeData.data || []);
      const analyzed = analyzeCreatives(creatives);
      const alerts = generateFatigueAlerts(creatives);

      // Parse daily data for sparklines
      const dailyMetrics = (dailyData.data || []).map((d: any) => parseInsightMetrics(d));
      const dailySpend = dailyMetrics.map((d: any) => d.spend || 0);
      const dailyRoas = dailyMetrics.map((d: any) => d.roas || 0);

      // Generate summary
      const summary = generateSummary(analyzed, alerts, dailySpend, dailyRoas);

      return { success: true, data: summary };
    } catch (err: any) {
      logger.error({ err, account_id }, 'ad-command/summary failed');
      return internalError(reply, err, 'ad-command/summary failed');
    }
  });

  // GET /ad-command/creatives - All creatives with status
  app.get('/creatives', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id, date_preset = 'last_7d' } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = await getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, data: [], meta_connected: false });
      }

      const meta = new MetaApiService(token);

      // Fetch all ads with insights
      const adsData = await meta.getAllPages<any>(`/${account_id}/ads`, {
        fields: 'id,name,creative{thumbnail_url},created_time,insights.date_preset(' + date_preset + '){spend,impressions,clicks,actions,action_values,frequency,ctr,cpm}',
        limit: '50',
      }, 4); // Max 200 ads

      // Flatten and parse
      const creatives = parseCreativeData(adsData);
      const analyzed = analyzeCreatives(creatives);

      // Sort by ROAS desc
      analyzed.sort((a, b) => b.roas - a.roas);

      return { success: true, data: analyzed };
    } catch (err: any) {
      logger.error({ err, account_id }, 'ad-command/creatives failed');
      return internalError(reply, err, 'ad-command/creatives failed');
    }
  });

  // GET /ad-command/fatigue - Fatigue alerts
  app.get('/fatigue', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountIdQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = await getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, data: [], meta_connected: false });
      }

      const meta = new MetaApiService(token);

      // Fetch ads with daily insights for trend detection
      const adsData = await meta.getAllPages<any>(`/${account_id}/ads`, {
        fields: 'id,name,creative{thumbnail_url},created_time,insights.date_preset(last_7d).time_increment(1){spend,impressions,clicks,actions,action_values,frequency,ctr,cpm}',
        limit: '50',
      }, 4);

      // Parse with daily trends
      const creatives = parseCreativeDataWithTrends(adsData);
      const alerts = generateFatigueAlerts(creatives);

      return { success: true, data: alerts };
    } catch (err: any) {
      logger.error({ err, account_id }, 'ad-command/fatigue failed');
      return internalError(reply, err, 'ad-command/fatigue failed');
    }
  });

  // GET /ad-command/briefs - List briefs
  app.get('/briefs', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountIdQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const rows = await getDbAdapter().all<CreativeBriefRow>(`
        SELECT * FROM creative_briefs
        WHERE user_id = ? AND account_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `, [request.user.id, account_id]);

      const briefs = rows.map(row => ({
        id: row.id,
        productName: row.product_name,
        productId: row.product_id,
        format: row.format,
        length: row.length,
        hookSuggestion: row.hook_suggestion,
        ctaSuggestion: row.cta_suggestion,
        reasoning: row.reasoning,
        status: row.status,
        createdAt: row.created_at,
      }));

      return { success: true, data: briefs };
    } catch (err: any) {
      logger.error({ err, account_id }, 'ad-command/briefs failed');
      return internalError(reply, err, 'ad-command/briefs failed');
    }
  });

  // POST /ad-command/briefs/generate - Generate a new brief
  app.post('/briefs/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body as {
      account_id?: string;
      creative_id?: string;
      replacement_for?: string;
    };
    const accountId = body.account_id;
    const creativeId = body.creative_id; // Optional: for replacement briefs
    const replacementFor = body.replacement_for; // Optional: name of creative being replaced

    if (!accountId) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = await getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(400).send({ success: false, error: 'Meta account not connected' });
      }

      const meta = new MetaApiService(token);

      // Get top performing ads to base the brief on
      const adsData = await meta.get<any>(`/${accountId}/ads`, {
        fields: 'id,name,creative{thumbnail_url},insights.date_preset(last_7d){spend,impressions,clicks,actions,action_values,frequency,ctr,cpm}',
        limit: '20',
      });

      const creatives = parseCreativeData(adsData.data || []);
      const analyzed = analyzeCreatives(creatives);

      // Find top performer or use the replacement target
      let targetCreative: AnalyzedCreative | undefined;
      if (creativeId) {
        targetCreative = analyzed.find(c => c.id === creativeId);
      }
      if (!targetCreative) {
        // Pick the best performing creative
        targetCreative = analyzed.sort((a, b) => b.roas - a.roas)[0];
      }

      if (!targetCreative) {
        // Generate a generic brief
        const brief = generateGenericBrief();
        return await saveBrief(request.user.id, accountId, brief, reply);
      }

      // Generate brief based on winning creative
      const brief = generateBriefFromCreative(targetCreative, replacementFor);
      return await saveBrief(request.user.id, accountId, brief, reply);

    } catch (err: any) {
      logger.error({ err, accountId }, 'ad-command/briefs/generate failed');
      return internalError(reply, err, 'ad-command/briefs/generate failed');
    }
  });
}

// Helper functions

function parseCreativeData(ads: any[]): CreativeMetrics[] {
  return ads.map(ad => {
    const insights = ad.insights?.data?.[0] || {};
    const metrics = parseInsightMetrics(insights);

    // Calculate days active
    const createdTime = ad.created_time ? new Date(ad.created_time) : new Date();
    const daysActive = Math.floor((Date.now() - createdTime.getTime()) / (1000 * 60 * 60 * 24));

    // Determine format from creative
    let format: 'video' | 'image' | 'carousel' = 'image';
    const name = (ad.name || '').toLowerCase();
    if (name.includes('video') || name.includes('ugc') || name.includes('reel')) {
      format = 'video';
    } else if (name.includes('carousel')) {
      format = 'carousel';
    }

    return {
      id: ad.id,
      name: ad.name || 'Unnamed Ad',
      thumbnailUrl: ad.creative?.thumbnail_url,
      format,
      spend: metrics.spend || 0,
      impressions: metrics.impressions || 0,
      clicks: metrics.clicks || 0,
      conversions: metrics.conversions || 0,
      revenue: metrics.revenue || 0,
      frequency: parseFloat(insights.frequency) || 0,
      ctr: metrics.ctr || 0,
      cpm: metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0,
      roas: metrics.roas || 0,
      daysActive,
    };
  }).filter(c => c.spend > 0); // Only include ads with spend
}

function parseCreativeDataWithTrends(ads: any[]): CreativeMetrics[] {
  return ads.map(ad => {
    const dailyInsights = ad.insights?.data || [];

    // Get aggregate metrics from last entry or sum
    const aggregated = dailyInsights.reduce((acc: any, day: any) => {
      const m = parseInsightMetrics(day);
      return {
        spend: (acc.spend || 0) + (m.spend || 0),
        impressions: (acc.impressions || 0) + (m.impressions || 0),
        clicks: (acc.clicks || 0) + (m.clicks || 0),
        conversions: (acc.conversions || 0) + (m.conversions || 0),
        revenue: (acc.revenue || 0) + (m.revenue || 0),
      };
    }, {});

    // Extract daily CTR and CPM for trend analysis
    const dailyCtr = dailyInsights.map((d: any) => parseFloat(d.ctr) || 0);
    const dailyCpm = dailyInsights.map((d: any) => parseFloat(d.cpm) || 0);

    // Calculate averages
    const avgFrequency = dailyInsights.length > 0
      ? dailyInsights.reduce((sum: number, d: any) => sum + (parseFloat(d.frequency) || 0), 0) / dailyInsights.length
      : 0;

    const daysActive = Math.floor((Date.now() - new Date(ad.created_time || Date.now()).getTime()) / (1000 * 60 * 60 * 24));

    let format: 'video' | 'image' | 'carousel' = 'image';
    const name = (ad.name || '').toLowerCase();
    if (name.includes('video') || name.includes('ugc') || name.includes('reel')) {
      format = 'video';
    } else if (name.includes('carousel')) {
      format = 'carousel';
    }

    return {
      id: ad.id,
      name: ad.name || 'Unnamed Ad',
      thumbnailUrl: ad.creative?.thumbnail_url,
      format,
      spend: aggregated.spend || 0,
      impressions: aggregated.impressions || 0,
      clicks: aggregated.clicks || 0,
      conversions: aggregated.conversions || 0,
      revenue: aggregated.revenue || 0,
      frequency: avgFrequency,
      ctr: aggregated.impressions > 0 ? aggregated.clicks / aggregated.impressions : 0,
      cpm: aggregated.impressions > 0 ? (aggregated.spend / aggregated.impressions) * 1000 : 0,
      roas: aggregated.spend > 0 ? aggregated.revenue / aggregated.spend : 0,
      daysActive,
      dailyCtr,
      dailyCpm,
    };
  }).filter(c => c.spend > 0);
}

function generateBriefFromCreative(creative: AnalyzedCreative, replacementFor?: string): any {
  const formats = ['UGC Video', 'Static Carousel', 'Product Demo', 'Testimonial Style'];
  const hooks = [
    'Face-first excitement/unboxing',
    'Problem-solution hook',
    'Before/after transformation',
    'Social proof opening',
    'Trend-jacking hook',
  ];
  const ctas = [
    '"Limited stock" urgency',
    '"Shop now" direct CTA',
    '"See why 10K+ customers love this"',
    '"Grab yours before it\'s gone"',
  ];

  // Pick format based on what's working
  let format = 'UGC Video';
  if (creative.format === 'video') {
    format = 'UGC Video';
  } else if (creative.format === 'carousel') {
    format = 'Static Carousel';
  } else {
    format = formats[Math.floor(Math.random() * 2)]; // UGC or Carousel
  }

  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  const cta = ctas[Math.floor(Math.random() * ctas.length)];

  let reasoning = `Based on your top performer "${creative.name.slice(0, 30)}..." achieving ${creative.roas.toFixed(1)}x ROAS. `;
  if (replacementFor) {
    reasoning = `Replacement for fatiguing ad "${replacementFor}". `;
  }
  reasoning += `${format} format recommended based on your winning creative patterns.`;

  return {
    productName: extractProductName(creative.name),
    format,
    length: format.includes('Video') ? '15-18 seconds' : null,
    hookSuggestion: hook,
    ctaSuggestion: cta,
    reasoning,
  };
}

function generateGenericBrief(): any {
  return {
    productName: 'Top Product',
    format: 'UGC Video',
    length: '15-18 seconds',
    hookSuggestion: 'Face-first excitement/unboxing',
    ctaSuggestion: '"Shop now" direct CTA',
    reasoning: 'Generic recommendation based on industry best practices. Connect your Meta account for personalized briefs.',
  };
}

function extractProductName(adName: string): string {
  // Try to extract product name from ad name
  // Common patterns: "Product Name - Format", "Product Name UGC", etc.
  const cleanName = adName
    .replace(/\s*(UGC|Video|Static|Carousel|Ad|Creative|V\d+|Copy\s*\d*)\s*/gi, '')
    .replace(/[-_]/g, ' ')
    .trim();
  return cleanName || 'Featured Product';
}

async function saveBrief(userId: string, accountId: string, brief: any, reply: any) {
  const id = randomUUID();
  const now = new Date().toISOString();

  await getDbAdapter().run(`
    INSERT INTO creative_briefs (id, user_id, account_id, product_name, product_id, format, length, hook_suggestion, cta_suggestion, reasoning, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    accountId,
    brief.productName,
    brief.productId || null,
    brief.format,
    brief.length || null,
    brief.hookSuggestion,
    brief.ctaSuggestion || null,
    brief.reasoning,
    'pending',
    now,
  ]);

  return {
    success: true,
    data: {
      id,
      productName: brief.productName,
      productId: brief.productId,
      format: brief.format,
      length: brief.length,
      hookSuggestion: brief.hookSuggestion,
      ctaSuggestion: brief.ctaSuggestion,
      reasoning: brief.reasoning,
      status: 'pending',
      createdAt: now,
    },
  };
}
