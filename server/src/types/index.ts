export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  plan: string;
  onboarding_complete: number;
  created_at: string;
  brand_name: string | null;
  website_url: string | null;
  goals: string | null;          // JSON array
  competitors: string | null;    // JSON array
  active_brand: string | null;
  phone: string | null;
  timezone: string | null;
  language: string | null;
  currency: string | null;
  date_format: string | null;
  notification_preferences: string | null;
}

export interface MetaTokenRow {
  user_id: string;
  encrypted_access_token: string;
  meta_user_id: string | null;
  meta_user_name: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface GoogleTokenRow {
  user_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  customer_ids: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ReportRow {
  id: string;
  user_id: string;
  title: string;
  type: string;
  account_id: string | null;
  date_preset: string | null;
  status: string;
  data: string | null;
  generated_at: string;
}

export interface UgcProjectRow {
  id: string;
  user_id: string;
  name: string;
  brand_name: string | null;
  status: string;
  brief: string | null;
  created_at: string;
  updated_at: string;
}

export interface UgcConceptRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  feedback: string | null;
  created_at: string;
}

export interface UgcScriptRow {
  id: string;
  concept_id: string;
  project_id: string;
  title: string;
  content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
}

export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  business_name: string;
  status: 'active' | 'inactive';
  currency: string;
  credential_group: string;
}

export interface KpiMetric {
  value: number;
  change: number;
  sparkline?: number[];
}

export interface KpisResponse {
  success: boolean;
  kpis: {
    spend: KpiMetric;
    revenue: KpiMetric;
    roas: KpiMetric;
    cpa: KpiMetric;
    ctr: KpiMetric;
    impressions: KpiMetric;
    clicks: KpiMetric;
    conversions: KpiMetric;
    cpc: KpiMetric;
    aov: KpiMetric;
  };
}

export interface TopAd {
  id: string;
  name: string;
  object_type: string;
  metrics: {
    roas: number;
    cpa: number;
    ctr: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
  };
  thumbnail_url: string;
  video_id: string | null;
  campaign_name: string;
  adset_name: string;
  days_active: number;
  created_time: string;
}

export interface ChartDataPoint {
  date: string;
  roas: number;
  spend: number;
  revenue: number;
  ctr: number;
  cpa: number;
}

export interface InsightItem {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
  actionType?: 'navigate' | 'scale' | 'pause' | 'reduce';
  actionPayload?: Record<string, any>;
  createdAt: string;
}

export interface CampaignBreakdownItem {
  label: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  conversions: number;
  trend: number;
}

export interface AudienceBreakdownItem {
  label: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  conversions: number;
  trend: number;
}

export interface PatternItem {
  id: string;
  name: string;
  description: string;
  brands: string[];
  confidence: number;
  sampleSize: number;
  avgRoas: number;
  type: string;
  insights?: string[];
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  gateway: string;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  trial_ends_at: string | null;
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

export interface UserUsageRow {
  id: number;
  user_id: string;
  period: string;
  chat_count: number;
  image_count: number;
  video_count: number;
  creative_count: number;
}

export interface AutopilotAlertRow {
  id: string;
  user_id: string;
  account_id: string | null;
  type: string;
  title: string;
  content: string;
  severity: string;
  read: number;
  created_at: string;
}

export interface AutomationRow {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  action_type: string;
  action_value: string | null;
  is_active: number;
  last_triggered: string | null;
  created_at: string;
}

export type SprintStatus = 'analyzing' | 'planning' | 'approved' | 'generating' | 'reviewing' | 'published' | 'archived';
export type JobStatus = 'pending' | 'script_ready' | 'generating' | 'polling' | 'completed' | 'failed' | 'cancelled';
// Common presets, but format is a free-form string so Claude can recommend any format
export type JobFormat = string;
export type AssetStatus = 'draft' | 'approved' | 'rejected' | 'published' | 'tracking' | 'analyzed';
export type ApiProvider = 'heygen' | 'flux' | 'kling' | 'creatify' | 'elevenlabs' | 'nanobanana' | 'veo3';

export interface SprintRow {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  status: SprintStatus;
  plan: string | null;
  learn_snapshot: string | null;
  total_creatives: number;
  completed_creatives: number;
  failed_creatives: number;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  sprint_id: string;
  user_id: string;
  format: string;
  status: JobStatus;
  priority: number;
  script: string | null;
  api_provider: string | null;
  api_job_id: string | null;
  output_url: string | null;
  output_thumbnail: string | null;
  predicted_score: number | null;
  dna_tags: string | null;
  cost_cents: number;
  error_message: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AssetRow {
  id: string;
  job_id: string | null;
  sprint_id: string | null;
  user_id: string;
  account_id: string | null;
  format: string;
  name: string;
  asset_url: string;
  thumbnail_url: string | null;
  meta_ad_id: string | null;
  meta_campaign_id: string | null;
  dna_tags: string | null;
  predicted_score: number | null;
  actual_metrics: string | null;
  metrics_fetched_at: string | null;
  status: AssetStatus;
  published_at: string | null;
  created_at: string;
}

export interface CostLedgerRow {
  id: number;
  user_id: string;
  sprint_id: string | null;
  job_id: string | null;
  api_provider: string;
  operation: string;
  cost_cents: number;
  metadata: string | null;
  created_at: string;
}

export type AgentType = 'watchdog' | 'briefing' | 'report' | 'content' | 'sales';
export type AgentRunStatus = 'running' | 'completed' | 'failed';
export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
export type DecisionUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface AgentRunRow {
  id: string;
  agent_type: AgentType;
  user_id: string;
  status: AgentRunStatus;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
  raw_context: string | null;
}

export interface AgentDecisionRow {
  id: string;
  run_id: string;
  user_id: string;
  account_id: string | null;
  type: string;
  target_id: string | null;
  target_name: string | null;
  reasoning: string;
  confidence: string;
  urgency: DecisionUrgency;
  suggested_action: string;
  estimated_impact: string | null;
  status: DecisionStatus;
  approved_at: string | null;
  executed_at: string | null;
  outcome_checked_at: string | null;
  outcome: string | null;
  created_at: string;
}

export interface AgentCoreMemoryRow {
  id: string;
  user_id: string;
  agent_type: AgentType;
  key: string;
  value: string;
  updated_at: string;
}

export interface AgentEpisodeRow {
  id: string;
  user_id: string;
  agent_type: AgentType;
  event: string;
  context: string | null;
  outcome: string | null;
  entities: string | null;
  relevance_score: number;
  reinforcement_count: number;
  created_at: string;
}

export interface SwipeFileRow {
  id: string;
  user_id: string;
  brand: string;
  thumbnail: string | null;
  hook_dna: string;
  visual_dna: string;
  audio_dna: string;
  notes: string | null;
  source_url: string | null;
  source_ad_id: string | null;
  created_at: string;
}

export interface TeamMemberRow {
  id: string;
  owner_user_id: string;
  member_user_id: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface ContentBankRow {
  id: string;
  user_id: string;
  platform: string;
  content_type: string;
  title: string | null;
  body: string;
  hashtags: string | null;
  media_notes: string | null;
  status: string;
  scheduled_for: string | null;
  posted_at: string | null;
  source: string | null;
  generation_context: string | null;
  created_at: string;
  updated_at: string;
}

/** Reusable row shape for COUNT(*) as c queries */
export interface CountRow {
  c: number;
}

/** Row shape for format + count aggregation queries */
export interface FormatCountRow {
  format: string;
  count: number;
}

export interface AgentEntityRow {
  id: string;
  user_id: string;
  entity_type: string;
  entity_name: string;
  attributes: string | null;
  mention_count: number;
  first_seen: string;
  last_seen: string;
}

/* ------------------------------------------------------------------ */
/*  Billing / webhook helper types                                     */
/* ------------------------------------------------------------------ */

/** Stripe subscription with period fields (current_period_* removed from top-level type in newer Stripe SDK versions) */
export interface StripeSubscriptionWithPeriod {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: number;
  current_period_end: number;
}

/** Shape of a Razorpay webhook event body */
export interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    subscription?: {
      entity?: {
        id: string;
        plan_id?: string;
        status?: string;
        [key: string]: unknown;
      };
    };
    payment?: {
      entity?: {
        id: string;
        [key: string]: unknown;
      };
    };
  };
}

/** Fastify request with rawBody (enabled via config: { rawBody: true }) */
export interface FastifyRawBodyRequest {
  rawBody?: string;
}
