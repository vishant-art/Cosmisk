import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseChartData, parseInsightMetrics } from '../services/insights-parser.js';
import type { MetaTokenRow, InsightItem } from '../types/index.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export async function dashboardRoutes(app: FastifyInstance) {

  // GET /dashboard/chart
  app.get('/chart', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, date_preset = 'last_7d' } = request.query as {
      account_id: string; credential_group?: string; date_preset?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, chart: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      const data = await meta.get<any>(`/${account_id}/insights`, {
        fields: 'spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
        time_increment: '1',
        date_preset,
        level: 'account',
      });

      const chart = parseChartData(data.data || []);
      return { success: true, chart };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /dashboard/insights
  app.get('/insights', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id } = request.query as {
      account_id: string; credential_group?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, insights: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Get recent performance data
      const [last7, last14] = await Promise.all([
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_7d',
          level: 'account',
        }),
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_14d',
          level: 'account',
        }),
      ]);

      const curr = parseInsightMetrics(last7.data?.[0] || {});
      const prev = parseInsightMetrics(last14.data?.[0] || {});

      const insights: InsightItem[] = [];
      const now = new Date().toISOString();

      // Generate rule-based insights
      if (curr.roas > 0 && curr.roas < 1) {
        insights.push({
          id: 'low-roas',
          priority: 'high',
          title: 'ROAS Below Breakeven',
          description: `Your ROAS is ${curr.roas.toFixed(2)}x — you're spending more than you're earning. Consider pausing low-performing campaigns.`,
          actionLabel: 'View Campaigns',
          actionRoute: '/analytics',
          createdAt: now,
        });
      }

      if (curr.ctr < 1 && curr.impressions > 1000) {
        insights.push({
          id: 'low-ctr',
          priority: 'medium',
          title: 'Low Click-Through Rate',
          description: `CTR is ${curr.ctr.toFixed(2)}% — below the 1% benchmark. Your creatives may need refreshing.`,
          actionLabel: 'View Creatives',
          actionRoute: '/creative-cockpit',
          createdAt: now,
        });
      }

      if (curr.spend > 0 && prev.spend > 0) {
        const spendChange = ((curr.spend - prev.spend) / prev.spend) * 100;
        if (spendChange > 30) {
          insights.push({
            id: 'spend-spike',
            priority: 'high',
            title: 'Spend Increased Significantly',
            description: `Spend increased by ${spendChange.toFixed(0)}% vs previous period. Verify this is intentional.`,
            actionLabel: 'Review Budget',
            actionRoute: '/analytics',
            createdAt: now,
          });
        }
      }

      if (curr.roas >= 3) {
        insights.push({
          id: 'high-roas',
          priority: 'low',
          title: 'Strong ROAS Performance',
          description: `Your ROAS of ${curr.roas.toFixed(2)}x is excellent. Consider scaling your top-performing campaigns.`,
          actionLabel: 'Scale Winners',
          actionRoute: '/analytics',
          createdAt: now,
        });
      }

      if (curr.conversions === 0 && curr.spend > 50) {
        insights.push({
          id: 'no-conversions',
          priority: 'high',
          title: 'No Conversions Recorded',
          description: `You've spent $${curr.spend.toFixed(2)} with zero conversions. Check your pixel setup and targeting.`,
          actionLabel: 'Check Setup',
          actionRoute: '/settings',
          createdAt: now,
        });
      }

      // Always return at least one insight
      if (insights.length === 0) {
        insights.push({
          id: 'performance-stable',
          priority: 'low',
          title: 'Performance is Stable',
          description: 'Your ad account metrics are within normal ranges. Keep monitoring for opportunities.',
          actionLabel: 'View Dashboard',
          actionRoute: '/dashboard',
          createdAt: now,
        });
      }

      return { success: true, insights };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /dashboard/kpis (UGC dashboard variant — returns project/concept/script counts)
  app.get('/kpis', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const db = getDb();
      const userId = request.user.id;

      const projectTotal = (db.prepare('SELECT COUNT(*) as c FROM ugc_projects WHERE user_id = ?').get(userId) as any)?.c || 0;
      const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM ugc_projects WHERE user_id = ? GROUP BY status').all(userId) as any[];

      const conceptTotal = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ?`).get(userId) as any)?.c || 0;
      const conceptApproved = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ? AND c.status = 'approved'`).get(userId) as any)?.c || 0;
      const conceptPending = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ? AND c.status = 'pending'`).get(userId) as any)?.c || 0;
      const conceptRejected = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ? AND c.status = 'rejected'`).get(userId) as any)?.c || 0;

      const scriptTotal = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ?`).get(userId) as any)?.c || 0;
      const scriptDelivered = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ? AND s.status = 'delivered'`).get(userId) as any)?.c || 0;
      const scriptReview = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ? AND s.status = 'in_review'`).get(userId) as any)?.c || 0;
      const scriptDraft = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ? AND s.status = 'draft'`).get(userId) as any)?.c || 0;

      const statusMap: Record<string, number> = {};
      for (const s of byStatus) statusMap[s.status] = s.c;

      return {
        projects: { total: projectTotal, by_status: statusMap },
        concepts: { total: conceptTotal, approved: conceptApproved, pending: conceptPending, rejected: conceptRejected },
        scripts: { total: scriptTotal, delivered: scriptDelivered, in_review: scriptReview, draft: scriptDraft },
        recent_projects: [],
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
