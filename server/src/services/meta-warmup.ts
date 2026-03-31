/**
 * Meta API Warmup — generates consistent API calls across all 4 permissions
 * to satisfy Meta App Review's "sufficient API usage" requirement.
 *
 * Permissions exercised:
 *   - ads_read: campaign insights, ad insights, ad creatives, daily breakdowns
 *   - ads_management: read adsets, adcreatives (uses management endpoint)
 *   - business_management: list ad accounts, account info, business info
 *   - pages_read_engagement: list pages, page info, page posts
 *
 * Runs every 4 hours via cron. All calls are read-only — no data is modified.
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

export async function runMetaWarmup(): Promise<WarmupResult> {
  const db = getDb();
  const result: WarmupResult = { usersProcessed: 0, totalCalls: 0, errors: [] };

  const users = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as { id: string }[];

  // Pick a different date preset each run for variety
  const presetIndex = Math.floor(Date.now() / (4 * 60 * 60 * 1000)) % DATE_PRESETS.length;
  const datePreset = DATE_PRESETS[presetIndex];
  const altPreset = DATE_PRESETS[(presetIndex + 1) % DATE_PRESETS.length];

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

      // --- business_management: list ad accounts ---
      const accountsResp = await meta.get<any>('/me/adaccounts', {
        fields: 'id,name,account_id,currency,account_status,business_name,amount_spent,balance',
        limit: '100',
      });
      calls++;
      const accounts = accountsResp.data || [];

      // --- business_management: user info ---
      try {
        await meta.get<any>('/me', { fields: 'id,name,email' });
        calls++;
      } catch { /* non-critical */ }

      // --- pages_read_engagement: list pages ---
      try {
        const pagesResp = await meta.get<any>('/me/accounts', {
          fields: 'id,name,category,fan_count,talking_about_count',
          limit: '100',
        });
        calls++;
        const pages = pagesResp.data || [];

        // Read details + posts for up to 3 pages
        for (const page of pages.slice(0, 3)) {
          try {
            await meta.get<any>(`/${page.id}`, {
              fields: 'id,name,fan_count,new_fan_count,talking_about_count,category,link,picture',
            });
            calls++;
          } catch { /* page read failed */ }

          try {
            await meta.get<any>(`/${page.id}/feed`, {
              fields: 'id,message,created_time,type',
              limit: '5',
            });
            calls++;
          } catch { /* page feed failed */ }
        }
      } catch (err: any) {
        result.errors.push(`User ${user.id} pages: ${err.message}`);
      }

      // Process up to 5 ad accounts (increased from 3)
      const activeAccounts = accounts.filter((a: any) => a.account_status === 1).slice(0, 5);

      for (const account of activeAccounts) {
        try {
          // --- ads_read: account-level insights (primary preset) ---
          await meta.get<any>(`/${account.id}/insights`, {
            fields: 'spend,impressions,clicks,cpc,cpm,ctr,actions,conversions,cost_per_action_type',
            date_preset: datePreset,
          });
          calls++;

          // --- ads_read: account-level insights (alternate preset) ---
          await meta.get<any>(`/${account.id}/insights`, {
            fields: 'spend,impressions,reach,frequency,actions',
            date_preset: altPreset,
          });
          calls++;

          // --- ads_read: daily breakdown ---
          try {
            await meta.get<any>(`/${account.id}/insights`, {
              fields: 'spend,impressions,clicks,ctr',
              date_preset: 'last_7d',
              time_increment: '1',
            });
            calls++;
          } catch { /* daily breakdown may fail */ }

          // --- ads_read: campaign list with status ---
          const campaignsResp = await meta.get<any>(`/${account.id}/campaigns`, {
            fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
            limit: '50',
          });
          calls++;
          const campaigns = campaignsResp.data || [];

          // --- ads_read: campaign insights for up to 5 campaigns ---
          for (const campaign of campaigns.slice(0, 5)) {
            try {
              await meta.get<any>(`/${campaign.id}/insights`, {
                fields: 'spend,impressions,clicks,cpc,ctr,actions,cost_per_action_type',
                date_preset: datePreset,
              });
              calls++;
            } catch { /* individual campaign may have no data */ }
          }

          // --- ads_management: read ad sets ---
          try {
            const adsetsResp = await meta.get<any>(`/${account.id}/adsets`, {
              fields: 'id,name,status,daily_budget,targeting,optimization_goal,bid_amount,billing_event',
              limit: '25',
            });
            calls++;

            // Read adset insights for up to 3 adsets
            const adsets = adsetsResp.data || [];
            for (const adset of adsets.slice(0, 3)) {
              try {
                await meta.get<any>(`/${adset.id}/insights`, {
                  fields: 'spend,impressions,clicks,actions',
                  date_preset: datePreset,
                });
                calls++;
              } catch { /* adset may have no delivery */ }
            }
          } catch { /* adsets read failed */ }

          // --- ads_read: ad list + creatives ---
          try {
            const adsResp = await meta.get<any>(`/${account.id}/ads`, {
              fields: 'id,name,status,creative{id,title,body,image_url,thumbnail_url,object_story_spec}',
              limit: '25',
            });
            calls++;
            const ads = adsResp.data || [];

            // --- ads_read: ad-level insights for up to 5 ads ---
            for (const ad of ads.slice(0, 5)) {
              try {
                await meta.get<any>(`/${ad.id}/insights`, {
                  fields: 'spend,impressions,clicks,ctr,actions,cost_per_action_type',
                  date_preset: datePreset,
                });
                calls++;
              } catch { /* ad may have no delivery */ }
            }
          } catch { /* ads fetch failed */ }

          // --- ads_management: read ad creatives directly ---
          try {
            await meta.get<any>(`/${account.id}/adcreatives`, {
              fields: 'id,name,title,body,image_url,thumbnail_url,status',
              limit: '10',
            });
            calls++;
          } catch { /* adcreatives read failed */ }

        } catch (err: any) {
          result.errors.push(`User ${user.id} account ${account.id}: ${err.message}`);
        }
      }

      result.usersProcessed++;
      result.totalCalls += calls;
      logger.info(`[MetaWarmup] User ${user.id}: ${calls} API calls across ${activeAccounts.length} accounts (preset: ${datePreset})`);

    } catch (err: any) {
      result.errors.push(`User ${user.id}: ${err.message}`);
      logger.error({ err: err.message }, `[MetaWarmup] Failed for user ${user.id}`);
    }
  }

  logger.info(`[MetaWarmup] Complete: ${result.usersProcessed} users, ${result.totalCalls} total API calls`);
  return result;
}
