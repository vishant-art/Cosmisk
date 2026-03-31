/**
 * Meta API Warmup — generates consistent daily API calls across all 4 permissions
 * to satisfy Meta App Review's "sufficient API usage" requirement.
 *
 * Permissions exercised:
 *   - ads_read: campaign insights, ad insights, ad creatives
 *   - ads_management: read campaign status (uses management endpoint)
 *   - business_management: list ad accounts, account info
 *   - pages_read_engagement: list pages, page info
 *
 * Runs daily via cron. All calls are read-only — no data is modified.
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

export async function runMetaWarmup(): Promise<WarmupResult> {
  const db = getDb();
  const result: WarmupResult = { usersProcessed: 0, totalCalls: 0, errors: [] };

  const users = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as { id: string }[];

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
        fields: 'id,name,account_id,currency,account_status,business_name',
        limit: '50',
      });
      calls++;
      const accounts = accountsResp.data || [];

      // --- pages_read_engagement: list pages ---
      try {
        const pagesResp = await meta.get<any>('/me/accounts', {
          fields: 'id,name,category,fan_count',
          limit: '50',
        });
        calls++;
        const pages = pagesResp.data || [];

        // Read insights for first page (if any)
        if (pages.length > 0) {
          try {
            await meta.get<any>(`/${pages[0].id}`, {
              fields: 'id,name,fan_count,new_fan_count,talking_about_count',
            });
            calls++;
          } catch { /* page read failed, non-critical */ }
        }
      } catch (err: any) {
        result.errors.push(`User ${user.id} pages: ${err.message}`);
      }

      // Process up to 3 ad accounts
      const activeAccounts = accounts.filter((a: any) => a.account_status === 1).slice(0, 3);

      for (const account of activeAccounts) {
        try {
          // --- ads_read: account-level insights (7 day) ---
          await meta.get<any>(`/${account.id}/insights`, {
            fields: 'spend,impressions,clicks,cpc,cpm,ctr,actions',
            date_preset: 'last_7d',
          });
          calls++;

          // --- ads_read: campaign list with status ---
          const campaignsResp = await meta.get<any>(`/${account.id}/campaigns`, {
            fields: 'id,name,status,objective,daily_budget,lifetime_budget',
            limit: '25',
          });
          calls++;
          const campaigns = campaignsResp.data || [];

          // --- ads_read: campaign insights for first 2 campaigns ---
          for (const campaign of campaigns.slice(0, 2)) {
            try {
              await meta.get<any>(`/${campaign.id}/insights`, {
                fields: 'spend,impressions,clicks,cpc,ctr,actions,cost_per_action_type',
                date_preset: 'last_7d',
              });
              calls++;
            } catch { /* individual campaign may have no data */ }
          }

          // --- ads_read: ad creatives ---
          try {
            const adsResp = await meta.get<any>(`/${account.id}/ads`, {
              fields: 'id,name,status,creative{id,title,body,image_url,thumbnail_url}',
              limit: '10',
            });
            calls++;

            // --- ads_read: ad-level insights for first 2 ads ---
            const ads = adsResp.data || [];
            for (const ad of ads.slice(0, 2)) {
              try {
                await meta.get<any>(`/${ad.id}/insights`, {
                  fields: 'spend,impressions,clicks,ctr,actions',
                  date_preset: 'last_7d',
                });
                calls++;
              } catch { /* ad may have no delivery */ }
            }
          } catch { /* ads fetch failed */ }

          // --- ads_management: read ad sets (uses management API) ---
          try {
            await meta.get<any>(`/${account.id}/adsets`, {
              fields: 'id,name,status,daily_budget,targeting,optimization_goal',
              limit: '10',
            });
            calls++;
          } catch { /* adsets read failed */ }

        } catch (err: any) {
          result.errors.push(`User ${user.id} account ${account.id}: ${err.message}`);
        }
      }

      result.usersProcessed++;
      result.totalCalls += calls;
      logger.info(`[MetaWarmup] User ${user.id}: ${calls} API calls across ${activeAccounts.length} accounts`);

    } catch (err: any) {
      result.errors.push(`User ${user.id}: ${err.message}`);
      logger.error({ err: err.message }, `[MetaWarmup] Failed for user ${user.id}`);
    }
  }

  logger.info(`[MetaWarmup] Complete: ${result.usersProcessed} users, ${result.totalCalls} total API calls`);
  return result;
}
