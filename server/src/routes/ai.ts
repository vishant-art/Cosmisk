import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown, parseAudienceBreakdown } from '../services/insights-parser.js';
import type { MetaTokenRow } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
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

/** Currency symbol lookup */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥',
  AED: 'AED ', SGD: 'S$', MYR: 'RM', BRL: 'R$', ZAR: 'R', KRW: '₩', THB: '฿',
};
const CURRENCY_LOCALES: Record<string, string> = {
  INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP',
};

let _currency = 'USD';
function setCurrency(c: string) { _currency = c || 'USD'; }

function fmt(value: number): string {
  const sym = CURRENCY_SYMBOLS[_currency] || _currency + ' ';
  const locale = CURRENCY_LOCALES[_currency] || 'en-US';
  return `${sym}${round(value, 2).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(value: number): string {
  const locale = CURRENCY_LOCALES[_currency] || 'en-US';
  return round(value, 2).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(value: number): string {
  const locale = CURRENCY_LOCALES[_currency] || 'en-US';
  return value.toLocaleString(locale);
}

function avgVal(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas';

/* ------------------------------------------------------------------ */
/*  Response interfaces                                               */
/* ------------------------------------------------------------------ */

interface ChartItem { label: string; value: number }
interface AiChart { type: string; data: ChartItem[] }
interface AiTable { headers: string[]; rows: string[][] }
interface AiResponse { content: string; chart?: AiChart; table?: AiTable }

/* ------------------------------------------------------------------ */
/*  Intent detection                                                  */
/* ------------------------------------------------------------------ */

type Intent =
  | 'roas'
  | 'spend'
  | 'audience'
  | 'creative'
  | 'cpa'
  | 'forecast'
  | 'script'
  | 'help'
  | 'overview';

function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();

  // Help — always first
  if (lower.includes('help') || lower.includes('what can you do')) return 'help';

  // Overview — check before script to prevent "give me a full overview" matching script
  if (lower.includes('overview') || lower.includes('how is my account') || lower.includes('how am i doing') || lower.includes('account performance') || lower.includes('summary') || lower.includes('report') || lower.includes('how are my ads')) return 'overview';

  // Forecast
  if (lower.includes('predict') || lower.includes('forecast') || lower.includes('next week') || lower.includes('project')) return 'forecast';

  // Script / Ad Copy / Hooks — content generation
  if (lower.includes('script') || lower.includes('hook') || lower.includes('ad copy') || lower.includes('write me') || lower.includes('write a') || lower.includes('generate') || lower.includes('create a') || lower.includes('new ad') || lower.includes('brief') || lower.includes('give me') && (lower.includes('hook') || lower.includes('script') || lower.includes('copy') || lower.includes('ad') || lower.includes('new'))) return 'script';

  // Audience
  if (lower.includes('audience') || lower.includes('who') || lower.includes('demographic') || lower.includes('age') || lower.includes('gender') || lower.includes('segment')) return 'audience';

  // Creative performance
  if (lower.includes('creative') || lower.includes('which ads') || lower.includes('top ads') || lower.includes('best ads') || lower.includes('performing') && lower.includes('ads')) return 'creative';

  // CPA
  if (lower.includes('cpa') || lower.includes('cost per') || lower.includes('acquisition')) return 'cpa';

  // ROAS
  if (lower.includes('roas') || lower.includes('return on') || lower.includes('best performing') || lower.includes('best campaign')) return 'roas';

  // Spend
  if (lower.includes('spend') || lower.includes('budget') || lower.includes('spending') || lower.includes('where is my money')) return 'spend';

  return 'overview';
}

/* ------------------------------------------------------------------ */
/*  Intent handlers                                                   */
/* ------------------------------------------------------------------ */

async function handleRoas(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const sorted = [...campaigns].sort((a, b) => b.roas - a.roas);
  const top5 = sorted.slice(0, 5);
  const withSpend = campaigns.filter(c => c.spend > 0);
  const profitable = withSpend.filter(c => c.roas >= 1);
  const unprofitable = withSpend.filter(c => c.roas < 1);
  const totalSpend = withSpend.reduce((s, c) => s + c.spend, 0);

  let content = `**ROAS Performance Analysis**\n\n`;

  // Executive summary with strategic context
  if (acct.roas >= 3) {
    content += `Your account is performing exceptionally well at **${fmtNum(acct.roas)}x ROAS** — you're generating ${fmt(acct.revenue)} from ${fmt(acct.spend)} in spend. This puts you in a strong position to scale aggressively.\n\n`;
  } else if (acct.roas >= 2) {
    content += `Solid performance at **${fmtNum(acct.roas)}x ROAS** — ${fmt(acct.revenue)} revenue from ${fmt(acct.spend)} spend. There's room to push this higher by cutting underperformers and doubling down on winners.\n\n`;
  } else if (acct.roas >= 1) {
    content += `You're at **${fmtNum(acct.roas)}x ROAS** — barely profitable. ${fmt(acct.spend)} in spend is generating ${fmt(acct.revenue)} in revenue. We need to tighten up the portfolio before scaling.\n\n`;
  } else {
    content += `⚠️ **Attention needed.** Your account ROAS is **${fmtNum(acct.roas)}x** — you're spending ${fmt(acct.spend)} but only generating ${fmt(acct.revenue)}. Immediate action required to stop the bleed.\n\n`;
  }

  if (top5.length > 0) {
    // Winner analysis
    const best = top5[0];
    content += `**🏆 Your Winner: "${best.label}"**\n`;
    content += `This campaign is carrying your account at **${fmtNum(best.roas)}x ROAS** with ${fmt(best.spend)} spend and ${fmtInt(best.conversions)} conversions at ${fmt(best.cpa)} CPA.\n\n`;

    // Strategic recommendations
    content += `**📋 What I'd Do Next:**\n`;

    // Scale winners
    const scaleCandidates = sorted.filter(c => c.roas >= acct.roas * 1.2 && c.spend > 0);
    if (scaleCandidates.length > 0) {
      content += `1. **Scale your top ${scaleCandidates.length} campaign${scaleCandidates.length > 1 ? 's' : ''}** — ${scaleCandidates.map(c => `"${c.label}" (${fmtNum(c.roas)}x)`).join(', ')} ${scaleCandidates.length === 1 ? 'is' : 'are'} outperforming your average. Increase daily budget by 15-20% every 3 days and monitor for CPA creep.\n`;
    }

    // Cut losers
    if (unprofitable.length > 0) {
      const wastedSpend = unprofitable.reduce((s, c) => s + c.spend, 0);
      const pctWasted = totalSpend > 0 ? round((wastedSpend / totalSpend) * 100, 1) : 0;
      content += `2. **Cut or fix ${unprofitable.length} unprofitable campaign${unprofitable.length > 1 ? 's'  : ''}** — ${fmt(wastedSpend)} (${pctWasted}% of your budget) is going to sub-1x ROAS campaigns. Either pause them or restructure targeting/creatives.\n`;
    }

    // Efficiency gap
    if (best.roas > acct.roas * 1.5) {
      const gap = round(best.roas - acct.roas, 2);
      content += `3. **Close the ${fmtNum(gap)}x ROAS gap** between your best and average campaign. Your top campaign proves what's possible — replicate its audience targeting and creative angles across your other campaigns.\n`;
    }

    // Budget reallocation
    if (profitable.length > 0 && unprofitable.length > 0) {
      content += `4. **Reallocate budget** from underperformers to winners. If you shifted the ${fmt(unprofitable.reduce((s, c) => s + c.spend, 0))} from unprofitable campaigns into your top performers, your blended ROAS could improve significantly.\n`;
    }
  } else {
    content += 'No campaign-level data is available for this period.\n';
  }

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.roas, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'ROAS', 'Spend', 'CPA', 'CTR %', 'Conversions'],
    rows: top5.map(c => [
      c.label,
      `${fmtNum(c.roas)}x`,
      fmt(c.spend),
      fmt(c.cpa),
      fmtNum(c.ctr),
      fmtInt(c.conversions),
    ]),
  };

  return { content, chart, table };
}

async function handleSpend(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const top5 = sorted.slice(0, 5);
  const withSpend = campaigns.filter(c => c.spend > 0);
  const totalCampaignSpend = withSpend.reduce((s, c) => s + c.spend, 0);

  let content = `**Budget & Spend Breakdown**\n\n`;

  // Executive summary
  content += `You've invested **${fmt(acct.spend)}** this period, generating **${fmt(acct.revenue)}** in revenue at **${fmtNum(acct.roas)}x ROAS** with ${fmtInt(acct.conversions)} conversions.\n\n`;

  if (top5.length > 0) {
    // Concentration analysis
    const topSpender = top5[0];
    const topPct = totalCampaignSpend > 0 ? round((topSpender.spend / totalCampaignSpend) * 100, 1) : 0;
    const top3Pct = totalCampaignSpend > 0 ? round((top5.slice(0, 3).reduce((s, c) => s + c.spend, 0) / totalCampaignSpend) * 100, 1) : 0;

    content += `**💰 Where Your Money Is Going:**\n`;
    content += `Your top campaign "${topSpender.label}" is eating **${topPct}%** of your budget (${fmt(topSpender.spend)})`;
    if (topSpender.roas >= 2) {
      content += ` — and it's delivering at ${fmtNum(topSpender.roas)}x ROAS, so that concentration is justified.\n`;
    } else if (topSpender.roas >= 1) {
      content += ` — at ${fmtNum(topSpender.roas)}x ROAS, it's profitable but not exceptional for the amount of budget it's consuming.\n`;
    } else {
      content += ` — but at only ${fmtNum(topSpender.roas)}x ROAS, this is a problem. Your biggest spender isn't paying for itself.\n`;
    }

    if (top3Pct > 80) {
      content += `Your top 3 campaigns account for ${top3Pct}% of spend — high concentration. If any one of these dips, your whole account suffers. Consider diversifying.\n`;
    }
    content += `\n`;

    // Efficiency analysis
    const efficient = withSpend.filter(c => c.roas >= 2).sort((a, b) => b.roas - a.roas);
    const inefficient = withSpend.filter(c => c.roas < 1);
    const wastedSpend = inefficient.reduce((s, c) => s + c.spend, 0);

    content += `**📋 Budget Optimization Plan:**\n`;

    if (inefficient.length > 0) {
      const pctWasted = totalCampaignSpend > 0 ? round((wastedSpend / totalCampaignSpend) * 100, 1) : 0;
      content += `1. **Recover ${fmt(wastedSpend)} in wasted spend** (${pctWasted}% of budget) — ${inefficient.length} campaign${inefficient.length > 1 ? 's are' : ' is'} running below breakeven: ${inefficient.slice(0, 3).map(c => `"${c.label}" (${fmtNum(c.roas)}x)`).join(', ')}${inefficient.length > 3 ? ` and ${inefficient.length - 3} more` : ''}. Pause or restructure these immediately.\n`;
    }

    if (efficient.length > 0) {
      content += `2. **Double down on your ${efficient.length} winning campaign${efficient.length > 1 ? 's' : ''}** — ${efficient.slice(0, 3).map(c => `"${c.label}" (${fmtNum(c.roas)}x)`).join(', ')} ${efficient.length === 1 ? 'is' : 'are'} your most efficient. Redirect recovered budget here.\n`;
    }

    if (wastedSpend > 0 && efficient.length > 0) {
      const projectedNewRevenue = wastedSpend * efficient[0].roas;
      content += `3. **Projected impact**: Reallocating that ${fmt(wastedSpend)} to your top performer could generate an additional ~${fmt(projectedNewRevenue)} in revenue based on current performance.\n`;
    }

    // Per-campaign ROAS check
    const middleTier = withSpend.filter(c => c.roas >= 1 && c.roas < 2);
    if (middleTier.length > 0) {
      content += `4. **Test & optimize ${middleTier.length} mid-tier campaign${middleTier.length > 1 ? 's' : ''}** — these are profitable but not scaling-ready. Test new creatives or audiences to push them above 2x ROAS before increasing budget.\n`;
    }
  }

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.spend, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'Spend', '% of Total', 'Revenue', 'ROAS', 'CPA'],
    rows: top5.map(c => {
      const rev = c.spend * c.roas;
      const pct = totalCampaignSpend > 0 ? round((c.spend / totalCampaignSpend) * 100, 1) : 0;
      return [
        c.label,
        fmt(c.spend),
        `${pct}%`,
        fmt(rev),
        `${fmtNum(c.roas)}x`,
        fmt(c.cpa),
      ];
    }),
  };

  return { content, chart, table };
}

async function handleAudience(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const audienceData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
    breakdowns: 'age,gender',
    date_preset: datePreset,
    limit: '100',
  });

  const segments = parseAudienceBreakdown(audienceData.data || []);
  const sorted = [...segments].sort((a, b) => b.roas - a.roas);
  const top8 = sorted.slice(0, 8);

  if (sorted.length === 0) {
    return { content: 'No audience breakdown data is available for the selected period. Make sure your campaigns have been running and accumulating delivery data.' };
  }

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const totalSpend = segments.reduce((s, seg) => s + seg.spend, 0);
  const totalConversions = segments.reduce((s, seg) => s + seg.conversions, 0);
  const withConversions = segments.filter(s => s.conversions > 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  let content = `**Audience Intelligence Report**\n\n`;

  // Core audience identification
  content += `**🎯 Your Core Converting Audience:**\n`;
  content += `"**${best.label}**" is your highest-performing segment at **${fmtNum(best.roas)}x ROAS** with ${fmtInt(best.conversions)} conversions and ${fmt(best.cpa)} CPA.\n\n`;

  // Gender and age pattern analysis
  const genderMap: Record<string, { spend: number; conversions: number; roas: number[] }> = {};
  const ageMap: Record<string, { spend: number; conversions: number; roas: number[] }> = {};
  for (const seg of segments) {
    const parts = seg.label.split(' ');
    const gender = parts[0] || 'unknown';
    const age = parts.slice(1).join(' ') || 'unknown';
    if (!genderMap[gender]) genderMap[gender] = { spend: 0, conversions: 0, roas: [] };
    genderMap[gender].spend += seg.spend;
    genderMap[gender].conversions += seg.conversions;
    if (seg.roas > 0) genderMap[gender].roas.push(seg.roas);
    if (!ageMap[age]) ageMap[age] = { spend: 0, conversions: 0, roas: [] };
    ageMap[age].spend += seg.spend;
    ageMap[age].conversions += seg.conversions;
    if (seg.roas > 0) ageMap[age].roas.push(seg.roas);
  }

  // Gender insight
  const genderEntries = Object.entries(genderMap).sort((a, b) => b[1].conversions - a[1].conversions);
  if (genderEntries.length >= 2) {
    const [topGender, topGData] = genderEntries[0];
    const topGenderAvgRoas = topGData.roas.length > 0 ? topGData.roas.reduce((s, r) => s + r, 0) / topGData.roas.length : 0;
    const genderPct = totalConversions > 0 ? round((topGData.conversions / totalConversions) * 100, 1) : 0;
    content += `**Gender Split:** ${topGender} drives **${genderPct}%** of your conversions at an average ${fmtNum(topGenderAvgRoas)}x ROAS.\n`;
  }

  // Age insight
  const ageEntries = Object.entries(ageMap).sort((a, b) => b[1].conversions - a[1].conversions);
  if (ageEntries.length >= 2) {
    const [topAge, topAData] = ageEntries[0];
    const topAgeAvgRoas = topAData.roas.length > 0 ? topAData.roas.reduce((s, r) => s + r, 0) / topAData.roas.length : 0;
    const agePct = totalConversions > 0 ? round((topAData.conversions / totalConversions) * 100, 1) : 0;
    content += `**Top Age Group:** ${topAge} accounts for **${agePct}%** of conversions at ${fmtNum(topAgeAvgRoas)}x ROAS.\n\n`;
  }

  // Strategic recommendations
  content += `**📋 Audience Strategy:**\n`;

  // Money pit segments
  const moneyPits = segments.filter(s => s.spend > totalSpend * 0.08 && s.roas < 1);
  if (moneyPits.length > 0) {
    const pitSpend = moneyPits.reduce((s, seg) => s + seg.spend, 0);
    content += `1. **Stop bleeding ${fmt(pitSpend)} on underperforming segments** — ${moneyPits.map(s => `"${s.label}" (${fmtNum(s.roas)}x)`).join(', ')} are eating budget with negative returns. Exclude these from your targeting or reduce bids significantly.\n`;
  }

  // Scale winners
  const goldSegments = withConversions.filter(s => s.roas >= best.roas * 0.7).sort((a, b) => b.roas - a.roas);
  if (goldSegments.length > 0) {
    content += `2. **Create lookalike audiences from your top ${Math.min(goldSegments.length, 3)} segments** — ${goldSegments.slice(0, 3).map(s => `"${s.label}"`).join(', ')} are your golden segments. Build 1%, 3%, and 5% lookalikes from their purchase data.\n`;
  }

  // CPA efficiency
  if (best.cpa > 0 && avgCpa > 0 && best.cpa < avgCpa * 0.7) {
    const savings = round(avgCpa - best.cpa, 2);
    content += `3. **Shift budget toward your ${fmt(best.cpa)} CPA segment** — your account average is ${fmt(avgCpa)}. Focusing on "${best.label}" could save you ${fmt(savings)} per acquisition.\n`;
  }

  // Under-explored segments with potential
  const lowSpendHighPotential = segments.filter(s => s.spend < totalSpend * 0.05 && s.roas > 1.5 && s.conversions > 0);
  if (lowSpendHighPotential.length > 0) {
    content += `4. **Test scaling ${lowSpendHighPotential.length} under-explored segment${lowSpendHighPotential.length > 1 ? 's' : ''}** — ${lowSpendHighPotential.map(s => `"${s.label}" (${fmtNum(s.roas)}x ROAS)`).join(', ')} ${lowSpendHighPotential.length === 1 ? 'shows' : 'show'} strong returns on limited spend. Gradually increase budget to validate.\n`;
  }

  const chart: AiChart = {
    type: 'bar',
    data: top8.map(s => ({ label: s.label, value: round(s.roas, 2) })),
  };

  const table: AiTable = {
    headers: ['Segment', 'ROAS', 'Spend', 'CPA', 'CTR %', 'Conversions'],
    rows: top8.map(s => [
      s.label,
      `${fmtNum(s.roas)}x`,
      fmt(s.spend),
      fmt(s.cpa),
      fmtNum(s.ctr),
      fmtInt(s.conversions),
    ]),
  };

  return { content, chart, table };
}

async function handleCreative(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const adData = await meta.get<any>(`/${accountId}/insights`, {
    fields: `ad_name,campaign_name,${INSIGHT_FIELDS}`,
    level: 'ad',
    date_preset: datePreset,
    limit: '50',
  });

  const rows = (adData.data || []) as any[];

  if (rows.length === 0) {
    return { content: 'No ad-level data is available for the selected period. Make sure you have active ads with delivery data.' };
  }

  const parsed = rows.map(row => {
    const m = parseInsightMetrics(row);
    return {
      adName: row.ad_name || 'Unknown',
      campaignName: row.campaign_name || 'Unknown',
      ...m,
    };
  });

  const sortedByRoas = [...parsed].sort((a, b) => b.roas - a.roas);
  const sortedByCtr = [...parsed].sort((a, b) => b.ctr - a.ctr);
  const top5 = sortedByRoas.slice(0, 5);
  const totalAds = parsed.length;
  const avgCtr = parsed.reduce((s, p) => s + p.ctr, 0) / totalAds;
  const avgRoas = parsed.reduce((s, p) => s + p.roas, 0) / totalAds;
  const totalSpend = parsed.reduce((s, p) => s + p.spend, 0);
  const totalConversions = parsed.reduce((s, p) => s + p.conversions, 0);

  let content = `**Creative Performance Intelligence**\n\n`;

  // Top performer spotlight
  const hero = top5[0];
  content += `**🏆 Your #1 Creative: "${hero.adName}"**\n`;
  content += `Campaign: ${hero.campaignName}\n`;
  content += `Performance: **${fmtNum(hero.roas)}x ROAS** | ${fmtNum(hero.ctr)}% CTR | ${fmt(hero.cpa)} CPA | ${fmtInt(hero.conversions)} conversions\n`;
  if (hero.roas > avgRoas * 1.5) {
    content += `This ad is **${round(hero.roas / avgRoas, 1)}x better** than your average creative. This is your DNA — study what makes it work.\n\n`;
  } else {
    content += `\n`;
  }

  // Creative health overview
  const highPerformers = parsed.filter(p => p.roas >= avgRoas * 1.3 && p.conversions > 0);
  const midPerformers = parsed.filter(p => p.roas >= 1 && p.roas < avgRoas * 1.3);
  const fatigued = parsed.filter(p => p.ctr < avgCtr * 0.5 && p.impressions > 1000);
  const deadWeight = parsed.filter(p => p.roas < 0.5 && p.spend > totalSpend * 0.02);

  content += `**📊 Creative Health Dashboard:**\n`;
  content += `Out of **${totalAds} active ads**:\n`;
  content += `- 🟢 **${highPerformers.length} stars** — significantly outperforming (${fmtNum(avgRoas * 1.3)}x+ ROAS)\n`;
  content += `- 🟡 **${midPerformers.length} steady performers** — profitable but not scaling-tier\n`;
  content += `- 🔴 **${deadWeight.length} underperformers** — burning budget with poor returns\n`;
  if (fatigued.length > 0) {
    content += `- ⚠️ **${fatigued.length} showing fatigue** — CTR dropped well below average despite high impressions\n`;
  }
  content += `\n`;

  // Pattern recognition from winning ad names
  content += `**🧬 Winning Creative Patterns:**\n`;

  // Analyze CTR heroes (engagement) vs ROAS heroes (conversion)
  const ctrHero = sortedByCtr[0];
  if (ctrHero.adName !== hero.adName) {
    content += `- **Best for engagement:** "${ctrHero.adName}" (${fmtNum(ctrHero.ctr)}% CTR) — this creative grabs attention. Study its hook.\n`;
    content += `- **Best for conversion:** "${hero.adName}" (${fmtNum(hero.roas)}x ROAS) — this creative closes sales. Study its offer/CTA.\n`;
    content += `- **Pro tip:** Combine the hook style from your CTR winner with the offer structure of your ROAS winner for your next creative test.\n`;
  } else {
    content += `- "${hero.adName}" is both your engagement AND conversion leader — a rare unicorn creative. Create 3-5 variations of this immediately before it fatigues.\n`;
  }
  content += `\n`;

  // Strategic actions
  content += `**📋 Creative Strategy — Next Steps:**\n`;
  content += `1. **Iterate on your winners** — Create 3-5 variations of "${hero.adName}" with different hooks, thumbnails, and CTAs. Your winning formula is proven; now scale through iteration.\n`;

  if (fatigued.length > 0) {
    const fatiguedSpend = fatigued.reduce((s, p) => s + p.spend, 0);
    content += `2. **Replace ${fatigued.length} fatigued creative${fatigued.length > 1 ? 's' : ''}** — ${fatigued.slice(0, 2).map(f => `"${f.adName}"`).join(', ')}${fatigued.length > 2 ? ` +${fatigued.length - 2} more` : ''} have tanking CTRs. ${fmt(fatiguedSpend)} is being wasted on stale creatives.\n`;
  }

  if (deadWeight.length > 0) {
    content += `3. **Kill ${deadWeight.length} dead-weight ad${deadWeight.length > 1 ? 's' : ''}** — anything under 0.5x ROAS is actively losing money. Pause immediately and redirect budget to your top 5.\n`;
  }

  // Creative velocity check
  const conversionRate = totalConversions > 0 && parsed.length > 0 ? totalConversions / totalAds : 0;
  if (totalAds < 10) {
    content += `4. **Increase creative velocity** — you only have ${totalAds} ads running. Top-performing accounts test 15-30+ creatives to find winners faster. Aim to launch 5-10 new ad variations per week.\n`;
  } else if (highPerformers.length <= 2) {
    content += `4. **Improve hit rate** — out of ${totalAds} ads, only ${highPerformers.length} are true performers. Test more diverse angles, formats (UGC, static, carousel), and hooks to find additional winners.\n`;
  }

  const table: AiTable = {
    headers: ['Ad Name', 'Campaign', 'ROAS', 'CTR %', 'CPA', 'Spend', 'Status'],
    rows: top5.map(a => {
      let status = '🟢 Star';
      if (a.roas < 1) status = '🔴 Cut';
      else if (a.ctr < avgCtr * 0.5 && a.impressions > 1000) status = '⚠️ Fatigue';
      else if (a.roas < avgRoas * 1.3) status = '🟡 Steady';
      return [
        a.adName,
        a.campaignName,
        `${fmtNum(a.roas)}x`,
        fmtNum(a.ctr),
        fmt(a.cpa),
        fmt(a.spend),
        status,
      ];
    }),
  };

  return { content, table };
}

async function handleCpa(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const withConversions = campaigns.filter(c => c.conversions > 0);
  const noConversions = campaigns.filter(c => c.conversions === 0 && c.spend > 0);
  const sorted = [...withConversions].sort((a, b) => a.cpa - b.cpa);
  const top5 = sorted.slice(0, 5);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  let content = `**Cost Per Acquisition Deep Dive**\n\n`;

  // Executive summary
  content += `Your blended CPA is **${fmt(acct.cpa)}** across **${fmtInt(acct.conversions)} conversions** from ${fmt(acct.spend)} in total spend.\n\n`;

  if (top5.length > 0) {
    const best = top5[0];
    const worst = sorted[sorted.length - 1];
    const cpaSpread = worst.cpa - best.cpa;

    // Efficiency leader
    content += `**🎯 Efficiency Leader: "${best.label}"**\n`;
    content += `CPA: **${fmt(best.cpa)}** | ${fmtInt(best.conversions)} conversions | ${fmtNum(best.roas)}x ROAS\n`;
    if (acct.cpa > 0 && best.cpa < acct.cpa) {
      const savings = round(((acct.cpa - best.cpa) / acct.cpa) * 100, 1);
      content += `This campaign acquires customers **${savings}% cheaper** than your account average.\n\n`;
    } else {
      content += `\n`;
    }

    // CPA spread analysis
    if (cpaSpread > 0) {
      content += `**📊 CPA Efficiency Spread:**\n`;
      content += `Your cheapest campaign converts at ${fmt(best.cpa)} and your most expensive at ${fmt(worst.cpa)} — a **${fmt(cpaSpread)} gap**.\n`;
      if (cpaSpread > acct.cpa) {
        content += `That's a massive spread. Your most expensive campaign costs **${round(worst.cpa / best.cpa, 1)}x more** per conversion than your most efficient. There's serious money being left on the table.\n\n`;
      } else {
        content += `\n`;
      }
    }

    // Money being wasted on high-CPA campaigns
    const expensive = sorted.filter(c => c.cpa > acct.cpa * 1.5);
    if (expensive.length > 0) {
      const expSpend = expensive.reduce((s, c) => s + c.spend, 0);
      const expConversions = expensive.reduce((s, c) => s + c.conversions, 0);
      const ifBestCpa = expConversions > 0 ? expConversions * (expSpend / expConversions - best.cpa) : 0;
      content += `**💸 The Cost of Inefficiency:**\n`;
      content += `${expensive.length} campaign${expensive.length > 1 ? 's are' : ' is'} running at 1.5x+ your average CPA, spending ${fmt(expSpend)} total. If these performed at your best campaign's CPA (${fmt(best.cpa)}), you'd save approximately **${fmt(ifBestCpa)}** — or get **${Math.round(expSpend / best.cpa - expConversions)} more conversions** for the same budget.\n\n`;
    }

    // Campaigns spending with zero conversions
    if (noConversions.length > 0) {
      const deadSpend = noConversions.reduce((s, c) => s + c.spend, 0);
      content += `**⚠️ ${noConversions.length} campaign${noConversions.length > 1 ? 's have' : ' has'} ZERO conversions** despite spending ${fmt(deadSpend)}. `;
      if (deadSpend > totalSpend * 0.1) {
        content += `That's ${round((deadSpend / totalSpend) * 100, 1)}% of your budget with no return. Pause these now.\n\n`;
      } else {
        content += `Review targeting and pixel setup for these.\n\n`;
      }
    }

    // Strategic recommendations
    content += `**📋 CPA Optimization Playbook:**\n`;
    content += `1. **Set a CPA ceiling at ${fmt(acct.cpa * 1.3)}** — anything above 130% of your blended CPA should be flagged for review within 48 hours.\n`;
    content += `2. **Scale "${best.label}" aggressively** — at ${fmt(best.cpa)} CPA, this campaign has the healthiest unit economics. Increase budget 15-20% every 3 days while monitoring for CPA creep.\n`;

    if (expensive.length > 0) {
      content += `3. **Fix or kill expensive campaigns** — ${expensive.slice(0, 2).map(c => `"${c.label}" (${fmt(c.cpa)})`).join(', ')} are dragging up your blended CPA. Test new audiences, creatives, or bid strategies before pausing.\n`;
    }

    if (best.ctr > 0) {
      content += `4. **Replicate what makes "${best.label}" efficient** — check its audience targeting, creative format, and landing page. Low CPA usually means high-intent traffic + strong conversion path.\n`;
    }
  } else {
    content += `**⚠️ No campaigns have recorded conversions.** This is a critical issue.\n\n`;
    content += `**Immediate checks:**\n`;
    content += `1. Verify your Meta Pixel is installed and firing on your conversion page\n`;
    content += `2. Check that your conversion events (Purchase, Lead, etc.) are set up in Events Manager\n`;
    content += `3. Ensure your campaigns are optimizing for the correct conversion event\n`;
    content += `4. If you just launched, give campaigns 24-48 hours and at least ${fmt(50)} in spend before evaluating\n`;
  }

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.cpa, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'CPA', 'Conversions', 'Spend', 'ROAS', 'Efficiency'],
    rows: top5.map(c => {
      const efficiency = acct.cpa > 0 ? round(((acct.cpa - c.cpa) / acct.cpa) * 100, 1) : 0;
      return [
        c.label,
        fmt(c.cpa),
        fmtInt(c.conversions),
        fmt(c.spend),
        `${fmtNum(c.roas)}x`,
        efficiency > 0 ? `${efficiency}% below avg` : `${Math.abs(efficiency)}% above avg`,
      ];
    }),
  };

  return { content, chart, table };
}

async function handleForecast(meta: MetaApiService, accountId: string): Promise<AiResponse> {
  const dailyData = await meta.get<any>(`/${accountId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: 'last_14d',
    time_increment: '1',
    level: 'account',
  });

  const days = (dailyData.data || []) as any[];

  if (days.length < 3) {
    return { content: 'Not enough historical data to generate a forecast. At least 3 days of spending data is needed.' };
  }

  const dailyMetrics = days.map(d => {
    const m = parseInsightMetrics(d);
    return { date: d.date_start || '', spend: m.spend, revenue: m.revenue, roas: m.roas, conversions: m.conversions, cpa: m.cpa };
  });

  const totalSpend = dailyMetrics.reduce((s, d) => s + d.spend, 0);
  const totalRevenue = dailyMetrics.reduce((s, d) => s + d.revenue, 0);
  const totalConversions = dailyMetrics.reduce((s, d) => s + d.conversions, 0);
  const avgDailySpend = totalSpend / dailyMetrics.length;
  const avgDailyRevenue = totalRevenue / dailyMetrics.length;
  const avgDailyConversions = totalConversions / dailyMetrics.length;
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Trend analysis: last 7 vs first 7
  const midpoint = Math.floor(dailyMetrics.length / 2);
  const firstHalf = dailyMetrics.slice(0, midpoint);
  const secondHalf = dailyMetrics.slice(midpoint);

  const firstAvgSpend = firstHalf.reduce((s, d) => s + d.spend, 0) / firstHalf.length;
  const secondAvgSpend = secondHalf.reduce((s, d) => s + d.spend, 0) / secondHalf.length;
  const spendTrend = firstAvgSpend > 0 ? (secondAvgSpend - firstAvgSpend) / firstAvgSpend : 0;

  const firstAvgRoas = firstHalf.reduce((s, d) => s + d.spend, 0) > 0
    ? firstHalf.reduce((s, d) => s + d.revenue, 0) / firstHalf.reduce((s, d) => s + d.spend, 0) : 0;
  const secondAvgRoas = secondHalf.reduce((s, d) => s + d.spend, 0) > 0
    ? secondHalf.reduce((s, d) => s + d.revenue, 0) / secondHalf.reduce((s, d) => s + d.spend, 0) : 0;
  const roasTrend = firstAvgRoas > 0 ? (secondAvgRoas - firstAvgRoas) / firstAvgRoas : 0;

  const projectedWeeklySpend = round(avgDailySpend * 7 * (1 + spendTrend), 2);
  const projectedWeeklyRevenue = round(avgDailyRevenue * 7 * (1 + spendTrend * (1 + roasTrend)), 2);
  const projectedWeeklyConversions = Math.round(avgDailyConversions * 7 * (1 + spendTrend));
  const projectedRoas = projectedWeeklySpend > 0 ? projectedWeeklyRevenue / projectedWeeklySpend : 0;

  // Volatility check
  const spendStdDev = Math.sqrt(dailyMetrics.reduce((s, d) => s + Math.pow(d.spend - avgDailySpend, 2), 0) / dailyMetrics.length);
  const spendCV = avgDailySpend > 0 ? spendStdDev / avgDailySpend : 0;

  // Best and worst days
  const bestDay = [...dailyMetrics].sort((a, b) => b.revenue - a.revenue)[0];
  const worstDay = [...dailyMetrics].sort((a, b) => a.revenue - b.revenue)[0];

  let content = `**7-Day Performance Forecast**\n\n`;

  content += `Based on ${dailyMetrics.length} days of data with trend-adjusted projections:\n\n`;

  content += `| Metric | Projected Next 7 Days |\n`;
  content += `|---|---|\n`;
  content += `| Spend | **${fmt(projectedWeeklySpend)}** |\n`;
  content += `| Revenue | **${fmt(projectedWeeklyRevenue)}** |\n`;
  content += `| Conversions | **~${fmtInt(projectedWeeklyConversions)}** |\n`;
  content += `| ROAS | **${fmtNum(projectedRoas)}x** |\n`;
  content += `| Est. CPA | **${fmt(avgCpa)}** |\n\n`;

  // Trend analysis
  const spendDir = spendTrend > 0.05 ? 'increasing' : spendTrend < -0.05 ? 'decreasing' : 'stable';
  const roasDir = roasTrend > 0.05 ? 'improving' : roasTrend < -0.05 ? 'declining' : 'stable';

  content += `**📈 Trend Signals:**\n`;
  content += `- **Spend:** ${spendDir} (${round(Math.abs(spendTrend) * 100, 1)}% ${spendTrend >= 0 ? 'up' : 'down'} week-over-week)\n`;
  content += `- **ROAS:** ${roasDir} (${fmtNum(firstAvgRoas)}x → ${fmtNum(secondAvgRoas)}x)\n`;

  if (spendCV > 0.4) {
    content += `- **⚠️ High volatility detected** — your daily spend swings by ~${round(spendCV * 100, 0)}%. This makes forecasting less reliable and suggests budget pacing issues.\n`;
  } else if (spendCV < 0.15) {
    content += `- **Stable pacing** — your daily spend is consistent, which means this forecast has higher confidence.\n`;
  }
  content += `\n`;

  // Scenario analysis
  content += `**🔮 Scenario Planning:**\n\n`;

  if (spendTrend > 0.05 && roasTrend >= 0) {
    content += `**✅ Best case: Scaling profitably.** Spend is rising and ROAS is holding or improving. If this continues, you could see ${fmt(projectedWeeklyRevenue * 1.15)} revenue next week.\n\n`;
    content += `**Action:** Continue scaling. Increase budgets on top campaigns by 15-20%. Monitor CPA daily — if it creeps up more than 20%, slow down.\n\n`;
  } else if (spendTrend > 0.05 && roasTrend < -0.05) {
    content += `**⚠️ Warning: Spending more, earning less.** Your spend is climbing but ROAS is dropping — classic sign of scaling too fast or creative fatigue.\n\n`;
    content += `**Action:** Freeze budget increases immediately. Refresh your top 3 creatives. Review audience overlap between campaigns. Resume scaling only after ROAS stabilizes for 3+ days.\n\n`;
  } else if (spendTrend < -0.05 && roasTrend > 0) {
    content += `**🟡 Contracting efficiently.** You're spending less but getting better returns per dollar. This usually means you've cut losers — good.\n\n`;
    content += `**Action:** Now is the time to selectively reinvest. Find your best-performing campaign and increase its budget. You've cleaned up — time to grow again.\n\n`;
  } else if (spendTrend < -0.05 && roasTrend < -0.05) {
    content += `**🔴 Double decline.** Both spend and ROAS are falling. This needs immediate attention.\n\n`;
    content += `**Action:** Audit your entire funnel — creative fatigue, audience saturation, or landing page issues may be compounding. Consider launching fresh creatives and testing new audiences before increasing spend.\n\n`;
  } else {
    content += `**📊 Steady state.** Performance is relatively flat. This is a good time to test new creatives and audiences to find your next growth lever.\n\n`;
  }

  // Peak performance insight
  if (bestDay.revenue > 0) {
    content += `**💡 Peak Day Insight:** Your best day was ${bestDay.date} (${fmt(bestDay.revenue)} revenue, ${fmtNum(bestDay.roas)}x ROAS). Analyze what was different that day — weekend vs weekday, specific creatives running, or audience behavior.`;
  }

  const chart: AiChart = {
    type: 'line',
    data: dailyMetrics.map(d => ({ label: d.date, value: round(d.spend, 2) })),
  };

  return { content, chart };
}

async function handleScript(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string): Promise<AiResponse> {
  const [adData, campaignData, audienceData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: `ad_name,campaign_name,${INSIGHT_FIELDS}`,
      level: 'ad',
      date_preset: datePreset,
      limit: '20',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '20',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
      breakdowns: 'age,gender',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const ads = (adData.data || []).map((row: any) => ({
    name: row.ad_name || 'Unknown',
    campaign: row.campaign_name || 'Unknown',
    ...parseInsightMetrics(row),
  }));
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const audiences = parseAudienceBreakdown(audienceData.data || []);
  const topAds = [...ads].sort((a: any, b: any) => b.roas - a.roas).slice(0, 5);
  const topCampaigns = [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 3);
  const topAudience = [...audiences].sort((a, b) => b.conversions - a.conversions)[0];

  const avgRoas = ads.length > 0 ? ads.reduce((s: number, a: any) => s + a.roas, 0) / ads.length : 0;
  const avgCtr = ads.length > 0 ? ads.reduce((s: number, a: any) => s + a.ctr, 0) / ads.length : 0;
  const highCtrAds = [...ads].sort((a: any, b: any) => b.ctr - a.ctr).slice(0, 3);

  // Detect if they want ad copy vs video script vs hooks
  const lower = userMessage.toLowerCase();
  const wantsAdCopy = lower.includes('ad copy') || lower.includes('facebook ad') || lower.includes('copy');
  const wantsHooks = lower.includes('hook');

  let content = '';

  if (wantsHooks) {
    // ------- HOOK GENERATION -------
    content += `**Hook Intelligence Report**\n\n`;

    content += `Based on your **${ads.length} active ads** and their engagement patterns (avg ${fmtNum(avgCtr)}% CTR, ${fmtNum(avgRoas)}x ROAS):\n\n`;

    if (highCtrAds.length > 0) {
      content += `**🔥 Your Current Best-Engaging Creatives:**\n`;
      highCtrAds.forEach((a: any, i: number) => {
        content += `${i + 1}. "${a.name}" — ${fmtNum(a.ctr)}% CTR, ${fmtNum(a.roas)}x ROAS\n`;
      });
      content += `\nThese hooks are already stopping scrolls. Here are 5 new hooks built on the same psychology:\n\n`;
    }

    content += `**🎣 5 Performance-Backed Hooks:**\n\n`;

    content += `**1. The Pattern Interrupt**\n`;
    content += `"Stop scrolling — this is the ad I wish I saw 6 months ago."\n`;
    content += `_Why it works:_ Direct address + time-based regret creates instant curiosity.`;
    if (avgCtr > 1.5) content += ` Your audience already responds to engaging hooks (${fmtNum(avgCtr)}% CTR) — this will push it further.`;
    content += `\n\n`;

    content += `**2. The Counter-Intuitive Truth**\n`;
    content += `"The reason your [pain point] keeps getting worse? You're actually doing the 'right' thing."\n`;
    content += `_Why it works:_ Challenges existing beliefs — creates cognitive dissonance that demands resolution.\n\n`;

    content += `**3. The Specificity Hook**\n`;
    content += `"${topAudience ? `${topAudience.label.split(' ')[0] === 'female' ? 'Women' : 'Men'} ${topAudience.label.split(' ').slice(1).join(' ')}` : 'People'} are switching to this — here's what they know that you don't."\n`;
    content += `_Why it works:_ Segment-specific targeting in the hook itself.`;
    if (topAudience) content += ` Built from your top converting audience segment.`;
    content += `\n\n`;

    content += `**4. The Social Proof Avalanche**\n`;
    content += `"Over [X] people tried this in the last month. Their reviews are... intense."\n`;
    content += `_Why it works:_ Numbers + emotional tease.`;
    if (avgRoas > 2) content += ` Your ${fmtNum(avgRoas)}x ROAS suggests strong product satisfaction — leverage that proof.`;
    content += `\n\n`;

    content += `**5. The Unfiltered Review**\n`;
    content += `"Okay honest review — I bought this thinking it was overhyped. I was wrong."\n`;
    content += `_Why it works:_ Starts with skepticism (relatable) then flips to endorsement. Perfect for UGC-style creatives.\n\n`;

    content += `**📋 Testing Strategy:**\n`;
    content += `- Test each hook as a separate ad within your top-performing campaign ("${topCampaigns[0]?.label || 'your best campaign'}")\n`;
    content += `- Keep the body and CTA identical — isolate the hook variable only\n`;
    content += `- Run for 48-72 hours with ${fmt(topAds[0]?.spend ? topAds[0].spend * 0.3 : 20)}/day per variation\n`;
    content += `- Kill anything under ${fmtNum(avgCtr * 0.8)}% CTR after 1,000 impressions\n`;

  } else if (wantsAdCopy) {
    // ------- AD COPY GENERATION -------
    content += `**Performance-Backed Ad Copy**\n\n`;

    content += `Built from your data: **${fmtNum(avgRoas)}x avg ROAS**, **${fmtNum(avgCtr)}% avg CTR**`;
    if (topAudience) content += `, top audience: **${topAudience.label}**`;
    content += `\n\n`;

    content += `---\n\n`;

    // Primary copy
    content += `**📝 Primary Ad Copy (Facebook/Instagram Feed)**\n\n`;
    content += `🔥 Stop wasting money on things that don't work.\n\n`;
    content += `We get it. You've tried everything.\n`;
    content += `The products that promise the world and deliver... nothing.\n\n`;
    content += `That's exactly why [your product] exists.\n\n`;
    content += `✅ [Key benefit 1 — based on what your top ads emphasize]\n`;
    content += `✅ [Key benefit 2 — the result your customers care about most]\n`;
    content += `✅ [Key benefit 3 — the differentiator from competitors]\n\n`;
    content += `Don't just take our word for it — [X,000+] customers switched this month.\n\n`;
    content += `👉 Tap "Shop Now" and see why everyone's talking about this.\n\n`;
    content += `---\n\n`;

    // Short copy variant
    content += `**📝 Short Copy Variant (Stories/Reels)**\n\n`;
    content += `This changed everything for me 👆\n\n`;
    content += `[One sentence — the #1 result your product delivers]\n\n`;
    content += `Link in bio → [offer]\n\n`;
    content += `---\n\n`;

    // Retargeting copy
    content += `**📝 Retargeting Copy (Warm Audience)**\n\n`;
    content += `Still thinking about it? 👀\n\n`;
    content += `Here's what happened to [X] people who stopped hesitating:\n`;
    content += `→ [Result 1]\n`;
    content += `→ [Result 2]\n`;
    content += `→ [Result 3]\n\n`;
    content += `Your cart is waiting. This offer expires soon.\n\n`;
    content += `---\n\n`;

    content += `**🧠 Copy Notes:**\n`;
    content += `- Your best ads ("${topAds[0]?.name || 'top performer'}") convert at ${fmtNum(topAds[0]?.roas || avgRoas)}x ROAS — mirror their messaging angles\n`;
    if (topAudience) {
      content += `- Your top audience is ${topAudience.label} — tailor the tone and pain points to this demographic\n`;
    }
    content += `- Test long-form vs short-form. Your ${fmtNum(avgCtr)}% CTR suggests your audience ${avgCtr > 1.5 ? 'engages well — you can go detailed' : 'needs a stronger hook — lead with the result, not the story'}\n`;

  } else {
    // ------- VIDEO SCRIPT GENERATION -------
    content += `**Data-Backed Video Ad Script**\n\n`;

    content += `Built from your winning patterns: **${fmtNum(avgRoas)}x avg ROAS**, top performer "${topAds[0]?.name || 'your best ad'}" at **${fmtNum(topAds[0]?.roas || 0)}x ROAS**`;
    if (topAudience) content += ` | Primary audience: **${topAudience.label}**`;
    content += `\n\n`;

    content += `---\n\n`;
    content += `🎬 **UGC-Style Video Script (30-45 sec)**\n\n`;

    content += `**[SCENE 1 — HOOK] 0-3 sec** 🎯\n`;
    content += `_Camera: Close-up selfie style, natural lighting_\n`;
    content += `"I need to talk about this because nobody else is being honest about it."\n`;
    content += `_[Quick cut to product/result]_\n\n`;

    content += `**[SCENE 2 — AGITATE] 3-8 sec** 😤\n`;
    content += `_Camera: Talking to camera, slightly frustrated energy_\n`;
    content += `"I was spending [money/time] on [competitor category] every month and seeing ZERO results. I was about to give up completely."\n\n`;

    content += `**[SCENE 3 — DISCOVERY] 8-12 sec** 💡\n`;
    content += `_Camera: Energy shift — lighter, curious_\n`;
    content += `"Then someone in a comment section mentioned [your product] and I thought... okay, one more try."\n\n`;

    content += `**[SCENE 4 — TRANSFORMATION] 12-22 sec** 🔥\n`;
    content += `_Camera: Show product in use, B-roll of results, before/after if applicable_\n`;
    content += `"Within [timeframe] — look at this. [Show specific result]. My [metric] went from [X] to [Y]. I literally couldn't believe it."\n`;
    content += `_[Show real product footage, unboxing, or using]_\n\n`;

    content += `**[SCENE 5 — SOCIAL PROOF] 22-27 sec** ⭐\n`;
    content += `_Camera: Show reviews/comments/screenshots_\n`;
    content += `"And it's not just me — look at these reviews. [Show 2-3 review screenshots scrolling]. [X,000+] people have switched already."\n\n`;

    content += `**[SCENE 6 — CTA] 27-32 sec** 🛒\n`;
    content += `_Camera: Direct to camera, urgent but genuine_\n`;
    content += `"They're running [specific offer] right now but I don't know how long it'll last. Link is right here — don't sleep on this."\n`;
    content += `_[Point down or tap link animation]_\n\n`;

    content += `---\n\n`;

    content += `**🧠 Why This Script Is Built For YOUR Account:**\n`;
    if (avgCtr > 1.5) {
      content += `- **High-engagement audience** (${fmtNum(avgCtr)}% CTR) — the "honest confession" hook style triggers curiosity in audiences who already engage well\n`;
    }
    if (avgRoas > 2) {
      content += `- **Strong product-market fit** (${fmtNum(avgRoas)}x ROAS) — lean heavily into transformation/results. Your product delivers, so let the proof do the selling\n`;
    } else if (avgRoas > 0) {
      content += `- **Room to grow** (${fmtNum(avgRoas)}x ROAS) — this script emphasizes social proof and urgency which can improve conversion rate on cold traffic\n`;
    }
    if (topAudience) {
      content += `- **Targeted to ${topAudience.label}** — your top converting segment. Match the creator in the video to this demographic for maximum relatability\n`;
    }
    content += `\n`;

    content += `**🎯 Production & Testing Plan:**\n`;
    content += `1. Film 3 versions with different creators (match your ${topAudience?.label || 'target'} demographic)\n`;
    content += `2. Test 3 different hooks per version (6-9 total variations)\n`;
    content += `3. Launch in your best campaign ("${topCampaigns[0]?.label || 'top campaign'}") with ${fmt(topAds[0]?.spend ? topAds[0].spend * 0.5 : 30)}/day per variation\n`;
    content += `4. After 48 hours: kill anything under ${fmtNum(avgCtr * 0.7)}% CTR, scale winners\n`;
  }

  if (topAds.length > 0) {
    const table: AiTable = {
      headers: ['Your Top Ads (Reference)', 'Campaign', 'ROAS', 'CTR %', 'Spend'],
      rows: topAds.slice(0, 5).map((a: any) => [
        a.name,
        a.campaign,
        `${fmtNum(a.roas)}x`,
        fmtNum(a.ctr),
        fmt(a.spend),
      ]),
    };
    return { content, table };
  }

  return { content };
}

async function handleOverview(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData, adData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '30',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `ad_name,${INSIGHT_FIELDS}`,
      level: 'ad',
      date_preset: datePreset,
      limit: '20',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const ads = (adData.data || []).map((row: any) => ({
    name: row.ad_name || 'Unknown',
    ...parseInsightMetrics(row),
  }));

  if (acct.spend === 0 && acct.impressions === 0) {
    return {
      content: 'No data found for the selected period. Your campaigns may be paused or not running. Try a different date range, or check that your ad account has active campaigns.',
    };
  }

  const activeCampaigns = campaigns.filter(c => c.spend > 0);
  const profitable = campaigns.filter(c => c.roas >= 1 && c.spend > 0);
  const unprofitable = campaigns.filter(c => c.roas < 1 && c.spend > 0);
  const totalSpend = activeCampaigns.reduce((s, c) => s + c.spend, 0);
  const wastedSpend = unprofitable.reduce((s, c) => s + c.spend, 0);
  const topCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
  const worstCampaign = [...activeCampaigns].sort((a, b) => a.roas - b.roas)[0];
  const topAd = [...ads].sort((a: any, b: any) => b.roas - a.roas)[0];

  let content = `**Account Performance Report**\n\n`;

  // Health score
  let healthScore = 0;
  if (acct.roas >= 3) healthScore += 3;
  else if (acct.roas >= 2) healthScore += 2;
  else if (acct.roas >= 1) healthScore += 1;
  if (profitable.length > unprofitable.length) healthScore += 1;
  if (acct.ctr > 1) healthScore += 1;
  const healthEmoji = healthScore >= 4 ? '🟢' : healthScore >= 2 ? '🟡' : '🔴';
  const healthLabel = healthScore >= 4 ? 'Strong' : healthScore >= 2 ? 'Needs Attention' : 'Critical';

  content += `**Account Health: ${healthEmoji} ${healthLabel}**\n\n`;

  // Key metrics in a clean format
  content += `| Metric | Value |\n`;
  content += `|---|---|\n`;
  content += `| Total Spend | **${fmt(acct.spend)}** |\n`;
  content += `| Total Revenue | **${fmt(acct.revenue)}** |\n`;
  content += `| ROAS | **${fmtNum(acct.roas)}x** |\n`;
  content += `| CPA | **${fmt(acct.cpa)}** |\n`;
  content += `| CTR | **${fmtNum(acct.ctr)}%** |\n`;
  content += `| Conversions | **${fmtInt(acct.conversions)}** |\n`;
  content += `| Active Campaigns | **${activeCampaigns.length}** (${profitable.length} profitable) |\n\n`;

  // What's working
  content += `**✅ What's Working:**\n`;
  if (topCampaign && topCampaign.roas > 0) {
    content += `- Your star campaign "${topCampaign.label}" is delivering **${fmtNum(topCampaign.roas)}x ROAS** — this is your growth engine\n`;
  }
  if (topAd && topAd.roas > 0) {
    content += `- Top creative "${topAd.name}" at **${fmtNum(topAd.roas)}x ROAS** and ${fmtNum(topAd.ctr)}% CTR — iterate on this winning formula\n`;
  }
  if (profitable.length > 0) {
    content += `- ${profitable.length} out of ${activeCampaigns.length} campaigns are profitable\n`;
  }
  if (acct.ctr > 1.5) {
    content += `- Strong engagement at ${fmtNum(acct.ctr)}% CTR — your creatives are resonating\n`;
  }
  content += `\n`;

  // What needs fixing
  if (unprofitable.length > 0 || acct.roas < 2) {
    content += `**⚠️ What Needs Fixing:**\n`;
    if (unprofitable.length > 0) {
      const pctWasted = totalSpend > 0 ? round((wastedSpend / totalSpend) * 100, 1) : 0;
      content += `- **${unprofitable.length} unprofitable campaign${unprofitable.length > 1 ? 's' : ''}** eating ${fmt(wastedSpend)} (${pctWasted}% of budget) with sub-1x ROAS\n`;
      if (worstCampaign && worstCampaign.roas < 1) {
        content += `- Worst offender: "${worstCampaign.label}" at ${fmtNum(worstCampaign.roas)}x ROAS with ${fmt(worstCampaign.spend)} spent\n`;
      }
    }
    if (acct.ctr < 1) {
      content += `- Low CTR (${fmtNum(acct.ctr)}%) suggests your creatives or targeting need work — audiences aren't clicking\n`;
    }
    if (ads.length < 10) {
      content += `- Only ${ads.length} active ads — you need more creative volume. Top accounts test 15-30+ at a time\n`;
    }
    content += `\n`;
  }

  // Top 3 actions
  content += `**📋 Top 3 Actions Right Now:**\n`;

  let actionNum = 1;
  if (unprofitable.length > 0 && wastedSpend > totalSpend * 0.15) {
    content += `${actionNum}. **Pause or restructure unprofitable campaigns** — ${fmt(wastedSpend)} is being burned. Redirect to your winners for an immediate ROAS lift.\n`;
    actionNum++;
  }

  if (topCampaign && topCampaign.roas >= 2) {
    content += `${actionNum}. **Scale "${topCampaign.label}"** — at ${fmtNum(topCampaign.roas)}x ROAS, this campaign can handle more budget. Increase by 15-20% every 3 days.\n`;
    actionNum++;
  }

  if (topAd && topAd.roas > avgVal(ads.map((a: any) => a.roas)) * 1.3) {
    content += `${actionNum}. **Create 3-5 variations of your top ad** ("${topAd.name}") — iterate on the winning hook, angle, and format before it fatigues.\n`;
    actionNum++;
  }

  if (actionNum <= 3) {
    content += `${actionNum}. **Test new audiences** — create lookalike audiences from your purchase data and test against your current targeting.\n`;
  }

  content += `\n💡 Ask me about **ROAS**, **CPA**, **audience**, **creatives**, **spend breakdown**, or **forecasting** for deeper analysis on any of these areas.`;

  const chart: AiChart = {
    type: 'bar',
    data: [
      { label: 'Spend', value: round(acct.spend, 2) },
      { label: 'Revenue', value: round(acct.revenue, 2) },
    ],
  };

  const topCampaigns = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5);
  const table: AiTable = {
    headers: ['Campaign', 'Spend', 'ROAS', 'CPA', 'CTR %', 'Conversions', 'Status'],
    rows: topCampaigns.map(c => {
      const status = c.roas >= 2 ? '🟢 Scale' : c.roas >= 1 ? '🟡 Optimize' : '🔴 Review';
      return [
        c.label,
        fmt(c.spend),
        `${fmtNum(c.roas)}x`,
        fmt(c.cpa),
        fmtNum(c.ctr),
        fmtInt(c.conversions),
        status,
      ];
    }),
  };

  return { content, chart, table };
}

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export async function aiRoutes(app: FastifyInstance) {

  // POST /ai/chat
  app.post('/chat', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { message, account_id, date_preset = 'last_7d', currency = 'USD' } = request.body as {
      message: string;
      account_id?: string;
      credential_group?: string;
      date_preset?: string;
      currency?: string;
    };

    setCurrency(currency);
    const intent = detectIntent(message);

    // Handle help intent without needing an account
    if (intent === 'help') {
      return {
        content: `**Welcome to Cosmisk AI — Your Performance Marketing Strategist**\n\n` +
          `I analyze your Meta Ads data in real time and give you actionable strategies — not just numbers. Here's what I can do:\n\n` +
          `**📊 Performance Analysis**\n` +
          `- "How is my account doing?" — Full health check with strategic recommendations\n` +
          `- "What's my best campaign by ROAS?" — Deep ROAS analysis with scaling strategy\n` +
          `- "Where is my budget going?" — Spend breakdown with waste identification\n` +
          `- "What's my CPA?" — Cost efficiency analysis with optimization playbook\n\n` +
          `**🎯 Audience & Creative Intelligence**\n` +
          `- "Who is my best audience?" — Segment analysis with targeting recommendations\n` +
          `- "Which ads are performing best?" — Creative health report with fatigue detection\n\n` +
          `**🎬 Content Generation**\n` +
          `- "Write me a video script" — Data-backed UGC script based on your winning patterns\n` +
          `- "Write me ad copy" — Facebook/Instagram copy tailored to your audience\n` +
          `- "Give me 5 hooks" — Performance-backed hook ideas with testing strategy\n\n` +
          `**🔮 Forecasting**\n` +
          `- "Predict next week's performance" — Trend-adjusted forecast with scenario planning\n\n` +
          `Select an ad account to get started. I'll pull your live data and give you strategies you can act on today.`,
      };
    }

    // Require an account for data-driven responses
    if (!account_id) {
      return {
        content: 'I need an ad account to pull your data. Please select an ad account from the dropdown above, then ask me your question again.',
      };
    }

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return {
        content: 'Your Meta account is not connected. Please go to Settings and connect your Meta account so I can access your ad data.',
      };
    }

    const meta = new MetaApiService(token);

    try {
      switch (intent) {
        case 'roas':
          return await handleRoas(meta, account_id, date_preset);
        case 'spend':
          return await handleSpend(meta, account_id, date_preset);
        case 'audience':
          return await handleAudience(meta, account_id, date_preset);
        case 'creative':
          return await handleCreative(meta, account_id, date_preset);
        case 'cpa':
          return await handleCpa(meta, account_id, date_preset);
        case 'forecast':
          return await handleForecast(meta, account_id);
        case 'script':
          return await handleScript(meta, account_id, date_preset, message);
        case 'overview':
        default:
          return await handleOverview(meta, account_id, date_preset);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';

      // Provide user-friendly error messages
      if (errorMsg.includes('OAuthException') || errorMsg.includes('token')) {
        return {
          content: 'Your Meta access token appears to have expired or become invalid. Please reconnect your Meta account in Settings to continue using data-driven insights.',
        };
      }

      if (errorMsg.includes('permission') || errorMsg.includes('(#10)')) {
        return {
          content: `I do not have permission to access data for this ad account (${account_id}). Please make sure the connected Meta account has access to this ad account.`,
        };
      }

      return {
        content: `I ran into an issue fetching your data: ${errorMsg}. Please try again, or check that your ad account is active and accessible.`,
      };
    }
  });
}
