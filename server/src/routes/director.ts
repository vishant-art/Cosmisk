import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import type { MetaTokenRow } from '../types/index.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export async function directorRoutes(app: FastifyInstance) {

  // POST /director/generate-brief
  app.post('/generate-brief', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body as {
      base_creative?: string;
      patterns?: string[];
      format?: string;
      target_audience?: string;
      product_focus?: string;
      tones?: string[];
      account_id?: string;
      credential_group?: string;
    };

    const format = body.format || 'video';
    const targetAudience = body.target_audience || 'Broad audience';
    const productFocus = body.product_focus || 'Product';
    const tones = body.tones?.length ? body.tones : ['Professional'];
    const isVideo = format.toLowerCase().includes('video');

    // Fetch real performance data from Meta if account_id is provided
    let topAdsData: any[] = [];
    let baseCreativeInsight: any = null;
    let benchmarks = { avgRoas: 0, avgCtr: 0, avgCpa: 0, avgSpend: 0, topRoas: 0, topCtr: 0 };

    if (body.account_id) {
      try {
        const token = getUserMetaToken(request.user.id);
        if (!token) throw new Error('Meta account not connected');
        const meta = new MetaApiService(token);

        // Fetch top-performing ads from Meta
        const allAdsRaw = await meta.getAllPages<any>(`/${body.account_id}/ads`, {
          fields: `id,name,creative{thumbnail_url,object_type,video_id},insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas},campaign{name},adset{name},created_time`,
          limit: '50',
          filtering: JSON.stringify([
            { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
          ]),
        });

        topAdsData = allAdsRaw.map((ad: any) => {
          const insight = ad.insights?.data?.[0] || {};
          const m = parseInsightMetrics(insight);
          return {
            id: ad.id,
            name: ad.name || 'Unnamed Ad',
            object_type: ad.creative?.object_type || 'IMAGE',
            campaign_name: ad.campaign?.name || 'Unknown',
            metrics: { roas: round(m.roas, 2), cpa: round(m.cpa, 2), ctr: round(m.ctr, 2), spend: round(m.spend, 2), impressions: m.impressions, conversions: m.conversions },
          };
        }).filter((ad: any) => ad.metrics.spend > 0);

        // Sort by ROAS descending to identify top performers
        topAdsData.sort((a: any, b: any) => b.metrics.roas - a.metrics.roas);

        // Compute benchmarks from actual performance data
        if (topAdsData.length > 0) {
          const totalSpend = topAdsData.reduce((s: number, a: any) => s + a.metrics.spend, 0);
          const totalConversions = topAdsData.reduce((s: number, a: any) => s + a.metrics.conversions, 0);
          const roasValues = topAdsData.map((a: any) => a.metrics.roas).filter((r: number) => r > 0);
          const ctrValues = topAdsData.map((a: any) => a.metrics.ctr).filter((c: number) => c > 0);

          benchmarks.avgRoas = roasValues.length ? round(roasValues.reduce((s: number, v: number) => s + v, 0) / roasValues.length, 2) : 0;
          benchmarks.avgCtr = ctrValues.length ? round(ctrValues.reduce((s: number, v: number) => s + v, 0) / ctrValues.length, 2) : 0;
          benchmarks.avgCpa = totalConversions > 0 ? round(totalSpend / totalConversions, 2) : 0;
          benchmarks.avgSpend = round(totalSpend / topAdsData.length, 2);
          benchmarks.topRoas = roasValues.length ? round(Math.max(...roasValues), 2) : 0;
          benchmarks.topCtr = ctrValues.length ? round(Math.max(...ctrValues), 2) : 0;
        }

        // If a base_creative is provided, try to get its specific insights
        if (body.base_creative) {
          const baseAd = topAdsData.find((a: any) => a.id === body.base_creative);
          if (baseAd) {
            baseCreativeInsight = baseAd;
          } else {
            // Try fetching it directly
            try {
              const adData = await meta.get<any>(`/${body.base_creative}`, {
                fields: 'id,name,creative{thumbnail_url,object_type},insights.date_preset(last_30d){spend,impressions,clicks,ctr,actions,action_values,purchase_roas}',
              });
              if (adData) {
                const insight = adData.insights?.data?.[0] || {};
                const m = parseInsightMetrics(insight);
                baseCreativeInsight = {
                  id: adData.id,
                  name: adData.name || 'Base Creative',
                  object_type: adData.creative?.object_type || 'IMAGE',
                  metrics: { roas: round(m.roas, 2), cpa: round(m.cpa, 2), ctr: round(m.ctr, 2), spend: round(m.spend, 2), impressions: m.impressions, conversions: m.conversions },
                };
              }
            } catch {
              // Base creative insight not available
            }
          }
        }
      } catch {
        // Meta data not available — continue with defaults
      }
    }

    // Determine top performers for hook/visual DNA inspiration
    const topPerformers = topAdsData.slice(0, 5);
    const topVideoAds = topPerformers.filter((a: any) => a.object_type === 'VIDEO');
    const topImageAds = topPerformers.filter((a: any) => a.object_type !== 'VIDEO');

    // Build the hook DNA based on actual top performers
    const hookPatterns: string[] = [];
    if (baseCreativeInsight && baseCreativeInsight.metrics.roas >= benchmarks.avgRoas) {
      hookPatterns.push(`Base creative "${baseCreativeInsight.name}" has ${baseCreativeInsight.metrics.roas}x ROAS — iterate on its hook angle`);
    }
    if (topPerformers.length > 0) {
      hookPatterns.push(`Top performer "${topPerformers[0].name}" achieved ${topPerformers[0].metrics.roas}x ROAS with ${topPerformers[0].metrics.ctr}% CTR`);
    }
    if (benchmarks.topCtr > 0) {
      hookPatterns.push(`Best CTR in account: ${benchmarks.topCtr}% — aim for attention-grabbing openers`);
    }
    if (hookPatterns.length === 0) {
      hookPatterns.push('Lead with a bold claim or question to stop the scroll');
      hookPatterns.push('Use pattern interrupts and relatable scenarios');
    }

    // Build visual DNA
    const visualPatterns: string[] = [];
    if (topVideoAds.length > 0) {
      visualPatterns.push(`Video ads average ${round(topVideoAds.reduce((s: number, a: any) => s + a.metrics.roas, 0) / topVideoAds.length, 1)}x ROAS — prioritize video format`);
    }
    if (topImageAds.length > 0) {
      visualPatterns.push(`Static ads average ${round(topImageAds.reduce((s: number, a: any) => s + a.metrics.roas, 0) / topImageAds.length, 1)}x ROAS`);
    }
    if (visualPatterns.length === 0) {
      visualPatterns.push('Show the product in action with lifestyle context');
      visualPatterns.push('Use brand colors and clean composition');
    }

    // Generate scenes based on format
    const scenes: { time: string; description: string }[] = [];
    if (isVideo) {
      scenes.push({ time: '0:00 - 0:03', description: `Hook: Bold ${tones[0]?.toLowerCase() || 'engaging'} opener targeting ${targetAudience}. Pattern interrupt to stop the scroll.` });
      scenes.push({ time: '0:03 - 0:07', description: `Problem: Show the pain point or desire that ${productFocus} solves. Build emotional connection.` });
      scenes.push({ time: '0:07 - 0:15', description: `Solution: Introduce ${productFocus} as the answer. Demonstrate key benefit with clear visuals.` });
      scenes.push({ time: '0:15 - 0:22', description: `Proof: Social proof, results, or before/after transformation. Build credibility.` });
      scenes.push({ time: '0:22 - 0:30', description: `CTA: Clear call-to-action with urgency. Direct response with offer or next step.` });
    } else {
      scenes.push({ time: 'Frame 1', description: `Single hero image: ${productFocus} in lifestyle context, targeting ${targetAudience}. Bold headline with ${tones.join('/')} tone. Clear value prop and CTA overlay.` });
    }

    // Build the hook script
    let hookScript = `"Wait — are you still ${targetAudience.toLowerCase().includes('women') ? 'doing this wrong' : 'missing out on this'}?"`;
    if (benchmarks.avgRoas > 0) {
      hookScript += ` (Based on hooks from ads achieving ${benchmarks.topRoas}x ROAS in your account)`;
    }

    // Build CTA with performance context
    let cta = `Shop ${productFocus} Now`;
    if (benchmarks.avgCpa > 0) {
      cta += ` — Target CPA: $${benchmarks.avgCpa} (current avg)`;
    }

    // Build the concept name
    const conceptName = `${productFocus} — ${tones[0] || 'Direct'} ${isVideo ? 'Video' : 'Static'} for ${targetAudience}`;

    // Build audio direction
    let audioDirection = `${tones.join(', ')} tone. `;
    if (isVideo) {
      audioDirection += 'Upbeat background music that matches brand energy. Clear voiceover with confident pacing.';
    } else {
      audioDirection += 'N/A (static image).';
    }

    // Generate variations
    const variations = [
      { id: `var_${Date.now()}_1`, format: isVideo ? 'Video (16:9)' : 'Image (1:1)', name: `${conceptName} — Hero`, approved: false },
      { id: `var_${Date.now()}_2`, format: isVideo ? 'Video (9:16)' : 'Image (9:16)', name: `${conceptName} — Story`, approved: false },
      { id: `var_${Date.now()}_3`, format: isVideo ? 'Video (1:1)' : 'Image (4:5)', name: `${conceptName} — Feed`, approved: false },
    ];

    // If we have performance data, add a "winner variant" note
    if (topPerformers.length > 0) {
      variations.push({
        id: `var_${Date.now()}_4`,
        format: topPerformers[0].object_type === 'VIDEO' ? 'Video (Remix)' : 'Image (Remix)',
        name: `Remix of "${topPerformers[0].name}" — ${topPerformers[0].metrics.roas}x ROAS winner`,
        approved: false,
      });
    }

    const brief = {
      conceptName,
      hookDna: hookPatterns.join(' | '),
      visualDna: visualPatterns.join(' | '),
      hookScript,
      scenes,
      audioDirection,
      cta,
      // Extra context for the frontend
      benchmarks: benchmarks.avgRoas > 0 ? benchmarks : undefined,
      baseCreativeInsight: baseCreativeInsight ? {
        name: baseCreativeInsight.name,
        roas: baseCreativeInsight.metrics.roas,
        ctr: baseCreativeInsight.metrics.ctr,
        spend: baseCreativeInsight.metrics.spend,
      } : undefined,
      topPerformers: topPerformers.slice(0, 3).map((a: any) => ({
        name: a.name,
        roas: a.metrics.roas,
        ctr: a.metrics.ctr,
        type: a.object_type,
      })),
    };

    return { success: true, brief, variations };
  });
}
