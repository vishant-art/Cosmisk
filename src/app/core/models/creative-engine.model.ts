export type SprintStatus = 'analyzing' | 'planning' | 'approved' | 'generating' | 'reviewing' | 'published' | 'archived';
export type JobStatus = 'pending' | 'script_ready' | 'generating' | 'polling' | 'completed' | 'failed' | 'cancelled';

export interface ScoreBreakdown {
  formatSignal: number;
  dataBackingSignal: number;
  diversitySignal: number;
  complianceSignal: number;
}

export interface SprintPlanItem {
  format: string;
  count: number;
  rationale: string;
  estimated_cost_cents: number;
  source_ads: { name: string; roas: number }[];
  winProbability?: number;
  scoreBreakdown?: ScoreBreakdown;
  warnings?: string[];
}

export interface ScoringResult {
  removed: {
    format: string;
    count: number;
    winProbability: number;
    warnings: string[];
  }[];
  summary: {
    totalBefore: number;
    totalAfter: number;
    removedCount: number;
    avgWinProbability: number;
    savedTokenEstimate: number;
  };
}

export interface SprintPlan {
  items: SprintPlanItem[];
  totalCreatives: number;
  totalEstimatedCents: number;
  scoring?: ScoringResult;
}

export interface Sprint {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  status: SprintStatus;
  plan: SprintPlan | null;
  learn_snapshot: AccountSnapshot | null;
  total_creatives: number;
  completed_creatives: number;
  failed_creatives: number;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyzedAd {
  id: string;
  name: string;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  impressions: number;
  conversions: number;
  format: string;
  thumbnail_url: string;
  days_active: number;
}

export interface AccountSnapshot {
  topAds: AnalyzedAd[];
  benchmarks: {
    avgRoas: number;
    avgCtr: number;
    avgCpa: number;
    avgSpend: number;
    totalSpend: number;
  };
  formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }>;
  fatigueSignals: string[];
}

export interface SprintProgress {
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  pending: number;
  pct: number;
}

export interface CreativeJob {
  id: string;
  format: string;
  status: JobStatus;
  output_url: string | null;
  output_thumbnail: string | null;
  predicted_score: number | null;
  dna_tags: { hook: string[]; visual: string[]; audio: string[] } | null;
  script: any;
  cost_cents: number;
  error_message: string | null;
}

export interface CostSummary {
  total_cents: number;
  by_provider: { api_provider: string; total_cents: number; operations: number }[];
  by_sprint: { sprint_id: string; total_cents: number; operations: number }[];
}

export interface SprintTemplate {
  id: string;
  name: string;
  description: string;
  suggested_creatives: number;
  suggested_budget_cents: number;
  focus_formats: string[];
  strategy: string;
}

export interface FormatWinRate {
  format: string;
  total_assets: number;
  tracked_assets: number;
  avg_predicted_score: number;
  avg_actual_roas: number;
  avg_actual_ctr: number;
  total_spend: number;
}

export interface CostTrend {
  sprint_id: string;
  name: string;
  status: string;
  total_creatives: number;
  completed_creatives: number;
  estimated_cents: number;
  actual_cents: number;
  cost_per_creative_cents: number;
  efficiency_pct: number;
  created_at: string;
}

export interface EngineAnalytics {
  format_win_rates: FormatWinRate[];
  cost_trends: CostTrend[];
  prediction_accuracy: {
    total_compared: number;
    top_predicted_avg_roas: number;
    bottom_predicted_avg_roas: number;
    prediction_useful: boolean;
    lift_pct: number;
  } | null;
  winning_dna: { hook_combo: string; count: number; avg_roas: number }[];
  total_sprints: number;
  total_assets: number;
}

// Known format presets with icons — Claude can suggest ANY format string beyond these
export const FORMAT_PRESETS: Record<string, { label: string; icon: string; description: string }> = {
  ugc_talking_head: { label: 'UGC Talking Head', icon: 'user', description: 'AI avatar delivers hook + pitch' },
  podcast_clip: { label: 'Podcast Clip', icon: 'mic', description: 'Two avatars discussing product' },
  skit: { label: 'Skit / Story', icon: 'film', description: 'Mini-narrative: problem to solution' },
  product_demo: { label: 'Product Demo', icon: 'shopping-bag', description: 'Product URL to demo video' },
  testimonial_mashup: { label: 'Testimonial Mashup', icon: 'users', description: 'Multiple avatars giving reviews' },
  before_after: { label: 'Before / After', icon: 'columns', description: 'Split-screen transformation' },
  static_ad: { label: 'Static Ad', icon: 'image', description: 'AI-generated image with copy' },
  carousel: { label: 'Carousel', icon: 'layers', description: 'Multi-image sequence' },
  remake_winner: { label: 'Remake Winner', icon: 'refresh-cw', description: 'Variations of your top ad' },
  localization: { label: 'Localization', icon: 'globe', description: 'Translate winning creative' },
  green_screen_reaction: { label: 'Green Screen Reaction', icon: 'monitor-play', description: 'Creator reacts to product/content' },
  interview: { label: 'Interview', icon: 'mic', description: 'Q&A with founder/expert' },
  unboxing: { label: 'Unboxing', icon: 'package', description: 'First impressions unboxing reveal' },
  listicle: { label: 'Listicle', icon: 'list', description: 'Top N reasons / benefits list' },
  meme_ad: { label: 'Meme Ad', icon: 'sparkles', description: 'Trending meme format adapted for brand' },
};

export function getFormatMeta(format: string): { label: string; icon: string; description: string } {
  if (FORMAT_PRESETS[format]) return FORMAT_PRESETS[format];
  // For unknown formats (Claude-generated), create a readable label
  const label = format.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { label, icon: 'box', description: format };
}
