import type { FastifyInstance } from 'fastify';
import { getDbAdapter } from '../db/adapter.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import type { MetaTokenRow } from '../types/index.js';
import { internalError } from '../utils/error-response.js';

// In-memory cache for brands list (expires after 5 minutes)
const brandsCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function brandRoutes(app: FastifyInstance) {

  // GET /brands/list
  app.get('/list', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const userId = request.user.id;

      // Return cached data if fresh
      const cached = brandsCache.get(userId);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
      }

      const db = getDbAdapter();
      const row = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]);

      if (!row) {
        return { brands: [] };
      }

      // Get user's display name for fallback
      const userRow = await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]);
      const fallbackName = userRow?.name || 'Personal';

      const token = decryptToken(row.encrypted_access_token);
      const meta = new MetaApiService(token);

      const accounts = await meta.getAllPages<any>('/me/adaccounts', {
        fields: 'business_name,account_status',
        limit: '500',
      });

      // Group by business_name
      const brandMap = new Map<string, { count: number; statuses: string[] }>();
      for (const acc of accounts) {
        const name = acc.business_name || fallbackName;
        if (!brandMap.has(name)) {
          brandMap.set(name, { count: 0, statuses: [] });
        }
        const entry = brandMap.get(name)!;
        entry.count++;
        const status = acc.account_status === 1 ? 'active' : 'inactive';
        if (!entry.statuses.includes(status)) entry.statuses.push(status);
      }

      const brands = Array.from(brandMap.entries()).map(([name, data]) => ({
        brand_name: name,
        project_count: data.count,
        client_codes: [],
        latest_status: data.statuses.includes('active') ? 'active' : 'inactive',
      }));

      const result = { brands };
      brandsCache.set(userId, { data: result, ts: Date.now() });
      return result;
    } catch (err: any) {
      return internalError(reply, err, 'brands/list failed');
    }
  });
}
