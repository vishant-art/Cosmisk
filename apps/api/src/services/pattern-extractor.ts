/**
 * Pattern Extractor — Cosmisk
 *
 * Extracts visual and strategic patterns from competitor ads.
 * Uses Gemini Vision to analyze ad images and extract:
 * - Typography patterns (fonts, sizes, weights)
 * - Layout patterns (product placement, text zones, CTA position)
 * - Color patterns (palette, dominant colors)
 * - Hook patterns (consolidated from competitor-creative-intel)
 * - Visual style (minimal, bold, lifestyle, etc.)
 *
 * These patterns become the "taste benchmark" for each client.
 * The quality validator compares generated ads against these patterns.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { safeFetch } from '../utils/safe-fetch.js';
import type { CreativeAnalysis, CreativeIntelReport } from './competitor-creative-intel.js';

// ============ TYPES ============

export interface TypographyPattern {
  primaryFont: 'serif' | 'sans-serif' | 'display' | 'handwritten' | 'mixed';
  headlineWeight: 'light' | 'regular' | 'bold' | 'black';
  textHierarchy: 'clear' | 'moderate' | 'flat';
  textDensity: 'minimal' | 'moderate' | 'heavy';
  textPlacement: 'top' | 'center' | 'bottom' | 'overlay' | 'split';
}

export interface LayoutPattern {
  productPlacement: 'center' | 'left' | 'right' | 'full-bleed' | 'lifestyle-context' | 'no-product';
  layoutType: 'single-focus' | 'split-screen' | 'grid' | 'collage' | 'text-heavy' | 'minimal';
  ctaPosition: 'bottom' | 'center' | 'top-right' | 'embedded' | 'none';
  whitespaceUsage: 'generous' | 'balanced' | 'dense';
  visualBalance: 'symmetric' | 'asymmetric' | 'dynamic';
}

export interface ColorPattern {
  dominantColors: string[]; // hex codes
  colorScheme: 'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'neutral';
  backgroundStyle: 'solid' | 'gradient' | 'image' | 'pattern' | 'transparent';
  contrastLevel: 'high' | 'medium' | 'low';
  mood: 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted';
}

export interface HookPattern {
  hookTypes: Array<{ type: string; frequency: number; examples: string[] }>;
  dominantHook: string;
  ctaTypes: Array<{ type: string; frequency: number; examples: string[] }>;
  dominantCta: string;
  offerTypes: Array<{ type: string; frequency: number }>;
  emotionalTriggers: string[];
}

export interface VisualStylePattern {
  overallStyle: 'premium' | 'casual' | 'playful' | 'clinical' | 'lifestyle' | 'ugc-native' | 'editorial';
  sophisticationLevel: 1 | 2 | 3 | 4 | 5; // 1=basic, 5=luxury
  feedNativeScore: number; // 0-100, how native to Instagram/Facebook feed
  brandConsistency: 'strong' | 'moderate' | 'weak';
  uniqueElements: string[]; // distinctive visual elements competitors use
}

export interface ExtractedPatterns {
  clientId: string;
  category: string;
  extractedAt: string;

  // Source info
  competitorsAnalyzed: number;
  adsAnalyzed: number;
  topCompetitors: string[];

  // Patterns
  typography: TypographyPattern;
  layout: LayoutPattern;
  colors: ColorPattern;
  hooks: HookPattern;
  visualStyle: VisualStylePattern;

  // Quality benchmark
  qualityBenchmark: {
    minSophisticationScore: number;
    minFeedNativeScore: number;
    mustHaveElements: string[];
    mustAvoidElements: string[];
  };

  // Raw reference ads for comparison
  referenceAds: Array<{
    snapshotUrl: string;
    pageName: string;
    daysRunning: number;
    hookType: string;
    whySelected: string;
  }>;
}

// ============ GEMINI VISION ANALYSIS ============

const gemini = config.geminiApiKey ? new GoogleGenerativeAI(config.geminiApiKey) : null;

interface AdImageAnalysis {
  typography: TypographyPattern;
  layout: LayoutPattern;
  colors: ColorPattern;
  visualStyle: Omit<VisualStylePattern, 'brandConsistency' | 'uniqueElements'>;
}

/**
 * Analyze a single ad image with Gemini Vision
 */
async function analyzeAdImage(imageUrl: string): Promise<AdImageAnalysis | null> {
  if (!gemini) {
    logger.warn('[PatternExtractor] Gemini not configured, skipping visual analysis');
    return null;
  }

  try {
    // Fetch image as base64
    const response = await safeFetch(imageUrl, { service: 'Ad Image' });
    if (!response.ok) {
      logger.warn(`[PatternExtractor] Failed to fetch image: ${imageUrl}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Analyze this advertisement image and extract visual patterns. Return ONLY valid JSON.

{
  "typography": {
    "primaryFont": "serif|sans-serif|display|handwritten|mixed",
    "headlineWeight": "light|regular|bold|black",
    "textHierarchy": "clear|moderate|flat",
    "textDensity": "minimal|moderate|heavy",
    "textPlacement": "top|center|bottom|overlay|split"
  },
  "layout": {
    "productPlacement": "center|left|right|full-bleed|lifestyle-context|no-product",
    "layoutType": "single-focus|split-screen|grid|collage|text-heavy|minimal",
    "ctaPosition": "bottom|center|top-right|embedded|none",
    "whitespaceUsage": "generous|balanced|dense",
    "visualBalance": "symmetric|asymmetric|dynamic"
  },
  "colors": {
    "dominantColors": ["#hex1", "#hex2", "#hex3"],
    "colorScheme": "monochromatic|complementary|analogous|triadic|neutral",
    "backgroundStyle": "solid|gradient|image|pattern|transparent",
    "contrastLevel": "high|medium|low",
    "mood": "warm|cool|neutral|vibrant|muted"
  },
  "visualStyle": {
    "overallStyle": "premium|casual|playful|clinical|lifestyle|ugc-native|editorial",
    "sophisticationLevel": 1-5,
    "feedNativeScore": 0-100
  }
}`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: base64 } },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('[PatternExtractor] No JSON in Gemini response');
      return null;
    }

    return JSON.parse(jsonMatch[0]) as AdImageAnalysis;
  } catch (err) {
    logger.error(`[PatternExtractor] Gemini analysis failed: ${err}`);
    return null;
  }
}

/**
 * Analyze multiple ad images and aggregate patterns
 */
async function analyzeMultipleAds(imageUrls: string[]): Promise<AdImageAnalysis[]> {
  const results: AdImageAnalysis[] = [];

  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < imageUrls.length; i += 3) {
    const batch = imageUrls.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(url => analyzeAdImage(url))
    );
    results.push(...batchResults.filter((r): r is AdImageAnalysis => r !== null));

    // Small delay between batches
    if (i + 3 < imageUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// ============ PATTERN AGGREGATION ============

function aggregateTypography(analyses: AdImageAnalysis[]): TypographyPattern {
  const counts = {
    primaryFont: {} as Record<string, number>,
    headlineWeight: {} as Record<string, number>,
    textHierarchy: {} as Record<string, number>,
    textDensity: {} as Record<string, number>,
    textPlacement: {} as Record<string, number>,
  };

  for (const a of analyses) {
    counts.primaryFont[a.typography.primaryFont] = (counts.primaryFont[a.typography.primaryFont] || 0) + 1;
    counts.headlineWeight[a.typography.headlineWeight] = (counts.headlineWeight[a.typography.headlineWeight] || 0) + 1;
    counts.textHierarchy[a.typography.textHierarchy] = (counts.textHierarchy[a.typography.textHierarchy] || 0) + 1;
    counts.textDensity[a.typography.textDensity] = (counts.textDensity[a.typography.textDensity] || 0) + 1;
    counts.textPlacement[a.typography.textPlacement] = (counts.textPlacement[a.typography.textPlacement] || 0) + 1;
  }

  const mode = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    primaryFont: (mode(counts.primaryFont) || 'sans-serif') as TypographyPattern['primaryFont'],
    headlineWeight: (mode(counts.headlineWeight) || 'bold') as TypographyPattern['headlineWeight'],
    textHierarchy: (mode(counts.textHierarchy) || 'clear') as TypographyPattern['textHierarchy'],
    textDensity: (mode(counts.textDensity) || 'moderate') as TypographyPattern['textDensity'],
    textPlacement: (mode(counts.textPlacement) || 'bottom') as TypographyPattern['textPlacement'],
  };
}

function aggregateLayout(analyses: AdImageAnalysis[]): LayoutPattern {
  const counts = {
    productPlacement: {} as Record<string, number>,
    layoutType: {} as Record<string, number>,
    ctaPosition: {} as Record<string, number>,
    whitespaceUsage: {} as Record<string, number>,
    visualBalance: {} as Record<string, number>,
  };

  for (const a of analyses) {
    counts.productPlacement[a.layout.productPlacement] = (counts.productPlacement[a.layout.productPlacement] || 0) + 1;
    counts.layoutType[a.layout.layoutType] = (counts.layoutType[a.layout.layoutType] || 0) + 1;
    counts.ctaPosition[a.layout.ctaPosition] = (counts.ctaPosition[a.layout.ctaPosition] || 0) + 1;
    counts.whitespaceUsage[a.layout.whitespaceUsage] = (counts.whitespaceUsage[a.layout.whitespaceUsage] || 0) + 1;
    counts.visualBalance[a.layout.visualBalance] = (counts.visualBalance[a.layout.visualBalance] || 0) + 1;
  }

  const mode = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    productPlacement: (mode(counts.productPlacement) || 'center') as LayoutPattern['productPlacement'],
    layoutType: (mode(counts.layoutType) || 'single-focus') as LayoutPattern['layoutType'],
    ctaPosition: (mode(counts.ctaPosition) || 'bottom') as LayoutPattern['ctaPosition'],
    whitespaceUsage: (mode(counts.whitespaceUsage) || 'balanced') as LayoutPattern['whitespaceUsage'],
    visualBalance: (mode(counts.visualBalance) || 'symmetric') as LayoutPattern['visualBalance'],
  };
}

function aggregateColors(analyses: AdImageAnalysis[]): ColorPattern {
  const allColors: string[] = [];
  const counts = {
    colorScheme: {} as Record<string, number>,
    backgroundStyle: {} as Record<string, number>,
    contrastLevel: {} as Record<string, number>,
    mood: {} as Record<string, number>,
  };

  for (const a of analyses) {
    allColors.push(...a.colors.dominantColors);
    counts.colorScheme[a.colors.colorScheme] = (counts.colorScheme[a.colors.colorScheme] || 0) + 1;
    counts.backgroundStyle[a.colors.backgroundStyle] = (counts.backgroundStyle[a.colors.backgroundStyle] || 0) + 1;
    counts.contrastLevel[a.colors.contrastLevel] = (counts.contrastLevel[a.colors.contrastLevel] || 0) + 1;
    counts.mood[a.colors.mood] = (counts.mood[a.colors.mood] || 0) + 1;
  }

  // Get most common colors
  const colorFreq: Record<string, number> = {};
  for (const c of allColors) {
    colorFreq[c] = (colorFreq[c] || 0) + 1;
  }
  const topColors = Object.entries(colorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([color]) => color);

  const mode = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    dominantColors: topColors.length > 0 ? topColors : ['#FFFFFF', '#000000'],
    colorScheme: (mode(counts.colorScheme) || 'neutral') as ColorPattern['colorScheme'],
    backgroundStyle: (mode(counts.backgroundStyle) || 'solid') as ColorPattern['backgroundStyle'],
    contrastLevel: (mode(counts.contrastLevel) || 'medium') as ColorPattern['contrastLevel'],
    mood: (mode(counts.mood) || 'neutral') as ColorPattern['mood'],
  };
}

function aggregateVisualStyle(analyses: AdImageAnalysis[]): VisualStylePattern {
  const counts = {
    overallStyle: {} as Record<string, number>,
  };
  let totalSophistication = 0;
  let totalFeedNative = 0;

  for (const a of analyses) {
    counts.overallStyle[a.visualStyle.overallStyle] = (counts.overallStyle[a.visualStyle.overallStyle] || 0) + 1;
    totalSophistication += a.visualStyle.sophisticationLevel;
    totalFeedNative += a.visualStyle.feedNativeScore;
  }

  const mode = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];
  const avgSophistication = Math.round(totalSophistication / analyses.length) as 1 | 2 | 3 | 4 | 5;
  const avgFeedNative = Math.round(totalFeedNative / analyses.length);

  return {
    overallStyle: (mode(counts.overallStyle) || 'casual') as VisualStylePattern['overallStyle'],
    sophisticationLevel: avgSophistication || 3,
    feedNativeScore: avgFeedNative || 60,
    brandConsistency: 'moderate', // Calculated separately
    uniqueElements: [], // Filled by Gemini summary
  };
}

// ============ HOOK PATTERN EXTRACTION (from competitor-creative-intel) ============

function extractHookPatterns(ads: CreativeAnalysis[]): HookPattern {
  const hookCounts: Record<string, { count: number; examples: string[] }> = {};
  const ctaCounts: Record<string, { count: number; examples: string[] }> = {};
  const offerCounts: Record<string, number> = {};
  const emotionalTriggers = new Set<string>();

  for (const ad of ads) {
    // Hooks
    if (ad.hookType) {
      if (!hookCounts[ad.hookType]) hookCounts[ad.hookType] = { count: 0, examples: [] };
      hookCounts[ad.hookType].count++;
      if (ad.hookText && hookCounts[ad.hookType].examples.length < 3) {
        hookCounts[ad.hookType].examples.push(ad.hookText);
      }
    }

    // CTAs
    if (ad.ctaType) {
      if (!ctaCounts[ad.ctaType]) ctaCounts[ad.ctaType] = { count: 0, examples: [] };
      ctaCounts[ad.ctaType].count++;
      if (ad.ctaText && ctaCounts[ad.ctaType].examples.length < 3) {
        ctaCounts[ad.ctaType].examples.push(ad.ctaText);
      }
    }

    // Offers
    if (ad.offerType) {
      offerCounts[ad.offerType] = (offerCounts[ad.offerType] || 0) + 1;
    }

    // Emotional triggers
    for (const trigger of ad.emotionalTriggers || []) {
      emotionalTriggers.add(trigger);
    }
  }

  const total = ads.length || 1;

  const hookTypes = Object.entries(hookCounts)
    .map(([type, data]) => ({ type, frequency: data.count / total, examples: data.examples }))
    .sort((a, b) => b.frequency - a.frequency);

  const ctaTypes = Object.entries(ctaCounts)
    .map(([type, data]) => ({ type, frequency: data.count / total, examples: data.examples }))
    .sort((a, b) => b.frequency - a.frequency);

  const offerTypes = Object.entries(offerCounts)
    .map(([type, count]) => ({ type, frequency: count / total }))
    .sort((a, b) => b.frequency - a.frequency);

  return {
    hookTypes,
    dominantHook: hookTypes[0]?.type || 'benefit',
    ctaTypes,
    dominantCta: ctaTypes[0]?.type || 'shop-now',
    offerTypes,
    emotionalTriggers: Array.from(emotionalTriggers),
  };
}

// ============ MAIN EXTRACTION FUNCTION ============

/**
 * Extract patterns from a competitor intel report
 *
 * @param report - CreativeIntelReport from competitor-creative-intel
 * @param clientId - Client ID to store patterns for
 * @param options - Extraction options
 */
export async function extractPatterns(
  report: CreativeIntelReport,
  clientId: string,
  options: {
    category?: string;
    analyzeImages?: boolean;
    maxAdsToAnalyze?: number;
  } = {}
): Promise<ExtractedPatterns> {
  const {
    category = 'general',
    analyzeImages = true,
    maxAdsToAnalyze = 15,
  } = options;

  logger.info(`[PatternExtractor] Extracting patterns for client ${clientId} from ${report.totalAdsAnalyzed} ads`);

  // Collect all ads from all competitors
  const allAds: CreativeAnalysis[] = [];
  for (const competitor of report.competitors) {
    allAds.push(...competitor.topCreatives);
  }

  // Sort by longevity (longer running = more successful)
  const sortedAds = allAds
    .filter(ad => ad.daysRunning > 7) // Only ads that survived at least a week
    .sort((a, b) => b.daysRunning - a.daysRunning)
    .slice(0, maxAdsToAnalyze);

  logger.info(`[PatternExtractor] Analyzing top ${sortedAds.length} long-running ads`);

  // Extract hook patterns from text analysis
  const hooks = extractHookPatterns(sortedAds);

  // Visual analysis with Gemini (if enabled and we have image URLs)
  let typography: TypographyPattern;
  let layout: LayoutPattern;
  let colors: ColorPattern;
  let visualStyle: VisualStylePattern;

  if (analyzeImages && sortedAds.length > 0) {
    // Meta Ad Library snapshot URLs need to be processed
    // For now, we'll use the snapshot URLs directly (Gemini can handle some of them)
    const imageUrls = sortedAds
      .map(ad => ad.snapshotUrl)
      .filter(url => url && !url.includes('facebook.com/ads/archive')); // Skip archive links

    if (imageUrls.length > 0) {
      logger.info(`[PatternExtractor] Analyzing ${imageUrls.length} ad images with Gemini`);
      const visualAnalyses = await analyzeMultipleAds(imageUrls.slice(0, 10));

      if (visualAnalyses.length > 0) {
        typography = aggregateTypography(visualAnalyses);
        layout = aggregateLayout(visualAnalyses);
        colors = aggregateColors(visualAnalyses);
        visualStyle = aggregateVisualStyle(visualAnalyses);
      } else {
        // Fallback to defaults
        logger.warn('[PatternExtractor] No visual analyses completed, using defaults');
        typography = getDefaultTypography();
        layout = getDefaultLayout();
        colors = getDefaultColors();
        visualStyle = getDefaultVisualStyle();
      }
    } else {
      typography = getDefaultTypography();
      layout = getDefaultLayout();
      colors = getDefaultColors();
      visualStyle = getDefaultVisualStyle();
    }
  } else {
    typography = getDefaultTypography();
    layout = getDefaultLayout();
    colors = getDefaultColors();
    visualStyle = getDefaultVisualStyle();
  }

  // Select reference ads for comparison
  const referenceAds = sortedAds.slice(0, 5).map(ad => ({
    snapshotUrl: ad.snapshotUrl,
    pageName: ad.pageName,
    daysRunning: ad.daysRunning,
    hookType: ad.hookType,
    whySelected: `Running for ${ad.daysRunning} days with ${ad.hookType} hook`,
  }));

  // Calculate quality benchmark
  const qualityBenchmark = {
    minSophisticationScore: Math.max(visualStyle.sophisticationLevel - 1, 2),
    minFeedNativeScore: Math.max(visualStyle.feedNativeScore - 15, 50),
    mustHaveElements: [
      hooks.dominantCta !== 'none' ? 'clear-cta' : '',
      visualStyle.overallStyle === 'premium' ? 'premium-typography' : '',
      layout.whitespaceUsage === 'generous' ? 'adequate-whitespace' : '',
    ].filter(Boolean),
    mustAvoidElements: [
      'cluttered-layout',
      'poor-contrast',
      'generic-stock-photo',
      'multiple-competing-ctas',
    ],
  };

  const extracted: ExtractedPatterns = {
    clientId,
    category,
    extractedAt: new Date().toISOString(),
    competitorsAnalyzed: report.competitors.length,
    adsAnalyzed: sortedAds.length,
    topCompetitors: report.competitors.slice(0, 5).map(c => c.pageName),
    typography,
    layout,
    colors,
    hooks,
    visualStyle,
    qualityBenchmark,
    referenceAds,
  };

  logger.info({
    clientId,
    dominantHook: hooks.dominantHook,
    dominantStyle: visualStyle.overallStyle,
    sophistication: visualStyle.sophisticationLevel,
  }, '[PatternExtractor] Extraction complete');

  return extracted;
}

// ============ DEFAULTS ============

function getDefaultTypography(): TypographyPattern {
  return {
    primaryFont: 'sans-serif',
    headlineWeight: 'bold',
    textHierarchy: 'clear',
    textDensity: 'moderate',
    textPlacement: 'bottom',
  };
}

function getDefaultLayout(): LayoutPattern {
  return {
    productPlacement: 'center',
    layoutType: 'single-focus',
    ctaPosition: 'bottom',
    whitespaceUsage: 'balanced',
    visualBalance: 'symmetric',
  };
}

function getDefaultColors(): ColorPattern {
  return {
    dominantColors: ['#FFFFFF', '#000000', '#F5F5F5'],
    colorScheme: 'neutral',
    backgroundStyle: 'solid',
    contrastLevel: 'medium',
    mood: 'neutral',
  };
}

function getDefaultVisualStyle(): VisualStylePattern {
  return {
    overallStyle: 'casual',
    sophisticationLevel: 3,
    feedNativeScore: 60,
    brandConsistency: 'moderate',
    uniqueElements: [],
  };
}

// ============ QUICK EXTRACTION (without images) ============

/**
 * Quick pattern extraction using only text analysis
 * Useful when you don't have time/tokens for Gemini Vision
 */
export function extractPatternsQuick(
  report: CreativeIntelReport,
  clientId: string,
  category: string = 'general'
): ExtractedPatterns {
  const allAds: CreativeAnalysis[] = [];
  for (const competitor of report.competitors) {
    allAds.push(...competitor.topCreatives);
  }

  const sortedAds = allAds
    .filter(ad => ad.daysRunning > 7)
    .sort((a, b) => b.daysRunning - a.daysRunning)
    .slice(0, 15);

  const hooks = extractHookPatterns(sortedAds);

  return {
    clientId,
    category,
    extractedAt: new Date().toISOString(),
    competitorsAnalyzed: report.competitors.length,
    adsAnalyzed: sortedAds.length,
    topCompetitors: report.competitors.slice(0, 5).map(c => c.pageName),
    typography: getDefaultTypography(),
    layout: getDefaultLayout(),
    colors: getDefaultColors(),
    hooks,
    visualStyle: getDefaultVisualStyle(),
    qualityBenchmark: {
      minSophisticationScore: 3,
      minFeedNativeScore: 60,
      mustHaveElements: ['clear-cta'],
      mustAvoidElements: ['cluttered-layout', 'poor-contrast'],
    },
    referenceAds: sortedAds.slice(0, 5).map(ad => ({
      snapshotUrl: ad.snapshotUrl,
      pageName: ad.pageName,
      daysRunning: ad.daysRunning,
      hookType: ad.hookType,
      whySelected: `Running for ${ad.daysRunning} days`,
    })),
  };
}
