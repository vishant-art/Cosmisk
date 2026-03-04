import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown, parseAudienceBreakdown } from '../services/insights-parser.js';
import type { MetaTokenRow, ReportRow } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Helper: get user's decrypted Meta token                           */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Report templates                                                   */
/* ------------------------------------------------------------------ */
const REPORT_TEMPLATES = [
  {
    id: 'weekly-performance',
    name: 'Weekly Performance Summary',
    type: 'performance',
    description: 'Key metrics overview: ROAS, CPA, spend, revenue for the past week',
    sections: ['kpis', 'trends', 'top-campaigns'],
  },
  {
    id: 'creative-analysis',
    name: 'Creative Performance Report',
    type: 'creative',
    description: 'Top performing ads, creative fatigue analysis, format breakdown',
    sections: ['top-ads', 'format-analysis', 'recommendations'],
  },
  {
    id: 'audience-insights',
    name: 'Audience Breakdown Report',
    type: 'audience',
    description: 'Demographics, age/gender performance, audience segment analysis',
    sections: ['demographics', 'segments', 'targeting'],
  },
  {
    id: 'monthly-client',
    name: 'Monthly Client Report',
    type: 'full',
    description: 'Comprehensive monthly report with all metrics, suitable for client presentations',
    sections: ['kpis', 'trends', 'top-ads', 'demographics', 'recommendations'],
  },
  {
    id: 'roas-deep-dive',
    name: 'ROAS Deep Dive',
    type: 'performance',
    description: 'Detailed ROAS analysis by campaign, adset, and creative',
    sections: ['roas-by-campaign', 'roas-trends', 'top-performers'],
  },
];

/* ------------------------------------------------------------------ */
/*  Data-fetching helpers                                              */
/* ------------------------------------------------------------------ */
async function fetchPerformanceData(meta: MetaApiService, accountId: string, datePreset: string) {
  // Account-level KPIs
  const kpiData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
    date_preset: datePreset,
  });

  const kpiRow = kpiData.data?.[0] || {};
  const kpis = parseInsightMetrics(kpiRow);

  // Campaign breakdown
  const campaignData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
    level: 'campaign',
    date_preset: datePreset,
    limit: '100',
  });

  const campaigns = parseCampaignBreakdown(campaignData.data || []);

  return {
    kpis: {
      spend: round(kpis.spend, 2),
      revenue: round(kpis.revenue, 2),
      roas: round(kpis.roas, 2),
      cpa: round(kpis.cpa, 2),
      ctr: round(kpis.ctr, 2),
      impressions: kpis.impressions,
      clicks: kpis.clicks,
      conversions: kpis.conversions,
    },
    campaigns,
  };
}

async function fetchCreativeData(meta: MetaApiService, accountId: string, datePreset: string) {
  const adsData = await meta.get<any>(`/${accountId}/ads`, {
    fields: `id,name,creative{thumbnail_url,object_type},insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,actions,action_values,purchase_roas}`,
    limit: '20',
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
    ]),
  });

  const ads = (adsData.data || []).map((ad: any) => {
    const insight = ad.insights?.data?.[0] || {};
    const m = parseInsightMetrics(insight);
    const creative = ad.creative || {};
    return {
      id: ad.id,
      name: ad.name || 'Unnamed Ad',
      object_type: creative.object_type || 'IMAGE',
      thumbnail_url: creative.thumbnail_url || '',
      metrics: {
        spend: round(m.spend, 2),
        roas: round(m.roas, 2),
        cpa: round(m.cpa, 2),
        ctr: round(m.ctr, 2),
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
      },
    };
  });

  // Sort by spend descending to get top performers
  ads.sort((a: any, b: any) => b.metrics.spend - a.metrics.spend);

  return { top_ads: ads };
}

async function fetchAudienceData(meta: MetaApiService, accountId: string, datePreset: string) {
  const audienceData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
    breakdowns: 'age,gender',
    date_preset: datePreset,
    limit: '100',
  });

  const breakdown = parseAudienceBreakdown(audienceData.data || []);

  return { audience_breakdown: breakdown };
}

/* ------------------------------------------------------------------ */
/*  Ensure 'type' column exists (safe migration)                       */
/* ------------------------------------------------------------------ */
function ensureReportTypeColumn(): void {
  const db = getDb();
  // Check if 'type' column exists — if not, add it
  const tableInfo = db.prepare("PRAGMA table_info('reports')").all() as Array<{ name: string }>;
  const hasType = tableInfo.some(col => col.name === 'type');
  if (!hasType) {
    db.exec("ALTER TABLE reports ADD COLUMN type TEXT NOT NULL DEFAULT 'performance'");
  }
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
export async function reportRoutes(app: FastifyInstance) {
  // Run migration on startup
  ensureReportTypeColumn();

  // GET /reports/templates
  app.get('/templates', { preHandler: [app.authenticate] }, async () => {
    return { success: true, templates: REPORT_TEMPLATES };
  });

  // GET /reports/list
  app.get('/list', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const reports = db.prepare(
      'SELECT * FROM reports WHERE user_id = ? ORDER BY generated_at DESC'
    ).all(request.user.id) as ReportRow[];

    return {
      success: true,
      reports: reports.map(r => {
        const parsedData = r.data ? JSON.parse(r.data) : null;
        const dataSize = r.data ? Buffer.byteLength(r.data, 'utf-8') : 0;
        return {
          id: r.id,
          name: r.title,
          type: r.type || 'performance',
          dateRange: r.date_preset || 'last_7d',
          status: r.status,
          createdAt: r.generated_at,
          size: formatBytes(dataSize),
          data: parsedData,
        };
      }),
    };
  });

  // POST /reports/generate
  app.post('/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const {
      name,
      type = 'performance',
      date_range = 'last_7d',
      brand,
      sections,
      include_branding,
      include_ai_summary,
      account_id,
      credential_group,
    } = request.body as {
      name?: string;
      type?: string;
      date_range?: string;
      brand?: string;
      sections?: string[];
      include_branding?: boolean;
      include_ai_summary?: boolean;
      account_id?: string;
      credential_group?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id is required' });
    }

    const db = getDb();
    const id = uuidv4();
    const reportName = name || `${type.charAt(0).toUpperCase() + type.slice(1)} Report — ${new Date().toLocaleDateString()}`;

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: false, error: 'Meta account not connected', meta_connected: false });
      }
      const meta = new MetaApiService(token);

      let reportData: any = {
        type,
        date_range,
        account_id,
        brand: brand || null,
        sections: sections || [],
        include_branding: include_branding ?? false,
        include_ai_summary: include_ai_summary ?? false,
        generated_at: new Date().toISOString(),
      };

      // Fetch real data based on report type
      switch (type) {
        case 'performance': {
          const perfData = await fetchPerformanceData(meta, account_id, date_range);
          reportData = { ...reportData, ...perfData };
          break;
        }
        case 'creative': {
          const creativeData = await fetchCreativeData(meta, account_id, date_range);
          reportData = { ...reportData, ...creativeData };
          break;
        }
        case 'audience': {
          const audienceData = await fetchAudienceData(meta, account_id, date_range);
          reportData = { ...reportData, ...audienceData };
          break;
        }
        case 'full': {
          // Fetch all data types in parallel
          const [perfData, creativeData, audienceData] = await Promise.all([
            fetchPerformanceData(meta, account_id, date_range),
            fetchCreativeData(meta, account_id, date_range),
            fetchAudienceData(meta, account_id, date_range),
          ]);
          reportData = { ...reportData, ...perfData, ...creativeData, ...audienceData };
          break;
        }
        default: {
          // Default to performance
          const defaultData = await fetchPerformanceData(meta, account_id, date_range);
          reportData = { ...reportData, ...defaultData };
        }
      }

      const dataJson = JSON.stringify(reportData);
      const dataSize = formatBytes(Buffer.byteLength(dataJson, 'utf-8'));

      db.prepare(
        'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, request.user.id, reportName, type, account_id, date_range, 'Ready', dataJson);

      return { success: true, report_id: id, size: dataSize };
    } catch (err: any) {
      // Still save the report but mark as failed
      db.prepare(
        'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, request.user.id, reportName, type, account_id, date_range, 'Failed', JSON.stringify({ error: err.message }));

      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${round(value, 1)} ${units[i]}`;
}
