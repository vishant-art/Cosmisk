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
}

export interface MetaTokenRow {
  user_id: string;
  encrypted_access_token: string;
  meta_user_id: string | null;
  meta_user_name: string | null;
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
