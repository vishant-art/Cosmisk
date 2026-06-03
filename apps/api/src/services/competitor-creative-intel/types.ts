/**
 * Competitor Creative Intelligence — Shared Types
 *
 * Leaf module: public + internal interfaces shared across modules.
 */

// ============ TYPES ============

export interface CreativeAnalysis {
  // Basic info
  adId: string;
  pageId: string;
  pageName: string;
  snapshotUrl: string;

  // Timing
  startDate: string;
  endDate: string | null;
  daysRunning: number;
  isActive: boolean;

  // Spend/Reach estimates
  spendLower: number | null;
  spendUpper: number | null;
  impressionsLower: number | null;
  impressionsUpper: number | null;

  // Creative content
  primaryText: string | null;
  headline: string | null;
  caption: string | null;
  platforms: string[];

  // AI-extracted patterns
  hookType: string;
  hookText: string;
  ctaType: string;
  ctaText: string;
  offerType: string;
  offerDetails: string;
  creativeFormat: string;
  creativeFormatDetailed: CreativeFormatDetailed; // Enhanced format classification
  emotionalTriggers: string[];
  targetAudience: string;

  // Scoring
  longevityScore: number; // 0-100 based on days running
  estimatedPerformance: 'high' | 'medium' | 'low' | 'unknown';

  // Campaign type - CRITICAL: filters boost posts from real conversion ads
  campaignType: 'conversion' | 'engagement' | 'awareness' | 'unknown';

  // Relevance scoring - filters out unrelated competitors
  relevanceScore: number; // 0-100, how relevant is this to the client's products
  competitorType: 'direct' | 'indirect' | 'irrelevant';
  // direct = same product category (copy messaging, hooks, offers)
  // indirect = different product but great creative execution (copy format, transitions, editing)
  relevanceReason: string; // Why this score was assigned

  // For indirect competitors: what creative technique to learn
  creativeInsight?: string; // e.g., "Smooth product reveal transition", "Split-screen before/after"
}

export interface CompetitorProfile {
  pageName: string;
  pageId: string;
  totalAdsFound: number;
  activeAds: number;
  avgAdAge: number;
  longestRunningAd: CreativeAnalysis | null;

  // Pattern summary
  topHookTypes: Array<{ type: string; count: number; percentage: number }>;
  topCtaTypes: Array<{ type: string; count: number; percentage: number }>;
  topOfferTypes: Array<{ type: string; count: number; percentage: number }>;
  topFormats: Array<{ type: string; count: number; percentage: number }>;

  // Platforms
  platformBreakdown: Record<string, number>;

  // Sample creatives (top performing)
  topCreatives: CreativeAnalysis[];
}

export interface CreativeIntelReport {
  // Query info
  searchQuery: string;
  analyzedAt: string;
  totalAdsAnalyzed: number;

  // Competitors
  competitors: CompetitorProfile[];

  // Cross-competitor patterns
  industryPatterns: {
    dominantHooks: Array<{ type: string; count: number; percentage: number }>;
    dominantCtas: Array<{ type: string; count: number; percentage: number }>;
    dominantOffers: Array<{ type: string; count: number; percentage: number }>;
    avgAdAge: number;
    longestRunningAds: CreativeAnalysis[];
  };

  // Recommendations
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    insight: string;
    action: string;
    basedOn: string;
  }>;

  // Swipe file - organized by hook type with visual links
  swipeFile: Array<{
    category: string;
    count: number;
    description: string;
    ads: CreativeAnalysis[];
  }>;
}

// ============ BRAND CONTEXT & COMPETITOR DISCOVERY ============

export interface BrandContext {
  url: string;
  title: string;
  description: string;
  keywords: string[];
  industry: string;
  suggestedSearchTerms: string[];
}

export interface DiscoveredCompetitor {
  pageId: string;
  pageName: string;
  keywordHits: number;
  matchedKeywords: string[];
}

export interface DiscoveryResult {
  brand: BrandContext;
  competitors: DiscoveredCompetitor[];
  searchTermsUsed: string[];
  totalAdsScanned: number;
}

// ============ ENHANCED CREATIVE FORMATS ============

// More specific creative format types for better analysis
export type CreativeFormatDetailed =
  | 'ugc_talking_head'      // Person talking to camera
  | 'ugc_testimonial'       // Customer review/testimonial
  | 'before_after'          // Before/after transformation
  | 'founder_story'         // Founder talking about brand
  | 'podcast_interview'     // Podcast/interview style
  | 'product_demo'          // Product demonstration
  | 'unboxing'              // Unboxing experience
  | 'comparison'            // Us vs them comparison
  | 'tutorial_howto'        // How-to/tutorial
  | 'lifestyle'             // Lifestyle/aspirational
  | 'static_product'        // Static product image
  | 'carousel'              // Multiple images
  | 'catalog_dpa'           // Dynamic product ad
  | 'meme_relatable'        // Meme/relatable content
  | 'influencer'            // Influencer endorsement
  | 'unknown';

// ============ META AD LIBRARY ============

export interface AdLibraryAd {
  id: string;
  ad_creation_time: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url: string;
  byline?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  page_id: string;
  page_name: string;
  publisher_platforms?: string[];
}

// ============ RELEVANCE SCORING ============

export interface RelevanceResult {
  score: number; // 0-100
  type: 'direct' | 'indirect' | 'irrelevant';
  reason: string;
  creativeInsight?: string; // For indirect: what technique to learn
}

// Campaign type classification - CRITICAL for filtering boost posts from real ads
export type CampaignType = 'conversion' | 'engagement' | 'awareness' | 'unknown';

// ============ BULK SCRAPER (MetaAdsCollector) ============

export interface ScrapedAd {
  id: string;
  page: { id: string; name: string; likes?: number };
  is_active: boolean;
  delivery_start_time: string;
  delivery_stop_time?: string | null;
  creatives?: Array<{
    body?: string;
    title?: string;
    link_url?: string;
    link_caption?: string;
    call_to_action?: string;
    image_url?: string;
    video_url?: string;
  }>;
  impressions?: { lower: number; upper: number };
  spend?: { lower: number; upper: number; currency: string };
  platforms?: string[];
  days_running?: number;
}

export interface BulkScrapeResult {
  success: boolean;
  query: string | null;
  country: string;
  total_ads: number;
  scraped_at: string;
  ads: ScrapedAd[];
  error?: string;
}

// ============ CLIENT-AWARE COMPETITOR INTEL ============

export interface ClientIntelReport extends CreativeIntelReport {
  clientId: string;
  clientName: string;
  revenueLevel: string | null;
  newReferencesCount: number;
  filteredOutCount: number;
  searchQueriesUsed: string[];
}
