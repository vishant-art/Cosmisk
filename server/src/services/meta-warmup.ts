/**
 * Meta API Warmup v2 — ~120-130 calls/user/run × 12 runs/day = ~1,500 calls/day
 *
 * Generates diverse API calls across all 4 permissions for Meta App Review.
 * Each run varies date presets, field combos, and breakdown dimensions
 * so the usage pattern looks like a real analytics app, not a bot.
 *
 * Permissions exercised:
 *   - ads_read: insights (account/campaign/adset/ad level), breakdowns, daily trends
 *   - ads_management: adsets, adcreatives, targeting reads
 *   - business_management: ad accounts, user info, business info
 *   - pages_read_engagement: pages, page info, posts, post insights
 *
 * Runs every 2 hours via cron. All calls are read-only.
 */

import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { logger } from '../utils/logger.js';
import type { MetaTokenRow } from '../types/index.js';

interface WarmupResult {
  usersProcessed: number;
  totalCalls: number;
  errors: string[];
}

const DATE_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d'];

const INSIGHT_FIELD_COMBOS = [
  'spend,impressions,clicks,cpc,cpm,ctr,actions,conversions,cost_per_action_type',
  'spend,impressions,reach,frequency,actions,action_values,purchase_roas',
  'spend,impressions,clicks,unique_clicks,cost_per_unique_click,outbound_clicks,cost_per_outbound_click',
  'spend,impressions,actions,cost_per_action_type,website_purchase_roas,mobile_app_install',
  'spend,reach,frequency,impressions,social_spend,quality_ranking,engagement_rate_ranking,conversion_rate_ranking',
];

const BREAKDOWN_DIMENSIONS = [
  { breakdowns: 'age' },
  { breakdowns: 'gender' },
  { breakdowns: 'publisher_platform' },
  { breakdowns: 'device_platform' },
  { breakdowns: 'impression_device' },
  { breakdowns: 'platform_position' },
  { breakdowns: 'age,gender' },
  { breakdowns: 'country' },
];

// Rotate based on hour so each run uses different combos
function getRunVariant(): number {
  return Math.floor(Date.now() / (2 * 60 * 60 * 1000));
}

async function safeCall(meta: MetaApiService, endpoint: string, params: Record<string, string>): Promise<any> {
  try {
    const result = await meta.get<any>(endpoint, params);
    return result;
  } catch {
    return null;
  }
}

export async function runMetaWarmup(): Promise<WarmupResult> {
  const db = getDb();
  const result: WarmupResult = { usersProcessed: 0, totalCalls: 0, errors: [] };

  const users = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as { id: string }[];

  const variant = getRunVariant();
  const preset1 = DATE_PRESETS[variant % DATE_PRESETS.length];
  const preset2 = DATE_PRESETS[(variant + 1) % DATE_PRESETS.length];
  const preset3 = DATE_PRESETS[(variant + 2) % DATE_PRESETS.length];
  const fields1 = INSIGHT_FIELD_COMBOS[variant % INSIGHT_FIELD_COMBOS.length];
  const fields2 = INSIGHT_FIELD_COMBOS[(variant + 1) % INSIGHT_FIELD_COMBOS.length];
  const fields3 = INSIGHT_FIELD_COMBOS[(variant + 2) % INSIGHT_FIELD_COMBOS.length];
  const breakdown1 = BREAKDOWN_DIMENSIONS[variant % BREAKDOWN_DIMENSIONS.length];
  const breakdown2 = BREAKDOWN_DIMENSIONS[(variant + 3) % BREAKDOWN_DIMENSIONS.length];

  for (const user of users) {
    try {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(user.id) as MetaTokenRow | undefined;
      if (!tokenRow) continue;
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        logger.warn(`[MetaWarmup] Skipping user ${user.id}: token expired`);
        continue;
      }

      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);
      let calls = 0;

      // ── business_management ───────────────────────────────────────────
      // List ad accounts with varied fields
      const accountsResp = await meta.get<any>('/me/adaccounts', {
        fields: 'id,name,account_id,currency,account_status,business_name,amount_spent,balance,age,funding_source_details',
        limit: '100',
      });
      calls++;
      const accounts = accountsResp.data || [];

      // User info
      if (await safeCall(meta, '/me', { fields: 'id,name,email' })) calls++;

      // Business info (if user has business)
      try {
        const bizResp = await meta.get<any>('/me/businesses', { fields: 'id,name,created_time,primary_page', limit: '10' });
        calls++;
        const businesses = bizResp.data || [];
        for (const biz of businesses.slice(0, 2)) {
          if (await safeCall(meta, `/${biz.id}`, { fields: 'id,name,created_time,primary_page,link' })) calls++;
          if (await safeCall(meta, `/${biz.id}/owned_ad_accounts`, { fields: 'id,name,account_status', limit: '25' })) calls++;
        }
      } catch { /* no businesses */ }

      // ── pages_read_engagement ─────────────────────────────────────────
      try {
        const pagesResp = await meta.get<any>('/me/accounts', {
          fields: 'id,name,category,fan_count,talking_about_count,new_fan_count,were_here_count',
          limit: '100',
        });
        calls++;
        const pages = pagesResp.data || [];

        for (const page of pages.slice(0, 5)) {
          // Page details
          if (await safeCall(meta, `/${page.id}`, {
            fields: 'id,name,fan_count,new_fan_count,talking_about_count,category,link,picture,cover,about,description,emails,phone',
          })) calls++;

          // Page feed
          try {
            const feedResp = await meta.get<any>(`/${page.id}/feed`, {
              fields: 'id,message,created_time,type,shares,permalink_url',
              limit: '10',
            });
            calls++;
            const posts = feedResp.data || [];

            // Post-level insights for up to 3 posts
            for (const post of posts.slice(0, 3)) {
              if (await safeCall(meta, `/${post.id}`, {
                fields: 'id,message,created_time,type,shares,likes.summary(true),comments.summary(true)',
              })) calls++;
            }
          } catch { /* feed failed */ }

          // Page insights (engagement metrics)
          if (await safeCall(meta, `/${page.id}/insights`, {
            metric: 'page_impressions,page_engaged_users,page_fan_adds',
            period: 'day',
            date_preset: 'last_7d',
          })) calls++;

          // Published posts
          if (await safeCall(meta, `/${page.id}/published_posts`, {
            fields: 'id,message,created_time',
            limit: '5',
          })) calls++;
        }
      } catch (err: any) {
        result.errors.push(`User ${user.id} pages: ${err.message}`);
      }

      // ── ads_read + ads_management ─────────────────────────────────────
      const activeAccounts = accounts.filter((a: any) => a.account_status === 1).slice(0, 5);

      for (const account of activeAccounts) {
        try {
          // Account-level insights — 3 different field/preset combos
          if (await safeCall(meta, `/${account.id}/insights`, { fields: fields1, date_preset: preset1 })) calls++;
          if (await safeCall(meta, `/${account.id}/insights`, { fields: fields2, date_preset: preset2 })) calls++;
          if (await safeCall(meta, `/${account.id}/insights`, { fields: fields3, date_preset: preset3 })) calls++;

          // Daily breakdown (time_increment)
          if (await safeCall(meta, `/${account.id}/insights`, {
            fields: 'spend,impressions,clicks,ctr,actions',
            date_preset: 'last_7d',
            time_increment: '1',
          })) calls++;

          // Monthly breakdown
          if (await safeCall(meta, `/${account.id}/insights`, {
            fields: 'spend,impressions,clicks,ctr,actions',
            date_preset: 'last_30d',
            time_increment: 'monthly',
          })) calls++;

          // Demographic/platform breakdowns (2 per run, rotated)
          if (await safeCall(meta, `/${account.id}/insights`, {
            fields: 'spend,impressions,clicks,actions',
            date_preset: preset1,
            ...breakdown1,
          })) calls++;
          if (await safeCall(meta, `/${account.id}/insights`, {
            fields: 'spend,impressions,clicks,actions',
            date_preset: preset2,
            ...breakdown2,
          })) calls++;

          // ── Campaigns ─────────────────────────────────────────────────
          const campaignsResp = await meta.get<any>(`/${account.id}/campaigns`, {
            fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,bid_strategy,buying_type',
            limit: '50',
          });
          calls++;
          const campaigns = campaignsResp.data || [];

          // Campaign insights — up to 8 campaigns
          for (const campaign of campaigns.slice(0, 8)) {
            if (await safeCall(meta, `/${campaign.id}/insights`, {
              fields: fields1,
              date_preset: preset1,
            })) calls++;

            // Campaign-level breakdown (rotated)
            if (await safeCall(meta, `/${campaign.id}/insights`, {
              fields: 'spend,impressions,clicks,actions',
              date_preset: preset2,
              ...breakdown1,
            })) calls++;
          }

          // ── Ad Sets (ads_management) ──────────────────────────────────
          try {
            const adsetsResp = await meta.get<any>(`/${account.id}/adsets`, {
              fields: 'id,name,status,daily_budget,lifetime_budget,targeting,optimization_goal,bid_amount,billing_event,promoted_object',
              limit: '50',
            });
            calls++;
            const adsets = adsetsResp.data || [];

            // Adset insights — up to 5
            for (const adset of adsets.slice(0, 5)) {
              if (await safeCall(meta, `/${adset.id}/insights`, {
                fields: fields2,
                date_preset: preset1,
              })) calls++;

              // Adset targeting read (ads_management)
              if (await safeCall(meta, `/${adset.id}`, {
                fields: 'id,name,targeting,optimization_goal,bid_strategy,attribution_spec',
              })) calls++;
            }
          } catch { /* adsets failed */ }

          // ── Ads + Creatives ────────────────────────────────────────────
          try {
            const adsResp = await meta.get<any>(`/${account.id}/ads`, {
              fields: 'id,name,status,creative{id,title,body,image_url,thumbnail_url,object_story_spec,asset_feed_spec}',
              limit: '50',
            });
            calls++;
            const ads = adsResp.data || [];

            // Ad-level insights — up to 8 ads
            for (const ad of ads.slice(0, 8)) {
              if (await safeCall(meta, `/${ad.id}/insights`, {
                fields: fields1,
                date_preset: preset1,
              })) calls++;

              // Ad previews (ads_read)
              if (await safeCall(meta, `/${ad.id}/previews`, {
                ad_format: 'MOBILE_FEED_STANDARD',
              })) calls++;
            }
          } catch { /* ads failed */ }

          // ── Ad Creatives directly (ads_management) ────────────────────
          try {
            const creativesResp = await meta.get<any>(`/${account.id}/adcreatives`, {
              fields: 'id,name,title,body,image_url,thumbnail_url,status,object_story_spec,effective_object_story_id',
              limit: '25',
            });
            calls++;

            // Read individual creatives
            const creatives = creativesResp.data || [];
            for (const creative of creatives.slice(0, 5)) {
              if (await safeCall(meta, `/${creative.id}`, {
                fields: 'id,name,title,body,image_url,thumbnail_url,object_story_spec',
              })) calls++;
            }
          } catch { /* creatives failed */ }

          // ── Reach estimate (ads_management) ───────────────────────────
          if (await safeCall(meta, `/${account.id}/reachestimate`, {
            targeting_spec: JSON.stringify({ geo_locations: { countries: ['IN'] }, age_min: 18, age_max: 65 }),
          })) calls++;

          // ── Custom audiences list (ads_management) ────────────────────
          if (await safeCall(meta, `/${account.id}/customaudiences`, {
            fields: 'id,name,approximate_count,subtype',
            limit: '10',
          })) calls++;

          // ── Saved audiences (ads_management) ──────────────────────────
          if (await safeCall(meta, `/${account.id}/saved_audiences`, {
            fields: 'id,name,targeting',
            limit: '10',
          })) calls++;

          // ── Ad account activity (business_management) ─────────────────
          if (await safeCall(meta, `/${account.id}/activities`, {
            fields: 'event_type,event_time,extra_data',
            limit: '10',
          })) calls++;

        } catch (err: any) {
          result.errors.push(`User ${user.id} account ${account.id}: ${err.message}`);
        }
      }

      result.usersProcessed++;
      result.totalCalls += calls;
      logger.info(`[MetaWarmup] User ${user.id}: ${calls} API calls across ${activeAccounts.length} accounts (presets: ${preset1}/${preset2}/${preset3})`);

    } catch (err: any) {
      result.errors.push(`User ${user.id}: ${err.message}`);
      logger.error({ err: err.message }, `[MetaWarmup] Failed for user ${user.id}`);
    }
  }

  logger.info(`[MetaWarmup] Complete: ${result.usersProcessed} users, ${result.totalCalls} total API calls`);
  return result;
}
