/**
 * Competitor Creative Intelligence — Human-readable report formatting.
 */

import type { CreativeIntelReport } from '../types.js';

// ============ FORMATTED OUTPUT ============

export function formatCreativeIntelReport(report: CreativeIntelReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('              COMPETITOR CREATIVE INTELLIGENCE REPORT');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Search: "${report.searchQuery}"`);
  lines.push(`Analyzed: ${report.totalAdsAnalyzed} ads from ${report.competitors.length} competitors`);
  lines.push(`Date: ${new Date(report.analyzedAt).toLocaleString()}`);
  lines.push('');

  // Industry Patterns
  lines.push('┌──────────────────────────────────────────────────────────────────────┐');
  lines.push('│                      INDUSTRY PATTERNS                               │');
  lines.push('└──────────────────────────────────────────────────────────────────────┘');
  lines.push('');

  lines.push('Top Hook Types:');
  for (const hook of report.industryPatterns.dominantHooks.slice(0, 3)) {
    lines.push(`  • ${hook.type}: ${hook.percentage}% (${hook.count} ads)`);
  }
  lines.push('');

  lines.push('Top Offer Types:');
  for (const offer of report.industryPatterns.dominantOffers.slice(0, 3)) {
    lines.push(`  • ${offer.type}: ${offer.percentage}% (${offer.count} ads)`);
  }
  lines.push('');

  lines.push(`Average Ad Age: ${report.industryPatterns.avgAdAge} days`);
  lines.push('');

  // Longest Running Ads
  if (report.industryPatterns.longestRunningAds.length > 0) {
    lines.push('Longest Running Ads (Likely Profitable):');
    for (const ad of report.industryPatterns.longestRunningAds.slice(0, 3)) {
      lines.push(`  • ${ad.pageName} - ${ad.daysRunning} days`);
      lines.push(`    Hook: "${ad.hookText || ad.primaryText?.slice(0, 50) || 'N/A'}..."`);
      lines.push(`    ${ad.snapshotUrl}`);
    }
    lines.push('');
  }

  // Competitors
  lines.push('┌──────────────────────────────────────────────────────────────────────┐');
  lines.push('│                      COMPETITOR BREAKDOWN                            │');
  lines.push('└──────────────────────────────────────────────────────────────────────┘');
  lines.push('');

  for (const comp of report.competitors.slice(0, 5)) {
    lines.push(`📊 ${comp.pageName}`);
    lines.push(`   ├─ Active Ads: ${comp.activeAds} | Avg Age: ${comp.avgAdAge} days`);
    lines.push(`   ├─ Top Hook: ${comp.topHookTypes[0]?.type || 'N/A'} (${comp.topHookTypes[0]?.percentage || 0}%)`);
    lines.push(`   ├─ Top Offer: ${comp.topOfferTypes[0]?.type || 'N/A'}`);
    if (comp.longestRunningAd) {
      lines.push(`   ├─ Best Performer: Running ${comp.longestRunningAd.daysRunning} days`);
      if (comp.longestRunningAd.hookText || comp.longestRunningAd.primaryText) {
        const text = comp.longestRunningAd.hookText || comp.longestRunningAd.primaryText || '';
        lines.push(`   │  "${text.slice(0, 55)}${text.length > 55 ? '...' : ''}"`);
      }
      lines.push(`   └─ 👁️ VIEW: ${comp.longestRunningAd.snapshotUrl}`);
    }
    lines.push('');
  }

  // Recommendations
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                      RECOMMENDATIONS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const rec of report.recommendations) {
    const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
    lines.push(`${priority} [${rec.category}]`);
    lines.push(`   ${rec.insight}`);
    lines.push(`   → ACTION: ${rec.action}`);
    lines.push('');
  }

  // Swipe File - Visual Gallery with Links
  if (report.swipeFile.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('                 🎨 CREATIVE SWIPE FILE (Click to View)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    for (const category of report.swipeFile) {
      lines.push(`┌─────────────────────────────────────────────────────────────────────┐`);
      lines.push(`│ 📁 ${category.category.padEnd(50)} (${String(category.count).padStart(2)} ads) │`);
      lines.push(`│    ${category.description.padEnd(61)} │`);
      lines.push(`└─────────────────────────────────────────────────────────────────────┘`);
      lines.push('');

      for (const ad of category.ads.slice(0, 5)) {
        lines.push(`  🖼️  ${ad.pageName}`);
        lines.push(`      ├─ Running: ${ad.daysRunning} days | Hook: ${ad.hookType}`);
        if (ad.hookText) {
          lines.push(`      ├─ "${ad.hookText.slice(0, 60)}${ad.hookText.length > 60 ? '...' : ''}"`);
        } else if (ad.primaryText) {
          lines.push(`      ├─ "${ad.primaryText.slice(0, 60)}${ad.primaryText.length > 60 ? '...' : ''}"`);
        }
        lines.push(`      └─ 👁️ VIEW AD: ${ad.snapshotUrl}`);
        lines.push('');
      }
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('💡 TIP: Click any "VIEW AD" link to see the actual creative on Meta Ad Library');
  lines.push('');

  return lines.join('\n');
}
