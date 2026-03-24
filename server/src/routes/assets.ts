import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import type { MetaTokenRow } from '../types/index.js';
import { validate, assetsQuerySchema, accountIdQuerySchema } from '../validation/schemas.js';

/* ------------------------------------------------------------------ */
/*  Helper: get user's decrypted Meta token                           */
/* ------------------------------------------------------------------ */
function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

/* ------------------------------------------------------------------ */
/*  Helper: estimate file size from thumbnail URL                     */
/* ------------------------------------------------------------------ */
function estimateSize(objectType: string): string {
  // Deterministic estimates based on format type
  if (objectType === 'VIDEO') return '15.0 MB';
  if (objectType === 'CAROUSEL') return '3.5 MB';
  return '1.5 MB';
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
export async function assetRoutes(app: FastifyInstance) {

  // GET /assets/list — Return user's ad creatives as asset files
  app.get('/list', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(assetsQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id, date_preset } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, files: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      const allAdsRaw = await meta.getAllPages<any>(`/${account_id}/ads`, {
        fields: 'id,name,creative{thumbnail_url,object_type},created_time,campaign{name}',
        limit: '100',
        filtering: JSON.stringify([
          { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
        ]),
      });

      const files = allAdsRaw.map((ad: any) => {
        const creative = ad.creative || {};
        const objectType = creative.object_type || 'IMAGE';
        const isVideo = objectType === 'VIDEO';
        const createdTime = ad.created_time || new Date().toISOString();
        const dateObj = new Date(createdTime);
        const dateStr = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

        // Determine file extension from object type
        const ext = isVideo ? '.mp4' : '.png';
        const rawName = ad.name || 'Unnamed Creative';
        const fileName = rawName.endsWith(ext) ? rawName : `${rawName}${ext}`;

        return {
          id: ad.id,
          name: fileName,
          type: isVideo ? 'video' : 'image',
          folder: ad.campaign?.name || 'Uncategorized',
          size: estimateSize(objectType),
          date: dateStr,
          thumbnail: creative.thumbnail_url || '',
          created_time: createdTime,
        };
      });

      // Sort by created_time descending (newest first)
      files.sort((a: any, b: any) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());

      return { success: true, files };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'assets/list failed');
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /assets/folders — Return folder structure based on campaign names
  app.get('/folders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountIdQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, folders: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Fetch campaigns to build folder structure
      const campaignsRaw = await meta.getAllPages<any>(`/${account_id}/campaigns`, {
        fields: 'id,name,status',
        limit: '200',
      });

      // Also fetch ads to count per campaign
      const adsRaw = await meta.getAllPages<any>(`/${account_id}/ads`, {
        fields: 'id,campaign{name}',
        limit: '200',
        filtering: JSON.stringify([
          { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
        ]),
      });

      // Count ads per campaign
      const campaignCounts = new Map<string, number>();
      let totalFiles = 0;
      for (const ad of adsRaw) {
        const campName = ad.campaign?.name || 'Uncategorized';
        campaignCounts.set(campName, (campaignCounts.get(campName) || 0) + 1);
        totalFiles++;
      }

      // Build folder list: "All Files" first, then campaign-based folders
      const folders: Array<{ name: string; icon: string; count: number }> = [
        { name: 'All Files', icon: 'folder-open', count: totalFiles },
      ];

      // Add campaign folders sorted by ad count
      const sortedCampaigns = Array.from(campaignCounts.entries())
        .sort((a, b) => b[1] - a[1]);

      for (const [name, count] of sortedCampaigns) {
        folders.push({
          name: name.length > 30 ? name.substring(0, 27) + '...' : name,
          icon: 'folder',
          count,
        });
      }

      return { success: true, folders };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'assets/folders failed');
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
