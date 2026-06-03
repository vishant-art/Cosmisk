import { getDbAdapter } from '../../db/adapter.js';
import { decryptToken } from '../../services/token-crypto.js';
import { MetaApiService } from '../../services/meta-api.js';
import { parseInsightMetrics } from '../../services/insights-parser.js';
import { round, fmt, setCurrency } from '../../services/format-helpers.js';
import type { MetaTokenRow } from '../../types/index.js';
import { analyzeTopAdVisuals, buildVisualSummary, selectAdsForAnalysis } from '../../services/visual-analyzer.js';
import type { VideoDNA } from '../../services/creative-patterns.js';
import type { AnalyzedAd } from './types.js';

export async function getUserMetaToken(userId: string): Promise<string | null> {
  const db = getDbAdapter();
  const row = await db.get('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

/* ------------------------------------------------------------------ */
/*  Analyze account — build learn_snapshot from top performers          */
/* ------------------------------------------------------------------ */
export async function analyzeAccount(
  meta: MetaApiService,
  accountId: string,
  currency: string,
): Promise<{
  topAds: AnalyzedAd[];
  benchmarks: { avgRoas: number; avgCtr: number; avgCpa: number; avgSpend: number; totalSpend: number };
  formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }>;
  fatigueSignals: string[];
  visualAnalysis: Record<string, VideoDNA>;
  visualSummary: string;
}> {
  setCurrency(currency);

  // Fetch ads with insights
  const adsResp = await meta.get<any>(`/${accountId}/ads`, {
    fields: `id,name,creative{thumbnail_url,object_type,video_id},insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas},created_time`,
    limit: '100',
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
    ]),
  });

  const allAds = adsResp.data || [];
  const analyzedAds: AnalyzedAd[] = [];
  let totalSpend = 0;

  for (const ad of allAds) {
    const insight = ad.insights?.data?.[0];
    if (!insight) continue;
    const m = parseInsightMetrics(insight);
    if (m.spend < 1) continue;

    const daysActive = ad.created_time
      ? Math.max(1, Math.floor((Date.now() - new Date(ad.created_time).getTime()) / 86400000))
      : 30;

    totalSpend += m.spend;
    analyzedAds.push({
      id: ad.id,
      name: ad.name || 'Untitled',
      spend: round(m.spend, 2),
      roas: round(m.roas, 2),
      ctr: round(m.ctr, 2),
      cpa: round(m.cpa, 2),
      impressions: m.impressions,
      conversions: m.conversions,
      format: (ad.creative?.object_type || 'IMAGE').toLowerCase() === 'video' ? 'video' : 'image',
      thumbnail_url: ad.creative?.thumbnail_url || '',
      video_id: ad.creative?.video_id || null,
      days_active: daysActive,
    });
  }

  // Sort by ROAS descending
  analyzedAds.sort((a, b) => b.roas - a.roas);

  // Compute benchmarks
  const withSpend = analyzedAds.filter(a => a.spend > 0);
  const avgRoas = withSpend.length ? withSpend.reduce((s, a) => s + a.roas, 0) / withSpend.length : 0;
  const avgCtr = withSpend.length ? withSpend.reduce((s, a) => s + a.ctr, 0) / withSpend.length : 0;
  const avgCpa = withSpend.length ? withSpend.reduce((s, a) => s + a.cpa, 0) / withSpend.length : 0;
  const avgSpend = withSpend.length ? totalSpend / withSpend.length : 0;

  // Format breakdown
  const formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }> = {};
  for (const ad of analyzedAds) {
    if (!formatBreakdown[ad.format]) {
      formatBreakdown[ad.format] = { count: 0, avgRoas: 0, totalSpend: 0 };
    }
    formatBreakdown[ad.format].count++;
    formatBreakdown[ad.format].totalSpend += ad.spend;
  }
  for (const fmt of Object.keys(formatBreakdown)) {
    const fmtAds = analyzedAds.filter(a => a.format === fmt);
    formatBreakdown[fmt].avgRoas = round(fmtAds.reduce((s, a) => s + a.roas, 0) / fmtAds.length, 2);
  }

  // Fatigue signals
  const fatigueSignals: string[] = [];
  const recentAds = analyzedAds.filter(a => a.days_active < 14);
  if (recentAds.length < 3) {
    fatigueSignals.push(`Only ${recentAds.length} creatives launched in the last 14 days. Creative fatigue likely.`);
  }
  const highSpendDeclining = analyzedAds.filter(a => a.spend > avgSpend * 1.5 && a.roas < avgRoas * 0.7);
  for (const ad of highSpendDeclining.slice(0, 3)) {
    fatigueSignals.push(`"${ad.name}" has high spend (${fmt(ad.spend)}) but below-average ROAS (${ad.roas}x vs ${round(avgRoas, 2)}x avg).`);
  }

  // Visual analysis via Gemini Vision (non-blocking — empty on error/no key)
  // Selects top 5 ads with spend >= $50, ranked by ROAS * log(spend)
  const topForVisual = selectAdsForAnalysis(analyzedAds);
  const visualMap = await analyzeTopAdVisuals(topForVisual, accountId, meta);
  const visualAnalysis: Record<string, VideoDNA> = Object.fromEntries(visualMap);
  const visualSummary = buildVisualSummary(visualMap, topForVisual);

  return {
    topAds: analyzedAds.slice(0, 20),
    benchmarks: {
      avgRoas: round(avgRoas, 2),
      avgCtr: round(avgCtr, 2),
      avgCpa: round(avgCpa, 2),
      avgSpend: round(avgSpend, 2),
      totalSpend: round(totalSpend, 2),
    },
    formatBreakdown,
    fatigueSignals,
    visualAnalysis,
    visualSummary,
  };
}
