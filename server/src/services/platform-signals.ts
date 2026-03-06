/* ------------------------------------------------------------------ */
/*  Platform Signal Config                                             */
/*  Encodes what each ad platform's algorithm currently rewards.        */
/*  Update this config when algorithms change — no code changes needed */
/* ------------------------------------------------------------------ */

export interface PlatformSignalConfig {
  name: string;
  version: string;               // e.g. "andromeda-2026-q1"
  lastUpdated: string;

  // Creative diversity rules
  diversity: {
    maxSimilarityPct: number;     // Ads >this% similar get suppressed (Meta: 60)
    minUniqueHookTypes: number;   // Min distinct hook types per sprint
    minUniqueVisualStyles: number;
    minUniqueFormats: number;     // Min distinct formats per sprint
    penaltyForSameHook: number;   // Score penalty (0-1) for reusing same hook as active ad
  };

  // Hook mechanics
  hook: {
    maxSecondsToHook: number;     // Must hook within N seconds (Meta: 1.5, TikTok: 1)
    rewardedHookTypes: string[];  // Hook types the algorithm currently rewards
    penalizedHookTypes: string[]; // Hook types that underperform
  };

  // Format preferences (multipliers, 1.0 = neutral)
  formatMultipliers: Record<string, number>;

  // Narrative structure
  narrative: {
    rewardedStructures: string[];  // e.g. "problem-solution", "social-proof"
    requiredElements: string[];    // Must-haves for quality ranking
  };

  // Audio/visual signals
  audioVisual: {
    ugcStyleBonus: number;         // Score bonus for UGC-style (0-1)
    textOverlayPenalty: number;    // Score penalty for heavy text overlays
    nativeStyleBonus: number;      // Score bonus for platform-native look
    musicEnergyMatch: boolean;     // Whether music energy should match ad energy
  };

  // Quality ranking thresholds
  quality: {
    minEngagementRateForBoost: number;  // Predicted engagement rate threshold
    minCtrForQualityRanking: number;    // Below this = "Below Average"
    fatigueWindowDays: number;          // How fast ads fatigue (Meta: 14-28)
  };

  // Recommended creative volume
  volume: {
    minPerCampaign: number;        // Min distinct creatives per campaign
    maxPerCampaign: number;        // Diminishing returns above this
    idealRefreshCycleDays: number; // How often to introduce new creatives
  };
}

/* ------------------------------------------------------------------ */
/*  Meta (Andromeda) — Updated Q1 2026                                 */
/* ------------------------------------------------------------------ */
export const META_SIGNALS: PlatformSignalConfig = {
  name: 'Meta (Facebook/Instagram)',
  version: 'andromeda-2026-q1',
  lastUpdated: '2026-03-01',

  diversity: {
    maxSimilarityPct: 60,
    minUniqueHookTypes: 3,
    minUniqueVisualStyles: 3,
    minUniqueFormats: 2,
    penaltyForSameHook: 0.25,
  },

  hook: {
    maxSecondsToHook: 1.5,
    rewardedHookTypes: [
      'shock-statement', 'curiosity-gap', 'pattern-interrupt',
      'social-proof', 'price-anchor', 'personal-story',
      'before-after-tease', 'question-hook',
    ],
    penalizedHookTypes: [
      'generic-intro', 'logo-first', 'slow-build',
    ],
  },

  formatMultipliers: {
    ugc_talking_head: 1.3,
    video: 1.2,
    carousel: 1.15,
    static_ad: 1.0,
    story: 1.1,
    skit: 1.2,
    podcast_clip: 1.05,
    testimonial_mashup: 1.25,
    before_after: 1.15,
    product_demo: 1.1,
    remake_winner: 1.1,
    localization: 1.0,
  },

  narrative: {
    rewardedStructures: [
      'problem-solution',
      'social-proof-stack',
      'aspiration-gap',
      'education-value',
      'transformation-story',
      'us-vs-them',
    ],
    requiredElements: [
      'clear-hook',           // Must have identifiable hook
      'value-proposition',    // Must communicate value
      'call-to-action',       // Must have CTA
    ],
  },

  audioVisual: {
    ugcStyleBonus: 0.15,
    textOverlayPenalty: 0.10,
    nativeStyleBonus: 0.10,
    musicEnergyMatch: true,
  },

  quality: {
    minEngagementRateForBoost: 0.03,
    minCtrForQualityRanking: 1.0,
    fatigueWindowDays: 21,
  },

  volume: {
    minPerCampaign: 10,
    maxPerCampaign: 50,
    idealRefreshCycleDays: 14,
  },
};

/* ------------------------------------------------------------------ */
/*  Google Ads (Performance Max) — Updated Q1 2026                     */
/* ------------------------------------------------------------------ */
export const GOOGLE_PMAX_SIGNALS: PlatformSignalConfig = {
  name: 'Google Ads (Performance Max)',
  version: 'pmax-2026-q1',
  lastUpdated: '2026-03-01',

  diversity: {
    maxSimilarityPct: 50,
    minUniqueHookTypes: 2,
    minUniqueVisualStyles: 3,
    minUniqueFormats: 3,        // PMax needs images + video + text
    penaltyForSameHook: 0.15,
  },

  hook: {
    maxSecondsToHook: 2.0,
    rewardedHookTypes: [
      'benefit-first', 'price-anchor', 'social-proof',
      'urgency', 'question-hook', 'how-to',
    ],
    penalizedHookTypes: [
      'brand-first', 'generic-intro',
    ],
  },

  formatMultipliers: {
    static_ad: 1.2,             // PMax heavily uses display
    carousel: 1.0,
    video: 1.15,
    ugc_talking_head: 1.0,
    product_demo: 1.3,          // Shopping context loves product demos
    before_after: 1.1,
    skit: 0.9,                  // Less relevant for search intent
    podcast_clip: 0.7,
    testimonial_mashup: 1.1,
    remake_winner: 1.0,
    localization: 1.0,
    story: 0.8,
  },

  narrative: {
    rewardedStructures: [
      'benefit-feature-proof',
      'problem-solution',
      'social-proof-stack',
      'comparison',
      'how-to-guide',
    ],
    requiredElements: [
      'headline-variation',
      'value-proposition',
      'call-to-action',
    ],
  },

  audioVisual: {
    ugcStyleBonus: 0.05,
    textOverlayPenalty: 0.05,    // Less penalty on Google
    nativeStyleBonus: 0.05,
    musicEnergyMatch: false,
  },

  quality: {
    minEngagementRateForBoost: 0.02,
    minCtrForQualityRanking: 0.8,
    fatigueWindowDays: 30,
  },

  volume: {
    minPerCampaign: 15,          // 3-5 asset groups x 3+ assets each
    maxPerCampaign: 40,
    idealRefreshCycleDays: 21,
  },
};

/* ------------------------------------------------------------------ */
/*  TikTok Ads — Updated Q1 2026                                       */
/* ------------------------------------------------------------------ */
export const TIKTOK_SIGNALS: PlatformSignalConfig = {
  name: 'TikTok Ads',
  version: 'tiktok-2026-q1',
  lastUpdated: '2026-03-01',

  diversity: {
    maxSimilarityPct: 50,
    minUniqueHookTypes: 3,
    minUniqueVisualStyles: 2,
    minUniqueFormats: 1,          // TikTok is video-only
    penaltyForSameHook: 0.30,     // TikTok punishes repetition harder
  },

  hook: {
    maxSecondsToHook: 1.0,        // TikTok = fastest hook requirement
    rewardedHookTypes: [
      'pattern-interrupt', 'curiosity-gap', 'controversy',
      'trend-hijack', 'pov-hook', 'text-on-screen',
      'unboxing-reveal', 'before-after-tease',
    ],
    penalizedHookTypes: [
      'slow-build', 'logo-first', 'generic-intro', 'polished-commercial',
    ],
  },

  formatMultipliers: {
    ugc_talking_head: 1.4,       // TikTok is UGC-native
    skit: 1.3,
    before_after: 1.2,
    testimonial_mashup: 1.2,
    video: 1.1,
    product_demo: 1.0,
    podcast_clip: 0.8,
    static_ad: 0.5,             // Static barely works on TikTok
    carousel: 0.6,
    remake_winner: 1.0,
    localization: 1.0,
    story: 1.2,
  },

  narrative: {
    rewardedStructures: [
      'problem-solution',
      'transformation-story',
      'day-in-life',
      'trend-format',
      'storytelling',
      'raw-authentic',
    ],
    requiredElements: [
      'instant-hook',             // Must grab in <1s
      'native-feel',              // Must not look like an ad
      'call-to-action',
    ],
  },

  audioVisual: {
    ugcStyleBonus: 0.25,          // Biggest UGC bonus
    textOverlayPenalty: 0.0,      // Text overlays are native on TikTok
    nativeStyleBonus: 0.20,       // Looking "native" is critical
    musicEnergyMatch: true,
  },

  quality: {
    minEngagementRateForBoost: 0.05,
    minCtrForQualityRanking: 0.8,
    fatigueWindowDays: 10,         // TikTok fatigues fastest
  },

  volume: {
    minPerCampaign: 5,
    maxPerCampaign: 30,
    idealRefreshCycleDays: 7,      // Weekly refresh ideal
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PLATFORM_MAP: Record<string, PlatformSignalConfig> = {
  meta: META_SIGNALS,
  facebook: META_SIGNALS,
  instagram: META_SIGNALS,
  google: GOOGLE_PMAX_SIGNALS,
  google_pmax: GOOGLE_PMAX_SIGNALS,
  tiktok: TIKTOK_SIGNALS,
};

export function getPlatformSignals(platform: string): PlatformSignalConfig {
  return PLATFORM_MAP[platform.toLowerCase()] || META_SIGNALS;
}

export function getAllPlatformSignals(): PlatformSignalConfig[] {
  return [META_SIGNALS, GOOGLE_PMAX_SIGNALS, TIKTOK_SIGNALS];
}
