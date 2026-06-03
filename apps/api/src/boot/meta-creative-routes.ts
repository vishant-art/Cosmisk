import type { FastifyInstance } from 'fastify';
import { getMetaTokenForUser, roundNum } from './meta-helpers.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { internalError } from '../utils/error-response.js';
import { createMessage } from '../services/llm-gateway.js';
import { extractText } from '../utils/claude-helpers.js';
import { getDbAdapter } from '../db/adapter.js';

export function registerMetaCreativeRoutes(app: FastifyInstance): void {
  // GET /creatives/list — Fetch ads from Meta, mapped to creatives format
  app.get('/creatives/list', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, date_preset = 'last_30d', limit = '50' } = request.query as {
      account_id?: string; credential_group?: string; date_preset?: string; limit?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = await getMetaTokenForUser(request.user.id);
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
      return internalError(reply, err, 'dashboard/creatives failed');
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
      const token = await getMetaTokenForUser(request.user.id);
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
      return internalError(reply, err, 'dashboard/top-creatives failed');
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
      const token = await getMetaTokenForUser(request.user.id);
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
      return internalError(reply, err, 'creatives/detail failed');
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
      const token = await getMetaTokenForUser(request.user.id);
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
      return internalError(reply, err, 'creatives/analyze failed');
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

    // Check cache first
    const cached = await getDbAdapter().all<{ ad_id: string; hook: string; visual: string; audio: string; reasoning: string }>(
      'SELECT ad_id, hook, visual, audio, reasoning FROM dna_cache WHERE account_id = ? AND ad_id IN (' + ads.map(() => '?').join(',') + ')',
      [account_id, ...ads.map(a => a.id)]);

    const cachedMap = new Map(cached.map(c => {
      try {
        return [c.ad_id, {
          hook: JSON.parse(c.hook),
          visual: JSON.parse(c.visual),
          audio: JSON.parse(c.audio),
          reasoning: c.reasoning,
        }];
      } catch {
        return [c.ad_id, { hook: {}, visual: {}, audio: {}, reasoning: c.reasoning }];
      }
    }));

    const uncached = ads.filter(a => !cachedMap.has(a.id));

    if (uncached.length === 0) {
      // All cached
      const results: Record<string, any> = {};
      for (const ad of ads) results[ad.id] = cachedMap.get(ad.id);
      return { success: true, dna: results, cached: true };
    }

    // Claude analysis for uncached ads
    try {
      // Compute account benchmarks from the batch
      const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
      const avgRoas = ads.filter(a => a.spend > 0).reduce((s, a) => s + a.roas, 0) / Math.max(1, ads.filter(a => a.spend > 0).length);
      const avgCtr = ads.filter(a => a.spend > 0).reduce((s, a) => s + a.ctr, 0) / Math.max(1, ads.filter(a => a.spend > 0).length);

      const adList = uncached.map((a, i) => `${i + 1}. ID: ${a.id} | Name: "${a.name}" | Format: ${a.format} | ROAS: ${a.roas}x | CTR: ${a.ctr}% | CPA: ${a.cpa} | Spend: ${a.spend} | Conversions: ${a.conversions}`).join('\n');

      const msg = await createMessage({
        userId: request.user.id,
        operation: 'creatives.batch-dna',
        request: {
          model: 'claude-sonnet-4-6',
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
        },
      });

      const text = extractText(msg);
      let analyzed: { id: string; hook: string[]; visual: string[]; audio: string[]; reasoning: string }[] = [];
      try {
        const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        analyzed = JSON.parse(jsonStr);
      } catch {
        return reply.status(500).send({ success: false, error: 'Failed to parse DNA analysis' });
      }

      // Cache results
      await getDbAdapter().transaction(async (tx) => {
        for (const item of analyzed) {
          const ad = uncached.find(a => a.id === item.id);
          await tx.run(
            'INSERT INTO dna_cache (ad_id, account_id, ad_name, hook, visual, audio, reasoning, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\')) ON CONFLICT(ad_id) DO UPDATE SET account_id=excluded.account_id, ad_name=excluded.ad_name, hook=excluded.hook, visual=excluded.visual, audio=excluded.audio, reasoning=excluded.reasoning, analyzed_at=excluded.analyzed_at',
            [item.id, account_id, ad?.name || '', JSON.stringify(item.hook || []), JSON.stringify(item.visual || []), JSON.stringify(item.audio || []), item.reasoning || '']);
        }
      });

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
      return internalError(reply, err, 'creatives/batch-dna failed');
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
      const token = await getMetaTokenForUser(request.user.id);
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
      return internalError(reply, err, 'creatives/recommendations failed');
    }
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
      const token = await getMetaTokenForUser(request.user.id);
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
      return internalError(reply, err, 'brain/compare failed');
    }
  });
}
