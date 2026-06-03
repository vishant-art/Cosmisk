/**
 * AI route — smart fallback generation when the Claude API is unavailable.
 */

import { round, fmtNum, fmtInt, getCurrency, CURRENCY_SYMBOLS } from '../../services/format-helpers.js';
import { logger } from '../../utils/logger.js';

/** Generate a strategic analysis from raw data when Claude API is unavailable */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateSmartFallback(dataContext: any, analysisType: string): string {
  const sym = CURRENCY_SYMBOLS[getCurrency()] || getCurrency() + ' ';
  const fmtV = (v: number) => `${sym}${round(v, 2).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  try {
    if (analysisType === 'overview') {
      const acct = dataContext.account || {};
      const landscape = dataContext.campaignLandscape || {};
      const trends = dataContext.trends || {};
      const topCreative = dataContext.topCreative;

      let text = `Your account spent ${fmtV(acct.spend)} and generated ${fmtV(acct.revenue)} in revenue, giving you an overall ROAS of ${fmtNum(acct.roas)}x with ${fmtInt(acct.conversions)} conversions at a CPA of ${fmtV(acct.cpa)}.`;

      if (landscape.active) {
        text += ` You have ${landscape.active} active campaigns — ${landscape.profitable} are profitable and ${landscape.unprofitable} are losing money.`;
      }
      if (landscape.wastedSpend > 0) {
        const wastedPct = landscape.totalSpend > 0 ? round((landscape.wastedSpend / landscape.totalSpend) * 100, 1) : 0;
        text += ` About ${fmtV(landscape.wastedSpend)} (${wastedPct}% of your budget) is going to unprofitable campaigns — that's money you should reallocate.`;
      }
      if (landscape.topCampaign) {
        text += ` Your best performer is "${landscape.topCampaign.name}" at ${fmtNum(landscape.topCampaign.roas)}x ROAS with ${fmtInt(landscape.topCampaign.conversions)} conversions.`;
      }
      if (landscape.worstCampaign && landscape.worstCampaign.roas < 1) {
        text += ` Your worst is "${landscape.worstCampaign.name}" at ${fmtNum(landscape.worstCampaign.roas)}x — consider pausing it and moving that ${fmtV(landscape.worstCampaign.spend)} budget to your winners.`;
      }
      if (trends.roas) {
        text += ` ROAS trend is ${trends.roas.direction || 'stable'}.`;
      }
      if (topCreative) {
        text += ` Top creative: "${topCreative.name}" with ${fmtNum(topCreative.roas)}x ROAS and ${fmtNum(topCreative.ctr)}% CTR.`;
      }
      text += ` Next step: pause campaigns below 1x ROAS and increase budget on your top 2-3 performers by 20%.`;
      return text;
    }

    if (analysisType === 'roas') {
      const acct = dataContext.account || {};
      const campaigns = dataContext.campaigns || [];
      const summary = dataContext.summary || {};

      let text = `Account-level ROAS: ${fmtNum(acct.roas)}x on ${fmtV(acct.spend)} spend generating ${fmtV(acct.revenue)} revenue.`;
      text += ` ${summary.profitable || 0} of ${summary.totalCampaigns || 0} campaigns are profitable.`;

      if (campaigns.length > 0) {
        const best = campaigns[0];
        text += ` Your best campaign is "${best.name}" at ${fmtNum(best.roas)}x ROAS.`;
        if (best.confidence && best.confidence.level === 'low') {
          text += ` However, the data confidence is low — small sample size, so take this with caution.`;
        }
        if (best.trend) {
          text += ` Its trend is ${best.trend.direction || 'stable'}.`;
        }
      }
      const losers = campaigns.filter((c: any) => c.roas < 1);
      if (losers.length > 0) {
        const loserSpend = losers.reduce((s: number, c: any) => s + (c.spend || 0), 0);
        text += ` ${losers.length} campaign${losers.length > 1 ? 's are' : ' is'} below 1x ROAS, burning ${fmtV(loserSpend)}.`;
      }
      text += ` Action: scale your top performer by 15-20% and pause anything below 0.5x ROAS.`;
      return text;
    }

    if (analysisType === 'spend') {
      const acct = dataContext.account || {};
      const waste = dataContext.wasteAnalysis || {};
      const campaigns = dataContext.campaigns || [];

      let text = `Total spend: ${fmtV(acct.spend)} generating ${fmtV(acct.revenue)} at ${fmtNum(acct.roas)}x ROAS.`;
      if (campaigns.length > 0) {
        text += ` Your biggest spender is "${campaigns[0].name}" at ${fmtV(campaigns[0].spend)} (${campaigns[0].percentOfTotal}% of budget) with ${fmtNum(campaigns[0].roas)}x ROAS.`;
      }
      if (waste.wastedSpend > 0) {
        text += ` You're wasting ${fmtV(waste.wastedSpend)} (${waste.wastedPercent}%) on ${waste.inefficientCount} underperforming campaign${waste.inefficientCount > 1 ? 's' : ''}.`;
        if (waste.topInefficient && waste.topInefficient.length > 0) {
          text += ` Worst offender: "${waste.topInefficient[0].name}" at ${fmtNum(waste.topInefficient[0].roas)}x ROAS spending ${fmtV(waste.topInefficient[0].spend)}.`;
        }
      }
      if (waste.topEfficient && waste.topEfficient.length > 0) {
        text += ` Best ROI: "${waste.topEfficient[0].name}" at ${fmtNum(waste.topEfficient[0].roas)}x — deserves more budget.`;
      }
      text += ` Action: redirect wasted spend to your efficient campaigns for immediate ROAS improvement.`;
      return text;
    }

    if (analysisType === 'audience') {
      const segments = dataContext.segments || [];
      const moneyPits = dataContext.moneyPits || [];
      const hiddenGems = dataContext.hiddenGems || [];
      const summary = dataContext.summary || {};

      let text = `Analyzed ${summary.totalSegments || 0} audience segments with ${fmtV(summary.totalSpend || 0)} total spend and ${fmtInt(summary.totalConversions || 0)} conversions (avg CPA: ${fmtV(summary.avgCpa || 0)}).`;
      if (segments.length > 0) {
        text += ` Your best converting segment is "${segments[0].name}" with ${fmtNum(segments[0].roas)}x ROAS at ${fmtV(segments[0].spend)} spend.`;
      }
      if (moneyPits.length > 0) {
        text += ` Warning: ${moneyPits.length} segment${moneyPits.length > 1 ? 's are' : ' is'} burning budget with sub-1x ROAS.`;
        text += ` Worst: "${moneyPits[0].name}" at ${fmtNum(moneyPits[0].roas)}x spending ${fmtV(moneyPits[0].spend)}.`;
      }
      if (hiddenGems.length > 0) {
        text += ` Hidden gem: "${hiddenGems[0].name}" has ${fmtNum(hiddenGems[0].roas)}x ROAS but only ${fmtV(hiddenGems[0].spend)} in spend — scale this up.`;
      }
      text += ` Action: exclude your worst-performing segments and increase bids on your top 3 converters.`;
      return text;
    }

    if (analysisType === 'creative') {
      const ads = dataContext.ads || [];
      const health = dataContext.portfolioHealth || {};
      const fatigue = dataContext.fatigueDetection || {};

      let text = `Your creative portfolio has ${health.totalAds || 0} ads with an average ${fmtNum(health.avgRoas || 0)}x ROAS and ${fmtNum(health.avgCtr || 0)}% CTR.`;
      text += ` ${health.highPerformers || 0} ads are outperforming and ${health.deadWeight || 0} are dead weight.`;
      if (ads.length > 0) {
        text += ` Your hero creative is "${ads[0].adName}" from "${ads[0].campaign}" with ${fmtNum(ads[0].roas)}x ROAS and ${fmtNum(ads[0].ctr)}% CTR.`;
      }
      if (fatigue.fatiguedCount > 0) {
        text += ` ${fatigue.fatiguedCount} ad${fatigue.fatiguedCount > 1 ? 's show' : ' shows'} signs of creative fatigue (CTR dropping below average despite high impressions).`;
      }
      text += ` Action: duplicate your top 3 creatives with slight variations (new headlines, different first 3 seconds) and pause anything below 0.5x ROAS.`;
      return text;
    }

    if (analysisType === 'cpa') {
      const acct = dataContext.account || {};
      const campaigns = dataContext.campaigns || [];
      const summary = dataContext.summary || {};

      let text = `Account CPA: ${fmtV(acct.cpa)} across ${fmtInt(acct.conversions)} conversions on ${fmtV(acct.spend)} spend.`;
      text += ` ${summary.withConversions || 0} of ${summary.totalCampaigns || 0} campaigns have conversions. ${summary.zeroConversions || 0} campaign${(summary.zeroConversions || 0) > 1 ? 's have' : ' has'} zero conversions, wasting ${fmtV(summary.deadSpend || 0)}.`;
      if (campaigns.length > 0) {
        text += ` Most efficient: "${campaigns[0].name}" at ${fmtV(campaigns[0].cpa)} CPA with ${fmtInt(campaigns[0].conversions)} conversions.`;
      }
      if (campaigns.length > 2) {
        const worst = campaigns[campaigns.length - 1];
        text += ` Least efficient: "${worst.name}" at ${fmtV(worst.cpa)} — ${round(worst.cpa / (acct.cpa || 1) * 100 - 100, 0)}% above average.`;
      }
      text += ` Action: pause zero-conversion campaigns immediately and reallocate that budget to your lowest-CPA performers.`;
      return text;
    }

    if (analysisType === 'forecast') {
      const proj = dataContext.projections || {};
      const trends = dataContext.trends || {};
      const avgs = dataContext.averages || {};
      const vol = dataContext.volatility || {};

      let text = `Based on ${vol.daysOfData || 0} days of data, your daily averages are ${fmtV(avgs.dailySpend || 0)} spend, ${fmtV(avgs.dailyRevenue || 0)} revenue, and ${fmtNum(avgs.dailyConversions || 0)} conversions.`;
      text += ` Projected next week: ${fmtV(proj.weeklySpend || 0)} spend, ${fmtV(proj.weeklyRevenue || 0)} revenue, ~${proj.weeklyConversions || 0} conversions at ${fmtNum(proj.projectedRoas || 0)}x ROAS.`;
      if (trends.spend) text += ` Spend trend: ${trends.spend.direction || 'stable'}.`;
      if (trends.roas) text += ` ROAS trend: ${trends.roas.direction || 'stable'}.`;
      if (vol.spendCV > 0.5) text += ` Note: your spend has high day-to-day volatility (CV: ${vol.spendCV}) which makes projections less reliable.`;
      text += ` Action: if ROAS is trending up, increase daily budget by 10-15%. If declining, audit your worst campaigns before scaling.`;
      return text;
    }

    if (analysisType === 'comparison') {
      const current = dataContext.current_period || {};
      const previous = dataContext.previous_period || {};
      const changes = dataContext.changes || {};

      let text = `Comparing ${current.preset || 'current'} vs ${previous.preset || 'previous'}:`;
      text += ` ROAS moved from ${fmtNum(previous.roas || 0)}x to ${fmtNum(current.roas || 0)}x (${changes.roas > 0 ? '+' : ''}${fmtNum(changes.roas || 0)}x).`;
      text += ` Spend: ${fmtV(previous.spend || 0)} -> ${fmtV(current.spend || 0)}.`;
      text += ` Revenue: ${fmtV(previous.revenue || 0)} -> ${fmtV(current.revenue || 0)}.`;
      if (changes.roas > 0) {
        text += ` Your efficiency is improving — good sign. Consider scaling spend by 15-20% to capitalize.`;
      } else if (changes.roas < -0.3) {
        text += ` ROAS is declining significantly. Check if new creatives are underperforming or if audience fatigue is setting in.`;
      } else {
        text += ` Performance is holding steady. Focus on creative refresh to unlock the next level of growth.`;
      }
      return text;
    }

    if (analysisType === 'script') {
      const topAds = dataContext.topAds || [];
      const avgs = dataContext.averages || {};
      const contentType = dataContext.requestedContentType || 'video script';

      let text = `Based on your account data (avg ${fmtNum(avgs.roas || 0)}x ROAS, ${fmtNum(avgs.ctr || 0)}% CTR across ${dataContext.totalAds || 0} ads), here's what's working for your ${contentType}:`;
      if (topAds.length > 0) {
        text += ` Your top performer "${topAds[0].name}" (${fmtNum(topAds[0].roas)}x ROAS) is the pattern to follow.`;
      }
      text += `\n\nI need Claude AI to generate custom ${contentType} for you, but the AI service is temporarily unavailable. In the meantime, analyze your top-performing ads in the Creative Cockpit to identify winning patterns, then use the Creative Engine to generate new variations.`;
      return text;
    }
  } catch (err) {
    logger.error({ err }, 'Smart fallback generation error');
  }

  // Ultimate fallback — still better than the old static message
  return "Your data is loaded in the chart and table below. I'm analyzing your campaigns — for a deeper strategic breakdown, try asking a specific question like 'What's my best campaign?' or 'Where am I wasting budget?'";
}
