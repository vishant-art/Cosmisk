import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import type { MetaTokenRow } from '../types/index.js';
import { validate, directorBriefSchema, directorLaunchSchema, directorUpdateStatusSchema } from '../validation/schemas.js';
import { logger } from '../utils/logger.js';

/** Shape of the targeting config passed in a director launch request */
interface TargetingConfig {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: { countries: string[] };
  interests?: Array<{ id: string; name: string }>;
}

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
    const body = validate(directorBriefSchema, request.body, reply);
    if (!body) return;

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
            } catch (err: any) {
              logger.warn({ creativeId: body.base_creative, error: err?.message }, 'Failed to fetch base creative insight');
            }
          }
        }
      } catch (err: any) {
        logger.warn({ accountId: body.account_id, error: err?.message }, 'Meta performance data unavailable for brief generation');
      }
    }

    // Determine top performers for hook/visual DNA inspiration
    const topPerformers = topAdsData.slice(0, 5);
    const topVideoAds = topPerformers.filter((a: any) => a.object_type === 'VIDEO');
    const topImageAds = topPerformers.filter((a: any) => a.object_type !== 'VIDEO');
    const hasData = topAdsData.length > 0;
    const bestAd = topPerformers[0];
    const bestCtrAd = [...topAdsData].sort((a: any, b: any) => b.metrics.ctr - a.metrics.ctr)[0];

    // ---- Hook DNA: specific, not generic ----
    const hookPatterns: string[] = [];
    if (baseCreativeInsight && baseCreativeInsight.metrics.roas >= benchmarks.avgRoas) {
      hookPatterns.push(`Iterate on "${baseCreativeInsight.name}" (${baseCreativeInsight.metrics.roas}x ROAS)`);
    }
    if (bestAd) {
      hookPatterns.push(`"${bestAd.name}" pattern — ${bestAd.metrics.roas}x ROAS, ${bestAd.metrics.ctr}% CTR`);
    }
    if (bestCtrAd && bestCtrAd !== bestAd) {
      hookPatterns.push(`"${bestCtrAd.name}" engagement style — ${bestCtrAd.metrics.ctr}% CTR`);
    }
    if (hookPatterns.length === 0) {
      hookPatterns.push('Pattern interrupt + curiosity gap');
      hookPatterns.push('Problem-agitation opener');
    }

    // ---- Visual DNA ----
    const visualPatterns: string[] = [];
    if (topVideoAds.length > 0) {
      const vidAvgRoas = round(topVideoAds.reduce((s: number, a: any) => s + a.metrics.roas, 0) / topVideoAds.length, 1);
      visualPatterns.push(`Video converts at ${vidAvgRoas}x ROAS`);
    }
    if (topImageAds.length > 0) {
      const imgAvgRoas = round(topImageAds.reduce((s: number, a: any) => s + a.metrics.roas, 0) / topImageAds.length, 1);
      visualPatterns.push(`Static converts at ${imgAvgRoas}x ROAS`);
    }
    if (visualPatterns.length === 0) {
      visualPatterns.push(isVideo ? 'UGC-first visual language' : 'Product hero with lifestyle context');
    }

    // ---- Hook Script: context-aware, not template ----
    const hookBank = [
      // Data-backed hooks
      ...(hasData ? [
        `I tried every ${productFocus.toLowerCase() || 'option'} out there. This is the only one that actually worked.`,
        `${benchmarks.topRoas > 3 ? 'Everyone is asking me about this — ' : ''}here's the honest truth about ${productFocus || 'this product'}.`,
        `POV: You finally found a ${productFocus.toLowerCase() || 'product'} that actually delivers on its promises.`,
      ] : []),
      // Tone-adapted hooks
      ...(tones.includes('Urgent') ? [`Stop scrolling — this ${productFocus.toLowerCase() || 'deal'} won't last.`] : []),
      ...(tones.includes('Educational') ? [`The #1 mistake people make with ${productFocus.toLowerCase() || 'this'} — and how to fix it.`] : []),
      ...(tones.includes('Bold') ? [`${productFocus || 'This'} is about to change your life. No, seriously.`] : []),
      ...(tones.includes('Aspirational') ? [`What if your ${productFocus.toLowerCase() || 'routine'} actually worked the way you imagined?`] : []),
      ...(tones.includes('Playful') ? [`Okay but why did no one tell me about ${productFocus.toLowerCase() || 'this'} sooner??`] : []),
      ...(tones.includes('Emotional') ? [`I wish someone had shown me this ${productFocus.toLowerCase() || 'product'} a year ago.`] : []),
      ...(tones.includes('Premium') ? [`There's a reason ${productFocus || 'this brand'} is different from everything else.`] : []),
      ...(tones.includes('Conversational') ? [`Can we talk about ${productFocus.toLowerCase() || 'this'} for a second? Because wow.`] : []),
      // Audience-aware hooks
      ...(targetAudience ? [`${targetAudience} — this one's for you.`] : []),
    ];
    // Pick the best hook (first data-backed one, or first tone-matched one)
    const hookScript = hookBank[0] || `Wait — you need to see what ${productFocus || 'this'} can do.`;

    // ---- Scenes: specific creative direction, not generic ----
    const scenes: { time: string; description: string }[] = [];
    if (isVideo) {
      scenes.push({
        time: '0:00 - 0:03',
        description: `HOOK: Creator looks directly at camera, mid-thought. "${hookScript}" — deliver with genuine energy, not scripted. Shoot in natural light, phone-in-hand selfie style.${bestCtrAd ? ` Mirror the energy of your ${bestCtrAd.metrics.ctr}% CTR winner.` : ''}`,
      });
      scenes.push({
        time: '0:03 - 0:08',
        description: `PROBLEM: ${targetAudience ? `Show a relatable ${targetAudience.toLowerCase()} moment` : 'Show the frustration'} — the failed alternatives, the wasted money, the disappointment. Quick cuts (1-2 sec each). Use real scenarios your customers experience.${productFocus ? ` Focus on the specific pain ${productFocus} solves.` : ''}`,
      });
      scenes.push({
        time: '0:08 - 0:18',
        description: `SOLUTION: Unboxing or first-use moment with ${productFocus || 'the product'}. Show texture, quality, the "aha" moment. Creator's genuine reaction. B-roll of product in use — hands, close-ups, lifestyle context. This is the money shot.${benchmarks.avgRoas > 2 ? ` Your ${benchmarks.avgRoas}x ROAS proves the product delivers — let the visuals prove it too.` : ''}`,
      });
      scenes.push({
        time: '0:18 - 0:24',
        description: `PROOF: Show real results — before/after, screenshots of reviews, DMs from happy customers, or the creator's own transformation. Flash 3-4 proof points in quick succession. Numbers > words.${hasData ? ` Reference: your top ad "${bestAd.name}" converts at ${bestAd.metrics.roas}x — that's proof of demand.` : ''}`,
      });
      scenes.push({
        time: '0:24 - 0:30',
        description: `CTA: Creator back on camera, direct and urgent. "Link in bio / tap below — they're running [specific offer] right now." End with product hero shot + brand logo. Add urgency: limited stock, time-limited discount, or exclusive bundle.`,
      });
    } else {
      scenes.push({
        time: 'Hero Frame',
        description: `${productFocus || 'Product'} as centerpiece — lifestyle setting that resonates with ${targetAudience || 'your audience'}. Bold headline above: "${hookScript.substring(0, 60)}". Clean background, product takes 60% of frame. Overlay: key benefit + star rating or review count. CTA button: clear, contrasting color.`,
      });
      if (tones.includes('Premium') || tones.includes('Aspirational')) {
        scenes.push({
          time: 'Detail Frame',
          description: `Close-up product detail shot — texture, ingredients, craftsmanship. Minimal text. Let the quality speak. Subtle brand elements.`,
        });
      }
    }

    // ---- CTA: specific to the context ----
    const ctaOptions = [
      productFocus ? `Shop ${productFocus} Now` : 'Shop Now',
      targetAudience ? `Made for ${targetAudience} — Get Yours` : 'Get Yours Today',
      tones.includes('Urgent') ? 'Limited Stock — Order Now' : '',
      tones.includes('Premium') ? `Experience ${productFocus || 'the Difference'}` : '',
    ].filter(Boolean);
    const cta = ctaOptions[0] || 'Shop Now';

    // ---- Concept name: descriptive, not generic ----
    const toneLabel = tones.length > 2 ? tones.slice(0, 2).join(' + ') : tones.join(' + ');
    const conceptName = [
      productFocus || 'Creative',
      '—',
      toneLabel || 'Direct',
      isVideo ? 'Video' : 'Static',
      targetAudience ? `for ${targetAudience}` : '',
      hasData ? `(${benchmarks.avgRoas}x ROAS baseline)` : '',
    ].filter(Boolean).join(' ');

    // ---- Audio direction: specific ----
    let audioDirection = '';
    if (isVideo) {
      const mood = tones.includes('Urgent') ? 'fast-paced, energetic' :
                   tones.includes('Premium') ? 'minimal, ambient' :
                   tones.includes('Playful') ? 'upbeat, fun' :
                   tones.includes('Emotional') ? 'soft piano, emotional build' :
                   'trending audio style, confident pacing';
      audioDirection = `Music: ${mood}. Voiceover: Natural, ${tones[0]?.toLowerCase() || 'confident'} tone — sounds like a real person, not a script. Match the creator to ${targetAudience || 'your core audience'} demographic. Subtitles mandatory (85% of viewers watch without sound).`;
    } else {
      audioDirection = 'N/A (static image).';
    }

    // ---- Variations: diverse, strategic ----
    const variations: { id: string; format: string; name: string; approved: boolean }[] = [];
    if (isVideo) {
      variations.push(
        { id: `var_${Date.now()}_1`, format: 'Video (9:16)', name: `Story/Reel — ${toneLabel} Hook — ${targetAudience || 'Broad'}`, approved: false },
        { id: `var_${Date.now()}_2`, format: 'Video (1:1)', name: `Feed — Problem/Solution Arc — ${targetAudience || 'Broad'}`, approved: false },
        { id: `var_${Date.now()}_3`, format: 'Video (16:9)', name: `In-Stream — Extended Proof Cut — ${targetAudience || 'Broad'}`, approved: false },
      );
    } else {
      variations.push(
        { id: `var_${Date.now()}_1`, format: 'Image (1:1)', name: `Feed — Hero Product Shot — ${targetAudience || 'Broad'}`, approved: false },
        { id: `var_${Date.now()}_2`, format: 'Image (9:16)', name: `Story — Bold Text Overlay — ${targetAudience || 'Broad'}`, approved: false },
        { id: `var_${Date.now()}_3`, format: 'Image (4:5)', name: `Carousel — Benefit Breakdown — ${targetAudience || 'Broad'}`, approved: false },
      );
    }
    // Winner remix if we have data
    if (bestAd) {
      variations.push({
        id: `var_${Date.now()}_4`,
        format: bestAd.object_type === 'VIDEO' ? 'Video (Remix)' : 'Image (Remix)',
        name: `Remix of "${bestAd.name}" — ${bestAd.metrics.roas}x ROAS winner`,
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

  /* ---------------------------------------------------------------- */
  /*  Auto-publish: Create campaign + ad set + ad on Meta              */
  /* ---------------------------------------------------------------- */

  // POST /director/auto-publish — create a full campaign on Meta
  app.post('/auto-publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = validate(directorLaunchSchema, request.body, reply);
    if (!body) return;

    if (!body.page_id) {
      return reply.status(400).send({ success: false, error: 'page_id is required to publish ads. Select a Facebook Page in Settings > Ad Accounts.' });
    }

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return reply.status(400).send({ success: false, error: 'Meta account not connected' });
    }

    const meta = new MetaApiService(token);
    const publishStatus = body.status || 'PAUSED';
    const targeting = (body.targeting || {}) as TargetingConfig;

    // Support both single creative and array of creatives
    const allCreatives: any[] = [];
    if (body.creatives?.length) {
      allCreatives.push(...body.creatives);
    } else if (body.creative) {
      allCreatives.push(body.creative);
    }

    try {
      // Step 1: Create Campaign
      const campaignResp = await safeFetch(`${config.graphApiBase}/${body.account_id}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          name: body.campaign_name,
          objective: body.objective || 'OUTCOME_SALES',
          status: publishStatus,
          special_ad_categories: [],
        }),
        service: 'Meta Marketing API',
      });

      if (!campaignResp.ok) {
        const err = await safeJson(campaignResp);
        throw new Error(err?.error?.message || 'Failed to create campaign');
      }

      const campaign = await safeJson(campaignResp);
      const campaignId = campaign.id;

      // Step 2: Create Ad Set
      const adSetResp = await safeFetch(`${config.graphApiBase}/${body.account_id}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          campaign_id: campaignId,
          name: `${body.campaign_name} — Ad Set`,
          optimization_goal: 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          daily_budget: body.daily_budget || 5000,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: {
            age_min: targeting.age_min || 18,
            age_max: targeting.age_max || 65,
            genders: targeting.genders || [],
            geo_locations: targeting.geo_locations || { countries: ['IN'] },
            ...(targeting.interests?.length ? { flexible_spec: [{ interests: targeting.interests }] } : {}),
          },
          status: publishStatus,
        }),
        service: 'Meta Marketing API',
      });

      if (!adSetResp.ok) {
        const err = await safeJson(adSetResp);
        throw new Error(err?.error?.message || 'Failed to create ad set');
      }

      const adSet = await safeJson(adSetResp);
      const adSetId = adSet.id;

      // Step 3: Create ad creatives + ads for each approved variation
      let published = 0;
      let failed = 0;
      const adIds: string[] = [];

      for (const creative of allCreatives) {
        try {
          const creativeResp = await safeFetch(`${config.graphApiBase}/${body.account_id}/adcreatives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: token,
              name: `${body.campaign_name} — Creative ${published + 1}`,
              object_story_spec: {
                page_id: body.page_id || '',
                link_data: {
                  link: creative.link_url,
                  message: creative.body,
                  name: creative.title,
                  ...(creative.image_url ? { image_url: creative.image_url } : {}),
                  call_to_action: {
                    type: creative.call_to_action_type || 'SHOP_NOW',
                  },
                },
              },
            }),
            service: 'Meta Marketing API',
          });

          if (!creativeResp.ok) { failed++; continue; }
          const creativeData = await safeJson(creativeResp);
          if (!creativeData?.id) { failed++; continue; }

          const adResp = await safeFetch(`${config.graphApiBase}/${body.account_id}/ads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: token,
              adset_id: adSetId,
              creative: { creative_id: creativeData.id },
              name: `${body.campaign_name} — Ad ${published + 1}`,
              status: publishStatus,
            }),
            service: 'Meta Marketing API',
          });

          if (adResp.ok) {
            const ad = await safeJson(adResp);
            if (ad?.id) adIds.push(ad.id);
            published++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      return {
        success: true,
        published: {
          campaign_id: campaignId,
          adset_id: adSetId,
          ad_ids: adIds,
          total_published: published,
          total_failed: failed,
          status: publishStatus,
        },
        message: publishStatus === 'PAUSED'
          ? `${published} ad${published !== 1 ? 's' : ''} created in PAUSED state. Review and activate when ready.`
          : `${published} ad${published !== 1 ? 's' : ''} now ACTIVE and delivering.`,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /director/update-status — pause/activate a campaign
  app.post('/update-status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(directorUpdateStatusSchema, request.body, reply);
    if (!parsed) return;
    const { campaign_id, status } = parsed;

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return reply.status(400).send({ success: false, error: 'Meta account not connected' });
    }

    try {
      const resp = await safeFetch(`${config.graphApiBase}/${campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, status }),
        service: 'Meta Marketing API',
      });

      if (!resp.ok) {
        const err = await safeJson(resp);
        throw new Error(err?.error?.message || 'Failed to update campaign status');
      }

      return { success: true, campaign_id, status };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
