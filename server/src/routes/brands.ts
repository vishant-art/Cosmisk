import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import type { MetaTokenRow } from '../types/index.js';

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

      const db = getDb();
      const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;

      if (!row) {
        return { brands: [] };
      }

      const token = decryptToken(row.encrypted_access_token);
      const meta = new MetaApiService(token);

      const accounts = await meta.getAllPages<any>('/me/adaccounts', {
        fields: 'business_name,account_status',
        limit: '500',
      });

      // Group by business_name
      const brandMap = new Map<string, { count: number; statuses: string[] }>();
      for (const acc of accounts) {
        const name = acc.business_name || 'Unknown';
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
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
