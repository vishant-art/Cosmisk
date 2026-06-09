export interface Brand {
  id: string;
  name: string;
  category: string;
  logoUrl?: string;
  monthlySpend?: number;
  roas?: number;
  alertCount?: number;
  status: 'active' | 'warning' | 'paused';
  activeCampaigns?: number;
  activeCreatives?: number;
  patternCount?: number;
}
