/**
 * Audit Agent - Analyzes Meta Ads data using AI (Gemini primary, Claude fallback)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_AUDIT_CONFIG,
  CATEGORY_BENCHMARKS,
  type AuditInput,
  type AuditOutput,
  type CreativeAnalysisSection,
  type CreativePerformance,
  type AuditInsight,
  type AuditRecommendation,
  type AuditConfig,
  type BrandCategory,
} from './types.js';

// Lazy initialization to ensure env vars are loaded
let gemini: GoogleGenerativeAI | null = null;
let anthropic: Anthropic | null = null;

function getGemini(): GoogleGenerativeAI | null {
  const apiKey = process.env['GOOGLE_AI_API_KEY'];
  if (!gemini && apiKey) {
    gemini = new GoogleGenerativeAI(apiKey);
  }
  return gemini;
}

function getAnthropic(): Anthropic | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropic && apiKey) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

/**
 * Sanitize text to remove invalid unicode characters
 */
function sanitizeText(text: string | null, fallback: string = 'N/A'): string {
  if (!text) return fallback;
  // Convert to array of code points, filter out invalid ones, rejoin
  const sanitized = Array.from(text)
    .filter(char => {
      const code = char.codePointAt(0)!;
      // Keep standard printable ASCII, common extended ASCII, and valid Unicode
      if (code < 32 && code !== 10 && code !== 13 && code !== 9) return false; // Control chars
      if (code >= 0xD800 && code <= 0xDFFF) return false; // Surrogate range
      if (code >= 0xFFFE && code <= 0xFFFF) return false; // Non-characters
      return true;
    })
    .join('');
  return sanitized || fallback;
}

/**
 * Run creative analysis audit
 */
export async function runCreativeAudit(
  input: AuditInput,
  config: AuditConfig = DEFAULT_AUDIT_CONFIG
): Promise<AuditOutput> {
  const { brand, metaData, context } = input;

  if (!metaData) {
    throw new Error('No Meta data available for audit');
  }

  // 1. Identify winners and losers
  const { winners, losers, wastedSpend } = analyzeCreatives(metaData.creatives, config);

  // 2. Generate insights - try Gemini, then Claude, then rule-based fallback
  let insights: AuditInsight[];
  let recommendations: AuditRecommendation[];
  let winnerReasons: string[];
  let loserReasons: { reason: string; recommendation: string }[];

  try {
    const analysisPrompt = buildAnalysisPrompt(input, winners, losers, wastedSpend);
    const aiResponse = await analyzeWithAI(analysisPrompt);
    const parsed = parseClaudeResponse(aiResponse, winners, losers);
    insights = parsed.insights;
    recommendations = parsed.recommendations;
    winnerReasons = parsed.winnerReasons;
    loserReasons = parsed.loserReasons;
  } catch (error) {
    console.log('   ⚠️ AI unavailable, using rule-based analysis');
    const fallback = generateFallbackAnalysis(input, winners, losers, wastedSpend);
    insights = fallback.insights;
    recommendations = fallback.recommendations;
    winnerReasons = fallback.winnerReasons;
    loserReasons = fallback.loserReasons;
  }

  // 4. Build creative analysis section
  const creativeAnalysis: CreativeAnalysisSection = {
    winners: winners.map((creative, i) => ({
      creative,
      whyItWorks: winnerReasons[i] || 'High conversion rate with efficient spend',
    })),
    losers: losers.map((creative, i) => ({
      creative,
      whyItFails: loserReasons[i]?.reason || 'Low conversion despite significant spend',
      recommendation: loserReasons[i]?.recommendation || 'Pause and reallocate budget',
    })),
    wastedSpend,
    insights,
    recommendations,
  };

  // 5. Build summary
  const summary = {
    healthScore: calculateHealthScore(metaData, wastedSpend.total),
    topFindings: insights.slice(0, 3).map(i => i.title),
    topPriority: recommendations[0]?.title || 'Review creative performance',
    wastedSpend: wastedSpend.total,
    bestCpa: winners[0]?.cpa || 0,
    worstCpa: losers[0]?.cpa || 0,
  };

  // 6. Determine confidence
  const confidence = {
    level: metaData.creatives.length >= 10 ? 'high' as const :
           metaData.creatives.length >= 5 ? 'medium' as const : 'low' as const,
    reason: metaData.creatives.length < 5
      ? 'Limited creative data available'
      : 'Sufficient data for analysis',
  };

  return {
    auditId: generateAuditId(),
    brandId: brand.id,
    brandName: brand.name,
    createdAt: new Date().toISOString(),
    dateRange: input.dateRange,
    summary,
    creativeAnalysis,
    confidence,
  };
}

/**
 * Analyze creatives - find winners, losers, wasted spend
 */
function analyzeCreatives(
  creatives: CreativePerformance[],
  config: AuditConfig
): {
  winners: CreativePerformance[];
  losers: CreativePerformance[];
  wastedSpend: { total: number; creatives: { adId: string; adName: string; amount: number }[] };
} {
  // Filter by minimum spend
  const significantCreatives = creatives.filter(c => c.spend >= config.minSpendForAnalysis);

  // Winners: Have purchases and good CPA
  const withPurchases = significantCreatives.filter(c => c.purchases > 0);
  const avgCpa = withPurchases.length > 0
    ? withPurchases.reduce((sum, c) => sum + c.cpa, 0) / withPurchases.length
    : 0;

  const winners = withPurchases
    .filter(c => c.cpa <= avgCpa * 1.2) // Within 20% of avg CPA
    .sort((a, b) => a.cpa - b.cpa)
    .slice(0, 5);

  // Losers: High spend, no/few purchases
  const targetCpa = avgCpa > 0 ? avgCpa : 2000; // Default ₹2000 if no baseline
  const killThreshold = targetCpa * config.killThresholdMultiplier;

  const losers = significantCreatives
    .filter(c => c.purchases <= 1 && c.spend >= killThreshold * 0.5)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  // Wasted spend: Spend on creatives with 0-1 purchases
  const wastedCreatives = significantCreatives
    .filter(c => c.purchases <= 1)
    .sort((a, b) => b.spend - a.spend);

  const wastedSpend = {
    total: wastedCreatives.reduce((sum, c) => sum + c.spend, 0),
    creatives: wastedCreatives.slice(0, 10).map(c => ({
      adId: c.adId,
      adName: c.adName,
      amount: c.spend,
    })),
  };

  return { winners, losers, wastedSpend };
}

/**
 * Generate fallback analysis when Claude API is unavailable
 */
function generateFallbackAnalysis(
  input: AuditInput,
  winners: CreativePerformance[],
  losers: CreativePerformance[],
  wastedSpend: { total: number; creatives: any[] }
): {
  insights: AuditInsight[];
  recommendations: AuditRecommendation[];
  winnerReasons: string[];
  loserReasons: { reason: string; recommendation: string }[];
} {
  const { metaData, brand } = input;
  const insights: AuditInsight[] = [];
  const recommendations: AuditRecommendation[] = [];

  // Generate insights based on data patterns
  if (wastedSpend.total > 5000) {
    insights.push({
      severity: 'critical',
      title: 'High Wasted Spend Detected',
      detail: `₹${wastedSpend.total.toLocaleString('en-IN')} spent on creatives with 0-1 conversions. This represents a significant optimization opportunity.`,
      dataPoints: { wastedAmount: wastedSpend.total, creativesAffected: wastedSpend.creatives.length },
    });
  }

  if (winners.length === 0) {
    insights.push({
      severity: 'critical',
      title: 'No Clear Winners',
      detail: 'No creatives are performing above the efficiency threshold. Consider testing new creative concepts or reviewing targeting.',
      dataPoints: { totalCreatives: metaData?.creatives.length || 0 },
    });
  } else if (winners.length >= 3) {
    insights.push({
      severity: 'info',
      title: 'Multiple Winning Creatives',
      detail: `${winners.length} creatives are performing well. Consider scaling budget on top performers.`,
      dataPoints: { winnerCount: winners.length, avgCpa: winners.reduce((s, w) => s + w.cpa, 0) / winners.length },
    });
  }

  if (losers.length > 3) {
    insights.push({
      severity: 'warning',
      title: 'Multiple Underperformers Active',
      detail: `${losers.length} creatives have high spend but poor conversion rates. Pausing these could save budget.`,
      dataPoints: { loserCount: losers.length, potentialSavings: losers.reduce((s, l) => s + l.spend, 0) },
    });
  }

  // Check for funnel issues
  const creativesWithLpv = metaData?.creatives?.filter(c => c.landingPageViews > 0) || [];
  const avgLpvToAtc = creativesWithLpv.length > 0
    ? creativesWithLpv.reduce((sum, c) => sum + c.lpvToAtcRate, 0) / creativesWithLpv.length
    : 0;

  if (avgLpvToAtc < 5) {
    insights.push({
      severity: 'warning',
      title: 'Low Add-to-Cart Rate',
      detail: `Average LPV to ATC rate is ${avgLpvToAtc.toFixed(1)}%. Industry benchmark is 8-12%. Consider landing page optimization.`,
      dataPoints: { avgLpvToAtcRate: avgLpvToAtc },
    });
  }

  // Generate recommendations
  if (losers.length > 0) {
    recommendations.push({
      priority: 'high',
      title: `Pause ${losers.length} Underperforming Creatives`,
      description: `These creatives have spent ₹${losers.reduce((s, l) => s + l.spend, 0).toLocaleString('en-IN')} with minimal conversions.`,
      expectedImpact: 'Immediate budget savings and improved overall ROAS',
      effort: 'low',
    });
  }

  if (winners.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Scale Top Performers',
      description: `Increase budget allocation to your ${winners.length} winning creatives with avg CPA of ₹${(winners.reduce((s, w) => s + w.cpa, 0) / winners.length).toFixed(0)}.`,
      expectedImpact: 'Increased conversions at efficient CPA',
      effort: 'low',
    });
  }

  recommendations.push({
    priority: 'medium',
    title: 'Test New Creative Concepts',
    description: 'Based on winning creative patterns, develop 3-5 new variations to expand your creative library.',
    expectedImpact: 'Discover new winning creatives and reduce creative fatigue',
    effort: 'medium',
  });

  if (avgLpvToAtc < 8) {
    recommendations.push({
      priority: 'medium',
      title: 'Optimize Landing Page',
      description: 'Low add-to-cart rates suggest friction in the landing experience. Review page load speed, mobile UX, and product presentation.',
      expectedImpact: 'Higher conversion rates from existing traffic',
      effort: 'medium',
    });
  }

  // Generate winner reasons
  const winnerReasons = winners.map(w => {
    if (w.roas >= 3) return `Strong ROAS of ${w.roas.toFixed(1)}x with efficient spend`;
    if (w.cpa < 500) return `Excellent CPA of ₹${w.cpa.toFixed(0)} - significantly below average`;
    if (w.purchases >= 5) return `High conversion volume (${w.purchases} purchases) showing consistent performance`;
    return `Efficient conversion rate with good cost metrics`;
  });

  // Generate loser reasons
  const loserReasons = losers.map(l => {
    if (l.purchases === 0) {
      return {
        reason: `Zero conversions despite ₹${l.spend.toFixed(0)} spend`,
        recommendation: 'Pause immediately and reallocate budget',
      };
    }
    if (l.cpa > 2000) {
      return {
        reason: `Very high CPA of ₹${l.cpa.toFixed(0)} - inefficient spend`,
        recommendation: 'Pause or significantly reduce budget',
      };
    }
    return {
      reason: `Poor conversion rate with ${l.purchases} purchase(s) on ₹${l.spend.toFixed(0)} spend`,
      recommendation: 'Test new creative angle or pause',
    };
  });

  return { insights, recommendations, winnerReasons, loserReasons };
}

/**
 * Build prompt for Claude analysis
 */
function buildAnalysisPrompt(
  input: AuditInput,
  winners: CreativePerformance[],
  losers: CreativePerformance[],
  wastedSpend: { total: number; creatives: any[] }
): string {
  const { brand, metaData, context, shopifyData, websiteData } = input;

  // Get category benchmarks
  const benchmark = CATEGORY_BENCHMARKS[brand.category as BrandCategory] || CATEGORY_BENCHMARKS.other;

  let prompt = `You are an expert performance marketer analyzing Meta Ads creative performance for ${brand.name}.

BRAND CONTEXT:
- Category: ${brand.category}
- Stage: ${brand.stage}
- Domain: ${brand.domain}
`;

  if (context) {
    prompt += `- Price Point: ${context.pricePoint}
- Known winning patterns: ${context.winningCreativePatterns.join(', ') || 'None recorded'}
- Known failed approaches: ${context.failedApproaches.join(', ') || 'None recorded'}
`;
  }

  // Add website data if available
  if (websiteData && websiteData.productCount > 0) {
    prompt += `
WEBSITE ANALYSIS:
- Price Range: ₹${websiteData.priceRange.min.toFixed(0)} - ₹${websiteData.priceRange.max.toFixed(0)} (avg ₹${websiteData.priceRange.average.toFixed(0)})
- Price Point: ${websiteData.pricePoint}
- Products: ${websiteData.productCount}
- Trust Signals: ${websiteData.trustSignals.join(', ') || 'None detected'}
- Has Reviews: ${websiteData.hasReviews ? 'Yes' : 'No'}
- Free Shipping: ${websiteData.hasFreeShipping ? 'Yes' : 'No'}
`;
  }

  // Add category benchmarks
  prompt += `
CATEGORY BENCHMARKS (${brand.category}):
- Target CPA: ₹${benchmark.targetCpa.low} (good) - ₹${benchmark.targetCpa.mid} (avg) - ₹${benchmark.targetCpa.high} (poor)
- Target ROAS: ${benchmark.targetRoas.low}x (poor) - ${benchmark.targetRoas.mid}x (avg) - ${benchmark.targetRoas.high}x (good)
- Avg LPV→ATC Rate: ${benchmark.avgLpvToAtcRate}%
- Avg ATC→Purchase Rate: ${benchmark.avgAtcToPurchaseRate}%
- Top Creative Types: ${benchmark.topCreativeTypes.join(', ')}
`;

  prompt += `
META ADS OVERVIEW:
- Total Spend: ₹${metaData!.totalSpend.toFixed(0)}
- Total Purchases: ${metaData!.totalPurchases}
- Overall ROAS: ${metaData!.overallRoas.toFixed(2)}x ${getRoasRating(metaData!.overallRoas, benchmark)}
- Overall CPA: ₹${metaData!.overallCpa.toFixed(0)} ${getCpaRating(metaData!.overallCpa, benchmark)}
- Advanced Matching: ${metaData!.pixelHealth.advancedMatchingEnabled ? 'ON' : 'OFF'}`;

  // Add Shopify data if available
  if (shopifyData) {
    prompt += `

SHOPIFY STORE DATA:
- Total Revenue: ₹${shopifyData.totalRevenue.toFixed(0)}
- Total Orders: ${shopifyData.totalOrders}
- Average Order Value: ₹${shopifyData.averageOrderValue.toFixed(0)}
- New Customers: ${shopifyData.newCustomers}
- Returning Customers: ${shopifyData.returningCustomers}
- Repeat Purchase Rate: ${shopifyData.repeatPurchaseRate.toFixed(1)}%

TOP SELLING PRODUCTS:
${shopifyData.topProducts.slice(0, 5).map(p =>
  `- ${sanitizeText(p.title)}: ₹${p.revenue.toFixed(0)} revenue, ${p.unitsSold} units, ₹${p.averagePrice.toFixed(0)} avg price`
).join('\n')}`;
  }

  // Add Google Ads data if available
  const { googleAdsData } = input;
  if (googleAdsData && googleAdsData.totalSpend > 0) {
    prompt += `

GOOGLE ADS DATA:
- Total Spend: ₹${googleAdsData.totalSpend.toFixed(0)}
- Conversions: ${googleAdsData.totalConversions.toFixed(0)}
- Revenue: ₹${googleAdsData.totalRevenue.toFixed(0)}
- ROAS: ${googleAdsData.overallRoas.toFixed(2)}x
- CPA: ₹${googleAdsData.overallCpa.toFixed(0)}

TOP GOOGLE CAMPAIGNS:
${googleAdsData.campaigns.slice(0, 5).map(c =>
  `- ${sanitizeText(c.campaignName)}: Spend ₹${c.spend.toFixed(0)}, ${c.conversions.toFixed(0)} conv, ROAS ${c.roas.toFixed(2)}x`
).join('\n')}`;
  }

  prompt += `

WINNING CREATIVES (low CPA, conversions):
${winners.map(w => `- ${sanitizeText(w.adName)}: Spend ₹${w.spend.toFixed(0)}, ${w.purchases} purchases, CPA ₹${w.cpa.toFixed(0)}, Click→ATC ${w.lpvToAtcRate.toFixed(2)}%
  Copy: "${sanitizeText(w.primaryText)?.slice(0, 100)}..."`).join('\n')}

LOSING CREATIVES (high spend, no conversions):
${losers.map(l => `- ${sanitizeText(l.adName)}: Spend ₹${l.spend.toFixed(0)}, ${l.purchases} purchases, CPA ${l.cpa > 0 ? '₹' + l.cpa.toFixed(0) : 'N/A'}, Click→ATC ${l.lpvToAtcRate.toFixed(2)}%
  Copy: "${sanitizeText(l.primaryText)?.slice(0, 100)}..."`).join('\n')}

WASTED SPEND: ₹${wastedSpend.total.toFixed(0)} across ${wastedSpend.creatives.length} creatives with 0-1 purchases

ANALYZE AND RESPOND IN THIS EXACT JSON FORMAT:
{
  "insights": [
    {
      "severity": "critical|warning|info",
      "title": "Short title",
      "detail": "Specific detail with data"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "title": "Action title",
      "description": "What to do",
      "expectedImpact": "Expected result",
      "effort": "low|medium|high"
    }
  ],
  "winnerReasons": ["Why creative 1 works", "Why creative 2 works"],
  "loserReasons": [
    {"reason": "Why creative 1 fails", "recommendation": "What to do"},
    {"reason": "Why creative 2 fails", "recommendation": "What to do"}
  ]
}

CRITICAL RULES:
1. Every insight must reference specific numbers from the data above
2. Be specific - no generic advice like "optimize your ads"
3. Reference the actual creative names and their metrics
4. Compare winners vs losers - what's the difference?
5. Focus on actionable insights`;

  return prompt;
}

/**
 * Call Gemini for analysis (primary - free tier)
 */
async function analyzeWithGemini(prompt: string): Promise<string> {
  const genAI = getGemini();
  if (!genAI) {
    throw new Error('Gemini API key not configured');
  }

  const cleanPrompt = sanitizeText(prompt, prompt);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const result = await model.generateContent(cleanPrompt);
  const response = result.response;
  return response.text();
}

/**
 * Call Claude for analysis (fallback)
 */
async function analyzeWithClaude(prompt: string): Promise<string> {
  const client = getAnthropic();
  if (!client) {
    throw new Error('Anthropic API key not configured');
  }

  // Sanitize the entire prompt to remove invalid unicode
  const cleanPrompt = sanitizeText(prompt, prompt);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: cleanPrompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  return content.text;
}

/**
 * Analyze with AI - tries Gemini first, then Claude, then fallback
 */
async function analyzeWithAI(prompt: string): Promise<string> {
  // Try Gemini first (free tier)
  if (process.env['GOOGLE_AI_API_KEY']) {
    try {
      console.log('   Using Gemini (free tier)...');
      return await analyzeWithGemini(prompt);
    } catch (error) {
      console.log('   Gemini failed, trying Claude...');
    }
  }

  // Try Claude as fallback
  if (process.env['ANTHROPIC_API_KEY']) {
    try {
      console.log('   Using Claude...');
      return await analyzeWithClaude(prompt);
    } catch (error) {
      console.log('   Claude failed, using rule-based analysis...');
    }
  }

  throw new Error('No AI provider available');
}

/**
 * Parse Claude's JSON response
 */
function parseClaudeResponse(
  response: string,
  winners: CreativePerformance[],
  losers: CreativePerformance[]
): {
  insights: AuditInsight[];
  recommendations: AuditRecommendation[];
  winnerReasons: string[];
  loserReasons: { reason: string; recommendation: string }[];
} {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      insights: parsed.insights || [],
      recommendations: parsed.recommendations || [],
      winnerReasons: parsed.winnerReasons || [],
      loserReasons: parsed.loserReasons || [],
    };
  } catch (error) {
    // Fallback with basic analysis
    console.error('Failed to parse Claude response:', error);

    return {
      insights: [
        {
          severity: 'warning',
          title: 'Analysis parsing failed',
          detail: 'Manual review recommended',
          dataPoints: {},
        },
      ],
      recommendations: [
        {
          priority: 'high',
          title: 'Review creative performance manually',
          description: 'Automated analysis encountered an error',
          expectedImpact: 'Unknown',
          effort: 'medium',
        },
      ],
      winnerReasons: winners.map(() => 'Good conversion rate'),
      loserReasons: losers.map(() => ({ reason: 'Poor conversion', recommendation: 'Pause' })),
    };
  }
}

/**
 * Calculate health score (0-100)
 */
function calculateHealthScore(
  metaData: AuditInput['metaData'],
  wastedSpend: number
): number {
  if (!metaData) return 0;

  let score = 50; // Base score

  // ROAS factor (+/- 20 points)
  if (metaData.overallRoas >= 2) score += 20;
  else if (metaData.overallRoas >= 1.5) score += 10;
  else if (metaData.overallRoas >= 1) score += 0;
  else if (metaData.overallRoas >= 0.5) score -= 10;
  else score -= 20;

  // Wasted spend factor (+/- 15 points)
  const wastedRatio = metaData.totalSpend > 0 ? wastedSpend / metaData.totalSpend : 0;
  if (wastedRatio < 0.1) score += 15;
  else if (wastedRatio < 0.2) score += 5;
  else if (wastedRatio < 0.3) score -= 5;
  else score -= 15;

  // Pixel health (+/- 10 points)
  if (metaData.pixelHealth.advancedMatchingEnabled) score += 10;
  else score -= 5;

  // Audience utilization (+/- 5 points)
  if (metaData.lookalikeCount > 0) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate audit ID
 */
function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get ROAS rating compared to benchmark
 */
function getRoasRating(roas: number, benchmark: { targetRoas: { low: number; mid: number; high: number } }): string {
  if (roas >= benchmark.targetRoas.high) return '(EXCELLENT)';
  if (roas >= benchmark.targetRoas.mid) return '(GOOD)';
  if (roas >= benchmark.targetRoas.low) return '(BELOW AVG)';
  return '(POOR)';
}

/**
 * Get CPA rating compared to benchmark
 */
function getCpaRating(cpa: number, benchmark: { targetCpa: { low: number; mid: number; high: number } }): string {
  if (cpa === 0) return '(NO DATA)';
  if (cpa <= benchmark.targetCpa.low) return '(EXCELLENT)';
  if (cpa <= benchmark.targetCpa.mid) return '(GOOD)';
  if (cpa <= benchmark.targetCpa.high) return '(BELOW AVG)';
  return '(POOR)';
}
